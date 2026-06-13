import { subscribe } from '@/lib/realtime';
import type { DealEvent } from '@/types';

export const dynamic = 'force-dynamic';

/** Server-Sent Events stream of the committee's live deliberation. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: DealEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      controller.enqueue(encoder.encode(': connected\n\n'));
      const unsubscribe = subscribe(id, send);

      // Heartbeat to keep the connection alive through proxies.
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          clearInterval(ping);
        }
      }, 15_000);

      // Tear down when the client disconnects.
      req.signal?.addEventListener?.('abort', () => {
        clearInterval(ping);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
