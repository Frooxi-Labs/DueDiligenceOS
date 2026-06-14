/**
 * Realtime module — fan-out of workflow events to connected browsers (SSE).
 *
 * Uses a globalThis-backed singleton so the workflow (running in the POST
 * handler) and the SSE route share the same bus even when Next bundles route
 * handlers separately. A per-deal replay buffer lets a browser that connects
 * mid-run catch up on events it missed.
 *
 * In-process only (the single long-lived process / demo topology). A Redis
 * pub/sub transport can replace this for multi-instance deploys.
 */
import type { DealEvent } from '@/types';

type Listener = (event: DealEvent) => void;

interface Bus {
  subscribers: Map<string, Set<Listener>>;
  history: Map<string, DealEvent[]>;
}

const MAX_HISTORY = 300;

const g = globalThis as unknown as { __ddosBus?: Bus };
const bus: Bus = g.__ddosBus ?? (g.__ddosBus = { subscribers: new Map(), history: new Map() });

/** Push an event to every subscriber, and remember it for late subscribers. */
export function broadcast(dealId: string, event: DealEvent): void {
  const hist = bus.history.get(dealId) ?? [];
  hist.push(event);
  if (hist.length > MAX_HISTORY) hist.shift();
  bus.history.set(dealId, hist);

  const subs = bus.subscribers.get(dealId);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(event);
    } catch {
      subs.delete(fn);
    }
  }
}

/** Subscribe to a deal's events. Replays buffered history first (catch-up). */
export function subscribe(dealId: string, onEvent: Listener): () => void {
  for (const e of bus.history.get(dealId) ?? []) {
    try {
      onEvent(e);
    } catch {
      /* ignore */
    }
  }
  if (!bus.subscribers.has(dealId)) bus.subscribers.set(dealId, new Set());
  bus.subscribers.get(dealId)!.add(onEvent);
  return () => {
    bus.subscribers.get(dealId)?.delete(onEvent);
    if (bus.subscribers.get(dealId)?.size === 0) bus.subscribers.delete(dealId);
  };
}
