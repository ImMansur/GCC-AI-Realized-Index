import os
import re
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


def get_client():
    from openai import AzureOpenAI
    return AzureOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version="2024-12-01-preview",
    )


def get_deployment() -> str:
    return os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o")


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9\s-]", "", text)
    text = re.sub(r"[\s]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text.strip("-")


def _get_blob_service():
    from azure.storage.blob import BlobServiceClient

    sas_url = os.getenv("AZURE_STORAGE_SAS_URL")
    if sas_url:
        return BlobServiceClient(account_url=sas_url)
    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL")
    from azure.identity import DefaultAzureCredential
    return BlobServiceClient(account_url=account_url, credential=DefaultAzureCredential())


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


@router.post("/questions", response_model=QuestionResponse)
async def get_questions(request: QuestionRequest):
    """Fetch pre-generated questions from Azure Blob Storage."""
    container_name = os.getenv("BLOB_CONTAINER_NAME", "gcc-ai")
    blob_name = f"questions/{_slugify(request.persona)}_{_slugify(request.role)}.json"

    try:
        blob_service = _get_blob_service()
        container_client = blob_service.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)

        blob_data = blob_client.download_blob().readall()
        data = json.loads(blob_data)

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
            for q in data["questions"]
        ]

        return QuestionResponse(
            persona=request.persona, role=request.role, questions=questions
        )

    except Exception as e:
        if "BlobNotFound" in str(e):
            raise HTTPException(
                status_code=404,
                detail=f"No pre-generated questions found for persona '{request.persona}' and role '{request.role}'"
            )
        raise HTTPException(status_code=500, detail=str(e))