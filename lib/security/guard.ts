import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Request hardening for the API routes — defence in depth, single-instance.
 *
 * Three independent checks, each opt-in per route:
 *   1. Bearer-token gate (enabled only when APP_API_TOKEN is set, so the public
 *      demo keeps working but a deployment can lock writes behind a token).
 *   2. UUID validation for `[id]` routes — rejects malformed ids before they
 *      reach the database.
 *   3. Fixed-window, per-IP rate limiting for the expensive (LLM-calling) routes.
 *
 * The rate-limit store is in-process: correct for a single instance, best-effort
 * across many. For a multi-instance deploy, back `hits` with Redis — the call
 * sites do not change.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

/** Constant-time token comparison (hash to equal length first). */
function tokenMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Enforce the bearer token when APP_API_TOKEN is configured. No token configured
 * ⇒ open (demo mode). Returns a 401 response to short-circuit, or null to proceed.
 */
export function checkToken(req: Request): NextResponse | null {
  const expected = process.env.APP_API_TOKEN;
  if (!expected) return null; // demo mode — unauthenticated access allowed

  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = bearer || req.headers.get('x-api-token') || '';
  if (provided && tokenMatches(provided, expected)) return null;

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const hits = new Map<string, { count: number; reset: number }>();
let lastSweep = 0;

/**
 * Fixed-window rate limit. Returns a 429 response (with Retry-After) when the
 * caller is over budget, or null to proceed.
 */
export function rateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  const now = Date.now();
  // Opportunistic cleanup so the map can't grow unbounded.
  if (now - lastSweep > 60_000) {
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    lastSweep = now;
  }

  const key = `${bucket}:${clientIp(req)}`;
  const entry = hits.get(key);
  if (!entry || entry.reset <= now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return null;
  }
  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.reset - now) / 1000);
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }
  entry.count += 1;
  return null;
}

/**
 * Reject cross-origin state-changing requests (CSRF defence). A browser always
 * attaches Origin (or at least Referer) to a cross-site POST/DELETE, so a
 * mismatch against our own Host is rejected. Non-browser clients that send
 * neither (curl, server-to-server) are allowed through here — they are covered
 * by the bearer-token gate instead.
 */
export function sameOrigin(req: Request): NextResponse | null {
  const src = req.headers.get('origin') || req.headers.get('referer');
  if (!src) return null;
  const host = req.headers.get('host');
  try {
    if (new URL(src).host !== host) {
      return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: 'Bad origin' }, { status: 403 });
  }
  return null;
}

/** Reject oversized bodies up front, before we buffer or parse them. */
export function bodyLimit(req: Request, maxBytes: number): NextResponse | null {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len && len > maxBytes) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  return null;
}

export interface GuardOptions {
  /** Validate this path id as a UUID (400 on failure). */
  id?: string;
  /** Enforce APP_API_TOKEN when configured. */
  requireToken?: boolean;
  /** Reject cross-origin requests (set on every state-changing route). */
  csrf?: boolean;
  /** Reject bodies larger than this many bytes via Content-Length. */
  maxBytes?: number;
  /** Rate-limit bucket name; omit to skip rate limiting. */
  rateKey?: string;
  limit?: number;
  windowMs?: number;
}

/**
 * Run the configured guards in order (token → csrf → uuid → size → rate limit).
 * Returns the first failing response, or null when the request may proceed.
 */
export function guard(req: Request, opts: GuardOptions = {}): NextResponse | null {
  if (opts.requireToken) {
    const r = checkToken(req);
    if (r) return r;
  }
  if (opts.csrf) {
    const r = sameOrigin(req);
    if (r) return r;
  }
  if (opts.id !== undefined && !isUuid(opts.id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  if (opts.maxBytes) {
    const r = bodyLimit(req, opts.maxBytes);
    if (r) return r;
  }
  if (opts.rateKey) {
    const r = rateLimit(req, opts.rateKey, opts.limit ?? 30, opts.windowMs ?? 60_000);
    if (r) return r;
  }
  return null;
}
