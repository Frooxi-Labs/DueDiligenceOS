"""Insurance / Catastrophe specialist.

Reads the shared Band room, extracts the flood/wind/seismic exposure, then runs
simulate_catastrophe() (numpy Monte Carlo, 20k runs) for an expected annual loss,
a 1-in-100-year loss, and a premium estimate, and posts the result back into the
room. Built on the shared framework.
"""
from __future__ import annotations

import os

import models
from models import usd
from framework import Spec, make_graph

INSURANCE = Spec(
    name="insurance",
    display="Insurance / Catastrophe",
    model=os.getenv("MODEL_INSURANCE") or "gpt-4o-mini",
    thought="Modeling flood/wind/quake exposure and expected annual loss.",
    extract_instruction='Return {"flood_zone":true|false,"coastal_wind":true|false,"seismic":true|false,"replacement_value":<int|null>}.',
    tool_label="simulate_catastrophe() — Monte Carlo expected loss (numpy, 20k runs)",
    quantify=lambda f, price: models.simulate_catastrophe(f, price),
    summarize=lambda m: (
        f"Catastrophe exposure on ~{usd(m['replacement_value'])} replacement value: expected annual loss {usd(m['expected_annual_loss'])}, "
        f"1-in-100-year loss {usd(m['p99_year_loss'])}; est. annual premium {usd(m['annual_premium_est'])}. "
        + "; ".join(m.get("drivers", []))
    ),
    headline=lambda m: f"EAL {usd(m['expected_annual_loss'])} · premium {usd(m['annual_premium_est'])}/yr",
)

GRAPH = make_graph(INSURANCE)
