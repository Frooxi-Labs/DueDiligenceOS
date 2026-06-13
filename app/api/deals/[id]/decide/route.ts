import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyHumanDecision } from '@/lib/orchestration';

export const dynamic = 'force-dynamic';

const DecisionSchema = z.object({
  decision: z.enum(['proceed', 'remediate', 'renegotiate']),
  conditions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

/** Record the reviewer's final decision (closes the human-in-the-loop gate). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  await applyHumanDecision(id, parsed.data);
  return NextResponse.json({ ok: true });
}
