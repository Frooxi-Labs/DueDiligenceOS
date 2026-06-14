import { z } from 'zod';
import { BandClient, getAgentConfigs } from '@/lib/band';
import { callLLM, callText } from '@/lib/providers';
import type { AgentType, DealRecord, ForkProjection, SimBranch } from '@/types';

const ProjectionSchema = z.object({
  projected_irr_pct: z.number(),
  residual_risk: z.enum(['low', 'medium', 'high']),
  time_to_close: z.string().min(2).max(40),
  deal_survival: z.enum(['likely', 'uncertain', 'at risk']),
  rationale: z.string().min(10).max(500),
});

const BRANCH_FRAME: Record<SimBranch, string> = {
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
export interface SimHooks {
  onThinking?: (agent: AgentType) => void;
  onMessage?: (agent: AgentType, content: string) => void;
}

export async function simulateBranch(
  input: SimulationInput,
  branch: SimBranch,
  panel: AgentType[],
  hooks: SimHooks = {}
): Promise<ForkProjection> {
  const { deal } = input;
  const findings = input.topFindings.map((f) => `- [${f.severity}] ${f.title}: ${f.detail}`).join('\n').slice(0, 1500);
  const conditions = input.conditions.map((c) => `- ${c}`).join('\n').slice(0, 800);

  const lead: AgentType = panel[0] ?? 'legal';
  const challenger: AgentType = panel[1] ?? lead; // the one who pushes back in round 3
  const ctx = `DEAL: ${deal.title} — ${deal.intended_use}, $${Number(deal.purchase_price).toLocaleString()}, ${deal.financing_ltv}% LTV @ ${deal.financing_rate}%, ${deal.hold_period_years}-yr hold.
Baseline IRR (before this decision): ${input.baselineIrr}% · composite risk ${input.composite}/100 · signal ${input.signal}
Committee recommendation on the table: ${input.recommendation || 'n/a'}
Key findings:\n${findings || '- none'}\nConditions precedent:\n${conditions || '- none'}`;
  const opts = { maxTokens: 350 };
  const configs = getAgentConfigs();

  // 1) Create the Band child room FIRST and seat the panel — the conversation
  //    happens THROUGH Band, message by message, not reconstructed afterwards.
  let childRoomId: string | undefined;
  const joined = new Set<AgentType>([lead]);
  try {
    const owner = new BandClient(lead);
    childRoomId = await owner.createRoom();
    for (const p of Array.from(new Set<AgentType>([...panel, 'financial', 'synthesis'])).filter((a) => a !== lead)) {
      await owner.addParticipant(childRoomId, configs[p].agentId);
      joined.add(p);
    }
  } catch {
    childRoomId = undefined; // Band unreachable — still stream to the UI below
  }

  const transcript: { agent: AgentType; content: string }[] = [];
  // Post a turn INTO the Band room as it's spoken, then stream it to the UI.
  const post = async (agent: AgentType, content: string, mentionPref: AgentType) => {
    if (childRoomId) {
      let target = joined.has(mentionPref) ? mentionPref : 'synthesis';
      if (target === agent) target = agent === 'synthesis' ? lead : 'synthesis';
      try {
        await new BandClient(agent).postMessage(childRoomId, content, [target]);
      } catch {
        /* best-effort */
      }
    }
    transcript.push({ agent, content });
    hooks.onMessage?.(agent, content);
  };
  const say = async (agent: AgentType, instruction: string, fallback: string, mentionPref: AgentType) => {
    hooks.onThinking?.(agent);
    let content: string;
    try {
      content = (await callText(agent, `You are the ${agent} agent in a forked "what-if" room simulating the ${branch.toUpperCase()} decision (${BRANCH_FRAME[branch]}) for ${deal.title}.\n${ctx}\n${transcript.length ? `Conversation so far:\n${render(transcript)}\n` : ''}${instruction} Be specific and concise (1-2 sentences). Plain text.`, opts)).trim();
    } catch {
      content = fallback;
    }
    await post(agent, content, mentionPref);
  };

  // Round 1 — the lead specialist frames the path and its key risk.
  await say(lead, `Give your specialist read on what this path requires from your discipline and the single biggest risk.`, `From a ${lead} standpoint, this path needs the open findings handled carefully before closing.`, 'financial');

  // Round 2 — Financial underwrites the branch and puts the numbers on the table.
  hooks.onThinking?.('financial');
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
  await post('financial', `On a ${branch.toUpperCase()} path I re-underwrite to ${proj.projected_irr_pct}% IRR — residual risk ${proj.residual_risk}, close in ${proj.time_to_close}, deal ${proj.deal_survival}. ${proj.rationale}`, challenger);

  // Round 3 — someone pushes back (the argument): challenge the weakest assumption.
  await say(challenger, `Push back: challenge the weakest assumption in Financial's underwrite or ${lead}'s framing, from your perspective, and say what would change your mind.`, `I'd push back — the ${proj.residual_risk} residual risk may be understated given the open findings.`, 'synthesis');

  // Round 3.5 — the room can CALL IN another agent who isn't present, if it needs one.
  const ROSTER: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis', 'environmental'];
  const candidates = ROSTER.filter((a) => !joined.has(a));
  if (candidates.length) {
    try {
      const { content } = await callLLM(
        'synthesis',
        `In this ${branch.toUpperCase()} what-if room the panel is: ${[...joined].join(', ')}. Conversation so far:\n${render(transcript)}\nIs a perspective missing that only one of these absent specialists could give: ${candidates.join(', ')}? Only call one in if genuinely needed. Return ONLY JSON: {"call": "<agent or none>", "ask": "<one-line question for them>"}`,
        { json: true, maxTokens: 200 }
      );
      const parsed = JSON.parse(stripFences(content)) as { call?: string; ask?: string };
      if (parsed.call && candidates.includes(parsed.call as AgentType)) {
        const recruited = parsed.call as AgentType;
        const ask = String(parsed.ask ?? 'your specialist read on this path');
        // Genuinely add the called agent to the Band room mid-conversation.
        if (childRoomId) {
          try {
            await new BandClient(lead).addParticipant(childRoomId, configs[recruited].agentId);
            joined.add(recruited);
          } catch {
            /* best-effort */
          }
        } else {
          joined.add(recruited);
        }
        await post(lead, `We're missing a perspective here — let me pull in ${recruited}. ${ask}`, recruited);
        await say(recruited, `You've been called into this room for a perspective the panel is missing. ${ask} Give your specialist input.`, `From a ${recruited} standpoint, this path warrants a closer look at the open items before closing.`, 'synthesis');
      }
    } catch {
      /* no consult */
    }
  }

  // Round 4 — the Deal Director rules.
  await say('synthesis', `Weigh the exchange and give your verdict: is this path advisable, and what's the single biggest watch-item?`, `On balance, ${branch} carries ${proj.residual_risk} residual risk; weigh it against the timeline before committing.`, lead);

  return { branch, child_room_id: childRoomId, ...proj, transcript };
}
