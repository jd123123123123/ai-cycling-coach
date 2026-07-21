import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.scheduler import (
    run_all_user_syncs,
    run_hourly_plan_adaptation,
    run_morning_push_briefs,
    scheduler,
)

logger = logging.getLogger(__name__)

# ─── Content-Security-Policy ────────────────────────────────────────────────
# Crafted for the built SPA (frontend/dist/index.html): a single ES-module
# bundle + stylesheet from same-origin /assets, inline styles injected by the
# React runtime, data: images/favicon, the same-origin API (connect-src), and
# the Google Fonts stylesheet (fonts.googleapis.com) + font files
# (fonts.gstatic.com) the page links. No inline/eval scripts are used, so
# script-src stays a strict 'self' with no 'unsafe-inline'/'unsafe-eval'.
_CSP = "; ".join(
    [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "img-src 'self' data:",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
    ]
)

# Static security headers applied to every response.
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Content-Security-Policy": _CSP,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Register Garmin sync job — every 15 minutes (user directive, July 2026:
    # near-live data). Incremental syncs are cheap (last_sync_at − 2h window);
    # the client's per-request delays + rate-limit handling protect the
    # unofficial API, and coalesce/max_instances stop overlapping runs from
    # piling up when a sync takes longer than the interval.
    scheduler.add_job(
        run_all_user_syncs,
        "interval",
        minutes=15,
        id="garmin_sync",
        misfire_grace_time=300,
        coalesce=True,
        max_instances=1,
    )
    # Morning-brief push (P1.5): hourly sweep; each athlete gets at most one
    # push per day, inside their local morning hour. No-ops without VAPID keys.
    scheduler.add_job(
        run_morning_push_briefs,
        "interval",
        hours=1,
        id="morning_push",
        misfire_grace_time=600,
    )
    # Hourly plan-adaptation loop (plan-engine v2): fresh signals reshape the
    # upcoming week within rails; every change lands in the adaptation feed.
    # Cheap when signals are unchanged (snapshot fingerprint short-circuit).
    scheduler.add_job(
        run_hourly_plan_adaptation,
        "interval",
        hours=1,
        id="plan_adaptation",
        misfire_grace_time=600,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("APScheduler started with Garmin sync every 15 minutes")
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


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Attach security headers to every response.

    Sets a strict CSP tuned for the served SPA, plus nosniff / anti-clickjacking
    / referrer / permissions headers. HSTS is only emitted for HTTPS requests
    (behind Railway's TLS-terminating proxy the scheme arrives via
    X-Forwarded-Proto). We only *add* headers here — we never touch the
    SPA handler's Cache-Control (index.html no-cache / hashed-asset immutable),
    so caching behaviour is unchanged.
    """
    response = await call_next(request)
    for key, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(key, value)

    forwarded_proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip()
    is_https = request.url.scheme == "https" or forwarded_proto == "https"
    if is_https:
        response.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=63072000; includeSubDomains",
        )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Generic 500 handler — never leak stack traces / internals to clients.

    FastAPI's HTTPException and request-validation errors are handled by their
    own handlers before reaching here; this only catches truly unexpected
    exceptions. The detail is logged server-side (with traceback) and the
    client receives an opaque message.
    """
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
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
from app.api.wahoo import router as wahoo_router  # noqa: E402
from app.api.coros import router as coros_router  # noqa: E402
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
app.include_router(wahoo_router)
app.include_router(coros_router)
app.include_router(tab_layouts_router)
app.include_router(workouts_router)
app.include_router(strength_router)

from app.api.push import router as push_router  # noqa: E402
from app.api.climbs import router as climbs_router  # noqa: E402
from app.api.achievements import router as achievements_router  # noqa: E402
from app.api.routes import router as routes_router  # noqa: E402
from app.api.plan_import import router as plan_import_router  # noqa: E402
from app.api.weather import router as weather_router  # noqa: E402
from app.api.plan import router as plan_router  # noqa: E402
from app.api.custom_workouts import router as custom_workouts_router  # noqa: E402
from app.api.health import router as health_router  # noqa: E402

app.include_router(push_router)
app.include_router(climbs_router)
app.include_router(achievements_router)
app.include_router(routes_router)
app.include_router(plan_import_router)
app.include_router(weather_router)
app.include_router(plan_router)
app.include_router(custom_workouts_router)
app.include_router(health_router)


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
