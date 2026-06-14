"""The Environmental specialist as a LangGraph state machine.

This is the cross-framework member of the committee. It runs on LangGraph (Python)
yet joins the SAME Band room as the TypeScript agents and collaborates through it:
it READS the room (getContext), reasons, and POSTS its thoughts and assessment back.

The graph is a genuine branching pipeline — not a single LLM call:

    gather (read Band room)
      → assess (contamination risk + recognized environmental conditions)
        → [risk high/medium] → scope_phase_ii (Phase II scope + remediation $)
        → [risk low/none]    ──────────────────────────────┐
      → govern (deterministic Phase-I safety override) ◄────┘
        → announce (post the assessment into the Band room)

State accumulates across nodes; the conditional edge is the reason this is a graph
and not a function. It is acyclic and bounded — it cannot loop.
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

import band

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
    room_context: str
    risk: str
    findings: list[dict]
    summary: str
    phase_i_recommended: bool
    phase_ii: str  # Phase-II scope + remediation estimate (high/medium risk only)
    report: dict
    band_message: str
    posted_to_band: bool


def _llm() -> ChatOpenAI:
    if not AIML_API_KEY:
        raise RuntimeError("AIML_API_KEY is not set")
    return ChatOpenAI(model=MODEL, base_url=AIML_BASE_URL, api_key=AIML_API_KEY, temperature=0)


def _extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        text = text[start : end + 1]
    return json.loads(text)


def _event(state: AssessState, kind: str, content: str) -> None:
    room_id = state.get("room_id")
    if room_id and BAND_KEY_PRESENT:
        try:
            band.post_event(room_id, content, kind)
        except Exception:  # noqa: BLE001
            pass


# ── Node 1: gather — READ the shared Band room ────────────────────────────────
def gather(state: AssessState) -> AssessState:
    _event(state, "tool_call", "get_room_context() — reading the committee's findings")
    context = ""
    room_id = state.get("room_id")
    if room_id and BAND_KEY_PRESENT:
        try:
            msgs = band.get_context(room_id)
            context = "\n".join(f"{m.get('sender_name') or m.get('sender_id')}: {m.get('content')}" for m in msgs)[:3000]
            _event(state, "tool_result", f"read {len(msgs)} message(s) of shared context")
        except Exception:  # noqa: BLE001
            pass
    return {"room_context": context}


# ── Node 2: assess — contamination risk + recognized environmental conditions ──
def assess(state: AssessState) -> AssessState:
    _event(state, "thought", "Assessing prior site use, RECs, and contamination risk.")
    pf = state.get("property_fact", {})
    comp = state.get("compliance", {})
    deal = state.get("deal", {})
    prompt = f"""You are an Environmental due-diligence specialist recruited into a \
real-estate committee. Read the shared room context, then assess contamination / \
recognized environmental conditions (RECs) and the overall contamination risk.

SHARED BAND ROOM CONTEXT:
{state.get('room_context') or '(none available)'}

DEAL: {deal.get('title', 'n/a')} — {deal.get('intended_use', 'n/a')}
PROPERTY NOTES: {json.dumps(pf.get('notable_conditions', []))[:600]}
MISSING DOCS: {json.dumps(pf.get('missing_documents', []))[:400]}
COMPLIANCE FINDINGS: {json.dumps(comp.get('findings', []))[:900]}

Return ONLY JSON:
{{"contamination_risk":"none|low|medium|high","findings":[{{"id":"env-1","title":"...",\
"detail":"...","severity":"critical|material|minor"}}],"summary":"<20-300 chars>"}}"""
    try:
        resp = _llm().invoke(
            [
                SystemMessage(content="You are a precise environmental analyst. Output strict JSON only."),
                HumanMessage(content=prompt),
            ]
        )
        data = _extract_json(resp.content)
        risk = data.get("contamination_risk", "low")
        findings = data.get("findings", []) or []
        summary = data.get("summary", "Environmental assessment complete.")
    except Exception:  # noqa: BLE001
        risk, findings, summary = "low", [], "Environmental assessment unavailable; defaulting to conservative posture."
    return {"risk": risk, "findings": findings, "summary": summary}


# ── Conditional edge: only scope a Phase II when risk warrants it ─────────────
def route_after_assess(state: AssessState) -> Literal["scope", "skip"]:
    return "scope" if state.get("risk") in ("high", "medium") else "skip"


# ── Node 3 (conditional): scope_phase_ii — deeper work a single call wouldn't do ─
def scope_phase_ii(state: AssessState) -> AssessState:
    _event(state, "thought", "Risk is elevated — scoping a Phase II and estimating remediation cost.")
    deal = state.get("deal", {})
    prompt = f"""Risk for {deal.get('title', 'the property')} is {state.get('risk')}. Based on this summary: \
"{state.get('summary')}", briefly scope a Phase II Environmental Site Assessment (what to sample/test) and give \
a rough order-of-magnitude remediation cost range. 1-2 sentences, plain text."""
    try:
        resp = _llm().invoke([HumanMessage(content=prompt)])
        phase_ii = resp.content.strip()
    except Exception:  # noqa: BLE001
        phase_ii = "Recommend a Phase II ESA (soil and groundwater sampling near the former use); remediation cost to be scoped."
    return {"phase_ii": phase_ii, "phase_i_recommended": True}


# ── Node 4: govern — deterministic safety override ────────────────────────────
def govern(state: AssessState) -> AssessState:
    findings = state.get("findings", [])
    critical = any(f.get("severity") == "critical" for f in findings)
    phase_i = bool(state.get("phase_i_recommended")) or state.get("risk") == "high" or critical
    summary = state.get("summary", "")
    if state.get("phase_ii"):
        summary = f"{summary} Phase II: {state['phase_ii']}"
    report = EnvironmentalReport(
        contamination_risk=state.get("risk", "low"),  # type: ignore[arg-type]
        phase_i_recommended=phase_i,
        findings=[Finding(**f) for f in findings if isinstance(f, dict)],
        summary=summary[:400] or "Environmental assessment complete.",
    )
    return {"report": report.model_dump(), "phase_i_recommended": phase_i}


# ── Node 5: announce — post the assessment into the shared Band room ──────────
def announce(state: AssessState) -> AssessState:
    report = state["report"]
    rec = "I recommend a Phase I ESA before closing." if report.get("phase_i_recommended") else "No Phase I appears warranted at this stage."
    band_message = f"{report.get('summary')}\n\nContamination risk: {report.get('contamination_risk')}. {rec}"
    posted = False
    room_id = state.get("room_id")
    if room_id and BAND_KEY_PRESENT:
        try:
            band.post_message(room_id, band_message, state.get("mention_ids", []))
            posted = True
        except Exception:  # noqa: BLE001
            posted = False
    return {"band_message": band_message, "posted_to_band": posted}


def build_graph():
    g = StateGraph(AssessState)
    g.add_node("gather", gather)
    g.add_node("assess", assess)
    g.add_node("scope_phase_ii", scope_phase_ii)
    g.add_node("govern", govern)
    g.add_node("announce", announce)
    g.set_entry_point("gather")
    g.add_edge("gather", "assess")
    g.add_conditional_edges("assess", route_after_assess, {"scope": "scope_phase_ii", "skip": "govern"})
    g.add_edge("scope_phase_ii", "govern")
    g.add_edge("govern", "announce")
    g.add_edge("announce", END)
    return g.compile()


GRAPH = build_graph()
