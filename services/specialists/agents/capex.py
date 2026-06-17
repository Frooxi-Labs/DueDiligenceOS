"""CapEx / Construction specialist.

Reads the shared Band room, extracts the renovation/conversion scope, then runs
simulate_capex() (numpy Monte Carlo, 20k runs) for a P50/P90 cost and schedule,
and posts the result back into the room. Built on the shared framework.
"""
from __future__ import annotations

import os

import models
from models import usd
from framework import Spec, make_graph

CAPEX = Spec(
    name="capex",
    display="CapEx / Construction",
    model=os.getenv("MODEL_CAPEX") or "gpt-4o-mini",
    thought="Sizing the renovation/conversion scope and modeling cost + schedule risk.",
    extract_instruction='Return {"scope":"cosmetic|moderate|heavy|conversion","gross_sqft":<int|null>,"conversion":true|false,"budget":<int|null>}.',
    tool_label="simulate_capex() — Monte Carlo cost + schedule (numpy, 20k runs)",
    quantify=lambda f, price: models.simulate_capex(f, price),
    summarize=lambda m: (
        f"Renovation/conversion ({m['scope']}, ~{m['sqft']:,} sf): Monte-Carlo cost P50 {usd(m['p50'])}, P90 {usd(m['p90'])}; "
        f"schedule P50 {m['schedule_p50_months']}mo (P90 {m['schedule_p90_months']}mo)."
        + (f" {int(m['prob_over_budget'] * 100)}% chance over the {usd(m['budget'])} budget." if m.get("budget") else "")
    ),
    headline=lambda m: f"CapEx P50 {usd(m['p50'])} · {m['schedule_p50_months']}mo",
    needs_elaboration=lambda m: m["p90"] > m["p50"] * 1.5 or m["schedule_p90_months"] >= 24,
    elaborate_instruction="Given the cost/schedule spread, suggest 1-2 concrete value-engineering or phasing moves to de-risk the budget. 1-2 sentences, plain text.",
)

GRAPH = make_graph(CAPEX)
