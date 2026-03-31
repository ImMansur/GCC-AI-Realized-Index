import os
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.questions import router as questions_router
from app.routes.users import router as users_router
from app.routes.surveys import router as surveys_router
from app.routes.roadmap import router as roadmap_router
from app.routes.admin import router as admin_router
from app.routes.diagnostic import router as diagnostic_router

app = FastAPI(title="GARIX AI Survey API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(questions_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(surveys_router, prefix="/api")
app.include_router(roadmap_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(diagnostic_router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
