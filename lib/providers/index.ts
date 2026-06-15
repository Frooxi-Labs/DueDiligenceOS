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

/**
 * Per-agent model — different models on purpose (cross-model committee).
 * IDs must match the AI/ML API catalog exactly: Google models are namespaced
 * (`google/…`), OpenAI models are plain. Override any of these via env.
 * To go three-provider, set MODEL_REGULATORY / MODEL_LEGAL to a Claude id from
 * your AI/ML dashboard (e.g. `claude-3-5-sonnet-20241022`).
 */
const MODELS: Record<AgentType, string> = {
  archivist: process.env.MODEL_ARCHIVIST ?? 'google/gemini-2.5-flash', // Google — long-context extraction
  regulatory: process.env.MODEL_REGULATORY ?? 'anthropic/claude-sonnet-4-6-20260218', // Anthropic
  legal: process.env.MODEL_LEGAL ?? 'anthropic/claude-sonnet-4-6-20260218', // Anthropic — contradiction nuance
  financial: process.env.MODEL_FINANCIAL ?? 'gpt-4o', // OpenAI
  synthesis: process.env.MODEL_SYNTHESIS ?? 'gpt-4o-mini', // OpenAI
  environmental: process.env.MODEL_ENVIRONMENTAL ?? 'gpt-4o-mini', // recruited specialist
  // Python/LangGraph specialists do their own model calls; these entries exist so
  // any incidental TS-side call (e.g. a chat reply) resolves a model.
  capex: process.env.MODEL_CAPEX ?? 'gpt-4o-mini',
  insurance: process.env.MODEL_INSURANCE ?? 'gpt-4o-mini',
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
  /** Force JSON-object output (default true). Set false for free-text turns. */
  json?: boolean;
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
          // Generous budget: "thinking" models (e.g. Gemini 2.5) spend tokens on
          // reasoning before the JSON, so a low cap truncates the output.
          max_tokens: opts.maxTokens ?? 4000,
          // Force valid-JSON output for structured callers (default). Free-text
          // turns (e.g. negotiation) pass json:false. Prompts mention "JSON",
          // which providers require for this mode.
          ...(opts.json === false ? {} : { response_format: { type: 'json_object' } }),
          // NB: don't also send top_p — some models (Anthropic via AI/ML) reject
          // temperature + top_p together.
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status >= 500 || res.status === 429) throw new Error(`AI/ML API (${model}) → ${res.status}`);
      if (!res.ok) throw new Error(`AI/ML API (model "${model}") → ${res.status}: ${await res.text()}`);
      const json = await res.json();
      return json?.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES) await sleep(attempt * 1000);
    }
  }
  throw lastErr;
}

/** One-shot extraction helper (used by deal intake to pull structured terms). */
export async function extractWithAI(text: string, systemPrompt: string): Promise<string> {
  const model = process.env.MODEL_EXTRACT ?? 'gpt-4o-mini';
  return callModel(
    model,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    { temperature: 0.1, maxTokens: 900 }
  );
}

/** Free-text (non-JSON) call on an agent's model — used for negotiation turns. */
export async function callText(agentType: AgentType, prompt: string, opts: CallOpts = {}): Promise<string> {
  const model = modelFor(agentType);
  return callModel(model, [{ role: 'user', content: prompt }], { temperature: 0.4, maxTokens: 500, ...opts, json: false });
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
