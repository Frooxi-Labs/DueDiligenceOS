import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dealBriefs,
  bandRooms,
  agentEvaluations,
  mentions as mentionsTable,
  workflowEvents,
} from '@/lib/db/schema';
import { BandClient, getAgentConfigs, formatDealBriefMessage } from '@/lib/band';
import { runAgent, AGENT_SEQUENCE } from '@/lib/agents';
import { broadcast } from '@/lib/realtime';
import { detectConflict } from './conflict';
import type { AgentType, DealBrief, DealEvent, WorkflowStatus } from '@/types';

/** Status string for an agent's evaluation phase. */
const AGENT_PHASE_STATUS: Record<AgentType, WorkflowStatus> = {
  market_analysis: 'market_analysis',
  due_diligence: 'due_diligence',
  risk_assessment: 'risk_assessment',
  legal_review: 'legal_review',
  financial_underwriting: 'financial_underwriting',
};

async function logEvent(
  dealId: string,
  eventType: string,
  fields: { from?: WorkflowStatus; to?: WorkflowStatus; agent?: AgentType; payload?: Record<string, unknown> } = {}
) {
  await db.insert(workflowEvents).values({
    deal_id: dealId,
    event_type: eventType,
    from_status: fields.from,
    to_status: fields.to,
    agent_type: fields.agent,
    triggered_by: 'orchestrator',
    payload: fields.payload ?? {},
  });
}

async function setStatus(dealId: string, status: WorkflowStatus, from?: WorkflowStatus) {
  await db.update(dealBriefs).set({ status, updated_at: new Date() }).where(eq(dealBriefs.id, dealId));
  await logEvent(dealId, 'workflow.status', { from, to: status });
  emit(dealId, { type: 'workflow.status', status });
}

function emit(dealId: string, event: DealEvent) {
  broadcast(dealId, event);
}

/** Create the Band room, add all agents, post the deal brief. */
async function initBandRoom(deal: DealBrief): Promise<string> {
  const configs = getAgentConfigs();
  const lead = new BandClient('market_analysis');
  const roomId = await lead.createRoom();

  // Add the other four agents as participants.
  for (const agentType of AGENT_SEQUENCE) {
    if (agentType === 'market_analysis') continue;
    await lead.addParticipant(roomId, configs[agentType].agentId);
  }

  const participantMap = Object.fromEntries(
    (Object.keys(configs) as AgentType[]).map((a) => [a, configs[a].agentId])
  ) as Record<string, string>;

  await db.insert(bandRooms).values({
    deal_id: deal.id,
    band_room_id: roomId,
    participant_map: participantMap,
  });

  await lead.postMessage(roomId, formatDealBriefMessage(deal), []);
  emit(deal.id, { type: 'room.initialized', band_room_id: roomId });
  await logEvent(deal.id, 'room.initialized', { payload: { roomId } });
  return roomId;
}

/** Build a context block for an agent from the prior agents' room messages. */
function buildContext(transcript: { agent: AgentType; message: string }[]): string {
  if (transcript.length === 0) {
    return '[No prior agent evaluations yet. You are the first to evaluate this deal.]';
  }
  return (
    `PRIOR AGENT EVALUATIONS (${transcript.length}):\n\n` +
    transcript
      .map((t, i) => `[${i + 1}] ${t.agent.toUpperCase().replace(/_/g, ' ')}\n${t.message}\n`)
      .join('\n') +
    `\nEND OF PRIOR EVALUATIONS`
  );
}

/**
 * Drive a deal through the committee. Each agent posts to the Band room and
 * hands off to the next via a targeted @mention; collaboration flows through
 * Band, while this orchestrator owns ordering, persistence, and the gates.
 */
export async function runWorkflow(dealId: string): Promise<void> {
  // Single-trigger guard: only proceed if still pending (atomic).
  const claimed = await db
    .update(dealBriefs)
    .set({ status: 'room_initializing', updated_at: new Date() })
    .where(and(eq(dealBriefs.id, dealId), eq(dealBriefs.status, 'pending')))
    .returning({ id: dealBriefs.id });
  if (claimed.length === 0) return; // already running or gone

  const [deal] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, dealId)).limit(1);
  if (!deal) return;
  const dealBrief = deal as unknown as DealBrief;

  try {
    emit(dealId, { type: 'workflow.status', status: 'room_initializing' });
    const roomId = await initBandRoom(dealBrief);

    const transcript: { agent: AgentType; message: string }[] = [];
    const configs = getAgentConfigs();

    for (let i = 0; i < AGENT_SEQUENCE.length; i++) {
      const agentType = AGENT_SEQUENCE[i];
      const nextAgent = AGENT_SEQUENCE[i + 1];
      await setStatus(dealId, AGENT_PHASE_STATUS[agentType]);
      emit(dealId, { type: 'agent.processing', agent: agentType });

      const band = new BandClient(agentType);
      try {
        const result = await runAgent(agentType, { deal: dealBrief, contextText: buildContext(transcript) });

        // Post to the room; hand off to the next agent via a targeted @mention.
        const handoff = nextAgent
          ? `\n\n@${configs[nextAgent].handle} — over to you.`
          : '';
        const messageId = await band.postMessage(
          roomId,
          result.bandMessage + handoff,
          nextAgent ? [nextAgent] : []
        );

        await db.insert(agentEvaluations).values({
          deal_id: dealId,
          agent_type: agentType,
          execution_phase: 'evaluation',
          status: result.status,
          confidence: String(result.confidence),
          summary: result.summary,
          raw_output: result.raw as Record<string, unknown>,
          band_message_id: messageId,
          model_used: result.model,
          provider_used: 'aiml',
          attempt_count: 1,
        }).onConflictDoNothing();

        if (nextAgent) {
          const reason = `${agentType.replace(/_/g, ' ')} → ${nextAgent.replace(/_/g, ' ')} handoff`;
          await db.insert(mentionsTable).values({
            deal_id: dealId,
            from_agent: agentType,
            to_agent: nextAgent,
            reason,
            band_message_id: messageId,
          });
          emit(dealId, { type: 'agent.mentioned', from: agentType, to: nextAgent, reason });
        }

        transcript.push({ agent: agentType, message: result.bandMessage });
        emit(dealId, {
          type: 'agent.completed',
          agent: agentType,
          status: result.status,
          confidence: result.confidence,
          summary: result.summary,
        });
        emit(dealId, {
          type: 'band.message',
          agent: agentType,
          content: result.bandMessage,
          status: result.status,
        });
        await logEvent(dealId, 'agent.completed', { agent: agentType, payload: { status: result.status } });
      } catch (err) {
        const reason = (err as Error).message;
        await db.insert(agentEvaluations).values({
          deal_id: dealId,
          agent_type: agentType,
          execution_phase: 'evaluation',
          status: 'failed',
          confidence: '0',
          summary: `Agent failed: ${reason}`,
          raw_output: { error: reason },
          attempt_count: 3,
        }).onConflictDoNothing();
        emit(dealId, { type: 'agent.failed', agent: agentType, reason });
        await logEvent(dealId, 'agent.failed', { agent: agentType, payload: { reason } });
        // Continue — a failed agent must not abort the committee.
      }
    }

    // Conflict detection over the persisted evaluations.
    const evals = await db
      .select({ agent_type: agentEvaluations.agent_type, status: agentEvaluations.status })
      .from(agentEvaluations)
      .where(and(eq(agentEvaluations.deal_id, dealId), eq(agentEvaluations.execution_phase, 'evaluation')));

    const conflict = detectConflict(
      evals.map((e) => ({ agent_type: e.agent_type as AgentType, status: (e.status ?? 'failed') as never }))
    );
    if (conflict.hasConflict) {
      emit(dealId, { type: 'conflict.detected', rejecting_agents: conflict.rejectingAgents });
      await logEvent(dealId, 'conflict.detected', { payload: { rejecting: conflict.rejectingAgents } });
      // Negotiation is handled in a dedicated step; for now the conflict is
      // surfaced to the human reviewer.
    }

    const summary = composeExecutiveSummary(dealBrief, evals as { agent_type: string; status: string }[]);
    await setStatus(dealId, 'awaiting_human', AGENT_PHASE_STATUS.financial_underwriting);
    emit(dealId, { type: 'approval.required', summary });
    await logEvent(dealId, 'approval.required');
  } catch (err) {
    const reason = (err as Error).message;
    await setStatus(dealId, 'failed');
    emit(dealId, { type: 'workflow.failed', reason });
    await logEvent(dealId, 'workflow.failed', { payload: { reason } });
  }
}

/** Deterministic executive summary — reliable for a live demo (no extra LLM call). */
function composeExecutiveSummary(deal: DealBrief, evals: { agent_type: string; status: string }[]): string {
  const lines = evals.map((e) => `• ${e.agent_type.toUpperCase().replace(/_/g, ' ')}: ${String(e.status).toUpperCase()}`);
  const rejects = evals.filter((e) => e.status === 'reject').length;
  const verdict = rejects > 0 ? 'Committee is split — reviewer decision required.' : 'Committee aligned — pending reviewer sign-off.';
  return `Investment Committee Review — ${deal.title}\n\n${lines.join('\n')}\n\n${verdict}`;
}
