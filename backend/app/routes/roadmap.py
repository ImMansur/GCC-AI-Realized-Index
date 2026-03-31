import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.firebase import get_db
from app.routes.questions import get_client, get_deployment

router = APIRouter()

ROADMAP_PROMPT = """You are a senior AI transformation consultant at EY producing a personalized AI transformation roadmap for a GCC leader.

Given the user's persona, role, current GARIX composite score and per-dimension scores, generate a concrete, actionable roadmap to advance to the next maturity stage.

GARIX Maturity Stages:
- Stage 1 (1–2): AI Aware
- Stage 2 (2–3): AI Embedded
- Stage 3 (3–4): AI Scaled
- Stage 4 (4–4.5): AI Native
- Stage 5 (4.5–5): AI Realized

Return a JSON object with EXACTLY this structure:
{
  "target_score": <number — realistic 6-month target score, typically current + 1.0 to 1.7>,
  "target_stage_name": "<stage name the target score falls into>",
  "actions": [
    {
      "number": 1,
      "title": "<short action title, max 6 words>",
      "description": "<2-3 sentence practical description of what to do and why it matters. Be specific to their persona/role.>",
      "timeline": "30-day action"
    },
    {
      "number": 2,
      "title": "<short action title>",
      "description": "<2-3 sentence description>",
      "timeline": "60-day action"
    },
    {
      "number": 3,
      "title": "<short action title>",
      "description": "<2-3 sentence description>",
      "timeline": "90-day action"
    }
  ],
  "journey": [
    {
      "months": "1-2",
      "phase_title": "<short phase name>",
      "milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
    },
    {
      "months": "2-3",
      "phase_title": "<short phase name>",
      "milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
    },
    {
      "months": "3-5",
      "phase_title": "<short phase name>",
      "milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
    },
    {
      "months": "5-6",
      "phase_title": "<short phase name>",
      "milestones": ["<milestone 1>", "<milestone 2>", "<milestone 3>"]
    }
  ],
  "projected_landing": "<1-2 sentence summary of what executing this roadmap achieves. Reference the target score, target stage, and India GCC median of 2.6.>"
}

Requirements:
- Actions should be specific to their weakest dimensions and most impactful improvements
- Journey milestones should be concrete, measurable deliverables
- Use professional consulting language, not generic platitudes
- Reference specific dimension names where relevant
- The roadmap should feel personalized to their persona and role

Return ONLY the JSON object, no other text."""


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


@router.post("/roadmap/generate")
async def generate_roadmap(req: RoadmapRequest):
    """Generate AI transformation roadmap based on GARIX scores."""
    try:
        dims_summary = "\n".join(
            f"- {d.dimension_name} (ID {d.dimension_id}): Score {d.score}/5 (weight {d.weight}×)"
            for d in req.dimensions
        )

        # Find current stage
        cs = req.composite_score
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

        # Find weakest and strongest
        sorted_dims = sorted(req.dimensions, key=lambda d: d.score)
        weakest = sorted_dims[:3]
        strongest = sorted_dims[-2:]

        user_prompt = f"""Company/GCC: {req.company or 'India GCC'}
Persona: {req.persona}
Role: {req.role}
Current GARIX Composite Score: {req.composite_score}/5 ({current_stage})

Dimension Scores:
{dims_summary}

Weakest dimensions (focus areas): {', '.join(f'{d.dimension_name} ({d.score})' for d in weakest)}
Strongest dimensions: {', '.join(f'{d.dimension_name} ({d.score})' for d in strongest)}

Generate a personalized 6-month AI transformation roadmap for this {req.role} in {req.persona} to advance from {current_stage} to the next stage."""

        response = get_client().chat.completions.create(
            model=get_deployment(),
            messages=[
                {"role": "system", "content": ROADMAP_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=2000,
        )

        content = response.choices[0].message.content or ""
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        roadmap = json.loads(content)

        # Persist roadmap in Firestore
        try:
            db = get_db()
            roadmap_doc = {
                "uid": req.uid or "anonymous",
                "persona": req.persona,
                "role": req.role,
                "composite_score": req.composite_score,
                "dimensions": [d.model_dump() for d in req.dimensions],
                "roadmap": roadmap,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            }
            db.collection("roadmaps").add(roadmap_doc)
            if req.uid:
                db.collection("users").document(req.uid).collection("roadmaps").add(roadmap_doc)
        except Exception:
            pass  # Don't fail the response if storage fails

        return {"status": "ok", "roadmap": roadmap}
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse roadmap response")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
