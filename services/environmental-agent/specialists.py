"""Recruitable quantitative specialists, each a LangGraph graph that READS the
Band room, has the LLM extract facts, then runs a deterministic Python /
Monte-Carlo model and posts an auditable result.

Same shape as the Environmental agent (gather → extract → quantify → finalize →
announce, with an optional elaborate branch) but parameterized by a `Spec`, so
adding a specialist is data, not new graph code. The *value* is the Python math
(numpy Monte Carlo) — the framework just orchestrates it.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Callable, Literal, Optional, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

import band
import model
from model import usd

AIML_BASE_URL = os.getenv("AIML_BASE_URL", "https://api.aimlapi.com/v1")
AIML_API_KEY = os.getenv("AIML_API_KEY", "")
MODEL = os.getenv("MODEL_ENVIRONMENTAL", "gpt-4o-mini")
BAND_KEY_PRESENT = bool(os.getenv("BAND_ENVIRONMENTAL_API_KEY"))


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


class SpecState(TypedDict, total=False):
    deal: dict
    property_fact: dict
    compliance: dict
    room_id: str
    mention_ids: list
    band_key: str
    room_context: str
    factors: dict
    metrics: dict
    elaboration: str
    report: dict
    headline: str
    band_message: str
    posted_to_band: bool


@dataclass
class Spec:
    name: str
    display: str
    thought: str
    extract_instruction: str  # describes the JSON of facts to extract
    tool_label: str
    quantify: Callable[[dict, int], dict]  # (factors, purchase_price) -> metrics
    summarize: Callable[[dict], str]  # metrics -> one-paragraph summary
    headline: Callable[[dict], str]
    needs_elaboration: Optional[Callable[[dict], bool]] = None
    elaborate_instruction: Optional[str] = None


def _event(state: SpecState, kind: str, content: str) -> None:
    room_id, key = state.get("room_id"), state.get("band_key")
    if room_id and key:
        try:
            band.post_event(room_id, content, kind, api_key=key)
        except Exception:  # noqa: BLE001
            pass


def _price(state: SpecState) -> int:
    try:
        return int(float(str(state.get("deal", {}).get("purchase_price") or 0)))
    except ValueError:
        return 0


def make_graph(spec: Spec):
    def gather(state: SpecState) -> SpecState:
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

    def extract(state: SpecState) -> SpecState:
        _event(state, "thought", spec.thought)
        deal = state.get("deal", {})
        prompt = f"""You are the {spec.display} specialist. From the context, EXTRACT facts only — do not score.
SHARED BAND ROOM:
{state.get('room_context') or '(none)'}
DEAL: {deal.get('title','n/a')} — {deal.get('intended_use','n/a')} (price {usd(_price(state))})
PROPERTY NOTES: {json.dumps(state.get('property_fact', {}).get('notable_conditions', []))[:600]}
COMPLIANCE: {json.dumps(state.get('compliance', {}).get('findings', []))[:600]}

{spec.extract_instruction}
Return ONLY that JSON."""
        try:
            resp = _llm().invoke([SystemMessage(content="Extract facts as strict JSON only."), HumanMessage(content=prompt)])
            factors = _extract_json(resp.content)
        except Exception:  # noqa: BLE001
            factors = {}
        return {"factors": factors}

    def quantify(state: SpecState) -> SpecState:
        _event(state, "tool_call", spec.tool_label)
        metrics = spec.quantify(state.get("factors", {}), _price(state))
        _event(state, "tool_result", spec.summarize(metrics)[:180])
        return {"metrics": metrics}

    def route(state: SpecState) -> Literal["elaborate", "finalize"]:
        return "elaborate" if (spec.needs_elaboration and spec.needs_elaboration(state.get("metrics", {}))) else "finalize"

    def elaborate(state: SpecState) -> SpecState:
        _event(state, "thought", "Material risk — drafting a mitigation note.")
        try:
            text = _llm().invoke([HumanMessage(content=f"{spec.elaborate_instruction}\nMetrics: {json.dumps(state.get('metrics', {}))[:600]}")]).content.strip()
        except Exception:  # noqa: BLE001
            text = ""
        return {"elaboration": text}

    def finalize(state: SpecState) -> SpecState:
        metrics = state.get("metrics", {})
        summary = spec.summarize(metrics)
        if state.get("elaboration"):
            summary = f"{summary} {state['elaboration']}"
        return {
            "report": {"specialist": spec.name, "headline": spec.headline(metrics), "summary": summary, "metrics": metrics},
            "headline": spec.headline(metrics),
            "band_message": summary,
        }

    def announce(state: SpecState) -> SpecState:
        posted = False
        room_id, key = state.get("room_id"), state.get("band_key")
        if room_id and key:
            try:
                band.post_message(room_id, state.get("band_message", ""), state.get("mention_ids", []), api_key=key)
                posted = True
            except Exception:  # noqa: BLE001
                posted = False
        return {"posted_to_band": posted}

    g = StateGraph(SpecState)
    g.add_node("gather", gather)
    g.add_node("extract", extract)
    g.add_node("quantify", quantify)
    g.add_node("elaborate", elaborate)
    g.add_node("finalize", finalize)
    g.add_node("announce", announce)
    g.set_entry_point("gather")
    g.add_edge("gather", "extract")
    g.add_edge("extract", "quantify")
    g.add_conditional_edges("quantify", route, {"elaborate": "elaborate", "finalize": "finalize"})
    g.add_edge("elaborate", "finalize")
    g.add_edge("finalize", "announce")
    g.add_edge("announce", END)
    return g.compile()


# ── CapEx / construction specialist ───────────────────────────────────────────
CAPEX = Spec(
    name="capex",
    display="CapEx / Construction",
    thought="Sizing the renovation/conversion scope and modeling cost + schedule risk.",
    extract_instruction='Return {"scope":"cosmetic|moderate|heavy|conversion","gross_sqft":<int|null>,"conversion":true|false,"budget":<int|null>}.',
    tool_label="simulate_capex() — Monte Carlo cost + schedule (numpy, 20k runs)",
    quantify=lambda f, price: model.simulate_capex(f, price),
    summarize=lambda m: (
        f"Renovation/conversion ({m['scope']}, ~{m['sqft']:,} sf): Monte-Carlo cost P50 {usd(m['p50'])}, P90 {usd(m['p90'])}; "
        f"schedule P50 {m['schedule_p50_months']}mo (P90 {m['schedule_p90_months']}mo)."
        + (f" {int(m['prob_over_budget'] * 100)}% chance over the {usd(m['budget'])} budget." if m.get("budget") else "")
    ),
    headline=lambda m: f"CapEx P50 {usd(m['p50'])} · {m['schedule_p50_months']}mo",
    needs_elaboration=lambda m: m["p90"] > m["p50"] * 1.5 or m["schedule_p90_months"] >= 24,
    elaborate_instruction="Given the cost/schedule spread, suggest 1-2 concrete value-engineering or phasing moves to de-risk the budget. 1-2 sentences, plain text.",
)

# ── Insurance / catastrophe specialist ────────────────────────────────────────
INSURANCE = Spec(
    name="insurance",
    display="Insurance / Catastrophe",
    thought="Modeling flood/wind/quake exposure and expected annual loss.",
    extract_instruction='Return {"flood_zone":true|false,"coastal_wind":true|false,"seismic":true|false,"replacement_value":<int|null>}.',
    tool_label="simulate_catastrophe() — Monte Carlo expected loss (numpy, 20k runs)",
    quantify=lambda f, price: model.simulate_catastrophe(f, price),
    summarize=lambda m: (
        f"Catastrophe exposure on ~{usd(m['replacement_value'])} replacement value: expected annual loss {usd(m['expected_annual_loss'])}, "
        f"1-in-100-year loss {usd(m['p99_year_loss'])}; est. annual premium {usd(m['annual_premium_est'])}. "
        + "; ".join(m.get("drivers", []))
    ),
    headline=lambda m: f"EAL {usd(m['expected_annual_loss'])} · premium {usd(m['annual_premium_est'])}/yr",
)

GRAPHS = {"capex": make_graph(CAPEX), "insurance": make_graph(INSURANCE)}
