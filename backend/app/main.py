from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

app = FastAPI(
    title="AI Cycling Coach",
    description="AI-powered multi-sport training platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.auth import router as auth_router  # noqa: E402
from app.api.athletes import router as athletes_router  # noqa: E402
from app.api.goals import router as goals_router  # noqa: E402
from app.api.consent import router as consent_router  # noqa: E402
from app.api.users import router as users_router  # noqa: E402
from app.api.activities import router as activities_router  # noqa: E402
from app.api.training_load import router as training_load_router  # noqa: E402
from app.api.ftp import router as ftp_router  # noqa: E402

app.include_router(auth_router)
app.include_router(athletes_router)
app.include_router(goals_router)
app.include_router(consent_router)
app.include_router(users_router)
app.include_router(activities_router)
app.include_router(training_load_router)
app.include_router(ftp_router)


@app.get("/", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}
