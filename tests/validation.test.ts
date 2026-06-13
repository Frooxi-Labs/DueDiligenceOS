import { describe, it, expect } from 'vitest';
import { parseAgentOutput, validateBusinessLogic, BusinessLogicError } from '@/lib/agents/validation';
import type { AgentOutput } from '@/lib/agents/schemas';

describe('parseAgentOutput', () => {
  it('parses clean JSON', () => {
    expect(parseAgentOutput('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(parseAgentOutput('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON from surrounding preamble', () => {
    expect(parseAgentOutput('Sure! Here:\n{"a":1}\nThanks')).toEqual({ a: 1 });
  });

  it('throws when there is no JSON object', () => {
    expect(() => parseAgentOutput('no json here')).toThrow();
  });
});

describe('validateBusinessLogic', () => {
  it('rejects critical risk + approve', () => {
    const out = {
      agent: 'risk_assessment',
      status: 'approve',
      overall_risk_level: 'critical',
      summary: 'x'.repeat(60),
    } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).toThrow(BusinessLogicError);
  });

  it('rejects budget-incompatible + approve', () => {
    const out = {
      agent: 'financial_underwriting',
      status: 'approve',
      budget_compatible: false,
      summary: 'x'.repeat(60),
      cost_model: { total_equity_required: 100 },
    } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).toThrow(BusinessLogicError);
  });

  it('rejects finance with non-positive equity', () => {
    const out = {
      agent: 'financial_underwriting',
      status: 'conditional',
      budget_compatible: true,
      summary: 'x'.repeat(60),
      cost_model: { total_equity_required: 0 },
    } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).toThrow(BusinessLogicError);
  });

  it('passes a clean approve', () => {
    const out = {
      agent: 'market_analysis',
      status: 'approve',
      summary: 'A clean, well-grounded approval with sufficient detail.',
    } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).not.toThrow();
  });
});
