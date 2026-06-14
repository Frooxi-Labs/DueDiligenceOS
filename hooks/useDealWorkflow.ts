'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentType, DealEvent, HumanDecision, Signal } from '@/types';

export interface AgentCardState {
  status: 'idle' | 'processing' | 'done' | 'failed';
  headline?: string;
  model?: string;
}
export interface RoomMessage { agent: AgentType; content: string }
export interface Contradiction { title: string; detail: string; agents: AgentType[] }
export interface CascadeInfo { irr_before: number; irr_after: number; trigger: string }

export interface WorkflowState {
  status: string;
  bandRoomId?: string;
  agents: Record<AgentType, AgentCardState>;
  messages: RoomMessage[];
  handoffs: { from: AgentType; to: AgentType; reason: string }[];
  contradictions: Contradiction[];
  cascade?: CascadeInfo;
  missingDocs: string[];
  approvalSummary?: string;
  compositeScore?: number;
  signal?: Signal;
  recommendation?: string;
  topFindings?: { title: string; detail: string; severity: string }[];
  conditions?: string[];
  decision?: HumanDecision;
  challenge?: { decision: HumanDecision; message: string };
  decisionDocument?: string;
  recruited: { by: AgentType; agent: AgentType; reason: string }[];
  failureReason?: string;
}

const AGENTS: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis', 'environmental'];

function initialState(): WorkflowState {
  return {
    status: 'pending',
    agents: Object.fromEntries(AGENTS.map((a) => [a, { status: 'idle' }])) as Record<AgentType, AgentCardState>,
    messages: [],
    handoffs: [],
    contradictions: [],
    missingDocs: [],
    recruited: [],
  };
}

function reduce(prev: WorkflowState, e: DealEvent): WorkflowState {
  switch (e.type) {
    case 'workflow.status':
      return { ...prev, status: e.status };
    case 'room.initialized':
      return { ...prev, bandRoomId: e.band_room_id };
    case 'agent.processing':
      return { ...prev, agents: { ...prev.agents, [e.agent]: { ...prev.agents[e.agent], status: 'processing' } } };
    case 'agent.completed':
      return { ...prev, agents: { ...prev.agents, [e.agent]: { status: 'done', headline: e.headline, model: e.model } } };
    case 'agent.failed':
      return { ...prev, agents: { ...prev.agents, [e.agent]: { status: 'failed', headline: e.reason } } };
    case 'agent.mentioned':
      return { ...prev, handoffs: [...prev.handoffs, { from: e.from, to: e.to, reason: e.reason }] };
    case 'agent.recruited':
      if (prev.recruited.some((r) => r.agent === e.agent)) return prev;
      return { ...prev, recruited: [...prev.recruited, { by: e.by, agent: e.agent, reason: e.reason }] };
    case 'band.message':
      // Dedupe — hydration + SSE replay can deliver the same message.
      if (prev.messages.some((m) => m.agent === e.agent && m.content === e.content)) return prev;
      return { ...prev, messages: [...prev.messages, { agent: e.agent, content: e.content }] };
    case 'escalation.needed':
      return { ...prev, missingDocs: e.missing };
    case 'contradiction.detected':
      if (prev.contradictions.some((c) => c.title === e.title)) return prev;
      return { ...prev, contradictions: [...prev.contradictions, { title: e.title, detail: e.detail, agents: e.agents }] };
    case 'financial.recalculated':
      return { ...prev, cascade: { irr_before: e.irr_before, irr_after: e.irr_after, trigger: e.trigger } };
    case 'approval.required':
      return { ...prev, status: 'awaiting_human', approvalSummary: e.summary, compositeScore: e.composite_score, signal: e.signal, recommendation: e.recommendation, topFindings: e.top_findings, conditions: e.conditions };
    case 'human.challenge':
      return { ...prev, challenge: { decision: e.decision, message: e.message } };
    case 'decision.document':
      return { ...prev, decisionDocument: e.content };
    case 'deal.decided':
      return { ...prev, status: 'decided', decision: e.decision, challenge: undefined };
    case 'workflow.failed':
      return { ...prev, status: 'failed', failureReason: e.reason };
    default:
      return prev;
  }
}

// ── Hydration from the database (for past deals / after restart) ──────────────

interface HydrateDeal {
  deal?: { status: string };
  room?: { band_room_id: string } | null;
  evaluations?: { agent_type: string; status: string; summary?: string | null; raw_output?: Record<string, unknown>; created_at: string }[];
  decision?: { final_status: string } | null;
}
interface HydrateAudit {
  events?: { event_type: string; payload?: Record<string, unknown>; created_at: string }[];
}

function hydrate(d: HydrateDeal, a: HydrateAudit | null): WorkflowState {
  const st = initialState();
  if (d.deal) st.status = d.deal.status;
  if (d.room?.band_room_id) st.bandRoomId = d.room.band_room_id;

  // Collect room messages from agent evaluations + negotiation turns, ordered by time.
  const msgs: { agent: AgentType; content: string; ts: number }[] = [];

  for (const e of d.evaluations ?? []) {
    const at = e.agent_type as AgentType;
    if (st.agents[at]) st.agents[at] = { status: e.status === 'failed' ? 'failed' : 'done', headline: e.status };
    if (e.summary) msgs.push({ agent: at, content: e.summary, ts: +new Date(e.created_at) });
    const raw = (e.raw_output ?? {}) as Record<string, unknown>;
    if (at === 'synthesis') {
      st.recommendation = raw.recommendation as string | undefined;
      st.topFindings = raw.top_findings as WorkflowState['topFindings'];
      st.conditions = raw.conditions_precedent as string[] | undefined;
      st.signal = raw.signal as Signal | undefined;
    }
    if (at === 'archivist' && Array.isArray(raw.missing_documents)) st.missingDocs = raw.missing_documents as string[];
  }

  for (const ev of a?.events ?? []) {
    const p = (ev.payload ?? {}) as Record<string, unknown>;
    if (ev.event_type === 'negotiation.turn') msgs.push({ agent: p.agent as AgentType, content: String(p.content ?? ''), ts: +new Date(ev.created_at) });
    if (ev.event_type === 'agent.recruited') st.recruited.push({ by: p.by as AgentType, agent: p.agent as AgentType, reason: String(p.reason ?? '') });
    if (ev.event_type === 'contradiction.detected') st.contradictions.push({ title: String(p.title ?? 'Contradiction'), detail: String(p.detail ?? ''), agents: (p.agents as AgentType[]) ?? [] });
    if (ev.event_type === 'financial.recalculated') st.cascade = { irr_before: Number(p.before), irr_after: Number(p.after), trigger: String(p.trigger ?? 'upstream finding') };
    if (ev.event_type === 'approval.required') { st.compositeScore = p.composite as number | undefined; if (p.signal) st.signal = p.signal as Signal; }
    if (ev.event_type === 'decision.document') st.decisionDocument = String(p.content ?? '');
  }

  st.messages = msgs.sort((x, y) => x.ts - y.ts).map(({ agent, content }) => ({ agent, content }));

  if (d.decision?.final_status) st.decision = d.decision.final_status as HumanDecision;
  return st;
}

/** Hydrate from the DB on load, then apply the live SSE stream on top. */
export function useDealWorkflow(dealId: string): WorkflowState {
  const [state, setState] = useState<WorkflowState>(initialState);
  const esRef = useRef<EventSource | null>(null);

  // Hydrate from the database (covers past deals with no live events).
  useEffect(() => {
    if (!dealId) return;
    let cancelled = false;
    (async () => {
      const [d, a] = await Promise.all([
        fetch(`/api/deals/${dealId}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/deals/${dealId}/audit`).then((r) => r.json()).catch(() => null),
      ]);
      if (cancelled || !d?.deal) return;
      // Only apply if the live stream hasn't already populated the room.
      setState((prev) => (prev.messages.length > 0 ? prev : hydrate(d, a)));
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  // Live updates.
  useEffect(() => {
    if (!dealId) return;
    const es = new EventSource(`/api/deals/${dealId}/stream`);
    esRef.current = es;
    es.onmessage = (event) => {
      if (!event.data || event.data.startsWith(':')) return;
      try {
        setState((prev) => reduce(prev, JSON.parse(event.data) as DealEvent));
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [dealId]);

  return state;
}
