import { afterEach, describe, expect, it } from 'vitest';
import { isUuid, checkToken, sameOrigin, bodyLimit, rateLimit, guard } from '@/lib/security/guard';

const req = (headers: Record<string, string> = {}) => new Request('http://app.test/api/x', { headers });

afterEach(() => {
  delete process.env.APP_API_TOKEN;
});

describe('isUuid', () => {
  it('accepts a real v4 uuid', () => {
    expect(isUuid('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
  });
  it('rejects junk and injection-ish ids', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid("1; drop table deals")).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('checkToken', () => {
  it('is open when no token is configured', () => {
    expect(checkToken(req())).toBeNull();
  });
  it('rejects a missing or wrong token when configured', async () => {
    process.env.APP_API_TOKEN = 'secret-token';
    expect(checkToken(req())?.status).toBe(401);
    expect(checkToken(req({ authorization: 'Bearer nope' }))?.status).toBe(401);
  });
  it('accepts the correct token (bearer or header)', () => {
    process.env.APP_API_TOKEN = 'secret-token';
    expect(checkToken(req({ authorization: 'Bearer secret-token' }))).toBeNull();
    expect(checkToken(req({ 'x-api-token': 'secret-token' }))).toBeNull();
  });
});

describe('sameOrigin (CSRF)', () => {
  it('allows same-origin and no-origin requests', () => {
    expect(sameOrigin(req({ host: 'app.test', origin: 'http://app.test' }))).toBeNull();
    expect(sameOrigin(req({ host: 'app.test' }))).toBeNull();
  });
  it('rejects a cross-origin request', () => {
    expect(sameOrigin(req({ host: 'app.test', origin: 'http://evil.test' }))?.status).toBe(403);
  });
});

describe('bodyLimit', () => {
  it('rejects oversized Content-Length', () => {
    expect(bodyLimit(req({ 'content-length': '2000' }), 1000)?.status).toBe(413);
  });
  it('allows within-limit bodies', () => {
    expect(bodyLimit(req({ 'content-length': '500' }), 1000)).toBeNull();
  });
});

describe('rateLimit', () => {
  it('blocks once over the window budget', () => {
    const headers = { 'x-forwarded-for': '9.9.9.9' };
    const bucket = `t-${Math.random()}`;
    expect(rateLimit(req(headers), bucket, 2, 60_000)).toBeNull();
    expect(rateLimit(req(headers), bucket, 2, 60_000)).toBeNull();
    expect(rateLimit(req(headers), bucket, 2, 60_000)?.status).toBe(429);
  });
});

describe('guard composition', () => {
  it('fails closed on a bad uuid before doing work', () => {
    expect(guard(req(), { id: 'bad' })?.status).toBe(400);
  });
  it('passes a clean request', () => {
    expect(guard(req(), { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })).toBeNull();
  });
});
