import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, bandRooms, agentEvaluations, mentions as mentionsTable, workflowEvents } from '@/lib/db/schema';
import { BandClient, getAgentConfigs } from '@/lib/band';
import { runAgent, assessEnvironmentalViaLangGraph, type PropertyFact, type ComplianceReport, type LegalRisk, type FinancialModel, type EnvironmentalReport, type DealMemo } from '@/lib/agents';
import { broadcast } from '@/lib/realtime';
import { detectContradictions, cascadeFromCompliance, compositeRiskScore } from './contradiction';
import { negotiateContradiction } from './negotiation';
import type { AgentType, DealRecord, DealEvent, WorkflowStatus } from '@/types';

function emit(dealId: string, event: DealEvent) {
  broadcast(dealId, event);
}

async function logEvent(dealId: string, eventType: string, payload: Record<string, unknown> = {}, agent?: AgentType) {
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: eventType, agent_type: agent, triggered_by: 'orchestrator', payload });
}

async function setStatus(dealId: string, status: WorkflowStatus) {
  await db.update(dealBriefs).set({ status, updated_at: new Date() }).where(eq(dealBriefs.id, dealId));
  emit(dealId, { type: 'workflow.status', status });
}

async function persistEval(dealId: string, agent: AgentType, result: { headline: string; bandMessage: string; raw: unknown; model: string }) {
  await db.insert(agentEvaluations).values({
    deal_id: dealId,
    agent_type: agent,
    execution_phase: 'evaluation',
    status: result.headline,
    summary: result.bandMessage,
    raw_output: result.raw as Record<string, unknown>,
    model_used: result.model,
    provider_used: 'aiml',
    attempt_count: 1,
  }).onConflictDoNothing();
}

async function recordMention(dealId: string, from: AgentType, to: AgentType, reason: string) {
  await db.insert(mentionsTable).values({ deal_id: dealId, from_agent: from, to_agent: to, reason });
  emit(dealId, { type: 'agent.mentioned', from, to, reason });
}

async function initBandRoom(deal: DealRecord): Promise<string> {
  const configs = getAgentConfigs();
  const lead = new BandClient('archivist');
  const roomId = await lead.createRoom();
  for (const a of ['regulatory', 'legal', 'financial', 'synthesis'] as AgentType[]) {
    await lead.addParticipant(roomId, configs[a].agentId);
  }
  await db.insert(bandRooms).values({
    deal_id: deal.id,
    band_room_id: roomId,
    participant_map: Object.fromEntries((Object.keys(configs) as AgentType[]).map((a) => [a, configs[a].agentId])),
  });
  emit(deal.id, { type: 'room.initialized', band_room_id: roomId });
  return roomId;
}

/** Post an agent's message into the Band room, @mentioning specific recipients. */
async function post(roomId: string, agent: AgentType, content: string, mentionTargets: AgentType[]) {
  const band = new BandClient(agent);
  return band.postMessage(roomId, content, mentionTargets);
}

/** Post an agent message to the room, stream it live, and persist it for reload. */
async function say(dealId: string, roomId: string, agent: AgentType, content: string, mentions: AgentType[]) {
  await post(roomId, agent, content, mentions);
  emit(dealId, { type: 'band.message', agent, content });
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'room.agent', agent_type: agent, triggered_by: agent, payload: { agent, content } });
}

/** A system line in the room ("X joined the room"). */
async function systemSay(dealId: string, content: string) {
  emit(dealId, { type: 'room.system', content });
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'room.system', triggered_by: 'orchestrator', payload: { content } });
}

/**
 * Structured, accountable delegation — not a chat message. The delegator posts a
 * Band `task` event encoding intent + authority, the assignee marks the request
 * `processing` then `processed`, and the lifecycle (open → processing → done) is
 * streamed and persisted. Turns a handoff into a tracked obligation.
 */
async function delegate<T>(
  dealId: string,
  roomId: string,
  from: AgentType,
  to: AgentType,
  intent: string,
  authority: string,
  work: () => Promise<T>,
): Promise<T> {
  const id = randomUUID();
  const content = `${intent} You're authorized to ${authority}.`;
  const fromBand = new BandClient(from);
  let msgId = '';
  try {
    // Visible, mention-routed handoff message…
    msgId = await fromBand.postMessage(roomId, content, [to]);
    // …plus a structured task event encoding intent + authority (governance layer).
    await fromBand.postEvent(roomId, intent, 'task', { intent, authority, to });
  } catch {
    /* best-effort: a transport hiccup must not abort the underwrite */
  }
  emit(dealId, { type: 'band.message', agent: from, content });
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'room.agent', agent_type: from, triggered_by: from, payload: { agent: from, content } });
  emit(dealId, { type: 'delegation', id, from, to, intent, authority, status: 'open' });
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'delegation.opened', agent_type: to, triggered_by: from, payload: { id, from, to, intent, authority } });

  // The assignee accepts the task (Band processing state).
  const toBand = new BandClient(to);
  if (msgId) { try { await toBand.markProcessing(roomId, msgId); } catch { /* best-effort */ } }
  emit(dealId, { type: 'delegation', id, from, to, intent, authority, status: 'processing' });

  const result = await work();

  // …and marks it done (Band processed state).
  if (msgId) { try { await toBand.markProcessed(roomId, msgId); } catch { /* best-effort */ } }
  emit(dealId, { type: 'delegation', id, from, to, intent, authority, status: 'done' });
  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'delegation.done', agent_type: to, triggered_by: to, payload: { id, from, to, intent } });
  return result;
}

/** Decide whether an Environmental specialist should be recruited, and why. */
function needsEnvironmental(pf: PropertyFact, compliance: ComplianceReport, legal: LegalRisk): string | null {
  // Genuine environmental signals only — concrete hazards, not the word "environment".
  const env = /contaminat|phase\s*i\b|wetland|\bflood\b|\bfema\b|\bepa\b|superfund|asbestos|underground storage|\bust\b|petroleum|fuel dispens|service station|soil|groundwater|remediat|hazardous/i;
  // Findings that belong to Legal/Regulatory, not Environmental — never recruit on these.
  const notEnv = /easement|\btitle\b|zoning|\blien\b|estoppel|reps?\b|contingency/i;
  if (pf.missing_documents.some((d) => /phase\s*i|environmental/i.test(d))) return 'Missing Phase I environmental assessment';
  const flagged = [...compliance.findings, ...legal.findings].find(
    (f) => env.test(`${f.title} ${f.detail}`) && !notEnv.test(f.title)
  );
  return flagged ? `Environmental concern flagged: ${flagged.title}` : null;
}

/**
 * Drive a deal through the committee. Agents post to the Band room and hand off
 * via targeted @mentions; this orchestrator owns ordering, contradiction
 * detection, the cascade, and the human gate.
 */
export async function runWorkflow(dealId: string): Promise<void> {
  const claimed = await db
    .update(dealBriefs)
    .set({ status: 'intake', updated_at: new Date() })
    .where(and(eq(dealBriefs.id, dealId), eq(dealBriefs.status, 'pending')))
    .returning({ id: dealBriefs.id });
  if (claimed.length === 0) return;

  const [row] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, dealId)).limit(1);
  if (!row) return;
  const deal = row as unknown as DealRecord;

  try {
    const roomId = await initBandRoom(deal);

    const run = async (agent: AgentType, ctx: Parameters<typeof runAgent>[1], mentionTargets: AgentType[]) => {
      emit(dealId, { type: 'agent.processing', agent });
      const result = await runAgent(agent, ctx);
      await post(roomId, agent, result.bandMessage, mentionTargets);
      await persistEval(dealId, agent, result);
      emit(dealId, { type: 'band.message', agent, content: result.bandMessage });
      emit(dealId, { type: 'agent.completed', agent, headline: result.headline, model: result.model });
      await logEvent(dealId, 'agent.completed', { headline: result.headline }, agent);
      return result;
    };

    // ── INTAKE — Archivist ──────────────────────────────────────────────
    const archivist = await run('archivist', { deal }, ['regulatory', 'legal']);
    const propertyFact = archivist.raw as PropertyFact;
    await recordMention(dealId, 'archivist', 'regulatory', 'PropertyFact ready for compliance review');
    if (propertyFact.missing_documents.length > 0) {
      emit(dealId, { type: 'escalation.needed', missing: propertyFact.missing_documents });
      await logEvent(dealId, 'escalation.needed', { missing: propertyFact.missing_documents }, 'archivist');
      // Surfaced to the reviewer; the committee proceeds on available facts.
    }

    // ── ANALYSIS — Regulatory, then Legal ───────────────────────────────
    await setStatus(dealId, 'analysis');
    const regulatory = await run('regulatory', { deal, propertyFact }, ['financial', 'synthesis']);
    const compliance = regulatory.raw as ComplianceReport;

    const legal = await run('legal', { deal, propertyFact, compliance }, ['synthesis']);
    const legalRisk = legal.raw as LegalRisk;

    // ── CONTRADICTION DETECTION (code-level, deterministic) ─────────────
    const contradictions = detectContradictions(propertyFact, legalRisk);
    const negotiatedConditions: string[] = [];
    for (const c of contradictions) {
      emit(dealId, { type: 'contradiction.detected', title: c.title, detail: c.detail, agents: c.agents });
      await logEvent(dealId, 'contradiction.detected', { title: c.title, detail: c.detail, agents: c.agents });

      // Band-mediated negotiation: the two agents debate the conflict in the
      // room. `onThinking` keeps the live "is composing" state on whoever is
      // about to speak (incl. while the resolution is distilled), and `onTurn`
      // streams each reply the instant it lands — so the room never looks frozen.
      try {
        const neg = await negotiateContradiction(c, {
          onThinking: (agent) => {
            // Only the current speaker should show "analysing" — clear the others.
            for (const other of c.agents) if (other !== agent) emit(dealId, { type: 'agent.completed', agent: other, headline: 'reconciling contradiction' });
            emit(dealId, { type: 'agent.processing', agent });
          },
          onTurn: async (t) => {
            await post(roomId, t.agent, t.content, [t.to]);
            emit(dealId, { type: 'band.message', agent: t.agent, content: t.content });
            emit(dealId, { type: 'agent.completed', agent: t.agent, headline: 'reconciling contradiction' });
            await logEvent(dealId, 'negotiation.turn', { agent: t.agent, content: t.content }, t.agent);
          },
        });
        // Clear the lingering "thinking" state on the debaters now the debate is done.
        for (const agent of c.agents) emit(dealId, { type: 'agent.completed', agent, headline: 'reconciled contradiction' });
        negotiatedConditions.push(neg.resolution);
      } catch (err) {
        await logEvent(dealId, 'negotiation.failed', { reason: (err as Error).message });
      }
    }

    // ── EMERGENT DISPATCH — an agent decides it needs a specialist ──────────
    // Prefer the agents' own requests; fall back to a deterministic heuristic.
    let environmental: EnvironmentalReport | undefined;
    const recruiter: AgentType =
      compliance.requested_specialist === 'environmental' ? 'regulatory'
      : legalRisk.requested_specialist === 'environmental' ? 'legal'
      : 'regulatory';
    const envReason =
      (compliance.requested_specialist === 'environmental' && compliance.specialist_reason) ||
      (legalRisk.requested_specialist === 'environmental' && legalRisk.specialist_reason) ||
      needsEnvironmental(propertyFact, compliance, legalRisk);
    const envConfigured = !!getAgentConfigs().environmental.agentId;
    if (envReason && envConfigured) {
      // 1) The requesting agent tells the room it's bringing in outside help.
      await say(dealId, roomId, recruiter, `I've hit something outside my lane — ${envReason.toLowerCase()}. I'm pulling in an Environmental specialist to take a look.`, ['synthesis']);
      try {
        // 2) The requesting agent recruits the specialist via Band's peer API.
        await new BandClient(recruiter).addParticipant(roomId, getAgentConfigs().environmental.agentId);
      } catch {
        /* best-effort */
      }
      // 3) Group-chat join notice, like a teammate entering the room.
      await systemSay(dealId, 'Environmental specialist joined the room — running on LangGraph (Python)');
      emit(dealId, { type: 'agent.recruited', by: recruiter, agent: 'environmental', reason: envReason });
      await logEvent(dealId, 'agent.recruited', { by: recruiter, agent: 'environmental', reason: envReason }, recruiter);
      await recordMention(dealId, recruiter, 'environmental', envReason);
      // 4) The requesting agent asks the specialist directly — it's our ask, so we ask.
      await say(dealId, roomId, recruiter, `Thanks for joining. Could you assess the contamination risk on this property and tell us whether a Phase I is warranted? We'd value your read before Financial underwrites.`, ['environmental']);

      // 5) The specialist is a cross-framework agent: a LangGraph (Python) service
      //    that posts into this same Band room. Fall back in-process if it's down.
      emit(dealId, { type: 'agent.processing', agent: 'environmental' });
      try {
        const configs = getAgentConfigs();
        const lg = await assessEnvironmentalViaLangGraph(
          { deal, propertyFact, compliance },
          roomId,
          [configs[recruiter].agentId, configs.synthesis.agentId]
        );
        environmental = lg.report;
        await persistEval(dealId, 'environmental', { headline: lg.headline, bandMessage: lg.bandMessage, raw: lg.report, model: lg.model });
        emit(dealId, { type: 'band.message', agent: 'environmental', content: lg.bandMessage });
        emit(dealId, { type: 'agent.completed', agent: 'environmental', headline: lg.headline, model: lg.model });
        await logEvent(dealId, 'agent.completed', { headline: lg.headline, framework: 'langgraph' }, 'environmental');
      } catch (err) {
        await logEvent(dealId, 'langgraph.fallback', { reason: (err as Error).message }, 'environmental');
        try {
          const envRes = await run('environmental', { deal, propertyFact, compliance }, ['regulatory', 'synthesis']);
          environmental = envRes.raw as EnvironmentalReport;
        } catch {
          /* a failed specialist must not abort the committee */
        }
      }
    } else if (envReason && !envConfigured) {
      await logEvent(dealId, 'recruitment.skipped', { reason: 'environmental agent not configured' });
    }

    // ── FINANCIAL — baseline, then cascade re-underwrite if Critical ────
    await setStatus(dealId, 'financial');
    const baselineRes = await run('financial', { deal, propertyFact, compliance }, ['synthesis']);
    let financial = baselineRes.raw as FinancialModel;

    const cascade = cascadeFromCompliance(compliance);
    if (cascade) {
      // Structured delegation: the upstream agent assigns Financial an accountable
      // re-underwrite task (intent + authority), tracked through Band's task states.
      const revised = await delegate(
        dealId,
        roomId,
        cascade.from,
        'financial',
        `Re-underwrite the deal — ${cascade.trigger}.`,
        `remove the affected assumption (${cascade.delta})`,
        async () => {
          const revisedRes = await run(
            'financial',
            { deal, propertyFact, compliance, financialBaseline: financial, cascade: { trigger: cascade.trigger, delta: cascade.delta } },
            ['synthesis']
          );
          return revisedRes.raw as FinancialModel;
        }
      );
      emit(dealId, { type: 'financial.recalculated', irr_before: financial.irr_pct, irr_after: revised.irr_pct, trigger: cascade.trigger });
      await logEvent(dealId, 'financial.recalculated', { before: financial.irr_pct, after: revised.irr_pct, trigger: cascade.trigger });
      financial = revised;
    }

    // ── SYNTHESIS + human gate ──────────────────────────────────────────
    await setStatus(dealId, 'synthesis');
    const synth = await run('synthesis', { deal, propertyFact, compliance, legal: legalRisk, environmental, financialBaseline: financial }, []);
    const memo = synth.raw as DealMemo;

    const composite = compositeRiskScore(propertyFact, compliance, legalRisk);
    const summary = `${memo.recommendation}\n\nComposite risk score: ${composite}/100 · Signal: ${memo.signal.toUpperCase()}${contradictions.length ? ` · ${contradictions.length} contradiction(s) flagged` : ''}`;

    // Fold any negotiation resolutions into the memo's conditions precedent.
    const allConditions = [...memo.conditions_precedent, ...negotiatedConditions];

    await setStatus(dealId, 'awaiting_human');
    emit(dealId, {
      type: 'approval.required',
      summary,
      composite_score: composite,
      signal: memo.signal,
      recommendation: memo.recommendation,
      top_findings: memo.top_findings,
      conditions: allConditions,
    });
    await logEvent(dealId, 'approval.required', { composite, signal: memo.signal });
  } catch (err) {
    const reason = (err as Error).message;
    console.error('[workflow] failed for deal', dealId, '-', reason);
    await setStatus(dealId, 'failed');
    emit(dealId, { type: 'workflow.failed', reason });
    await logEvent(dealId, 'workflow.failed', { reason });
  }
}
