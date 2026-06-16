/**
 * Smooth area chart of committee activity over time. Pure presentational SVG —
 * takes a numeric series (oldest → newest) and renders a flowing gradient area.
 */

const W = 640, H = 200, PAD_T = 24, PAD_B = 28;

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length ? `M ${pts[0].x},${pts[0].y}` : '';
  let d = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export default function ThroughputChart({ series, labels }: { series: number[]; labels?: string[] }) {
  const n = series.length;
  const max = Math.max(1, ...series);
  const usableH = H - PAD_T - PAD_B;
  const pts = series.map((v, i) => ({
    x: n > 1 ? (i / (n - 1)) * W : W / 2,
    y: PAD_T + usableH - (v / max) * usableH,
  }));
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1]?.x ?? W},${H - PAD_B} L ${pts[0]?.x ?? 0},${H - PAD_B} Z`;
  const last = pts[n - 1];
  const grid = [0.25, 0.5, 0.75].map((g) => PAD_T + usableH * g);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 200 }}>
      <defs>
        <linearGradient id="tp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2383e2" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#2383e2" stopOpacity="0" />
        </linearGradient>
      </defs>
      {grid.map((y, i) => <line key={i} x1={0} y1={y} x2={W} y2={y} stroke="#242424" strokeWidth={1} />)}
      <path d={area} fill="url(#tp-fill)" />
      <path d={line} fill="none" stroke="#2383e2" strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {last && (
        <>
          <circle cx={last.x} cy={last.y} r={4.5} fill="#2383e2" />
          <circle cx={last.x} cy={last.y} r={9} fill="#2383e2" opacity={0.18} />
        </>
      )}
      {labels && labels.map((l, i) => (
        <text key={i} x={n > 1 ? (i / (n - 1)) * W : W / 2} y={H - 8} fontSize={10} fill="#555" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{l}</text>
      ))}
    </svg>
  );
}
