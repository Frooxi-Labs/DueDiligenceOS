import type { AgentType } from '@/types';

/** Local avatar for each agent — one consistent set used across the whole app. */
export function agentAvatar(type: AgentType): string {
  return `/avatars/${type}.svg`;
}

/** The Band hub logo (the mascot). */
export const bandLogo = '/band-logo.svg';
