import Link from 'next/link';
import { gte, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, workflowEvents } from '@/lib/db/schema';
import ThroughputChart from './components/dashboard/ThroughputChart';
import Heatmap from './components/dashboard/Heatmap';
import AgentActivity from './components/dashboard/AgentActivity';

export const dynamic = 'force-dynamic';

const WORKFLOW = ['Intake', 'Analysis', 'Negotiation', 'Recruitment', 'Underwrite', 'Memo'];

interface DealRow { id: string; title: string; intended_use: string; status: string }

async function loadData() {
  let deals: DealRow[] = [];
  let events: { t: string; a: string | null; c: Date }[] = [];
  try {
    deals = (await db
      .select({ id: dealBriefs.id, title: dealBriefs.title, intended_use: dealBriefs.intended_use, status: dealBriefs.status })
      .from(dealBriefs)
      .orderBy(desc(dealBriefs.created_at))) as DealRow[];
  } catch { /* DB not configured */ }
  try {
    const since = new Date(Date.now() - 250 * 86_400_000);
    events = (await db
      .select({ t: workflowEvents.event_type, a: workflowEvents.agent_type, c: workflowEvents.created_at })
      .from(workflowEvents)
      .where(gte(workflowEvents.created_at, since))) as { t: string; a: string | null; c: Date }[];
  } catch { /* DB not configured */ }
  // Aggregate here (not in render) so request-time values don't trip the lint.
  const count = (t: string) => events.filter((e) => e.t === t).length;
  const decided = deals.filter((d) => d.status === 'decided').length;
  const failed = deals.filter((d) => d.status === 'failed').length;

  const dayCounts: Record<string, number> = {};
  const perAgent: Record<string, number> = {};
  for (const e of events) {
    const d = new Date(e.c);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dayCounts[k] = (dayCounts[k] ?? 0) + 1;
    if (e.t === 'room.agent' && e.a) perAgent[e.a] = (perAgent[e.a] ?? 0) + 1;
  }

  const WEEKS = 12;
  const weekly = new Array(WEEKS).fill(0);
  const now = Date.now();
  for (const e of events) {
    const w = Math.floor((now - new Date(e.c).getTime()) / (7 * 86_400_000));
    if (w >= 0 && w < WEEKS) weekly[WEEKS - 1 - w] += 1;
  }

  return {
    deals, eventsLen: events.length, dayCounts, perAgent, weekly,
    messages: count('room.agent'), contradictions: count('contradiction.detected'), recruited: count('agent.recruited'),
    decided, failed,
    awaiting: deals.filter((d) => d.status === 'awaiting_human'),
    activeCount: deals.filter((d) => ['intake', 'analysis', 'financial', 'synthesis', 'escalated'].includes(d.status)).length,
    successRate: decided + failed > 0 ? Math.round((decided / (decided + failed)) * 100) : null,
  };
}

export default async function Dashboard() {
  const m = await loadData();
  const { dayCounts, perAgent, weekly, messages, recruited, decided, failed, awaiting, activeCount, successRate, eventsLen } = m;
  const WEEKS = weekly.length;
  const weekLabels = Array.from({ length: WEEKS }, (_, i) => (i === 0 ? `${WEEKS}w ago` : i === WEEKS - 1 ? 'now' : ''));

  const card = { background: '#1c1c1c', border: '1px solid #2d2d2d' };
  const label = { color: '#787774', letterSpacing: '0.06em' } as const;

  const kpis = [
    { label: 'Success rate', value: successRate === null ? '—' : `${successRate}%`, sub: `${decided} decided · ${failed} failed`, gradient: 'linear-gradient(135deg,#1e3a8a 0%,#3730a3 100%)', fg: '#fff', subFg: '#c7d2fe' },
    { label: 'Active now', value: activeCount, sub: `${awaiting.length} awaiting decision`, fg: '#e8e8e6' },
    { label: 'Messages', value: messages.toLocaleString(), sub: 'agent ↔ agent', fg: '#2383e2' },
    { label: 'Specialists recruited', value: recruited, sub: 'Python · cross-framework', fg: '#22c55e' },
  ];

  return (
    <div className="h-full overflow-y-auto df-scroll" style={{ color: '#e8e8e6' }}>
      <div className="px-8 py-8 mx-auto" style={{ maxWidth: 1440 }}>
        {/* Header */}
        <div className="mb-7 flex items-start justify-between gap-8">
          <div>
            <h1 className="text-[25px] font-semibold tracking-tight mb-1.5">Committee command center</h1>
            <p className="text-[13px]" style={{ color: '#9b9a97' }}>How your AI due-diligence committee is performing at a glance.</p>
          </div>
          <Link href="/deals/new" data-tour="new-run" className="text-[12.5px] font-medium px-4 py-2.5 rounded-xl flex-shrink-0 transition-[filter] hover:brightness-110" style={{ background: '#2383e2', color: '#fff' }}>+ New run</Link>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl p-5" style={k.gradient ? { background: k.gradient } : card}>
              <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ color: k.gradient ? '#c7d2fe' : '#555' }}>{k.label}</p>
              <p className="text-[30px] font-semibold leading-none mb-2" style={{ color: k.fg }}>{k.value}</p>
              <p className="text-[11px]" style={{ color: k.subFg ?? '#787774' }}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column */}
          <div data-tour="analytics" className="lg:col-span-2 flex flex-col gap-4">
            {/* Throughput */}
            <div className="rounded-2xl p-5" style={card}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-[14px] font-semibold">Committee throughput</p>
                  <p className="text-[11.5px]" style={{ color: '#787774' }}>Events processed across the committee</p>
                </div>
                <span className="text-[11px] px-3 py-1.5 rounded-lg" style={{ background: '#262626', color: '#9b9a97' }}>Last 12 weeks</span>
              </div>
              <ThroughputChart series={weekly} labels={weekLabels} />
            </div>

            {/* Contribution graph */}
            <div className="rounded-2xl p-5" style={card}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[14px] font-semibold">Contribution graph</p>
                <span className="text-[11px]" style={{ color: '#555' }}>{eventsLen.toLocaleString()} events</span>
              </div>
              <Heatmap counts={dayCounts} />
            </div>
          </div>

          {/* Right rail */}
          <div className="flex flex-col gap-4">
            {/* Agent activity */}
            <div data-tour="committee" className="rounded-2xl p-5" style={card}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[14px] font-semibold">The committee</p>
                <div className="flex items-center gap-3 text-[10px]" style={{ color: '#787774' }}>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#2383e2' }} />TS</span>
                  <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />Py</span>
                </div>
              </div>
              <AgentActivity counts={perAgent} />
              <p className="text-[10.5px] mt-2 pt-3" style={{ color: '#555', borderTop: '1px solid #262626' }}>Tap an agent to meet it.</p>
            </div>

            {/* Needs decision */}
            <div className="rounded-2xl p-5" style={card}>
              <p className="text-[14px] font-semibold mb-3">Needs your decision</p>
              {awaiting.length === 0 ? (
                <p className="text-[12px] py-2" style={{ color: '#787774' }}>Nothing waiting — the committee is clear.</p>
              ) : (
                <div className="flex flex-col">
                  {awaiting.slice(0, 6).map((d) => (
                    <Link key={d.id} href={`/deals/${d.id}`} className="flex items-center gap-3 py-2.5 group" style={{ borderTop: '1px solid #262626' }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium truncate group-hover:text-white">{d.title}</p>
                        <p className="text-[11px] truncate" style={{ color: '#787774' }}>{d.intended_use}</p>
                      </div>
                      <span className="text-[11px] flex-shrink-0" style={{ color: '#2383e2' }}>Review →</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Workflow */}
            <div className="rounded-2xl p-5" style={card}>
              <p className="text-[11px] font-semibold uppercase mb-3" style={label}>How a run flows</p>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
                {WORKFLOW.map((w, i) => (
                  <span key={w} className="flex items-center gap-1.5">
                    <span className="text-[11.5px]" style={{ color: '#c9c8c5' }}>{w}</span>
                    {i < WORKFLOW.length - 1 && <span style={{ color: '#444' }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
