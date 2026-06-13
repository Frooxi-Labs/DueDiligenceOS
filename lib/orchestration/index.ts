/**
 * Orchestration module — the workflow engine.
 *
 * Owns the deal lifecycle and gates (ordering, persistence, contradiction
 * detection, the cascade re-underwrite, the human-approval handoff) while the
 * agents collaborate *through* Band via targeted @mentions.
 */
export { runWorkflow } from './workflow';
export { detectContradictions, cascadeFromCompliance, compositeRiskScore } from './contradiction';
export type { Contradiction, CascadeTrigger } from './contradiction';
export { applyHumanDecision } from './decision';
export type { HumanDecisionInput } from './decision';
