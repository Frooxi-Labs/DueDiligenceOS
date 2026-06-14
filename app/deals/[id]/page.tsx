'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useDealWorkflow, type WorkflowState } from '@/hooks/useDealWorkflow';
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
interface DealMeta { title?: string; intended_use?: string; purchase_price?: string; acquisition_type?: string }

/** The tailored next-step artifact each reviewer decision produces. */
function nextStep(decision: HumanDecision, s: WorkflowState): { heading: string; intro: string; items: string[] } {
  const material = (s.topFindings ?? []).filter((f) => f.severity === 'critical' || f.severity === 'material');
  if (decision === 'proceed') {
    return {
      heading: 'Conditions precedent — satisfy before closing',
      intro: 'Approved to proceed, subject to clearing the following before funds are released:',
      items: s.conditions ?? [],
    };
  }
  if (decision === 'remediate') {
    return {
      heading: 'Seller remediation request',
      intro: 'The deal is paused pending the seller curing the items below; re-evaluate once delivered:',
      items: [
        ...material.map((f) => `Seller to resolve: ${f.title}`),
        ...(s.missingDocs ?? []).map((d) => `Seller to provide: ${d}`),
      ],
    };
  }
  return {
    heading: 'Renegotiation brief',
    intro: 'The findings materially change the economics. Take the following back to the table:',
    items: [
      ...material.map((f) => `Re-trade on: ${f.title}`),
      ...(s.cascade ? [`Reprice to reflect IRR falling from ${s.cascade.irr_before.toFixed(1)}% to ${s.cascade.irr_after.toFixed(1)}%`] : []),
    ],
  };
}

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const s = useDealWorkflow(id);
  const [deciding, setDeciding] = useState(false);
  const [localDecision, setLocalDecision] = useState<HumanDecision | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [deal, setDeal] = useState<DealMeta | null>(null);

  const shownDecision = s.decision ?? localDecision;

  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}`).then((r) => r.json()).then((d) => setDeal(d.deal ?? null)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/deals/${id}/audit`).then((r) => r.json()).then((d) => setAudit(d.events ?? [])).catch(() => {});
  }, [id, s.status, s.messages.length]);

  // Once the memo is ready, collapse the discussion so the memo is the focus.
  useEffect(() => {
    if (s.recommendation) setChatOpen(false);
  }, [!!s.recommendation]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(decision: HumanDecision) {
    setDeciding(true);
    setDecideError(null);
    try {
      const res = await fetch(`/api/deals/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }) });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setLocalDecision(decision);
    } catch (e) {
      setDecideError((e as Error).message);
    } finally {
      setDeciding(false);
    }
  }

  function downloadMemo() {
    const w = window.open('', '_blank');
    if (!w) return;
    const ns = shownDecision ? nextStep(shownDecision, s) : null;
    const sig = (s.signal ?? 'yellow').toUpperCase();
    const sigBg = s.signal === 'green' ? '#15803d' : s.signal === 'red' ? '#b91c1c' : '#b45309';
    const li = (arr: string[]) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    const findings = (s.topFindings ?? [])
      .map((f) => `<li><span class="sev sev-${f.severity}">${f.severity.toUpperCase()}</span> <b>${escapeHtml(f.title)}.</b> ${escapeHtml(f.detail)}</li>`)
      .join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Due Diligence Memorandum — ${escapeHtml(deal?.title ?? 'Deal')}</title>
<style>
  @page { margin: 28mm 22mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.5; max-width: 760px; margin: 0 auto; padding: 24px; }
  .top { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 20px; }
  .brand { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #666; }
  h1 { font-size: 24px; margin: 6px 0 2px; }
  .sub { color: #555; font-size: 13px; }
  .meta { display: flex; gap: 24px; font-size: 12px; color: #555; margin-top: 8px; }
  .verdict { display: flex; align-items: center; gap: 16px; margin: 18px 0; }
  .badge { color: #fff; font-weight: bold; padding: 6px 14px; border-radius: 4px; font-family: Arial, sans-serif; letter-spacing: 1px; }
  .risk { font-size: 13px; color: #444; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; color: #444; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin: 22px 0 8px; }
  p { margin: 8px 0; font-size: 14px; }
  ul { margin: 6px 0; padding-left: 20px; font-size: 13.5px; }
  li { margin: 5px 0; }
  .sev { font-family: Arial, sans-serif; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 3px; }
  .sev-critical { background: #fee2e2; color: #b91c1c; }
  .sev-material { background: #fef3c7; color: #b45309; }
  .sev-minor { background: #eee; color: #555; }
  .decision { margin-top: 20px; padding: 12px 16px; background: #f6f6f4; border-left: 3px solid ${sigBg}; }
  .foot { margin-top: 28px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 10.5px; color: #999; }
</style></head><body>
  <div class="top">
    <div class="brand">DueDiligenceOS · Due-Diligence Memorandum</div>
    <h1>${escapeHtml(deal?.title ?? 'Deal Memorandum')}</h1>
    <div class="sub">${escapeHtml(deal?.intended_use ?? '')}${deal?.purchase_price ? ` · $${Number(deal.purchase_price).toLocaleString()}` : ''}</div>
    <div class="meta"><span>Prepared: ${new Date().toLocaleString()}</span><span>Reviewer decision: <b>${shownDecision ? shownDecision.toUpperCase() : 'PENDING'}</b></span></div>
  </div>
  <div class="verdict"><span class="badge" style="background:${sigBg}">${sig}</span><span class="risk">Composite risk score: <b>${s.compositeScore ?? '—'}/100</b></span></div>
  <h2>Recommendation</h2>
  <p>${escapeHtml(s.recommendation ?? '')}</p>
  <h2>Top findings</h2>
  <ul>${findings || '<li>None.</li>'}</ul>
  <h2>Conditions precedent</h2>
  <ul>${li(s.conditions ?? []) || '<li>None.</li>'}</ul>
  ${ns ? `<div class="decision"><b>${escapeHtml(ns.heading)}</b><p>${escapeHtml(ns.intro)}</p><ul>${li(ns.items) || '<li>None.</li>'}</ul></div>` : ''}
  <div class="foot">Generated by DueDiligenceOS. Decision-support only — not legal, tax, or investment advice. All findings are AI-generated and should be verified by qualified professionals.</div>
</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const activityCount = s.contradictions.length + (s.cascade ? 1 : 0) + (s.missingDocs.length ? 1 : 0) + (s.status === 'failed' ? 1 : 0);
  const ns = shownDecision ? nextStep(shownDecision, s) : null;

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Main column ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col p-6 min-w-0 overflow-auto df-scroll">
        <header className="mb-4 shrink-0">
          <h1 className="text-lg font-semibold">Due-Diligence Committee</h1>
          <p className="text-xs text-neutral-500">
            Status: <span className="text-neutral-300">{s.status.replace(/_/g, ' ')}</span>
            {s.bandRoomId && <span className="ml-2">· Band room live</span>}
          </p>
        </header>

        {/* Agent roster */}
        <div className="grid grid-cols-5 gap-3 mb-4 shrink-0">
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

        {/* Committee discussion — collapsible */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 mb-4 shrink-0">
          <button onClick={() => setChatOpen((v) => !v)} className="w-full flex items-center justify-between px-4 h-11 text-sm">
            <span className="font-medium">Committee discussion <span className="text-neutral-500">· {s.messages.length}</span></span>
            <span className="text-neutral-500">{chatOpen ? '▾' : '▸'}</span>
          </button>
          {chatOpen && (
            <div className="px-4 pb-4 space-y-3 max-h-[45vh] overflow-auto df-scroll">
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
          )}
        </div>

        {/* Executive deal memo + human gate */}
        {s.recommendation && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900 overflow-hidden shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800" style={{ background: s.signal === 'green' ? '#0e2a1a' : s.signal === 'yellow' ? '#2a230e' : '#2a0e0e' }}>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-neutral-500">Deal memo</p>
                <p className={`text-lg font-semibold ${s.signal ? signalColor[s.signal] : ''}`}>{s.signal?.toUpperCase()}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500">Composite risk</p>
                  <p className="text-lg font-semibold">{s.compositeScore ?? '—'}<span className="text-xs text-neutral-500">/100</span></p>
                </div>
                <button onClick={downloadMemo} title="Download PDF" className="text-xs border border-neutral-700 rounded-lg px-3 py-2 hover:text-white hover:border-neutral-500">↓ PDF</button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-sm text-neutral-300 leading-relaxed">{s.recommendation}</p>

              {s.topFindings && s.topFindings.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-neutral-600 mb-1.5">Top findings</p>
                  <ul className="space-y-1.5">
                    {s.topFindings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 h-fit ${f.severity === 'critical' ? 'bg-red-500/20 text-red-400' : f.severity === 'material' ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-700/40 text-neutral-400'}`}>{f.severity}</span>
                        <span className="text-neutral-300"><span className="font-medium text-neutral-200">{f.title}.</span> {f.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.conditions && s.conditions.length > 0 && (
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-neutral-600 mb-1.5">Conditions precedent</p>
                  <ul className="space-y-1">
                    {s.conditions.map((c, i) => <li key={i} className="flex gap-2 text-sm text-neutral-300"><span className="text-neutral-600">☐</span> {c}</li>)}
                  </ul>
                </div>
              )}
            </div>

            {/* Decision footer */}
            <div className="px-4 py-3 border-t border-neutral-800">
              {!shownDecision ? (
                <>
                  <p className="text-xs text-neutral-500 mb-2">Reviewer decision required — the memo is held until you decide.</p>
                  <div className="flex flex-wrap gap-3">
                    <button onClick={() => decide('proceed')} disabled={deciding} className="rounded-lg bg-emerald-500 text-black font-medium px-4 py-2 hover:bg-emerald-400 disabled:opacity-50">Proceed with conditions</button>
                    <button onClick={() => decide('remediate')} disabled={deciding} className="rounded-lg bg-amber-500 text-black font-medium px-4 py-2 hover:bg-amber-400 disabled:opacity-50">Request remediation</button>
                    <button onClick={() => decide('renegotiate')} disabled={deciding} className="rounded-lg bg-red-500/90 text-white font-medium px-4 py-2 hover:bg-red-500 disabled:opacity-50">Flag for renegotiation</button>
                  </div>
                  {decideError && <p className="mt-2 text-xs text-red-400">Could not record decision: {decideError}</p>}
                </>
              ) : (
                <>
                  <p className="text-sm">
                    <span className="text-neutral-500">Reviewer decision:</span>{' '}
                    <span className="text-white font-semibold capitalize">{shownDecision}</span>
                    <span className="text-neutral-600"> · stamped {new Date().toLocaleString()}</span>
                  </p>
                  {ns && (
                    <div className="mt-3 rounded-lg bg-neutral-800/40 p-3">
                      <p className="text-[11px] uppercase tracking-widest text-neutral-500 mb-1">{ns.heading}</p>
                      <p className="text-xs text-neutral-400 mb-2">{ns.intro}</p>
                      <ul className="space-y-1">
                        {ns.items.length === 0 ? <li className="text-sm text-neutral-500">None.</li> : ns.items.map((it, i) => <li key={i} className="flex gap-2 text-sm text-neutral-300"><span className="text-neutral-600">•</span> {it}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
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
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">Missing documents: {s.missingDocs.join(', ')}</div>
            )}
            {s.status === 'failed' && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">Workflow failed{s.failureReason ? `: ${s.failureReason}` : ''}</div>
            )}
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

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
