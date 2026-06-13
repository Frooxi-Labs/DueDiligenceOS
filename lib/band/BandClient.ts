import { AgentType } from '@/types';

const BAND_BASE_URL = process.env.BAND_BASE_URL ?? 'https://app.band.ai/api/v1';
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;

interface BandAgentConfig {
  agentType: AgentType;
  agentId: string;
  apiKey: string;
  handle: string;
  displayName: string;
}

export interface BandContextMessage {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

/** Agent credentials, loaded from env. One Band identity per agent. */
export function getAgentConfigs(): Record<AgentType, BandAgentConfig> {
  const mk = (
    agentType: AgentType,
    prefix: string,
    displayName: string
  ): BandAgentConfig => ({
    agentType,
    agentId: process.env[`${prefix}_AGENT_ID`] ?? '',
    apiKey: process.env[`${prefix}_API_KEY`] ?? '',
    handle: process.env[`${prefix}_HANDLE`] ?? displayName.replace(/\s+/g, ''),
    displayName,
  });
  return {
    market_analysis: mk('market_analysis', 'BAND_MARKET', 'Market Analysis'),
    due_diligence: mk('due_diligence', 'BAND_DD', 'Due Diligence'),
    risk_assessment: mk('risk_assessment', 'BAND_RISK', 'Risk Assessment'),
    legal_review: mk('legal_review', 'BAND_LEGAL', 'Legal & Compliance'),
    financial_underwriting: mk('financial_underwriting', 'BAND_FINANCE', 'Financial Underwriting'),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BandClient {
  private agentType: AgentType;
  private config: BandAgentConfig;
  private allConfigs: Record<AgentType, BandAgentConfig>;

  constructor(agentType: AgentType) {
    this.agentType = agentType;
    this.allConfigs = getAgentConfigs();
    this.config = this.allConfigs[agentType];
  }

  /** REST request with per-attempt timeout + retry on transient failures. */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${BAND_BASE_URL}${path}`, {
          method,
          headers: { 'X-API-Key': this.config.apiKey, 'Content-Type': 'application/json' },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        // Retry transient server errors / rate limits.
        if (res.status >= 500 || res.status === 429) {
          throw new Error(`Band API ${method} ${path} → ${res.status}`);
        }
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Band API ${method} ${path} → ${res.status}: ${text}`);
        }
        if (res.status === 204) return undefined as T;
        const json = await res.json();
        // Band wraps responses in { data: ... } — unwrap if present.
        return (json?.data ?? json) as T;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) await sleep(attempt * 800);
      }
    }
    throw lastErr;
  }

  /** Create a chat room (called by the first agent to run). */
  async createRoom(): Promise<string> {
    const data = await this.request<{ id: string }>('POST', '/agent/chats', { chat: {} });
    if (!data?.id) throw new Error(`Band createRoom: no id in response`);
    return data.id;
  }

  /** Add another agent as a participant. */
  async addParticipant(roomId: string, participantAgentId: string): Promise<void> {
    await this.request('POST', `/agent/chats/${roomId}/participants`, {
      participant: { participant_id: participantAgentId },
    });
  }

  /**
   * Post a message to the room, @mentioning specific agents.
   * Pass `mentionTargets` to direct the message (mention-triggered handoff);
   * omit to address every other agent in the room.
   */
  async postMessage(roomId: string, content: string, mentionTargets?: AgentType[]): Promise<string> {
    const targets = (Object.values(this.allConfigs) as BandAgentConfig[]).filter((c) =>
      mentionTargets ? mentionTargets.includes(c.agentType) : c.agentType !== this.agentType
    );

    // Band expects mentions as { id }; the @handle prefix lives in the content.
    const mentions = targets.map((c) => ({ id: c.agentId }));
    const prefix = targets.map((c) => (c.handle.startsWith('@') ? c.handle : `@${c.handle}`)).join(' ');
    const fullContent = prefix ? `${prefix}\n\n${content}` : content;

    const data = await this.request<{ id?: string }>(
      'POST',
      `/agent/chats/${roomId}/messages`,
      { message: { content: fullContent, mentions } }
    );
    return data?.id ?? '';
  }

  /** Post an informational event (thought / tool_call / task / error). */
  async postEvent(
    roomId: string,
    content: string,
    messageType: 'thought' | 'tool_call' | 'tool_result' | 'error' | 'task' = 'thought',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.request('POST', `/agent/chats/${roomId}/events`, {
      event: { content, message_type: messageType, ...(metadata ? { metadata } : {}) },
    });
  }

  /** Conversation context: messages this agent sent or was mentioned in. */
  async getContext(roomId: string): Promise<BandContextMessage[]> {
    const data = await this.request<{ messages?: BandContextMessage[] } | BandContextMessage[]>(
      'GET',
      `/agent/chats/${roomId}/context`
    );
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && 'messages' in data) return data.messages ?? [];
    return [];
  }

  async markProcessing(roomId: string, messageId: string): Promise<void> {
    await this.request('POST', `/agent/chats/${roomId}/messages/${messageId}/processing`);
  }

  async markProcessed(roomId: string, messageId: string): Promise<void> {
    await this.request('POST', `/agent/chats/${roomId}/messages/${messageId}/processed`);
  }

  async getMe(): Promise<{ id: string; name: string; handle: string }> {
    return this.request('GET', '/agent/me');
  }
}
