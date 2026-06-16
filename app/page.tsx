'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import { agentAvatar } from '@/lib/agents/avatars';
import type { AgentType } from '@/types';

const brico = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

const PY = new Set<AgentType>(['environmental', 'capex', 'insurance']);
const HUB = { cx: 600, cy: 272, s: 92 };

interface Agent { id: AgentType; name: string; x: number; y: number; side: 'l' | 'r'; sy: number; mx: number; intro: string }
const AGENTS: Agent[] = [
  { id: 'archivist', name: 'Archivist', x: 300, y: 116, side: 'l', sy: 248, mx: 442, intro: 'I read the deal package and pull out the facts — ownership, encumbrances, and anything missing.' },
  { id: 'regulatory', name: 'Regulatory', x: 168, y: 236, side: 'l', sy: 262, mx: 398, intro: 'I check zoning, permits, flood and environmental flags against the property facts.' },
  { id: 'legal', name: 'Legal Risk', x: 168, y: 396, side: 'l', sy: 282, mx: 398, intro: 'I review title and the contract — easement conflicts, liens, and seller representations.' },
  { id: 'financial', name: 'Financial', x: 322, y: 460, side: 'l', sy: 296, mx: 462, intro: 'I underwrite the deal: NOI, DSCR, and a deterministic five-year IRR.' },
  { id: 'synthesis', name: 'Synthesis', x: 900, y: 116, side: 'r', sy: 248, mx: 758, intro: 'I’m the Deal Director. I weigh every finding into a Red, Yellow or Green memo.' },
  { id: 'environmental', name: 'Environmental', x: 1032, y: 236, side: 'r', sy: 262, mx: 802, intro: 'I model contamination risk and remediation cost with Monte-Carlo, and call the Phase I.' },
  { id: 'capex', name: 'CapEx', x: 1032, y: 396, side: 'r', sy: 282, mx: 802, intro: 'I simulate renovation and conversion cost, with schedule-overrun risk.' },
  { id: 'insurance', name: 'Insurance', x: 878, y: 460, side: 'r', sy: 296, mx: 738, intro: 'I estimate flood, wind and seismic exposure, and the insurance premium.' },
];

function orth(sx: number, sy: number, ex: number, ey: number, mx: number, r = 14): string {
  const v = ey > sy ? 1 : -1, h1 = mx > sx ? 1 : -1, h2 = ex > mx ? 1 : -1;
  return `M ${sx} ${sy} L ${mx - h1 * r} ${sy} Q ${mx} ${sy} ${mx} ${sy + v * r} L ${mx} ${ey - v * r} Q ${mx} ${ey} ${mx + h2 * r} ${ey} L ${ex} ${ey}`;
}
const BG = [[120, 90], [210, 150], [95, 230], [300, 70], [1080, 90], [990, 150], [1110, 230], [900, 70], [60, 360], [1140, 360], [400, 40], [800, 40]] as const;
const conns = AGENTS.map((a) => {
  const sx = a.side === 'l' ? HUB.cx - HUB.s / 2 : HUB.cx + HUB.s / 2;
  const ex = a.side === 'l' ? a.x + 32 : a.x - 32;
  return { id: a.id, d: orth(sx, a.sy, ex, a.y, a.mx), pulse: PY.has(a.id) ? '#4ade80' : '#5e9bff' };
});

export default function Landing() {
  const [sel, setSel] = useState<AgentType | null>(null);
  const [typed, setTyped] = useState(0);
  const hubRef = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const active = AGENTS.find((a) => a.id === sel) ?? null;

  // Typewriter for the selected agent's introduction.
  useEffect(() => {
    if (!sel) return;
    const text = AGENTS.find((a) => a.id === sel)!.intro;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyped(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setTyped(i); if (i >= text.length) clearInterval(id); }, 20);
    return () => clearInterval(id);
  }, [sel]);

  // The Band mascot's eyes follow the cursor.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const hub = hubRef.current, eyes = eyesRef.current;
      if (!hub || !eyes) return;
      const r = hub.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = 13;
      dx = (dx / d) * m; dy = (dy / d) * m;
      eyes.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className={`relative h-full overflow-hidden flex flex-col items-center px-8 ${brico.className}`} style={{ background: 'radial-gradient(130% 95% at 50% 30%, #101216 0%, #060708 52%, #000 100%)' }}>
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 85% at 50% 42%, #000 35%, transparent 82%)', WebkitMaskImage: 'radial-gradient(120% 85% at 50% 42%, #000 35%, transparent 82%)' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(80% 60% at 50% 55%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />

      {/* hero text */}
      <div className="relative z-10 text-center" style={{ marginTop: '7vh' }}>
        <p className="text-[12.5px] font-semibold tracking-[0.22em] uppercase mb-5" style={{ color: '#3ee08a' }}>AI due diligence · by committee</p>
        <h1 className="font-semibold" style={{ fontSize: 56, lineHeight: 1.03, letterSpacing: '-0.035em', color: '#fafafa' }}>Eight minds. One verdict.</h1>
        <p className="mt-5 mx-auto text-[16.5px] leading-relaxed" style={{ color: '#9aa0aa', maxWidth: 560 }}>
          Specialist AI agents read every deal, challenge each other, and reach a decision you can defend — coordinated through Band.
        </p>
        <Link href="/deals/new" className="group inline-flex items-center gap-2.5 rounded-full mt-8 pl-7 pr-6 py-4 text-[15px] font-semibold transition-transform hover:scale-[1.04]" style={{ background: 'linear-gradient(180deg,#56e58b,#23c069)', color: '#04130a', boxShadow: '0 0 44px rgba(53,210,119,0.5), 0 10px 36px rgba(0,0,0,0.5)' }}>
          Dive in
          <span className="flex items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5" style={{ width: 24, height: 24, background: '#04130a' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6h8.5M6 1.5L10 6l-4 4.5" stroke="#56e58b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </Link>
        <p className="mt-4 text-[12px]" style={{ color: '#5b6068' }}>Click an agent to meet it.</p>
      </div>

      {/* illustration */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center min-h-0 mt-1">
        <div className="w-full" style={{ maxWidth: 1120, aspectRatio: '1200 / 540' }}>
          <svg viewBox="0 0 1200 540" preserveAspectRatio="xMidYMid meet" className="w-full h-full">
            <defs>
              <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#35d277" stopOpacity="0.5" />
                <stop offset="38%" stopColor="#35d277" stopOpacity="0.12" />
                <stop offset="100%" stopColor="#35d277" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="band-body" x1="0.1" y1="0.05" x2="0.9" y2="1">
                <stop offset="0" stopColor="#6BEC97" /><stop offset="0.55" stopColor="#33D277" /><stop offset="1" stopColor="#15B455" />
              </linearGradient>
            </defs>

            {/* click-away */}
            <rect x="0" y="0" width="1200" height="540" fill="transparent" onClick={() => setSel(null)} />

            {/* constellation */}
            <g opacity="0.45">
              {BG.map(([x, y], i) => { const [nx, ny] = BG[(i + 1) % BG.length]; return <line key={`l${i}`} x1={x} y1={y} x2={nx} y2={ny} stroke="#171717" strokeWidth="1" />; })}
              {BG.map(([x, y], i) => <rect key={`s${i}`} x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill="none" stroke="#262626" />)}
            </g>

            {/* connectors + pulses (Band → agents) */}
            {conns.map((c, i) => <path key={`c${i}`} id={`conn-${i}`} d={c.d} fill="none" stroke="#272727" strokeWidth="1.4" />)}
            {conns.map((c, i) => {
              const dur = 2.6 + (i % 3) * 0.5;
              return (
                <circle key={`p${i}`} r="3" fill={c.pulse}>
                  <animateMotion dur={`${dur}s`} begin={`${i * 0.35}s`} repeatCount="indefinite"><mpath href={`#conn-${i}`} /></animateMotion>
                  <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${dur}s`} begin={`${i * 0.35}s`} repeatCount="indefinite" />
                </circle>
              );
            })}

            {/* hub glow + Band mascot (eyes follow cursor) */}
            <circle cx={HUB.cx} cy={HUB.cy} r="190" fill="url(#hubGlow)"><animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" /></circle>
            <svg ref={hubRef} x={HUB.cx - HUB.s / 2} y={HUB.cy - HUB.s / 2} width={HUB.s} height={HUB.s} viewBox="0 0 288 288">
              <ellipse cx="146" cy="262" rx="76" ry="11" fill="#0B1A26" opacity="0.5" />
              <circle cx="144" cy="134" r="128" fill="#0B1A26" />
              <circle cx="144" cy="134" r="119" fill="url(#band-body)" />
              <circle cx="148" cy="148" r="86" fill="#0B1A26" />
              <g ref={eyesRef} style={{ transition: 'transform 0.12s ease-out' }}>
                <ellipse cx="122" cy="132" rx="13.5" ry="24" fill="#3FE0FF" />
                <ellipse cx="174" cy="132" rx="13.5" ry="24" fill="#3FE0FF" />
              </g>
            </svg>

            {/* agent tiles */}
            {AGENTS.map((a) => (
              <g key={a.id} onClick={(e) => { e.stopPropagation(); setSel((s) => (s === a.id ? null : a.id)); }} style={{ cursor: 'pointer' }}>
                <rect x={a.x - 32} y={a.y - 32} width="64" height="64" rx="16" fill="#0b0b0c" stroke={sel === a.id ? '#ffffff' : '#242424'} strokeWidth={sel === a.id ? 1.8 : 1} />
                <image href={agentAvatar(a.id)} x={a.x - 26} y={a.y - 26} width="52" height="52" preserveAspectRatio="xMidYMid meet" style={{ pointerEvents: 'none' }} />
              </g>
            ))}

            {/* intro bubble (typewriter) */}
            {active && (() => {
              const below = active.y < 175;
              const bw = 250, bh = 120;
              const bx = Math.min(Math.max(active.x - bw / 2, 8), 1200 - bw - 8);
              const by = below ? active.y + 44 : active.y - bh - 40;
              return (
                <foreignObject x={bx} y={by} width={bw} height={bh}>
                  <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', background: '#15161a', border: '1px solid #2a2c34', borderRadius: 14, padding: '11px 14px', boxShadow: '0 14px 34px rgba(0,0,0,0.55)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: PY.has(active.id) ? '#86efac' : '#93c5fd', marginBottom: 5 }}>{active.name.toUpperCase()}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.42, color: '#d6d8de' }}>{active.intro.slice(0, typed)}<span className="animate-pulse" style={{ color: '#86efac' }}>▌</span></div>
                  </div>
                </foreignObject>
              );
            })()}
          </svg>
        </div>
      </div>

      {/* made by Frooxi */}
      <div className="relative z-10 mb-4 flex items-center gap-2 text-[12px]" style={{ color: '#5b6068' }}>
        made by
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/frooxi-logo.png" alt="Frooxi" style={{ height: 15, width: 'auto', opacity: 0.8 }} />
      </div>
    </div>
  );
}
