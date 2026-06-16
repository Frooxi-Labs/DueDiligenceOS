# Security

This document records the threat model for DueDiligenceOS, the controls that are
enforced in code, and the work that remains before a multi-tenant production
deployment. It is deliberately honest about the boundary between what is hardened
and what is out of scope for a single-tenant demo.

## Trust model

- **Operator-trusted secrets.** Every outbound base URL (`BAND_BASE_URL`,
  `AIML_BASE_URL`, `ENVIRONMENTAL_AGENT_URL`) and every credential comes from the
  environment, never from a request body. There is therefore **no SSRF surface** —
  a user cannot make the server call an arbitrary host. (This is also why we do
  not wire Band's sample `geocode`/`weather` tools: they would add a user-influenced
  outbound call for little analytical value.)
- **Single tenant.** The app has no login by design. Anyone who can reach the
  deployment can read deals. For a private deployment, set `APP_API_TOKEN` (below)
  to lock all writes; full per-user isolation is the production step in
  [Known gaps](#known-gaps).

## Controls enforced in code

All API guards live in [`lib/security/guard.ts`](lib/security/guard.ts) and are
applied per route; baseline response headers live in
[`middleware.ts`](middleware.ts).

| Control | Where | Detail |
|---|---|---|
| **Bearer-token gate** | all write routes | Enforced only when `APP_API_TOKEN` is set (open demo otherwise). Constant-time, SHA-256 compare. `Authorization: Bearer …` or `X-API-Token`. |
| **CSRF defence** | all write routes | Cross-origin `POST`/`DELETE` rejected by Origin/Referer vs Host check. |
| **UUID validation** | every `[id]` route | Malformed ids rejected with `400` before any DB query. |
| **Rate limiting** | create / extract / chat / simulate / band-context | Per-IP fixed window. In-process store (see gaps). |
| **Input bounds** | schema + routes | Deal package ≤ 200 KB; uploads ≤ 6 files × 10 MB; chat/notes length-capped; numeric ranges bounded. |
| **Body-size limit** | write routes | Oversized `Content-Length` rejected with `413` before buffering. |
| **Prompt-injection guard** | extract / chat | Untrusted deal text and reviewer input are framed as data; the model is told not to obey instructions embedded in them. |
| **Generic error responses** | all routes | Client sees a generic message; details are logged server-side only. |
| **Security headers** | middleware | `nosniff`, `X-Frame-Options: DENY`, CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), `Referrer-Policy`, `Permissions-Policy`, HSTS. |
| **Parameterised queries** | Drizzle ORM | No string-built SQL anywhere; no injection surface. |
| **Bounded agent loops** | orchestrator | Every retry/recruit/delegate path is capped; no unbounded model loops. |

### Enabling the token gate

```bash
APP_API_TOKEN="$(openssl rand -hex 32)"
```

With it set, write endpoints (`POST /api/deals`, `…/decide`, `…/chat`,
`…/simulate`, `POST /api/deals/extract`, `DELETE /api/deals/[id]`) require the
token; reads stay open so a shared deal link still renders for reviewers.

## Known gaps (production roadmap)

1. **No per-user authorization.** Reads are unauthenticated and there is no
   ownership model, so any reachable client can view any deal. The fix is real
   accounts (e.g. NextAuth) plus an `owner_id` column enforced on every query.
   This was intentionally **not** added here: cookie-scoping deals would break the
   judged demo, where a shared deal URL must render for the reviewers.
2. **Rate-limit store is in-process.** Correct on one instance, best-effort across
   many. Back `hits` in `guard.ts` with Redis for a horizontal deploy — the call
   sites do not change.
3. **Background workflow runs in-process.** `runWorkflow` is fire-and-forget in the
   web process; a multi-instance deploy should move it to a queue worker.

## Reporting

Open a private GitHub security advisory on the repository for anything sensitive.
