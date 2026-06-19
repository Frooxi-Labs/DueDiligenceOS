<div align="center">

# DueDiligenceOS

An AI due-diligence committee for commercial real estate. Eight specialist agents, across two frameworks, share one [Band](https://band.ai) room per deal. They read each other's findings, settle disagreements, hand off work, recruit quantitative help, and give a human a deal memo they can defend.

Band of Agents Hackathon. Track 3: Regulated and High-Stakes Workflows.

</div>

---

## The problem

Closing a commercial real-estate deal takes a committee: title, zoning, environmental, structural, insurance, and financial review. Today those experts work in sequence, over email and PDFs. The legal team finds an easement, but it never reaches the underwriter whose model assumed clean title. The contamination flag never makes it into the price. It takes weeks, one missed liability can sink the return, and the reasoning behind an approval ends up scattered across inboxes, where nobody can replay it or defend it to an investment committee.

## What it does

DueDiligenceOS runs that committee as Band agents in one shared room per deal. Five reasoning agents (TypeScript, three model providers) and three quantitative specialists (Python, LangGraph) work through Band and produce a Red, Yellow, or Green memo that a human approves.

| Agent | Stack | Responsibility |
|:--|:--|:--|
| **Archivist** | Gemini · TS | Extracts property facts, encumbrances, and the missing-document checklist |
| **Regulatory** | Claude · TS | Zoning, permits, flood/FEMA, environmental flags |
| **Legal Risk** | Claude · TS | Title, contract terms, easements, liens, seller reps |
| **Financial** | GPT-4o · TS | NOI, cap rate, DSCR, and a 5-year IRR computed in code |
| **Synthesis** *(Deal Director)* | GPT · TS | Weighs every finding into the memo, then holds for the human gate |
| **Environmental** | LangGraph · Python | Contamination risk and Monte-Carlo remediation cost; Phase I call |
| **CapEx** | LangGraph · Python | Renovation and conversion cost with schedule risk, simulated |
| **Insurance** | LangGraph · Python | Flood, wind, and seismic catastrophe exposure and premium |

The three specialists are recruited into the room on demand, only when the reasoning agents decide a deal needs them.

## How Band is used

Band is the coordination layer. Every primitive below is required for the committee to work.

- Shared context. Before it reasons, each agent reads the live room with mention-routed `getContext` and builds on what is already there.
- Handoffs. Agents pass work with structured `@mentions`. The next agent acts because it was mentioned.
- Task state. A delegation is a Band `task` event with intent and authority. The assignee marks it `processing`, then `processed`, so the work is tracked instead of being a chat line.
- Rich events. Agents post `thought`, `tool_call`, `tool_result`, and `error` events, so their reasoning is visible and replayable inside Band.
- Recruitment. When a deal needs a specialist, an agent adds a new participant to the room mid-deal with `addParticipant`, including the Python agents.
- Distinct identity. Every agent, specialists included, posts under its own Band identity with its own API key, so each one is a separate participant.
- Human gate. The committee writes the memo and holds for a human decision (proceed, remediate, renegotiate, or reject), recorded in a permanent audit trail.

## Key mechanics

- Contradiction negotiation. When two agents disagree, on any pair and any topic, they debate it in the thread until it resolves. A deterministic detector guarantees the common conflicts fire, and an LLM pass finds new ones.
- Emergent delegation. Any agent can hand any other a concrete task with intent and authority, decided from context rather than a fixed cascade.
- Dynamic recruitment. The committee decides which Python specialists a deal needs and pulls them in live.
- Counterfactual forking. Fork the room on a what-if, re-run the committee under a changed assumption, and compare the memos.
- Deterministic underwriting. The headline IRR is not LLM-generated. DSCR and a levered 5-year IRR are solved in code by bisection, so identical inputs always produce the same number.

## Why two frameworks

The reasoning agents run in TypeScript, next to the product. The specialists are Python because they do real numerical work: seeded numpy Monte-Carlo over LangGraph state machines (10k trials, P50/P90), which an LLM can't produce reliably. Band lets them join the same room as first-class agents regardless of language. See [`services/specialists`](services/specialists).

## Tech stack

| Layer | Technology |
|:--|:--|
| App & UI | Next.js 16 (Turbopack), React 19, Tailwind 4, TypeScript |
| Coordination | Band REST: rooms, handoffs, tasks, events, recruitment |
| Specialists | Python, FastAPI, LangGraph, numpy |
| Data & realtime | Neon Postgres with Drizzle ORM, SSE bus with replay |
| Models | AI/ML API gateway: Gemini, Claude, GPT |

## Getting started

Prerequisites: Node 20+, a [Neon](https://neon.tech) Postgres database, eight [Band](https://app.band.ai) agents, an [AI/ML API](https://aimlapi.com) key, and Python 3.11+ for the specialists service.

```bash
# 1. App
npm install
cp .env.example .env.local      # add DB, Band agent credentials, AI/ML key
npm run db:push                 # create the schema in Neon
npm run dev                     # http://localhost:3000

# 2. Python specialists service (hosts environmental, capex, insurance)
cd services/specialists
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8000
```

All credentials are read from the environment. See [`.env.example`](.env.example). Each specialist (environmental, capex, insurance) is its own Band identity and never borrows another's. If a specialist's Band credentials are missing, it stays silent instead of posting as another agent.

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
    framework.py        shared LangGraph builder (gather, extract, quantify, finalize, announce)
    models.py           numpy models for environmental / capex / insurance, plus the usd helper
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

Write endpoints are guarded by an opt-in bearer-token gate, same-origin (CSRF) checks, per-IP rate limiting, input and body-size bounds, and baseline security headers. See [`lib/security/guard.ts`](lib/security/guard.ts) and [`middleware.ts`](middleware.ts). All outbound URLs come from the environment, so there is no SSRF surface, and DB access is parameterised through Drizzle.

## License

MIT. See [LICENSE](LICENSE).
</content>
