<div align="center">

# DueDiligenceOS

**An AI due-diligence committee for commercial real estate.** Eight specialist agents
across two frameworks share one [Band](https://band.ai) room per deal — they read
each other's findings, resolve their disagreements, delegate work, recruit
quantitative help, and hand a human a defensible deal memo.

**Band of Agents Hackathon · Track 3 — Regulated & High-Stakes Workflows**

</div>

---

## The problem

Closing a commercial-real-estate deal takes a committee — title, zoning,
environmental, structural, insurance, and financial review. Today those experts
work in sequence over email and PDFs: the legal team's easement finding never
reaches the underwriter whose model assumed clean title; the contamination flag
never makes it into the price. It takes weeks, a single missed liability can sink
an IRR, and the reasoning behind an approval is scattered across inboxes —
impossible to replay or defend to an investment committee.

## What it does

DueDiligenceOS runs that committee as Band agents in **one shared room per deal**.
Five reasoning agents (TypeScript, three model providers) plus three quantitative
specialists (Python · LangGraph) collaborate **through Band** and produce a
Red / Yellow / Green memo that a human approves.

| Agent | Stack | Responsibility |
|:--|:--|:--|
| **Archivist** | Gemini · TS | Extracts property facts, encumbrances, missing-document checklist |
| **Regulatory** | Claude · TS | Zoning, permits, flood/FEMA, environmental flags |
| **Legal Risk** | Claude · TS | Title, contract terms, easements, liens, seller reps |
| **Financial** | GPT-4o · TS | NOI, cap rate, DSCR and a **deterministically computed** 5-yr IRR |
| **Synthesis** *(Deal Director)* | GPT · TS | Weighs every finding into the memo; holds for the human gate |
| **Environmental** | **LangGraph · Python** | Contamination risk + Monte-Carlo remediation cost; Phase I call |
| **CapEx** | **LangGraph · Python** | Renovation / conversion cost and schedule risk, simulated |
| **Insurance** | **LangGraph · Python** | Flood / wind / seismic catastrophe exposure and premium |

The three specialists are **recruited into the room on demand** — only when the
reasoning agents decide a deal needs them.

## How Band is used

Band is the coordination layer, not a notification channel. Every primitive below
is load-bearing:

- **Shared context** — before reasoning, each agent reads the live room via
  mention-routed `getContext` and builds on it (it is not spoon-fed context).
- **Handoffs** — agents pass the baton with structured `@mentions`; the next
  agent acts *because* it was mentioned.
- **Task state** — a delegation is a Band `task` event (intent + authority) that
  the assignee marks `processing → processed` — accountable work, not a chat line.
- **Rich events** — agents post `thought` / `tool_call` / `tool_result` / `error`
  events, so their reasoning is visible and replayable inside Band.
- **Recruitment** — when a deal needs a specialist, an agent pulls a new
  participant into the room mid-deal (`addParticipant`), including the
  cross-framework Python agents.
- **Distinct identity** — each agent (specialists included) posts under its own
  Band identity via its own API key — genuinely separate participants.
- **Human gate** — the committee composes the memo and **holds** for a human
  decision (proceed / remediate / renegotiate / reject), recorded in a permanent
  audit trail.

## Signature mechanics

- **Contradiction negotiation** — when two agents disagree (any pair, any topic), they
  debate it in-thread until resolved. A deterministic detector guarantees the
  classic conflicts fire; an LLM pass discovers novel ones.
- **Emergent delegation** — any agent can hand any other a concrete task with
  intent + authority, decided from context — not a fixed cascade.
- **Dynamic recruitment** — the committee itself decides which Python specialists a
  deal warrants and pulls them in live.
- **Counterfactual forking** — fork the room on a "what if", re-run the committee
  under a changed assumption, and compare memos side by side.
- **Deterministic underwriting** — the headline IRR is not LLM-generated: DSCR and a
  levered 5-year IRR are solved in code (bisection), so identical inputs always
  produce the same number.

## Why two frameworks

The reasoning agents live in TypeScript next to the product. The specialists are
**Python because they do real numerical work** — seeded numpy Monte-Carlo over
LangGraph state machines (10k trials, P50/P90), which an LLM can't fake. Band makes
the framework boundary disappear: they join the *same* room as first-class agents.
See [`services/specialists`](services/specialists).

## Tech stack

| Layer | Technology |
|:--|:--|
| App & UI | Next.js 16 (Turbopack), React 19, Tailwind 4, TypeScript |
| Coordination | **Band** REST — rooms, handoffs, tasks, events, recruitment |
| Specialists | Python · FastAPI · LangGraph · numpy |
| Data & realtime | Neon Postgres + Drizzle ORM · SSE bus with replay |
| Models | AI/ML API gateway — Gemini · Claude · GPT |

## Getting started

**Prerequisites:** Node 20+, a [Neon](https://neon.tech) Postgres database, eight
[Band](https://app.band.ai) agents, and an [AI/ML API](https://aimlapi.com) key.
Python 3.11+ for the specialist service (optional).

```bash
# 1. App
npm install
cp .env.example .env.local      # add DB, Band agent credentials, AI/ML key
npm run db:push                 # create the schema in Neon
npm run dev                     # http://localhost:3000

# 2. Python specialists service (required — hosts environmental, capex, insurance)
cd services/specialists
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```

All credentials are read from the environment — see [`.env.example`](.env.example).
Each specialist (environmental, capex, insurance) is its own Band identity; none
shares or falls back to another. If a specialist's Band credentials are missing,
it can't post to the room rather than posting as another agent.

## Project structure

```
app/                  Next.js routes, API endpoints, UI components
lib/
  agents/             agent definitions, schemas, validation, runner
  orchestration/      workflow, contradiction detection, negotiation, forking
  band/               BandClient (REST), context reconstruction
  finance/            deterministic DSCR / IRR underwriting
  security/           request guard (auth, CSRF, rate limit, validation)
services/
  specialists/          Python · FastAPI · LangGraph quant specialists (Monte-Carlo)
    framework.py        shared LangGraph builder (gather→extract→quantify→…→announce)
    models.py           numpy models (environmental / capex / insurance + usd helper)
    band.py             Band REST client (each specialist posts as its own identity)
    agents/             one file per specialist: environmental.py · capex.py · insurance.py
tests/                vitest suites (underwriting, validation, contradiction, security)
middleware.ts         security headers
```

## Testing & quality

```bash
npm test          # 38 vitest tests
npm run lint      # eslint
npm run build     # production build
```

## Security

Write endpoints are hardened with an opt-in bearer-token gate, same-origin (CSRF)
checks, per-IP rate limiting, input/body-size bounds, and baseline security
headers — see [`lib/security/guard.ts`](lib/security/guard.ts) and
[`middleware.ts`](middleware.ts). All outbound URLs come from the environment
(no SSRF surface), and DB access is parameterised via Drizzle.

## License

MIT — see [LICENSE](LICENSE).
