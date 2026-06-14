# Changelog

All notable changes to DueDiligenceOS, newest first. Each entry records **what**
changed and the **context** (why).

## [Unreleased]

### 2026-06-14

- **UI shell + chat-style room.** Added a collapsible **sidebar** (recent deals with live status
  dots, new-run, delete), a rounded app panel with **page-transition animations**, and restyled the
  deal room as a **chat-style feed** (message bubbles with fade-in + a live "analysing…" typing
  indicator). Added `DELETE /api/deals/[id]` for the sidebar.
  - *Context:* Makes the live deliberation legible and demo-ready — the collaboration reads like a
    conversation between agents.
- **Document upload.** The intake form now accepts **multiple uploaded files** (text-based deal
  documents) that are read into the deal package, alongside paste — matching the Archivist's
  document-intake role.

- **Audit trail view.** Added `GET /api/deals/[id]/audit` and a collapsible audit-trail panel on
  the deal page — a chronological log of every workflow event (with agent + timestamp).
  - *Context:* Traceability is a core Track-3 requirement: every agent decision and step is
    recorded and reviewable.
- **Model-discovery helper.** Added `npm run models` (`scripts/list-models.mjs`) to list the exact
  AI/ML API model IDs a key can use, so per-agent model config matches the catalog.

### 2026-06-13

- **Due-diligence committee — agents & workflow.** The system models a real-estate
  due-diligence committee of five agents collaborating through a Band room:
  - **Archivist** ingests the deal package and extracts a typed `PropertyFact`
    (and a missing-documents checklist).
  - **Regulatory** reads the facts + intended use and produces a `ComplianceReport`
    (0–100 risk, ranked Critical/Material/Minor).
  - **Legal** reviews title + contract, flags issues, and sets a typed
    `easement_found_in_contract`.
  - **Financial** underwrites a `FinancialModel` (headline IRR + signal).
  - **Synthesis** composes the deal memo and a Red/Yellow/Green signal.
  - *Context:* Each agent posts to the Band room and hands off to the next via a
    targeted `@mention`; the orchestrator owns ordering and the gates.

- **Cascading recalculation.** A Critical regulatory flag (e.g. a zoning conflict)
  makes Financial **re-underwrite** — the headline IRR visibly changes — coordinated
  through a Band `@mention`, not a direct call.
  - *Context:* One of the two centerpiece behaviours; the agents coordinate purely
    through Band.

- **Contradiction detection.** Code-level, deterministic: when Archivist reports "no
  recorded easements" but Legal finds an easement in the contract, the system surfaces
  a Critical contradiction instead of silently overwriting either finding.
  - *Context:* The "that would have been missed" moment; reliable every run because it
    compares typed fields, not LLM prose.

- **Human-in-the-loop gate.** Synthesis holds the deal memo; the reviewer chooses
  *proceed with conditions / request remediation / flag for renegotiation*, recorded
  with a full audit trail.

- **Web UI.** Deal-intake (deal terms + document package, with a sample), and the live
  room — agent roster with live status, the streaming feed, the IRR-cascade banner, the
  contradiction card, and the decision gate — driven by an SSE hook.

- **Platform & modules.** Next.js 16 / React 19 / Tailwind 4; Neon Postgres + Drizzle;
  Band via a hardened REST client (targeted `@mentions`, timeouts, retries); AI/ML API
  model routing (a different model per agent) via `fetch`, no vendor SDK; SSE realtime;
  and a durable workflow with idempotent single-trigger and graceful agent-failure
  handling. Code is organized into self-contained `lib/` modules, each with a single
  public API.

- **Tests.** Vitest unit tests for contradiction detection, the cascade trigger, the
  composite risk score, and agent output parsing/validation. Production build green.
