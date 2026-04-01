from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.firebase import get_db

router = APIRouter()


class UserProfile(BaseModel):
    uid: str
    name: str
    email: str
    company: Optional[str] = None
    gcc_location: Optional[str] = None
    gcc_size: Optional[str] = None
    parent_industry: Optional[str] = None


@router.post("/users/profile")
async def save_user_profile(profile: UserProfile):
    """Save or update user profile data in Firestore."""
    try:
        db = get_db()
        doc_ref = db.collection("users").document(profile.uid)
        doc_ref.set(
            {
                "name": profile.name,
                "email": profile.email,
                "company": profile.company,
                "gcc_location": profile.gcc_location,
                "gcc_size": profile.gcc_size,
                "parent_industry": profile.parent_industry,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            merge=True,
        )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{uid}/surveys")
async def get_user_surveys(uid: str):
    """Get all surveys submitted by a user, ordered by most recent first."""
    try:
        db = get_db()
        surveys_ref = (
            db.collection("users")
            .document(uid)
            .collection("surveys")
            .order_by("submitted_at", direction="DESCENDING")
        )
        docs = surveys_ref.stream()
        surveys = []
        for doc in docs:
            data = doc.to_dict()
            data["survey_id"] = doc.id
            surveys.append(data)
        return {"surveys": surveys}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{uid}/surveys/latest")
async def get_latest_survey(uid: str):
    """Get the most recent survey for a user."""
    try:
        db = get_db()
        surveys_ref = (
            db.collection("users")
            .document(uid)
            .collection("surveys")
            .order_by("submitted_at", direction="DESCENDING")
            .limit(1)
        )
        docs = list(surveys_ref.stream())
        if not docs:
            return {"survey": None}
        data = docs[0].to_dict()
        data["survey_id"] = docs[0].id
        return {"survey": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
