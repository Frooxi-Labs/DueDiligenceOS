/**
 * Agents module — the due-diligence committee.
 *
 * Pure reasoning: each agent turns the deal package + prior findings into a
 * schema-validated output (Archivist → PropertyFact, Regulatory →
 * ComplianceReport, Financial → FinancialModel, Legal → LegalRisk, Synthesis →
 * DealMemo). No Band or database side effects — the orchestration module wires
 * those — so the agents are reusable on their own.
 */
export { runAgent, AgentExecutionError } from './run';
export type { AgentRunResult } from './run';
export { AGENTS, AGENT_SEQUENCE } from './definitions';
export type { AgentDefinition, AgentPromptContext } from './definitions';
export { parseAgentOutput, validateBusinessLogic, hasCriticalFinding, BusinessLogicError } from './validation';
export { assessEnvironmentalViaLangGraph } from './environmental-langgraph';
export type { LangGraphAssessment } from './environmental-langgraph';
export * from './schemas';
