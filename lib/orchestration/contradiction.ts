import type { AgentType } from '@/types';
import type { ComplianceReport, LegalRisk, PropertyFact } from '@/lib/agents';
import { hasCriticalFinding } from '@/lib/agents';

export interface Contradiction {
  title: string;
  detail: string;
  agents: AgentType[];
}

/**
 * Code-level contradiction detection over typed fields — deterministic, so the
 * demo's centerpiece fires every run. The canonical case: Archivist reported no
 * recorded easements, but Legal read an easement in the contract.
 */
export function detectContradictions(pf: PropertyFact, legal: LegalRisk): Contradiction[] {
  const out: Contradiction[] = [];
  if (pf.no_easements_recorded && legal.easement_found_in_contract) {
    out.push({
      title: 'Undisclosed easement contradicts the title record',
      detail:
        'Archivist extracted "no easements recorded" from the title documents, but Legal found an easement referenced in the contract. Surfaced as Critical rather than silently overwritten.',
      agents: ['archivist', 'legal'],
    });
  }
  return out;
}

export interface CascadeTrigger {
  trigger: string;
  delta: string;
  from: AgentType;
}

/**
 * Decide whether Financial must re-underwrite, and why. A Critical regulatory
 * flag (or a zoning conflict) changes the revenue assumptions.
 */
export function cascadeFromCompliance(compliance: ComplianceReport): CascadeTrigger | null {
  if (!compliance.zoning_permitted) {
    return {
      trigger: 'Regulatory: zoning conflict (intended use not permitted)',
      delta: 'Apply a value haircut for restricted use and re-run with conservative occupancy/revenue assumptions.',
      from: 'regulatory',
    };
  }
  if (hasCriticalFinding(compliance)) {
    const crit = compliance.findings.find((f) => f.severity === 'critical');
    return {
      trigger: `Regulatory: critical flag — ${crit?.title ?? 'compliance issue'}`,
      delta: 'Re-run with conservative assumptions reflecting the critical compliance risk.',
      from: 'regulatory',
    };
  }
  return null;
}

/** Composite risk score (0–100): Legal 35 / Regulatory 30 / Financial 25 / docs 10. */
export function compositeRiskScore(
  pf: PropertyFact,
  compliance: ComplianceReport,
  legal: LegalRisk
): number {
  const sev = (s: string) => (s === 'critical' ? 100 : s === 'material' ? 55 : 20);
  const worst = (fs: { severity: string }[]) => (fs.length ? Math.max(...fs.map((f) => sev(f.severity))) : 0);
  const legalRisk = legal.title_clean ? worst(legal.findings) * 0.6 : Math.max(60, worst(legal.findings));
  const regRisk = compliance.risk_score;
  const finRisk = 40; // neutral placeholder; signal is the financial headline
  const docRisk = pf.missing_documents.length > 0 ? 70 : 0;
  return Math.round(legalRisk * 0.35 + regRisk * 0.3 + finRisk * 0.25 + docRisk * 0.1);
}
