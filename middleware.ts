import { NextResponse, type NextRequest } from 'next/server';

/** Anonymous per-browser id. Scopes deals to the visitor who created them so demo
 *  sessions don't see each other's deals. Not a real auth boundary. */
export const OWNER_COOKIE = 'ddos_uid';

/**
 * Baseline security headers on every response. These are framework-safe
 * (no script/style CSP that would break Next's inline runtime) but close the
 * common clickjacking, MIME-sniffing, and referrer-leak vectors, and forbid the
 * page from being framed or loading plugins.
 */
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // Issue an anonymous visitor id once, so each browser only sees its own deals.
  if (!req.cookies.get(OWNER_COOKIE)) {
    res.cookies.set(OWNER_COOKIE, crypto.randomUUID(), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    });
  }
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  // Force HTTPS for a year (incl. subdomains) once served over TLS.
  res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  );
  return res;
}

export const config = {
  // Apply to everything except Next's static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
