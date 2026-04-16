from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db
from app.models.consent import ConsentRecord
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    response: Response,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete the current user's account.

    GDPR compliance:
    - Anonymizes consent_records (sets user_id to NULL) to preserve legal proof of consent.
    - Deletes the user record; CASCADE handles athlete_profiles.
    - Returns 204 No Content.
    """
    # Step 1: Anonymize consent records — preserve the audit trail but remove user linkage
    await db.execute(
        update(ConsentRecord)
        .where(ConsentRecord.user_id == current_user.id)
        .values(user_id=None)
    )

    # Step 2: Delete the user — CASCADE deletes athlete_profiles
    await db.delete(current_user)
    await db.commit()

    # Clear the refresh token cookie
    response.delete_cookie(
        key="refresh_token",
        httponly=True,
        secure=True,
        samesite="lax",
    )
