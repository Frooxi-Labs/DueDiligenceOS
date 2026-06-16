/**
 * Contribution graph — month rows × day-of-month columns, like a GitHub-style
 * grid. Pure presentational: takes a date→count map and renders the trailing
 * `months`. Dark theme with a green intensity scale and bucket legend.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCALE = ['#1a1a1a', '#14391f', '#1f6b38', '#2f9e54', '#4ade80'];
const BUCKETS = [
  { c: SCALE[1], label: '1–2' },
  { c: SCALE[2], label: '3–5' },
  { c: SCALE[3], label: '6–8' },
  { c: SCALE[4], label: '9+' },
];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 8) return 3;
  return 4;
}

export default function Heatmap({ counts, months = 7 }: { counts: Record<string, number>; months?: number }) {
  const now = new Date();
  // Build the list of (year, month) rows, newest at the top.
  const rows: { y: number; m: number }[] = [];
  for (let k = 0; k < months; k++) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
    rows.push({ y: d.getFullYear(), m: d.getMonth() });
  }
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

  return (
    <div className="overflow-x-auto df-scroll">
      <div style={{ minWidth: 660 }}>
        {/* rows */}
        {rows.map(({ y, m }) => (
          <div key={`${y}-${m}`} className="flex items-center" style={{ gap: 4, marginBottom: 4 }}>
            <span className="text-[10px] font-medium" style={{ width: 28, color: '#787774', flexShrink: 0 }}>{MONTHS[m]}</span>
            {days.map((day) => {
              if (day > daysInMonth(y, m)) return <span key={day} style={{ width: 16, height: 16, flexShrink: 0 }} />;
              const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const c = counts[key] ?? 0;
              return (
                <span
                  key={day}
                  title={`${c} event${c === 1 ? '' : 's'} · ${MONTHS[m]} ${day}`}
                  style={{ width: 16, height: 16, borderRadius: 5, background: SCALE[level(c)], flexShrink: 0 }}
                />
              );
            })}
          </div>
        ))}
        {/* day axis */}
        <div className="flex items-center" style={{ gap: 4, marginTop: 2 }}>
          <span style={{ width: 28, flexShrink: 0 }} />
          {days.map((day) => (
            <span key={day} className="text-[8px] text-center" style={{ width: 16, color: '#444', flexShrink: 0 }}>{day}</span>
          ))}
        </div>
      </div>

      {/* legend */}
      <div className="flex items-center gap-2 mt-4 text-[10px]" style={{ color: '#787774' }}>
        {BUCKETS.map((b) => (
          <span key={b.label} className="flex items-center gap-1.5">
            <span style={{ width: 12, height: 12, borderRadius: 4, background: b.c }} />{b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
