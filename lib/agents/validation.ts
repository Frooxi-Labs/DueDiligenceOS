import { AgentOutput, FinancialUnderwritingOutput } from './schemas';

export class BusinessLogicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

/** Cross-field sanity checks an LLM might violate even with a valid schema. */
export function validateBusinessLogic(output: AgentOutput): void {
  // Critical risk cannot produce approve.
  if ('overall_risk_level' in output) {
    if (output.overall_risk_level === 'critical' && output.status === 'approve') {
      throw new BusinessLogicError('Critical risk level cannot produce approve status');
    }
  }

  // Budget incompatible cannot produce approve.
  if ('budget_compatible' in output) {
    if (!output.budget_compatible && output.status === 'approve') {
      throw new BusinessLogicError('budget_compatible is false but status is approve');
    }
  }

  // Reject must carry conditions or a detailed summary.
  if (output.status === 'reject') {
    const conditionsKeys = ['conditions_for_approval', 'conditions_required'];
    const hasConditions = conditionsKeys.some((k) => {
      const val = (output as Record<string, unknown>)[k];
      return Array.isArray(val) && val.length > 0;
    });
    if (!hasConditions && output.summary.length < 50) {
      throw new BusinessLogicError('Reject status requires conditions or a detailed summary');
    }
  }

  // Finance: total equity must be positive.
  if (output.agent === 'financial_underwriting') {
    const fo = output as FinancialUnderwritingOutput;
    if (fo.cost_model.total_equity_required <= 0) {
      throw new BusinessLogicError('Total equity required must be a positive number');
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
  cleaned = cleaned.substring(start, end + 1);
  return JSON.parse(cleaned);
}
