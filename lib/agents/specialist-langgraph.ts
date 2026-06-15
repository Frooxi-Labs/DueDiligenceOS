import type { AgentType, DealRecord } from '@/types';
import type { PropertyFact, ComplianceReport } from './schemas';

const SERVICE_URL = process.env.ENVIRONMENTAL_AGENT_URL ?? 'http://127.0.0.1:8000';
const TIMEOUT_MS = 60_000;

export interface SpecialistAssessment {
  headline: string;
  summary: string;
  bandMessage: string;
  model: string;
  report: unknown;
}

/**
 * Recruit a cross-framework quantitative specialist: a LangGraph (Python) agent
 * that reads the same Band room, runs a deterministic / Monte-Carlo model, and
 * returns an auditable result. `type` is environmental | capex | insurance.
 * Throws if the service is unreachable so the caller can degrade gracefully.
 */
export async function assessSpecialist(
  type: AgentType,
  ctx: { deal: DealRecord; propertyFact: PropertyFact; compliance: ComplianceReport },
  roomId: string,
  mentionIds: string[]
): Promise<SpecialistAssessment> {
  const res = await fetch(`${SERVICE_URL}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      deal: ctx.deal,
      property_fact: ctx.propertyFact,
      compliance: ctx.compliance,
      room_id: roomId,
      mention_ids: mentionIds,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LangGraph specialist ${type} → ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { report?: { summary?: string }; band_message?: string; headline?: string; model?: string };
  const report = data.report ?? {};
  const summary = report.summary || data.band_message || '';
  return {
    headline: data.headline || '',
    summary,
    bandMessage: data.band_message || summary,
    model: data.model ? `${data.model} (LangGraph)` : 'langgraph',
    report,
  };
}
