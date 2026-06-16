import Link from 'next/link';
import { Bricolage_Grotesque } from 'next/font/google';

export const dynamic = 'force-dynamic';

const brico = Bricolage_Grotesque({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

const TS = '#cfd6e6', PY = '#86efac';

// Eight agent tiles: four left, four right. Coords in the SVG viewBox (1200×520).
const HUB = { cx: 600, cy: 262, s: 90 };
const TILES = [
  { code: 'AR', accent: TS, x: 300, y: 108, side: 'l', sy: 240, mx: 442 },
  { code: 'RG', accent: TS, x: 168, y: 228, side: 'l', sy: 252, mx: 398 },
  { code: 'LG', accent: TS, x: 168, y: 388, side: 'l', sy: 272, mx: 398 },
  { code: 'FN', accent: TS, x: 322, y: 452, side: 'l', sy: 286, mx: 462 },
  { code: 'SY', accent: TS, x: 900, y: 108, side: 'r', sy: 240, mx: 758 },
  { code: 'EN', accent: PY, x: 1032, y: 228, side: 'r', sy: 252, mx: 802 },
  { code: 'CX', accent: PY, x: 1032, y: 388, side: 'r', sy: 272, mx: 802 },
  { code: 'IN', accent: PY, x: 878, y: 452, side: 'r', sy: 286, mx: 738 },
];

/** Orthogonal connector (H → V → H) with rounded corners. */
function orth(sx: number, sy: number, ex: number, ey: number, mx: number, r = 14): string {
  const v = ey > sy ? 1 : -1;
  const h1 = mx > sx ? 1 : -1;
  const h2 = ex > mx ? 1 : -1;
  return `M ${sx} ${sy} L ${mx - h1 * r} ${sy} Q ${mx} ${sy} ${mx} ${sy + v * r} L ${mx} ${ey - v * r} Q ${mx} ${ey} ${mx + h2 * r} ${ey} L ${ex} ${ey}`;
}

// Faint background constellation (decorative squares + links).
const BG = [
  [120, 90], [210, 150], [95, 230], [300, 70], [1080, 90], [990, 150], [1110, 230], [900, 70],
  [60, 360], [1140, 360], [400, 40], [800, 40],
] as const;

export default function Landing() {
  return (
    <div className={`relative h-full overflow-hidden flex flex-col items-center px-8 ${brico.className}`} style={{ background: '#000' }}>
      {/* text block */}
      <div className="relative z-10 text-center" style={{ marginTop: '7vh' }}>
        <p className="text-[13px] tracking-wide mb-4" style={{ color: '#6b7280' }}>The committee</p>
        <h1 className="font-semibold" style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: '-0.03em', color: '#f5f5f5' }}>Diligence, By Committee.</h1>
        <p className="mt-4 text-[16px]" style={{ color: '#8b8f99' }}>Eight specialist agents evaluate every deal — coordinated through Band.</p>
        <Link
          href="/deals/new"
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 mt-7 text-[13.5px] font-medium transition-colors hover:bg-[#1a1a1a]"
          style={{ background: '#0e0e0e', border: '1px solid #262626', color: '#e8e8e8' }}
        >
          Dive in
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 6.5h9M6.5 2l4 4.5-4 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </div>

      {/* illustration */}
      <div className="relative z-10 flex-1 w-full flex items-center justify-center min-h-0">
        <svg viewBox="0 0 1200 520" preserveAspectRatio="xMidYMid meet" className="w-full h-full" style={{ maxWidth: 1120 }}>
          <defs>
            <radialGradient id="hubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="hubFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1c1c1c" />
              <stop offset="100%" stopColor="#0a0a0a" />
            </linearGradient>
          </defs>

          {/* background constellation */}
          <g opacity="0.5">
            {BG.map(([x, y], i) => {
              const [nx, ny] = BG[(i + 1) % BG.length];
              return <line key={`l${i}`} x1={x} y1={y} x2={nx} y2={ny} stroke="#1a1a1a" strokeWidth="1" />;
            })}
            {BG.map(([x, y], i) => <rect key={`s${i}`} x={x - 3} y={y - 3} width="6" height="6" rx="1.5" fill="none" stroke="#262626" />)}
          </g>

          {/* connectors */}
          {TILES.map((t) => {
            const sx = t.side === 'l' ? HUB.cx - HUB.s / 2 : HUB.cx + HUB.s / 2;
            const ex = t.side === 'l' ? t.x + 32 : t.x - 32;
            return <path key={`c${t.code}`} d={orth(sx, t.sy, ex, t.y, t.mx)} fill="none" stroke="#2b2b2b" strokeWidth="1.4" />;
          })}

          {/* hub glow + node */}
          <circle cx={HUB.cx} cy={HUB.cy} r="180" fill="url(#hubGlow)" />
          <rect x={HUB.cx - HUB.s / 2} y={HUB.cy - HUB.s / 2} width={HUB.s} height={HUB.s} rx="20" fill="url(#hubFill)" stroke="#3a3a3a" />
          <path d={`M ${HUB.cx - 18} ${HUB.cy + 14} V ${HUB.cy - 6} l 18 -12 l 18 12 v 20 h -12 v -12 h -12 v 12 z`} fill="#f5f5f5" />

          {/* tiles */}
          {TILES.map((t) => (
            <g key={t.code}>
              <rect x={t.x - 32} y={t.y - 32} width="64" height="64" rx="15" fill="#0c0c0c" stroke="#262626" />
              <text x={t.x} y={t.y + 5} textAnchor="middle" fontSize="16" fontWeight="700" fill={t.accent} style={{ fontFamily: 'inherit' }}>{t.code}</text>
            </g>
          ))}
        </svg>
      </div>

      <p className="relative z-10 text-[12.5px] mb-3" style={{ color: '#5b5f68' }}>5 reasoning agents · 3 Python specialists · 1 Band room</p>
    </div>
  );
}
