# Quantitative Specialists — LangGraph (Python)

The cross-framework members of the due-diligence committee. The five core agents
run in the TypeScript app; these three run on **LangGraph** in Python and join
the **same Band room** as first-class participants. Band makes the framework
boundary disappear: no shared database, no glue code, just agents posting into
the conversation.

This one service hosts three distinct specialists, each its own agent with its
own model and its own Band identity:

| Specialist     | What it computes                                              | Model function |
| -------------- | ------------------------------------------------------------- | -------------- |
| Environmental  | Contamination risk score, Phase I/II call, remediation cost   | `score_environment` + `simulate_remediation_cost` |
| CapEx          | Renovation/conversion cost and schedule risk                  | `simulate_capex` |
| Insurance      | Flood/wind/quake expected annual loss and premium             | `simulate_catastrophe` |

**Why these agents are in Python (the actual value):** regulated due diligence
shouldn't accept an LLM *guessing* a number. Each agent's LLM only *extracts
facts* from the shared room; the **numpy Monte-Carlo models** (20k seeded runs)
do the math and produce auditable, reproducible figures — P50/P90, expected
loss, probability of blowing a budget. Same inputs, same numbers, every run.

## Layout

```
app.py          FastAPI host — routes POST /assess to the right specialist by type
framework.py    shared LangGraph builder: gather → extract → quantify → [elaborate] → finalize → announce
models.py       numpy models for all three specialists + the usd() helper
band.py         Band REST client — each specialist posts under its own API key
agents/
  environmental.py   bespoke graph (Phase I/II branch); reuses framework helpers
  capex.py           a Spec on the shared framework
  insurance.py       a Spec on the shared framework
```

Every node posts a Band `thought` / `tool_call` event, so the reasoning —
including the deterministic computation — is visible in the room. The graphs are
acyclic and bounded.

## Run

```bash
cd services/specialists
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# in .env (or the process env): AIML_API_KEY plus a distinct Band key per specialist:
#   BAND_ENVIRONMENTAL_API_KEY, BAND_CAPEX_API_KEY, BAND_INSURANCE_API_KEY
uvicorn app:app --port 8000   # serves on http://127.0.0.1:8000
```

Then point the Next.js app at it (in the app's `.env.local`):

```
SPECIALISTS_URL=http://127.0.0.1:8000
```

Each specialist posts to Band under its own identity. There is no fallback: if a
specialist's Band key is missing, it can't post to the room rather than posting
as another agent.

## Endpoints

- `GET /health` → `{ status, framework: "langgraph", model, specialists: [...] }`
- `POST /assess` with `{ "type": "environmental" | "capex" | "insurance", ... }`
  → runs that specialist's graph, posts to Band, returns the structured report.
  An unknown `type` returns `400`.
