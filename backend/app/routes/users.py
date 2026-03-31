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
