from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.consent import ConsentRecord
from app.models.user import User
from app.schemas.consent import ConsentRequest, ConsentResponse

router = APIRouter(prefix="/consent", tags=["consent"])


@router.post("", response_model=ConsentResponse, status_code=status.HTTP_201_CREATED)
async def create_consent(
    request: Request,
    body: ConsentRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> ConsentResponse:
    """Create a consent record for the current user.

    Stores the consent type, version, timestamp, IP address, user agent,
    and the exact consent text shown to the user.
    """
    # Extract client IP and user agent for audit trail
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    now = datetime.now(timezone.utc)

    # ── RE-GRANTING IS NOT AN ERROR ─────────────────────────────────────────
    # `consent_records` carries UNIQUE (user_id, consent_type, consent_version)
    # and this endpoint used to INSERT unconditionally. The onboarding screen
    # grants `health_data` v1.0 every time its Continue button is pressed, so
    # the second press raised an IntegrityError, FastAPI turned that into a 500,
    # and the screen showed "Das hat gerade nicht geklappt."
    #
    # PERMANENTLY. Once the row existed every later attempt hit the same
    # constraint, so a rider who got that far could never leave the numbers
    # screen again — the exact failure this was reported as.
    #
    # Re-affirming a consent you already hold is a normal act and, under GDPR,
    # an update to the record rather than a second one: the audit trail keeps
    # the latest IP, agent and timestamp, and a re-grant clears any withdrawal.
    existing = (await db.execute(
        select(ConsentRecord).where(
            ConsentRecord.user_id == current_user.id,
            ConsentRecord.consent_type == body.consent_type,
            ConsentRecord.consent_version == body.consent_version,
        )
    )).scalar_one_or_none()

    if existing is not None:
        existing.granted = body.granted
        existing.granted_at = now if body.granted else existing.granted_at
        existing.withdrawn_at = None if body.granted else now
        existing.ip_address = ip_address
        existing.user_agent = user_agent
        existing.consent_text = body.consent_text
        await db.commit()
        await db.refresh(existing)
        return existing

    consent_record = ConsentRecord(
        user_id=current_user.id,
        consent_type=body.consent_type,
        consent_version=body.consent_version,
        granted=body.granted,
        granted_at=now if body.granted else None,
        ip_address=ip_address,
        user_agent=user_agent,
        consent_text=body.consent_text,
    )
    db.add(consent_record)
    try:
        await db.commit()
    except IntegrityError:
        # Two taps in flight at once. Whoever lost the race gets the row the
        # winner wrote, which is the correct answer either way.
        await db.rollback()
        raced = (await db.execute(
            select(ConsentRecord).where(
                ConsentRecord.user_id == current_user.id,
                ConsentRecord.consent_type == body.consent_type,
                ConsentRecord.consent_version == body.consent_version,
            )
        )).scalar_one()
        return raced
    await db.refresh(consent_record)
    return consent_record


@router.get("", response_model=list[ConsentResponse])
async def list_consents(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> list[ConsentResponse]:
    """List all consent records for the current user."""
    result = await db.execute(
        select(ConsentRecord)
        .where(ConsentRecord.user_id == current_user.id)
        .order_by(ConsentRecord.created_at.desc())
    )
    return result.scalars().all()


@router.post("/{consent_type}/withdraw", response_model=ConsentResponse)
async def withdraw_consent(
    consent_type: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> ConsentResponse:
    """Withdraw consent for a specific consent type.

    Sets withdrawn_at on the most recent active (not yet withdrawn) consent record
    for this type. Does NOT delete the record — GDPR requires audit trail.
    """
    result = await db.execute(
        select(ConsentRecord)
        .where(
            ConsentRecord.user_id == current_user.id,
            ConsentRecord.consent_type == consent_type,
            ConsentRecord.withdrawn_at.is_(None),
            ConsentRecord.granted.is_(True),
        )
        .order_by(ConsentRecord.created_at.desc())
        .limit(1)
    )
    record = result.scalar_one_or_none()

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active consent record found for type '{consent_type}'",
        )

    record.withdrawn_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(record)
    return record
