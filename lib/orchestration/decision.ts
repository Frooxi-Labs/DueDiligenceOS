import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, bandRooms, agentEvaluations, finalDecisions, workflowEvents } from '@/lib/db/schema';
import { broadcast } from '@/lib/realtime';
import { BandClient } from '@/lib/band';
import { callText } from '@/lib/providers';
import type { HumanDecision } from '@/types';

export interface HumanDecisionInput {
  decision: HumanDecision; // proceed | remediate | renegotiate
  /** True once the reviewer has acknowledged an agent's challenge and overrides it. */
  confirmed?: boolean;
  notes?: string;
}

export interface DecisionResult {
  challenged: boolean;
  message?: string;
}

interface Finding { title: string; detail: string; severity: string }

async function getSynthesis(dealId: string) {
  const [row] = await db
    .select({ raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, dealId), eq(agentEvaluations.agent_type, 'synthesis')))
    .limit(1);
  return (row?.raw ?? {}) as { signal?: string; top_findings?: Finding[]; conditions_precedent?: string[]; recommendation?: string };
}

async function roomId(dealId: string): Promise<string | null> {
  const [r] = await db.select({ id: bandRooms.band_room_id }).from(bandRooms).where(eq(bandRooms.deal_id, dealId)).limit(1);
  return r?.id ?? null;
}

/** The conditions the reviewer actually saw at the gate (memo + any negotiated). */
async function gateConditions(dealId: string, fallback: string[]): Promise<string[]> {
  const [ev] = await db
    .select({ payload: workflowEvents.payload })
    .from(workflowEvents)
    .where(and(eq(workflowEvents.deal_id, dealId), eq(workflowEvents.event_type, 'approval.required')))
    .orderBy(desc(workflowEvents.created_at))
    .limit(1);
  const conditions = (ev?.payload as { conditions?: string[] } | undefined)?.conditions;
  return Array.isArray(conditions) && conditions.length ? conditions : fallback;
}

/** Post a Synthesis message into the Band room (best-effort — never blocks the decision). */
async function postAsSynthesis(rid: string | null, content: string) {
  if (!rid) return;
  try {
    await new BandClient('synthesis').postMessage(rid, content);
  } catch {
    /* best-effort */
  }
}

function draftPrompt(decision: HumanDecision, s: Awaited<ReturnType<typeof getSynthesis>>): string {
  const findings = (s.top_findings ?? []).map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join('\n');
  const conditions = (s.conditions_precedent ?? []).join('; ');
  if (decision === 'remediate') {
    return `Draft a concise, professional SELLER REMEDIATION REQUEST (one short paragraph + a bulleted list) listing the items the seller must cure before the buyer proceeds. Base it on these findings:\n${findings}\nPlain text only.`;
  }
  if (decision === 'renegotiate') {
    return `Draft a concise, professional RENEGOTIATION BRIEF (one short paragraph + a bulleted list of asks: price reduction, holdbacks, indemnities) the buyer should take back to the seller, based on these findings:\n${findings}\nPlain text only.`;
  }
  if (decision === 'reject') {
    return `Draft a concise, professional DEAL DECLINE / PASS memo (one short paragraph + a bulleted list of the decisive reasons) explaining why the buyer is walking away from this deal, based on these findings:\n${findings}\nPlain text only.`;
  }
  return `Draft a concise, professional APPROVAL-TO-PROCEED memo (one short paragraph + the conditions precedent as a bulleted list) for an approved-with-conditions deal. Conditions: ${conditions}\nPlain text only.`;
}

/**
 * Apply the reviewer's decision. If the decision is risky (proceeding on a RED /
 * critical deal) and not yet confirmed, an agent challenges the reviewer ONCE
 * and we stop — no finalization, no loop. Otherwise we finalize: record it, post
 * it to Band, and have an agent draft the corresponding document in the room.
 */
export async function applyHumanDecision(dealId: string, input: HumanDecisionInput): Promise<DecisionResult> {
  // Idempotency / loop guard: never re-process an already-decided deal.
  const [existing] = await db.select({ id: finalDecisions.id }).from(finalDecisions).where(eq(finalDecisions.deal_id, dealId)).limit(1);
  if (existing) return { challenged: false };

  const s = await getSynthesis(dealId);
  const rid = await roomId(dealId);
  const criticals = (s.top_findings ?? []).filter((f) => f.severity === 'critical');
  const risky = input.decision === 'proceed' && (s.signal === 'red' || criticals.length > 0);

  // One-time agent challenge to the human on a risky decision.
  if (risky && !input.confirmed) {
    const list = criticals.slice(0, 3).map((f) => f.title).join('; ') || 'unresolved critical risk';
    const message = `You chose to proceed, but the committee rated this deal ${(s.signal ?? 'red').toUpperCase()} with ${criticals.length} critical finding(s): ${list}. Proceeding accepts that risk. Confirm to override, or reconsider.`;
    await postAsSynthesis(rid, `⚠ Reviewer chose to proceed despite critical findings. ${message}`);
    broadcast(dealId, { type: 'human.challenge', decision: input.decision, message });
    await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'human.challenge', triggered_by: 'synthesis', payload: { decision: input.decision, message } });
    return { challenged: true, message };
  }

  // Finalize. Persist the conditions the reviewer actually saw (memo + negotiated),
  // not just the synthesis memo's — keeps the audit trail faithful to the gate.
  const conditions = await gateConditions(dealId, s.conditions_precedent ?? []);
  await db.insert(finalDecisions).values({
    deal_id: dealId,
    final_status: input.decision,
    decided_by: 'human',
    human_conditions: conditions,
    all_conditions: conditions,
    notes: input.confirmed ? 'Reviewer overrode an agent challenge.' : input.notes,
  }).onConflictDoNothing();
  await db.update(dealBriefs).set({ status: 'decided', updated_at: new Date() }).where(eq(dealBriefs.id, dealId));

  await postAsSynthesis(rid, `Reviewer decision: ${input.decision.toUpperCase()}${input.confirmed ? ' (override)' : ''}. Preparing the ${input.decision} document.`);

  // An agent drafts the corresponding document, through Band.
  let document = '';
  try {
    document = (await callText('synthesis', draftPrompt(input.decision, s))).trim();
    await postAsSynthesis(rid, document);
  } catch {
    /* document drafting is best-effort */
  }

  await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'deal.decided', to_status: 'decided', triggered_by: 'human', payload: { decision: input.decision, conditions } });
  if (document) {
    await db.insert(workflowEvents).values({ deal_id: dealId, event_type: 'decision.document', triggered_by: 'synthesis', payload: { decision: input.decision, content: document } });
    broadcast(dealId, { type: 'decision.document', decision: input.decision, content: document });
  }
  broadcast(dealId, { type: 'deal.decided', decision: input.decision, conditions });
  broadcast(dealId, { type: 'workflow.status', status: 'decided' });
  return { challenged: false };
}
