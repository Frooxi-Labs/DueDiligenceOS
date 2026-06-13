/**
 * Orchestration module — the workflow engine.
 *
 * Owns the deal lifecycle and the gates (ordering, persistence, conflict
 * detection, the human-approval handoff) while the agents collaborate *through*
 * Band: each agent posts to the room and hands off to the next via a targeted
 * @mention. This is the app-specific glue that wires the band, agents,
 * persistence, and realtime modules together.
 *
 * Public API: `runWorkflow`, `detectConflict`, `checkConsensus`.
 */
export { runWorkflow } from './workflow';
export { detectConflict, checkConsensus } from './conflict';
export type { EvaluationSummary } from './conflict';
