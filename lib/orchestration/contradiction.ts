import type { AgentType } from '@/types';
import type { ComplianceReport, LegalRisk, PropertyFact } from '@/lib/agents';
import { hasCriticalFinding } from '@/lib/agents';
import { callLLM } from '@/lib/providers';

export interface Contradiction {
  title: string;
  detail: string;
  agents: AgentType[];
}

const ROSTER: AgentType[] = ['archivist', 'regulatory', 'legal', 'financial', 'synthesis', 'environmental'];
const stripFences = (s: string) => s.trim().replace(/^```(?:json)?|```$/gm, '').trim();

/**
 * Deterministic baseline — guarantees the signature easement contradiction is
 * caught every run, even when the Archivist "reconciles" the boolean. It fires on
 * the SUBSTANCE: the contract records an easement that the title record omits.
 * It deliberately does NOT fire when the easement is consistently disclosed in
 * both (so it never manufactures a fake conflict).
 */
export function detectContradictions(pf: PropertyFact, legal: LegalRisk): Contradiction[] {
  const out: Contradiction[] = [];
  const contractHasEasement =
    legal.easement_found_in_contract || legal.findings.some((f) => /easement/i.test(`${f.title} ${f.detail}`));
  const titleOmitsEasement =
    pf.no_easements_recorded === true || !pf.encumbrances.some((e) => /easement/i.test(`${e.kind} ${e.description}`));
  if (contractHasEasement && titleOmitsEasement) {
    out.push({
      title: 'Undisclosed easement contradicts the title record',
      detail:
        'The contract records an easement that the title record does not reflect. Surfaced as Critical rather than silently overwritten.',
      agents: ['archivist', 'legal'],
    });
  }
  return out;
}

/**
 * Dynamic, context-driven discovery — reads what the agents ACTUALLY said and
 * surfaces any genuine contradictions, between whichever agents conflict, on
 * whatever topic. Not hardcoded to one pair or one subject. Bounded and
 * deduped against the deterministic baseline; returns [] on any failure so the
 * workflow never breaks.
 */
export async function discoverContradictions(
  claims: { agent: AgentType; summary: string; findings: { title: string; detail: string }[] }[],
  exclude: Contradiction[] = []
): Promise<Contradiction[]> {
  const digest = claims
    .map((c) => `### ${c.agent}\n${c.summary}\nFindings: ${c.findings.map((f) => `${f.title} — ${f.detail}`).join(' | ') || 'none'}`)
    .join('\n\n')
    .slice(0, 4000);
  const prompt = `You are the committee moderator on a real-estate due-diligence deal. Below are claims from specialist agents. Identify GENUINE contradictions — where two agents assert things that cannot both be true (a real conflict, not merely different emphasis or focus). For each, name the EXACT two agents who conflict and the topic.

${digest}

Be strict: only real, substantive conflicts. Agents must be drawn from: ${ROSTER.join(', ')}.
Return ONLY JSON: {"contradictions":[{"title":"<short label>","detail":"<what conflicts, 1-2 sentences>","agents":["<agent>","<agent>"]}]}. If there are none, return {"contradictions":[]}.`;

  let parsed: { contradictions?: { title?: string; detail?: string; agents?: string[] }[] };
  try {
    const { content } = await callLLM('synthesis', prompt, { json: true, maxTokens: 700 });
    parsed = JSON.parse(stripFences(content));
  } catch {
    return [];
  }

  const seen = new Set(exclude.map((c) => c.title.toLowerCase()));
  const result: Contradiction[] = [];
  for (const c of parsed.contradictions ?? []) {
    const agents = (c.agents ?? []).filter((a): a is AgentType => ROSTER.includes(a as AgentType));
    if (agents.length < 2 || agents[0] === agents[1]) continue; // need two distinct, real agents
    const title = String(c.title ?? 'Contradiction').slice(0, 120);
    if (seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    result.push({ title, detail: String(c.detail ?? '').slice(0, 400), agents: [agents[0], agents[1]] });
    if (result.length >= 3) break; // bounded
  }
  return result;
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
