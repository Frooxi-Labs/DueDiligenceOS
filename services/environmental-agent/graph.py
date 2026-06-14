"""The Environmental specialist as a LangGraph state machine.

This is the cross-framework agent: it runs on LangGraph (Python) yet joins the
exact same Band room as the TypeScript committee and collaborates through it.
The graph is intentionally acyclic — assess → govern → announce → END — so it
is bounded and can never loop.
"""
from __future__ import annotations

import json
import os
import re
from typing import Literal, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from pydantic import BaseModel, Field

from band import post_message

AIML_BASE_URL = os.getenv("AIML_BASE_URL", "https://api.aimlapi.com/v1")
AIML_API_KEY = os.getenv("AIML_API_KEY", "")
MODEL = os.getenv("MODEL_ENVIRONMENTAL", "gpt-4o-mini")
BAND_KEY_PRESENT = bool(os.getenv("BAND_ENVIRONMENTAL_API_KEY"))


# ── Output contract — mirrors the TS EnvironmentalReportSchema (Zod) ──────────
class Finding(BaseModel):
    id: str
    title: str
    detail: str
    severity: Literal["critical", "material", "minor"]


class EnvironmentalReport(BaseModel):
    agent: Literal["environmental"] = "environmental"
    contamination_risk: Literal["none", "low", "medium", "high"]
    phase_i_recommended: bool
    findings: list[Finding] = Field(default_factory=list)
    summary: str


class AssessState(TypedDict, total=False):
    deal: dict
    property_fact: dict
    compliance: dict
    room_id: str
    mention_ids: list[str]
    report: dict
    band_message: str
    posted_to_band: bool


def _llm() -> ChatOpenAI:
    if not AIML_API_KEY:
        raise RuntimeError("AIML_API_KEY is not set")
    return ChatOpenAI(model=MODEL, base_url=AIML_BASE_URL, api_key=AIML_API_KEY, temperature=0)


def _extract_json(text: str) -> dict:
    text = text.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


# ── Node 1: assess — the LLM reasoning step ───────────────────────────────────
def assess(state: AssessState) -> AssessState:
    pf = state.get("property_fact", {})
    comp = state.get("compliance", {})
    deal = state.get("deal", {})
    prompt = f"""You are an Environmental due-diligence specialist recruited into a \
real-estate committee. Assess contamination/remediation exposure for this property \
and decide whether a Phase I Environmental Site Assessment is warranted.

DEAL: {deal.get('title', 'n/a')} — {deal.get('intended_use', 'n/a')}
PROPERTY NOTES: {json.dumps(pf.get('notable_conditions', []))[:600]}
MISSING DOCS: {json.dumps(pf.get('missing_documents', []))[:400]}
COMPLIANCE FINDINGS: {json.dumps(comp.get('findings', []))[:900]}

Return ONLY JSON:
{{"agent":"environmental","contamination_risk":"none|low|medium|high",\
"phase_i_recommended":true|false,"findings":[{{"id":"env-1","title":"...",\
"detail":"...","severity":"critical|material|minor"}}],"summary":"<20-400 chars>"}}
Start with {{ and end with }}."""
    resp = _llm().invoke(
        [
            SystemMessage(content="You are a precise environmental analyst. Output strict JSON only."),
            HumanMessage(content=prompt),
        ]
    )
    report = EnvironmentalReport(**_extract_json(resp.content))
    return {"report": report.model_dump()}


# ── Node 2: govern — deterministic safety override ────────────────────────────
def govern(state: AssessState) -> AssessState:
    report = dict(state["report"])
    critical = any(f["severity"] == "critical" for f in report.get("findings", []))
    if report.get("contamination_risk") == "high" or critical:
        # A specialist never waives the Phase I when risk is high or a finding is critical.
        report["phase_i_recommended"] = True
    return {"report": report}


# ── Node 3: announce — post into the shared Band room ─────────────────────────
def announce(state: AssessState) -> AssessState:
    report = state["report"]
    msg = report.get("summary", "Environmental assessment complete.")
    rec = "I recommend a Phase I ESA before closing." if report.get("phase_i_recommended") else "No Phase I appears warranted at this stage."
    band_message = f"{msg}\n\nContamination risk: {report.get('contamination_risk')}. {rec}"
    posted = False
    room_id = state.get("room_id")
    if room_id and BAND_KEY_PRESENT:
        try:
            post_message(room_id, band_message, state.get("mention_ids", []))
            posted = True
        except Exception:  # noqa: BLE001 — a failed post must not abort the assessment
            posted = False
    return {"band_message": band_message, "posted_to_band": posted}


def build_graph():
    g = StateGraph(AssessState)
    g.add_node("assess", assess)
    g.add_node("govern", govern)
    g.add_node("announce", announce)
    g.set_entry_point("assess")
    g.add_edge("assess", "govern")
    g.add_edge("govern", "announce")
    g.add_edge("announce", END)
    return g.compile()


GRAPH = build_graph()
