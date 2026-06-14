'use client';

import { useEffect, useState } from 'react';
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

interface AuditEvent { id: string; event_type: string; agent_type?: string | null; created_at: string }

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const s = useDealWorkflow(id);
  const [deciding, setDeciding] = useState(false);
  const [localDecision, setLocalDecision] = useState<HumanDecision | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);

  const shownDecision = s.decision ?? localDecision;

  // Refresh the audit trail as the run progresses / completes.
  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}/audit`).then((r) => r.json()).then((d) => setAudit(d.events ?? [])).catch(() => {});
  }, [id, s.status, s.messages.length]);

  async function decide(decision: HumanDecision) {
    setDeciding(true);
    setDecideError(null);
    try {
      const res = await fetch(`/api/deals/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setLocalDecision(decision); // optimistic — don't rely solely on the SSE echo
    } catch (e) {
      setDecideError((e as Error).message);
    } finally {
      setDeciding(false);
    }
  }

  const activityCount = s.contradictions.length + (s.cascade ? 1 : 0) + (s.missingDocs.length ? 1 : 0) + (s.status === 'failed' ? 1 : 0);

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-6 min-w-0">
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

        {/* Chat feed */}
        <div className="flex-1 overflow-auto df-scroll rounded-xl border border-neutral-800 bg-neutral-900/30 p-4 space-y-3">
          {s.messages.length === 0 && <p className="text-sm text-neutral-600">Waiting for the committee to convene…</p>}
          {s.messages.map((m, i) => (
            <div key={i} className="fade-up flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">{LABELS[m.agent].slice(0, 2)}</div>
              <div className="min-w-0">
                <span className="text-xs font-medium text-neutral-200">{LABELS[m.agent]}</span>
                <div className="mt-0.5 rounded-xl rounded-tl-sm bg-neutral-800/60 px-3 py-2 text-sm text-neutral-300 leading-relaxed">{m.content}</div>
              </div>
            </div>
          ))}
          {ORDER.filter((a) => s.agents[a].status === 'processing').map((a) => (
            <div key={`t-${a}`} className="fade-up flex gap-3 items-center">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-400 shrink-0">{LABELS[a].slice(0, 2)}</div>
              <div className="flex items-center gap-1 rounded-xl bg-neutral-800/40 px-3 py-2">
                <span className="text-xs text-neutral-500 mr-1">{LABELS[a]} is analysing</span>
                {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-neutral-500 thinking-dot" style={{ animationDelay: `${d * 0.15}s` }} />)}
              </div>
            </div>
          ))}
        </div>

        {/* Human gate */}
        {s.status === 'awaiting_human' && !shownDecision && (
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
            {decideError && <p className="mt-2 text-xs text-red-400">Could not record decision: {decideError}</p>}
          </div>
        )}
        {shownDecision && (
          <div className="mt-4 rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-sm">
            Reviewer decision recorded: <span className="text-white font-medium capitalize">{shownDecision}</span>
          </div>
        )}
      </div>

      {/* ── Right activity panel (collapsible) ────────────────────── */}
      {logsOpen ? (
        <aside className="w-80 flex-shrink-0 border-l border-neutral-800 flex flex-col bg-neutral-900/20">
          <div className="flex items-center justify-between px-4 h-12 border-b border-neutral-800">
            <span className="text-sm font-medium">Activity {activityCount > 0 && <span className="text-neutral-500">· {activityCount}</span>}</span>
            <button onClick={() => setLogsOpen(false)} title="Collapse" className="text-neutral-500 hover:text-white text-sm">→</button>
          </div>
          <div className="flex-1 overflow-auto df-scroll p-4 space-y-3">
            {s.cascade && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <p className="text-amber-300 font-medium mb-0.5">↻ Cascading recalculation</p>
                IRR <span className="text-neutral-400 line-through">{s.cascade.irr_before.toFixed(1)}%</span> <span className="text-white font-semibold">→ {s.cascade.irr_after.toFixed(1)}%</span>
                <p className="text-neutral-500 mt-1">Triggered by {s.cascade.trigger}</p>
              </div>
            )}
            {s.contradictions.map((c, i) => (
              <div key={i} className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs">
                <p className="text-red-300 font-semibold mb-0.5">⚠ Contradiction</p>
                <p className="text-neutral-300">{c.title}</p>
                <p className="text-neutral-500 mt-1">{c.detail}</p>
                <p className="text-neutral-600 mt-1">{c.agents.map((a) => LABELS[a]).join(' vs ')}</p>
              </div>
            ))}
            {s.missingDocs.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                Missing documents: {s.missingDocs.join(', ')}
              </div>
            )}
            {s.status === 'failed' && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                Workflow failed{s.failureReason ? `: ${s.failureReason}` : ''}
              </div>
            )}

            {/* Audit trail */}
            <div className="pt-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-2">Audit trail</p>
              {!audit || audit.length === 0 ? (
                <p className="text-xs text-neutral-600">No events yet.</p>
              ) : (
                <ol className="space-y-1.5">
                  {audit.map((e) => (
                    <li key={e.id} className="text-[11px] flex gap-2">
                      <span className="text-neutral-600 tabular-nums shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span>
                      <span className="text-neutral-400">{e.event_type}</span>
                      {e.agent_type && <span className="text-neutral-600">· {e.agent_type}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </aside>
      ) : (
        <button onClick={() => setLogsOpen(true)} title="Show activity" className="w-10 flex-shrink-0 border-l border-neutral-800 flex flex-col items-center pt-4 gap-2 text-neutral-500 hover:text-white">
          <span className="text-sm">←</span>
          {activityCount > 0 && <span className="text-[10px] rounded-full bg-red-500/80 text-white w-5 h-5 flex items-center justify-center">{activityCount}</span>}
        </button>
      )}
    </div>
  );
}
