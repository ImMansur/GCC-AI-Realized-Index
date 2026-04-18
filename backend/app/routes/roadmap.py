import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.firebase import get_db
from app.routes.questions import get_client, get_deployment

router = APIRouter()

# ── Target Score & Roadmap Duration Lookup Table ──
def _get_target_mapping(composite_score: float, duration_months: int) -> dict:
    """Return target_score_min, target_score_max, and duration based strictly on lookup table."""
    if duration_months not in [3, 6, 9, 12]:
        raise ValueError("Duration must be 3, 6, 9, or 12 months.")

    # Matrix: mapping[score_tier][duration_months] = (target_min, target_max)
    if composite_score < 2.0:
        matrix = {3: (2.0, 2.5), 6: (2.6, 3.0), 9: (3.1, 3.5), 12: (3.6, 4.0)}
    elif composite_score < 3.0:
        matrix = {3: (2.5, 3.0), 6: (3.1, 3.5), 9: (3.6, 4.0), 12: (4.1, 4.5)}
    elif composite_score < 4.0:
        matrix = {3: (3.5, 4.0), 6: (4.1, 4.5), 9: (4.6, 4.8), 12: (4.6, 5.0)}
    elif composite_score < 4.5:
        matrix = {3: (4.1, 4.5), 6: (4.6, 4.8), 9: (4.7, 5.0), 12: (5.0, 5.0)}
    else:  # 4.5 - 5.0
        if duration_months == 3:
            raise ValueError("A 3-month roadmap is not applicable for scores 4.5 and above.")
        matrix = {6: (4.6, 5.0), 9: (5.0, 5.0), 12: (5.0, 5.0)}

    target_min, target_max = matrix[duration_months]

    return {
        "target_min": target_min,
        "target_max": target_max,
        "duration": f"{duration_months} months",
        "duration_months": duration_months
    }


def _build_roadmap_prompt(mapping: dict) -> str:
    """Build the system prompt dynamically based on target mapping & duration."""
    duration = mapping["duration"]
    target_min = mapping["target_min"]
    target_max = mapping["target_max"]
    dm = mapping["duration_months"]

    if target_min >= 5.0:
        target_instruction = (
            "The organization is already at a high maturity level. "
            "Focus on maintaining excellence and continuous improvement. "
            'Set target_score to 5.0 and target_stage_name to "Maintain & Improve".'
        )
    else:
        target_instruction = (
            f"The target score MUST be between {target_min:.1f} and {target_max:.1f}. "
            f"Pick a specific target_score within this range."
        )

    # Dynamically scale the journey layout based on EXACT duration
    if dm == 12:
        journey_example = (
            '    {"months": "Months 1-2", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 3-4", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 5-6", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 7-8", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 9-10", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 11-12", "phase_title": "<phase>", "milestones": ["...", "...", "..."]}'
        )
    elif dm == 9:
        journey_example = (
            '    {"months": "Months 1-2", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 3-4", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 5-6", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 7-9", "phase_title": "<phase>", "milestones": ["...", "...", "..."]}'
        )
    elif dm == 6:
        journey_example = (
            '    {"months": "Months 1-2", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 3-4", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Months 5-6", "phase_title": "<phase>", "milestones": ["...", "...", "..."]}'
        )
    else: # 3 months
        journey_example = (
            '    {"months": "Month 1", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Month 2", "phase_title": "<phase>", "milestones": ["...", "...", "..."]},\n'
            '    {"months": "Month 3", "phase_title": "<phase>", "milestones": ["...", "...", "..."]}'
        )

    return f"""You are a senior AI transformation consultant creating a {duration} roadmap for a GCC leader.

TASK:
Generate a practical roadmap to move from current GARIX stage to the target stage.

TARGET SCORE RULES:
{target_instruction}

ROADMAP DURATION: {duration}
All journey phases and actions must fit within {duration}. Do NOT exceed this timeframe.

---

CRITICAL RULE 1 — SCORE SENSITIVITY:
- If a dimension score ≥ 4.5: Focus only on optimization, scaling, or acceleration.
- If a dimension score < 4: Focus on building foundational capabilities.

---

CRITICAL RULE 2 — INTER-DIMENSION CONSISTENCY:
- Strategy drives all improvements
- Risk aligns with Strategy maturity
- Performance & Value depends on Strategy and Data
- Platform & Data must evolve together

---

IMPORTANT: Generate EXACTLY 3 key actions spread across the timeline (e.g., early-term, mid-term, long-term).
Each action may address MULTIPLE dimensions together. Do NOT create one action per dimension.

OUTPUT FORMAT:
{{
  "target_score": <number>,
  "target_stage_name": "<stage>",
  "roadmap_duration": "{duration}",
  "dimension_targets":[
    {{"dimension_name": "<name>", "current_score": <number>, "target_score": <number>}},
    ...one entry per dimension from input (9 total)...
  ],
  "actions":[
    {{
      "number": 1,
      "title": "<short title>",
      "description": "<2-3 sentence practical action>",
      "timeline": "Early-term action"
    }},
    {{
      "number": 2,
      "title": "<short title>",
      "description": "<2-3 sentence action>",
      "timeline": "Mid-term action"
    }},
    {{
      "number": 3,
      "title": "<short title>",
      "description": "<2-3 sentence action>",
      "timeline": "Long-term action"
    }}
  ],
  "journey":[
{journey_example}
  ],
  "projected_landing": "<summary>"
}}

Requirements:
- dimension_targets MUST include ALL dimensions from input
- The weighted average of all dimension target scores MUST fall within the overall target score range ({target_min:.1f}–{target_max:.1f})
- No contradictions. No isolated maturity jumps.

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
    duration_months: int  # <-- Added required parameter
    dimensions: list[DimensionScoreItem]
    company: str = ""
    uid: Optional[str] = None


def generate_roadmap_data(
    persona: str,
    role: str,
    composite_score: float,
    duration_months: int,
    dimensions: list,
    uid: str | None = None,
    company: str = "",
) -> dict | None:
    
    dim_items =[
        d if isinstance(d, DimensionScoreItem) else DimensionScoreItem(**d)
        for d in dimensions
    ]
    dims_summary = "\n".join(
        f"- {d.dimension_name} (ID {d.dimension_id}): Score {d.score}/5 (weight {d.weight}×)"
        for d in dim_items
    )

    cs = composite_score
    if cs < 2: current_stage = "Stage 1 — AI Aware"
    elif cs < 3: current_stage = "Stage 2 — AI Embedded"
    elif cs < 4: current_stage = "Stage 3 — AI Scaled"
    elif cs < 4.5: current_stage = "Stage 4 — AI Native"
    else: current_stage = "Stage 5 — AI Realized"

    sorted_dims = sorted(dim_items, key=lambda d: d.score)
    weakest = sorted_dims[:3]
    strongest = sorted_dims[-2:]

    # Call the new lookup function
    mapping = _get_target_mapping(composite_score, duration_months)
    system_prompt = _build_roadmap_prompt(mapping)

    user_prompt = f"""Company/GCC: {company or 'India GCC'}
Persona: {persona}
Role: {role}
Current Score: {composite_score}/5 ({current_stage})
Target Score Range: {mapping['target_min']:.1f} – {mapping['target_max']:.1f}
Roadmap Duration: {mapping['duration']}

Dimension Scores:
{dims_summary}

Weakest: {', '.join(f'{d.dimension_name} ({d.score})' for d in weakest)}
Strongest: {', '.join(f'{d.dimension_name} ({d.score})' for d in strongest)}

Generate roadmap."""

    response = get_client().chat.completions.create(
        model=get_deployment(),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=2500,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
    if content.endswith("```"):
        content = content[:-3]

    roadmap = json.loads(content)

    roadmap["roadmap_duration"] = mapping["duration"]
    
    # --- FIX: Prevent 5.0-5.0 duplication ---
    t_min = mapping["target_min"]
    t_max = mapping["target_max"]
    
    if t_min == t_max:
        roadmap["target_score_range"] = f"{t_min:.1f}"
    else:
        roadmap["target_score_range"] = f"{t_min:.1f}–{t_max:.1f}"

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
            duration_months=req.duration_months,
            dimensions=req.dimensions,
            uid=req.uid,
            company=req.company,
        )
        return {"status": "ok", "roadmap": roadmap}
        
    except ValueError as ve:
        # Handles logic errors like "duration must be 3, 6, 9, 12"
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))