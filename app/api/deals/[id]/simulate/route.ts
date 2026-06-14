import { NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, agentEvaluations, workflowEvents } from '@/lib/db/schema';
import { simulateDecisions } from '@/lib/orchestration/forking';
import { broadcast } from '@/lib/realtime';
import type { DealRecord } from '@/types';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [deal] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, id)).limit(1);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Memo must be ready (synthesis has run) before there's anything to simulate.
  const [synth] = await db
    .select({ raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.agent_type, 'synthesis')))
    .limit(1);
  if (!synth) return NextResponse.json({ error: 'No memo yet — let the committee finish first.' }, { status: 409 });

  const sraw = (synth.raw ?? {}) as Record<string, unknown>;
  const [fin] = await db
    .select({ raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.agent_type, 'financial')))
    .limit(1);

  // Composite + current IRR come from the persisted workflow events when present.
  const events = await db
    .select({ type: workflowEvents.event_type, payload: workflowEvents.payload })
    .from(workflowEvents)
    .where(eq(workflowEvents.deal_id, id))
    .orderBy(desc(workflowEvents.created_at));
  const approval = events.find((e) => e.type === 'approval.required')?.payload as Record<string, unknown> | undefined;
  const recalc = events.find((e) => e.type === 'financial.recalculated')?.payload as Record<string, unknown> | undefined;

  const baselineIrr =
    Number(recalc?.after) ||
    Number((fin?.raw as Record<string, unknown> | undefined)?.irr_pct) ||
    0;

  let projections;
  try {
    projections = await simulateDecisions({
      deal: deal as unknown as DealRecord,
      composite: Number(approval?.composite ?? 50),
      signal: String(sraw.signal ?? approval?.signal ?? 'yellow'),
      recommendation: String(sraw.recommendation ?? ''),
      baselineIrr,
      topFindings: (sraw.top_findings as { title: string; detail: string; severity: string }[]) ?? [],
      conditions: (sraw.conditions_precedent as string[]) ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  broadcast(id, { type: 'fork.simulated', projections });
  await db.insert(workflowEvents).values({ deal_id: id, event_type: 'fork.simulated', triggered_by: 'orchestrator', payload: { projections } });

  return NextResponse.json({ projections });
}
