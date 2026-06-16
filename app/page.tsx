import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#555555' },
  intake: { label: 'Intake', color: '#2383e2' },
  analysis: { label: 'Analysis', color: '#2383e2' },
  financial: { label: 'Underwriting', color: '#2383e2' },
  synthesis: { label: 'Synthesis', color: '#2383e2' },
  escalated: { label: 'Needs documents', color: '#f59e0b' },
  awaiting_human: { label: 'Needs decision', color: '#f59e0b' },
  decided: { label: 'Decided', color: '#22c55e' },
  failed: { label: 'Failed', color: '#ef4444' },
};

const AGENTS = [
  { code: 'AR', name: 'Archivist', desc: 'Extracts the facts' },
  { code: 'RG', name: 'Regulatory', desc: 'Compliance & zoning' },
  { code: 'LG', name: 'Legal', desc: 'Title & contract' },
  { code: 'FN', name: 'Financial', desc: 'Underwriting' },
  { code: 'SY', name: 'Synthesis', desc: 'Deal memo' },
];

const STEPS = [
  { n: '01', title: 'Upload the deal package', desc: 'Attach the title deed, contract, inspection, and disclosures — or describe the deal.' },
  { n: '02', title: 'Agents collaborate through Band', desc: 'Archivist extracts the facts; Regulatory, Legal, and Financial analyze and hand off — contradictions and cascading recalculations surface in real time.' },
  { n: '03', title: 'You make the call', desc: 'Review the deal memo and composite risk score, then proceed with conditions, request remediation, or flag for renegotiation.' },
];

function Badge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, color: '#555' };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: `${m.color}20`, color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

export default async function Dashboard() {
  let deals: (typeof dealBriefs.$inferSelect)[] = [];
  try {
    deals = await db.select().from(dealBriefs).orderBy(desc(dealBriefs.created_at)).limit(20);
  } catch {
    /* DB not configured — show empty dashboard */
  }

  const active = deals.filter((d) => ['intake', 'analysis', 'financial', 'synthesis', 'escalated'].includes(d.status));
  const awaiting = deals.filter((d) => d.status === 'awaiting_human');
  const decided = deals.filter((d) => d.status === 'decided');

  const stats = [
    { label: 'Total runs', value: deals.length, color: '#e8e8e6' },
    { label: 'Active now', value: active.length, color: '#2383e2' },
    { label: 'Needs decision', value: awaiting.length, color: '#f59e0b' },
    { label: 'Decided', value: decided.length, color: '#22c55e' },
  ];

  const card = { background: '#1c1c1c', border: '1px solid #2d2d2d' };

  return (
    <div className="overflow-y-auto df-scroll flex-1 min-h-0 p-8" style={{ color: '#e8e8e6' }}>
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold mb-1">Due-Diligence Committee</h1>
          <p className="text-[13px]" style={{ color: '#9b9a97' }}>
            Five specialist AI agents collaborate through Band to evaluate a real-estate deal, surface contradictions, and reach a decision you approve.
          </p>
        </div>
        <Link href="/deals/new" data-tour="new-run" className="text-[12px] font-medium px-3 py-2 rounded-lg flex-shrink-0" style={{ background: '#2383e2', color: '#fff' }}>+ New run</Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl p-4" style={card}>
            <p className="text-[10px] mb-2 uppercase tracking-widest font-semibold" style={{ color: '#555' }}>{s.label}</p>
            <p className="text-[28px] font-semibold leading-none" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* The committee */}
      <p className="text-[13px] font-semibold mb-3" style={{ color: '#9b9a97' }}>The committee</p>
      <div data-tour="committee" className="grid grid-cols-5 gap-3 mb-8">
        {AGENTS.map((a) => (
          <div key={a.code} className="rounded-xl p-4" style={card}>
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold mb-2" style={{ background: '#1a3a5c', color: '#2383e2' }}>{a.code}</div>
            <p className="text-[13px] font-semibold">{a.name}</p>
            <p className="text-[11px] mt-0.5" style={{ color: '#9b9a97' }}>{a.desc}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div data-tour="how" className="grid grid-cols-3 gap-3 mb-8">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-xl p-4" style={card}>
            <p className="text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: '#2383e2' }}>Step {s.n}</p>
            <p className="text-[13px] font-semibold mb-1">{s.title}</p>
            <p className="text-[12px] leading-relaxed" style={{ color: '#9b9a97' }}>{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Recent runs */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold" style={{ color: '#9b9a97' }}>Recent runs</h2>
      </div>
      {deals.length === 0 ? (
        <div className="rounded-xl p-16 text-center" style={card}>
          <p className="text-[13px] mb-4" style={{ color: '#9b9a97' }}>No runs yet. Start one to watch the committee deliberate in real time.</p>
          <Link href="/deals/new" className="inline-flex text-[13px] font-medium px-4 py-2 rounded-lg" style={{ background: '#2383e2', color: '#fff' }}>Start your first run →</Link>
        </div>
      ) : (
        <div className="space-y-1.5">
          {[...awaiting, ...active, ...decided, ...deals.filter((d) => d.status === 'failed' || d.status === 'pending')].map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`} className="flex items-center gap-4 px-4 py-3 rounded-xl group transition-colors" style={card}>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate group-hover:text-white transition-colors">{deal.title}</p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: '#555' }}>
                  {deal.intended_use} · ${Number(deal.purchase_price).toLocaleString()}
                </p>
              </div>
              <Badge status={deal.status} />
              <p className="text-[11px] flex-shrink-0 w-16 text-right" style={{ color: '#444' }}>
                {deal.created_at ? new Date(deal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
