import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs } from '@/lib/db/schema';
import { DealInputSchema } from '@/lib/deals';
import { runWorkflow } from '@/lib/orchestration';

export const dynamic = 'force-dynamic';

/** Create a deal and kick off the committee workflow. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DealInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const d = parsed.data;

  const [deal] = await db
    .insert(dealBriefs)
    .values({
      title: d.title,
      acquisition_type: d.acquisition_type,
      intended_use: d.intended_use,
      purchase_price: String(d.purchase_price),
      financing_ltv: String(d.financing_ltv),
      financing_rate: String(d.financing_rate),
      hold_period_years: d.hold_period_years,
      documents: d.documents,
      status: 'pending',
    })
    .returning({ id: dealBriefs.id });

  // Fire-and-forget: runs in this (long-lived) process. For multi-instance
  // deploys this moves to a BullMQ worker — see docs/architecture.md.
  runWorkflow(deal.id).catch((err) => console.error('[workflow]', deal.id, err));

  return NextResponse.json({ id: deal.id }, { status: 201 });
}

/** List recent deals. */
export async function GET() {
  const rows = await db.select().from(dealBriefs).orderBy(desc(dealBriefs.created_at)).limit(50);
  return NextResponse.json({ deals: rows });
}
