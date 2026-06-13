# DueDiligenceOS — Product Requirements

## 1. Overview

DueDiligenceOS is a multi-agent **investment-committee** system for commercial real-estate deals.
Five specialist agents — Market Analysis, Due Diligence, Risk Assessment, Legal & Compliance, and
Financial Underwriting — collaborate in a shared Band room: they read each other's findings, hand
off work via `@mentions`, surface and resolve disagreements in a visible negotiation, and produce a
deal memo that a human approves. Every decision is persisted and auditable.

## 2. Problem

Real-estate due diligence is slow and error-prone because specialists work in silos. The market
analyst's optimism never meets the risk officer's tenant-credit concern; a legal easement finding
never reaches the underwriter whose model assumed clean title. Cross-domain conflicts are missed,
and committees take days to weeks.

## 3. Goals & non-goals

**Goals**
- Five distinct agents collaborating through a single Band room on one deal.
- Collaboration is Band-mediated: handoffs are `@mention`-triggered; negotiation is a visible
  in-room exchange; consensus is derived from posted messages.
- At least one agent runs on a different framework (LangGraph) and joins the same room via the
  Band SDK — genuine cross-framework collaboration.
- A live, legible experience: agents visibly react to each other, a disagreement resolves on
  screen, a human makes the final call, and an audit trail proves traceability.

**Non-goals**
- Real legal/financial advice — this is decision-support, not a substitute for professionals.
- Multi-tenant accounts, billing, or production SLAs.

## 4. Users

- **Investment-committee analyst (primary):** submits a deal, watches the agents deliberate, reads
  the memo, and approves / conditions / rejects.
- **Risk & compliance reviewer:** relies on the audit trail and the negotiation record.

## 5. Functional requirements

### 5.1 Deal intake
- Submit a deal brief (property, financials, business context).
- A preflight check requests human clarification when a brief is too thin to evaluate.

### 5.2 Band-mediated multi-agent workflow
- Create a Band room per deal and add all agent participants.
- Post the deal brief to the room; the committee begins.
- Each agent reads prior findings from the room, evaluates, and posts a result with a typed status
  (approve / conditional / reject) and a confidence score.
- Handoff is `@mention`-triggered: an agent `@mentions` the next agent with a reason, and that agent
  acts in response.
- Agents post their reasoning and delegations as Band events, so the deliberation is visible.
- At least one agent runs as a separate LangGraph process joining the room via the Band SDK.

### 5.3 Conflict & negotiation
- If any agent rejects, a negotiation begins: the dissenting agents are `@mentioned` and respond
  in-thread.
- Consensus is derived from the agents' posted messages (a position change is read from what they
  post), over a bounded number of rounds, capturing any conditions that emerge.

### 5.4 Human decision
- The system composes an executive deal memo and holds for a human decision.
- The human chooses approve-with-conditions / request-remediation / reject; the decision and any
  human-added conditions are recorded permanently.

### 5.5 Realtime & audit
- The UI streams the deliberation live — agent status, room messages, mentions, negotiation,
  approval — and persists all of it.
- A full audit trail (every status change, agent action, model used, source, timestamp, and the
  human decision) is queryable and rendered as a timeline.

## 6. Non-functional requirements

- Live event delivery is reliable and does not depend on a single process's memory.
- The workflow runs to completion even when individual agents are slow or fail.
- External calls (Band, model providers) have timeouts and retries; a failed agent degrades
  gracefully and never corrupts deal state.
- Deterministic enough for a live demo: low temperature, pinned models, idempotent execution.
- No secrets in the repository.

## 7. Data model (Postgres)

`deal_briefs`, `band_rooms`, `agent_evaluations`, a normalized `findings` table (per-claim, with
source agent + evidence), `mentions` (handoff edges between agents), `negotiation_rounds`,
`final_decisions`, and `workflow_events` (the audit trail).

## 8. Architecture

See [`architecture.md`](architecture.md).

## 9. Roadmap

1. Deal intake and a single deal running end-to-end through a Band room.
2. Reliable live streaming and durable workflow execution.
3. Mention-triggered handoffs and in-room negotiation.
4. A cross-framework (LangGraph) agent joining the room.
5. Normalized findings + audit-trail timeline + executive memo.
6. Demo hardening.

## 10. Success criteria

- A deal runs end-to-end with live streaming and no mid-run failure.
- One agent visibly acts because another `@mentioned` it; a cross-framework agent answers a mention.
- A disagreement visibly resolves, a human makes the final call, and the audit trail reflects it.
