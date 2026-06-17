"""Quantitative models for all three specialists — the numeric core, in Python.

This is *why* the specialists are in Python: regulated due diligence needs
auditable, reproducible numbers, not an LLM guessing. Each agent's LLM only
EXTRACTS facts; the functions here do the math. Pure and unit-testable (no LLM,
no I/O). Same inputs -> same numbers, every time (seeded).

Which function belongs to which agent:
  - Environmental -> score_environment() + simulate_remediation_cost()
  - CapEx         -> simulate_capex()
  - Insurance     -> simulate_catastrophe()
  - Shared        -> usd() formatting helper
"""
from __future__ import annotations

from typing import TypedDict

import numpy as np


class RiskFactors(TypedDict, total=False):
    prior_use: str          # e.g. "fueling depot", "dry cleaner", "printing/etching", "none"
    ust_present: bool        # underground storage tank(s) referenced
    ust_removed: bool        # removed, but closure may be unverified
    flood_zone: bool         # in a FEMA flood zone
    building_year: int       # year built (asbestos/lead era < 1985)
    phase_i_done: bool       # a Phase I ESA is already on record
    adjacent_risk: bool      # adjacent/nearby contaminated or listed site


class RiskResult(TypedDict):
    score: int               # 0–100
    band: str                # none | low | medium | high
    phase_i_recommended: bool
    phase_ii_recommended: bool
    remediation_cost_low: int
    remediation_cost_high: int
    drivers: list[str]       # itemized, auditable "why"


def score_environment(f: RiskFactors) -> RiskResult:
    pts = 0
    drivers: list[str] = []

    use = (f.get("prior_use") or "none").lower()
    if any(k in use for k in ("gas", "fuel", "service station", "petroleum")):
        pts += 40; drivers.append("Former fueling/service-station use (+40)")
    elif "dry clean" in use:
        pts += 35; drivers.append("Former dry-cleaner use — chlorinated solvents (+35)")
    elif any(k in use for k in ("industrial", "manufactur", "printing", "etching", "chemical")):
        pts += 25; drivers.append("Former industrial/chemical use (+25)")

    if f.get("ust_present"):
        if f.get("ust_removed"):
            pts += 12; drivers.append("USTs reportedly removed, closure unverified (+12)")
        else:
            pts += 28; drivers.append("Underground storage tank(s) in place (+28)")

    if f.get("flood_zone"):
        pts += 8; drivers.append("Within a FEMA flood zone (+8)")

    year = f.get("building_year") or 0
    if 0 < year < 1985:
        pts += 10; drivers.append(f"Pre-1985 construction ({year}) — asbestos/lead risk (+10)")

    if not f.get("phase_i_done"):
        pts += 12; drivers.append("No Phase I ESA on record (+12)")

    if f.get("adjacent_risk"):
        pts += 15; drivers.append("Adjacent/nearby contaminated or listed site (+15)")

    score = min(pts, 100)
    band = "high" if score >= 60 else "medium" if score >= 35 else "low" if score >= 15 else "none"

    phase_i = score >= 35 or bool(f.get("ust_present")) or any(
        k in use for k in ("gas", "fuel", "dry clean", "industrial", "printing", "etching", "chemical", "petroleum")
    )
    phase_ii = band in ("high", "medium")

    # Order-of-magnitude remediation cost band (illustrative parametric model).
    base = {"none": 0, "low": 0, "medium": 150_000, "high": 600_000}[band]
    if base:
        low, high = base, base * 3
    else:
        low, high = (0, 50_000) if phase_i else (0, 0)  # Phase I/II investigation only

    return {
        "score": score,
        "band": band,
        "phase_i_recommended": phase_i,
        "phase_ii_recommended": phase_ii,
        "remediation_cost_low": low,
        "remediation_cost_high": high,
        "drivers": drivers,
    }


def usd(n: int) -> str:
    return "$0" if n == 0 else f"${n/1_000_000:.1f}M" if n >= 1_000_000 else f"${n//1000}k"


# ── Probabilistic remediation cost (Monte Carlo) ──────────────────────────────
# Remediation cost is genuinely uncertain, so a single point estimate is
# misleading. We simulate the cost as a sum of per-driver triangular
# distributions and report P50/P90 + the probability of blowing the deal's
# environmental contingency. This is real environmental-engineering practice and
# the kind of numeric work Python (numpy) is built for. Seeded → reproducible.
_SEED = 42
_COST_COMPONENTS: dict[str, tuple[int, int, int]] = {
    # key: (low, most-likely, high) USD
    "fueling": (150_000, 500_000, 2_000_000),
    "dry_clean": (300_000, 900_000, 3_000_000),
    "industrial": (100_000, 350_000, 1_200_000),
    "ust_in_place": (80_000, 220_000, 600_000),
    "ust_removed": (20_000, 60_000, 180_000),
    "asbestos": (30_000, 120_000, 400_000),
    "investigation": (15_000, 35_000, 90_000),  # Phase I/II fieldwork, always if any driver
}


def _cost_components(f: RiskFactors) -> list[str]:
    use = (f.get("prior_use") or "").lower()
    comps: list[str] = []
    if any(k in use for k in ("gas", "fuel", "service station", "petroleum")):
        comps.append("fueling")
    elif "dry clean" in use:
        comps.append("dry_clean")
    elif any(k in use for k in ("industrial", "manufactur", "printing", "etching", "chemical")):
        comps.append("industrial")
    if f.get("ust_present"):
        comps.append("ust_removed" if f.get("ust_removed") else "ust_in_place")
    year = f.get("building_year") or 0
    if 0 < year < 1985:
        comps.append("asbestos")
    return comps


class CostSimulation(TypedDict):
    mean: int
    p10: int
    p50: int
    p90: int
    prob_over_contingency: float
    contingency: int
    iterations: int
    components: list[str]


# ── CapEx / construction specialist — Monte Carlo cost + schedule overrun ──────
_CAPEX_PER_SF = {  # $/sf triangular by scope of work
    "cosmetic": (20, 45, 90),
    "moderate": (60, 130, 280),
    "heavy": (150, 320, 650),
    "conversion": (250, 520, 1_200),  # change-of-use (e.g. warehouse → lab)
}
_CAPEX_MONTHS = {"cosmetic": (2, 4, 8), "moderate": (5, 9, 16), "heavy": (9, 16, 30), "conversion": (12, 22, 42)}


def simulate_capex(factors: dict, purchase_price: int, n: int = 20_000) -> dict:
    scope = (factors.get("scope") or "moderate").lower()
    if scope not in _CAPEX_PER_SF:
        scope = "conversion" if factors.get("conversion") else "moderate"
    sqft = int(factors.get("gross_sqft") or 0) or max(int(purchase_price / 250), 5_000)  # proxy if unknown
    budget = int(factors.get("budget") or 0)
    rng = np.random.default_rng(_SEED)
    lo, mode, hi = _CAPEX_PER_SF[scope]
    psf = rng.triangular(lo, mode, hi, n)
    overrun = rng.triangular(1.0, 1.1, 1.45, n)  # contingency / overrun multiplier
    total = psf * sqft * overrun
    ml, mm, mh = _CAPEX_MONTHS[scope]
    months = rng.triangular(ml, mm, mh, n)
    p50, p90 = (int(x) for x in np.percentile(total, [50, 90]))
    sp50, sp90 = (int(x) for x in np.percentile(months, [50, 90]))
    prob_over = float(np.mean(total > budget)) if budget else 0.0
    return {"scope": scope, "sqft": sqft, "p50": p50, "p90": p90, "mean": int(total.mean()),
            "schedule_p50_months": sp50, "schedule_p90_months": sp90,
            "budget": budget, "prob_over_budget": round(prob_over, 2), "iterations": n}


# ── Insurance / catastrophe specialist — Monte Carlo expected annual loss ──────
# Per peril: annual probability of an event × loss severity (fraction of value).
_PERILS = {  # name: (base_prob, elevated_prob, sev_low, sev_mode, sev_high)
    "flood": (0.004, 0.04, 0.05, 0.18, 0.55),
    "wind": (0.010, 0.06, 0.02, 0.08, 0.30),
    "quake": (0.002, 0.03, 0.05, 0.22, 0.60),
}


def simulate_catastrophe(factors: dict, purchase_price: int, n: int = 20_000) -> dict:
    rv = int(factors.get("replacement_value") or 0) or int(purchase_price * 0.8)  # building value proxy
    flags = {"flood": bool(factors.get("flood_zone")), "wind": bool(factors.get("coastal_wind")), "quake": bool(factors.get("seismic"))}
    rng = np.random.default_rng(_SEED)
    annual = np.zeros(n)
    drivers: list[str] = []
    for peril, (p_base, p_hi, slo, smode, shi) in _PERILS.items():
        p = p_hi if flags[peril] else p_base
        hits = rng.random(n) < p
        sev = rng.triangular(slo, smode, shi, n)
        annual += hits * sev * rv
        if flags[peril]:
            drivers.append(f"Elevated {peril} exposure (annual p≈{int(p*100)}%)")
    eal = int(annual.mean())
    p99 = int(np.percentile(annual, 99))
    premium = int(eal * 1.4 + rv * 0.0008)  # loaded EAL + base expense load
    return {"replacement_value": rv, "expected_annual_loss": eal, "p99_year_loss": p99,
            "annual_premium_est": premium, "drivers": drivers or ["No elevated catastrophe exposure"],
            "iterations": n}


def simulate_remediation_cost(f: RiskFactors, contingency: int = 0, n: int = 20_000) -> CostSimulation:
    comps = _cost_components(f)
    if not comps:
        return {"mean": 0, "p10": 0, "p50": 0, "p90": 0, "prob_over_contingency": 0.0,
                "contingency": contingency, "iterations": 0, "components": []}
    rng = np.random.default_rng(_SEED)
    total = np.zeros(n)
    for key in [*comps, "investigation"]:
        lo, mode, hi = _COST_COMPONENTS[key]
        total += rng.triangular(lo, mode, hi, n)
    p10, p50, p90 = (int(x) for x in np.percentile(total, [10, 50, 90]))
    prob = float(np.mean(total > contingency)) if contingency else 0.0
    return {"mean": int(total.mean()), "p10": p10, "p50": p50, "p90": p90,
            "prob_over_contingency": round(prob, 2), "contingency": contingency,
            "iterations": n, "components": comps}
