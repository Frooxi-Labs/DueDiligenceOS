# Changelog

All notable changes to DueDiligenceOS, newest first. Each entry records **what**
changed and the **context** (why).

## [Unreleased]

### 2026-06-13

- **Module-based architecture.** Each `lib/` module exposes a single public API via its `index.ts`
  barrel; consumers import from the module root, never internal files. Added `lib/band/index.ts`
  and a module map in the architecture doc.
  - *Context:* Clean module boundaries keep the system maintainable and let any module evolve or be
    reused independently.

- **Band integration layer.** Added `lib/band/BandClient.ts` (REST client: create room, add
  participants, post messages with targeted `@mentions`, post events, read room context, mark
  message state) and `lib/band/ContextService.ts` (format peers' findings + the opening deal
  brief). Added Band agent credentials to `.env.example`.
  - *Context:* This is how agents talk to each other through the Band room. The client supports
    **targeted `@mentions`** (so one agent can hand off to a specific next agent) and is hardened
    with per-request timeouts and retry-with-backoff so a slow Band call can't stall a live run.

- **Domain types.** Added `types/index.ts`: agent types, workflow statuses, deal/evaluation/
  negotiation/decision shapes, the SSE event union, and new `Finding`, `Mention`, and an
  `agent.mentioned` event.
  - *Context:* Shared contracts the whole system builds on. `Finding`/`Mention` and the
    `agent.mentioned` event support per-claim findings and visible agent-to-agent handoffs.

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
