'use client';

import { useEffect, useRef, useState } from 'react';
import type { AgentStatus, AgentType, DealEvent } from '@/types';

export interface AgentCardState {
  status: 'idle' | 'processing' | 'done' | 'failed';
  verdict?: AgentStatus;
  confidence?: number;
  summary?: string;
}

export interface RoomMessage {
  agent: AgentType;
  content: string;
  status: AgentStatus;
}

export interface Handoff {
  from: AgentType;
  to: AgentType;
  reason: string;
}

export interface WorkflowState {
  status: string;
  bandRoomId?: string;
  agents: Record<AgentType, AgentCardState>;
  messages: RoomMessage[];
  handoffs: Handoff[];
  conflictAgents: AgentType[];
  approvalSummary?: string;
  decision?: 'approved' | 'rejected';
  decisionConditions?: string[];
}

const AGENTS: AgentType[] = [
  'market_analysis',
  'due_diligence',
  'risk_assessment',
  'legal_review',
  'financial_underwriting',
];

function initialState(): WorkflowState {
  return {
    status: 'pending',
    agents: Object.fromEntries(AGENTS.map((a) => [a, { status: 'idle' }])) as Record<AgentType, AgentCardState>,
    messages: [],
    handoffs: [],
    conflictAgents: [],
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
      return {
        ...prev,
        agents: {
          ...prev.agents,
          [e.agent]: { status: 'done', verdict: e.status, confidence: e.confidence, summary: e.summary },
        },
      };
    case 'agent.failed':
      return { ...prev, agents: { ...prev.agents, [e.agent]: { status: 'failed', summary: e.reason } } };
    case 'agent.mentioned':
      return { ...prev, handoffs: [...prev.handoffs, { from: e.from, to: e.to, reason: e.reason }] };
    case 'band.message':
      return { ...prev, messages: [...prev.messages, { agent: e.agent, content: e.content, status: e.status }] };
    case 'conflict.detected':
      return { ...prev, conflictAgents: e.rejecting_agents };
    case 'approval.required':
      return { ...prev, status: 'awaiting_human', approvalSummary: e.summary };
    case 'deal.approved':
      return { ...prev, status: 'approved', decision: 'approved', decisionConditions: e.conditions };
    case 'deal.rejected':
      return { ...prev, status: 'rejected', decision: 'rejected' };
    case 'workflow.failed':
      return { ...prev, status: 'failed' };
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
        const parsed = JSON.parse(event.data) as DealEvent;
        setState((prev) => reduce(prev, parsed));
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; nothing to do.
    };
    return () => {
      es.close();
      esRef.current = null;
    };
  }, [dealId]);

  return state;
}
