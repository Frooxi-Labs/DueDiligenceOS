import { BandContextMessage } from './BandClient';

/**
 * Format the prior agents' messages (read from the Band room) into a context
 * block for the next agent's prompt — so each agent reasons over what its peers
 * found, not in isolation.
 */
export function formatContextForAgent(messages: BandContextMessage[]): string {
  const agentMessages = messages.filter(
    (m) => m.metadata?.agentType && m.metadata?.messageType !== 'deal_brief'
  );

  if (agentMessages.length === 0) {
    return '[No prior agent evaluations yet. You are the first to evaluate this deal.]';
  }

  const formatted = agentMessages.map((m, i) => {
    const agentName = String(m.metadata?.agentType ?? 'unknown').toUpperCase().replace(/_/g, ' ');
    const status = String(m.metadata?.status ?? 'unknown').toUpperCase();
    const confidence = m.metadata?.confidence
      ? `${(Number(m.metadata.confidence) * 100).toFixed(0)}%`
      : 'N/A';
    const truncated =
      m.content.length > 900 ? m.content.substring(0, 900) + '...[truncated]' : m.content;

    return `[${i + 1}] ${agentName} AGENT
Status: ${status} | Confidence: ${confidence}
─────────────────────────────────────
${truncated}
`;
  });

  return `PRIOR AGENT EVALUATIONS (${agentMessages.length} agent${
    agentMessages.length > 1 ? 's' : ''
  } have evaluated this deal):

${formatted.join('\n')}
END OF PRIOR EVALUATIONS`;
}

/** The deal brief posted to the room to open the committee session. */
export function formatDealBriefMessage(deal: {
  title: string;
  property_type: string;
  location: string;
  size_sqft: number;
  asking_price: number | string;
  occupancy_pct: number | string;
  cap_rate_stabilized: number | string;
  financing_ltv: number | string;
  financing_rate: number | string;
  hold_period_years: number;
  business_context: string;
  additional_notes?: string | null;
}): string {
  return `🏢 DueDiligenceOS — Investment Committee Session

Deal: ${deal.title}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PROPERTY DETAILS:
→ Type: ${deal.property_type}
→ Location: ${deal.location}
→ Size: ${Number(deal.size_sqft).toLocaleString()} sq ft
→ Asking Price: $${Number(deal.asking_price).toLocaleString()}
→ Current Occupancy: ${deal.occupancy_pct}%
→ Stabilized Cap Rate: ${deal.cap_rate_stabilized}%

FINANCING:
→ LTV: ${deal.financing_ltv}%
→ Interest Rate: ${deal.financing_rate}%
→ Hold Period: ${deal.hold_period_years} years

BUSINESS CONTEXT:
${deal.business_context}

${deal.additional_notes ? `ADDITIONAL NOTES:\n${deal.additional_notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each agent evaluates, hands off to the next via @mention, and reads peers'
findings before responding.`;
}
