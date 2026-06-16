import { agentAvatar } from '@/lib/agents/avatars';
import type { AgentType } from '@/types';

/** One consistent agent avatar, used across the room and roster. */
export default function AgentAvatar({ type, size = 28, className = '' }: { type: AgentType | null | undefined; size?: number; className?: string }) {
  const t = type ?? 'synthesis';
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={agentAvatar(t)}
      alt=""
      width={size}
      height={size}
      className={`self-start shrink-0 rounded-lg ${className}`}
      style={{ width: size, height: size, minWidth: size, flex: 'none', background: '#161616', objectFit: 'contain', padding: 2 }}
    />
  );
}
