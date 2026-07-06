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
_TIMEOUT = 15.0


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
