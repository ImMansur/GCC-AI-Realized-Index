import os
import json
from io import BytesIO
from fastapi import APIRouter, HTTPException, Depends, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from firebase_admin import auth as firebase_auth

from app.firebase import get_db


# Admin email allowed to access the dashboard
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@gmail.com")


def _get_blob_service():
    """Create a BlobServiceClient from SAS URL or account URL."""
    from azure.storage.blob import BlobServiceClient

    sas_url = os.getenv("AZURE_STORAGE_SAS_URL", "")
    if sas_url:
        return BlobServiceClient(account_url=sas_url)

    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "")
    if not account_url:
        raise RuntimeError("AZURE_STORAGE_SAS_URL or AZURE_STORAGE_ACCOUNT_URL not configured")
    from azure.identity import DefaultAzureCredential
    credential = DefaultAzureCredential()
    return BlobServiceClient(account_url=account_url, credential=credential)

router = APIRouter()


def verify_admin_token(authorization: Optional[str] = Header(None)):
    """Dependency to verify Firebase ID token and check admin email."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    id_token = authorization.split(" ", 1)[1]
    try:
        # Ensure Firebase app is initialized by calling get_db
        db = get_db()
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception as e:
        print(f"[ADMIN] Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    email = decoded.get("email", "")
    uid = decoded.get("uid", "")
    # Check role in Firestore
    try:
        doc = db.collection("users").document(uid).get()
        role = doc.to_dict().get("role", "") if doc.exists else ""
    except Exception:
        role = ""
    if role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized as admin")
    return decoded


@router.post("/admin/verify")
async def admin_verify(decoded=Depends(verify_admin_token)):
    """Verify the Firebase ID token belongs to the admin."""
    return {"status": "ok", "email": decoded.get("email")}


@router.post("/admin/logout")
async def admin_logout(decoded=Depends(verify_admin_token)):
    """Admin logout (client should discard the token)."""
    return {"status": "ok"}


@router.get("/admin/surveys")
async def get_all_surveys(token: str = Depends(verify_admin_token)):
    """Fetch all submitted surveys from Firestore."""
    try:
        db = get_db()
        docs = db.collection("surveys").order_by(
            "submitted_at", direction="DESCENDING"
        ).stream()

        surveys = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            surveys.append(data)

        return {"status": "ok", "surveys": surveys, "total": len(surveys)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/users")
async def get_all_users(token: str = Depends(verify_admin_token)):
    """Fetch all user profiles from Firestore."""
    try:
        db = get_db()
        docs = db.collection("users").stream()

        users = []
        for doc in docs:
            data = doc.to_dict()
            data["uid"] = doc.id
            users.append(data)

        return {"status": "ok", "users": users, "total": len(users)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/stats")
async def get_admin_stats(token: str = Depends(verify_admin_token)):
    """Get aggregate statistics for the admin dashboard."""
    try:
        db = get_db()

        # Count users
        users_docs = list(db.collection("users").stream())
        total_users = len(users_docs)

        # Count surveys and compute averages
        survey_docs = list(db.collection("surveys").stream())
        total_surveys = len(survey_docs)

        scores = []
        stage_counts = {"AI Aware": 0, "AI Embedded": 0, "AI Scaled": 0, "AI Native": 0, "AI Realized": 0}
        persona_counts: dict[str, int] = {}

        for doc in survey_docs:
            data = doc.to_dict()
            cs = data.get("scores", {}).get("composite_score", 0)
            scores.append(cs)

            # Stage distribution
            if cs < 2:
                stage_counts["AI Aware"] += 1
            elif cs < 3:
                stage_counts["AI Embedded"] += 1
            elif cs < 4:
                stage_counts["AI Scaled"] += 1
            elif cs < 4.5:
                stage_counts["AI Native"] += 1
            else:
                stage_counts["AI Realized"] += 1

            # Persona distribution
            persona = data.get("persona", "Unknown")
            persona_counts[persona] = persona_counts.get(persona, 0) + 1

        avg_score = round(sum(scores) / len(scores), 2) if scores else 0

        return {
            "status": "ok",
            "total_users": total_users,
            "total_surveys": total_surveys,
            "average_score": avg_score,
            "stage_distribution": stage_counts,
            "persona_distribution": persona_counts,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/roadmaps")
async def get_all_roadmaps(token: str = Depends(verify_admin_token)):
    """Fetch all generated roadmaps from Firestore."""
    try:
        db = get_db()
        docs = db.collection("roadmaps").order_by(
            "generated_at", direction="DESCENDING"
        ).stream()

        roadmaps = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            roadmaps.append(data)

        return {"status": "ok", "roadmaps": roadmaps, "total": len(roadmaps)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/reports")
async def get_all_reports(token: str = Depends(verify_admin_token)):
    """Fetch all diagnostic report metadata from Firestore."""
    try:
        db = get_db()
        docs = db.collection("diagnostic_reports").order_by(
            "requested_at", direction="DESCENDING"
        ).stream()

        reports = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            reports.append(data)

        return {"status": "ok", "reports": reports, "total": len(reports)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/reports/{report_id}/download")
async def download_report(report_id: str, token: str = Depends(verify_admin_token)):
    """Download a diagnostic PDF from Azure Blob Storage."""
    try:
        db = get_db()
        doc = db.collection("diagnostic_reports").document(report_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Report not found")

        data = doc.to_dict()
        blob_name = data.get("blob_name")
        if not blob_name:
            raise HTTPException(status_code=404, detail="PDF not available for this report")

        container_name = os.getenv("BLOB_CONTAINER_NAME", "gcc-ai")
        blob_service = _get_blob_service()
        container_client = blob_service.get_container_client(container_name)
        blob_client = container_client.get_blob_client(blob_name)

        download = blob_client.download_blob()
        pdf_bytes = download.readall()

        safe_name = data.get("user_name", "report").replace(" ", "_")
        return StreamingResponse(
            BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="GARIX_Report_{safe_name}.pdf"'
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
