/**
 * Agents module — the specialist committee members.
 *
 * Pure reasoning: each agent turns a deal + the prior room context into a
 * schema-validated evaluation. No Band or database side effects (the
 * orchestration module wires those), so the agents are reusable on their own.
 *
 * Public API: `runAgent`, `AGENTS`, `AGENT_SEQUENCE`, schemas, and validation.
 */
export { runAgent, AgentExecutionError } from './run';
export type { AgentRunResult } from './run';
export { AGENTS, AGENT_SEQUENCE } from './definitions';
export type { AgentDefinition } from './definitions';
export { parseAgentOutput, validateBusinessLogic, BusinessLogicError } from './validation';
export * from './schemas';
