export type AgentType =
  | 'market_analysis'
  | 'due_diligence'
  | 'risk_assessment'
  | 'legal_review'
  | 'financial_underwriting';

export type WorkflowStatus =
  | 'pending'
  | 'room_initializing'
  | 'market_analysis'
  | 'due_diligence'
  | 'risk_assessment'
  | 'legal_review'
  | 'financial_underwriting'
  | 'negotiation_round_1'
  | 'negotiation_round_2'
  | 'negotiation_round_3'
  | 'awaiting_clarification'
  | 'awaiting_human'
  | 'approved'
  | 'rejected'
  | 'failed'
  | 'timed_out';

export type AgentStatus = 'approve' | 'conditional' | 'reject' | 'failed' | 'timed_out';

export type Severity = 'critical' | 'material' | 'minor';

export interface DealBriefInput {
  title: string;
  property_type: string;
  location: string;
  size_sqft: number;
  asking_price: number;
  occupancy_pct: number;
  cap_rate_stabilized: number;
  financing_ltv: number;
  financing_rate: number;
  hold_period_years: number;
  business_context: string;
  additional_notes?: string;
}

export interface DealBrief extends DealBriefInput {
  id: string;
  status: WorkflowStatus;
  created_at: string;
  updated_at: string;
}

export interface AgentEvaluation {
  id: string;
  deal_id: string;
  agent_type: AgentType;
  execution_phase: string;
  status: AgentStatus;
  confidence: number;
  summary: string;
  raw_output: Record<string, unknown>;
  band_message_id?: string;
  model_used?: string;
  execution_time_ms?: number;
  attempt_count: number;
  created_at: string;
}

/** A normalized, per-claim finding emitted by an agent. */
export interface Finding {
  id: string;
  deal_id: string;
  agent_type: AgentType;
  claim: string;
  severity: Severity;
  confidence?: number;
  evidence: string[];
  source_document?: string;
  band_message_id?: string;
  created_at: string;
}

/** An agent-to-agent handoff: a Band @mention from one agent to another. */
export interface Mention {
  id: string;
  deal_id: string;
  from_agent: AgentType;
  to_agent: AgentType;
  reason?: string;
  band_message_id?: string;
  created_at: string;
}

export interface NegotiationRound {
  id: string;
  deal_id: string;
  round_number: number;
  conflicting_agents: AgentType[];
  round_messages: NegotiationMessage[];
  consensus_reached: boolean;
  conditions_emerged: string[];
  resolution_summary?: string;
}

export interface NegotiationMessage {
  agent_type: AgentType;
  position: 'hold_reject' | 'changed_to_conditional' | 'changed_to_approve';
  argument: string;
  concession: string | null;
  conditions: Array<{ condition: string; mandatory: boolean; owner: string }>;
  escalation_brief: string | null;
  summary: string;
}

export interface FinalDecision {
  id: string;
  deal_id: string;
  final_status: 'approved' | 'rejected';
  executive_summary?: string;
  negotiated_conditions: string[];
  human_conditions: string[];
  all_conditions: string[];
  rejection_reason?: string;
  notes?: string;
  created_at: string;
}

export interface BandRoom {
  id: string;
  deal_id: string;
  band_room_id: string;
  participant_map: Record<AgentType, string>;
}

// SSE event types pushed to the frontend
export type DealFlowEvent =
  | { type: 'room.initialized'; band_room_id: string }
  | { type: 'agent.processing'; agent: AgentType }
  | { type: 'agent.completed'; agent: AgentType; status: AgentStatus; confidence: number; summary: string }
  | { type: 'agent.failed'; agent: AgentType; reason: string }
  | { type: 'agent.mentioned'; from: AgentType; to: AgentType; reason: string }
  | { type: 'band.message'; agent: AgentType; content: string; status: AgentStatus; isNegotiation?: boolean; round?: number }
  | { type: 'clarification.needed'; agent: AgentType | 'system'; question: string }
  | { type: 'clarification.answered'; answer: string }
  | { type: 'conflict.detected'; rejecting_agents: AgentType[] }
  | { type: 'negotiation.started'; round: number }
  | { type: 'negotiation.round_complete'; round: number; consensus: boolean }
  | { type: 'approval.required'; summary: string }
  | { type: 'deal.approved'; conditions: string[] }
  | { type: 'deal.rejected'; reason: string }
  | { type: 'workflow.status'; status: WorkflowStatus }
  | { type: 'workflow.failed'; reason: string }
  | { type: 'workflow.timed_out' };

export interface AgentContext {
  dealId: string;
  deal: DealBrief;
  roomId: string;
  participantId: string;
  agentType: AgentType;
}

export interface ConflictReport {
  hasConflict: boolean;
  rejectingAgents: AgentType[];
  approvingAgents: AgentType[];
  conditionalAgents: AgentType[];
}

export interface BandMessage {
  id: string;
  content: string;
  metadata?: {
    agentType?: AgentType;
    status?: AgentStatus;
    confidence?: number;
    messageType?: string;
    dealId?: string;
  };
  created_at: string;
}

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
