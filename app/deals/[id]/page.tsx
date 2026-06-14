'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useDealWorkflow } from '@/hooks/useDealWorkflow';
import type { AgentType, HumanDecision } from '@/types';

const LABELS: Record<AgentType, string> = {
  archivist: 'Archivist',
  regulatory: 'Regulatory',
  legal: 'Legal Risk',
  financial: 'Financial',
  synthesis: 'Synthesis',
};
const ORDER: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis'];
const signalColor: Record<string, string> = { green: 'text-emerald-400', yellow: 'text-amber-400', red: 'text-red-400' };

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const s = useDealWorkflow(id);
  const [deciding, setDeciding] = useState(false);

  async function decide(decision: HumanDecision) {
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
      <header className="mb-4">
        <h1 className="text-lg font-semibold">Due-Diligence Committee</h1>
        <p className="text-xs text-neutral-500">
          Status: <span className="text-neutral-300">{s.status.replace(/_/g, ' ')}</span>
          {s.bandRoomId && <span className="ml-2">· Band room live</span>}
        </p>
      </header>

      {/* Agent roster */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {ORDER.map((a) => {
          const c = s.agents[a];
          return (
            <div key={a} className={`rounded-xl border p-3 ${c.status === 'processing' ? 'border-blue-500/60 bg-blue-500/5' : 'border-neutral-800 bg-neutral-900/40'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-2 h-2 rounded-full ${c.status === 'processing' ? 'bg-blue-400 agent-pulse' : c.status === 'done' ? 'bg-emerald-400' : c.status === 'failed' ? 'bg-red-400' : 'bg-neutral-600'}`} />
                <span className="text-xs font-medium">{LABELS[a]}</span>
              </div>
              <p className="text-[11px] text-neutral-500">{c.status === 'processing' ? 'working…' : c.headline ?? c.status}</p>
            </div>
          );
        })}
      </div>

      {/* Cascade — the IRR visibly moving */}
      {s.cascade && (
        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
          <span className="text-amber-300">↻ Financial re-underwrote</span> — IRR{' '}
          <span className="text-neutral-400 line-through">{s.cascade.irr_before.toFixed(1)}%</span>{' '}
          <span className="text-white font-semibold">→ {s.cascade.irr_after.toFixed(1)}%</span>
          <span className="text-neutral-500"> · triggered by {s.cascade.trigger}</span>
        </div>
      )}

      {/* Contradiction — the "that would have been missed" moment */}
      {s.contradictions.map((c, i) => (
        <div key={i} className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-300">⚠ CONTRADICTION — {c.title}</p>
          <p className="text-xs text-neutral-400 mt-1">{c.detail}</p>
          <p className="text-[11px] text-neutral-500 mt-1">{c.agents.map((a) => LABELS[a]).join(' vs ')}</p>
        </div>
      ))}

      {s.status === 'failed' && (
        <div className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          Workflow failed{s.failureReason ? `: ${s.failureReason}` : ''}
        </div>
      )}

      {s.missingDocs.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
          Missing documents flagged by Archivist: {s.missingDocs.join(', ')}
        </div>
      )}

      {/* Live room feed */}
      <div className="flex-1 overflow-auto df-scroll rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
        {s.messages.length === 0 && <p className="text-sm text-neutral-600">Waiting for the committee to convene…</p>}
        {s.messages.map((m, i) => (
          <div key={i} className="text-sm">
            <span className="font-medium text-neutral-200">{LABELS[m.agent]}</span>
            <p className="text-neutral-400 leading-relaxed">{m.content}</p>
          </div>
        ))}
      </div>

      {/* Human-in-the-loop gate */}
      {s.status === 'awaiting_human' && !s.decision && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4">
          {s.signal && (
            <p className="mb-2 text-sm">
              Signal: <span className={`font-semibold ${signalColor[s.signal]}`}>{s.signal.toUpperCase()}</span>
              {s.compositeScore !== undefined && <span className="text-neutral-500"> · composite risk {s.compositeScore}/100</span>}
            </p>
          )}
          <p className="text-sm text-neutral-300 mb-3 whitespace-pre-line">{s.approvalSummary}</p>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => decide('proceed')} disabled={deciding} className="rounded-lg bg-emerald-500 text-black font-medium px-4 py-2 hover:bg-emerald-400 disabled:opacity-50">Proceed with conditions</button>
            <button onClick={() => decide('remediate')} disabled={deciding} className="rounded-lg bg-amber-500 text-black font-medium px-4 py-2 hover:bg-amber-400 disabled:opacity-50">Request remediation</button>
            <button onClick={() => decide('renegotiate')} disabled={deciding} className="rounded-lg bg-red-500/90 text-white font-medium px-4 py-2 hover:bg-red-500 disabled:opacity-50">Flag for renegotiation</button>
          </div>
        </div>
      )}

      {s.decision && (
        <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
          Reviewer decision recorded: <span className="text-white font-medium">{s.decision.replace(/_/g, ' ')}</span>
        </div>
      )}
    </div>
  );
}
