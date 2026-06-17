import { agentAvatar, agentAvatarLive } from '@/lib/agents/avatars';
import type { AgentType } from '@/types';

/** One consistent agent avatar, used across the room and roster.
 *  `live` swaps to the animated variant (eyes blink + glance) while working. */
export default function AgentAvatar({ type, size = 32, className = '', live = false }: { type: AgentType | null | undefined; size?: number; className?: string; live?: boolean }) {
  const t = type ?? 'synthesis';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={live ? agentAvatarLive(t) : agentAvatar(t)}
      alt=""
      width={size}
      height={size}
      className={`self-start shrink-0 rounded-lg ${className}`}
      style={{ width: size, height: size, minWidth: size, flex: 'none', background: '#161616', objectFit: 'contain', padding: 2 }}
    />
  );
}
