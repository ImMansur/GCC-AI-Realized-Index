import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.firebase import get_db
from app.routes.questions import get_client, get_deployment

router = APIRouter()

# Strategy (id=1) and Risk Management (id=9) carry 1.5× weight
DIMENSION_WEIGHTS = {
    1: 1.5,  # Strategy
    2: 1.0,  # Process
    3: 1.0,  # Talent & Skills
    4: 1.0,  # Platform & Technology
    5: 1.0,  # Organization
    6: 1.0,  # Data
    7: 1.0,  # Performance & Value
    8: 1.0,  # Governance
    9: 1.5,  # Risk Management
}


class OptionDetail(BaseModel):
    value: int
    label: str
    description: str


class AnswerItem(BaseModel):
    dimension_id: int
    dimension_name: str
    question: str
    selected_option: int  # 1-5
    option_label: str
    option_description: str
    all_options: Optional[list[OptionDetail]] = None


class SurveySubmission(BaseModel):
    uid: str
    persona: str
    role: str
    answers: list[AnswerItem]


def compute_scores(answers: list[AnswerItem]) -> dict:
    """Compute per-dimension and composite weighted GARIX score."""
    dimension_scores = []
    total_weighted = 0.0
    total_weight = 0.0

    for a in answers:
        weight = DIMENSION_WEIGHTS.get(a.dimension_id, 1.0)
        total_weighted += a.selected_option * weight
        total_weight += weight
        dimension_scores.append(
            {
                "dimension_id": a.dimension_id,
                "dimension_name": a.dimension_name,
                "score": a.selected_option,
                "weight": weight,
                "weighted_score": round(a.selected_option * weight, 2),
            }
        )

    composite = round(total_weighted / total_weight, 2) if total_weight > 0 else 0
    return {
        "dimensions": dimension_scores,
        "composite_score": composite,
        "total_weighted": round(total_weighted, 2),
        "total_weight": round(total_weight, 2),
    }


INSIGHTS_PROMPT = """You are a senior AI maturity consultant producing a personalized GARIX assessment report for a GCC leader.

Given the user's persona, role, and their scores across 9 GARIX dimensions (each scored 1-5), generate a concise insight for EACH dimension describing what their current maturity stage looks like in practice.

For each dimension, provide exactly 3 bullet points that:
- Are specific to their score level and persona/role responsibilities
- Describe observable behaviors, capabilities, or outcomes at their current stage
- Use present tense, professional consulting language
- Are concise (max 15 words each)

Return a JSON object where keys are dimension IDs (as strings "1" through "9") and values are arrays of exactly 3 strings.

Return ONLY the JSON object, no other text."""


def generate_insights(persona: str, role: str, scores: dict) -> dict:
    """Call Azure OpenAI to generate per-dimension stage insights."""
    dims_summary = "\n".join(
        f"- {d['dimension_name']} (ID {d['dimension_id']}): Score {d['score']}/5"
        for d in scores["dimensions"]
    )

    user_prompt = f"""Persona: {persona}
Role: {role}
Composite GARIX Score: {scores['composite_score']}/5

Dimension Scores:
{dims_summary}

Generate 3 concise bullet points per dimension describing what this maturity stage looks like for a {role} in {persona}."""

    try:
        response = get_client().chat.completions.create(
            model=get_deployment(),
            messages=[
                {"role": "system", "content": INSIGHTS_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=1500,
        )

        content = response.choices[0].message.content or ""
        content = content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        return json.loads(content)
    except Exception:
        return {}


@router.post("/survey/submit")
async def submit_survey(submission: SurveySubmission):
    """Save completed survey responses and computed scores to Firestore."""
    try:
        db = get_db()
        scores = compute_scores(submission.answers)
        insights = generate_insights(submission.persona, submission.role, scores)

        survey_data = {
            "uid": submission.uid,
            "persona": submission.persona,
            "role": submission.role,
            "answers": [a.model_dump() for a in submission.answers],
            "scores": scores,
            "insights": insights,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }

        # Save under users/{uid}/surveys/{auto-id}
        _, doc_ref = (
            db.collection("users")
            .document(submission.uid)
            .collection("surveys")
            .add(survey_data)
        )

        # Also save a top-level copy for admin queries
        db.collection("surveys").add(survey_data)

        return {"status": "ok", "survey_id": doc_ref.id, "scores": scores, "insights": insights}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
