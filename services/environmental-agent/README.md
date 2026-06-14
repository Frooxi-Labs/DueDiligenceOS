# Environmental Specialist — LangGraph (Python)

A cross-framework member of the due-diligence committee. While the five core
agents run in the TypeScript app, this specialist runs on **LangGraph** in
Python — yet joins the **same Band room** and collaborates through it. Band
makes the framework boundary disappear: no shared database, no glue code, just a
participant posting into the conversation.

## How it fits

When Regulatory or Legal decides a property needs environmental review (emergent
dispatch), the orchestrator recruits this agent into the Band room and calls it
over HTTP. The agent runs its LangGraph state machine and posts its assessment
back into the room as a first-class participant.

```
assess (LLM) ──▶ govern (deterministic Phase-I override) ──▶ announce (post to Band) ──▶ END
```

The graph is acyclic and bounded — it cannot loop.

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
