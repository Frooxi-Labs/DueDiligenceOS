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

export interface NegotiationHooks {
  /** Fired before an agent starts composing — drives the live "thinking" state. */
  onThinking?: (agent: AgentType) => void | Promise<void>;
  /** Fired the instant a turn is produced, so it streams into the room. */
  onTurn?: (turn: NegotiationTurn) => void | Promise<void>;
}

/**
 * Resolve a contradiction through a short, Band-mediated debate: the two agents
 * that disagree address each other in the room and converge.
 *
 * `onThinking` fires before each model call and `onTurn` the instant a reply
 * lands — so the room shows who is composing (live "thinking") and streams the
 * back-and-forth rather than dumping it at once. The resolution is derived from
 * what they actually say.
 */
export async function negotiateContradiction(
  c: Contradiction,
  hooks: NegotiationHooks = {},
): Promise<NegotiationResult> {
  const [a, b] = c.agents.length >= 2 ? c.agents : (['legal', 'archivist'] as AgentType[]);
  const turns: NegotiationTurn[] = [];
  const opts = { maxTokens: 1200 }; // headroom for "thinking" models so replies aren't truncated

  const speak = async (speaker: AgentType, prompt: string): Promise<string> => {
    await hooks.onThinking?.(speaker);
    return (await callText(speaker, prompt, opts)).trim();
  };
  const take = async (turn: NegotiationTurn) => {
    turns.push(turn);
    await hooks.onTurn?.(turn);
  };

  // Round 1 — the agent that surfaced the conflict challenges the other.
  const challenge = await speak(
    b,
    `You are the ${b} agent in a real-estate due-diligence committee. A contradiction was flagged: "${c.title}" — ${c.detail}\n` +
      `Address the ${a} agent directly, in 1–2 sentences, and ask them to reconcile the discrepancy. Professional, specific, plain text (no JSON).`,
  );
  await take({ agent: b, to: a, content: challenge });

  // Round 2 — the other agent defends its position and explains the discrepancy.
  const defense = await speak(
    a,
    `You are the ${a} agent. The ${b} agent challenged you: "${challenge}"\n` +
      `In 1–2 sentences, respond directly: stand on your evidence, give the most likely explanation for the discrepancy, and say which source should govern. Professional, plain text (no JSON).`,
  );
  await take({ agent: a, to: b, content: defense });

  // Round 3 — the challenger weighs the defense and proposes how to treat it (convergence).
  const close = await speak(
    b,
    `You are the ${b} agent. After this exchange:\n- You: "${challenge}"\n- ${a}: "${defense}"\n` +
      `In 1–2 sentences, accept the most defensible reading and propose the single concrete action the committee should take before closing. Professional, plain text (no JSON).`,
  );
  await take({ agent: b, to: a, content: close });

  // The resolution is derived from the debate, not canned — distil the agreed action.
  // The challenger stays "thinking" while it's distilled so the room never looks frozen.
  let resolution: string;
  try {
    await hooks.onThinking?.(b);
    resolution = (
      await callText(
        'synthesis',
        `Two committee agents resolved a contradiction ("${c.title}"). Their exchange:\n` +
          `${a}: "${defense}"\n${b}: "${close}"\n` +
          `State the agreed condition precedent as one imperative sentence (what must be done before closing). Plain text, no preamble.`,
        opts,
      )
    ).trim();
  } catch {
    resolution = close || `Resolve "${c.title}" before closing per the committee's exchange.`;
  }
  return { turns, resolution };
}
