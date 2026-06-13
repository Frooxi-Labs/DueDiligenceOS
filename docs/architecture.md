# DueDiligenceOS — Architecture

## 0. Module-based design

The codebase is organized into self-contained modules under `lib/`, each exposing a single public
API via its `index.ts` barrel. Consumers import from the module root (`@/lib/band`), never from
internal files, so any module can evolve — or be extracted into a shared package — independently.

| Module | Responsibility | Depends on |
|:-------|:---------------|:-----------|
| `lib/band` | Band platform integration (rooms, participants, messages, mentions, events, context) | `types` |
| `lib/providers` | LLM model routing (per-agent model + provider) | — |
| `lib/agents` | Agent framework: base, registry, the specialists, output validation | `band`, `providers`, `types` |
| `lib/orchestration` | Workflow engine, conflict detection, negotiation | `band`, `agents`, `persistence`, `realtime` |
| `lib/realtime` | Event transport (Redis pub/sub → SSE) | `types` |
| `lib/db` | Persistence (schema, client) | — |

## 1. Stack

| Layer | Choice |
|:------|:-------|
| App + UI | Next.js 16 / React 19 / Tailwind 4 (TypeScript) |
| Database | Neon Postgres + Drizzle |
| Agents | Band (REST + SDK); one shared room per deal |
| Cross-framework agent | Python LangGraph process on the Band SDK |
| Realtime | Server-Sent Events to the browser, fed by Redis pub/sub |
| Workflow execution | BullMQ worker (durable, long-running) |
| Models | OpenAI-compatible providers, one model per agent |

## 2. System overview

```
 Browser (Next.js UI)
   │  EventSource  GET /api/deals/[id]/stream
   ▼
 SSE route ──subscribe──►  Redis pub/sub  (channel: deal:<id>)
   ▲                              ▲ publish
   │ enqueue                      │ broadcast
 POST /api/deals ──► BullMQ queue ──► worker (long-lived)
                                        │  runWorkflow(dealId)  [state machine]
                                        ▼
   ┌────────────────── BAND ROOM (one per deal) ──────────────────┐
   │  Market   Due Diligence   Risk   Financial   (TypeScript)    │
   │  Legal  ◄── separate Python LangGraph process (Band SDK) ──► │
   │  handoff = @mention ; negotiation = in-room thread           │
   │  reasoning / delegation = Band events                        │
   └──────────────────────────────┬───────────────────────────────┘
                                   ▼
                     Postgres (deals, findings, evaluations,
                     negotiation, decisions, audit trail)
```

## 3. Band as the collaboration layer

Band is where the agents actually coordinate, not a place results are logged after the fact.

- **Mention-triggered handoff.** Each agent posts its result and `@mentions` the specific next
  agent with a reason. The next agent runs *in response to* that mention. Handoffs are recorded as
  edges so the chain of collaboration is explicit.
- **Cross-framework participation.** The Legal agent runs as a separate Python LangGraph process
  that authenticates with its own Band identity, subscribes to the room over the Band SDK, wakes on
  its `@mention`, runs its graph, and posts back — a first-class participant alongside the
  TypeScript agents.
- **In-room negotiation.** When an agent rejects, it `@mentions` the dissenting agents; they reply
  in-thread. Consensus is derived from the messages the agents post, not computed out of band.
- **Visible reasoning.** Agents emit Band events (thoughts, tool calls, tasks) so the deliberation
  and delegations are legible in the room.

## 4. Workflow execution

`POST /api/deals` validates and stores the deal, then enqueues it. A long-lived worker consumes the
queue and runs the deal as a state machine: room init → agent evaluations (handed off via mentions)
→ conflict detection → negotiation → executive memo → human decision. Human clarification and the
final approval are suspendable states the worker resumes on, not blocking polls.

## 5. Realtime

`broadcast(dealId, event)` publishes to a Redis channel; the SSE route subscribes and forwards to
the browser's `EventSource`. Because every event is also persisted, the client can rebuild state
from the database on reconnect — delivery never depends on one process's in-memory state.

## 6. Reliability

- Timeouts and retries on every Band and model call; a slow or down dependency degrades gracefully.
- A failed agent is isolated — the workflow continues and the failure is recorded, never corrupting
  deal state.
- Idempotent execution: a deal transitions `pending → running` atomically; execution locks prevent
  duplicate runs and duplicate rooms.
- Low temperature and pinned models for reproducible behavior.

## 7. Data model

Postgres via Drizzle: `deal_briefs`, `band_rooms`, `agent_evaluations`, `findings` (normalized
per-claim with source agent and evidence), `mentions` (agent→agent handoff edges),
`negotiation_rounds`, `final_decisions`, and `workflow_events` (the audit trail). JSON payloads are
validated on read.
