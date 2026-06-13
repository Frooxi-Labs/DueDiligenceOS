import { describe, it, expect } from 'vitest';
import { detectConflict, checkConsensus } from '@/lib/orchestration/conflict';
import type { AgentType } from '@/types';

const ev = (agent_type: AgentType, status: string) => ({ agent_type, status: status as never });

describe('detectConflict', () => {
  it('flags a conflict when any agent rejects', () => {
    const r = detectConflict([
      ev('market_analysis', 'approve'),
      ev('risk_assessment', 'reject'),
      ev('legal_review', 'conditional'),
    ]);
    expect(r.hasConflict).toBe(true);
    expect(r.rejectingAgents).toEqual(['risk_assessment']);
    expect(r.approvingAgents).toEqual(['market_analysis']);
    expect(r.conditionalAgents).toEqual(['legal_review']);
  });

  it('treats a failed agent as neutral (no phantom conflict)', () => {
    const r = detectConflict([
      ev('market_analysis', 'approve'),
      ev('due_diligence', 'failed'),
    ]);
    expect(r.hasConflict).toBe(false);
    expect(r.rejectingAgents).toEqual([]);
  });

  it('no conflict when all approve', () => {
    const r = detectConflict([ev('market_analysis', 'approve'), ev('legal_review', 'approve')]);
    expect(r.hasConflict).toBe(false);
  });
});

describe('checkConsensus', () => {
  it('no consensus while a rejection remains', () => {
    expect(checkConsensus([ev('risk_assessment', 'reject')]).consensus).toBe(false);
  });

  it('consensus = conditional when conditions are attached', () => {
    const c = checkConsensus([ev('market_analysis', 'approve'), ev('legal_review', 'conditional')]);
    expect(c.consensus).toBe(true);
    expect(c.finalStatus).toBe('conditional');
  });

  it('consensus = approve when all clear', () => {
    const c = checkConsensus([ev('market_analysis', 'approve'), ev('legal_review', 'approve')]);
    expect(c.finalStatus).toBe('approve');
  });
});
