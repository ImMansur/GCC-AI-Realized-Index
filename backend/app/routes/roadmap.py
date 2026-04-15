import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.firebase import get_db
from app.routes.questions import get_client, get_deployment

router = APIRouter()

ROADMAP_PROMPT = """You are a senior AI transformation consultant creating a 6-month roadmap for a GCC leader.

TASK:
Generate a practical roadmap to move from current GARIX stage to the next stage.

---

CRITICAL RULE 1 — SCORE SENSITIVITY:

- If a dimension score ≥ 4.5:
  → Do NOT criticize or suggest foundational fixes
  → Focus only on optimization, scaling, or acceleration

- If a dimension score < 4:
  → Focus on building foundational capabilities

---

CRITICAL RULE 2 — INTER-DIMENSION CONSISTENCY:

Ensure roadmap actions are logically connected:

- Strategy drives all improvements
- Risk aligns with Strategy maturity
- Performance & Value depends on Strategy and Data
- Platform & Data must evolve together
- Governance, Talent, Organization, Data must be coordinated

Avoid isolated or conflicting actions.

---

CRITICAL RULE 3 — COHERENT TRANSFORMATION:

- Actions must feel like one integrated plan
- Sequence logically (foundation → scale → optimize)
- Do not mix early-stage and advanced actions randomly

---

OUTPUT FORMAT:
{
  "target_score": <number>,
  "target_stage_name": "<stage>",
  "actions": [
    {
      "number": 1,
      "title": "<short title>",
      "description": "<2-3 sentence practical action>",
      "timeline": "30-day action"
    },
    {
      "number": 2,
      "title": "<short title>",
      "description": "<2-3 sentence action>",
      "timeline": "60-day action"
    },
    {
      "number": 3,
      "title": "<short title>",
      "description": "<2-3 sentence action>",
      "timeline": "90-day action"
    }
  ],
  "journey": [
    {
      "months": "1-2",
      "phase_title": "<phase>",
      "milestones": ["...", "...", "..."]
    },
    {
      "months": "2-3",
      "phase_title": "<phase>",
      "milestones": ["...", "...", "..."]
    },
    {
      "months": "3-5",
      "phase_title": "<phase>",
      "milestones": ["...", "...", "..."]
    },
    {
      "months": "5-6",
      "phase_title": "<phase>",
      "milestones": ["...", "...", "..."]
    }
  ],
  "projected_landing": "<summary>"
}


Requirements:
- Actions should target weakest dimensions
- Journey milestones must be measurable
- Use professional consulting language
- Personalize to persona and role
- Reference dimension names explicitly

CRITICAL CONSISTENCY RULES (STRICT):

The roadmap must reflect ONE unified transformation narrative across all dimensions.

1. Strategy is the primary driver:
   - If Strategy is weak → first actions MUST strengthen Strategy
   - All other dimensions must depend on Strategy maturity

2. Strategy & Risk:
   - Risk must align with Strategy maturity
   - Do NOT propose advanced risk frameworks if Strategy is weak

3. Performance & Value:
   - Must depend on BOTH Strategy and Data maturity
   - No value realization without foundation

4. Platform & Data:
   - Must evolve together
   - No advanced platform without strong data readiness

5. Governance, Talent, Organization, Data:
   - Must be improved together
   - Avoid isolated improvements

GLOBAL RULE:
All actions must feel like ONE coordinated transformation plan.
No contradictions. No isolated maturity jumps.

Return ONLY the JSON object.
"""


class DimensionScoreItem(BaseModel):
    dimension_id: int
    dimension_name: str
    score: float
    weight: float
    weighted_score: float


class RoadmapRequest(BaseModel):
    persona: str
    role: str
    composite_score: float
    dimensions: list[DimensionScoreItem]
    company: str = ""
    uid: Optional[str] = None


def generate_roadmap_data(
    persona: str,
    role: str,
    composite_score: float,
    dimensions: list,
    uid: str | None = None,
    company: str = "",
) -> dict | None:
    """Generate a roadmap dict from raw parameters. Saves to Firestore and returns the roadmap JSON."""
    dim_items = [
        d if isinstance(d, DimensionScoreItem) else DimensionScoreItem(**d)
        for d in dimensions
    ]
    dims_summary = "\n".join(
        f"- {d.dimension_name} (ID {d.dimension_id}): Score {d.score}/5 (weight {d.weight}×)"
        for d in dim_items
    )

    cs = composite_score
    if cs < 2:
        current_stage = "Stage 1 — AI Aware"
    elif cs < 3:
        current_stage = "Stage 2 — AI Embedded"
    elif cs < 4:
        current_stage = "Stage 3 — AI Scaled"
    elif cs < 4.5:
        current_stage = "Stage 4 — AI Native"
    else:
        current_stage = "Stage 5 — AI Realized"

    sorted_dims = sorted(dim_items, key=lambda d: d.score)
    weakest = sorted_dims[:3]
    strongest = sorted_dims[-2:]

    user_prompt = f"""Company/GCC: {company or 'India GCC'}
Persona: {persona}
Role: {role}
Current Score: {composite_score}/5 ({current_stage})

Dimension Scores:
{dims_summary}

Weakest: {', '.join(f'{d.dimension_name} ({d.score})' for d in weakest)}
Strongest: {', '.join(f'{d.dimension_name} ({d.score})' for d in strongest)}

Generate roadmap."""

    response = get_client().chat.completions.create(
        model=get_deployment(),
        messages=[
            {"role": "system", "content": ROADMAP_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=2000,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
    if content.endswith("```"):
        content = content[:-3]

    roadmap = json.loads(content)

    try:
        db = get_db()
        db.collection("roadmaps").add({
            "uid": uid or "anonymous",
            "roadmap": roadmap,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    except:
        pass

    return roadmap


@router.post("/roadmap/generate")
async def generate_roadmap(req: RoadmapRequest):
    try:
        roadmap = generate_roadmap_data(
            persona=req.persona,
            role=req.role,
            composite_score=req.composite_score,
            dimensions=req.dimensions,
            uid=req.uid,
            company=req.company,
        )
        return {"status": "ok", "roadmap": roadmap}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))