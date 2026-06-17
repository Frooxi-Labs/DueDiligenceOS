"""The three recruitable specialists, each its own module, its own Band identity,
and its own model. `GRAPHS` maps the specialist type to its compiled LangGraph
graph; `MODELS` maps it to the model id that specialist uses."""
from agents.capex import CAPEX, GRAPH as _CAPEX
from agents.environmental import MODEL as _ENV_MODEL, GRAPH as _ENVIRONMENTAL
from agents.insurance import INSURANCE, GRAPH as _INSURANCE

GRAPHS = {
    "environmental": _ENVIRONMENTAL,
    "capex": _CAPEX,
    "insurance": _INSURANCE,
}

MODELS = {
    "environmental": _ENV_MODEL,
    "capex": CAPEX.model,
    "insurance": INSURANCE.model,
}
