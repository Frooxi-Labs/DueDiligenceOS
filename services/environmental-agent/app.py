"""FastAPI wrapper around the LangGraph Environmental agent.

The TypeScript orchestrator recruits this specialist over HTTP; the agent runs
its LangGraph reasoning and posts its assessment into the shared Band room.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from pydantic import BaseModel  # noqa: E402

from graph import GRAPH, MODEL  # noqa: E402

app = FastAPI(title="DueDiligenceOS — Environmental Specialist (LangGraph)")


class AssessRequest(BaseModel):
    deal: dict = {}
    property_fact: dict = {}
    compliance: dict = {}
    room_id: str | None = None
    mention_ids: list[str] = []


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "framework": "langgraph", "model": MODEL}


@app.post("/assess")
def assess(req: AssessRequest) -> dict:
    state = GRAPH.invoke(
        {
            "deal": req.deal,
            "property_fact": req.property_fact,
            "compliance": req.compliance,
            "room_id": req.room_id or "",
            "mention_ids": req.mention_ids,
        }
    )
    return {
        "report": state["report"],
        "band_message": state.get("band_message", ""),
        "model": MODEL,
        "framework": "langgraph",
        "posted_to_band": state.get("posted_to_band", False),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
