import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowEvents } from '@/lib/db/schema';
import type { ForkProjection } from '@/types';

export const dynamic = 'force-dynamic';

/** The latest simulated decision branches (child rooms) for a deal, if any. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db
    .select({ type: workflowEvents.event_type, payload: workflowEvents.payload })
    .from(workflowEvents)
    .where(eq(workflowEvents.deal_id, id))
    .orderBy(desc(workflowEvents.created_at))
    .limit(50);
  const fork = rows.find((r) => r.type === 'fork.simulated')?.payload as { projections?: ForkProjection[] } | undefined;
  return NextResponse.json({ projections: fork?.projections ?? [] });
}
