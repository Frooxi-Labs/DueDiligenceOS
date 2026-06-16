'use client';

import { useState } from 'react';

type Kind = 'ts' | 'py';
interface Agent { id: string; code: string; name: string; kind: Kind; intro: string }

const AGENTS: Agent[] = [
  { id: 'archivist', code: 'AR', name: 'Archivist', kind: 'ts', intro: 'I read the deal package and extract the structured facts — ownership, encumbrances, and anything missing.' },
  { id: 'regulatory', code: 'RG', name: 'Regulatory', kind: 'ts', intro: 'I check zoning, permits, FEMA flood and environmental flags against the property facts.' },
  { id: 'legal', code: 'LG', name: 'Legal Risk', kind: 'ts', intro: 'I review title and the contract — easement conflicts, liens, and seller representations.' },
  { id: 'financial', code: 'FN', name: 'Financial', kind: 'ts', intro: 'I underwrite the deal: NOI, DSCR, and a deterministic five-year IRR.' },
  { id: 'synthesis', code: 'SY', name: 'Synthesis', kind: 'ts', intro: 'I’m the Deal Director — I weigh every finding into a Red / Yellow / Green memo.' },
  { id: 'environmental', code: 'EN', name: 'Environmental', kind: 'py', intro: 'I model contamination risk and remediation cost with Monte-Carlo, and call the Phase I.' },
  { id: 'capex', code: 'CX', name: 'CapEx', kind: 'py', intro: 'I simulate renovation and conversion cost with schedule-overrun risk.' },
  { id: 'insurance', code: 'IN', name: 'Insurance', kind: 'py', intro: 'I estimate flood, wind and seismic exposure, and the insurance premium.' },
];

const TS = '#2383e2', PY = '#22c55e';

export default function AgentActivity({ counts }: { counts?: Record<string, number> }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = Math.max(1, ...AGENTS.map((a) => counts?.[a.id] ?? 0));

  return (
    <div className="flex flex-col gap-1">
      {AGENTS.map((a) => {
        const accent = a.kind === 'ts' ? TS : PY;
        const n = counts?.[a.id] ?? 0;
        const pct = Math.round((n / max) * 100);
        const active = open === a.id;
        return (
          <div key={a.id}>
            <button onClick={() => setOpen(active ? null : a.id)} className="w-full flex items-center gap-3 py-1.5 group text-left">
              <span className="flex items-center justify-center rounded-lg text-[10px] font-bold flex-shrink-0" style={{ width: 28, height: 28, color: accent, background: `${accent}1a` }}>{a.code}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12.5px] font-medium" style={{ color: active ? '#e8e8e6' : '#c9c8c5' }}>{a.name}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: '#787774' }}>{n}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#262626' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(pct, n ? 6 : 0)}%`, background: accent }} />
                </div>
              </div>
            </button>
            {active && (
              <p className="text-[11.5px] leading-relaxed pl-[40px] pr-1 pb-2 pt-0.5" style={{ color: '#9b9a97' }}>“{a.intro}”</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
