/**
 * Providers module — LLM model routing.
 *
 * Calls the AI/ML API (an OpenAI-compatible gateway hosting GPT / Claude / Gemini
 * and more) over plain HTTP — no vendor SDK. Each agent is routed to a different
 * model, so the committee is genuinely multi-model. Model IDs are env-overridable
 * to match whatever the gateway exposes.
 *
 * Public API: `callLLM`, `modelFor`, `PROVIDER`.
 */
import type { AgentType } from '@/types';

const BASE_URL = process.env.AIML_BASE_URL ?? 'https://api.aimlapi.com/v1';
const API_KEY = process.env.AIML_API_KEY ?? '';
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

export const PROVIDER = 'aiml';

/** Per-agent model. Different models on purpose (cross-model committee). */
const MODELS: Record<AgentType, string> = {
  market_analysis: process.env.MODEL_MARKET ?? 'gpt-4o-mini',
  due_diligence: process.env.MODEL_DD ?? 'gemini-2.0-flash',
  risk_assessment: process.env.MODEL_RISK ?? 'claude-3-5-sonnet-20241022',
  legal_review: process.env.MODEL_LEGAL ?? 'claude-3-5-sonnet-20241022',
  financial_underwriting: process.env.MODEL_FINANCE ?? 'gpt-4o',
};

export function modelFor(agentType: AgentType): string {
  return MODELS[agentType];
}

export interface LlmResult {
  content: string;
  model: string;
  provider: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface CallOpts {
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

/** Low-level: call a specific model with a message list. */
async function callModel(model: string, messages: ChatMessage[], opts: CallOpts = {}): Promise<string> {
  if (!API_KEY) throw new Error('AIML_API_KEY is not set');
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.1,
          max_tokens: opts.maxTokens ?? 1200,
          top_p: 0.9,
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`AI/ML API → ${res.status}`);
      if (!res.ok) throw new Error(`AI/ML API → ${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json?.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(attempt * 1000);
    }
  }
  throw lastErr;
}

/** Route a prompt to an agent's configured model. */
export async function callLLM(agentType: AgentType, prompt: string, opts: CallOpts = {}): Promise<LlmResult> {
  const model = modelFor(agentType);
  const messages: ChatMessage[] = [
    ...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
    { role: 'user' as const, content: prompt },
  ];
  const content = await callModel(model, messages, opts);
  return { content, model, provider: PROVIDER };
}
