import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.services import cutout
from app.scheduler import (
    run_all_user_syncs,
    run_brief_refresh_sweep,
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
#
# ─── THE BASEMAP HOSTS, AND WHY THEY ARE NAMED ONE BY ONE ───────────────────
# `connect-src 'self'` silently broke every map in the product. The route line
# still drew — it comes from our own API — so the page LOOKED like a map that
# had lost its tiles rather than a policy refusing to fetch them, and the only
# evidence was a console line nobody sees on a phone. The map is not decoration
# on the ride screen; it is the screen.
#
# Named hosts rather than a wildcard, because each one does a specific job and
# a wildcard would let a future dependency reach anywhere:
#   styles.maptoolkit.org  the style document itself
#   tiles.maptoolkit.org   its TileJSON + the vector tiles (.mvt)
#   fonts.maptoolkit.org   glyph ranges (.pbf) — labels are blank without them
#   icons.maptoolkit.org   the sprite sheet (JSON via fetch, PNG via img-src)
#   tiles.mapterhorn.com   terrain-RGB, which MapLibre must FETCH rather than
#                          load as an image, because it reads the pixels back
#                          to build a DEM (see RouteMap on the encoding).
# `blob:` on worker-src and img-src is MapLibre's own machinery: it builds its
# tile worker and some textures from blobs it created itself.
_MAP_HOSTS = (
    "https://styles.maptoolkit.org "
    "https://tiles.maptoolkit.org "
    "https://fonts.maptoolkit.org "
    "https://icons.maptoolkit.org "
    "https://tiles.mapterhorn.com"
)
_CSP = "; ".join(
    [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        f"img-src 'self' data: blob: {_MAP_HOSTS}",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        f"connect-src 'self' {_MAP_HOSTS}",
        "manifest-src 'self'",
        "worker-src 'self' blob:",
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
    # Register Garmin sync job — EVERY MINUTE (owner directive, Aug 2026: the
    # 15-minute cadence was not delivering data soon enough after a ride).
    # Incremental syncs are cheap (last_sync_at − 2h window); the client's
    # per-request delays and rate-limit handling protect the unofficial API.
    #
    # `max_instances=1` + `coalesce=True` are what make a one-minute interval
    # safe rather than reckless: a sync that takes longer than sixty seconds
    # does not start a second copy of itself, and the runs it missed while busy
    # collapse into ONE catch-up rather than a queue that never drains. Without
    # those two, this interval would be a way to hammer the upstream API with
    # overlapping jobs.
    #
    # `misfire_grace_time` drops to 45 s with the interval: a run that is more
    # than one interval late has been superseded by the next one, and firing it
    # anyway is a duplicate rather than a catch-up.
    scheduler.add_job(
        run_all_user_syncs,
        "interval",
        minutes=1,
        id="garmin_sync",
        misfire_grace_time=45,
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
    # Coach-brief refresh sweep (4-trigger policy): hourly, regenerates each
    # athlete's brief in their local morning / evening / after a missed session.
    # Deduped per local day; the completed-workout trigger is handled by the
    # Garmin sync busting the cache only when a new activity lands.
    scheduler.add_job(
        run_brief_refresh_sweep,
        "interval",
        hours=1,
        id="brief_refresh",
        misfire_grace_time=600,
        coalesce=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("APScheduler started with Garmin sync every minute")
    # Build the background-removal session before a rider needs it. Cold it
    # costs ~3.3s (import + ONNX session) on top of the 1.0s cut, and that bill
    # lands on whichever request happens to be first. In a thread, because it is
    # CPU-bound and blocking the event loop here would delay the boot it is
    # meant to protect. Never fatal: see `cutout.warm`.
    threading.Thread(target=cutout.warm, name="cutout-warm", daemon=True).start()
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
from app.api.activities import router as activities_router
from app.api.ride_details import router as ride_details_router  # noqa: E402
from app.api.training_load import router as training_load_router  # noqa: E402
from app.api.ftp import router as ftp_router  # noqa: E402
from app.api.garmin import router as garmin_router  # noqa: E402
from app.api.daily_metrics import router as daily_metrics_router  # noqa: E402
from app.api.planned_workouts import router as planned_workouts_router  # noqa: E402
from app.api.coach import router as coach_router  # noqa: E402
from app.api.garage import router as garage_router  # noqa: E402
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
# AFTER activities: both mount /activities, and this one's paths are all
# concrete under an id, so ordering only matters for readability here.
app.include_router(ride_details_router)
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
from app.api.workshop import router as workshop_router  # noqa: E402
from app.api.plan import router as plan_router  # noqa: E402
from app.api.custom_workouts import router as custom_workouts_router  # noqa: E402
from app.api.health import router as health_router  # noqa: E402
from app.api.crew_events import router as crew_events_router  # noqa: E402
from app.api.crew_chat import router as crew_chat_router  # noqa: E402
from app.api.crew_reactions import router as crew_reactions_router  # noqa: E402
from app.api.rehearsals import router as rehearsals_router  # noqa: E402
from app.api.rewards import router as rewards_router  # noqa: E402
from app.api.challenges import router as challenges_router  # noqa: E402
from app.api.referral import router as referral_router  # noqa: E402
from app.api.shop import router as shop_router  # noqa: E402

app.include_router(push_router)
app.include_router(climbs_router)
app.include_router(achievements_router)
app.include_router(routes_router)
app.include_router(plan_import_router)
app.include_router(weather_router)
app.include_router(workshop_router)
app.include_router(plan_router)
app.include_router(custom_workouts_router)
app.include_router(health_router)
app.include_router(crew_events_router)
app.include_router(crew_chat_router)
app.include_router(crew_reactions_router)
app.include_router(rehearsals_router)
app.include_router(rewards_router)
app.include_router(challenges_router)
app.include_router(referral_router)
app.include_router(garage_router)
app.include_router(shop_router)


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

import os as _os  # noqa: E402

# FRONTEND_DIST lets the container point at the built SPA explicitly (Railway);
# locally it falls back to ../../frontend/dist.
_DIST = _Path(
    _os.environ.get("FRONTEND_DIST")
    or (_Path(__file__).resolve().parent.parent.parent / "frontend" / "dist")
)
if (_DIST / "index.html").is_file():
    # ── NO StaticFiles MOUNT ON /assets, AND THAT IS THE POINT ────────────
    # There was one, and Starlette matches mounts BEFORE the catch-all route,
    # so it shadowed `spa()` — including the `assets/` branch six lines below
    # that sets the immutable header. `StaticFiles` sends no Cache-Control at
    # all, so every content-hashed chunk fell back to heuristic freshness and
    # the browser revalidated all ~30 of them on every single load. The right
    # answer was written and unreachable; `spa()` serves these files now, with
    # the same path-traversal guard and the header this comment always claimed.
    # `tests/test_spa_asset_caching.py` pins it.

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
