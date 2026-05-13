"""Crew API — friendship graph + Squad Cup standings.

See docs/superpowers/specs/2026-05-13-crew-backend-design.md for the
end-to-end design. This module ships Phase 1 (solo + pair).
"""

from datetime import date, datetime, timedelta, timezone
from secrets import token_urlsafe
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.crew import Crew, CrewInvite, CrewMembership
from app.models.user import User
from app.schemas.crew import (
    CrewCreate,
    CrewInviteCreate,
    CrewInviteRead,
    CrewMemberRead,
    CrewMineResponse,
    CrewRead,
    StandingsResponse,
)
from app.services.crew_score import (
    _handle_from_email,
    crew_standings,
)

router = APIRouter(prefix="/crews", tags=["crews"])


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


async def _user_membership(
    db: AsyncSession, user_id: int
) -> CrewMembership | None:
    stmt = select(CrewMembership).where(CrewMembership.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _is_member(db: AsyncSession, user_id: int, crew_id: int) -> bool:
    stmt = select(CrewMembership).where(
        CrewMembership.user_id == user_id, CrewMembership.crew_id == crew_id
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def _crew_member_rows(
    db: AsyncSession, crew_id: int
) -> list[tuple[CrewMembership, User]]:
    stmt = (
        select(CrewMembership, User)
        .join(User, User.id == CrewMembership.user_id)
        .where(CrewMembership.crew_id == crew_id)
        .order_by(CrewMembership.joined_at.asc())
    )
    rows = await db.execute(stmt)
    return list(rows.all())


async def _crew_pending_invites(
    db: AsyncSession, crew_id: int
) -> list[CrewInvite]:
    stmt = (
        select(CrewInvite)
        .where(
            CrewInvite.crew_id == crew_id,
            CrewInvite.status == "pending",
        )
        .order_by(CrewInvite.created_at.desc())
    )
    return list((await db.execute(stmt)).scalars().all())


def _members_to_read(rows: list[tuple[CrewMembership, User]]) -> list[CrewMemberRead]:
    return [
        CrewMemberRead(
            user_id=u.id,
            handle=_handle_from_email(u.email or ""),
            joined_at=m.joined_at,
            role=("owner" if m.role == "owner" else "member"),
        )
        for (m, u) in rows
    ]


def _invites_to_read(invites: list[CrewInvite]) -> list[CrewInviteRead]:
    return [
        CrewInviteRead(
            id=i.id,
            invitee_email=i.invitee_email,
            created_at=i.created_at,
            expires_at=i.expires_at,
            status=i.status,  # type: ignore[arg-type]
        )
        for i in invites
    ]


async def _athlete_local_today(db: AsyncSession, user_id: int) -> date:
    """Return today's date in the athlete's local tz. Falls back to UTC."""
    profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    tz_name = (profile.timezone if profile else None) or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("UTC")
    return datetime.now(tz).date()


def _monday_of(d: date) -> date:
    return d - timedelta(days=d.weekday())


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.get("/me", response_model=CrewMineResponse)
async def get_my_crew(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewMineResponse:
    """Return the caller's crew + members + pending invites, or empty."""
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        return CrewMineResponse(crew=None, members=[], pending_invites=[])

    crew = (
        await db.execute(select(Crew).where(Crew.id == membership.crew_id))
    ).scalar_one_or_none()
    if crew is None:
        # Defensive: membership without crew shouldn't happen but if it did,
        # treat as not-in-a-crew.
        return CrewMineResponse(crew=None, members=[], pending_invites=[])

    members = await _crew_member_rows(db, crew.id)
    pending = await _crew_pending_invites(db, crew.id)
    return CrewMineResponse(
        crew=CrewRead(id=crew.id, name=crew.name, owner_user_id=crew.owner_user_id),
        members=_members_to_read(members),
        pending_invites=_invites_to_read(pending),
    )


@router.post("", response_model=CrewMineResponse, status_code=status.HTTP_201_CREATED)
async def create_crew(
    payload: CrewCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewMineResponse:
    """Create a crew with the caller as owner + first member."""
    if await _user_membership(db, current_user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "already_in_crew", "msg": "leave your current crew first"},
        )

    crew = Crew(name=payload.name.strip(), owner_user_id=current_user.id)
    db.add(crew)
    await db.flush()  # need crew.id for the membership row

    db.add(
        CrewMembership(crew_id=crew.id, user_id=current_user.id, role="owner")
    )
    await db.commit()
    await db.refresh(crew)

    members = await _crew_member_rows(db, crew.id)
    return CrewMineResponse(
        crew=CrewRead(id=crew.id, name=crew.name, owner_user_id=crew.owner_user_id),
        members=_members_to_read(members),
        pending_invites=[],
    )


@router.delete("/{crew_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disband_crew(
    crew_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    crew = (
        await db.execute(select(Crew).where(Crew.id == crew_id))
    ).scalar_one_or_none()
    if crew is None:
        raise HTTPException(status_code=404, detail="crew not found")
    if crew.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="only the owner can disband the crew")
    await db.delete(crew)
    await db.commit()


@router.delete("/me/membership", status_code=status.HTTP_204_NO_CONTENT)
async def leave_crew(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=404, detail="not in a crew")

    crew = (
        await db.execute(select(Crew).where(Crew.id == membership.crew_id))
    ).scalar_one_or_none()
    if crew is not None and crew.owner_user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "must_transfer_ownership",
                "msg": "transfer ownership or disband the crew before leaving",
            },
        )

    await db.delete(membership)
    await db.commit()


@router.post(
    "/{crew_id}/invites",
    response_model=CrewInviteRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_invite(
    crew_id: int,
    payload: CrewInviteCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewInviteRead:
    if not await _is_member(db, current_user.id, crew_id):
        raise HTTPException(status_code=403, detail="not a member of this crew")

    email = payload.email.lower().strip()

    # If a user with that email already exists and is in another crew, 422.
    existing_user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing_user is not None:
        existing_mem = await _user_membership(db, existing_user.id)
        if existing_mem is not None and existing_mem.crew_id != crew_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "already_in_crew",
                    "msg": "that athlete is already in a different crew",
                },
            )
        if existing_mem is not None and existing_mem.crew_id == crew_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "already_member",
                    "msg": "that athlete is already in this crew",
                },
            )

    # Don't create a duplicate pending invite for the same email × crew.
    dup = (
        await db.execute(
            select(CrewInvite).where(
                CrewInvite.crew_id == crew_id,
                CrewInvite.invitee_email == email,
                CrewInvite.status == "pending",
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        return CrewInviteRead(
            id=dup.id,
            invitee_email=dup.invitee_email,
            created_at=dup.created_at,
            expires_at=dup.expires_at,
            status=dup.status,  # type: ignore[arg-type]
        )

    invite = CrewInvite(
        crew_id=crew_id,
        inviter_user_id=current_user.id,
        invitee_email=email,
        token=token_urlsafe(32),
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(days=14),
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)

    # Email delivery itself is out of scope here — a transactional email
    # service plugs in at a later phase. The token is returned so the
    # frontend can present a copy-link button as a fallback.
    return CrewInviteRead(
        id=invite.id,
        invitee_email=invite.invitee_email,
        created_at=invite.created_at,
        expires_at=invite.expires_at,
        status=invite.status,  # type: ignore[arg-type]
    )


@router.post(
    "/invites/{token}/accept",
    response_model=CrewMineResponse,
)
async def accept_invite(
    token: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewMineResponse:
    invite = (
        await db.execute(select(CrewInvite).where(CrewInvite.token == token))
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="invite not found")
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invite_not_pending", "msg": f"status: {invite.status}"},
        )
    expires = invite.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invite_expired", "msg": "this invite has expired"},
        )
    if (current_user.email or "").lower() != invite.invitee_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "email_mismatch",
                "msg": "this invite is bound to a different email address",
            },
        )
    if await _user_membership(db, current_user.id) is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "already_in_crew", "msg": "leave your current crew first"},
        )

    db.add(
        CrewMembership(crew_id=invite.crew_id, user_id=current_user.id, role="member")
    )
    invite.status = "accepted"
    invite.accepted_at = datetime.now(timezone.utc)
    await db.commit()

    # Echo the new crew shape back so the frontend can update without a
    # second round-trip.
    crew = (
        await db.execute(select(Crew).where(Crew.id == invite.crew_id))
    ).scalar_one_or_none()
    members = await _crew_member_rows(db, invite.crew_id)
    pending = await _crew_pending_invites(db, invite.crew_id)
    return CrewMineResponse(
        crew=CrewRead(
            id=crew.id, name=crew.name, owner_user_id=crew.owner_user_id
        ) if crew else None,
        members=_members_to_read(members),
        pending_invites=_invites_to_read(pending),
    )


@router.post("/invites/{invite_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    invite = (
        await db.execute(select(CrewInvite).where(CrewInvite.id == invite_id))
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="invite not found")
    if invite.status != "pending":
        return  # idempotent

    # Either the original inviter or the crew owner can revoke.
    crew = (
        await db.execute(select(Crew).where(Crew.id == invite.crew_id))
    ).scalar_one_or_none()
    allowed = invite.inviter_user_id == current_user.id or (
        crew is not None and crew.owner_user_id == current_user.id
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="not authorised to revoke")

    invite.status = "revoked"
    await db.commit()


@router.get("/me/standings", response_model=StandingsResponse)
async def my_standings(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    week: str | None = None,
) -> StandingsResponse:
    """Squad Cup standings for the caller's crew.

    `week` accepts an ISO yyyy-mm-dd; the Monday of that date's ISO week is
    used as the canonical week-start. Defaults to the caller's local current
    week.
    """
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=404, detail="not in a crew")

    if week:
        try:
            base = date.fromisoformat(week)
        except ValueError:
            raise HTTPException(status_code=400, detail="bad week date")
    else:
        base = await _athlete_local_today(db, current_user.id)
    week_start = _monday_of(base)

    payload = await crew_standings(db, membership.crew_id, week_start, current_user.id)
    return StandingsResponse(**payload)
