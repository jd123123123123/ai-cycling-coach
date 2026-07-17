import time
from collections import defaultdict, deque
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_active_user
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse, UserResponse
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    create_refresh_token,
    create_user,
    decode_refresh_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_MAX_AGE = 30 * 24 * 60 * 60  # 30 days in seconds


# ----------------------------------------------------------------------
# Per-IP in-memory rate limiter for the unauthenticated auth surface.
# Mirrors coach._check_chat_rate_limit. Per-process (single-worker phase);
# production behind multiple workers should move this to Redis. Brute-force
# and credential-stuffing mitigation — NOT a substitute for account lockout.
# ----------------------------------------------------------------------
_RATE_WINDOW_SECONDS = 60
_AUTH_RATE_LIMITS = {
    "login": 10,     # POST /auth/login  — 10/min/IP
    "register": 5,   # POST /auth/register — 5/min/IP
    "refresh": 30,   # POST /auth/refresh — 30/min/IP
}
_auth_request_log: dict[tuple[str, str], deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    """Best-effort client IP. Honours the first X-Forwarded-For hop (Railway's
    proxy sets it); falls back to the socket peer."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        first = xff.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


def _check_auth_rate_limit(request: Request, bucket: str) -> None:
    """Sliding-window per-IP limiter. Raises 429 when the bucket is exhausted."""
    limit = _AUTH_RATE_LIMITS[bucket]
    now = time.monotonic()
    key = (bucket, _client_ip(request))
    log = _auth_request_log[key]
    while log and log[0] < now - _RATE_WINDOW_SECONDS:
        log.popleft()
    if len(log) >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(_RATE_WINDOW_SECONDS)},
        )
    log.append(now)


# secure=True everywhere except local dev (DEBUG=True over plain http).
# In production (DEBUG=False, behind Railway TLS) the refresh cookie is only
# ever sent over HTTPS.
_COOKIE_SECURE = not settings.DEBUG


def set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Set the httpOnly refresh token cookie on the response."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=_COOKIE_SECURE,  # HTTPS-only in production
        samesite="lax",
        max_age=REFRESH_COOKIE_MAX_AGE,
    )


def clear_refresh_cookie(response: Response) -> None:
    """Clear the refresh token cookie (logout)."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value="",
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite="lax",
        max_age=0,
    )


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def register(
    request: Request,
    request_body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Register a new user. Returns access token; sets refresh token as httpOnly cookie."""
    _check_auth_rate_limit(request, "register")
    # Check email uniqueness
    result = await db.execute(select(User).where(User.email == request_body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    user = await create_user(db, request_body.email, request_body.password)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    response: Response,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Authenticate with email/password (form-encoded). Returns access token; sets refresh cookie."""
    _check_auth_rate_limit(request, "login")
    # OAuth2PasswordRequestForm uses 'username' field for email
    user = await authenticate_user(db, form_data.username, form_data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, refresh_token)

    return TokenResponse(access_token=access_token)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Get a new access token using the httpOnly refresh token cookie."""
    _check_auth_rate_limit(request, "refresh")
    token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_refresh_token(token)
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Rotate: issue new access + refresh tokens
    new_access_token = create_access_token(user.id)
    new_refresh_token = create_refresh_token(user.id)
    set_refresh_cookie(response, new_refresh_token)

    return TokenResponse(access_token=new_access_token)


@router.post("/logout")
async def logout(response: Response) -> dict:
    """Clear the refresh token cookie (logout)."""
    clear_refresh_cookie(response)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> UserResponse:
    """Get the currently authenticated user's profile."""
    return UserResponse.model_validate(current_user)
