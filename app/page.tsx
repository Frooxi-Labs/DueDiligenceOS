import Link from 'next/link';
import { gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, workflowEvents } from '@/lib/db/schema';
import AgentConstellation from './components/dashboard/AgentConstellation';
import Heatmap from './components/dashboard/Heatmap';

export const dynamic = 'force-dynamic';

const WORKFLOW = [
  { n: '1', label: 'Intake' },
  { n: '2', label: 'Analysis' },
  { n: '3', label: 'Negotiation' },
  { n: '4', label: 'Recruitment' },
  { n: '5', label: 'Underwrite' },
  { n: '6', label: 'Memo + sign-off' },
];

/** Pull dashboard data. Kept outside the component so request-time values
 *  (Date.now) and DB reads don't trip the render-purity lint. */
async function loadData() {
  let deals: { status: string }[] = [];
  let events: { t: string; a: string | null; c: Date }[] = [];
  try {
    deals = (await db.select({ status: dealBriefs.status }).from(dealBriefs)) as { status: string }[];
  } catch { /* DB not configured */ }
  try {
    const since = new Date(Date.now() - 130 * 86_400_000);
    events = (await db
      .select({ t: workflowEvents.event_type, a: workflowEvents.agent_type, c: workflowEvents.created_at })
      .from(workflowEvents)
      .where(gte(workflowEvents.created_at, since))) as { t: string; a: string | null; c: Date }[];
  } catch { /* DB not configured */ }
  return { deals, events };
}

export default async function Dashboard() {
  const { deals, events } = await loadData();

  // ── Aggregate ───────────────────────────────────────────────────────────
  const count = (t: string) => events.filter((e) => e.t === t).length;
  const messages = count('room.agent');
  const contradictions = count('contradiction.detected');
  const recruited = count('agent.recruited');
  const decided = deals.filter((d) => d.status === 'decided').length;
  const failed = deals.filter((d) => d.status === 'failed').length;
  const successRate = decided + failed > 0 ? Math.round((decided / (decided + failed)) * 100) : null;

  const dayCounts: Record<string, number> = {};
  for (const e of events) {
    const k = new Date(e.c).toISOString().slice(0, 10);
    dayCounts[k] = (dayCounts[k] ?? 0) + 1;
  }
  const perAgent: Record<string, number> = {};
  for (const e of events) if (e.t === 'room.agent' && e.a) perAgent[e.a] = (perAgent[e.a] ?? 0) + 1;

  const stats = [
    { label: 'Total runs', value: deals.length, color: '#e8e8e6' },
    { label: 'Messages', value: messages.toLocaleString(), color: '#2383e2' },
    { label: 'Contradictions resolved', value: contradictions, color: '#a78bfa' },
    { label: 'Specialists recruited', value: recruited, color: '#22c55e' },
    { label: 'Success rate', value: successRate === null ? '—' : `${successRate}%`, color: '#22c55e' },
    { label: 'Errors', value: failed, color: failed ? '#ef4444' : '#787774' },
  ];

  const card = { background: '#1c1c1c', border: '1px solid #2d2d2d' };
  const sectionLabel = { color: '#787774', letterSpacing: '0.08em' } as const;

  return (
    <div className="overflow-y-auto df-scroll flex-1 min-h-0 px-10 py-9" style={{ color: '#e8e8e6' }}>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-8">
        <div style={{ maxWidth: 620 }}>
          <h1 className="text-[26px] font-semibold tracking-tight mb-2">Committee command center</h1>
          <p className="text-[13.5px] leading-relaxed" style={{ color: '#9b9a97' }}>
            Eight specialist agents — five reasoning, three quantitative — coordinated through Band. Click an agent to meet it.
          </p>
        </div>
        <Link href="/deals/new" data-tour="new-run" className="text-[12.5px] font-medium px-3.5 py-2 rounded-lg flex-shrink-0 mt-1 transition-[filter] hover:brightness-110" style={{ background: '#2383e2', color: '#fff' }}>+ New run</Link>
      </div>

      {/* Constellation */}
      <div data-tour="committee" className="rounded-2xl mb-8 px-4 pt-5 pb-2" style={{ ...card, background: 'radial-gradient(120% 90% at 50% 30%, #1f1f1f 0%, #161616 60%, #141414 100%)' }}>
        <AgentConstellation counts={perAgent} />
      </div>

      {/* Ops stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-9">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl px-4 py-3.5" style={card}>
            <p className="text-[10px] mb-2 uppercase tracking-widest font-semibold leading-tight" style={{ color: '#555' }}>{s.label}</p>
            <p className="text-[24px] font-semibold leading-none" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Activity + workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Heatmap */}
        <div className="lg:col-span-2 rounded-2xl p-5" style={card}>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-semibold uppercase" style={sectionLabel}>Committee activity</p>
            <p className="text-[11px]" style={{ color: '#555' }}>{events.length.toLocaleString()} events · last 18 weeks</p>
          </div>
          <Heatmap counts={dayCounts} />
        </div>

        {/* Workflow */}
        <div className="rounded-2xl p-5" style={card}>
          <p className="text-[11px] font-semibold uppercase mb-4" style={sectionLabel}>How a run flows</p>
          <div className="flex flex-col gap-2">
            {WORKFLOW.map((w, i) => (
              <div key={w.n} className="flex items-center gap-3">
                <span className="flex items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0" style={{ width: 24, height: 24, background: i === WORKFLOW.length - 1 ? '#0d1f12' : '#13243a', color: i === WORKFLOW.length - 1 ? '#22c55e' : '#2383e2' }}>{w.n}</span>
                <span className="text-[13px]" style={{ color: '#c9c8c5' }}>{w.label}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed mt-4 pt-4" style={{ color: '#787774', borderTop: '1px solid #2d2d2d' }}>
            Stages run in order; who debates, who delegates, and which specialists join are decided from the deal.
          </p>
        </div>
      </div>
    </div>
  );
}
