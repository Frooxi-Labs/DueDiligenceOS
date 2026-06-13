import { describe, it, expect } from 'vitest';
import { parseAgentOutput, validateBusinessLogic, hasCriticalFinding, BusinessLogicError } from '@/lib/agents/validation';
import type { AgentOutput } from '@/lib/agents/schemas';

describe('parseAgentOutput', () => {
  it('parses clean JSON', () => expect(parseAgentOutput('{"a":1}')).toEqual({ a: 1 }));
  it('strips markdown fences', () => expect(parseAgentOutput('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('extracts JSON from preamble', () => expect(parseAgentOutput('Here:\n{"a":1}\nthx')).toEqual({ a: 1 }));
  it('throws when no JSON', () => expect(() => parseAgentOutput('nope')).toThrow());
});

describe('validateBusinessLogic', () => {
  it('rejects regulatory: zoning not permitted but no findings', () => {
    const out = { agent: 'regulatory', risk_score: 80, zoning_permitted: false, findings: [], summary: 'x' } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).toThrow(BusinessLogicError);
  });

  it('rejects revised financial with no trigger', () => {
    const out = { agent: 'financial', phase: 'revised', irr_pct: 9, signal: 'yellow', triggered_by: null } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).toThrow(BusinessLogicError);
  });

  it('passes a clean baseline financial', () => {
    const out = { agent: 'financial', phase: 'baseline', irr_pct: 12, signal: 'green', triggered_by: null } as unknown as AgentOutput;
    expect(() => validateBusinessLogic(out)).not.toThrow();
  });
});

describe('hasCriticalFinding', () => {
  it('detects a critical finding', () => {
    expect(hasCriticalFinding({ findings: [{ severity: 'material' }, { severity: 'critical' }] })).toBe(true);
    expect(hasCriticalFinding({ findings: [{ severity: 'minor' }] })).toBe(false);
  });
});
