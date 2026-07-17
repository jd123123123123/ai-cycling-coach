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
from app.api.apple_health import router as apple_health_router  # noqa: E402
from app.api.tab_layouts import router as tab_layouts_router  # noqa: E402
from app.api.workouts import router as workouts_router  # noqa: E402
from app.api.strength import router as strength_router  # noqa: E402

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
app.include_router(apple_health_router)
app.include_router(tab_layouts_router)
app.include_router(workouts_router)
app.include_router(strength_router)


@app.get("/healthz", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok"}


# ─── Serve the built SPA (same-origin hosting for the PWA) ───────────────────
# When the frontend has been built (frontend/dist), serve it from this backend
# so the whole app lives behind ONE origin. Same-origin means the httpOnly
# refresh cookie + auth "just work" on iPhone Safari (no CORS, no cross-site
# cookie blocking). API routers above are matched first; everything else falls
# back to index.html (client-side routing).
from pathlib import Path as _Path  # noqa: E402

from fastapi.responses import FileResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

import os as _os  # noqa: E402

# FRONTEND_DIST lets the container point at the built SPA explicitly (Railway);
# locally it falls back to ../../frontend/dist.
_DIST = _Path(
    _os.environ.get("FRONTEND_DIST")
    or (_Path(__file__).resolve().parent.parent.parent / "frontend" / "dist")
)
if (_DIST / "index.html").is_file():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    # index.html MUST NOT be cached by browsers — it references content-hashed
    # asset filenames that change every deploy. If the browser caches index.html
    # it keeps loading a stale (possibly deleted) bundle and users see an old app.
    # Hashed assets under /assets are immutable and safe to cache forever.
    _INDEX_HEADERS = {"Cache-Control": "no-cache, must-revalidate"}

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        candidate = _DIST / full_path
        if full_path and candidate.is_file() and candidate.resolve().is_relative_to(_DIST):
            # Hashed JS/CSS: long-lived cache. Other root files (index.html, icons,
            # manifest) revalidate so a redeploy is picked up immediately.
            if full_path.startswith("assets/"):
                return FileResponse(str(candidate), headers={"Cache-Control": "public, max-age=31536000, immutable"})
            return FileResponse(str(candidate), headers=_INDEX_HEADERS)
        return FileResponse(str(_DIST / "index.html"), headers=_INDEX_HEADERS)
