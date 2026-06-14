import { z } from 'zod';
import { BandClient } from '@/lib/band';
import { callLLM } from '@/lib/providers';
import type { DealRecord, ForkProjection, HumanDecision } from '@/types';

/** The three branches the human gate can take. */
export const BRANCHES: HumanDecision[] = ['proceed', 'remediate', 'renegotiate'];

const ProjectionSchema = z.object({
  projected_irr_pct: z.number(),
  residual_risk: z.enum(['low', 'medium', 'high']),
  time_to_close: z.string().min(2).max(40),
  deal_survival: z.enum(['likely', 'uncertain', 'at risk']),
  rationale: z.string().min(10).max(500),
});

const BRANCH_FRAME: Record<HumanDecision, string> = {
  proceed:
    'The buyer PROCEEDS now and closes subject to clearing the conditions precedent. Closing stays on the normal timeline; the buyer carries the cost and risk of the still-open conditions.',
  remediate:
    'The buyer REQUESTS SELLER REMEDIATION first — the seller must cure the critical/material findings before closing. This lowers risk but adds time and depends on the seller cooperating.',
  renegotiate:
    'The buyer RENEGOTIATES price/terms to reflect the findings (e.g. a price reduction or new contingencies). Risk is repriced rather than removed, and there is some chance the seller walks away.',
};

export interface SimulationInput {
  deal: DealRecord;
  composite: number;
  signal: string;
  recommendation: string;
  baselineIrr: number;
  topFindings: { title: string; detail: string; severity: string }[];
  conditions: string[];
}

const stripFences = (s: string) => s.trim().replace(/^```(?:json)?|```$/gm, '').trim();

/**
 * Counterfactual fork: for each decision branch, spin up a real Band child room,
 * have the Deal Director re-deliberate "as if" that choice were made, and project
 * the outcome. Branches run in parallel; each is a single bounded model call, so
 * there are no loops. Room lineage is tracked by the caller (Band rejects custom
 * room metadata on this tier).
 */
export async function simulateDecisions(input: SimulationInput): Promise<ForkProjection[]> {
  const { deal } = input;
  const findings = input.topFindings
    .map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`)
    .join('\n')
    .slice(0, 1500);
  const conditions = input.conditions.map((c) => `- ${c}`).join('\n').slice(0, 800);

  return Promise.all(
    BRANCHES.map(async (branch): Promise<ForkProjection> => {
      const prompt = `You are the Deal Director running a COUNTERFACTUAL simulation for a commercial real-estate deal. Simulate ONLY this future and project the outcome honestly.

SCENARIO — ${branch.toUpperCase()}: ${BRANCH_FRAME[branch]}

DEAL: ${deal.title} — ${deal.intended_use}, $${Number(deal.purchase_price).toLocaleString()}, ${deal.financing_ltv}% LTV @ ${deal.financing_rate}%, ${deal.hold_period_years}-yr hold.
Current baseline IRR (before this decision): ${input.baselineIrr}%
Composite risk: ${input.composite}/100 · signal ${input.signal}
Recommendation on the table: ${input.recommendation}
Key findings:
${findings || '- none'}
Conditions precedent:
${conditions || '- none'}

Project realistic numbers for THIS scenario only (don't just echo the baseline — reason about how this choice changes return, risk, and timing). Return ONLY JSON:
{"projected_irr_pct": <number>, "residual_risk": "low|medium|high", "time_to_close": "<e.g. 30-45 days>", "deal_survival": "likely|uncertain|at risk", "rationale": "<1-2 sentences, <500 chars>"}`;

      let proj: z.infer<typeof ProjectionSchema>;
      try {
        const { content } = await callLLM('synthesis', prompt, { json: true, maxTokens: 600 });
        proj = ProjectionSchema.parse(JSON.parse(stripFences(content)));
      } catch {
        // Always render something, even if the model/parse fails.
        proj = {
          projected_irr_pct: input.baselineIrr,
          residual_risk: 'medium',
          time_to_close: '30-60 days',
          deal_survival: 'uncertain',
          rationale: 'Projection unavailable; showing the current baseline for this branch.',
        };
      }

      // Genuinely fork: create a Band child room and post the branch deliberation
      // there (as a thought event — no mention needed in a fresh room).
      let childRoomId: string | undefined;
      try {
        const band = new BandClient('synthesis');
        childRoomId = await band.createRoom();
        await band.postEvent(
          childRoomId,
          `Counterfactual branch — ${branch.toUpperCase()}\n${BRANCH_FRAME[branch]}\n\nProjected IRR ${proj.projected_irr_pct}% · residual risk ${proj.residual_risk} · close ${proj.time_to_close} · deal ${proj.deal_survival}.\n${proj.rationale}`,
          'thought'
        );
      } catch {
        /* best-effort — the simulation result stands without the room */
      }

      return { branch, child_room_id: childRoomId, ...proj };
    })
  );
}
