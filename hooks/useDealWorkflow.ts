'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentType, DealEvent, HumanDecision, Signal } from '@/types';

export interface AgentCardState {
  status: 'idle' | 'processing' | 'done' | 'failed';
  headline?: string;
  model?: string;
}

export interface RoomMessage {
  agent: AgentType;
  content: string;
}

export interface Contradiction {
  title: string;
  detail: string;
  agents: AgentType[];
}

export interface CascadeInfo {
  irr_before: number;
  irr_after: number;
  trigger: string;
}

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
  failureReason?: string;
}

const AGENTS: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis'];

function initialState(): WorkflowState {
  return {
    status: 'pending',
    agents: Object.fromEntries(AGENTS.map((a) => [a, { status: 'idle' }])) as Record<AgentType, AgentCardState>,
    messages: [],
    handoffs: [],
    contradictions: [],
    missingDocs: [],
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
    case 'band.message':
      return { ...prev, messages: [...prev.messages, { agent: e.agent, content: e.content }] };
    case 'escalation.needed':
      return { ...prev, missingDocs: e.missing };
    case 'contradiction.detected':
      return { ...prev, contradictions: [...prev.contradictions, { title: e.title, detail: e.detail, agents: e.agents }] };
    case 'financial.recalculated':
      return { ...prev, cascade: { irr_before: e.irr_before, irr_after: e.irr_after, trigger: e.trigger } };
    case 'approval.required':
      return {
        ...prev,
        status: 'awaiting_human',
        approvalSummary: e.summary,
        compositeScore: e.composite_score,
        signal: e.signal,
        recommendation: e.recommendation,
        topFindings: e.top_findings,
        conditions: e.conditions,
      };
    case 'deal.decided':
      return { ...prev, status: 'decided', decision: e.decision };
    case 'workflow.failed':
      return { ...prev, status: 'failed', failureReason: e.reason };
    default:
      return prev;
  }
}

/** Subscribe to a deal's live SSE stream and reduce events into UI state. */
export function useDealWorkflow(dealId: string): WorkflowState {
  const [state, setState] = useState<WorkflowState>(initialState);
  const esRef = useRef<EventSource | null>(null);

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
