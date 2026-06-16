import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { workflowEvents, agentEvaluations } from '@/lib/db/schema';
import { isUuid } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

/** Full audit trail for a deal: every workflow event + agent evaluation, in order. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const events = await db
    .select()
    .from(workflowEvents)
    .where(eq(workflowEvents.deal_id, id))
    .orderBy(asc(workflowEvents.created_at));

  const evaluations = await db
    .select({
      agent_type: agentEvaluations.agent_type,
      status: agentEvaluations.status,
      model_used: agentEvaluations.model_used,
      provider_used: agentEvaluations.provider_used,
      created_at: agentEvaluations.created_at,
    })
    .from(agentEvaluations)
    .where(eq(agentEvaluations.deal_id, id))
    .orderBy(asc(agentEvaluations.created_at));

  return NextResponse.json({ events, evaluations });
}
