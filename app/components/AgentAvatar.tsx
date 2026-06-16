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
      className={`rounded-lg shrink-0 ${className}`}
      style={{ background: '#161616', objectFit: 'contain', padding: 2 }}
    />
  );
}
