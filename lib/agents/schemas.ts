import { z } from 'zod';

export const MarketAnalysisSchema = z.object({
  agent: z.literal('market_analysis'),
  status: z.enum(['approve', 'conditional', 'reject']),
  submarket_assessment: z.object({
    trend: z.enum(['growth', 'stable', 'softening', 'declining']),
    occupancy_market_avg: z.number().min(0).max(100),
    rent_growth_3yr_pct: z.number().nullable().default(0),
    competing_supply_risk: z.enum(['none', 'low', 'medium', 'high']),
    competing_supply_detail: z.string(),
  }),
  comparable_analysis: z.object({
    price_per_sqft_market: z.number().nullable().default(0),
    deal_price_per_sqft: z.number(),
    premium_discount_pct: z.number().nullable().default(0),
    assessment: z.string().min(20),
  }),
  timing_assessment: z.enum(['optimal', 'acceptable', 'unfavorable']),
  key_positives: z.array(z.string()).max(4),
  key_concerns: z.array(z.string()).max(4),
  flags_for_downstream: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
});

export const DueDiligenceSchema = z.object({
  agent: z.literal('due_diligence'),
  status: z.enum(['approve', 'conditional', 'reject']),
  property_condition: z.object({
    overall_grade: z.enum(['A', 'B', 'C', 'D']),
    estimated_capex_year1: z.number().min(0),
    estimated_capex_5yr: z.number().min(0),
    major_systems_status: z.string().min(10),
    deferred_maintenance_risk: z.enum(['none', 'low', 'medium', 'high']),
  }),
  zoning_compliance: z.object({
    current_use_compliant: z.boolean(),
    rezoning_risk: z.enum(['none', 'low', 'medium', 'high']),
    notes: z.string(),
  }),
  operational_concerns: z.array(z.string()).max(5),
  conditions_required: z.array(z.string()),
  flags_for_risk_and_legal: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
});

export const RiskAssessmentSchema = z.object({
  agent: z.literal('risk_assessment'),
  status: z.enum(['approve', 'conditional', 'reject']),
  overall_risk_level: z.enum(['low', 'medium', 'high', 'critical']),
  risk_factors: z.array(z.object({
    category: z.enum(['market', 'vacancy', 'financing', 'operational', 'exit', 'macro']),
    risk: z.string(),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    mitigable: z.boolean(),
    mitigation: z.string().optional(),
  })).max(8),
  vacancy_risk_assessment: z.object({
    current_vacancy_pct: z.number(),
    market_vacancy_trend: z.enum(['improving', 'stable', 'worsening']),
    absorption_estimate_months: z.number(),
    risk_rating: z.enum(['low', 'medium', 'high', 'critical']),
  }),
  financing_risk: z.enum(['low', 'medium', 'high']),
  exit_risk: z.enum(['low', 'medium', 'high']),
  conditions_for_approval: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
});

export const LegalReviewSchema = z.object({
  agent: z.literal('legal_review'),
  status: z.enum(['approve', 'conditional', 'reject']),
  title_assessment: z.object({
    clean: z.boolean(),
    encumbrances: z.array(z.string()),
    liens: z.array(z.string()),
    risk_level: z.enum(['low', 'medium', 'high']),
  }),
  lease_analysis: z.object({
    existing_leases_count: z.number(),
    problematic_clauses: z.array(z.string()),
    early_termination_risk: z.enum(['none', 'low', 'medium', 'high']),
    lease_expiry_concentration: z.string(),
  }),
  regulatory_compliance: z.object({
    compliant: z.boolean(),
    outstanding_issues: z.array(z.string()),
    remediation_required: z.array(z.string()),
  }),
  required_legal_protections: z.array(z.object({
    protection: z.string(),
    priority: z.enum(['mandatory', 'recommended']),
  })),
  estimated_legal_cost: z.number().min(0),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
});

export const FinancialUnderwritingSchema = z.object({
  agent: z.literal('financial_underwriting'),
  status: z.enum(['approve', 'conditional', 'reject']),
  acquisition_metrics: z.object({
    purchase_price: z.number(),
    price_per_sqft: z.number(),
    going_in_cap_rate: z.number(),
    stabilized_cap_rate: z.number(),
    year1_noi: z.number(),
    stabilized_noi: z.number(),
  }),
  returns_analysis: z.object({
    projected_irr_5yr: z.number(),
    equity_multiple: z.number(),
    cash_on_cash_year1: z.number(),
    dscr: z.number(),
    meets_investment_threshold: z.boolean(),
  }),
  cost_model: z.object({
    acquisition_cost: z.number(),
    closing_costs: z.number(),
    capex_year1: z.number(),
    legal_overhead: z.number(),
    risk_reserve_required: z.number(),
    total_equity_required: z.number(),
  }),
  budget_compatible: z.boolean(),
  financial_risks: z.array(z.string()),
  investment_committee_recommendation: z.string().max(300),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(20).max(300),
});

export const NegotiationOutputSchema = z.object({
  agent: z.string(),
  round: z.number().min(1).max(3),
  position: z.enum(['hold_reject', 'changed_to_conditional', 'changed_to_approve']),
  argument: z.string().min(20).max(1000),
  concession: z.string().nullable(),
  conditions: z.array(z.object({
    condition: z.string(),
    mandatory: z.boolean(),
    owner: z.string(),
  })),
  escalation_brief: z.string().nullable(),
  summary: z.string().min(10).max(200),
});

export type MarketAnalysisOutput = z.infer<typeof MarketAnalysisSchema>;
export type DueDiligenceOutput = z.infer<typeof DueDiligenceSchema>;
export type RiskAssessmentOutput = z.infer<typeof RiskAssessmentSchema>;
export type LegalReviewOutput = z.infer<typeof LegalReviewSchema>;
export type FinancialUnderwritingOutput = z.infer<typeof FinancialUnderwritingSchema>;
export type NegotiationOutput = z.infer<typeof NegotiationOutputSchema>;

export type AgentOutput =
  | MarketAnalysisOutput
  | DueDiligenceOutput
  | RiskAssessmentOutput
  | LegalReviewOutput
  | FinancialUnderwritingOutput;
