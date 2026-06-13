# Changelog

All notable changes to DueDiligenceOS, newest first. Each entry records **what**
changed and the **context** (why).

## [Unreleased]

### 2026-06-13

- **Web UI.** Added the home page, the deal-intake form (`/deals/new`, with a "load sample"
  prefill), the live deal room (`/deals/[id]` — agent roster with live status, the streaming room
  feed, a conflict banner, and the approve/reject gate), and the `useDealWorkflow` SSE hook that
  reduces the live event stream into UI state.
  - *Context:* Makes the committee usable and watchable — submit a deal and see the agents
    deliberate live, then make the call. Completes the end-to-end path through the app.

- **API routes.** Added `POST /api/deals` (validate brief + create + trigger the workflow),
  `GET /api/deals` (list), `GET /api/deals/[id]` (full state for hydrate/reconnect),
  `GET /api/deals/[id]/stream` (SSE of the live deliberation), and `POST /api/deals/[id]/decide`
  (reviewer's final decision). Added the shared `lib/deals` input schema and the
  `applyHumanDecision` finalizer. Made the DB client lazy so the build never requires `DATABASE_URL`.
  - *Context:* These wire the engine to the outside world — submit a deal, stream the committee
    live, and close the human-in-the-loop gate. Build is green with all routes.

- **Tests.** Added Vitest with unit tests for conflict detection (`detectConflict`/`checkConsensus`,
  incl. failed-agent-is-neutral) and agent output handling (`parseAgentOutput` fences/preamble,
  `validateBusinessLogic` cross-field rules). 14 tests passing; production build green.
  - *Context:* Locks down the pure decision logic that the live workflow depends on.

- **Orchestration module.** Added `lib/orchestration/`: conflict detection (`detectConflict` /
  `checkConsensus`, with failed agents treated as neutral) and the workflow engine `runWorkflow` —
  atomic single-trigger guard, Band room init + participant add, the agent sequence where each
  agent posts to the room and **hands off to the next via a targeted `@mention`** (recorded as a
  mention edge + `agent.mentioned` event), per-agent persistence, a failed agent that degrades
  instead of aborting, conflict detection, and the human-approval gate.
  - *Context:* The deal lifecycle and gates live here; the agent-to-agent collaboration flows
    through Band. This is the app glue tying band + agents + persistence + realtime together.

- **Realtime module.** Added `lib/realtime/` — `broadcast`/`subscribe` for streaming workflow
  events to the browser, behind an `EventTransport` seam (in-process now; Redis pub/sub drops in
  for multi-instance deploys).
  - *Context:* Lets the UI show the committee deliberating live.

- **Agents module.** Added `lib/agents/`: Zod output schemas for the five specialists, business-
  logic validation, the agent definitions registry (per-agent prompts + Band-message formatters +
  `AGENT_SEQUENCE`), and a pure `runAgent(agentType, { deal, contextText })` runner with
  schema/business-logic validation and retry-with-feedback.
  - *Context:* The committee's reasoning, as a self-contained, reusable module — given a deal and
    the prior room context, an agent returns a validated evaluation. It has **no Band or database
    side effects** (the orchestration module wires those), so the agents stand alone.

- **Providers module (LLM routing).** Added `lib/providers/index.ts` — a `fetch`-based client for
  the AI/ML API (OpenAI-compatible gateway), routing each agent to its own model with timeouts and
  retry/backoff. Added provider + per-agent model IDs to `.env.example`.
  - *Context:* One key, many models. Each agent runs on a different model so the committee is
    genuinely multi-model. No vendor SDK — the gateway is a plain HTTP endpoint — keeping deps
    minimal and the call path obvious. Model IDs are env-overridable.

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
