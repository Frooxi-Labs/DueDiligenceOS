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

  // Round 2 — the other agent responds and concedes how it should be treated.
  const response = (
    await callText(
      a,
      `You are the ${a} agent. The ${b} agent said: "${challenge}"\n` +
        `In 1–2 sentences, respond directly: acknowledge the discrepancy, give the most likely explanation, and state how it should be treated going forward. Professional, plain text (no JSON).`,
    )
  ).trim();
  turns.push({ agent: a, to: b, content: response });

  const resolution = `Reconcile "${c.title}": obtain an updated title commitment reflecting the finding and treat it as a title exception before closing.`;
  return { turns, resolution };
}
