import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  dealBriefs,
  bandRooms,
  agentEvaluations,
  mentions,
  negotiationRounds,
  finalDecisions,
} from '@/lib/db/schema';
import { guard } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

/** Full deal state — used to hydrate the UI on load and on SSE reconnect. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blocked = guard(req, { id });
  if (blocked) return blocked;

  const [deal] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, id)).limit(1);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [room] = await db.select().from(bandRooms).where(eq(bandRooms.deal_id, id)).limit(1);
  const evaluations = await db
    .select()
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.execution_phase, 'evaluation')));
  const handoffs = await db.select().from(mentions).where(eq(mentions.deal_id, id)).orderBy(asc(mentions.created_at));
  const negotiations = await db.select().from(negotiationRounds).where(eq(negotiationRounds.deal_id, id));
  const [decision] = await db.select().from(finalDecisions).where(eq(finalDecisions.deal_id, id)).limit(1);

  return NextResponse.json({ deal, room: room ?? null, evaluations, handoffs, negotiations, decision: decision ?? null });
}

/** Delete a deal (child rows cascade). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blocked = guard(req, { id, requireToken: true });
  if (blocked) return blocked;

  await db.delete(dealBriefs).where(eq(dealBriefs.id, id));
  return NextResponse.json({ ok: true });
}
