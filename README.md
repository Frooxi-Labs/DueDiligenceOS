<div align="center">

# DueDiligenceOS

**A multi-agent investment committee for commercial real estate — five specialist AI agents that collaborate _through_ [Band](https://band.ai) to evaluate a deal, resolve their disagreements, and reach a decision a human approves.**

Built for the **Band of Agents Hackathon** · Track 3 — Regulated & High-Stakes Workflows

</div>

---

## The problem

Real-estate due diligence is slow and error-prone because five-to-ten specialists work in silos. The market analyst's optimism never meets the risk officer's tenant-credit concern; the legal team's easement finding never reaches the underwriter whose model assumed clean title. Findings compound in ways no single reviewer holds in their head at once — and committees still take days to weeks.

## What it does

DueDiligenceOS runs the committee as five Band agents in one shared room:

| Agent | Responsibility |
|:------|:---------------|
| **Market Analysis** | Location, demand, comparables, market positioning |
| **Due Diligence** | Physical condition, environmental, deferred maintenance |
| **Risk Assessment** | Occupancy, tenant credit, downside scenarios |
| **Legal & Compliance** | Title, easements, zoning, contract terms |
| **Financial Underwriting** | NOI, cap rate, DCR, IRR, sensitivity |

They don't just run in parallel — they **collaborate through Band**:

- **Hand off through the room.** An agent finishes, then `@mentions` the specific next agent with a reason; that agent acts _because of_ the mention.
- **Disagree and negotiate in the room.** When an agent rejects, it `@mentions` the dissenting agents; they respond in-thread and converge on conditions — and consensus is read from what they actually post.
- **Stay legible.** Reasoning and handoffs are posted as Band events, so the whole deliberation is visible and auditable.
- **Defer to a human.** The committee composes a deal memo and **holds** for a human decision (approve with conditions / request remediation / reject). The decision is stamped into a permanent, auditable record.

## How Band is used

Band is the collaboration layer, not a notification channel. The agents share context, route work via `@mentions`, negotiate, and record their reasoning **inside a Band room** — and at least one agent runs on a **different framework** (LangGraph, via the Band SDK) and joins the same room as a first-class participant, demonstrating genuine cross-framework collaboration.

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

## License

MIT — see [LICENSE](LICENSE).
