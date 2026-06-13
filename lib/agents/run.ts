import type { AgentType, DealBrief } from '@/types';
import { callLLM } from '@/lib/providers';
import { AGENTS } from './definitions';
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
  status: 'approve' | 'conditional' | 'reject';
  confidence: number;
  summary: string;
  /** Natural-language message to post into the Band room. */
  bandMessage: string;
  /** Full validated structured output. */
  raw: AgentOutput;
  model: string;
}

const MAX_ATTEMPTS = 3;

/**
 * Run one agent over a deal + the prior context read from the Band room.
 * Pure reasoning: calls the LLM, parses, validates (schema + business logic),
 * retries with error feedback. No Band/DB side effects — the orchestration
 * module owns those.
 */
export async function runAgent(
  agentType: AgentType,
  input: { deal: DealBrief; contextText: string }
): Promise<AgentRunResult> {
  const def = AGENTS[agentType];
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const prompt = def.buildPrompt(input.deal, input.contextText, lastError, attempt);
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
        status: output.status,
        confidence: output.confidence,
        summary: output.summary,
        bandMessage: def.formatBandMessage(output),
        raw: output,
        model,
      };
    } catch (err) {
      lastError = (err as Error).message;
      if (attempt === MAX_ATTEMPTS) {
        throw new AgentExecutionError(agentType, lastError);
      }
    }
  }
  throw new AgentExecutionError(agentType, 'Unexpected exit from retry loop');
}
