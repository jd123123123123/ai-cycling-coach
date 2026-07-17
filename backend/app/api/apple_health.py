"""Apple Health integration.

Apple Health (HealthKit) data only lives on-device, so a web app can't read it
directly — the practical path is the free iOS app **Auto Health Export**, which
pushes workouts + metrics as JSON to a webhook on a schedule. This module is
that webhook: it maps the payload into the same `activities` + `daily_metrics`
the Garmin sync writes, so Apple-Health athletes get the full app on real data.

Endpoints:
  GET  /apple-health/setup  → the webhook URL + a long-lived token to paste into
                              the Auto Health Export app (REST API destination).
  POST /apple-health/sync   → ingest a payload (auth via that token).
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.activity import ActivityCreate
from app.services import activity_service
from app.services.athlete_service import get_or_create_profile
from app.services.daily_metric_service import upsert_daily_metric

router = APIRouter(prefix="/apple-health", tags=["apple-health"])


# ── helpers ──────────────────────────────────────────────────────────────────
def _sport_from_name(name: str) -> str | None:
    n = (name or "").lower()
    if any(k in n for k in ("run", "jog", "treadmill", "walk", "hik")):
        return "running"
    if any(k in n for k in ("cycl", "bike", "ride", "spin")):
        return "cycling"
    if any(k in n for k in ("strength", "functional", "core", "hiit", "traditional", "gym", "weight")):
        return "gym"
    return None


def _num(v: Any) -> float | None:
    """Auto Health Export nests values as {'qty': N, 'units': ...} or a bare number."""
    if v is None:
        return None
    if isinstance(v, dict):
        v = v.get("qty")
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _parse_dt(s: Any) -> datetime | None:
    if not s:
        return None
    txt = str(s).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(txt.replace("Z", "+0000") if fmt.endswith("%z") and txt.endswith("Z") else txt, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(txt.replace("Z", "+00:00"))
    except ValueError:
        return None


# metric name (Auto Health Export) → DailyMetric field + a reducer over the day's points
_METRIC_MAP = {
    "resting_heart_rate": "resting_hr",
    "heart_rate_variability": "hrv_status",
    "step_count": "steps",
    "respiratory_rate": "respiration",  # surfaced via raw_data
    "blood_oxygen_saturation": "spo2",  # surfaced via raw_data
    "sleep_analysis": "sleep_hours",    # surfaced via raw_data
}


@router.get("/setup")
async def setup(
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> dict:
    """Return the webhook URL + a long-lived token to configure in the Auto Health
    Export app (Settings → Automations → REST API, POST, header
    `Authorization: Bearer <token>`)."""
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": str(current_user.id), "iat": now, "exp": now.replace(year=now.year + 1), "scope": "apple_health"},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    # Force https — behind Railway's TLS-terminating proxy base_url reports http.
    base = str(request.base_url).rstrip("/").replace("http://", "https://", 1)
    return {
        "webhook_url": f"{base}/apple-health/sync",
        "token": token,
        "how_to": (
            "Install 'Auto Health Export' on iPhone → Settings → Automations → add a "
            "REST API destination: POST to the webhook_url, add header "
            "'Authorization: Bearer <token>', enable Workouts + the metrics you want, "
            "and set a sync schedule."
        ),
    }


@router.post("/sync")
async def sync(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    payload: dict = Body(...),
) -> dict:
    """Ingest an Auto Health Export payload → activities + daily metrics."""
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    profile = await get_or_create_profile(db, current_user.id)

    # ── workouts → activities ────────────────────────────────────────────────
    imported = 0
    for w in (data.get("workouts") or []):
        start = _parse_dt(w.get("start"))
        sport = _sport_from_name(w.get("name", ""))
        dur = _num(w.get("duration"))
        if start is None or sport is None or not dur:
            continue
        dist = _num(w.get("distance"))
        if dist is not None and dist < 100:  # km reported → metres
            dist *= 1000
        avg_hr = _num(w.get("avgHeartRate") or w.get("averageHeartRate"))
        max_hr = _num(w.get("maxHeartRate"))
        kcal = _num(w.get("activeEnergyBurned") or w.get("activeEnergy"))
        try:
            act = ActivityCreate(
                sport=sport,  # type: ignore[arg-type]
                started_at=start,
                duration_seconds=int(dur),
                distance_meters=dist,
                average_hr=int(avg_hr) if avg_hr else None,
                max_hr=int(max_hr) if max_hr else None,
                calories=int(kcal) if kcal else None,
                title=w.get("name") or "Apple Health workout",
                source="apple_health",
                external_id=f"applehealth-{sport}-{start.isoformat()}",
            )
            await activity_service.create_activity(db=db, user_id=current_user.id, data=act, profile=profile)
            imported += 1
        except Exception:  # noqa: BLE001 — one bad workout must not fail the batch
            continue

    # ── metrics → daily_metrics (grouped by calendar day) ────────────────────
    by_day: dict[date, dict[str, Any]] = {}
    raw_by_day: dict[date, dict[str, Any]] = {}
    for m in (data.get("metrics") or []):
        field = _METRIC_MAP.get(m.get("name", ""))
        if field is None:
            continue
        for pt in (m.get("data") or []):
            dt = _parse_dt(pt.get("date"))
            qty = _num(pt.get("qty") if "qty" in pt else pt.get("Avg") or pt.get("value"))
            if dt is None or qty is None:
                continue
            d = dt.date()
            raw_by_day.setdefault(d, {})[m["name"]] = qty
            if field in ("resting_hr", "hrv_status", "steps"):
                by_day.setdefault(d, {})[field] = int(round(qty))

    days = 0
    for d, fields in {**{k: {} for k in raw_by_day}, **by_day}.items():
        record = dict(fields)
        record["raw_data"] = {"apple_health": raw_by_day.get(d, {})}
        try:
            await upsert_daily_metric(db, current_user.id, d, record)
            days += 1
        except Exception:  # noqa: BLE001
            continue

    await db.commit()
    return {"workouts_imported": imported, "days_updated": days, "source": "apple_health"}
