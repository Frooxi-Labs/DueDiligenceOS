"""Deterministic environmental risk + remediation-cost model.

This is *why* the Environmental specialist is in Python: regulated due diligence
needs an auditable, reproducible risk score — not an LLM guessing "medium". The
LLM only EXTRACTS the facts; this rules-based model turns them into a score, a
risk band, a Phase-I determination, and an order-of-magnitude remediation cost,
with an itemized rationale. Same inputs → same numbers, every time. Pure and
unit-testable (no LLM, no I/O)."""
from __future__ import annotations

from typing import TypedDict


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
