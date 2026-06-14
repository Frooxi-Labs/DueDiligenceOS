<div align="center">

# DueDiligenceOS

**A multi-agent investment committee for commercial real estate — five specialist AI agents that collaborate _through_ [Band](https://band.ai) to evaluate a deal, resolve their disagreements, and reach a decision a human approves.**

Built for the **Band of Agents Hackathon** · Track 3 — Regulated & High-Stakes Workflows

📄 **[Read the judge's guide → PITCH.md](PITCH.md)** — problem, agent roles, and exactly how Band coordinates the committee.

</div>

---

## The problem

Real-estate due diligence is slow and error-prone because five-to-ten specialists work in silos. The market analyst's optimism never meets the risk officer's tenant-credit concern; the legal team's easement finding never reaches the underwriter whose model assumed clean title. Findings compound in ways no single reviewer holds in their head at once — and committees still take days to weeks.

## What it does

DueDiligenceOS runs the committee as Band agents in one shared room per deal — each on a different model provider, one on a different framework:

| Agent | Provider / framework | Responsibility |
|:------|:---------------------|:---------------|
| **Archivist** | Gemini (TS) | Extracts property facts, encumbrances, and the missing-document checklist |
| **Regulatory** | Claude (TS) | Zoning, permits, flood/FEMA, environmental flags, code violations |
| **Legal Risk** | Claude (TS) | Title, contract terms, easements, liens, reps & warranties |
| **Financial** | GPT (TS) | NOI, cap rate, DSCR, IRR, sensitivity — re-underwrites on a cascade |
| **Synthesis (Deal Director)** | GPT (TS) | Weighs every finding into the memo; triggers the human gate |
| **Environmental** *(recruited)* | **LangGraph (Python)** | Contamination / Phase I–II — pulled in only when a deal needs it |

They don't just run in parallel — they **collaborate through Band**:

- **Read the room.** Before reasoning, each agent calls Band `getContext` to pull the shared room conversation, then builds on it — it is not spoon-fed context out of band.
- **Hand off through the room.** An agent finishes, then `@mentions` the specific next agent; that agent acts _because of_ the mention.
- **Delegate with task state.** The cascade is a Band `task` event (intent + authority) that the assignee marks `processing` → `processed` — accountable work, not a chat line.
- **Think out loud.** Agents post Band `thought` / `tool_call` / `error` events, so their reasoning (and their reads of the room) are visible and auditable in Band itself.
- **Disagree and negotiate in the room.** A detected contradiction triggers a real multi-turn debate between the two agents, in the room, converging on a condition.
- **Discover and recruit.** When a deal needs a specialist, an agent pulls a new participant into the room mid-workflow (`addParticipant`) — including the cross-framework LangGraph agent.
- **Defer to a human.** The committee composes a deal memo and **holds** for a human decision (proceed / remediate / renegotiate / reject), stamped into a permanent audit trail.

## How Band is used

Band is the collaboration layer, not a notification channel. The agents share context, route work via `@mentions`, negotiate, and record their reasoning **inside a Band room**. The core committee also runs across **four model providers** (Gemini, Claude, GPT) — distinct Band identities collaborating with no glue code — and when a deal needs environmental review, an **Environmental specialist built on a different framework (LangGraph, Python)** is recruited into the *same* Band room as a first-class participant. That is genuine cross-framework, cross-model collaboration: Band makes the boundary disappear. See [`services/environmental-agent`](services/environmental-agent).

## Architecture

- **Next.js 16 / React 19 / Tailwind 4** — app + live UI
- **Neon Postgres + Drizzle** — persistence and the full audit trail
- **Band** — REST + SDK; one shared room per deal
- **Server-Sent Events + Redis** — the deliberation streams to the browser live

See [`docs/architecture.md`](docs/architecture.md) and [`docs/PRD.md`](docs/PRD.md).

## Running locally

```bash
npm install
cp .env.example .env.local   # add your database + Band agent credentials
npm run dev
```

Optionally run the cross-framework Environmental specialist (LangGraph/Python) so it
joins the Band room live — see [`services/environmental-agent`](services/environmental-agent/README.md).
If it isn't running, the committee falls back to an in-process implementation.

## License

MIT — see [LICENSE](LICENSE).
