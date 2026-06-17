# Deploying DueDiligenceOS

## Read this first: which host to use

The app kicks off the committee workflow as a background job inside the web process and streams progress over SSE (`app/api/deals/route.ts` → `runWorkflow`). A single run makes many sequential LLM calls and takes minutes, not seconds.

That shapes the hosting choice:

- **Streamlit — no.** Streamlit only hosts Python apps. This is a Next.js app with a small Python sidecar, so it doesn't fit.
- **Vercel — not for the full workflow.** Vercel runs API routes as serverless functions. Once a function returns its response, background promises are frozen, and functions have a max duration (10s on Hobby, up to 300s on Pro). The committee run won't finish there without re-architecting it into a queue and worker. You can host the UI on Vercel, but the core demo won't complete reliably.
- **A persistent Node server — yes.** Run `next build` then `next start` on an always-on host. The background workflow finishes because the process stays alive. This is what the app is built for.

Good options, in order: **Render** or **Railway** (cleanest), then **Replit** (a Reserved VM, so it stays on), then a plain VM. Steps below cover Render/Railway and Replit.

## What you need before deploying

- A **Neon Postgres** database URL.
- An **AI/ML API key** (the LLM gateway).
- **Band agent credentials — one distinct identity (ID + API key) per agent, all eight.** Each of the five core agents and all three specialists (Environmental, CapEx, Insurance) is its own Band participant. There is no shared or fallback identity: if a specialist's credentials are missing, recruiting it fails rather than posting as another agent.
- The **Python specialists service** (`services/specialists`). This is required, not optional. It is where Environmental, CapEx, and Insurance run their Monte Carlo models, which is the cross-framework quantitative work the product is built around. Deploy it alongside the web app and point `SPECIALISTS_URL` at it.

### Environment variables

Copy `.env.example` and fill these in on the host:

```
DATABASE_URL=            # Neon connection string
AIML_API_KEY=            # AI/ML API key
AIML_BASE_URL=           # optional, defaults to https://api.aimlapi.com/v1

# Band — one distinct identity per agent (all eight required)
BAND_ARCHIVIST_AGENT_ID=     BAND_ARCHIVIST_API_KEY=
BAND_REGULATORY_AGENT_ID=    BAND_REGULATORY_API_KEY=
BAND_LEGAL_AGENT_ID=         BAND_LEGAL_API_KEY=
BAND_FINANCIAL_AGENT_ID=     BAND_FINANCIAL_API_KEY=
BAND_SYNTHESIS_AGENT_ID=     BAND_SYNTHESIS_API_KEY=
BAND_ENVIRONMENTAL_AGENT_ID= BAND_ENVIRONMENTAL_API_KEY=
BAND_CAPEX_AGENT_ID=         BAND_CAPEX_API_KEY=
BAND_INSURANCE_AGENT_ID=     BAND_INSURANCE_API_KEY=

# Required — URL of the deployed Python specialists service
SPECIALISTS_URL=     # e.g. https://your-specialists-service.onrender.com

# Lock down writes in production (recommended for a public URL)
APP_API_TOKEN=               # any long random string; clients send it as a Bearer token
```

Two things to verify so a default doesn't bite you in production:

1. **Model IDs must exist in your AI/ML catalog.** The default for Regulatory and Legal is a Claude id (`anthropic/claude-sonnet-4-6-...`). If your gateway doesn't list that exact id, set `MODEL_REGULATORY` and `MODEL_LEGAL` to ids it does have. The OpenAI and Gemini defaults are standard.
2. **`SPECIALISTS_URL` defaults to `127.0.0.1:8000`.** Set it to the deployed specialists service. Without it, the specialists can't run their models and recruitment fails. The committee won't crash, but it loses the quantitative tier that makes the product what it is, so treat the service as required.

## Database setup (once)

From your machine, with `DATABASE_URL` set to the Neon database:

```
npm run db:push      # creates the tables in Neon
```

## Option A — Render or Railway (recommended)

1. Push the repo to GitHub.
2. Create a new **Web Service** from the repo.
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add all the environment variables above.
6. Deploy. The first deal you create will run end to end because the process stays alive.

On Render, use a paid instance type (the free tier sleeps, which kills an in-flight workflow). On Railway, the default service stays warm.

## Option B — Replit

1. Import the GitHub repo into Replit.
2. Use a **Reserved VM** deployment (not Autoscale — Autoscale can suspend between requests and cut a running workflow short).
3. Set the run/start command to `npm run build && npm start`.
4. Add the environment variables under Secrets.
5. Deploy.

## The Python specialists service (required)

The three specialists (Environmental, CapEx, Insurance) live in `services/specialists` (FastAPI + LangGraph + numpy). They run the Monte Carlo models, so this service is part of the system, not an add-on. Deploy it as its own web service:

- Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Give it the same `AIML_API_KEY` plus the three specialist Band keys: `BAND_ENVIRONMENTAL_API_KEY`, `BAND_CAPEX_API_KEY`, `BAND_INSURANCE_API_KEY`. Each posts to Band under its own identity, so all three must be set.
- Once it's live, set `SPECIALISTS_URL` on the Next.js app to its public URL.

If the service is unreachable at runtime the committee won't crash, but the recruited specialist can't post a result. That is a degraded run, not a supported configuration.

## Security notes for a public deployment

- Set `APP_API_TOKEN`. Without it the write routes run in open demo mode (rate-limited and same-origin-checked, but unauthenticated). With it, writes require the token.
- The demo is single-tenant: any visitor can open any deal by its id. That's fine for a demo URL but isn't multi-user access control.
- Secrets only ever come from environment variables. `.env.local` is gitignored and not committed; keep it that way.
```
