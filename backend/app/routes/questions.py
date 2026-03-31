import os
import json
from functools import lru_cache
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import AzureOpenAI

from app.dimensions import DIMENSIONS

router = APIRouter()


@lru_cache()
def get_client() -> AzureOpenAI:
    return AzureOpenAI(
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-08-01-preview"),
    )


def get_deployment() -> str:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")


class QuestionRequest(BaseModel):
    persona: str
    role: str


class OptionItem(BaseModel):
    label: str
    description: str


class DimensionQuestion(BaseModel):
    dimension_id: int
    dimension_name: str
    question: str
    options: list[OptionItem]


class QuestionResponse(BaseModel):
    persona: str
    role: str
    questions: list[DimensionQuestion]


SYSTEM_PROMPT = """You are a senior AI maturity assessment consultant designing a professional benchmarking survey for Global Capability Centers (GCCs), similar in style to the EY GCC AI Realized Index.

Given a specific persona and role, generate exactly ONE tailored survey question for each of the 9 GARIX dimensions listed below.

Requirements for each question:
- Professional, consulting-grade language suitable for C-suite and senior leadership
- Specific and relevant to the given persona's responsibilities and perspective
- Designed to benchmark the organization's AI maturity against industry peers
- Phrased as a single, clear assessment question (not multiple sub-questions)
- Focused on measurable outcomes, not opinions
- Vary the question style across dimensions: use a mix of "How well-defined is...", "Does your GCC have...", "Which best describes...", "Where does your organisation stand on...", etc.

Each question MUST have exactly 5 answer options, ordered from lowest maturity (1) to highest maturity (5).
Each option has two parts:
- "label": A short, punchy 2-4 word title (e.g., "Ad hoc experiments", "Strategy drafted", "No risk framework", "Automated monitoring")
- "description": A concise 1-sentence elaboration (e.g., "No strategy. Individual curiosity only. No executive mandate or budget.")

The labels and descriptions must be unique and specific to each question's context. Do NOT use generic labels like "Initial", "Developing", "Defined", "Managed", "Leading".

Return a JSON array with exactly 9 objects, each having:
- "dimension_id": the dimension number (1-9)
- "dimension_name": the dimension name exactly as given
- "question": the tailored question
- "options": array of exactly 5 objects, each with "label" (string) and "description" (string)

Return ONLY the JSON array, no other text."""


@router.post("/questions", response_model=QuestionResponse)
async def generate_questions(request: QuestionRequest):
    dimensions_text = "\n".join(
        f"{d['id']}. {d['name']}: {d['key_components']}" for d in DIMENSIONS
    )

    user_prompt = f"""Persona: {request.persona}
Role: {request.role}

GARIX Dimensions:
{dimensions_text}

Generate one professionally-worded benchmarking question per dimension, tailored for a {request.role} within the {request.persona} function of a GCC."""

    try:
        response = get_client().chat.completions.create(
            model=get_deployment(),
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
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

        questions_data = json.loads(content)

        questions = [
            DimensionQuestion(
                dimension_id=q["dimension_id"],
                dimension_name=q["dimension_name"],
                question=q["question"],
                options=[
                    OptionItem(label=o["label"], description=o["description"])
                    for o in q["options"]
                ],
            )
            for q in questions_data
        ]

        return QuestionResponse(
            persona=request.persona, role=request.role, questions=questions
        )

    except json.JSONDecodeError:
        raise HTTPException(
            status_code=502, detail="Failed to parse AI response"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))