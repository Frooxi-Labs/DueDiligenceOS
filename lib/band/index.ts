/**
 * Band module — integration with the Band multi-agent platform.
 *
 * Self-contained and reusable: a REST client for rooms/participants/messages/
 * events/context (with targeted @mentions), plus helpers to format room context
 * and the opening brief. Depends only on `@/types`. Consumers import from here,
 * never from internal files.
 */
export { BandClient, getAgentConfigs } from './BandClient';
export type { BandContextMessage } from './BandClient';
export { formatContextForAgent, formatDealBriefMessage } from './ContextService';
