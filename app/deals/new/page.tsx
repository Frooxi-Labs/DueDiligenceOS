'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Msg {
  role: 'user' | 'system';
  content: string;
  fileNames?: string[];
}

const STEPS = [
  { key: 'extract', label: 'Reading the deal package…' },
  { key: 'brief', label: 'Building the deal brief…' },
  { key: 'agents', label: 'Convening the committee…' },
];

const SAMPLE_TEXT = `Riverside Medical Plaza — mixed-use medical/retail, Austin TX. Purchase price $28.5M, 65% LTV at 6.5%, 7-year hold.

TITLE DEED: fee simple absolute; title record shows NO recorded easements.
ZONING: parcel zoned R-3 (residential, low-density) — medical/retail use is NOT permitted under R-3.
INSPECTION: built 2009, roof replaced 2021, 9 occupied units, good condition.
SELLER DISCLOSURE: no known environmental issues; not in a FEMA flood zone.
PURCHASE CONTRACT §4: references a recorded ACCESS EASEMENT for the adjoining parcel. No survey attached.`;

function StackedPills({ current }: { current: string }) {
  const idx = STEPS.findIndex((s) => s.key === current);
  const shown = STEPS.slice(0, idx + 1);
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ minHeight: 240 }}>
      <div className="relative" style={{ width: 280, height: 56 + (shown.length - 1) * 6 }}>
        {shown.map((step, i) => {
          const depth = shown.length - 1 - i;
          const active = depth === 0;
          return (
            <div key={step.key} className="absolute inset-x-0 transition-all duration-500"
              style={{ top: i * 6, transform: `scale(${1 - depth * 0.04})`, transformOrigin: 'top center', opacity: active ? 1 : depth === 1 ? 0.5 : 0.25, filter: active ? undefined : `blur(${depth}px)`, zIndex: i }}>
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-2xl text-[13px] font-medium"
                style={{ background: active ? '#1c1c1c' : '#181818', border: `1px solid ${active ? '#333' : '#222'}`, color: active ? '#c9c8c5' : '#555' }}>
                {active && (
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full thinking-dot" style={{ background: '#666', animationDelay: `${d * 0.18}s` }} />)}
                  </span>
                )}
                {step.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function NewDealPage() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!input && taRef.current) taRef.current.style.height = 'auto';
  }, [input]);

  async function send() {
    const text = input.trim();
    if ((!text && files.length === 0) || busy) return;

    setMsgs((p) => [...p, { role: 'user', content: text || '(documents attached)', fileNames: files.map((f) => f.name) }]);
    const sentFiles = files;
    setInput('');
    setFiles([]);
    if (fileRef.current) fileRef.current.value = '';
    setBusy(true);
    setStep('extract');

    try {
      const fd = new FormData();
      fd.append('message', text);
      for (const f of sentFiles) fd.append('files', f);

      const exRes = await fetch('/api/deals/extract', { method: 'POST', body: fd });
      const ex = await exRes.json();
      if (!exRes.ok || ex.error) {
        setMsgs((p) => [...p, { role: 'system', content: ex.error ?? 'Could not read the deal. Add more detail.' }]);
        setBusy(false);
        setStep('');
        return;
      }

      setStep('brief');
      await new Promise((r) => setTimeout(r, 400));
      setStep('agents');

      const createRes = await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ex.dealData) });
      const created = await createRes.json();
      if (!createRes.ok || !created.id) {
        setMsgs((p) => [...p, { role: 'system', content: `Failed to start: ${created.error ?? 'unknown error'}` }]);
        setBusy(false);
        setStep('');
        return;
      }
      router.push(`/deals/${created.id}`);
    } catch {
      setMsgs((p) => [...p, { role: 'system', content: 'Something went wrong. Please try again.' }]);
      setBusy(false);
      setStep('');
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }
  function autoResize(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 180)}px`;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="flex items-center gap-3 h-12 px-5 flex-shrink-0">
        <div className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold" style={{ background: '#1a3a5c', color: '#2383e2' }}>DD</div>
        <span className="text-[13px] font-medium" style={{ color: '#9b9a97' }}>New due-diligence run</span>
      </div>

      <div className="flex-1 relative min-h-0">
        {busy && step ? (
          <StackedPills current={step} />
        ) : msgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: '#3a3a3a' }}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect x="4" y="4" width="24" height="24" rx="6" stroke="#2d2d2d" strokeWidth="1.5" />
              <path d="M10 16h12M10 11h12M10 21h7" stroke="#2d2d2d" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[13px]">Describe the deal or attach the documents to begin</p>
            <button onClick={() => setInput(SAMPLE_TEXT)} className="text-[12px] border border-neutral-800 rounded-md px-3 py-1.5 hover:text-white">Load sample</button>
          </div>
        ) : (
          <div className="absolute inset-0 overflow-y-auto df-scroll">
            <div className="space-y-4" style={{ width: '72%', margin: '0 auto', paddingTop: '1rem', paddingBottom: '1.5rem' }}>
              {msgs.map((m, i) => (
                <div key={i} className={`fade-up flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {m.fileNames && m.fileNames.length > 0 && (
                    <div className="mb-1 flex flex-wrap gap-1 justify-end">
                      {m.fileNames.map((n) => (
                        <span key={n} className="text-[11px] px-2 py-1 rounded-lg" style={{ background: '#2d2d2d', color: '#9b9a97' }}>📄 {n}</span>
                      ))}
                    </div>
                  )}
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed"
                    style={m.role === 'user' ? { background: '#2d2d2d', color: '#e8e8e6' } : { background: '#3a1c1c', color: '#f0a0a0' }}>
                    {m.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 overflow-hidden transition-all duration-500" style={{ maxHeight: busy ? 0 : 600, opacity: busy ? 0 : 1 }}>
        <div style={{ padding: '4px 14% 24px' }}>
          {files.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              {files.map((f, i) => (
                <span key={i} className="flex items-center gap-1 text-[12px] px-2 py-1 rounded-lg" style={{ background: '#1c1c1c', border: '1px solid #2d2d2d', color: '#9b9a97' }}>
                  📄 {f.name}
                  <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ color: '#555' }}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="rounded-2xl px-4 py-3" style={{ background: '#212121' }}>
            <textarea ref={taRef} rows={1} value={input} onChange={autoResize} onKeyDown={onKeyDown}
              placeholder="Describe the deal — price, use, financing… or attach the documents"
              className="w-full resize-none bg-transparent text-[14px] leading-6 outline-none" style={{ maxHeight: 180, overflowY: 'auto', color: '#e8e8e6' }} />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md p-1.5" style={{ color: '#787774' }} title="Attach documents">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 10V12a1 1 0 001 1h8a1 1 0 001-1v-2M8 2v8M5 5l3-3 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.txt,.md,.csv,text/*"
                  onChange={(e) => setFiles((p) => [...p, ...Array.from(e.target.files ?? [])])} />
                <span className="text-[11px]" style={{ color: '#444' }}>PDF · TXT · MD</span>
              </div>
              <button onClick={send} disabled={!input.trim() && files.length === 0}
                className="w-7 h-7 rounded-full flex items-center justify-center disabled:opacity-30" style={{ background: '#fff', color: '#1a1a1a' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 12L12 1M12 1H4M12 1V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
