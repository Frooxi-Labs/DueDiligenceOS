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

const PERSONA: Record<AgentType, string> = {
  archivist: 'the Archivist (document intelligence) — you extracted the property facts',
  regulatory: 'the Regulatory/Compliance agent — zoning, permits, environmental, easements',
  legal: 'the Legal Risk agent — title, contract terms, easements, liens',
  financial: 'the Financial Underwriting agent — NOI, cap rate, DCR, IRR',
  synthesis: 'the Deal Director (Synthesis) — you weigh all findings into the memo',
};

/** Pick which agent the reviewer is addressing; default to the Deal Director. */
function detectAgent(msg: string): AgentType {
  const m = msg.toLowerCase();
  if (/\blegal\b|\btitle\b|easement|contract|lien/.test(m)) return 'legal';
  if (/regulator|complian|zoning|permit|environmental|flood|fema/.test(m)) return 'regulatory';
  if (/financ|\birr\b|underwrit|cap rate|dscr|\bnoi\b|return/.test(m)) return 'financial';
  if (/archivist|extract|\bdeed\b|\bsurvey\b|document/.test(m)) return 'archivist';
  return 'synthesis';
}

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

  const agent = detectAgent(parsed.data.message);
  const [row] = await db
    .select({ raw: agentEvaluations.raw_output })
    .from(agentEvaluations)
    .where(and(eq(agentEvaluations.deal_id, id), eq(agentEvaluations.agent_type, agent)))
    .limit(1);
  const findings = JSON.stringify(row?.raw ?? {}, null, 1).slice(0, 2500);

  const prompt = `You are ${PERSONA[agent]} on a real-estate due-diligence committee, answering the reviewer's question about THIS deal.
Answer in the first person, in your own voice, using ONLY your findings below (and the deal facts). If it's outside your remit, say which agent to ask. Be concise (2-5 sentences), plain text.

DEAL: ${deal.title} — ${deal.intended_use}, $${Number(deal.purchase_price).toLocaleString()}, ${deal.financing_ltv}% LTV @ ${deal.financing_rate}%, ${deal.hold_period_years}-yr hold.
YOUR FINDINGS (JSON):
${findings}

REVIEWER QUESTION: ${parsed.data.message}`;

  let answer: string;
  try {
    answer = (await callText(agent, prompt, { maxTokens: 600 })).trim();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Best-effort: record the exchange in the Band room, posted as the answering agent.
  try {
    const [room] = await db.select({ id: bandRooms.band_room_id }).from(bandRooms).where(eq(bandRooms.deal_id, id)).limit(1);
    if (room?.id) {
      const others = (Object.keys(getAgentConfigs()) as AgentType[]).filter((a) => a !== agent);
      await new BandClient(agent).postMessage(room.id, `Reviewer asked: "${parsed.data.message}"\n\n${answer}`, others);
    }
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ answer, agent });
}
