import { jsonrepair } from 'jsonrepair';
import type { AgentOutput, ComplianceReport, FinancialModel } from './schemas';

export class BusinessLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

/** Light cross-field sanity checks beyond the Zod schema. */
export function validateBusinessLogic(output: AgentOutput): void {
  if (output.agent === 'regulatory') {
    const r = output as ComplianceReport;
    if (!r.zoning_permitted && r.findings.length === 0) {
      throw new BusinessLogicError('zoning not permitted but no findings listed');
    }
  }
  if (output.agent === 'financial') {
    const f = output as FinancialModel;
    if (f.phase === 'revised' && !f.triggered_by) {
      throw new BusinessLogicError('revised financial model must record what triggered it');
    }
  }
}

/** Extract a JSON object from a raw LLM response (tolerant of fences/preamble). */
export function parseAgentOutput(raw: string): unknown {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`Output contains no JSON object. Preview: "${cleaned.substring(0, 150)}"`);
  }
  const slice = cleaned.substring(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    // LLMs (notably Gemini in JSON mode) occasionally drop commas between array
    // elements / object members, or leave trailing commas. jsonrepair fixes the
    // full class of these structural slips robustly.
    try {
      return JSON.parse(jsonrepair(slice));
    } catch (e) {
      throw new Error(`Could not parse JSON: ${(e as Error).message}. Preview: "${slice.substring(0, 150)}"`);
    }
  }
}

/** True if a report carries a deal-breaking (Critical) finding — drives the cascade. */
export function hasCriticalFinding(report: { findings: { severity: string }[] }): boolean {
  return report.findings.some((f) => f.severity === 'critical');
}
