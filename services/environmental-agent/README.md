# Environmental Specialist — LangGraph (Python)

A cross-framework member of the due-diligence committee. While the five core
agents run in the TypeScript app, this specialist runs on **LangGraph** in
Python — yet joins the **same Band room** and collaborates through it. Band
makes the framework boundary disappear: no shared database, no glue code, just a
participant posting into the conversation.

## How it fits

**Why this agent is in Python (the actual value):** regulated due diligence
shouldn't accept an LLM *guessing* "medium risk." This agent produces an
**auditable, deterministic risk score + remediation-cost estimate** from a
rules-based model ([`model.py`](model.py)) — same facts in, same numbers out,
with an itemized rationale a reviewer can defend. The LLM only *extracts facts*;
Python does the *scoring*. That separation is the point, and Python is the right
home for the computation.

When Regulatory or Legal decides a property needs environmental review (emergent
dispatch), the orchestrator recruits this agent into the Band room and calls it
over HTTP. It **reads the room**, extracts facts, computes the score, branches,
and posts its assessment back as a first-class participant.

```
gather   (read Band room via getContext)
  ▶ extract  (LLM → structured risk factors only)
    ▶ quantify  (PYTHON model.py → score, band, Phase-I/II, remediation $)   ← the value
        ├─ band high/medium ▶ scope_phase_ii (LLM narrates the sampling plan)
        └─ band low/none ──────────────────────────────────┐
  ▶ finalize (assemble the report) ◀────────────────────────┘
  ▶ announce (post the assessment into the Band room) ▶ END
```

`quantify` is pure Python and unit-testable; the conditional edge routes on its
result. Each node posts a Band `thought` / `tool_call` event so the reasoning —
including the deterministic computation — is visible in the room. Acyclic, bounded.

## Run

```bash
cd services/environmental-agent
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # fill in AIML_API_KEY + BAND_ENVIRONMENTAL_* (same values as the app)
python app.py          # serves on http://127.0.0.1:8000
```

Then point the Next.js app at it (in the app's `.env.local`):

```
ENVIRONMENTAL_AGENT_URL=http://127.0.0.1:8000
```

If the service is not running, the orchestrator transparently falls back to an
in-process implementation, so the committee never stalls.

## Endpoints

- `GET /health` → `{ status, framework: "langgraph", model }`
- `POST /assess` → runs the graph, posts to Band, returns the structured report.
