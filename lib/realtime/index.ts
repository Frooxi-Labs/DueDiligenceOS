/**
 * Realtime module — fan-out of workflow events to connected browsers (SSE).
 *
 * Current transport is in-process (works when the app + workflow run in one
 * long-lived process — the demo topology). The `EventTransport` seam lets a
 * Redis pub/sub transport drop in for multi-instance deploys without touching
 * callers.
 *
 * Public API: `subscribe`, `broadcast`.
 */
import type { DealEvent } from '@/types';

export interface EventTransport {
  publish(dealId: string, event: DealEvent): void;
  subscribe(dealId: string, onEvent: (event: DealEvent) => void): () => void;
}

class InProcessTransport implements EventTransport {
  private subscribers = new Map<string, Set<(event: DealEvent) => void>>();

  publish(dealId: string, event: DealEvent): void {
    const subs = this.subscribers.get(dealId);
    if (!subs) return;
    for (const fn of subs) {
      try {
        fn(event);
      } catch {
        subs.delete(fn);
      }
    }
  }

  subscribe(dealId: string, onEvent: (event: DealEvent) => void): () => void {
    if (!this.subscribers.has(dealId)) this.subscribers.set(dealId, new Set());
    this.subscribers.get(dealId)!.add(onEvent);
    return () => {
      this.subscribers.get(dealId)?.delete(onEvent);
      if (this.subscribers.get(dealId)?.size === 0) this.subscribers.delete(dealId);
    };
  }
}

const transport: EventTransport = new InProcessTransport();

/** Push an event to every browser subscribed to this deal. */
export function broadcast(dealId: string, event: DealEvent): void {
  transport.publish(dealId, event);
}

/** Subscribe to a deal's event stream; returns an unsubscribe function. */
export function subscribe(dealId: string, onEvent: (event: DealEvent) => void): () => void {
  return transport.subscribe(dealId, onEvent);
}
