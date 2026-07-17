from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db
from app.models.consent import ConsentRecord
from app.models.user import User
from app.schemas.auth import ProfileUpdateRequest, UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserResponse)
async def update_me(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update the current user's account profile (display name + avatar).

    Only the two account-level fields are editable here; athlete stats live on
    PATCH/PUT /athletes/me. The avatar must be a small base64 ``data:image/...``
    URI (validated in the schema) — never an external URL. Owner = current_user.
    """
    # exclude_unset: only touch fields the client actually sent (partial update).
    fields = data.model_dump(exclude_unset=True)
    if "display_name" in fields:
        current_user.display_name = fields["display_name"]
    if "avatar_url" in fields:
        current_user.avatar_url = fields["avatar_url"]

    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


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
