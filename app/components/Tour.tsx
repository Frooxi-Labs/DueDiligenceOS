'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * First-run guided tour. Renders only on the dashboard. Auto-starts once per
 * browser (persisted in localStorage) and can be replayed from the floating
 * "Tour" button. Dependency-free: a dimmed overlay with a moving spotlight and
 * a positioned tooltip card.
 */

const TOUR_KEY = 'ddos.tour.v1';
const ACCENT = '#2383e2';

type Step = {
  /** data-tour attribute of the element to highlight; omit for a centered step. */
  target?: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    title: 'Welcome to DueDiligenceOS',
    body: 'A committee of AI agents that runs real-estate due diligence end to end — coordinated through Band. Here’s a 30-second tour.',
  },
  {
    target: 'new-run',
    title: 'Start a run',
    body: 'Paste or upload a deal package — title deed, contract, inspection, disclosures — and the committee spins up automatically.',
  },
  {
    target: 'committee',
    title: 'The committee',
    body: 'Five specialist agents handle intake, regulatory, legal, financial and synthesis — and they recruit Python quantitative specialists when a deal needs them.',
  },
  {
    target: 'how',
    title: 'How they work',
    body: 'Agents read each other through Band, reconcile contradictions, delegate tasks, then hand you a Red / Yellow / Green memo with conditions.',
  },
  {
    target: 'sidebar',
    title: 'Your workspace',
    body: 'Every run lives here. Open one to watch the live room, inspect the audit trail, and simulate counterfactual decisions.',
  },
  {
    title: 'You’re set',
    body: 'Start your first run and watch the committee deliberate in real time.',
  },
];

interface Rect { top: number; left: number; width: number; height: number }

function targetRect(target?: string): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function Tour() {
  const pathname = usePathname();
  const router = useRouter();
  const onDashboard = pathname === '/';

  const [active, setActive] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const step = STEPS[i];

  // Auto-start once per browser, on the dashboard, after it paints.
  useEffect(() => {
    if (!onDashboard) return;
    let seen = false;
    try { seen = localStorage.getItem(TOUR_KEY) === 'done'; } catch { /* ignore */ }
    if (seen) return;
    const t = setTimeout(() => { setI(0); setActive(true); }, 450);
    return () => clearTimeout(t);
  }, [onDashboard]);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(TOUR_KEY, 'done'); } catch { /* ignore */ }
  }, []);

  // Track the highlighted element's position (and keep it fresh on resize/scroll).
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => setRect(targetRect(step.target));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active, step.target, i]);

  // Position the tooltip card relative to the spotlight (or centered).
  useLayoutEffect(() => {
    if (!active) return;
    const cardEl = cardRef.current;
    const cw = cardEl?.offsetWidth ?? 340;
    const ch = cardEl?.offsetHeight ?? 170;
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
    if (below + ch <= vh) {            // below
      top = below; left = rect.left;
    } else if (above >= 0) {           // above
      top = above; left = rect.left;
    } else if (right + cw <= vw) {     // right (e.g. sidebar)
      left = right; top = rect.top;
    } else {                           // left
      left = rect.left - cw - gap; top = rect.top;
    }
    top = Math.max(16, Math.min(top, vh - ch - 16));
    left = Math.max(16, Math.min(left, vw - cw - 16));
    setCard({ top: Math.round(top), left: Math.round(left) });
  }, [active, rect, i]);

  const next = useCallback(() => {
    if (i >= STEPS.length - 1) { finish(); return; }
    setI((n) => n + 1);
  }, [i, finish]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  // Keyboard: Esc to skip, arrows / Enter to navigate.
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

  if (!onDashboard) return null;

  if (!active) {
    return (
      <button
        onClick={start}
        aria-label="Take the product tour"
        className="fixed bottom-5 right-5 z-[9998] flex items-center gap-2 rounded-full px-4 py-2.5 text-[12px] font-medium shadow-lg transition-transform hover:scale-105"
        style={{ background: '#1c1c1c', border: '1px solid #2d2d2d', color: '#e8e8e6' }}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: ACCENT, color: '#fff' }}>?</span>
        Take the tour
      </button>
    );
  }

  const pad = 8;
  const spotlight = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  return (
    <div className="fixed inset-0 z-[9999]" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
      {/* Click-catcher: blocks interaction with the app underneath. Dims the
          whole screen on centered steps; the spotlight provides the dim otherwise. */}
      <div className="absolute inset-0" style={{ background: spotlight ? 'transparent' : 'rgba(2,2,2,0.74)', transition: 'background 0.2s' }} onClick={finish} />

      {/* Spotlight hole — dim comes from the giant box-shadow around it. */}
      {spotlight && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(2,2,2,0.74)',
            border: `1.5px solid ${ACCENT}`,
            transition: 'all 0.28s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={cardRef}
        className="absolute rounded-2xl p-5 shadow-2xl"
        style={{ top: card.top, left: card.left, width: 340, background: '#1c1c1c', border: '1px solid #2d2d2d', color: '#e8e8e6', transition: 'top 0.28s cubic-bezier(0.4,0,0.2,1), left 0.28s cubic-bezier(0.4,0,0.2,1)' }}
      >
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: ACCENT }}>
            Step {i + 1} of {STEPS.length}
          </span>
          <button onClick={finish} className="text-[11px]" style={{ color: '#777' }}>Skip</button>
        </div>
        <h3 className="text-[15px] font-semibold mb-1.5">{step.title}</h3>
        <p className="text-[13px] leading-relaxed mb-4" style={{ color: '#9b9a97' }}>{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((_, n) => (
            <span key={n} className="h-1.5 rounded-full transition-all" style={{ width: n === i ? 18 : 6, background: n === i ? ACCENT : '#3a3a3a' }} />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={back}
            disabled={i === 0}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg disabled:opacity-30"
            style={{ color: '#e8e8e6', border: '1px solid #2d2d2d' }}
          >
            Back
          </button>
          {i === STEPS.length - 1 ? (
            <button
              onClick={() => { finish(); router.push('/deals/new'); }}
              className="text-[12px] font-semibold px-4 py-1.5 rounded-lg"
              style={{ background: ACCENT, color: '#fff' }}
            >
              Start a run →
            </button>
          ) : (
            <button onClick={next} className="text-[12px] font-semibold px-4 py-1.5 rounded-lg" style={{ background: ACCENT, color: '#fff' }}>
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
