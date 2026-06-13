import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, finalDecisions, workflowEvents } from '@/lib/db/schema';
import { broadcast } from '@/lib/realtime';
import type { HumanDecision } from '@/types';

export interface HumanDecisionInput {
  decision: HumanDecision; // proceed | remediate | renegotiate
  conditions?: string[];
  notes?: string;
}

/** Close the human-in-the-loop gate: record the decision, flip status, broadcast. */
export async function applyHumanDecision(dealId: string, input: HumanDecisionInput): Promise<void> {
  const conditions = input.conditions ?? [];

  await db
    .insert(finalDecisions)
    .values({
      deal_id: dealId,
      final_status: input.decision,
      decided_by: 'human',
      human_conditions: conditions,
      all_conditions: conditions,
      notes: input.notes,
    })
    .onConflictDoNothing();

  await db.update(dealBriefs).set({ status: 'decided', updated_at: new Date() }).where(eq(dealBriefs.id, dealId));
  await db.insert(workflowEvents).values({
    deal_id: dealId,
    event_type: 'deal.decided',
    to_status: 'decided',
    triggered_by: 'human',
    payload: { decision: input.decision, conditions, notes: input.notes ?? null },
  });

  broadcast(dealId, { type: 'deal.decided', decision: input.decision, conditions });
  broadcast(dealId, { type: 'workflow.status', status: 'decided' });
}
