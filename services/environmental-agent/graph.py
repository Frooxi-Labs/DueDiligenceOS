"""The Environmental specialist as a LangGraph state machine.

What Python actually brings to this project (not "a different framework"): an
**auditable, deterministic environmental risk + remediation-cost computation**.
A regulated due-diligence committee shouldn't accept an LLM *guessing* "medium
risk" — it needs a reproducible, rules-based number with an itemized rationale.

So the division of labor is deliberate:
  • the LLM only EXTRACTS facts from the shared Band room (prior use, USTs, flood, age)
  • `model.py` (pure Python) COMPUTES the score, risk band, Phase-I/II call, and cost
  • LangGraph orchestrates it and routes on the computed result

    gather (read Band room)
      ▶ extract (LLM → structured risk factors)
        ▶ quantify (PYTHON model → score, band, Phase-I/II, remediation $)   ← the value
          ├─ band high/medium ▶ scope_phase_ii (LLM narrates the sampling plan)
          └─ band low/none ────────────────────────────────┐
      ▶ finalize (assemble the report) ◀────────────────────┘
        ▶ announce (post into the Band room)

Same facts → same numbers, every run. Acyclic and bounded.
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
from model import RiskFactors, score_environment, simulate_remediation_cost, usd

AIML_BASE_URL = os.getenv("AIML_BASE_URL", "https://api.aimlapi.com/v1")
AIML_API_KEY = os.getenv("AIML_API_KEY", "")
MODEL = os.getenv("MODEL_ENVIRONMENTAL", "gpt-4o-mini")
BAND_KEY_PRESENT = bool(os.getenv("BAND_ENVIRONMENTAL_API_KEY"))


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
    band_key: str
    room_context: str
    factors: dict
    risk: dict          # output of model.score_environment
    sim: dict           # output of model.simulate_remediation_cost (Monte Carlo)
    phase_ii_plan: str
    report: dict
    band_message: str
    posted_to_band: bool


def _llm() -> ChatOpenAI:
    if not AIML_API_KEY:
        raise RuntimeError("AIML_API_KEY is not set")
    return ChatOpenAI(model=MODEL, base_url=AIML_BASE_URL, api_key=AIML_API_KEY, temperature=0)


def _extract_json(text: str) -> dict:
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    s, e = text.find("{"), text.rfind("}")
    if s != -1 and e != -1:
        text = text[s : e + 1]
    return json.loads(text)


def _event(state: AssessState, kind: str, content: str) -> None:
    room_id, key = state.get("room_id"), state.get("band_key")
    if room_id and key:
        try:
            band.post_event(room_id, content, kind, api_key=key)
        except Exception:  # noqa: BLE001
            pass


# ── Node 1: gather — READ the shared Band room ────────────────────────────────
def gather(state: AssessState) -> AssessState:
    _event(state, "tool_call", "get_room_context() — reading the committee's findings")
    context = ""
    room_id, key = state.get("room_id"), state.get("band_key")
    if room_id and key:
        try:
            msgs = band.get_context(room_id, api_key=key)
            context = "\n".join(f"{m.get('sender_name') or m.get('sender_id')}: {m.get('content')}" for m in msgs)[:3000]
            _event(state, "tool_result", f"read {len(msgs)} message(s) of shared context")
        except Exception:  # noqa: BLE001
            pass
    return {"room_context": context}


# ── Node 2: extract — the LLM's ONLY job: pull structured facts ───────────────
def extract(state: AssessState) -> AssessState:
    _event(state, "thought", "Extracting environmental risk factors from the deal and the room.")
    pf = state.get("property_fact", {})
    comp = state.get("compliance", {})
    deal = state.get("deal", {})
    prompt = f"""You are an environmental analyst. From the context below, EXTRACT factual risk \
factors only — do NOT score or judge. If a fact is absent, use the conservative default.

SHARED BAND ROOM:
{state.get('room_context') or '(none)'}
DEAL: {deal.get('title','n/a')} — {deal.get('intended_use','n/a')}
PROPERTY NOTES: {json.dumps(pf.get('notable_conditions', []))[:600]}
COMPLIANCE FINDINGS: {json.dumps(comp.get('findings', []))[:800]}

Return ONLY JSON:
{{"prior_use":"<short, e.g. fueling depot / dry cleaner / printing / none>","ust_present":true|false,\
"ust_removed":true|false,"flood_zone":true|false,"building_year":<int|null>,"phase_i_done":true|false,\
"adjacent_risk":true|false}}"""
    try:
        resp = _llm().invoke(
            [SystemMessage(content="Extract facts as strict JSON only."), HumanMessage(content=prompt)]
        )
        factors = _extract_json(resp.content)
    except Exception:  # noqa: BLE001
        factors = {"prior_use": "unknown", "phase_i_done": False}
    return {"factors": factors}


# ── Node 3: quantify — PURE PYTHON, deterministic & auditable (the value) ─────
def quantify(state: AssessState) -> AssessState:
    factors: RiskFactors = state.get("factors", {})  # type: ignore[assignment]
    deal = state.get("deal", {})
    try:
        price = int(float(str(deal.get("purchase_price") or 0)))
    except ValueError:
        price = 0
    contingency = int(price * 0.02) if price else 0  # typical environmental contingency ≈ 2% of price

    _event(state, "tool_call", "score_environment(facts) + Monte Carlo cost (20k runs) — numpy")
    risk = score_environment(factors)
    sim = simulate_remediation_cost(factors, contingency=contingency)
    if sim["iterations"]:
        _event(state, "tool_result",
               f"score {risk['score']}/100 → {risk['band']}; remediation P50 {usd(sim['p50'])} (P90 {usd(sim['p90'])}); "
               f"{int(sim['prob_over_contingency'] * 100)}% chance over the {usd(contingency)} contingency")
    else:
        _event(state, "tool_result", f"score {risk['score']}/100 → {risk['band']}; no remediation cost anticipated")
    return {"risk": risk, "sim": sim}


def route_after_quantify(state: AssessState) -> Literal["scope", "skip"]:
    return "scope" if state.get("risk", {}).get("phase_ii_recommended") else "skip"


# ── Node 4 (conditional): scope_phase_ii — LLM narrates the sampling plan ──────
def scope_phase_ii(state: AssessState) -> AssessState:
    _event(state, "thought", "Elevated risk — scoping a Phase II sampling plan.")
    risk = state.get("risk", {})
    deal = state.get("deal", {})
    prompt = f"""Risk for {deal.get('title','the property')} computed at {risk.get('score')}/100 ({risk.get('band')}). \
Drivers: {'; '.join(risk.get('drivers', []))}. In 1-2 sentences, scope a Phase II ESA (what to sample/test). Plain text."""
    try:
        plan = _llm().invoke([HumanMessage(content=prompt)]).content.strip()
    except Exception:  # noqa: BLE001
        plan = "Phase II: soil and groundwater sampling near the former use; vapor intrusion screening."
    return {"phase_ii_plan": plan}


# ── Node 5: finalize — assemble the schema-valid report ───────────────────────
def finalize(state: AssessState) -> AssessState:
    risk = state.get("risk", {})
    sim = state.get("sim", {})
    drivers = risk.get("drivers", [])
    sev = "material" if risk.get("band") in ("high", "medium") else "minor"
    findings = [Finding(id=f"env-{i+1}", title="Risk driver", detail=d, severity=sev) for i, d in enumerate(drivers[:4])]
    parts = [f"Computed contamination risk {risk.get('score', 0)}/100 ({risk.get('band', 'low')})."]
    if sim.get("iterations"):
        parts.append(
            f"Monte-Carlo remediation (20k runs): P50 {usd(sim['p50'])}, P90 {usd(sim['p90'])}; "
            f"{int(sim['prob_over_contingency'] * 100)}% chance of exceeding the {usd(sim['contingency'])} contingency."
        )
    else:
        parts.append("No remediation cost anticipated.")
    if state.get("phase_ii_plan"):
        parts.append(state["phase_ii_plan"])
    report = EnvironmentalReport(
        contamination_risk=risk.get("band", "low"),  # type: ignore[arg-type]
        phase_i_recommended=bool(risk.get("phase_i_recommended")),
        findings=findings,
        summary=" ".join(parts)[:400],
    )
    return {"report": report.model_dump()}


# ── Node 6: announce — post the assessment into the shared Band room ──────────
def announce(state: AssessState) -> AssessState:
    report = state["report"]
    rec = "I recommend a Phase I ESA before closing." if report.get("phase_i_recommended") else "No Phase I appears warranted."
    band_message = f"{report.get('summary')}\n\nContamination risk: {report.get('contamination_risk')}. {rec}"
    posted = False
    room_id, key = state.get("room_id"), state.get("band_key")
    if room_id and key:
        try:
            band.post_message(room_id, band_message, state.get("mention_ids", []), api_key=key)
            posted = True
        except Exception:  # noqa: BLE001
            posted = False
    return {"band_message": band_message, "posted_to_band": posted}


def build_graph():
    g = StateGraph(AssessState)
    g.add_node("gather", gather)
    g.add_node("extract", extract)
    g.add_node("quantify", quantify)
    g.add_node("scope_phase_ii", scope_phase_ii)
    g.add_node("finalize", finalize)
    g.add_node("announce", announce)
    g.set_entry_point("gather")
    g.add_edge("gather", "extract")
    g.add_edge("extract", "quantify")
    g.add_conditional_edges("quantify", route_after_quantify, {"scope": "scope_phase_ii", "skip": "finalize"})
    g.add_edge("scope_phase_ii", "finalize")
    g.add_edge("finalize", "announce")
    g.add_edge("announce", END)
    return g.compile()


GRAPH = build_graph()
