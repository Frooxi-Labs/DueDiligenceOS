/** Core committee agents — TypeScript, run via runAgent (one structured pass each). */
export type CoreAgentType = 'archivist' | 'regulatory' | 'financial' | 'legal' | 'synthesis';
/** Quantitative specialists — Python/LangGraph, recruited on demand for probabilistic modeling. */
export type SpecialistType = 'environmental' | 'capex' | 'insurance';
/** Any participant in a Band room (committee agent or recruited specialist). */
export type AgentType = CoreAgentType | SpecialistType;

export type WorkflowStatus =
  | 'pending'
  | 'intake'
  | 'escalated' // missing documents — paused for the human
  | 'analysis' // regulatory + legal
  | 'financial'
  | 'synthesis'
  | 'awaiting_human'
  | 'decided'
  | 'failed';

export type Severity = 'critical' | 'material' | 'minor';
export type Signal = 'red' | 'yellow' | 'green';
export type HumanDecision = 'proceed' | 'remediate' | 'renegotiate' | 'reject';
/** The decision branches that can be simulated as a counterfactual child room. */
export type SimBranch = 'proceed' | 'remediate' | 'renegotiate';
export type AcquisitionType = 'residential' | 'commercial' | 'mixed_use' | 'development';

/** A ranked finding emitted by an analysis agent. */
export interface Finding {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  source_agent: AgentType;
  source_document?: string;
  /** Set when this finding may contradict an earlier claim. */
  references_prior_claim_id?: string;
}

/** An agent-to-agent handoff: a Band @mention from one agent to another. */
export interface Handoff {
  from: AgentType;
  to: AgentType;
  reason: string;
}

export interface DealTerms {
  title: string;
  acquisition_type: AcquisitionType;
  intended_use: string;
  purchase_price: number;
  financing_ltv: number;
  financing_rate: number;
  hold_period_years: number;
  /** Raw deal-package text (title deed, contract, inspection, disclosures, …). */
  documents: string;
}

export interface DealRecord extends DealTerms {
  id: string;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

/** A simulated outcome for one human-decision branch (counterfactual fork). */
export interface ForkProjection {
  branch: SimBranch;
  projected_irr_pct: number;
  residual_risk: 'low' | 'medium' | 'high';
  time_to_close: string;
  deal_survival: 'likely' | 'uncertain' | 'at risk';
  rationale: string;
  /** The Band child room this branch was deliberated in. */
  child_room_id?: string;
  /** The actual back-and-forth that happened inside the child room. */
  transcript?: { agent: AgentType; content: string }[];
}

// SSE events streamed to the browser.
export type DealEvent =
  | { type: 'room.initialized'; band_room_id: string }
  | { type: 'agent.processing'; agent: AgentType }
  | { type: 'agent.completed'; agent: AgentType; headline: string; model?: string }
  | { type: 'agent.failed'; agent: AgentType; reason: string }
  | { type: 'agent.mentioned'; from: AgentType; to: AgentType; reason: string }
  | { type: 'agent.recruited'; by: AgentType; agent: AgentType; reason: string }
  | { type: 'delegation'; id: string; from: AgentType; to: AgentType; intent: string; authority: string; status: 'open' | 'processing' | 'done' }
  | { type: 'band.event'; agent: AgentType; kind: 'thought' | 'tool_call' | 'tool_result' | 'error'; content: string; room?: SimBranch }
  | { type: 'band.message'; agent: AgentType; content: string }
  | { type: 'room.system'; content: string }
  | { type: 'escalation.needed'; missing: string[] }
  | { type: 'contradiction.detected'; title: string; detail: string; agents: AgentType[] }
  | { type: 'financial.recalculated'; irr_before: number; irr_after: number; trigger: string }
  | { type: 'fork.started'; branch: SimBranch }
  | { type: 'fork.thinking'; branch: SimBranch; agent: AgentType }
  | { type: 'fork.message'; branch: SimBranch; agent: AgentType; content: string }
  | { type: 'fork.simulated'; projections: ForkProjection[] }
  | {
      type: 'approval.required';
      summary: string;
      composite_score: number;
      signal: Signal;
      recommendation: string;
      top_findings: { title: string; detail: string; severity: Severity }[];
      conditions: string[];
    }
  | { type: 'human.challenge'; decision: HumanDecision; message: string }
  | { type: 'decision.document'; decision: HumanDecision; content: string }
  | { type: 'deal.decided'; decision: HumanDecision; conditions: string[] }
  | { type: 'workflow.status'; status: WorkflowStatus }
  | { type: 'workflow.failed'; reason: string };

export interface WorkflowEvent {
  id: string;
  deal_id: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  agent_type?: AgentType;
  triggered_by: string;
  payload: Record<string, unknown>;
  created_at: string;
}
