import { NextResponse } from 'next/server';

/**
 * Baseline security headers on every response. These are framework-safe
 * (no script/style CSP that would break Next's inline runtime) but close the
 * common clickjacking, MIME-sniffing, and referrer-leak vectors, and forbid the
 * page from being framed or loading plugins.
 */
export function middleware() {
  const res = NextResponse.next();
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
