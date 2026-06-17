"""FastAPI wrapper around the LangGraph quantitative specialists.

The TypeScript committee recruits a specialist over HTTP; the specialist runs its
LangGraph reasoning (reading the shared Band room) and posts an auditable,
deterministically-computed assessment back into the room.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

from typing import Optional  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from agents import GRAPHS, MODELS  # noqa: E402  (environmental, capex, insurance)

# Each specialist posts to Band under its OWN identity (api key → handle). No
# fallback: every specialist is a distinct Band participant with its own key.
BAND_KEYS = {
    "environmental": os.getenv("BAND_ENVIRONMENTAL_API_KEY", ""),
    "capex": os.getenv("BAND_CAPEX_API_KEY", ""),
    "insurance": os.getenv("BAND_INSURANCE_API_KEY", ""),
}

app = FastAPI(title="DueDiligenceOS — Quantitative Specialists (LangGraph)")


class AssessRequest(BaseModel):
    type: str = "environmental"  # environmental | capex | insurance
    deal: dict = Field(default_factory=dict)
    property_fact: dict = Field(default_factory=dict)
    compliance: dict = Field(default_factory=dict)
    room_id: Optional[str] = None
    mention_ids: list = Field(default_factory=list)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "framework": "langgraph", "specialists": sorted(GRAPHS.keys()), "models": MODELS}


@app.post("/assess")
def assess(req: AssessRequest) -> dict:
    graph = GRAPHS.get(req.type)
    if graph is None:
        raise HTTPException(status_code=400, detail=f"unknown specialist type: {req.type}")
    state = graph.invoke(
        {
            "deal": req.deal,
            "property_fact": req.property_fact,
            "compliance": req.compliance,
            "room_id": req.room_id or "",
            "mention_ids": req.mention_ids,
            "band_key": BAND_KEYS.get(req.type, ""),
        }
    )
    report = state.get("report", {})
    # Environmental reports its risk band; specialists set their own headline.
    headline = state.get("headline") or (f"{report.get('contamination_risk', 'low')} contamination risk")
    return {
        "report": report,
        "band_message": state.get("band_message", ""),
        "headline": headline,
        "model": MODEL,
        "framework": "langgraph",
        "specialist": req.type,
        "posted_to_band": state.get("posted_to_band", False),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
