import type { AgentType } from '@/types';
import { callLLM } from '@/lib/providers';
import { AGENTS, type AgentPromptContext } from './definitions';
import { parseAgentOutput, validateBusinessLogic } from './validation';
import type { AgentOutput } from './schemas';

export class AgentExecutionError extends Error {
  constructor(public agentType: AgentType, message: string) {
    super(`[${agentType}] ${message}`);
    this.name = 'AgentExecutionError';
  }
}

export interface AgentRunResult {
  agentType: AgentType;
  /** Full validated structured output (PropertyFact / ComplianceReport / …). */
  raw: AgentOutput;
  /** Natural-language message to post into the Band room. */
  bandMessage: string;
  /** Short status for the UI roster. */
  headline: string;
  model: string;
}

const MAX_ATTEMPTS = 3;

/**
 * Run one agent. Pure reasoning: builds the prompt from context, calls the LLM,
 * parses + validates, retries with error feedback. No Band/DB side effects.
 */
export async function runAgent(
  agentType: AgentType,
  ctx: Omit<AgentPromptContext, 'lastError' | 'attempt'>
): Promise<AgentRunResult> {
  const def = AGENTS[agentType];
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const base = def.buildPrompt({ ...ctx, lastError, attempt });
      // Lead with what the agent reads from the shared Band room — its primary
      // context. The structured handoff payload (in `base`) accompanies it for
      // precision. This is "read the room, then reason", not spoon-feeding.
      const prompt = ctx.roomContext
        ? `You are collaborating with other agents in a shared Band room. This is the live conversation so far — your SHARED CONTEXT. Read it and build on it; do not contradict an earlier agent without explicitly flagging the conflict:\n"""\n${ctx.roomContext}\n"""\n\n${base}`
        : base;
      const { content, model } = await callLLM(agentType, prompt);
      const parsed = parseAgentOutput(content);
      const result = def.schema.safeParse(parsed);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Schema validation failed: ${issues}`);
      }
      const output = result.data as AgentOutput;
      validateBusinessLogic(output);
      return {
        agentType,
        raw: output,
        bandMessage: def.formatBandMessage(output),
        headline: def.headline(output),
        model,
      };
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === MAX_ATTEMPTS) throw new AgentExecutionError(agentType, lastError);
    }
  }
  throw new AgentExecutionError(agentType, 'Unexpected exit from retry loop');
}
