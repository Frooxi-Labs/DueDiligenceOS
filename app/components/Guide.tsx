'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Reusable spotlight guide. Dependency-free: a dimmed overlay with a moving
 * spotlight cut-out and a positioned tooltip card. Shows once per `storageKey`
 * (persisted in localStorage); optionally re-playable from a floating button.
 *
 * Drives three different onboarding moments from one component: the dashboard
 * tour, the first-run help on /deals/new, and the memo → simulation hint on a
 * deal page. Each just supplies its own steps, key, and a `trigger`.
 */

const ACCENT = '#2383e2';

export interface GuideStep {
  /** data-tour attribute of the element to highlight; omit for a centered step. */
  target?: string;
  title: string;
  body: string;
}

interface GuideProps {
  storageKey: string;
  steps: GuideStep[];
  /** When this becomes true (and the guide hasn't been seen) it auto-starts. */
  trigger?: boolean;
  startDelayMs?: number;
  /** Show a floating "replay" button while idle. */
  replay?: boolean;
  replayLabel?: string;
  /** Label + action for the primary button on the final step. */
  finalLabel?: string;
  onFinal?: () => void;
}

interface Rect { top: number; left: number; width: number; height: number }

function targetRect(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function Guide({
  storageKey,
  steps,
  trigger = false,
  startDelayMs = 400,
  replay = false,
  replayLabel = 'Take the tour',
  finalLabel = 'Done',
  onFinal,
}: GuideProps) {
  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [card, setCard] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[i];

  // Auto-start once, when triggered and not previously seen.
  useEffect(() => {
    if (!trigger) return;
    let seen = false;
    try { seen = localStorage.getItem(storageKey) === 'done'; } catch { /* ignore */ }
    if (seen) return;
    const t = setTimeout(() => { setI(0); setActive(true); }, startDelayMs);
    return () => clearTimeout(t);
  }, [trigger, storageKey, startDelayMs]);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(storageKey, 'done'); } catch { /* ignore */ }
  }, [storageKey]);

  // Track the highlighted element across resize / scroll / step change. We scroll
  // the target into view first (so the spotlight is never off-screen) and
  // re-measure a couple of times once layout settles — fixing mis-anchored cards.
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => setRect(targetRect(step?.target));
    if (step?.target) {
      document.querySelector(`[data-tour="${step.target}"]`)?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    }
    measure();
    const t1 = setTimeout(measure, 130);
    const t2 = setTimeout(measure, 380);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, step?.target, i]);

  // Position the tooltip near the spotlight (or centered when there's no target).
  useLayoutEffect(() => {
    if (!active) return;
    const el = cardRef.current;
    const cw = el?.offsetWidth ?? 340;
    const ch = el?.offsetHeight ?? 170;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;
    if (!rect) {
      setCard({ top: Math.round((vh - ch) / 2), left: Math.round((vw - cw) / 2) });
      return;
    }
    const below = rect.top + rect.height + gap;
    const above = rect.top - ch - gap;
    const right = rect.left + rect.width + gap;
    let top: number, left: number;
    if (below + ch <= vh) { top = below; left = rect.left; }
    else if (above >= 0) { top = above; left = rect.left; }
    else if (right + cw <= vw) { left = right; top = rect.top; }
    else { left = rect.left - cw - gap; top = rect.top; }
    top = Math.max(16, Math.min(top, vh - ch - 16));
    left = Math.max(16, Math.min(left, vw - cw - 16));
    setCard({ top: Math.round(top), left: Math.round(left) });
  }, [active, rect, i]);

  const last = i >= steps.length - 1;
  const next = useCallback(() => {
    if (last) { finish(); onFinal?.(); return; }
    setI((n) => n + 1);
  }, [last, finish, onFinal]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, finish, next, back]);

  const start = () => { setI(0); setActive(true); };

  if (!active) {
    return replay ? (
      <button
        onClick={start}
        aria-label={replayLabel}
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-medium shadow-lg transition-transform hover:scale-105"
        style={{ background: '#1c1c1c', border: '1px solid #2d2d2d', color: '#e8e8e6' }}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: ACCENT, color: '#fff' }}>?</span>
        {replayLabel}
      </button>
    ) : null;
  }

  const pad = 8;
  const spot = rect ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      <div className="absolute inset-0" style={{ background: spot ? 'transparent' : 'rgba(2,2,2,0.74)', transition: 'background 0.2s' }} onClick={finish} />

      {spot && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: spot.top, left: spot.left, width: spot.width, height: spot.height,
            borderRadius: 14, boxShadow: '0 0 0 9999px rgba(2,2,2,0.74)',
            border: `1.5px solid ${ACCENT}`, transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      )}

      <div
        ref={cardRef}
        className="absolute rounded-2xl p-5 shadow-2xl"
        style={{ top: card.top, left: card.left, width: 340, background: '#1c1c1c', border: '1px solid #2d2d2d', color: '#e8e8e6', transition: 'top 0.28s cubic-bezier(0.4,0,0.2,1), left 0.28s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
            {steps.length > 1 ? `Step ${i + 1} of ${steps.length}` : 'Tip'}
          </span>
          <button onClick={finish} className="text-[11px]" style={{ color: '#777' }}>Skip</button>
        </div>
        <h3 className="text-[15px] font-semibold mb-1.5">{step.title}</h3>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#9b9a97' }}>{step.body}</p>

        {steps.length > 1 && (
          <div className="flex items-center gap-1.5 mb-4">
            {steps.map((_, n) => (
              <span key={n} className="h-1.5 rounded-full transition-all" style={{ width: n === i ? 18 : 6, background: n === i ? ACCENT : '#3a3a3a' }} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          <button onClick={back} disabled={i === 0} className="text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ color: '#e8e8e6', border: '1px solid #2d2d2d' }}>
            Back
          </button>
          <button onClick={next} className="text-[12px] font-semibold px-4 py-1.5 rounded-lg" style={{ background: ACCENT, color: '#fff' }}>
            {last ? finalLabel : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
