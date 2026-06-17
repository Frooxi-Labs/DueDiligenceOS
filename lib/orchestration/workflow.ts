import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, bandRooms, agentEvaluations, mentions as mentionsTable, workflowEvents } from '@/lib/db/schema';
import { BandClient, getAgentConfigs } from '@/lib/band';
import { runAgent, assessSpecialist, type PropertyFact, type ComplianceReport, type LegalRisk, type FinancialModel, type DealMemo } from '@/lib/agents';
import { broadcast } from '@/lib/realtime';
import { computeUnderwriting } from '@/lib/finance/underwrite';
import { detectContradictions, discoverContradictions, cascadeFromCompliance, compositeRiskScore } from './contradiction';
import { negotiateContradiction } from './negotiation';
import type { AgentType, CoreAgentType, SpecialistType, DealRecord, DealEvent, WorkflowStatus } from '@/types';

function emit(dealId: string, event: DealEvent) {
  broadcast(dealId, event);
}

/** Read the live Band room as THIS agent sees it (its mention-routed slice) — the
 *  shared context the agent reasons over. Surfaces the read as Band tool events. */
async function readRoom(dealId: string, roomId: string, agent: AgentType): Promise<string> {
  emit(dealId, { type: 'band.event', agent, kind: 'tool_call', content: 'get_room_context()' });
  try {
    const band = new BandClient(agent);
    await band.postEvent(roomId, 'Reading the room for shared context', 'tool_call', { tool: 'get_room_context' });
    const msgs = await band.getContext(roomId);
    const text = msgs.map((m) => `${m.sender_name ?? m.sender_id}: ${m.content}`).join('\n').slice(0, 4000);
    emit(dealId, { type: 'band.event', agent, kind: 'tool_result', content: `read ${msgs.length} message(s) from the room` });
    try { await band.postEvent(roomId, `Read ${msgs.length} message(s) of shared context`, 'tool_result', { count: msgs.length }); } catch { /* best-effort */ }
    return text;
  } catch {
    emit(dealId, { type: 'band.event', agent, kind: 'tool_result', content: 'room context unavailable — using handoff payload' });
    return '';
  }
}

/** Post an agent's reasoning as a Band `thought` event (visible in the room). */
async function think(dealId: string, roomId: string, agent: AgentType, content: string) {
  emit(dealId, { type: 'band.event', agent, kind: 'thought', content });
  try { await new BandClient(agent).postEvent(roomId, content, 'thought'); } catch { /* best-effort */ }
}

/** Post an agent error as a Band `error` event. */
async function reportError(dealId: string, roomId: string, agent: AgentType, content: string) {
  emit(dealId, { type: 'band.event', agent, kind: 'error', content });
  try { await new BandClient(agent).postEvent(roomId, content, 'error'); } catch { /* best-effort */ }
}

/** The pre-reasoning "thought" each agent posts — derived from THIS deal's terms,
 *  not a fixed template, so it reflects what the agent is actually about to do. */
function thinkingLine(agent: CoreAgentType, deal: DealRecord): string {
  const use = deal.intended_use;
  switch (agent) {
    case 'archivist':
      return `Extracting facts and encumbrances from the ${deal.acquisition_type} package for "${use}".`;
    case 'regulatory':
      return `Checking zoning for "${use}", plus permits and flood, against the Archivist's facts in the room.`;
    case 'legal':
      return "Reviewing title and the contract's easement and lien terms against the recorded facts in the room.";
    case 'financial':
      return `Underwriting NOI, DSCR and IRR at ${deal.financing_ltv}% LTV / ${deal.financing_rate}% over ${deal.hold_period_years}y.`;
    case 'synthesis':
      return `Weighing every agent's findings in the room into the deal memo for "${use}".`;
  }
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

    const run = async (agent: CoreAgentType, ctx: Parameters<typeof runAgent>[1], mentionTargets: AgentType[]) => {
      emit(dealId, { type: 'agent.processing', agent });
      // 1) Think out loud, then 2) READ the shared Band room, then 3) reason over it.
      await think(dealId, roomId, agent, thinkingLine(agent, deal));
      const roomContext = await readRoom(dealId, roomId, agent);
      let result;
      try {
        result = await runAgent(agent, { ...ctx, roomContext });
      } catch (err) {
        await reportError(dealId, roomId, agent, `I couldn't complete my analysis: ${(err as Error).message}`);
        throw err;
      }
      // The Financial agent ESTIMATES the income; we compute DSCR + IRR
      // deterministically from it, so the headline return number is auditable —
      // not an LLM guess. (Tool-call surfaced in the room.)
      if (agent === 'financial') {
        const fm = result.raw as FinancialModel;
        const noi = fm.noi && fm.noi > 0 ? fm.noi : Number(deal.purchase_price) * 0.06;
        const u = computeUnderwriting({
          purchasePrice: Number(deal.purchase_price),
          ltvPct: Number(deal.financing_ltv),
          ratePct: Number(deal.financing_rate),
          holdYears: deal.hold_period_years,
          noi,
          exitCapPct: fm.cap_rate_pct ?? undefined,
        });
        await think(dealId, roomId, 'financial', `compute_underwriting() — NOI $${Math.round(noi).toLocaleString()} → DSCR ${u.dscr.toFixed(2)}, levered IRR ${u.irrPct.toFixed(1)}% (deterministic).`);
        fm.irr_pct = u.irrPct;
        fm.dcr = u.dscr;
        result.headline = `IRR ${u.irrPct.toFixed(1)}% · DSCR ${u.dscr.toFixed(2)} (computed)`;
        result.bandMessage = `${fm.summary}\n\n[Auditable underwrite — NOI $${Math.round(noi).toLocaleString()} → DSCR ${u.dscr.toFixed(2)}, levered IRR ${u.irrPct.toFixed(1)}% at ${deal.financing_ltv}% LTV / ${deal.financing_rate}% over ${deal.hold_period_years}y, exit cap ${u.exitCapPct.toFixed(1)}%.]`;
      }
      await post(roomId, agent, result.bandMessage, mentionTargets);
      await persistEval(dealId, agent, result);
      emit(dealId, { type: 'band.message', agent, content: result.bandMessage });
      emit(dealId, { type: 'agent.completed', agent, headline: result.headline, model: result.model });
      await logEvent(dealId, 'agent.completed', { headline: result.headline }, agent);
      return result;
    };

    // Recruit a cross-framework specialist into the room and fold its assessment
    // back in. Best-effort: a specialist that fails never aborts the committee
    // (Environmental additionally has an in-process TS fallback).
    const recruitSpecialist = async (
      id: AgentType,
      displayName: string,
      reason: string,
      recruiter: CoreAgentType,
      ask: string
    ): Promise<{ label: string; summary: string } | null> => {
      const configs = getAgentConfigs();
      // Add the specialist FIRST so we can @mention it without a 422, then a
      // single, specialist-specific line (not a generic before/after pair).
      try {
        await new BandClient(recruiter).addParticipant(roomId, configs[id].agentId);
      } catch {
        /* best-effort */
      }
      await systemSay(dealId, `${displayName} joined the room — LangGraph specialist (Python)`);
      emit(dealId, { type: 'agent.recruited', by: recruiter, agent: id, reason });
      await logEvent(dealId, 'agent.recruited', { by: recruiter, agent: id, reason }, recruiter);
      await recordMention(dealId, recruiter, id, reason);
      const opener =
        id === 'environmental' ? `This one needs an environmental read — ${reason}.`
        : id === 'capex' ? `I need real construction numbers here — ${reason}.`
        : id === 'insurance' ? `There's catastrophe exposure to price — ${reason}.`
        : `This is outside my lane — ${reason}.`;
      await say(dealId, roomId, recruiter, `${opener} ${ask}`, [id]);
      emit(dealId, { type: 'agent.processing', agent: id });
      try {
        const a = await assessSpecialist(id, { deal, propertyFact, compliance }, roomId, [configs[recruiter].agentId, configs.synthesis.agentId]);
        await persistEval(dealId, id, { headline: a.headline, bandMessage: a.bandMessage, raw: (a.report as Record<string, unknown>) ?? {}, model: a.model });
        emit(dealId, { type: 'band.message', agent: id, content: a.bandMessage });
        emit(dealId, { type: 'agent.completed', agent: id, headline: a.headline, model: a.model });
        await logEvent(dealId, 'agent.completed', { headline: a.headline, framework: 'langgraph' }, id);
        return { label: displayName, summary: a.summary };
      } catch (err) {
        // No in-process fallback — specialists live in the Python service. If it's
        // down the committee proceeds without that specialist (best-effort).
        await logEvent(dealId, 'specialist.unavailable', { id, reason: (err as Error).message }, id);
        emit(dealId, { type: 'agent.completed', agent: id, headline: 'unavailable' });
        return null;
      }
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

    // ── CONTRADICTION DETECTION — deterministic baseline + dynamic discovery ──
    // The baseline guarantees the signature easement case fires; the dynamic scan
    // reads what the agents actually said and surfaces ANY real conflict, between
    // whichever agents, on whatever topic (not hardcoded to one pair/subject).
    const deterministic = detectContradictions(propertyFact, legalRisk);
    await think(dealId, roomId, 'synthesis', "Scanning the room for contradictions across every agent's findings.");
    const dynamic = await discoverContradictions(
      [
        { agent: 'archivist', summary: archivist.bandMessage, findings: [] },
        { agent: 'regulatory', summary: regulatory.bandMessage, findings: compliance.findings },
        { agent: 'legal', summary: legal.bandMessage, findings: legalRisk.findings },
      ],
      deterministic
    );
    const contradictions = [...deterministic, ...dynamic].slice(0, 3);
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

    // ── EMERGENT DISPATCH — recruit only the specialists the AGENTS asked for ──
    // Regulatory and Legal decide, from the deal context, which quantitative
    // specialists the room needs (requested_specialists). No heuristic fallback:
    // if no agent asks, none is recruited. Deduped; bounded; best-effort.
    const specialistSummaries: { label: string; summary: string }[] = [];
    const SPEC_META: Record<SpecialistType, { display: string; ask: string }> = {
      environmental: { display: 'Environmental', ask: 'Could you assess contamination risk and whether a Phase I is warranted?' },
      capex: { display: 'CapEx / Construction', ask: 'Could you model the renovation/conversion cost and schedule risk?' },
      insurance: { display: 'Insurance / Catastrophe', ask: 'Could you estimate the catastrophe exposure and the insurance cost?' },
    };
    const requested = new Map<SpecialistType, { reason: string; by: CoreAgentType }>();
    for (const r of compliance.requested_specialists) if (!requested.has(r.specialist)) requested.set(r.specialist, { reason: r.reason, by: 'regulatory' });
    for (const r of legalRisk.requested_specialists) if (!requested.has(r.specialist)) requested.set(r.specialist, { reason: r.reason, by: 'legal' });

    for (const [spec, { reason, by }] of requested) {
      if (!getAgentConfigs()[spec].agentId) { await logEvent(dealId, 'recruitment.skipped', { id: spec }); continue; }
      const out = await recruitSpecialist(spec, SPEC_META[spec].display, reason, by, SPEC_META[spec].ask);
      if (out) specialistSummaries.push(out);
    }

    // ── FINANCIAL — baseline, then execute the agents' delegated tasks ────
    await setStatus(dealId, 'financial');
    const baselineRes = await run('financial', { deal, propertyFact, compliance }, ['synthesis']);
    let financial = baselineRes.raw as FinancialModel;

    // Tasks the agents themselves decided to hand off — any agent → any agent, any
    // topic — each executed as a real Band task (intent + authority + processing
    // state). The deterministic cascade is only a safety net for the re-underwrite.
    const delegations: { from: CoreAgentType; to: AgentType; intent: string; authority: string }[] = [
      ...compliance.delegations.map((d) => ({ from: 'regulatory' as CoreAgentType, to: d.to, intent: d.intent, authority: d.authority })),
      ...legalRisk.delegations.map((d) => ({ from: 'legal' as CoreAgentType, to: d.to, intent: d.intent, authority: d.authority })),
    ];
    const cascade = cascadeFromCompliance(compliance);
    if (cascade && !delegations.some((d) => d.to === 'financial')) {
      delegations.push({ from: cascade.from as CoreAgentType, to: 'financial', intent: `Re-underwrite the deal — ${cascade.trigger}.`, authority: `remove the affected assumption (${cascade.delta})` });
    }

    for (const d of delegations.slice(0, 4)) {
      const result = await delegate(dealId, roomId, d.from, d.to, d.intent, d.authority, async () =>
        run(d.to as CoreAgentType, { deal, propertyFact, compliance, legal: legalRisk, financialBaseline: financial, delegation: { from: d.from, intent: d.intent, authority: d.authority } }, ['synthesis'])
      );
      if (d.to === 'financial') {
        const revised = result.raw as FinancialModel;
        emit(dealId, { type: 'financial.recalculated', irr_before: financial.irr_pct, irr_after: revised.irr_pct, trigger: d.intent });
        await logEvent(dealId, 'financial.recalculated', { before: financial.irr_pct, after: revised.irr_pct, trigger: d.intent });
        financial = revised;
      }
    }

    // ── SYNTHESIS + human gate ──────────────────────────────────────────
    await setStatus(dealId, 'synthesis');
    const synth = await run('synthesis', { deal, propertyFact, compliance, legal: legalRisk, specialists: specialistSummaries, financialBaseline: financial }, []);
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
    await logEvent(dealId, 'approval.required', { composite, signal: memo.signal, conditions: allConditions });
  } catch (err) {
    const reason = (err as Error).message;
    console.error('[workflow] failed for deal', dealId, '-', reason);
    await setStatus(dealId, 'failed');
    emit(dealId, { type: 'workflow.failed', reason });
    await logEvent(dealId, 'workflow.failed', { reason });
  }
}
