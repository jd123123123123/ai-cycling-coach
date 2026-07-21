"""COROS Open API integration endpoints.

OAuth2 authorization-code flow + sync, mirroring the Wahoo integration. Tokens
are stored encrypted (EncryptedString) on CorosCredential.

COROS's official API is a PARTNER program: with no COROS_CLIENT_ID/SECRET set
(the default), the integration degrades honestly — /coros/connect returns a
clean 409 "not configured" (never a 500) and /coros/status reports
``configured: false`` so the UI shows "Bald verfügbar / Coming soon".

Flow:
    GET  /coros/connect   → returns the COROS authorize URL (state carries a
                            short-lived JWT identifying the user). 409 when the
                            integration isn't configured (client id/secret unset).
    GET  /coros/callback  → COROS redirects here with ?code&state; we exchange
                            the code for tokens, upsert the credential, then
                            redirect back into the app.
    GET  /coros/status    → {connected, configured, coros_user_id?, last_sync?}
    POST /coros/sync      → pull activities → activities → {workouts_imported}
    DELETE /coros         → disconnect (delete the credential).

User-scoped routes auth via get_current_active_user + get_db_for_user, exactly
like Wahoo. The callback is hit by the browser (no Bearer), so it resolves the
user from a signed state and applies the RLS session var explicitly.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import event, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_active_user, get_db_for_user
from app.models.coros_credential import CorosCredential
from app.models.user import User
from app.schemas.coros import (
    CorosConnectResponse,
    CorosDisconnectResponse,
    CorosStatusResponse,
    CorosSyncResponse,
)
from app.services import coros_client, coros_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/coros", tags=["coros"])

# OAuth state = a short-lived signed JWT so /coros/callback can trust the user
# it was minted for (CSRF-resistant; can't be forged without JWT_SECRET_KEY).
_STATE_SCOPE = "coros_oauth_state"


def _https_base(request: Request) -> str:
    """Base URL forced to https (Railway's proxy terminates TLS and reports http)."""
    return str(request.base_url).rstrip("/").replace("http://", "https://", 1)


def _redirect_uri(request: Request) -> str:
    """Configured redirect URI, or derive one from the request base URL."""
    return settings.COROS_REDIRECT_URI or f"{_https_base(request)}/coros/callback"


def _require_configured() -> None:
    if not settings.coros_configured:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="COROS integration is not configured on this server.",
        )


@router.get("/connect", response_model=CorosConnectResponse)
async def connect_coros(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> CorosConnectResponse:
    """Return the COROS OAuth authorize URL for the frontend to open."""
    _require_configured()
    now = datetime.now(timezone.utc)
    state = jwt.encode(
        {
            "sub": str(current_user.id),
            "scope": _STATE_SCOPE,
            "iat": now,
            "exp": now + timedelta(minutes=15),
        },
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )
    authorize_url = coros_client.build_authorize_url(
        redirect_uri=_redirect_uri(request), state=state
    )
    return CorosConnectResponse(authorize_url=authorize_url)


@router.get("/callback")
async def coros_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Exchange the authorization code for tokens and upsert the credential."""
    _require_configured()
    app_base = _https_base(request)
    if not code or not state:
        return RedirectResponse(url=f"{app_base}/settings?coros=error", status_code=302)

    # Verify the signed state → the user this callback belongs to.
    try:
        payload = jwt.decode(state, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        if payload.get("scope") != _STATE_SCOPE:
            raise jwt.InvalidTokenError("wrong scope")
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return RedirectResponse(url=f"{app_base}/settings?coros=error", status_code=302)

    # RLS: scope this (unauthenticated) session to the resolved user.
    await _set_rls_user(db, user_id)

    try:
        tokens = await coros_client.exchange_code(
            code=code, redirect_uri=_redirect_uri(request)
        )
    except coros_client.CorosAuthError:
        logger.warning("COROS code exchange failed for user_id=%s", user_id)
        return RedirectResponse(url=f"{app_base}/settings?coros=error", status_code=302)

    result = await db.execute(
        select(CorosCredential).where(CorosCredential.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        credential = CorosCredential(
            user_id=user_id,
            access_token=tokens.get("access_token", ""),
            refresh_token=tokens.get("refresh_token", ""),
        )
        db.add(credential)
    coros_service.apply_tokens(credential, tokens)

    await db.commit()
    logger.info("COROS connected for user_id=%s", user_id)
    return RedirectResponse(url=f"{app_base}/settings?coros=connected", status_code=302)


@router.get("/status", response_model=CorosStatusResponse)
async def coros_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> CorosStatusResponse:
    """Return COROS connection status for the current user.

    ``configured`` is always reported so the UI can show an honest
    "Bald verfügbar" when the server has no COROS partner credentials.
    """
    result = await db.execute(
        select(CorosCredential).where(CorosCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        return CorosStatusResponse(connected=False, configured=settings.coros_configured)
    return CorosStatusResponse(
        connected=True,
        configured=settings.coros_configured,
        coros_user_id=credential.coros_user_id,
        last_sync=credential.last_sync_at,
    )


@router.post("/sync", response_model=CorosSyncResponse)
async def coros_sync(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> CorosSyncResponse:
    """Trigger a manual COROS activity sync for the current user."""
    _require_configured()
    try:
        result = await coros_service.sync_user(db, current_user.id)
    except coros_client.CorosAuthError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No COROS account connected, or the connection expired — reconnect.",
        )
    return CorosSyncResponse(workouts_imported=result["workouts_imported"])


@router.delete("", response_model=CorosDisconnectResponse)
@router.delete("/", response_model=CorosDisconnectResponse)
async def disconnect_coros(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> CorosDisconnectResponse:
    """Disconnect the COROS account (delete the stored credential)."""
    result = await db.execute(
        select(CorosCredential).where(CorosCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No COROS account connected.",
        )
    await db.delete(credential)
    await db.commit()
    logger.info("COROS disconnected for user_id=%s", current_user.id)
    return CorosDisconnectResponse(message="COROS account disconnected")


async def _set_rls_user(db: AsyncSession, user_id: int) -> None:
    """Apply the RLS session var for an unauthenticated (callback) session.

    Mirrors get_db_for_user: re-applies SET LOCAL on every new transaction so the
    context survives the commits that create_activity performs.
    """
    set_local_sql = text(f"SET LOCAL app.current_user_id = '{int(user_id)}'")

    def _reapply(session, transaction, connection):  # type: ignore[no-untyped-def]
        connection.execute(set_local_sql)

    event.listen(db.sync_session, "after_begin", _reapply)
    await db.execute(set_local_sql)
