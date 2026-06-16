'use client';

import { useState } from 'react';

/**
 * Live committee map. The Band hub sits at the centre with the eight agents
 * orbiting it; connection lines carry animated "message" packets (Band is the
 * coordination layer). Click an agent and it introduces itself in a bubble.
 */

type Kind = 'ts' | 'py';
interface Agent { id: string; code: string; name: string; kind: Kind; intro: string }

const AGENTS: Agent[] = [
  { id: 'archivist', code: 'AR', name: 'Archivist', kind: 'ts', intro: 'I read the deal package and extract the structured facts — ownership, encumbrances, and anything that’s missing.' },
  { id: 'regulatory', code: 'RG', name: 'Regulatory', kind: 'ts', intro: 'I check zoning, permits, FEMA flood and environmental flags against the property facts.' },
  { id: 'legal', code: 'LG', name: 'Legal Risk', kind: 'ts', intro: 'I review title and the contract — easement conflicts, liens, and seller representations.' },
  { id: 'financial', code: 'FN', name: 'Financial', kind: 'ts', intro: 'I underwrite the deal: NOI, DSCR, and a deterministic five-year IRR.' },
  { id: 'synthesis', code: 'SY', name: 'Synthesis', kind: 'ts', intro: 'I’m the Deal Director — I weigh every finding into a Red / Yellow / Green memo.' },
  { id: 'environmental', code: 'EN', name: 'Environmental', kind: 'py', intro: 'I model contamination risk and remediation cost with Monte-Carlo, and call whether a Phase I is needed.' },
  { id: 'capex', code: 'CX', name: 'CapEx', kind: 'py', intro: 'I simulate renovation and conversion cost, with schedule-overrun risk.' },
  { id: 'insurance', code: 'IN', name: 'Insurance', kind: 'py', intro: 'I estimate flood, wind and seismic exposure, and the insurance premium.' },
];

const VW = 1000, VH = 440;
const CX = 500, CY = 220, RX = 372, RY = 156;
const TS = '#2383e2', PY = '#22c55e';

function pos(i: number) {
  const angle = (-90 + i * 45) * (Math.PI / 180);
  return { x: CX + RX * Math.cos(angle), y: CY + RY * Math.sin(angle) };
}

export default function AgentConstellation({ counts }: { counts?: Record<string, number> }) {
  const [sel, setSel] = useState<string | null>(null);
  const nodes = AGENTS.map((a, i) => ({ ...a, ...pos(i), accent: a.kind === 'ts' ? TS : PY, msgs: counts?.[a.id] ?? 0 }));
  const selected = nodes.find((n) => n.id === sel) ?? null;

  return (
    <div className="relative w-full mx-auto" style={{ maxWidth: 1080, aspectRatio: `${VW} / ${VH}` }}>
      {/* edges + animated packets */}
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full" style={{ overflow: 'visible' }}>
        {/* ring edges between neighbouring agents */}
        {nodes.map((n, i) => {
          const m = nodes[(i + 1) % nodes.length];
          return <line key={`r${i}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="#222" strokeWidth={1} />;
        })}
        {/* spokes hub → agent */}
        {nodes.map((n, i) => (
          <line key={`s${i}`} x1={CX} y1={CY} x2={n.x} y2={n.y} stroke={sel === n.id ? n.accent : '#262626'} strokeWidth={sel === n.id ? 1.6 : 1} opacity={sel && sel !== n.id ? 0.4 : 1} />
        ))}
        {/* packets travelling outward along each spoke */}
        {nodes.map((n, i) => (
          <circle key={`p${i}`} r={3.2} fill={n.accent}>
            <animateMotion dur={`${2.4 + (i % 3) * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" path={`M${CX},${CY} L${n.x},${n.y}`} />
            <animate attributeName="opacity" values="0;1;1;0" dur={`${2.4 + (i % 3) * 0.4}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </svg>

      {/* hub */}
      <div className="absolute" style={{ left: `${(CX / VW) * 100}%`, top: `${(CY / VH) * 100}%`, transform: 'translate(-50%,-50%)' }}>
        <div className="relative flex items-center justify-center rounded-2xl" style={{ width: 64, height: 64, background: '#2383e2', boxShadow: '0 0 40px rgba(35,131,226,0.45)' }}>
          <span className="absolute inset-0 rounded-2xl animate-ping" style={{ background: 'rgba(35,131,226,0.35)', animationDuration: '2.8s' }} />
          <svg width="26" height="26" viewBox="0 0 16 16" fill="none"><path d="M2 13V6l6-4 6 4v7H10V9H6v4H2z" fill="white" /></svg>
        </div>
        <p className="text-center text-[10px] font-semibold mt-1.5 tracking-wide" style={{ color: '#9b9a97' }}>BAND</p>
      </div>

      {/* close-catcher */}
      {selected && <div className="absolute inset-0 z-10" onClick={() => setSel(null)} />}

      {/* agent avatars */}
      {nodes.map((n) => {
        const active = sel === n.id;
        return (
          <button
            key={n.id}
            onClick={(e) => { e.stopPropagation(); setSel(active ? null : n.id); }}
            className="absolute z-20 group"
            style={{ left: `${(n.x / VW) * 100}%`, top: `${(n.y / VH) * 100}%`, transform: 'translate(-50%,-50%)' }}
          >
            <div
              className="flex items-center justify-center rounded-full text-[12px] font-bold transition-transform group-hover:scale-110"
              style={{
                width: 50, height: 50, color: n.accent,
                background: '#161616',
                border: `1.5px solid ${active ? n.accent : '#2d2d2d'}`,
                boxShadow: active ? `0 0 0 4px ${n.accent}22, 0 0 24px ${n.accent}55` : '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              {n.code}
            </div>
            <p className="absolute left-1/2 -translate-x-1/2 mt-1 text-[10.5px] font-medium whitespace-nowrap" style={{ color: active ? '#e8e8e6' : '#787774' }}>{n.name}</p>
          </button>
        );
      })}

      {/* intro bubble */}
      {selected && (() => {
        const below = selected.y < CY;            // node in upper half → bubble below it
        const leftPct = Math.min(Math.max((selected.x / VW) * 100, 16), 84);
        const topPct = (selected.y / VH) * 100;
        return (
          <div
            className="absolute z-30 w-[260px] rounded-2xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{
              left: `${leftPct}%`, top: `${topPct}%`,
              transform: `translate(-50%, ${below ? '40px' : 'calc(-100% - 40px)'})`,
              background: '#1c1c1c', border: `1px solid ${selected.accent}55`,
            }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="flex items-center justify-center rounded-lg text-[11px] font-bold" style={{ width: 28, height: 28, color: selected.accent, background: `${selected.accent}1a` }}>{selected.code}</span>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: '#e8e8e6' }}>{selected.name}</p>
                <p className="text-[10px]" style={{ color: '#787774' }}>{selected.kind === 'ts' ? 'TypeScript · reasoning' : 'Python · specialist'}{selected.msgs ? ` · ${selected.msgs} messages` : ''}</p>
              </div>
            </div>
            <p className="text-[12px] leading-relaxed" style={{ color: '#b4b3b0' }}>“{selected.intro}”</p>
          </div>
        );
      })()}
    </div>
  );
}
