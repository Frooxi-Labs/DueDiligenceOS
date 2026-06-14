import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, agentEvaluations, workflowEvents } from '@/lib/db/schema';
import { simulateBranch } from '@/lib/orchestration/forking';
import { broadcast } from '@/lib/realtime';
import type { AgentType, DealRecord, ForkProjection, SimBranch } from '@/types';

export const dynamic = 'force-dynamic';

const Body = z.object({ branch: z.enum(['proceed', 'remediate', 'renegotiate']) });

/** Which specialists actually flagged material/critical findings on this deal — the
 *  contextual panel for a child room (Financial + Synthesis are added downstream). */
async function contextualPanel(dealId: string): Promise<AgentType[]> {
  const specialists: AgentType[] = ['regulatory', 'legal', 'environmental'];
  const picked: AgentType[] = [];
  for (const a of specialists) {
    const [row] = await db
      .select({ raw: agentEvaluations.raw_output })
      .from(agentEvaluations)
      .where(and(eq(agentEvaluations.deal_id, dealId), eq(agentEvaluations.agent_type, a)))
      .limit(1);
    const findings = ((row?.raw as Record<string, unknown> | undefined)?.findings as { severity?: string }[] | undefined) ?? [];
    if (findings.some((f) => f.severity === 'critical' || f.severity === 'material')) picked.push(a);
  }
  return picked.length ? picked.slice(0, 2) : ['legal'];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'branch required' }, { status: 422 });
  const branch = parsed.data.branch as SimBranch;

  const [deal] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, id)).limit(1);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [synth] = await db
    .select({ raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.agent_type, 'synthesis')))
    .limit(1);
  if (!synth) return NextResponse.json({ error: 'No memo yet — let the committee finish first.' }, { status: 409 });
  const sraw = (synth.raw ?? {}) as Record<string, unknown>;

  // These three are independent of each other — run them in parallel.
  const [[fin], events, panel] = await Promise.all([
    db
      .select({ raw: agentEvaluations.raw_output })
      .from(agentEvaluations)
      .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.agent_type, 'financial')))
      .limit(1),
    db
      .select({ type: workflowEvents.event_type, payload: workflowEvents.payload })
      .from(workflowEvents)
      .where(eq(workflowEvents.deal_id, id))
      .orderBy(desc(workflowEvents.created_at))
      .limit(50),
    contextualPanel(id),
  ]);
  const approval = events.find((e) => e.type === 'approval.required')?.payload as Record<string, unknown> | undefined;
  const recalc = events.find((e) => e.type === 'financial.recalculated')?.payload as Record<string, unknown> | undefined;
  const prior = (events.find((e) => e.type === 'fork.simulated')?.payload as { projections?: ForkProjection[] } | undefined)?.projections ?? [];

  const baselineIrr = Number(recalc?.after) || Number((fin?.raw as Record<string, unknown> | undefined)?.irr_pct) || 0;

  // Reset any prior live state for this branch so a re-run starts clean.
  broadcast(id, { type: 'fork.started', branch });

  let projection: ForkProjection;
  try {
    projection = await simulateBranch(
      {
        deal: deal as unknown as DealRecord,
        composite: Number(approval?.composite ?? 50),
        signal: String(sraw.signal ?? approval?.signal ?? 'yellow'),
        recommendation: String(sraw.recommendation ?? ''),
        baselineIrr,
        topFindings: (sraw.top_findings as { title: string; detail: string; severity: string }[]) ?? [],
        conditions: (sraw.conditions_precedent as string[]) ?? [],
      },
      branch,
      panel,
      {
        onThinking: (agent) => broadcast(id, { type: 'fork.thinking', branch, agent }),
        onMessage: (agent, content) => broadcast(id, { type: 'fork.message', branch, agent, content }),
        onEvent: (kind, agent, content) => broadcast(id, { type: 'band.event', agent, kind, content, room: branch }),
      }
    );
  } catch (e) {
    console.error('[simulate] branch simulation failed:', (e as Error).message);
    return NextResponse.json({ error: 'Simulation failed. Please try again.' }, { status: 502 });
  }

  // Merge with any previously simulated branches and broadcast the full set.
  const projections = [...prior.filter((p) => p.branch !== branch), projection];
  broadcast(id, { type: 'fork.simulated', projections });
  await db.insert(workflowEvents).values({ deal_id: id, event_type: 'fork.simulated', triggered_by: 'orchestrator', payload: { projections } });

  return NextResponse.json({ projection, projections });
}
