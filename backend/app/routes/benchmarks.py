"""Dynamic benchmark calculation from survey responses.

Once ≥30 responses exist for a role, benchmarks are computed from real data
using quartiles. Below that threshold the static defaults are returned.
"""

import statistics
from fastapi import APIRouter

from app.firebase import get_db

router = APIRouter()

MIN_RESPONSES = 30

# ── Static fallback benchmarks (used when < 30 responses) ──
_STATIC: dict[str, dict] = {
    "GCC Head":                          {"median": 3.1, "leading_quartile": 3.3, "lagging_quartile": 2.2},
    "Managing Director (MD)":            {"median": 3.1, "leading_quartile": 3.3, "lagging_quartile": 2.2},
    "Chief Operating Officer (COO)":     {"median": 3.1, "leading_quartile": 3.3, "lagging_quartile": 2.2},
    "Strategy Officer":                  {"median": 3.2, "leading_quartile": 3.4, "lagging_quartile": 2.2},
    "CIO":                               {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "CTO/VP Engineering":                {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Head of IT":                        {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Head of Data":                      {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Chief Data Officer":                {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Analytics Lead":                    {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Data Scientists":                   {"median": 3.2, "leading_quartile": 3.4, "lagging_quartile": 2.2},
    "ML Engineers":                      {"median": 3.2, "leading_quartile": 3.4, "lagging_quartile": 2.2},
    "AI CoE":                            {"median": 3.2, "leading_quartile": 3.4, "lagging_quartile": 2.2},
    "CHRO / VP HR":                      {"median": 2.8, "leading_quartile": 3.1, "lagging_quartile": 2.0},
    "Head of L&D":                       {"median": 2.8, "leading_quartile": 3.1, "lagging_quartile": 2.0},
    "Talent Acquisition":                {"median": 2.7, "leading_quartile": 3.1, "lagging_quartile": 2.0},
    "Head of Finance Ops":               {"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "Operations Lead":                   {"median": 2.9, "leading_quartile": 3.2, "lagging_quartile": 2.0},
    "Head of Procurement & Supply Chain":{"median": 3.0, "leading_quartile": 3.3, "lagging_quartile": 2.1},
    "General Counsel":                   {"median": 2.4, "leading_quartile": 3.0, "lagging_quartile": 1.9},
    "Head of Risk":                      {"median": 2.6, "leading_quartile": 3.0, "lagging_quartile": 2.0},
    "Compliance Officer":                {"median": 2.4, "leading_quartile": 3.0, "lagging_quartile": 1.9},
}

_DEFAULT = {"median": 2.9, "leading_quartile": 3.3, "lagging_quartile": 2.1}


def _quantile(data: list[float], q: float) -> float:
    return round(statistics.quantiles(data, n=100, method="inclusive")[int(q * 100) - 1], 2)


def _is_dynamic_enabled() -> bool:
    try:
        db = get_db()
        doc = db.collection("settings").document("benchmarks").get()
        return doc.to_dict().get("dynamic_enabled", False) if doc.exists else False
    except Exception:
        return False


def compute_benchmark(role: str) -> dict:
    """Compute benchmark for a role from Firestore survey data.

    Returns { median, leading_quartile, lagging_quartile, source, count }.
    source = "dynamic" when enabled and ≥30 responses, "static" otherwise.
    """
    if not _is_dynamic_enabled():
        static = _STATIC.get(role, _DEFAULT)
        return {**static, "source": "static", "count": 0}

    db = get_db()

    # Query all surveys matching the role from the top-level surveys collection
    docs = db.collection("surveys").where("role", "==", role).stream()

    scores: list[float] = []
    for doc in docs:
        data = doc.to_dict()
        s = data.get("scores", {})
        cs = s.get("composite_score")
        if cs is not None:
            scores.append(float(cs))

    if len(scores) >= MIN_RESPONSES:
        scores.sort()
        return {
            "median": round(_quantile(scores, 0.50), 2),
            "leading_quartile": round(_quantile(scores, 0.75), 2),
            "lagging_quartile": round(_quantile(scores, 0.25), 2),
            "source": "dynamic",
            "count": len(scores),
        }

    # Fall back to static data
    static = _STATIC.get(role, _DEFAULT)
    return {**static, "source": "static", "count": len(scores)}


@router.get("/benchmarks/{role:path}")
async def get_benchmark(role: str):
    """Return benchmark data for a given role."""
    return compute_benchmark(role)
