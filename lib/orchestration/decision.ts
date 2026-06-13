import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { dealBriefs, finalDecisions, workflowEvents } from '@/lib/db/schema';
import { broadcast } from '@/lib/realtime';

export interface HumanDecisionInput {
  decision: 'approve' | 'reject';
  conditions?: string[];
  notes?: string;
}

/**
 * Apply the reviewer's final decision: record it, flip the deal status, and
 * broadcast the outcome. This is the human-in-the-loop gate closing.
 */
export async function applyHumanDecision(dealId: string, input: HumanDecisionInput): Promise<void> {
  const finalStatus = input.decision === 'approve' ? 'approved' : 'rejected';
  const conditions = input.conditions ?? [];

  await db
    .insert(finalDecisions)
    .values({
      deal_id: dealId,
      final_status: finalStatus,
      decided_by: 'human',
      human_conditions: conditions,
      all_conditions: conditions,
      rejection_reason: input.decision === 'reject' ? input.notes : undefined,
      notes: input.notes,
    })
    .onConflictDoNothing();

  await db.update(dealBriefs).set({ status: finalStatus, updated_at: new Date() }).where(eq(dealBriefs.id, dealId));

  await db.insert(workflowEvents).values({
    deal_id: dealId,
    event_type: `deal.${finalStatus}`,
    to_status: finalStatus,
    triggered_by: 'human',
    payload: { conditions, notes: input.notes ?? null },
  });

  if (finalStatus === 'approved') {
    broadcast(dealId, { type: 'deal.approved', conditions });
  } else {
    broadcast(dealId, { type: 'deal.rejected', reason: input.notes ?? 'Rejected by reviewer' });
  }
  broadcast(dealId, { type: 'workflow.status', status: finalStatus });
}
