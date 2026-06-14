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
  let cleaned = raw
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
  // Try increasingly aggressive repairs for the common LLM/JSON-mode slips.
  const noTrailingCommas = (s: string) => s.replace(/,(\s*[}\]])/g, '$1');
  // Insert a missing comma between two elements/members split across a newline
  // (e.g. `}\n{`, `]\n[`, `"a"\n"b"`, `5\n"c"`) — a known Gemini glitch.
  const addMissingCommas = (s: string) => s.replace(/([}\]"\d])(\s*\n\s*)(["{[])/g, '$1,$2$3');
  const attempts = [slice, noTrailingCommas(slice), addMissingCommas(noTrailingCommas(slice))];
  let lastErr: unknown;
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Could not parse JSON: ${(lastErr as Error).message}. Preview: "${slice.substring(0, 150)}"`);
}

/** True if a report carries a deal-breaking (Critical) finding — drives the cascade. */
export function hasCriticalFinding(report: { findings: { severity: string }[] }): boolean {
  return report.findings.some((f) => f.severity === 'critical');
}
