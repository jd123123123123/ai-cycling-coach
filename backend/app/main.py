import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.scheduler import run_all_user_syncs, scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register Garmin sync job (every 4 hours)
    scheduler.add_job(
        run_all_user_syncs,
        "interval",
        hours=4,
        id="garmin_sync",
        misfire_grace_time=600,
    )
    scheduler.start()
    logger.info("APScheduler started with Garmin sync every 4 hours")
    yield
    scheduler.shutdown()
    logger.info("APScheduler shut down")


app = FastAPI(
    title="AI Cycling Coach",
    description="AI-powered multi-sport training platform",
    version="0.1.0",
    lifespan=lifespan,
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
from app.api.garmin import router as garmin_router  # noqa: E402
from app.api.daily_metrics import router as daily_metrics_router  # noqa: E402
from app.api.planned_workouts import router as planned_workouts_router  # noqa: E402
from app.api.coach import router as coach_router  # noqa: E402
from app.api.analytics import router as analytics_router  # noqa: E402
from app.api.dashboards import router as dashboards_router  # noqa: E402
from app.api.weeks import router as weeks_router  # noqa: E402
from app.api.crews import router as crews_router  # noqa: E402
from app.api.tab_layouts import router as tab_layouts_router  # noqa: E402

app.include_router(auth_router)
app.include_router(athletes_router)
app.include_router(goals_router)
app.include_router(consent_router)
app.include_router(users_router)
app.include_router(activities_router)
app.include_router(training_load_router)
app.include_router(ftp_router)
app.include_router(garmin_router)
app.include_router(daily_metrics_router)
app.include_router(planned_workouts_router)
app.include_router(coach_router)
app.include_router(analytics_router)
app.include_router(dashboards_router)
app.include_router(weeks_router)
app.include_router(crews_router)
app.include_router(tab_layouts_router)


@app.get("/", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}
