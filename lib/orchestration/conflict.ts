import type { AgentType, AgentStatus, ConflictReport } from '@/types';

export interface EvaluationSummary {
  agent_type: AgentType;
  status: AgentStatus;
}

/**
 * A conflict exists when any agent rejects. Failed agents are neutral — a crashed
 * agent must not be treated as a rejection (which would trigger a phantom
 * negotiation).
 */
export function detectConflict(evaluations: EvaluationSummary[]): ConflictReport {
  const rejectingAgents = evaluations.filter((e) => e.status === 'reject').map((e) => e.agent_type);
  const approvingAgents = evaluations.filter((e) => e.status === 'approve').map((e) => e.agent_type);
  const conditionalAgents = evaluations.filter((e) => e.status === 'conditional').map((e) => e.agent_type);
  return {
    hasConflict: rejectingAgents.length > 0,
    rejectingAgents,
    approvingAgents,
    conditionalAgents,
  };
}

/**
 * After evaluations (and any negotiation), determine the consensus outcome.
 * Any remaining rejection => no consensus. Otherwise approve, or conditional if
 * any conditions are attached.
 */
export function checkConsensus(
  evaluations: EvaluationSummary[]
): { consensus: boolean; finalStatus: 'approve' | 'conditional' } {
  const hasRejection = evaluations.some((e) => e.status === 'reject');
  const hasConditional = evaluations.some((e) => e.status === 'conditional');
  return {
    consensus: !hasRejection,
    finalStatus: hasConditional ? 'conditional' : 'approve',
  };
}
