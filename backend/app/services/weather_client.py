"""Fetch historical hourly weather for a ride from Open-Meteo (free, no key).

Defensive by contract: any failure (network, non-200, malformed body) returns
None so weather is simply absent — the debrief's environment cards then hide.
"""
from __future__ import annotations

import logging
from datetime import datetime

import httpx

logger = logging.getLogger(__name__)

_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
_TIMEOUT = 15.0

# In-process forecast cache: one Open-Meteo call per (location, local day) per
# hour, app-wide — the audit's weather rule (cache per location+hour; on
# failure the UI chip simply doesn't render). Key: (lat2dp, lng2dp, tz_name).
_FORECAST_TTL_S = 3600.0
_forecast_cache: dict[tuple[float, float, str], tuple[float, dict | None]] = {}


async def fetch_today_forecast(
    lat: float,
    lng: float,
    tz_name: str,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict | None:
    """Hourly forecast for the athlete-local current day, or None.

    Returns the raw Open-Meteo body ({"hourly": {"time": [...], ...}}) with
    times already in the requested timezone. Cached in-process for an hour;
    failures are cached too (as None) so a rate-limited upstream is not
    hammered once per pageview.
    """
    import time as _time

    key = (round(lat, 2), round(lng, 2), tz_name)
    hit = _forecast_cache.get(key)
    now = _time.monotonic()
    if hit is not None and hit[0] > now:
        return hit[1]

    params = {
        "latitude": round(lat, 3),
        "longitude": round(lng, 3),
        "hourly": "temperature_2m,precipitation_probability,wind_speed_10m,weather_code",
        "wind_speed_unit": "kmh",
        "timezone": tz_name,
        "forecast_days": 1,
    }
    body: dict | None = None
    owns_client = client is None
    try:
        client = client or httpx.AsyncClient(timeout=_TIMEOUT)
        try:
            resp = await client.get(_FORECAST_URL, params=params)
            resp.raise_for_status()
            raw = resp.json()
            if isinstance(raw, dict) and "hourly" in raw:
                body = raw
        finally:
            if owns_client:
                await client.aclose()
    except Exception as exc:  # network, HTTP, JSON — all non-fatal
        logger.info("forecast fetch failed (non-fatal): %s", exc)
        body = None
    _forecast_cache[key] = (now + _FORECAST_TTL_S, body)
    return body


async def fetch_ride_weather(
    lat: float,
    lng: float,
    start: datetime,
    end: datetime,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict | None:
    """Return Open-Meteo hourly wind/temperature for the ride window, or None."""
    params = {
        "latitude": round(lat, 3),
        "longitude": round(lng, 3),
        "start_date": start.date().isoformat(),
        "end_date": end.date().isoformat(),
        "hourly": "wind_speed_10m,wind_direction_10m,temperature_2m",
        "wind_speed_unit": "ms",
        "timezone": "UTC",
    }
    owns_client = client is None
    try:
        client = client or httpx.AsyncClient(timeout=_TIMEOUT)
        try:
            resp = await client.get(_ARCHIVE_URL, params=params)
            resp.raise_for_status()
            body = resp.json()
        finally:
            if owns_client:
                await client.aclose()
    except Exception as exc:  # network, HTTP, JSON — all non-fatal
        logger.info("weather fetch failed (non-fatal): %s", exc)
        return None
    if not isinstance(body, dict) or "hourly" not in body:
        return None
    return body
