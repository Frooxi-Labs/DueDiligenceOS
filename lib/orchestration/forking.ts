import { z } from 'zod';
import { BandClient, getAgentConfigs } from '@/lib/band';
import { callLLM, callText } from '@/lib/providers';
import type { AgentType, DealRecord, ForkProjection, HumanDecision } from '@/types';

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
const render = (turns: { agent: AgentType; content: string }[]) => turns.map((t) => `${t.agent}: "${t.content}"`).join('\n');

/**
 * Counterfactual fork of a SINGLE branch: spin up a real Band child room and let
 * a context-chosen panel actually argue the decision — a specialist frames it,
 * Financial underwrites, someone pushes back, and the Deal Director rules. Bounded
 * (a fixed, short turn sequence — no loops). `panel` is the list of specialists
 * the orchestrator picked from who actually flagged findings on this deal.
 */
export async function simulateBranch(
  input: SimulationInput,
  branch: HumanDecision,
  panel: AgentType[]
): Promise<ForkProjection> {
  const { deal } = input;
  const findings = input.topFindings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join('\n').slice(0, 1500);
  const conditions = input.conditions.map((c) => `- ${c}`).join('\n').slice(0, 800);

  const lead: AgentType = panel[0] ?? 'legal';
  const challenger: AgentType = panel[1] ?? lead; // the one who pushes back in round 3
  const ctx = `DEAL: ${deal.title} — ${deal.intended_use}, $${Number(deal.purchase_price).toLocaleString()}, ${deal.financing_ltv}% LTV @ ${deal.financing_rate}%, ${deal.hold_period_years}-yr hold.
Baseline IRR (before this decision): ${input.baselineIrr}% · composite risk ${input.composite}/100 · signal ${input.signal}
Key findings:\n${findings || '- none'}\nConditions precedent:\n${conditions || '- none'}`;
  const opts = { maxTokens: 350 };

  // Financial underwrites the branch → the structured numbers.
  let proj: z.infer<typeof ProjectionSchema>;
  try {
    const { content } = await callLLM(
      'financial',
      `Run a COUNTERFACTUAL underwrite for the ${branch.toUpperCase()} decision (${BRANCH_FRAME[branch]}).
${ctx}
Project realistic numbers for THIS scenario (don't just echo the baseline). Return ONLY JSON:
{"projected_irr_pct": <number>, "residual_risk": "low|medium|high", "time_to_close": "<e.g. 30-45 days>", "deal_survival": "likely|uncertain|at risk", "rationale": "<1-2 sentences, <500 chars>"}`,
      { json: true, maxTokens: 600 }
    );
    proj = ProjectionSchema.parse(JSON.parse(stripFences(content)));
  } catch {
    proj = { projected_irr_pct: input.baselineIrr, residual_risk: 'medium', time_to_close: '30-60 days', deal_survival: 'uncertain', rationale: 'Projection unavailable; showing the current baseline for this branch.' };
  }

  const transcript: { agent: AgentType; content: string }[] = [];
  const say = async (agent: AgentType, instruction: string, fallback: string) => {
    let content: string;
    try {
      content = (await callText(agent, `You are the ${agent} agent in a forked "what-if" room simulating the ${branch.toUpperCase()} decision (${BRANCH_FRAME[branch]}) for ${deal.title}.\n${ctx}\n${transcript.length ? `Conversation so far:\n${render(transcript)}\n` : ''}${instruction} Be specific and concise (1-2 sentences). Plain text.`, opts)).trim();
    } catch {
      content = fallback;
    }
    transcript.push({ agent, content });
  };

  // Round 1 — the lead specialist frames the path and its key risk.
  await say(lead, `Give your specialist read on what this path requires from your discipline and the single biggest risk.`, `From a ${lead} standpoint, this path needs the open findings handled carefully before closing.`);

  // Round 2 — Financial puts the numbers on the table and reacts to the lead.
  transcript.push({
    agent: 'financial',
    content: `On a ${branch.toUpperCase()} path I re-underwrite to ${proj.projected_irr_pct}% IRR — residual risk ${proj.residual_risk}, close in ${proj.time_to_close}, deal ${proj.deal_survival}. ${proj.rationale}`,
  });

  // Round 3 — someone pushes back (the argument): challenge the weakest assumption.
  await say(challenger, `Push back: challenge the weakest assumption in Financial's underwrite or ${lead}'s framing, from your perspective, and say what would change your mind.`, `I'd push back — the ${proj.residual_risk} residual risk may be understated given the open findings.`);

  // Round 4 — the Deal Director rules.
  await say('synthesis', `Weigh the exchange and give your verdict: is this path advisable, and what's the single biggest watch-item?`, `On balance, ${branch} carries ${proj.residual_risk} residual risk; weigh it against the timeline before committing.`);

  // Post the whole deliberation into a real Band child room (mention-routed).
  let childRoomId: string | undefined;
  try {
    const configs = getAgentConfigs();
    const owner = new BandClient(lead);
    childRoomId = await owner.createRoom();
    const participants = Array.from(new Set<AgentType>([...panel, 'financial', 'synthesis'])).filter((a) => a !== lead);
    for (const p of participants) await owner.addParticipant(childRoomId, configs[p].agentId);
    const ids = transcript.map((t) => t.agent);
    for (let i = 0; i < transcript.length; i++) {
      const t = transcript[i];
      const next = ids[i + 1] ?? lead;
      await new BandClient(t.agent).postMessage(childRoomId, t.content, [next === t.agent ? 'synthesis' : next]);
    }
  } catch {
    /* best-effort — the simulation result stands even if Band is unreachable */
  }

  return { branch, child_room_id: childRoomId, ...proj, transcript };
}
