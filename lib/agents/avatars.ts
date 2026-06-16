import type { AgentType } from '@/types';

/** Local avatar for each agent — one consistent set used across the whole app. */
export function agentAvatar(type: AgentType): string {
  return `/avatars/${type}.svg`;
}

/** The Band hub logo. Set NEXT_PUBLIC_BAND_LOGO_URL to override the built-in mark. */
export const bandLogo = process.env.NEXT_PUBLIC_BAND_LOGO_URL || '';
