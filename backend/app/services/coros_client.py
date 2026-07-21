"""Thin COROS Open API HTTP/OAuth client.

Pure transport layer over the COROS Open API — no DB, no ORM. Every network
call accepts an optional ``httpx.AsyncClient`` so tests can inject a mock
transport and no real network/credentials are ever required.

COROS's official API is a PARTNER program ("COROS Open API") — not self-serve.
Endpoints are exposed here as CONFIGURABLE module constants so the moment a
partner supplies client_id/secret (and, if COROS revises a path, an override)
the integration lights up without code changes.

OAuth2 authorization-code flow:
    authorize → user consents → COROS redirects to redirect_uri?code=...
    → exchange_code(code) → {access_token, refresh_token, expires_in, openId}
    → refresh_access_token(refresh_token) renews when the access token expires.

Docs (partner): https://open.coros.com — the OAuth + data shapes below are set
to the researched COROS Open API references (the coros-mcp field table, the
rCoros CRAN package field names, the Terra COROS integration, and the COROS
Help Center "COROS Fitness Metrics Explained"). The activity payload is
SUMMARY-ONLY: COROS exposes per-activity summaries and a per-activity detail
(laps, HR/power zones, cadence) but does NOT expose per-second time-series
streams (graphList/frequencyList — power/HR/pace over time). Stream-derived
cards therefore stay honestly empty for COROS rides (see coros_service).
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

# ── Endpoints (documented COROS Open API defaults; override-able) ────────────
# Base host for the OAuth + data API.
API_HOST = "https://open.coros.com"

# OAuth2 authorize + token endpoints (COROS Open API).
AUTHORIZE_URL = f"{API_HOST}/oauth2/authorize"
# COROS exchanges the code AND refreshes at the same access-token endpoint,
# switching on grant_type (authorization_code vs refresh_token).
TOKEN_URL = f"{API_HOST}/oauth2/accesstoken"

# Data endpoints (COROS Open API v2).
#   LIST   → activity summaries for a date window (openId + startDate/endDate,
#            formatted yyyyMMdd). One row per activity carrying: activity_id,
#            name, sport_type, sport_name, start_time, end_time,
#            duration_seconds, distance_meters, avg_hr, max_hr, calories,
#            training_load, avg_power, normalized_power, elevation_gain.
#   DETAIL → a single activity keyed by its id AND its sport_type; adds laps,
#            HR/power zones, cadence and other sport-specific metrics. NOTE:
#            neither endpoint returns per-second streams — COROS is summary-only.
ACTIVITY_LIST_PATH = "/v2/coros/sport/list"
ACTIVITY_DETAIL_PATH = "/v2/coros/sport/detail"

# COROS's OAuth scope for reading the athlete's activities.
DEFAULT_SCOPE = "sport"

_TIMEOUT = httpx.Timeout(30.0)


class CorosAuthError(Exception):
    """Raised when COROS OAuth/token operations fail (bad code, expired refresh)."""


class CorosAPIError(Exception):
    """Raised when a COROS API data call fails."""


def build_authorize_url(redirect_uri: str, state: str) -> str:
    """Build the COROS OAuth authorize URL the user is sent to in order to consent."""
    params = {
        "client_id": settings.COROS_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": DEFAULT_SCOPE,
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def _post_token(data: dict[str, str], client: httpx.AsyncClient | None) -> dict[str, Any]:
    owns = client is None
    client = client or httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        resp = await client.post(TOKEN_URL, data=data)
    except httpx.HTTPError as exc:  # network/transport failure
        raise CorosAuthError(f"COROS token request failed: {exc}") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code >= 400:
        raise CorosAuthError(
            f"COROS token endpoint returned {resp.status_code}: {resp.text}"
        )
    payload = resp.json()
    # COROS data endpoints wrap results as {"result": "0000", "message": "OK",
    # "data": {...}}. The token endpoint may return the token fields flat or
    # nested under "data"; normalise so callers always see the token fields.
    if isinstance(payload, dict) and "access_token" not in payload:
        inner = payload.get("data")
        if isinstance(inner, dict):
            return inner
    return payload


async def exchange_code(
    code: str,
    redirect_uri: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Exchange an authorization code for access + refresh tokens (+ openId)."""
    return await _post_token(
        {
            "client_id": settings.COROS_CLIENT_ID,
            "client_secret": settings.COROS_CLIENT_SECRET,
            "code": code,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        client,
    )


async def refresh_access_token(
    refresh_token: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Renew the access token using the refresh_token grant (same token endpoint)."""
    return await _post_token(
        {
            "client_id": settings.COROS_CLIENT_ID,
            "client_secret": settings.COROS_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        client,
    )


def _unwrap(payload: Any) -> Any:
    """Unwrap COROS's ``{"result","message","data"}`` envelope to the data body."""
    if isinstance(payload, dict) and "data" in payload and (
        "result" in payload or "message" in payload
    ):
        return payload.get("data")
    return payload


async def _get(
    path: str,
    access_token: str,
    params: dict[str, Any] | None = None,
    client: httpx.AsyncClient | None = None,
) -> Any:
    owns = client is None
    client = client or httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        # COROS Open API authenticates data calls with the access token. The
        # partner API has historically accepted it BOTH as an Authorization
        # bearer header and as a ``token`` query param; we send both so whichever
        # the endpoint honours works and the other is ignored. This is by design
        # (belt-and-suspenders), not a guess.
        merged = dict(params or {})
        merged.setdefault("token", access_token)
        resp = await client.get(
            f"{API_HOST}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
            params=merged,
        )
    except httpx.HTTPError as exc:
        raise CorosAPIError(f"COROS API request failed: {exc}") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code == 401:
        raise CorosAuthError("COROS API returned 401 — access token rejected")
    if resp.status_code >= 400:
        raise CorosAPIError(f"COROS API {path} returned {resp.status_code}: {resp.text}")
    return _unwrap(resp.json())


async def fetch_activities(
    access_token: str,
    open_id: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """List the athlete's COROS activities for a date range.

    The COROS Open API activity-list endpoint takes the user's ``openId`` and a
    ``startDate`` / ``endDate`` window formatted ``yyyyMMdd``. Returns the list
    of activity summary dicts (empty list when none / on an unexpected shape).
    Each summary already carries the fields the app's analysis cards read
    (power, HR, distance, duration, calories, training load, elevation).
    """
    params: dict[str, Any] = {}
    if open_id:
        params["openId"] = open_id
    if start_date:
        params["startDate"] = start_date
    if end_date:
        params["endDate"] = end_date
    data = await _get(ACTIVITY_LIST_PATH, access_token, params=params, client=client)
    if isinstance(data, dict):
        # Common COROS shapes: {"dataList": [...]} or {"sportList": [...]}.
        for key in ("dataList", "sportList", "list", "activities"):
            if isinstance(data.get(key), list):
                return data[key]
        return []
    if isinstance(data, list):
        return data
    return []


async def fetch_activity(
    access_token: str,
    activity_id: str,
    sport_type: Any = None,
    open_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch a single COROS activity's detail (laps, HR/power zones, cadence).

    The COROS detail endpoint keys on the activity id (``labelId``) AND the
    activity's ``sportType`` — both are required to resolve the record. Still
    summary-only: the detail adds laps and zone breakdowns but NOT per-second
    streams. The bulk sync populates every card-facing field from the list
    endpoint alone; this detail call is available to enrich a single activity's
    raw_data (zones/laps/cadence) on demand.
    """
    params: dict[str, Any] = {"labelId": activity_id}
    if sport_type is not None:
        params["sportType"] = sport_type
    if open_id:
        params["openId"] = open_id
    data = await _get(ACTIVITY_DETAIL_PATH, access_token, params=params, client=client)
    return data if isinstance(data, dict) else {}
