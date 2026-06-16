import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bandRooms } from '@/lib/db/schema';
import { BandClient, getAgentConfigs } from '@/lib/band';
import { isUuid } from '@/lib/security/guard';
import type { AgentType } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Reconstruct the deal room live from Band's own context API — not our database.
 * Band's room is mention-routed, so each agent sees only its slice; we union the
 * slices across participants to rebuild the whole conversation. This proves the
 * Band room is the canonical source of truth and that context survives independent
 * of our process (an agent can drop and rejoin without losing state).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const [room] = await db.select({ rid: bandRooms.band_room_id }).from(bandRooms).where(eq(bandRooms.deal_id, id)).limit(1);
  if (!room?.rid) return NextResponse.json({ error: 'No Band room for this deal yet.' }, { status: 404 });

  const agents = Object.keys(getAgentConfigs()) as AgentType[];
  const byId = new Map<string, { sender: string; content: string; created_at: string }>();
  let reachable = 0;

  await Promise.all(
    agents.map(async (a) => {
      try {
        const ctx = await new BandClient(a).getContext(room.rid);
        reachable++;
        for (const m of ctx) byId.set(m.id, { sender: m.sender_name ?? m.sender_id, content: m.content, created_at: m.created_at });
      } catch {
        /* this agent may not be a participant in the room */
      }
    })
  );

  const messages = [...byId.values()].sort((x, y) => +new Date(x.created_at) - +new Date(y.created_at));
  return NextResponse.json({
    room_id: room.rid,
    participants_polled: reachable,
    message_count: messages.length,
    messages: messages.slice(-12),
  });
}
