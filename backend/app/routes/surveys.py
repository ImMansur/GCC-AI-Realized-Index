import os
import json
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.firebase import get_db
from app.routes.questions import get_client, get_deployment
from app.routes.diagnostic import send_survey_completion_emails, _get_stage

router = APIRouter()
_executor = ThreadPoolExecutor(max_workers=2)

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


INSIGHTS_PROMPT = """You are a senior AI maturity consultant producing a GARIX assessment report for a GCC leader.

TASK:
Generate 3 concise bullet points per dimension describing current maturity based on score.

---

CRITICAL RULE 1 — SCORE-BASED LANGUAGE:

The tone MUST match the score:

Score 1–2:
- Early, fragmented, reactive, limited maturity

Score 3:
- Emerging, developing, partially structured

Score 4:
- Structured, consistent, scalable

Score 4.5–5:
- Fully mature, optimized, industry-leading, proactive

STRICT:
- If score ≥ 4.5 → DO NOT include any negative, weak, or improvement language
- Do NOT suggest gaps or deficiencies for high scores
- Focus only on strengths, maturity, and optimization

---

CRITICAL RULE 2 — INTER-DIMENSION CONSISTENCY:

Ensure all dimensions reflect ONE coherent maturity level.

- Strategy influences all dimensions
- Risk must align with Strategy
- Performance & Value depends on Strategy and Data
- Platform & Data must be aligned
- Governance, Talent, Organization, Data must evolve together

DO NOT create contradictions between dimensions.

---

OUTPUT RULES:
- Exactly 3 bullet points per dimension
- Max 15 words each
- Each bullet MUST be ≤ 120 characters
- Present tense
- Concrete, observable statements

---

GUARDRAILS (STRICT — VIOLATIONS WILL BE REJECTED):

1. Observations only — NO recommendations, advice, or action items
2. Neutral, evidence-based tone — no persuasive or directive language
3. Do NOT use directive phrases like "you should", "you must", "consider", "we recommend", "ensure that"
4. Do NOT mention any vendor, product, or competitor names (e.g. Microsoft, AWS, Google, Accenture, McKinsey, Deloitte, etc.)
5. Do NOT make financial promises or projections (e.g. "will save 30%", "ROI of 5x")
6. Do NOT provide legal advice or reference regulatory specifics
7. Do NOT reference confidential, proprietary, or internal data
8. Do NOT use speculative language (e.g. "likely", "probably", "might", "could potentially")
9. Do NOT include any personally identifiable information (PII) — no names, emails, titles of real people
10. Do NOT use guarantee language (e.g. "guaranteed", "will definitely", "ensures success")

---

Return a JSON object where keys are dimension IDs (as strings "1" through "9") and values are arrays of exactly 3 strings.

Return ONLY the JSON object, no other text."""

import re as _re

_PROHIBITED_TERMS = _re.compile(
    r"\b("
    r"microsoft|aws|amazon|google|accenture|mckinsey|deloitte|kpmg|pwc|"
    r"bain|bcg|ibm|oracle|salesforce|sap|infosys|wipro|tcs|cognizant|capgemini|"
    r"you should|you must|we recommend|ensure that|consider\b|"
    r"guaranteed|will definitely|ensures success|"
    r"likely|probably|might|could potentially|"
    r"will save|roi of|cost reduction of|revenue increase"
    r")\b",
    _re.IGNORECASE,
)

_PII_PATTERN = _re.compile(
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"
)

_MAX_BULLET_LEN = 120


def _sanitize_insights(raw: dict) -> dict:
    """Enforce guardrails on generated insight bullets."""
    cleaned: dict[str, list[str]] = {}
    for dim_id, bullets in raw.items():
        if not isinstance(bullets, list):
            continue
        safe_bullets: list[str] = []
        for bullet in bullets:
            if not isinstance(bullet, str):
                continue
            # Cap length
            text = bullet[:_MAX_BULLET_LEN]
            # Strip prohibited terms
            text = _PROHIBITED_TERMS.sub("***", text)
            # Strip PII (emails)
            text = _PII_PATTERN.sub("[REDACTED]", text)
            safe_bullets.append(text)
        cleaned[str(dim_id)] = safe_bullets
    return cleaned


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

        return _sanitize_insights(json.loads(content))
    except Exception:
        return {}


@router.post("/survey/submit")
async def submit_survey(submission: SurveySubmission):
    """Save completed survey responses and computed scores to Firestore.
    
    NOTE: Email is NOT sent here. It is sent after the user configures the
    roadmap duration and generates a proper roadmap (via /survey/send-report).
    """
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
            "roadmap": None,
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


class SendReportRequest(BaseModel):
    uid: str
    persona: str
    role: str
    scores: dict
    insights: dict | None = None
    roadmap: dict | None = None
    answers: list | None = None


@router.post("/survey/send-report")
async def send_report(req: SendReportRequest, background_tasks: BackgroundTasks):
    """Send the completion email with roadmap after the user has configured it."""
    try:
        db = get_db()
        user_doc = db.collection("users").document(req.uid).get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        user_name = user_data.get("name", "Participant")
        user_email = user_data.get("email", "")

        if not user_email:
            raise HTTPException(status_code=400, detail="User email not found")

        composite_score = req.scores.get("composite_score", 0)

        # Save full report so it shows in the admin Reports tab with all details
        db.collection("diagnostic_reports").add({
            "uid": req.uid,
            "user_name": user_name,
            "user_email": user_email,
            "persona": req.persona,
            "role": req.role,
            "composite_score": composite_score,
            "stage": _get_stage(composite_score),
            "scores": req.scores,
            "insights": req.insights,
            "roadmap": req.roadmap,
            "answers": req.answers,
            "requested_at": datetime.now(timezone.utc).isoformat(),
        })

        background_tasks.add_task(
            send_survey_completion_emails,
            user_name=user_name,
            user_email=user_email,
            persona=req.persona,
            role=req.role,
            composite_score=composite_score,
            dimensions=req.scores.get("dimensions", []),
            insights=req.insights,
            roadmap=req.roadmap,
            answers=req.answers,
        )

        return {"status": "ok", "message": "Report email queued"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
