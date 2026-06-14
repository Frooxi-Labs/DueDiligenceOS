import type { ZodTypeAny } from 'zod';
import type { AgentType, DealRecord } from '@/types';
import {
  PropertyFactSchema,
  ComplianceReportSchema,
  FinancialModelSchema,
  LegalRiskSchema,
  DealMemoSchema,
  type AgentOutput,
  type PropertyFact,
  type ComplianceReport,
  type FinancialModel,
  type LegalRisk,
  type DealMemo,
} from './schemas';

/** Everything an agent might need; each agent uses the parts relevant to it. */
export interface AgentPromptContext {
  deal: DealRecord;
  propertyFact?: PropertyFact;
  compliance?: ComplianceReport;
  legal?: LegalRisk;
  financialBaseline?: FinancialModel;
  /** Present when Financial is re-underwriting due to a Critical upstream flag. */
  cascade?: { trigger: string; delta: string };
  lastError: string | null;
  attempt: number;
}

export interface AgentDefinition {
  agentType: AgentType;
  title: string;
  schema: ZodTypeAny;
  buildPrompt(ctx: AgentPromptContext): string;
  formatBandMessage(output: AgentOutput): string;
  headline(output: AgentOutput): string;
}

/** Evaluation order. Regulatory + Legal both read PropertyFact; Financial reads both. */
export const AGENT_SEQUENCE: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis'];

const retry = (ctx: AgentPromptContext) =>
  ctx.lastError ? `\n⚠️ ATTEMPT ${ctx.attempt - 1} FAILED: ${ctx.lastError}\nFix the exact error and return valid JSON.\n` : '';

const dealTerms = (d: DealRecord) =>
  `Acquisition type: ${d.acquisition_type}\nIntended use: ${d.intended_use}\nPurchase price: $${Number(d.purchase_price).toLocaleString()}\nFinancing: ${d.financing_ltv}% LTV at ${d.financing_rate}%\nHold period: ${d.hold_period_years} years`;

const factBlock = (pf?: PropertyFact) =>
  pf
    ? `PROPERTY FACTS (from Archivist):\n- Legal description: ${pf.legal_description}\n- Encumbrances: ${pf.encumbrances.map((e) => `${e.kind} (${e.recorded ? 'recorded' : 'unrecorded'})`).join('; ') || 'none listed'}\n- No easements recorded: ${pf.no_easements_recorded}\n- Tenants: ${pf.existing_tenants.join(', ') || 'none'}\n- Notable: ${pf.notable_conditions.join('; ') || 'none'}`
    : '';

export const AGENTS: Record<AgentType, AgentDefinition> = {
  archivist: {
    agentType: 'archivist',
    title: 'Archivist',
    schema: PropertyFactSchema,
    buildPrompt(ctx) {
      return `You are the Archivist — the document-intelligence intake agent for a real-estate due-diligence committee.
Extract structured facts from the deal package below. Use ONLY what the documents state; do not invent.
Set no_easements_recorded=true ONLY if the title record explicitly shows no recorded easements.
List any required-but-missing documents (e.g. survey, title deed, purchase contract, inspection) in missing_documents.

DEAL TERMS:
${dealTerms(ctx.deal)}

DEAL DOCUMENTS:
"""
${ctx.deal.documents}
"""
${retry(ctx)}
Return ONLY JSON: { "agent": "archivist", "legal_description": "...", "lot_size_sqft": <number|null>, "ownership_chain": [{"owner":"...","instrument":"..."}], "encumbrances": [{"kind":"...","description":"...","recorded":<bool>}], "improvements": ["..."], "existing_tenants": ["..."], "notable_conditions": ["..."], "no_easements_recorded": <bool>, "missing_documents": ["..."], "summary": "<20-400 chars>" }
Start with { and end with }.`;
    },
    formatBandMessage(o) {
      const pf = o as PropertyFact;
      const miss = pf.missing_documents.length
        ? ` One gap before we go further — I couldn't find these in the package: ${pf.missing_documents.join(', ')}.`
        : '';
      return `${pf.summary}${miss}`;
    },
    headline(o) {
      const pf = o as PropertyFact;
      return pf.missing_documents.length ? `${pf.missing_documents.length} docs missing` : 'PropertyFact extracted';
    },
  },

  regulatory: {
    agentType: 'regulatory',
    title: 'Regulatory',
    schema: ComplianceReportSchema,
    buildPrompt(ctx) {
      return `You are the Regulatory (compliance) agent. Read the property facts and the intended use, then assess:
zoning vs intended use (permitted?), permits/violations, environmental (flood/FEMA, contamination), HOA/deed restrictions, easements.
Rank each finding severity: critical (deal-breaking) | material (renegotiation-worthy) | minor (disclosure only).

${factBlock(ctx.propertyFact)}

DEAL TERMS:
${dealTerms(ctx.deal)}
${retry(ctx)}
Return ONLY JSON: { "agent": "regulatory", "risk_score": <0-100>, "zoning_permitted": <bool>, "flood_zone": <string|null>, "findings": [{"id":"reg-...","title":"...","detail":"...","severity":"critical|material|minor"}], "summary": "<20-400 chars>" }
Start with { and end with }.`;
    },
    formatBandMessage(o) {
      return (o as ComplianceReport).summary;
    },
    headline(o) {
      return `risk ${(o as ComplianceReport).risk_score}/100`;
    },
  },

  legal: {
    agentType: 'legal',
    title: 'Legal Risk',
    schema: LegalRiskSchema,
    buildPrompt(ctx) {
      return `You are the Legal Risk agent. Review the property facts, the compliance report, and the contract text.
Flag: title defects / ownership-chain gaps, easement conflicts, undisclosed liens, non-standard or missing seller reps,
unusual contingencies, missing protections. Rank severity critical|material|minor.
CRITICAL CHECK: if the contract references an easement (e.g. a neighbor access easement) set easement_found_in_contract=true —
this may contradict the Archivist's recorded-easement finding.

${factBlock(ctx.propertyFact)}

COMPLIANCE: ${ctx.compliance ? `risk ${ctx.compliance.risk_score}/100, zoning_permitted=${ctx.compliance.zoning_permitted}` : 'n/a'}

CONTRACT / DOCUMENTS:
"""
${ctx.deal.documents}
"""
${retry(ctx)}
Return ONLY JSON: { "agent": "legal", "title_clean": <bool>, "easement_found_in_contract": <bool>, "findings": [{"id":"legal-...","title":"...","detail":"...","severity":"critical|material|minor"}], "summary": "<20-400 chars>" }
Start with { and end with }.`;
    },
    formatBandMessage(o) {
      return (o as LegalRisk).summary;
    },
    headline(o) {
      return (o as LegalRisk).title_clean ? 'title clean' : 'title issues';
    },
  },

  financial: {
    agentType: 'financial',
    title: 'Financial Underwriting',
    schema: FinancialModelSchema,
    buildPrompt(ctx) {
      const base = ctx.financialBaseline;
      return `You are the Financial Underwriting agent. Build the model: NOI, cap rate vs market, DCR, and a headline 5-year IRR (%).
${ctx.cascade ? `\n⚡ CASCADE RE-UNDERWRITE: a Critical upstream flag changed an assumption — ${ctx.cascade.trigger}. Apply: ${ctx.cascade.delta}. Your baseline IRR was ${base?.irr_pct ?? 'n/a'}%; re-run and report the REVISED IRR (it should move). phase="revised", set triggered_by and assumption_delta.\n` : '\nphase="baseline".\n'}
${factBlock(ctx.propertyFact)}
COMPLIANCE: ${ctx.compliance ? `risk ${ctx.compliance.risk_score}/100${ctx.compliance.zoning_permitted ? '' : ', ZONING CONFLICT'}` : 'n/a'}

DEAL TERMS:
${dealTerms(ctx.deal)}
${retry(ctx)}
Return ONLY JSON: { "agent": "financial", "phase": "baseline|revised", "noi": <number|null>, "cap_rate_pct": <number|null>, "dcr": <number|null>, "irr_pct": <number>, "signal": "green|yellow|red", "conditions": ["..."], "triggered_by": <string|null>, "assumption_delta": <string|null>, "summary": "<20-400 chars>" }
Start with { and end with }.`;
    },
    formatBandMessage(o) {
      const f = o as FinancialModel;
      return `${f.phase === 'revised' ? 'I re-ran the numbers. ' : ''}${f.summary}`;
    },
    headline(o) {
      return `IRR ${(o as FinancialModel).irr_pct.toFixed(1)}%`;
    },
  },

  synthesis: {
    agentType: 'synthesis',
    title: 'Synthesis',
    schema: DealMemoSchema,
    buildPrompt(ctx) {
      const findings = [
        ...(ctx.compliance?.findings ?? []).map((f) => `[Regulatory] ${f.severity}: ${f.title}`),
        ...(ctx.legal?.findings ?? []).map((f) => `[Legal] ${f.severity}: ${f.title}`),
      ].join('\n');
      return `You are Synthesis, the Deal Director. Compose the deal memo from all agents' findings.
Pick the top 5 findings by deal impact, list conditions precedent, and give a Red/Yellow/Green signal with a short recommendation.

FINANCIAL: IRR ${ctx.financialBaseline?.irr_pct ?? 'n/a'}%, signal ${ctx.financialBaseline?.signal ?? 'n/a'}
TITLE: ${ctx.legal?.title_clean ? 'clean' : 'issues'}
ALL FINDINGS:\n${findings || 'none'}
${retry(ctx)}
Return ONLY JSON: { "agent": "synthesis", "signal": "green|yellow|red", "top_findings": [{"title":"...","detail":"...","severity":"critical|material|minor"}], "conditions_precedent": ["..."], "recommendation": "<20-600 chars>" }
Start with { and end with }.`;
    },
    formatBandMessage(o) {
      return (o as DealMemo).recommendation;
    },
    headline(o) {
      return `${(o as DealMemo).signal} memo`;
    },
  },
};
