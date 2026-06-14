import type { AgentType } from '@/types';
import type { Contradiction } from './contradiction';
import { callText } from '@/lib/providers';

export interface NegotiationTurn {
  agent: AgentType;
  to: AgentType;
  content: string;
}

export interface NegotiationResult {
  turns: NegotiationTurn[];
  resolution: string;
}

/**
 * Resolve a contradiction through a short, Band-mediated debate: the two agents
 * that disagree address each other in the room and converge. The turns are
 * posted to Band by the caller; the resolution becomes a condition.
 */
export async function negotiateContradiction(c: Contradiction): Promise<NegotiationResult> {
  const [a, b] = c.agents.length >= 2 ? c.agents : (['legal', 'archivist'] as AgentType[]);
  const turns: NegotiationTurn[] = [];

  // Round 1 — the agent that surfaced the conflict challenges the other.
  const challenge = (
    await callText(
      b,
      `You are the ${b} agent in a real-estate due-diligence committee. A contradiction was flagged: "${c.title}" — ${c.detail}\n` +
        `Address the ${a} agent directly, in 1–2 sentences, and ask them to reconcile the discrepancy. Professional, specific, plain text (no JSON).`,
    )
  ).trim();
  turns.push({ agent: b, to: a, content: challenge });

  // Round 2 — the other agent defends its position and explains the discrepancy.
  const defense = (
    await callText(
      a,
      `You are the ${a} agent. The ${b} agent challenged you: "${challenge}"\n` +
        `In 1–2 sentences, respond directly: stand on your evidence, give the most likely explanation for the discrepancy, and say which source should govern. Professional, plain text (no JSON).`,
    )
  ).trim();
  turns.push({ agent: a, to: b, content: defense });

  // Round 3 — the challenger weighs the defense and proposes how to treat it (convergence).
  const close = (
    await callText(
      b,
      `You are the ${b} agent. After this exchange:\n- You: "${challenge}"\n- ${a}: "${defense}"\n` +
        `In 1–2 sentences, accept the most defensible reading and propose the single concrete action the committee should take before closing. Professional, plain text (no JSON).`,
    )
  ).trim();
  turns.push({ agent: b, to: a, content: close });

  // The resolution is derived from the debate, not canned — distil the agreed action.
  let resolution: string;
  try {
    resolution = (
      await callText(
        'synthesis',
        `Two committee agents resolved a contradiction ("${c.title}"). Their exchange:\n` +
          `${a}: "${defense}"\n${b}: "${close}"\n` +
          `State the agreed condition precedent as one imperative sentence (what must be done before closing). Plain text, no preamble.`,
      )
    ).trim();
  } catch {
    resolution = close || `Resolve "${c.title}" before closing per the committee's exchange.`;
  }
  return { turns, resolution };
}
