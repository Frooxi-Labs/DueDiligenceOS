'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useDealWorkflow } from '@/hooks/useDealWorkflow';
import type { AgentType } from '@/types';

const AGENT_LABELS: Record<AgentType, string> = {
  market_analysis: 'Market Analysis',
  due_diligence: 'Due Diligence',
  risk_assessment: 'Risk Assessment',
  legal_review: 'Legal & Compliance',
  financial_underwriting: 'Financial Underwriting',
};
const AGENT_ORDER: AgentType[] = [
  'market_analysis',
  'due_diligence',
  'risk_assessment',
  'legal_review',
  'financial_underwriting',
];

const verdictColor: Record<string, string> = {
  approve: 'text-emerald-400',
  conditional: 'text-amber-400',
  reject: 'text-red-400',
  failed: 'text-neutral-500',
};

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const state = useDealWorkflow(id);
  const [deciding, setDeciding] = useState(false);

  async function decide(decision: 'approve' | 'reject') {
    setDeciding(true);
    await fetch(`/api/deals/${id}/decide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }).catch(() => {});
    setDeciding(false);
  }

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Investment Committee</h1>
          <p className="text-xs text-neutral-500">
            Status: <span className="text-neutral-300">{state.status.replace(/_/g, ' ')}</span>
            {state.bandRoomId && <span className="ml-2">· Band room live</span>}
          </p>
        </div>
      </header>

      {/* Agent roster */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {AGENT_ORDER.map((a) => {
          const s = state.agents[a];
          const beingHandedTo = state.handoffs.at(-1)?.to === a && s.status !== 'done';
          return (
            <div
              key={a}
              className={`rounded-xl border p-3 ${
                s.status === 'processing' || beingHandedTo
                  ? 'border-blue-500/60 bg-blue-500/5'
                  : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    s.status === 'processing'
                      ? 'bg-blue-400 agent-pulse'
                      : s.status === 'done'
                      ? 'bg-emerald-400'
                      : s.status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-neutral-600'
                  }`}
                />
                <span className="text-xs font-medium">{AGENT_LABELS[a]}</span>
              </div>
              <p className="text-[11px] text-neutral-500 capitalize">
                {s.status === 'processing' ? 'working…' : s.verdict ?? s.status}
              </p>
              {s.confidence !== undefined && (
                <p className="text-[10px] text-neutral-600 mt-1">{Math.round(s.confidence * 100)}% conf.</p>
              )}
            </div>
          );
        })}
      </div>

      {state.conflictAgents.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          ⚠ Conflict — {state.conflictAgents.map((a) => AGENT_LABELS[a]).join(', ')} rejected. Reviewer decision required.
        </div>
      )}

      {/* Live room feed */}
      <div className="flex-1 overflow-auto df-scroll rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
        {state.messages.length === 0 && (
          <p className="text-sm text-neutral-600">Waiting for the committee to convene…</p>
        )}
        {state.messages.map((m, i) => (
          <div key={i} className="text-sm">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-medium text-neutral-200">{AGENT_LABELS[m.agent]}</span>
              <span className={`text-[11px] uppercase ${verdictColor[m.status] ?? 'text-neutral-500'}`}>
                {m.status}
              </span>
            </div>
            <p className="text-neutral-400 leading-relaxed">{m.content}</p>
          </div>
        ))}
      </div>

      {/* Approval gate */}
      {state.status === 'awaiting_human' && !state.decision && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
          <p className="text-sm text-neutral-300 mb-3 whitespace-pre-line">{state.approvalSummary}</p>
          <div className="flex gap-3">
            <button
              onClick={() => decide('approve')}
              disabled={deciding}
              className="rounded-lg bg-emerald-500 text-black font-medium px-5 py-2 hover:bg-emerald-400 disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => decide('reject')}
              disabled={deciding}
              className="rounded-lg bg-red-500/90 text-white font-medium px-5 py-2 hover:bg-red-500 disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {state.decision && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
          Decision recorded:{' '}
          <span className={state.decision === 'approved' ? 'text-emerald-400' : 'text-red-400'}>
            {state.decision.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}
