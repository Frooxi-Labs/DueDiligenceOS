import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';
import { agentAvatar, bandLogo } from '@/lib/agents/avatars';
import type { AgentType } from '@/types';

export const dynamic = 'force-dynamic';

const brico = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

const TS_PULSE = '#5e9bff', PY_PULSE = '#4ade80';
const PY = new Set<AgentType>(['environmental', 'capex', 'insurance']);

const HUB = { cx: 600, cy: 270, s: 96 };
const TILES: { id: AgentType; x: number; y: number; side: 'l' | 'r'; sy: number; mx: number }[] = [
  { id: 'archivist', x: 300, y: 116, side: 'l', sy: 246, mx: 442 },
  { id: 'regulatory', x: 168, y: 236, side: 'l', sy: 260, mx: 398 },
  { id: 'legal', x: 168, y: 396, side: 'l', sy: 280, mx: 398 },
  { id: 'financial', x: 322, y: 460, side: 'l', sy: 294, mx: 462 },
  { id: 'synthesis', x: 900, y: 116, side: 'r', sy: 246, mx: 758 },
  { id: 'environmental', x: 1032, y: 236, side: 'r', sy: 260, mx: 802 },
  { id: 'capex', x: 1032, y: 396, side: 'r', sy: 280, mx: 802 },
  { id: 'insurance', x: 878, y: 460, side: 'r', sy: 294, mx: 738 },
];

/** Orthogonal connector (H → V → H) with rounded corners. */
function orth(sx: number, sy: number, ex: number, ey: number, mx: number, r = 14): string {
  const v = ey > sy ? 1 : -1, h1 = mx > sx ? 1 : -1, h2 = ex > mx ? 1 : -1;
  return `M ${sx} ${sy} L ${mx - h1 * r} ${sy} Q ${mx} ${sy} ${mx} ${sy + v * r} L ${mx} ${ey - v * r} Q ${mx} ${ey} ${mx + h2 * r} ${ey} L ${ex} ${ey}`;
}

const BG = [
  [120, 90], [210, 150], [95, 230], [300, 70], [1080, 90], [990, 150], [1110, 230], [900, 70],
  [60, 360], [1140, 360], [400, 40], [800, 40],
] as const;

const conns = TILES.map((t) => {
  const sx = t.side === 'l' ? HUB.cx - HUB.s / 2 : HUB.cx + HUB.s / 2;
  const ex = t.side === 'l' ? t.x + 32 : t.x - 32;
  return { id: t.id, d: orth(sx, t.sy, ex, t.y, t.mx), pulse: PY.has(t.id) ? PY_PULSE : TS_PULSE };
});

export default function Landing() {
  return (
    <div className={`relative h-full overflow-hidden flex flex-col items-center px-8 ${brico.className}`} style={{ background: 'radial-gradient(130% 95% at 50% 32%, #101216 0%, #060708 52%, #000 100%)' }}>
      {/* dot grid */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1.4px)', backgroundSize: '26px 26px', maskImage: 'radial-gradient(120% 85% at 50% 42%, #000 35%, transparent 82%)', WebkitMaskImage: 'radial-gradient(120% 85% at 50% 42%, #000 35%, transparent 82%)' }} />
      {/* vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(80% 60% at 50% 55%, transparent 40%, rgba(0,0,0,0.55) 100%)' }} />

      {/* hero text */}
      <div className="relative z-10 text-center" style={{ marginTop: '8vh' }}>
        <p className="text-[12.5px] font-semibold tracking-[0.22em] uppercase mb-5" style={{ color: '#3ee08a' }}>The committee</p>
        <h1 className="font-semibold" style={{ fontSize: 56, lineHeight: 1.04, letterSpacing: '-0.035em', color: '#fafafa' }}>
          Diligence, by committee.
        </h1>
        <p className="mt-5 mx-auto text-[16.5px] leading-relaxed" style={{ color: '#9aa0aa', maxWidth: 540 }}>
          Eight specialist AI agents read every deal, challenge each other, and reach a verdict — coordinated through Band.
        </p>
        <Link
          href="/deals/new"
          className="group inline-flex items-center gap-2.5 rounded-full mt-9 pl-7 pr-6 py-4 text-[15px] font-semibold transition-transform hover:scale-[1.04]"
          style={{ background: 'linear-gradient(180deg,#56e58b,#23c069)', color: '#04130a', boxShadow: '0 0 44px rgba(53,210,119,0.55), 0 10px 36px rgba(0,0,0,0.5)' }}
        >
          Dive in
          <span className="flex items-center justify-center rounded-full transition-transform group-hover:translate-x-0.5" style={{ width: 24, height: 24, background: '#04130a' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 6h8.5M6 1.5L10 6l-4 4.5" stroke="#56e58b" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </Link>
      </div>

      {/* illustration */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center min-h-0 mt-2">
        <svg viewBox="0 0 1200 540" preserveAspectRatio="xMidYMid meet" className="w-full h-full" style={{ maxWidth: 1120 }}>
          <defs>
            <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#35d277" stopOpacity="0.5" />
              <stop offset="38%" stopColor="#35d277" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#35d277" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* background constellation */}
          <g opacity="0.45">
            {BG.map(([x, y], i) => {
              const [nx, ny] = BG[(i + 1) % BG.length];
              return <line key={`l${i}`} x1={x} y1={y} x2={nx} y2={ny} stroke="#171717" strokeWidth="1" />;
            })}
            {BG.map(([x, y], i) => <rect key={`s${i}`} x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill="none" stroke="#262626" />)}
          </g>

          {/* connectors */}
          {conns.map((c, i) => <path key={`c${i}`} id={`conn-${i}`} d={c.d} fill="none" stroke="#272727" strokeWidth="1.4" />)}

          {/* animated pulses flowing from the hub to each agent */}
          {conns.map((c, i) => {
            const dur = 2.6 + (i % 3) * 0.5;
            return (
              <circle key={`p${i}`} r="3" fill={c.pulse}>
                <animateMotion dur={`${dur}s`} begin={`${i * 0.35}s`} repeatCount="indefinite">
                  <mpath href={`#conn-${i}`} />
                </animateMotion>
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.85;1" dur={`${dur}s`} begin={`${i * 0.35}s`} repeatCount="indefinite" />
              </circle>
            );
          })}

          {/* hub glow (pulsing) + band logo */}
          <circle cx={HUB.cx} cy={HUB.cy} r="190" fill="url(#hubGlow)">
            <animate attributeName="opacity" values="0.7;1;0.7" dur="4s" repeatCount="indefinite" />
          </circle>
          <image href={bandLogo} x={HUB.cx - HUB.s / 2} y={HUB.cy - HUB.s / 2} width={HUB.s} height={HUB.s} preserveAspectRatio="xMidYMid meet" />

          {/* agent tiles (avatars) */}
          {TILES.map((t) => (
            <g key={t.id}>
              <rect x={t.x - 32} y={t.y - 32} width="64" height="64" rx="16" fill="#0b0b0c" stroke="#242424" />
              <image href={agentAvatar(t.id)} x={t.x - 26} y={t.y - 26} width="52" height="52" preserveAspectRatio="xMidYMid meet" />
            </g>
          ))}
        </svg>
      </div>

      <p className="relative z-10 text-[12.5px] mb-4" style={{ color: '#56606b' }}>5 reasoning agents · 3 Python specialists · 1 Band room</p>
    </div>
  );
}
