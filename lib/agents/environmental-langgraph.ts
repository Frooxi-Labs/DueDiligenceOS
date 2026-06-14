import { EnvironmentalReportSchema, type EnvironmentalReport, type PropertyFact, type ComplianceReport } from './schemas';
import type { DealRecord } from '@/types';

const SERVICE_URL = process.env.ENVIRONMENTAL_AGENT_URL ?? 'http://127.0.0.1:8000';
const TIMEOUT_MS = 60_000;

export interface LangGraphAssessment {
  report: EnvironmentalReport;
  bandMessage: string;
  model: string;
  headline: string;
}

/**
 * Recruit the cross-framework Environmental specialist: a LangGraph (Python)
 * agent that joins the same Band room and posts its own assessment. Returns the
 * structured report for the orchestrator; throws if the service is unreachable
 * so the caller can fall back to the in-process agent.
 */
export async function assessEnvironmentalViaLangGraph(
  ctx: { deal: DealRecord; propertyFact: PropertyFact; compliance: ComplianceReport },
  roomId: string,
  mentionIds: string[]
): Promise<LangGraphAssessment> {
  const res = await fetch(`${SERVICE_URL}/assess`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deal: ctx.deal,
      property_fact: ctx.propertyFact,
      compliance: ctx.compliance,
      room_id: roomId,
      mention_ids: mentionIds,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`LangGraph env agent → ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { report: unknown; band_message?: string; model?: string };
  const report = EnvironmentalReportSchema.parse(data.report);
  return {
    report,
    bandMessage: data.band_message || report.summary,
    model: data.model ? `${data.model} (LangGraph)` : 'langgraph',
    headline: `${report.contamination_risk} contamination risk`,
  };
}
