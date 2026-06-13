import { describe, it, expect } from 'vitest';
import { detectContradictions, cascadeFromCompliance, compositeRiskScore } from '@/lib/orchestration/contradiction';
import type { PropertyFact, ComplianceReport, LegalRisk } from '@/lib/agents';

const pf = (over: Partial<PropertyFact> = {}): PropertyFact => ({
  agent: 'archivist',
  legal_description: 'Lot 7',
  lot_size_sqft: null,
  ownership_chain: [],
  encumbrances: [],
  improvements: [],
  existing_tenants: [],
  notable_conditions: [],
  no_easements_recorded: true,
  missing_documents: [],
  summary: 'x'.repeat(25),
  ...over,
});

const legal = (over: Partial<LegalRisk> = {}): LegalRisk => ({
  agent: 'legal',
  title_clean: true,
  easement_found_in_contract: false,
  findings: [],
  summary: 'x'.repeat(25),
  ...over,
});

const compliance = (over: Partial<ComplianceReport> = {}): ComplianceReport => ({
  agent: 'regulatory',
  risk_score: 20,
  zoning_permitted: true,
  flood_zone: null,
  findings: [],
  summary: 'x'.repeat(25),
  ...over,
});

describe('detectContradictions', () => {
  it('fires when Archivist says no easements but Legal finds one', () => {
    const c = detectContradictions(pf({ no_easements_recorded: true }), legal({ easement_found_in_contract: true }));
    expect(c).toHaveLength(1);
    expect(c[0].agents).toEqual(['archivist', 'legal']);
  });

  it('no contradiction when both agree there are no easements', () => {
    expect(detectContradictions(pf({ no_easements_recorded: true }), legal({ easement_found_in_contract: false }))).toHaveLength(0);
  });
});

describe('cascadeFromCompliance', () => {
  it('triggers a re-underwrite on a zoning conflict', () => {
    const t = cascadeFromCompliance(compliance({ zoning_permitted: false }));
    expect(t?.from).toBe('regulatory');
  });

  it('triggers on a critical finding', () => {
    const t = cascadeFromCompliance(compliance({ findings: [{ id: 'r1', title: 'x', detail: 'yyyyyyyyyy', severity: 'critical' }] }));
    expect(t).not.toBeNull();
  });

  it('no cascade when compliant and no criticals', () => {
    expect(cascadeFromCompliance(compliance())).toBeNull();
  });
});

describe('compositeRiskScore', () => {
  it('is higher when zoning is not permitted', () => {
    const clean = compositeRiskScore(pf(), compliance(), legal());
    const risky = compositeRiskScore(pf({ missing_documents: ['survey'] }), compliance({ risk_score: 90, zoning_permitted: false }), legal({ title_clean: false }));
    expect(risky).toBeGreaterThan(clean);
  });
});
