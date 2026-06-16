import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyHumanDecision } from '@/lib/orchestration';
import { guard } from '@/lib/security/guard';

export const dynamic = 'force-dynamic';

const DecisionSchema = z.object({
  decision: z.enum(['proceed', 'remediate', 'renegotiate', 'reject']),
  confirmed: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

/** Record the reviewer's final decision (closes the human-in-the-loop gate). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const blocked = guard(req, { id, requireToken: true, rateKey: 'deals:decide', limit: 30, windowMs: 60_000 });
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const result = await applyHumanDecision(id, parsed.data);
  return NextResponse.json(result);
}
