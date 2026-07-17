"""Thin Wahoo Cloud API HTTP/OAuth client.

Pure transport layer over the Wahoo Cloud API — no DB, no ORM. Every network
call accepts an optional ``httpx.AsyncClient`` so tests can inject a mock
transport and no real network/credentials are ever required.

OAuth2 authorization-code flow:
    authorize → user consents → Wahoo redirects to redirect_uri?code=...
    → exchange_code(code) → {access_token, refresh_token, expires_in}
    → refresh_access_token(refresh_token) renews when the access token expires.

Docs: https://cloudapi.wahooligan.com/
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

AUTHORIZE_URL = "https://api.wahooligan.com/oauth/authorize"
TOKEN_URL = "https://api.wahooligan.com/oauth/token"
API_BASE = "https://api.wahooligan.com/v1"

# Scopes we need: read the athlete + their workouts.
DEFAULT_SCOPE = "user_read workouts_read"

_TIMEOUT = httpx.Timeout(30.0)


class WahooAuthError(Exception):
    """Raised when Wahoo OAuth/token operations fail (bad code, expired refresh)."""


class WahooAPIError(Exception):
    """Raised when a Wahoo API data call fails."""


def build_authorize_url(redirect_uri: str, state: str) -> str:
    """Build the Wahoo OAuth authorize URL the user is sent to in order to consent."""
    params = {
        "client_id": settings.WAHOO_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "scope": DEFAULT_SCOPE,
        "response_type": "code",
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


async def _post_token(data: dict[str, str], client: httpx.AsyncClient | None) -> dict[str, Any]:
    owns = client is None
    client = client or httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        resp = await client.post(TOKEN_URL, data=data)
    except httpx.HTTPError as exc:  # network/transport failure
        raise WahooAuthError(f"Wahoo token request failed: {exc}") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code >= 400:
        raise WahooAuthError(
            f"Wahoo token endpoint returned {resp.status_code}: {resp.text}"
        )
    return resp.json()


async def exchange_code(
    code: str,
    redirect_uri: str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Exchange an authorization code for access + refresh tokens."""
    return await _post_token(
        {
            "client_id": settings.WAHOO_CLIENT_ID,
            "client_secret": settings.WAHOO_CLIENT_SECRET,
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
    """Renew the access token using the refresh_token grant."""
    return await _post_token(
        {
            "client_id": settings.WAHOO_CLIENT_ID,
            "client_secret": settings.WAHOO_CLIENT_SECRET,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        client,
    )


async def _get(
    path: str,
    access_token: str,
    params: dict[str, Any] | None = None,
    client: httpx.AsyncClient | None = None,
) -> Any:
    owns = client is None
    client = client or httpx.AsyncClient(timeout=_TIMEOUT)
    try:
        resp = await client.get(
            f"{API_BASE}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
        )
    except httpx.HTTPError as exc:
        raise WahooAPIError(f"Wahoo API request failed: {exc}") from exc
    finally:
        if owns:
            await client.aclose()
    if resp.status_code == 401:
        raise WahooAuthError("Wahoo API returned 401 — access token rejected")
    if resp.status_code >= 400:
        raise WahooAPIError(f"Wahoo API {path} returned {resp.status_code}: {resp.text}")
    return resp.json()


async def fetch_user(access_token: str, client: httpx.AsyncClient | None = None) -> dict[str, Any]:
    """GET /v1/user — the authenticated athlete (id, email, ...)."""
    return await _get("/user", access_token, client=client)


async def fetch_workouts(
    access_token: str,
    page: int = 1,
    per_page: int = 30,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """GET /v1/workouts — one page of the athlete's workout list.

    Wahoo returns ``{"workouts": [...], "total": N, "page": ...}``. We return
    just the workout dicts (empty list when the page has none).
    """
    data = await _get(
        "/workouts",
        access_token,
        params={"page": page, "per_page": per_page},
        client=client,
    )
    if isinstance(data, dict):
        return data.get("workouts") or []
    if isinstance(data, list):
        return data
    return []


async def fetch_workout(
    access_token: str,
    workout_id: int | str,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """GET /v1/workouts/{id} — a single workout with its workout_summary."""
    return await _get(f"/workouts/{workout_id}", access_token, client=client)
