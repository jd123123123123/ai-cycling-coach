"""Wahoo Cloud API integration endpoints.

OAuth2 authorization-code flow + sync, mirroring the Garmin/Apple-Health
integrations. Tokens are stored encrypted (EncryptedString) on WahooCredential.

Flow:
    GET  /wahoo/connect   → returns the Wahoo authorize URL (state carries a
                            short-lived JWT identifying the user). 409 when the
                            integration isn't configured (client id/secret unset).
    GET  /wahoo/callback  → Wahoo redirects here with ?code&state; we exchange
                            the code for tokens, upsert the credential, then
                            redirect back into the app.
    GET  /wahoo/status    → {connected, wahoo_user_id?, last_sync?}
    POST /wahoo/sync      → pull workouts → activities → {workouts_imported}
    POST /wahoo/webhook   → ingest a pushed workout (no user auth; matched by
                            Wahoo user id, optional shared-secret verification).
    DELETE /wahoo         → disconnect (delete the credential).

User-scoped routes auth via get_current_active_user + get_db_for_user, exactly
like Garmin/Apple-Health. The callback + webhook are hit by the browser / Wahoo
(no Bearer), so they resolve the user from a signed state / the payload.
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
from app.models.user import User
from app.models.wahoo_credential import WahooCredential
from app.schemas.wahoo import (
    WahooConnectResponse,
    WahooDisconnectResponse,
    WahooStatusResponse,
    WahooSyncResponse,
)
from app.services import wahoo_client, wahoo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/wahoo", tags=["wahoo"])

# OAuth state = a short-lived signed JWT so /wahoo/callback can trust the user
# it was minted for (CSRF-resistant; can't be forged without JWT_SECRET_KEY).
_STATE_SCOPE = "wahoo_oauth_state"


def _https_base(request: Request) -> str:
    """Base URL forced to https (Railway's proxy terminates TLS and reports http)."""
    return str(request.base_url).rstrip("/").replace("http://", "https://", 1)


def _redirect_uri(request: Request) -> str:
    """Configured redirect URI, or derive one from the request base URL."""
    return settings.WAHOO_REDIRECT_URI or f"{_https_base(request)}/wahoo/callback"


def _require_configured() -> None:
    if not settings.wahoo_configured:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Wahoo integration is not configured on this server.",
        )


@router.get("/connect", response_model=WahooConnectResponse)
async def connect_wahoo(
    request: Request,
    current_user: User = Depends(get_current_active_user),
) -> WahooConnectResponse:
    """Return the Wahoo OAuth authorize URL for the frontend to open."""
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
    authorize_url = wahoo_client.build_authorize_url(
        redirect_uri=_redirect_uri(request), state=state
    )
    return WahooConnectResponse(authorize_url=authorize_url)


@router.get("/callback")
async def wahoo_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Exchange the authorization code for tokens and upsert the credential."""
    _require_configured()
    app_base = _https_base(request)
    if not code or not state:
        return RedirectResponse(url=f"{app_base}/settings?wahoo=error", status_code=302)

    # Verify the signed state → the user this callback belongs to.
    try:
        payload = jwt.decode(state, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        if payload.get("scope") != _STATE_SCOPE:
            raise jwt.InvalidTokenError("wrong scope")
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return RedirectResponse(url=f"{app_base}/settings?wahoo=error", status_code=302)

    # RLS: scope this (unauthenticated) session to the resolved user.
    await _set_rls_user(db, user_id)

    try:
        tokens = await wahoo_client.exchange_code(
            code=code, redirect_uri=_redirect_uri(request)
        )
    except wahoo_client.WahooAuthError:
        logger.warning("Wahoo code exchange failed for user_id=%s", user_id)
        return RedirectResponse(url=f"{app_base}/settings?wahoo=error", status_code=302)

    result = await db.execute(
        select(WahooCredential).where(WahooCredential.user_id == user_id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        credential = WahooCredential(
            user_id=user_id,
            access_token=tokens["access_token"],
            refresh_token=tokens.get("refresh_token", ""),
        )
        db.add(credential)
    wahoo_service.apply_tokens(credential, tokens)

    # Best-effort: record the Wahoo user id.
    try:
        wahoo_user = await wahoo_client.fetch_user(credential.access_token)
        if isinstance(wahoo_user, dict) and wahoo_user.get("id") is not None:
            credential.wahoo_user_id = str(wahoo_user["id"])
    except Exception as exc:  # noqa: BLE001 — non-fatal
        logger.info("Could not fetch Wahoo user id for user_id=%s: %s", user_id, exc)

    await db.commit()
    logger.info("Wahoo connected for user_id=%s", user_id)
    return RedirectResponse(url=f"{app_base}/settings?wahoo=connected", status_code=302)


@router.get("/status", response_model=WahooStatusResponse)
async def wahoo_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> WahooStatusResponse:
    """Return Wahoo connection status for the current user."""
    result = await db.execute(
        select(WahooCredential).where(WahooCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        return WahooStatusResponse(connected=False)
    return WahooStatusResponse(
        connected=True,
        wahoo_user_id=credential.wahoo_user_id,
        last_sync=credential.last_sync_at,
    )


@router.post("/sync", response_model=WahooSyncResponse)
async def wahoo_sync(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> WahooSyncResponse:
    """Trigger a manual Wahoo workout sync for the current user."""
    try:
        result = await wahoo_service.sync_user(db, current_user.id)
    except wahoo_client.WahooAuthError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Wahoo account connected, or the connection expired — reconnect.",
        )
    return WahooSyncResponse(workouts_imported=result["workouts_imported"])


@router.post("/webhook", response_model=WahooSyncResponse)
async def wahoo_webhook(
    payload: dict,
    db: AsyncSession = Depends(get_db),
) -> WahooSyncResponse:
    """Ingest a workout pushed by Wahoo (new-workout webhook).

    Wahoo posts without a user Bearer token, so we resolve the user from the
    payload's Wahoo user id. When configured, WAHOO_CLIENT_SECRET is checked
    against the payload's ``webhook_token`` for a light verification.
    """
    _require_configured()

    # Light verification: if Wahoo sends a webhook_token, it must match our secret.
    token = payload.get("webhook_token")
    if token is not None and token != settings.WAHOO_CLIENT_SECRET:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad webhook token")

    user_block = payload.get("user") if isinstance(payload.get("user"), dict) else {}
    wahoo_user_id = payload.get("user_id") or user_block.get("id")
    workout = payload.get("workout") if isinstance(payload.get("workout"), dict) else None
    if wahoo_user_id is None or workout is None:
        return WahooSyncResponse(workouts_imported=0, message="Ignored (no workout/user)")

    result = await db.execute(
        select(WahooCredential).where(
            WahooCredential.wahoo_user_id == str(wahoo_user_id)
        )
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        return WahooSyncResponse(workouts_imported=0, message="Ignored (unknown user)")

    await _set_rls_user(db, credential.user_id)
    imported = await wahoo_service.ingest_workout(db, credential.user_id, workout)
    return WahooSyncResponse(workouts_imported=imported)


@router.delete("", response_model=WahooDisconnectResponse)
@router.delete("/", response_model=WahooDisconnectResponse)
async def disconnect_wahoo(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> WahooDisconnectResponse:
    """Disconnect the Wahoo account (delete the stored credential)."""
    result = await db.execute(
        select(WahooCredential).where(WahooCredential.user_id == current_user.id)
    )
    credential = result.scalar_one_or_none()
    if credential is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Wahoo account connected.",
        )
    await db.delete(credential)
    await db.commit()
    logger.info("Wahoo disconnected for user_id=%s", current_user.id)
    return WahooDisconnectResponse(message="Wahoo account disconnected")


async def _set_rls_user(db: AsyncSession, user_id: int) -> None:
    """Apply the RLS session var for an unauthenticated (callback/webhook) session.

    Mirrors get_db_for_user: re-applies SET LOCAL on every new transaction so the
    context survives the commits that create_activity performs.
    """
    set_local_sql = text(f"SET LOCAL app.current_user_id = '{int(user_id)}'")

    def _reapply(session, transaction, connection):  # type: ignore[no-untyped-def]
        connection.execute(set_local_sql)

    event.listen(db.sync_session, "after_begin", _reapply)
    await db.execute(set_local_sql)
