import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, agentEvaluations, bandRooms } from '@/lib/db/schema';
import { callText } from '@/lib/providers';
import { BandClient, getAgentConfigs } from '@/lib/band';
import type { AgentType } from '@/types';

export const dynamic = 'force-dynamic';

const ChatSchema = z.object({ message: z.string().min(1) });

interface Finding { title: string; detail: string; severity: string }

/** Reviewer Q&A with the committee, grounded in this deal's findings. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = ChatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'message required' }, { status: 422 });

  const [deal] = await db.select().from(dealBriefs).where(eq(dealBriefs.id, id)).limit(1);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const evals = await db
    .select({ agent: agentEvaluations.agent_type, raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id)));

  const synth = (evals.find((e) => e.agent === 'synthesis')?.raw ?? {}) as {
    signal?: string;
    recommendation?: string;
    top_findings?: Finding[];
    conditions_precedent?: string[];
  };
  const findings = (synth.top_findings ?? []).map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join('\n');
  const conditions = (synth.conditions_precedent ?? []).map((c) => `- ${c}`).join('\n');

  const prompt = `You are the Deal Director (Synthesis) for a real-estate due-diligence committee, answering the reviewer's question about THIS deal.
Use ONLY the committee's findings below; if something isn't covered, say so. Be concise and direct (2-5 sentences). Plain text.

DEAL: ${deal.title} — ${deal.intended_use}, $${Number(deal.purchase_price).toLocaleString()}, ${deal.financing_ltv}% LTV @ ${deal.financing_rate}%, ${deal.hold_period_years}-yr hold.
SIGNAL: ${synth.signal ?? 'n/a'}
RECOMMENDATION: ${synth.recommendation ?? 'n/a'}
TOP FINDINGS:
${findings || 'none'}
CONDITIONS PRECEDENT:
${conditions || 'none'}

REVIEWER QUESTION: ${parsed.data.message}`;

  let answer: string;
  try {
    answer = (await callText('synthesis', prompt, { maxTokens: 600 })).trim();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Best-effort: record the exchange in the Band room.
  try {
    const [room] = await db.select({ id: bandRooms.band_room_id }).from(bandRooms).where(eq(bandRooms.deal_id, id)).limit(1);
    if (room?.id) {
      const others = (Object.keys(getAgentConfigs()) as AgentType[]).filter((a) => a !== 'synthesis');
      await new BandClient('synthesis').postMessage(room.id, `Reviewer asked: "${parsed.data.message}"\n\n${answer}`, others);
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ answer });
}
