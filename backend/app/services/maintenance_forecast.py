"""The weather-ahead maintenance nudge — "wax tonight, rain tomorrow".

No competitor can build this sentence: it needs tomorrow's plan, tomorrow's
forecast at the rider's own location, and the drivetrain's live wear state in
one place. This app has all three (docs/bike-as-first-class-object-2026.md,
ranked P0 there).

The rule, and why each leg exists:
- a PLANNED ride tomorrow — maintenance-before-load is the whole point; with
  no ride coming there is nothing to protect;
- rain likely tomorrow (max hourly precipitation probability >= 60 %) — wet
  riding wears the chain x2.2 (`bike_wear._WEAR`), so tonight is when a clean
  drivetrain pays double;
- the drivetrain is NOT already fresh — telling a rider to clean a chain they
  cleaned yesterday is noise, and noise is how nudges die.

Failure of any leg (no location, forecast API down, no plan) degrades to None
— the workshop simply shows no nudge, never a guess.

The forecast call is cached for three hours per (rounded location, day):
the workshop endpoint is read on every garage open, and tomorrow's rain does
not change by the minute.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.planned_workout import PlannedWorkout
from app.services import rider_location, weather_client

logger = logging.getLogger(__name__)

RAIN_THRESHOLD_PCT = 60
#: Only worth saying when there is actually road on the chain.
MIN_CHAIN_PROGRESS = 0.25

_CACHE_TTL_S = 3 * 3600
_cache: dict[tuple[float, float, str], tuple[float, int | None]] = {}


async def _tomorrow_max_rain(lat: float, lng: float, tomorrow: date) -> int | None:
    """Max hourly precipitation probability for tomorrow, cached, or None."""
    key = (round(lat, 2), round(lng, 2), tomorrow.isoformat())
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < _CACHE_TTL_S:
        return hit[1]
    start = datetime(tomorrow.year, tomorrow.month, tomorrow.day)
    body = await weather_client.fetch_window_forecast(lat, lng, start, start)
    prob: int | None = None
    if body:
        probs = (body.get("hourly") or {}).get("precipitation_probability") or []
        vals = [int(p) for p in probs if p is not None]
        prob = max(vals) if vals else None
    _cache[key] = (time.monotonic(), prob)
    return prob


async def weather_ahead(
    db: AsyncSession,
    user_id: int,
    *,
    chain_progress: float,
    drivetrain_fresh: bool,
    tz_name: str | None = None,
) -> str | None:
    """One German sentence, or None. See the module docstring for the rule."""
    if drivetrain_fresh or chain_progress < MIN_CHAIN_PROGRESS:
        return None

    tomorrow = date.today() + timedelta(days=1)
    planned = (
        await db.execute(
            select(PlannedWorkout.id)
            .where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date == tomorrow,
                PlannedWorkout.sport == "cycling",
            )
            .limit(1)
        )
    ).first()
    if planned is None:
        return None

    loc = await rider_location.last_ride_location(db, user_id, tz_name)
    if loc is None:
        return None

    try:
        prob = await _tomorrow_max_rain(loc[0], loc[1], tomorrow)
    except Exception as exc:  # the nudge must never break the workshop read
        logger.info("weather-ahead forecast failed (non-fatal): %s", exc)
        return None
    if prob is None or prob < RAIN_THRESHOLD_PCT:
        return None

    return (
        f"Morgen steht eine Einheit im Plan — und bis zu {prob} % Regen. "
        "Kette heute Abend machen zahlt doppelt: Nässe verschleißt mehr als das Doppelte, "
        "und ein frischer Antrieb bringt +12 % RideCoin auf die Fahrt."
    )
