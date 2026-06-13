# Changelog

All notable changes to DueDiligenceOS, newest first. Each entry records **what**
changed and the **context** (why).

## [Unreleased]

### 2026-06-13

- **Database layer (Postgres + Drizzle).** Added the schema and database client.
  - *What:* `lib/db/schema.ts` (tables: `deal_briefs`, `band_rooms`, `agent_evaluations`,
    `findings`, `mentions`, `negotiation_rounds`, `final_decisions`, `workflow_events`,
    `agent_execution_locks`), `lib/db/index.ts` (Neon + Drizzle client), `drizzle.config.ts`,
    and `db:generate`/`db:migrate`/`db:push` scripts. Added deps: `drizzle-orm`,
    `@neondatabase/serverless`, `dotenv`, `drizzle-kit`.
  - *Context:* The committee needs durable storage and a complete audit trail (regulated /
    Track-3 requirement). `findings` is normalized per-claim (with provenance + evidence) and
    `mentions` records agent→agent handoff edges, so collaboration and any contradictions
    reference discrete rows rather than prose — the basis for the audit timeline and for proving
    work flows through Band.

- **Project scaffold + docs.** Next.js 16 / React 19 / Tailwind 4 app shell, landing page, and
  the PRD + architecture overview under `docs/`.
  - *Context:* Establish the base app and a clear, reviewable description of the product and how
    the agents collaborate through Band.
