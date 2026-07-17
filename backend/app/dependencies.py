from typing import Annotated, AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.auth_service import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract and validate the current user from the JWT access token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise credentials_exception

    user = await db.get(User, user_id)
    if user is None:
        raise credentials_exception
    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
) -> User:
    """Ensure the current user is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


async def get_db_for_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerator[AsyncSession, None]:
    """Get a database session with the current user's ID set as a PostgreSQL session variable.

    PostgreSQL's `SET LOCAL` is transaction-scoped — it's cleared on every COMMIT.
    Endpoints that commit multiple times within a single request (notably the Garmin
    sync flow which commits the credential before running the sync) would therefore
    lose the RLS context mid-request. We register an `after_begin` listener on the
    underlying sync session so the variable is re-applied at the start of every new
    transaction (initial + each implicit BEGIN after a commit).
    """
    # SECURITY: coerce to int before interpolating into the SET LOCAL string.
    # `SET LOCAL` cannot be parameterised via bind params, so the value is
    # formatted into the SQL text — int() guarantees it is purely numeric and
    # rejects (raising ValueError → 500, never executing) any non-integer that
    # could otherwise smuggle SQL through a malformed/forged token.
    user_id = int(current_user.id)
    set_local_sql = text(f"SET LOCAL app.current_user_id = '{user_id}'")

    def _reapply_rls(session, transaction, connection):  # type: ignore[no-untyped-def]
        connection.execute(set_local_sql)

    event.listen(db.sync_session, "after_begin", _reapply_rls)

    # Kick off the initial transaction immediately so the SET LOCAL applies to it
    await db.execute(set_local_sql)

    try:
        yield db
    finally:
        event.remove(db.sync_session, "after_begin", _reapply_rls)
