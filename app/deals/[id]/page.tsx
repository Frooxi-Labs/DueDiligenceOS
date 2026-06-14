'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDealWorkflow, type WorkflowState } from '@/hooks/useDealWorkflow';
import Markdown from '@/app/components/Markdown';
import type { AgentType, ForkProjection, HumanDecision } from '@/types';

const LABELS: Record<AgentType, string> = {
  archivist: 'Archivist', regulatory: 'Regulatory', legal: 'Legal Risk', financial: 'Financial', synthesis: 'Synthesis', environmental: 'Environmental',
};
const ORDER: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis'];
const signalColor: Record<string, string> = { green: 'text-emerald-400', yellow: 'text-amber-400', red: 'text-red-400' };
const riskColor: Record<string, string> = { low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400' };
const BRANCH_META: Record<HumanDecision, { label: string; btn: string }> = {
  proceed: { label: 'Proceed with conditions', btn: 'bg-emerald-500 text-black hover:bg-emerald-400' },
  remediate: { label: 'Request remediation', btn: 'bg-amber-500 text-black hover:bg-amber-400' },
  renegotiate: { label: 'Flag for renegotiation', btn: 'bg-red-500/90 text-white hover:bg-red-500' },
};
const SIM_LABEL: Record<HumanDecision, string> = {
  proceed: 'If we proceed with conditions',
  remediate: 'If we request seller remediation',
  renegotiate: 'If we renegotiate the deal',
};
const SIM_DOT: Record<HumanDecision, string> = { proceed: 'bg-emerald-400', remediate: 'bg-amber-400', renegotiate: 'bg-red-400' };

interface AuditEvent { id: string; event_type: string; agent_type?: string | null; created_at: string; payload?: Record<string, unknown> }
interface DealMeta { title?: string; intended_use?: string; purchase_price?: string }
interface ChatMsg { role: 'user' | 'assistant'; content: string; agent?: AgentType }

function nextStep(decision: HumanDecision, s: WorkflowState): { heading: string; intro: string; items: string[] } {
  const material = (s.topFindings ?? []).filter((f) => f.severity === 'critical' || f.severity === 'material');
  if (decision === 'proceed') return { heading: 'Conditions precedent — satisfy before closing', intro: 'Approved to proceed, subject to clearing the following before funds are released:', items: s.conditions ?? [] };
  if (decision === 'remediate') return { heading: 'Seller remediation request', intro: 'The deal is paused pending the seller curing the items below; re-evaluate once delivered:', items: [...material.map((f) => `Seller to resolve: ${f.title}`), ...(s.missingDocs ?? []).map((d) => `Seller to provide: ${d}`)] };
  return { heading: 'Renegotiation brief', intro: 'The findings materially change the economics. Take the following back to the table:', items: [...material.map((f) => `Re-trade on: ${f.title}`), ...(s.cascade ? [`Reprice to reflect IRR falling from ${s.cascade.irr_before.toFixed(1)}% to ${s.cascade.irr_after.toFixed(1)}%`] : [])] };
}

export default function DealPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const s = useDealWorkflow(id);
  const [deciding, setDeciding] = useState(false);
  const [localDecision, setLocalDecision] = useState<HumanDecision | null>(null);
  const [localChallenge, setLocalChallenge] = useState<{ decision: HumanDecision; message: string } | null>(null);
  const [dismissedChallenge, setDismissedChallenge] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [logsOpen, setLogsOpen] = useState(true);
  const [rightTab, setRightTab] = useState<'activity' | 'memo'>('activity');
  const [audit, setAudit] = useState<AuditEvent[] | null>(null);
  const [deal, setDeal] = useState<DealMeta | null>(null);
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [simBranch, setSimBranch] = useState<HumanDecision | null>(null);
  const [localProjections, setLocalProjections] = useState<ForkProjection[] | null>(null);
  const [bandBusy, setBandBusy] = useState(false);
  const [bandCheck, setBandCheck] = useState<{ message_count: number; participants_polled: number } | null>(null);
  const roomParam = searchParams.get('room');
  const activeRoom: 'parent' | HumanDecision =
    roomParam === 'proceed' || roomParam === 'remediate' || roomParam === 'renegotiate' ? roomParam : 'parent';
  const scrollRef = useRef<HTMLDivElement>(null);

  const shownDecision = s.decision ?? localDecision;
  const projections = s.projections ?? localProjections;
  const activeProjection = activeRoom === 'parent' ? null : projections?.find((p) => p.branch === activeRoom) ?? null;
  const inChildRoom = activeRoom !== 'parent' && !!activeProjection;
  const challenge = !shownDecision && !dismissedChallenge ? localChallenge ?? s.challenge : null;
  const ns = shownDecision ? nextStep(shownDecision, s) : null;
  const deliberating = !['awaiting_human', 'decided', 'failed'].includes(s.status);
  const rosterAgents = [...ORDER, ...s.recruited.map((r) => r.agent).filter((a) => !ORDER.includes(a))];

  useEffect(() => { if (id) fetch(`/api/deals/${id}`).then((r) => r.json()).then((d) => setDeal(d.deal ?? null)).catch(() => {}); }, [id]);
  useEffect(() => { if (id) fetch(`/api/deals/${id}/audit`).then((r) => r.json()).then((d) => setAudit(d.events ?? [])).catch(() => {}); }, [id, s.status, s.messages.length]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [s.messages.length, chatLog.length, s.recommendation]);
  // Surface the memo (with the decision controls) the moment it's ready.
  useEffect(() => { if (s.status === 'awaiting_human') { setRightTab('memo'); setLogsOpen(true); } }, [s.status]);
  // Restore the reviewer↔committee chat from persisted events (reload / old deals).
  useEffect(() => {
    if (!audit || chatLog.length > 0) return;
    const restored = audit
      .filter((e) => e.event_type === 'chat.user' || e.event_type === 'chat.message')
      .map((e): ChatMsg => (e.event_type === 'chat.user'
        ? { role: 'user', content: String(e.payload?.content ?? '') }
        : { role: 'assistant', content: String(e.payload?.content ?? ''), agent: e.payload?.agent as AgentType }));
    if (restored.length) setChatLog(restored);
  }, [audit]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(decision: HumanDecision, confirmed = false) {
    setDeciding(true); setDecideError(null);
    try {
      const res = await fetch(`/api/deals/${id}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, confirmed }) });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json();
      if (data.challenged) { setLocalChallenge({ decision, message: data.message }); setDismissedChallenge(false); }
      else setLocalDecision(decision);
    } catch (e) { setDecideError((e as Error).message); } finally { setDeciding(false); }
  }

  async function simulate(branch: HumanDecision) {
    if (simBranch) return;
    setSimBranch(branch); setDecideError(null);
    try {
      const res = await fetch(`/api/deals/${id}/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ branch }) });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data = await res.json(); // also arrives via SSE; this is the fallback
      setLocalProjections(data.projections ?? null);
      router.push(`/deals/${id}?room=${branch}`); // open the freshly-created child room
    } catch (e) { setDecideError((e as Error).message); } finally { setSimBranch(null); }
  }

  async function verifyBand() {
    if (bandBusy) return;
    setBandBusy(true);
    try {
      const res = await fetch(`/api/deals/${id}/band-context`);
      const data = await res.json();
      if (res.ok) setBandCheck({ message_count: data.message_count, participants_polled: data.participants_polled });
    } catch { /* ignore */ } finally { setBandBusy(false); }
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatBusy) return;
    setChatLog((p) => [...p, { role: 'user', content: q }]);
    setChatInput(''); setChatBusy(true);
    try {
      const res = await fetch(`/api/deals/${id}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: q }) });
      const data = await res.json();
      setChatLog((p) => [...p, { role: 'assistant', content: data.answer ?? data.error ?? 'No response.', agent: data.agent }]);
    } catch { setChatLog((p) => [...p, { role: 'assistant', content: 'Something went wrong.' }]); } finally { setChatBusy(false); }
  }

  function viewMemo() { setRightTab('memo'); setLogsOpen(true); }

  function downloadMemo() {
    const w = window.open('', '_blank');
    if (!w) return;
    const sig = (s.signal ?? 'yellow').toUpperCase();
    const sigBg = s.signal === 'green' ? '#15803d' : s.signal === 'red' ? '#b91c1c' : '#b45309';
    const li = (arr: string[]) => arr.map((x) => `<li>${escapeHtml(x)}</li>`).join('');
    const findings = (s.topFindings ?? []).map((f) => `<li><span class="sev sev-${f.severity}">${f.severity.toUpperCase()}</span> <b>${escapeHtml(f.title)}.</b> ${escapeHtml(f.detail)}</li>`).join('');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Due Diligence Memorandum — ${escapeHtml(deal?.title ?? 'Deal')}</title>
<style>@page{margin:28mm 22mm}*{box-sizing:border-box}body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.5;max-width:760px;margin:0 auto;padding:24px}.top{border-bottom:2px solid #1a1a1a;padding-bottom:12px;margin-bottom:20px}.brand{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#666}h1{font-size:24px;margin:6px 0 2px}.sub{color:#555;font-size:13px}.meta{display:flex;gap:24px;font-size:12px;color:#555;margin-top:8px}.verdict{display:flex;align-items:center;gap:16px;margin:18px 0}.badge{color:#fff;font-weight:bold;padding:6px 14px;border-radius:4px;font-family:Arial,sans-serif;letter-spacing:1px}.risk{font-size:13px;color:#444}h2{font-size:13px;text-transform:uppercase;letter-spacing:1.5px;color:#444;border-bottom:1px solid #ddd;padding-bottom:4px;margin:22px 0 8px}p{margin:8px 0;font-size:14px}ul{margin:6px 0;padding-left:20px;font-size:13.5px}li{margin:5px 0}.sev{font-family:Arial,sans-serif;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:3px}.sev-critical{background:#fee2e2;color:#b91c1c}.sev-material{background:#fef3c7;color:#b45309}.sev-minor{background:#eee;color:#555}.decision{margin-top:20px;padding:12px 16px;background:#f6f6f4;border-left:3px solid ${sigBg}}.foot{margin-top:28px;padding-top:10px;border-top:1px solid #ddd;font-size:10.5px;color:#999}</style></head><body>
  <div class="top"><div class="brand">DueDiligenceOS · Due-Diligence Memorandum</div><h1>${escapeHtml(deal?.title ?? 'Deal Memorandum')}</h1><div class="sub">${escapeHtml(deal?.intended_use ?? '')}${deal?.purchase_price ? ` · $${Number(deal.purchase_price).toLocaleString()}` : ''}</div><div class="meta"><span>Prepared: ${new Date().toLocaleString()}</span><span>Reviewer decision: <b>${shownDecision ? shownDecision.toUpperCase() : 'PENDING'}</b></span></div></div>
  <div class="verdict"><span class="badge" style="background:${sigBg}">${sig}</span><span class="risk">Composite risk score: <b>${s.compositeScore ?? '—'}/100</b></span></div>
  <h2>Recommendation</h2><p>${escapeHtml(s.recommendation ?? '')}</p>
  <h2>Top findings</h2><ul>${findings || '<li>None.</li>'}</ul>
  <h2>Conditions precedent</h2><ul>${li(s.conditions ?? []) || '<li>None.</li>'}</ul>
  ${shownDecision && s.decisionDocument ? `<div class="decision"><b>${shownDecision.toUpperCase()} — generated document</b><p style="white-space:pre-wrap">${escapeHtml(s.decisionDocument)}</p></div>` : ns ? `<div class="decision"><b>${escapeHtml(ns.heading)}</b><p>${escapeHtml(ns.intro)}</p><ul>${li(ns.items) || '<li>None.</li>'}</ul></div>` : ''}
  <div class="foot">Generated by DueDiligenceOS. Decision-support only — not legal, tax, or investment advice. All findings are AI-generated and should be verified by qualified professionals.</div>
</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  }

  const activityCount = s.contradictions.length + s.recruited.length + s.delegations.length + (s.cascade ? 1 : 0) + (s.missingDocs.length ? 1 : 0) + (s.status === 'failed' ? 1 : 0);

  return (
    <div className="h-full flex overflow-hidden">
      {/* ── Main: conversation ───────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="px-6 pt-5 pb-3 shrink-0">
          {inChildRoom ? (
            <>
              <button onClick={() => router.push(`/deals/${id}`)} className="text-xs text-neutral-400 hover:text-white mb-1">← Committee room</button>
              <h1 className="text-lg font-semibold capitalize">{activeRoom} — simulated branch</h1>
              <p className="text-xs text-neutral-500">Counterfactual Band child room{activeProjection?.child_room_id ? <span className="font-mono ml-1">· {activeProjection.child_room_id.slice(0, 8)}</span> : ''}</p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Due-Diligence Committee</h1>
              <p className="text-xs text-neutral-500">Status: <span className="text-neutral-300">{s.status.replace(/_/g, ' ')}</span>{s.bandRoomId && <span className="ml-2">· Band room live</span>}</p>
            </>
          )}
        </header>

        {!inChildRoom && (
        <div className="grid grid-cols-5 gap-3 px-6 mb-3 shrink-0">
          {rosterAgents.map((a) => {
            const c = s.agents[a];
            return (
              <div key={a} className={`rounded-xl border p-2.5 ${c.status === 'processing' ? 'border-blue-500/60 bg-blue-500/5' : 'border-neutral-800 bg-neutral-900/40'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-2 h-2 rounded-full ${c.status === 'processing' ? 'bg-blue-400 agent-pulse' : c.status === 'done' ? 'bg-emerald-400' : c.status === 'failed' ? 'bg-red-400' : 'bg-neutral-600'}`} />
                  <span className="text-xs font-medium">{LABELS[a]}</span>
                </div>
                <p className="text-[11px] text-neutral-500 truncate">{c.status === 'processing' ? 'working…' : c.headline ?? c.status}</p>
              </div>
            );
          })}
        </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-auto df-scroll px-6 pb-2">
          {inChildRoom && activeProjection ? (
            <div className="max-w-3xl mx-auto w-full space-y-3">
              <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
                <p className="text-[10px] uppercase tracking-widest text-indigo-300/80 mb-1">What-if · {activeRoom}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-300">
                  <span className="font-semibold tabular-nums">{activeProjection.projected_irr_pct.toFixed(1)}% IRR</span>
                  <span>risk <span className={riskColor[activeProjection.residual_risk]}>{activeProjection.residual_risk}</span></span>
                  <span>close {activeProjection.time_to_close}</span>
                  <span>deal {activeProjection.deal_survival}</span>
                </div>
                <p className="text-xs text-neutral-400 mt-2">{activeProjection.rationale}</p>
              </div>
              {(activeProjection.transcript ?? []).map((t, i) => (
                <div key={i} className="fade-up flex gap-3">
                  <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">{LABELS[t.agent].slice(0, 2)}</div>
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-neutral-200">{LABELS[t.agent]}</span>
                    <div className="mt-0.5 text-sm text-neutral-300 leading-relaxed df-msg"><Markdown>{t.content}</Markdown></div>
                  </div>
                </div>
              ))}
              <div className="flex justify-center pt-1">
                <span className="text-[11px] text-neutral-600 bg-neutral-800/40 rounded-full px-3 py-1">End of simulated branch · choose this path from the memo panel to commit</span>
              </div>
            </div>
          ) : (
          <div className="max-w-3xl mx-auto w-full space-y-3">
          {s.messages.length === 0 && <p className="text-sm text-neutral-600">Waiting for the committee to convene…</p>}
          {s.messages.map((m, i) => (
            m.system || !m.agent ? (
              <div key={i} className="fade-up flex justify-center py-1">
                <span className="text-[11px] text-neutral-500 bg-neutral-800/40 rounded-full px-3 py-1">{m.content}</span>
              </div>
            ) : (
              <div key={i} className="fade-up flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">{LABELS[m.agent].slice(0, 2)}</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-neutral-200">{LABELS[m.agent]}</span>
                  <div className="mt-0.5 text-sm text-neutral-300 leading-relaxed df-msg"><Markdown>{m.content}</Markdown></div>
                </div>
              </div>
            )
          ))}
          {rosterAgents.filter((a) => s.agents[a].status === 'processing').map((a) => (
            <div key={`t-${a}`} className="fade-up flex gap-3 items-center">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-400 shrink-0">{LABELS[a].slice(0, 2)}</div>
              <div className="flex items-center gap-1 px-1 py-1"><span className="text-xs text-neutral-500 mr-1">{LABELS[a]} is analysing</span>{[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-neutral-500 thinking-dot" style={{ animationDelay: `${d * 0.15}s` }} />)}</div>
            </div>
          ))}

          {/* Deal memo — as a file card */}
          {s.recommendation && (
            <div className="fade-up flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">SY</div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-neutral-200">Synthesis</span>
                <div className="mt-0.5 flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-800/60 px-3 py-2.5 max-w-md">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: s.signal === 'green' ? '#0e2a1a' : s.signal === 'yellow' ? '#2a230e' : '#2a0e0e' }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 1.5h5L13 5.5V14a.5.5 0 01-.5.5h-9A.5.5 0 013 14V2a.5.5 0 01.5-.5z" stroke={s.signal === 'green' ? '#22c55e' : s.signal === 'red' ? '#ef4444' : '#f59e0b'} strokeWidth="1.2" /></svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-100">Deal Memo</p>
                    <p className="text-[11px] text-neutral-500 truncate">
                      <span className={s.signal ? signalColor[s.signal] : ''}>{s.signal?.toUpperCase()}</span> · risk {s.compositeScore ?? '—'}/100 · {(s.topFindings ?? []).length} findings{!shownDecision ? ' · decision required' : ` · ${shownDecision}`}
                    </p>
                  </div>
                  <button onClick={viewMemo} title="View" className="text-neutral-400 hover:text-white shrink-0 p-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.2" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" /></svg>
                  </button>
                  <button onClick={downloadMemo} title="Download PDF" className="text-neutral-400 hover:text-white shrink-0 p-1">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1v9m0 0L5 7m3 3l3-3M2 13h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Counterfactual prompt — simulate a path before committing */}
          {s.recommendation && !shownDecision && activeRoom === 'parent' && (
            <div className="fade-up flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">SY</div>
              <div className="min-w-0 flex-1">
                <span className="text-xs font-medium text-neutral-200">Synthesis</span>
                <div className="mt-0.5 text-sm text-neutral-300 leading-relaxed df-msg">Want to see what your decision would lead to? I&apos;ll open a side room and have the team work through each path before you commit.</div>
                <div className="mt-2 flex flex-col gap-2 max-w-md">
                  {(['proceed', 'remediate', 'renegotiate'] as HumanDecision[]).map((br) => (
                    <button key={br} onClick={() => simulate(br)} disabled={!!simBranch} className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/40 px-3 py-2 text-left text-sm text-neutral-200 hover:border-neutral-500 hover:bg-neutral-800/70 disabled:opacity-50">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${SIM_DOT[br]}`} />
                      <span className="flex-1">{SIM_LABEL[br]}</span>
                      <span className="text-[11px] text-neutral-500">{simBranch === br ? 'simulating…' : 'simulate →'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {chatLog.map((m, i) => (
            m.role === 'user' ? (
              <div key={`c-${i}`} className="fade-up flex justify-end">
                <div className="max-w-[80%] rounded-xl px-3 py-2 text-sm leading-relaxed bg-neutral-700 text-neutral-100 rounded-tr-sm">{m.content}</div>
              </div>
            ) : (
              <div key={`c-${i}`} className="fade-up flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-300 shrink-0">{(m.agent ? LABELS[m.agent] : 'Synthesis').slice(0, 2)}</div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-neutral-200">{m.agent ? LABELS[m.agent] : 'Synthesis'}</span>
                  <div className="mt-0.5 text-sm text-neutral-300 leading-relaxed df-msg"><Markdown>{m.content}</Markdown></div>
                </div>
              </div>
            )
          ))}
          {chatBusy && (
            <div className="fade-up flex gap-3 items-center">
              <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center text-[10px] font-semibold text-neutral-400 shrink-0">··</div>
              <div className="flex items-center gap-1 px-1 py-1">{[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-neutral-500 thinking-dot" style={{ animationDelay: `${d * 0.15}s` }} />)}</div>
            </div>
          )}
          </div>
          )}
        </div>

        <div className="px-6 py-3 shrink-0">
          <div className="max-w-3xl mx-auto">
          {inChildRoom ? (
            <button onClick={() => decide(activeRoom as HumanDecision)} disabled={deciding || !!shownDecision} className={`w-full rounded-xl font-medium px-4 py-2.5 text-sm disabled:opacity-50 ${BRANCH_META[activeRoom as HumanDecision].btn}`}>
              {shownDecision ? `Decision recorded: ${shownDecision}` : `Commit this decision — ${BRANCH_META[activeRoom as HumanDecision].label}`}
            </button>
          ) : (
          <div className={`rounded-2xl px-4 py-2.5 flex items-end gap-2 ${deliberating ? 'opacity-60' : ''}`} style={{ background: '#212121' }}>
            <textarea rows={1} value={chatInput} disabled={deliberating} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!deliberating) sendChat(); } }} placeholder={deliberating ? 'The committee is deliberating — you can ask questions once the memo is ready…' : 'Ask the committee about this deal…'} className="flex-1 resize-none bg-transparent text-sm outline-none text-neutral-100 disabled:cursor-not-allowed" style={{ maxHeight: 120 }} />
            <button onClick={sendChat} disabled={!chatInput.trim() || chatBusy || deliberating} className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: '#fff', color: '#1a1a1a' }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 12L12 1M12 1H4M12 1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          )}
          </div>
        </div>
      </div>

      {/* ── Right panel: Activity / Memo tabs ─────────────────────── */}
      {logsOpen ? (
        <aside className="w-96 flex-shrink-0 border-l border-neutral-800 flex flex-col bg-neutral-900/20">
          <div className="flex items-center justify-between px-4 h-12 border-b border-neutral-800">
            <div className="flex items-center gap-3 text-sm">
              <button onClick={() => setRightTab('activity')} className={rightTab === 'activity' ? 'text-white font-medium' : 'text-neutral-500 hover:text-neutral-300'}>Activity {activityCount > 0 && <span className="text-neutral-600">· {activityCount}</span>}</button>
              {s.recommendation && <button onClick={() => setRightTab('memo')} className={rightTab === 'memo' ? 'text-white font-medium' : 'text-neutral-500 hover:text-neutral-300'}>Memo</button>}
            </div>
            <button onClick={() => setLogsOpen(false)} title="Collapse" className="text-neutral-500 hover:text-white text-sm">→</button>
          </div>

          {rightTab === 'memo' && s.recommendation ? (
            <div className="flex-1 overflow-auto df-scroll">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800" style={{ background: s.signal === 'green' ? '#0e2a1a' : s.signal === 'yellow' ? '#2a230e' : '#2a0e0e' }}>
                <div><p className="text-[10px] uppercase tracking-widest text-neutral-500">Deal memo</p><p className={`text-lg font-semibold ${s.signal ? signalColor[s.signal] : ''}`}>{s.signal?.toUpperCase()}</p></div>
                <div className="flex items-center gap-3">
                  <div className="text-right"><p className="text-[10px] uppercase tracking-widest text-neutral-500">Risk</p><p className="text-lg font-semibold">{s.compositeScore ?? '—'}<span className="text-xs text-neutral-500">/100</span></p></div>
                  <button onClick={downloadMemo} title="Download PDF" className="text-xs border border-neutral-700 rounded-lg px-2.5 py-1.5 hover:text-white hover:border-neutral-500">↓ PDF</button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-sm text-neutral-300 leading-relaxed">{s.recommendation}</p>
                {s.topFindings && s.topFindings.length > 0 && (
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-neutral-600 mb-1.5">Top findings</p>
                    <ul className="space-y-1.5">{s.topFindings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm"><span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded shrink-0 h-fit ${f.severity === 'critical' ? 'bg-red-500/20 text-red-400' : f.severity === 'material' ? 'bg-amber-500/20 text-amber-400' : 'bg-neutral-700/40 text-neutral-400'}`}>{f.severity}</span><span className="text-neutral-300"><span className="font-medium text-neutral-200">{f.title}.</span> {f.detail}</span></li>
                    ))}</ul>
                  </div>
                )}
                {s.conditions && s.conditions.length > 0 && (
                  <div><p className="text-[11px] uppercase tracking-widest text-neutral-600 mb-1.5">Conditions precedent</p><ul className="space-y-1">{s.conditions.map((c, i) => <li key={i} className="flex gap-2 text-sm text-neutral-300"><span className="text-neutral-600">☐</span> {c}</li>)}</ul></div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-neutral-800">
                {shownDecision ? (
                  <>
                    <p className="text-sm"><span className="text-neutral-500">Reviewer decision:</span> <span className="text-white font-semibold capitalize">{shownDecision}</span></p>
                    {s.decisionDocument ? (
                      <div className="mt-3 rounded-lg bg-neutral-800/40 p-3"><p className="text-[11px] uppercase tracking-widest text-neutral-500 mb-1">Generated document</p><div className="text-sm text-neutral-300"><Markdown>{s.decisionDocument}</Markdown></div></div>
                    ) : ns ? (
                      <div className="mt-3 rounded-lg bg-neutral-800/40 p-3"><p className="text-[11px] uppercase tracking-widest text-neutral-500 mb-1">{ns.heading}</p><p className="text-xs text-neutral-400 mb-2">{ns.intro}</p><ul className="space-y-1">{ns.items.length === 0 ? <li className="text-sm text-neutral-500">None.</li> : ns.items.map((it, i) => <li key={i} className="flex gap-2 text-sm text-neutral-300"><span className="text-neutral-600">•</span> {it}</li>)}</ul></div>
                    ) : null}
                  </>
                ) : challenge ? (
                  <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
                    <p className="text-sm text-amber-200 mb-3">⚠ {challenge.message}</p>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => decide(challenge.decision, true)} disabled={deciding} className="rounded-lg bg-red-500/90 text-white font-medium px-4 py-2 hover:bg-red-500 disabled:opacity-50">Confirm anyway (override)</button>
                      <button onClick={() => { setDismissedChallenge(true); setLocalChallenge(null); }} disabled={deciding} className="rounded-lg border border-neutral-600 text-neutral-200 font-medium px-4 py-2 hover:border-neutral-400">Reconsider</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-neutral-500">Reviewer decision required — the memo is held until you decide. Open a path from the chat to simulate its outcome in a side room, then commit it from there.</p>
                    {decideError && <p className="mt-2 text-xs text-red-400">Could not record decision: {decideError}</p>}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto df-scroll p-4 space-y-3">
              {s.delegations.map((d) => (
                <div key={d.id} className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-indigo-300 font-medium">⇄ Delegated task</p>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${d.status === 'done' ? 'bg-emerald-500/20 text-emerald-400' : d.status === 'processing' ? 'bg-amber-500/20 text-amber-400 agent-pulse' : 'bg-neutral-700/40 text-neutral-400'}`}>{d.status}</span>
                  </div>
                  <p className="text-neutral-300">{LABELS[d.from]} → {LABELS[d.to]}: {d.intent}</p>
                  <p className="text-neutral-500 mt-1">Authority: {d.authority}</p>
                </div>
              ))}
              {s.cascade && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"><p className="text-amber-300 font-medium mb-0.5">↻ Cascading recalculation</p>IRR <span className="text-neutral-400 line-through">{s.cascade.irr_before.toFixed(1)}%</span> <span className="text-white font-semibold">→ {s.cascade.irr_after.toFixed(1)}%</span><p className="text-neutral-500 mt-1">Triggered by {s.cascade.trigger}</p></div>
              )}
              {s.contradictions.map((c, i) => (
                <div key={i} className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs"><p className="text-red-300 font-semibold mb-0.5">⚠ Contradiction</p><p className="text-neutral-300">{c.title}</p><p className="text-neutral-500 mt-1">{c.detail}</p><p className="text-neutral-600 mt-1">{c.agents.map((a) => LABELS[a]).join(' vs ')}</p></div>
              ))}
              {s.recruited.map((r, i) => (
                <div key={`r-${i}`} className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs">
                  <p className="text-blue-300 font-medium mb-0.5">🤝 Recruited {LABELS[r.agent]}</p>
                  <p className="text-neutral-400">{LABELS[r.by]} pulled a specialist into the room — {r.reason}</p>
                </div>
              ))}
              {s.missingDocs.length > 0 && <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">Missing documents: {s.missingDocs.join(', ')}</div>}
              {s.status === 'failed' && <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">Workflow failed{s.failureReason ? `: ${s.failureReason}` : ''}</div>}
              {s.bandRoomId && (
                <div className="rounded-lg border border-neutral-700/60 bg-neutral-800/30 px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="text-neutral-300 font-medium">Band room</p>
                    <button onClick={verifyBand} disabled={bandBusy} className="text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-50">{bandBusy ? 'checking…' : '↻ verify live'}</button>
                  </div>
                  {bandCheck ? (
                    <p className="text-neutral-500 mt-1">Context preserved in Band: <span className="text-neutral-300">{bandCheck.message_count} messages</span> across {bandCheck.participants_polled} participants — survives restarts &amp; rejoins.</p>
                  ) : (
                    <p className="text-neutral-600 mt-1">Reconstruct this room straight from Band to confirm it&apos;s the source of truth.</p>
                  )}
                </div>
              )}
              <div className="pt-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-600 mb-2">Audit trail</p>
                {!audit || audit.length === 0 ? <p className="text-xs text-neutral-600">No events yet.</p> : (
                  <ol className="space-y-1.5">{audit.filter((e) => !e.event_type.startsWith('chat.')).map((e) => (<li key={e.id} className="text-[11px] flex gap-2"><span className="text-neutral-600 tabular-nums shrink-0">{new Date(e.created_at).toLocaleTimeString()}</span><span className="text-neutral-400">{e.event_type}</span>{e.agent_type && <span className="text-neutral-600">· {e.agent_type}</span>}</li>))}</ol>
                )}
              </div>
            </div>
          )}
        </aside>
      ) : (
        <button onClick={() => setLogsOpen(true)} title="Show panel" className="w-10 flex-shrink-0 border-l border-neutral-800 flex flex-col items-center pt-4 gap-2 text-neutral-500 hover:text-white">
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
