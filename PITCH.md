# DueDiligenceOS — judge's guide

A multi-agent **investment committee for commercial real-estate due diligence**, where specialist agents collaborate **through Band** to evaluate a deal, surface contradictions, simulate decisions, and reach a human-approved verdict.

---

## The problem (business value)

Real-estate due diligence is slow and error-prone because 5–10 specialists work in **silos**. The title agent finds an easement but doesn't know the underwriter assumed clean title. The compliance officer flags a zoning conflict that never reaches the analyst whose IRR depends on the intended use. Findings compound in ways **no single reviewer holds in their head at once** — and a committee still takes days to weeks and tens of thousands in fees.

DueDiligenceOS compresses that committee into minutes: specialist agents that **share context, hand off work, argue, escalate, and defer to a human** — with a complete audit trail. It reduces manual coordination, catches the contradictions humans miss, and ends in a decision a person actually signs.

## The agents (role specialization)

| Agent | Model / framework | Does |
|---|---|---|
| Archivist | Gemini | Extracts facts, encumbrances, missing-doc checklist |
| Regulatory | Claude | Zoning, permits, flood, environmental flags |
| Legal Risk | Claude | Title, easements, liens, contract terms |
| Financial | GPT | NOI, DSCR, IRR — re-underwrites on a cascade |
| Synthesis (Deal Director) | GPT | Weighs findings into the memo; runs the human gate |
| Environmental *(recruited)* | **LangGraph / Python** | Contamination, Phase I–II — pulled in only when needed |

### Why the Environmental agent is in Python (the value, not a checkbox)

Regulated due diligence shouldn't accept an LLM *guessing* "medium risk." This agent produces an **auditable, deterministic** contamination score and remediation-cost range from a rules-based model ([`services/environmental-agent/model.py`](services/environmental-agent/model.py)) — same facts in, same numbers out, with an itemized rationale a reviewer can defend in front of a regulator. The **LLM only extracts the facts**; **Python computes the number**; **LangGraph** orchestrates extract → quantify → (branch to a Phase II only if elevated) → report. That's the right tool for the job — and a single TS LLM call would do it *worse* (non-reproducible, unauditable). The fact that this Python agent joins the *same Band room* as the TS agents is the bonus, not the reason.

## Band's role in coordination — the 20-second answer

> **Band is the room the agents live in, the shared memory they read, and the rails they coordinate on. Our orchestrator only decides *turn order*; everything the agents say, read, hand off, delegate, and escalate happens *through Band*.**

Concretely, every collaboration primitive maps to a Band call:

| Coordination need | Band primitive we use |
|---|---|
| One room per deal + forked "what-if" rooms | `createRoom` |
| Role specialization / discovery / recruitment | `addParticipant` (incl. mid-workflow) |
| **Shared context** — agents read the room before reasoning | `getContext` |
| Task handoff (directed) | `postMessage` with structured `@mentions` |
| **Delegation with task state** (the cascade) | `task` event + `processing` → `processed` |
| Visible reasoning | `thought` / `tool_call` / `error` events |
| Human-in-the-loop gate | held memo + decision posted to the room |

If you open the Band app, you can **watch the whole committee work in real time** — reads, handoffs, the contradiction debate, the task going `processing → processed`, the specialist joining. The conversation *is* the audit trail.

## The flow (context → handoffs → state)

1. **Intake.** Archivist extracts the deal facts, posts them to the room, `@mentions` Regulatory + Legal.
2. **Analysis.** Regulatory and Legal each **read the room** (`getContext`), reason, post findings.
3. **Contradiction → negotiation.** If Archivist said "no easements" but Legal finds one in the contract, the two **argue it out in the room** and converge on a condition.
4. **Cascade (delegation).** A Critical zoning finding becomes a Band **task** assigned to Financial ("re-underwrite; authority: drop the clean-title assumption"); Financial marks it `processing → processed` and the IRR visibly moves.
5. **Recruitment.** If the deal needs environmental review, an agent **pulls the LangGraph specialist into the room** — it reads the room, branches (Phase II if risk is high), and posts its assessment.
6. **Human gate.** Synthesis composes the memo and **holds**. The reviewer can **simulate each decision** — each option forks a real Band child room where a branch-relevant panel re-deliberates and projects the outcome — then commits: proceed / remediate / renegotiate / reject.

## What becomes possible (originality)

Beyond a chatbot or linear automation: agents **discover and recruit** each other, **divide work**, **review and challenge** each other's outputs, **escalate** to a human, **collaborate across frameworks** (LangGraph ↔ TypeScript) and **across models** (Gemini ↔ Claude ↔ GPT) in one room — and the human can **fork the committee into counterfactual rooms to live each decision before making it**. That last one — branchable, simulatable coordination — is the thing a single agent or a fixed pipeline simply cannot do.

## Robustness (for the live demo)

Every Band/LLM call is best-effort with a fallback, so a transient failure never aborts the committee. The cross-framework Environmental service falls back to an in-process agent if it's offline — **keep the Python service running during the demo** so the cross-framework story actually fires. A backup screen recording is recommended.
