/**
 * GitHub-style activity heatmap. Pure presentational: takes a date→count map
 * and renders the trailing `weeks` of committee activity, week-per-column.
 */

const SCALE = ['#161616', '#173656', '#1f4f80', '#2a6cb0', '#3b82f6'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function bucket(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 1) return 4;
  const r = count / max;
  return r > 0.66 ? 4 : r > 0.33 ? 3 : r > 0.12 ? 2 : 1;
}

export default function Heatmap({ counts, weeks = 18 }: { counts: Record<string, number>; weeks?: number }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const total = weeks * 7;
  const start = new Date(today);
  start.setDate(today.getDate() - (total - 1));
  start.setDate(start.getDate() - start.getDay()); // align to Sunday

  const days: { key: string; count: number; date: Date }[] = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days.push({ key, count: counts[key] ?? 0, date: new Date(d) });
  }
  const max = Math.max(1, ...days.map((d) => d.count));

  // Group into week-columns.
  const cols: typeof days[] = [];
  for (let i = 0; i < days.length; i += 7) cols.push(days.slice(i, i + 7));

  // Month labels: show a label on the first column whose first day starts a new month.
  const monthLabels = cols.map((col, i) => {
    const first = col[0]?.date;
    if (!first) return '';
    const prev = cols[i - 1]?.[0]?.date;
    return !prev || prev.getMonth() !== first.getMonth() ? MONTHS[first.getMonth()] : '';
  });

  const cell = 12, gap = 3;
  return (
    <div>
      <div className="flex" style={{ gap, marginLeft: 2, marginBottom: 4 }}>
        {monthLabels.map((m, i) => (
          <span key={i} className="text-[9px]" style={{ width: cell, color: '#555', overflow: 'visible', whiteSpace: 'nowrap' }}>{m}</span>
        ))}
      </div>
      <div className="flex" style={{ gap }}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col" style={{ gap }}>
            {col.map((d) => (
              <div
                key={d.key}
                title={`${d.count} event${d.count === 1 ? '' : 's'} · ${d.key}`}
                style={{ width: cell, height: cell, borderRadius: 3, background: SCALE[bucket(d.count, max)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px]" style={{ color: '#555' }}>
        <span>Less</span>
        {SCALE.map((c) => <span key={c} style={{ width: 11, height: 11, borderRadius: 3, background: c }} />)}
        <span>More</span>
      </div>
    </div>
  );
}
