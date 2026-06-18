import { z } from 'zod';

const Severity = z.enum(['critical', 'material', 'minor']);
const Signal = z.enum(['red', 'yellow', 'green']);

/** A ranked finding as emitted by an analysis agent (LLM output). */
export const FindingSchema = z.object({
  id: z.string(),
  title: z.string().min(3),
  detail: z.string().min(10),
  severity: Severity,
  source_document: z.string().optional(),
});

// ── Archivist: structured facts extracted from the deal documents ────────────
export const PropertyFactSchema = z.object({
  agent: z.literal('archivist'),
  // Tolerate the model returning null when a field isn't in the documents.
  legal_description: z.string().nullish().transform((v) => v ?? 'Not specified in the documents'),
  lot_size_sqft: z.number().nullable().default(null),
  ownership_chain: z.array(z.object({ owner: z.string(), instrument: z.string().optional() })).default([]),
  encumbrances: z
    .array(z.object({ kind: z.string(), description: z.string(), recorded: z.boolean() }))
    .default([]),
  improvements: z.array(z.string()).default([]),
  existing_tenants: z.array(z.string()).default([]),
  notable_conditions: z.array(z.string()).default([]),
  /** True if the title record shows NO recorded easements — Legal may contradict this. */
  no_easements_recorded: z.boolean(),
  /** Required-but-absent documents; non-empty => escalate to the human. */
  missing_documents: z.array(z.string()).default([]),
  summary: z.string().min(20).transform((s) => s.trim().slice(0, 1000)),
});

// A task an agent decides — from context — to hand to another committee agent.
export const DelegationRequestSchema = z.object({
  to: z.enum(['archivist', 'regulatory', 'legal', 'financial', 'synthesis']),
  intent: z.string().min(3),
  authority: z.string().default(''),
});
// A specialist an agent decides — from context — to pull into the room.
export const SpecialistRequestSchema = z.object({
  specialist: z.enum(['environmental', 'capex', 'insurance']),
  reason: z.string().min(3),
});

// ── Regulatory: compliance assessment ────────────────────────────────────────
export const ComplianceReportSchema = z.object({
  agent: z.literal('regulatory'),
  risk_score: z.number().min(0).max(100),
  zoning_permitted: z.boolean(),
  flood_zone: z.string().nullable().default(null),
  findings: z.array(FindingSchema).default([]),
  /** Emergent: tasks this agent hands to other committee agents (any topic). */
  delegations: z.array(DelegationRequestSchema).default([]),
  /** Emergent: specialists this agent decides the deal needs. */
  requested_specialists: z.array(SpecialistRequestSchema).default([]),
  summary: z.string().min(20).transform((s) => s.trim().slice(0, 1000)),
});

// ── Financial: underwriting model (two-phase: baseline | revised) ────────────
export const FinancialModelSchema = z.object({
  agent: z.literal('financial'),
  phase: z.enum(['baseline', 'revised']),
  noi: z.number().nullable().default(null),
  cap_rate_pct: z.number().nullable().default(null),
  dcr: z.number().nullable().default(null),
  /** Headline 5-year IRR (%). The number that visibly moves on a cascade. */
  irr_pct: z.number(),
  signal: Signal,
  conditions: z.array(z.string()).default([]),
  /** Set on the revised phase: what assumption changed and who triggered it. */
  triggered_by: z.string().nullable().default(null),
  assumption_delta: z.string().nullable().default(null),
  summary: z.string().min(20).transform((s) => s.trim().slice(0, 1000)),
});

// ── Legal: contract & title review ───────────────────────────────────────────
export const LegalRiskSchema = z.object({
  agent: z.literal('legal'),
  title_clean: z.boolean(),
  /** True if Legal read an easement in the contract — may contradict PropertyFact. */
  easement_found_in_contract: z.boolean(),
  findings: z.array(FindingSchema).default([]),
  /** Emergent: tasks this agent hands to other committee agents (any topic). */
  delegations: z.array(DelegationRequestSchema).default([]),
  /** Emergent: specialists this agent decides the deal needs. */
  requested_specialists: z.array(SpecialistRequestSchema).default([]),
  summary: z.string().min(20).transform((s) => s.trim().slice(0, 1000)),
});

// Environmental, CapEx, and Insurance are Python/LangGraph specialists — they
// return their own (free-form) assessment over HTTP, so they have no Zod schema here.

// ── Synthesis: the deal memo (composite score is computed in code) ───────────
export const DealMemoSchema = z.object({
  agent: z.literal('synthesis'),
  signal: Signal,
  top_findings: z.array(z.object({ title: z.string(), detail: z.string(), severity: Severity })).max(5).default([]),
  conditions_precedent: z.array(z.string()).default([]),
  recommendation: z.string().min(20).transform((s) => s.trim().slice(0, 1400)),
});

export type Finding = z.infer<typeof FindingSchema>;
export type PropertyFact = z.infer<typeof PropertyFactSchema>;
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;
export type FinancialModel = z.infer<typeof FinancialModelSchema>;
export type LegalRisk = z.infer<typeof LegalRiskSchema>;
export type DealMemo = z.infer<typeof DealMemoSchema>;

export type AgentOutput =
  | PropertyFact
  | ComplianceReport
  | FinancialModel
  | LegalRisk
  | DealMemo;
