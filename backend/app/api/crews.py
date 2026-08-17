"""Crew API — friendship graph + Squad Cup standings.

See docs/superpowers/specs/2026-05-13-crew-backend-design.md for the
end-to-end design. This module ships Phase 1 (solo + pair).
"""

import re
from datetime import date, datetime, time, timedelta, timezone
from secrets import token_urlsafe
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.crew import Crew, CrewInvite, CrewMembership
from app.models.crew_challenge import CrewChallenge
from app.models.crew_nudge import CrewNudge
from app.models.user import User
from app.schemas.crew import (
    AcceptOptions,
    CrewCreate,
    CrewInviteCreate,
    CrewInviteRead,
    CrewMemberRead,
    CrewMemberRide,
    CrewMemberRides,
    CrewMineResponse,
    CrewRead,
    DiscoverMember,
    DuelResponse,
    InviteByUserCreate,
    StandingsResponse,
)
from app.schemas.crew_challenge import (
    ChallengeCreate,
    ChallengeParticipant,
    ChallengeRead,
)
from app.services.crew_score import (
    CHALLENGE_OPT_IN_ROLE,
    display_handle,
    _handle_from_email,
    challenge_value_for_user,
    crew_duel,
    crew_standings_window,
    member_in_challenge,
    personal_week_targets,
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
            handle=display_handle(u),
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


# Scaffolding/seed accounts must never appear in people-suggestions.
# Matches local-parts like test@, user@, userb@, user01@ … plus anything on
# the reserved example.com domain (test@test.com, test01@example.com,
# userb@example.com are live seeds).
_TEST_ACCOUNT_LOCAL_RE = re.compile(r"^(test|user[a-z]?\d*)@", re.IGNORECASE)


def _is_test_account(email: str | None) -> bool:
    e = (email or "").strip().lower()
    if not e:
        return False
    return bool(_TEST_ACCOUNT_LOCAL_RE.match(e)) or e.endswith("@example.com")


# ──────────────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────────────


@router.get("/discover", response_model=list[DiscoverMember])
async def discover_members(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    q: str | None = None,
    limit: int = 30,
) -> list[DiscoverMember]:
    """Find other athletes on the app to add to your crew. Returns handles only
    (never raw emails). `q` filters by handle/email prefix (case-insensitive).
    Members already in a crew are flagged `in_crew` so the UI can disable them."""
    rows = (
        await db.execute(
            select(User).where(User.id != current_user.id, User.is_active.is_(True))
        )
    ).scalars().all()
    ql = (q or "").lower().strip()
    out: list[DiscoverMember] = []
    for u in rows:
        if _is_test_account(u.email):
            continue  # scaffolding users never show up as suggestions
        handle = display_handle(u)
        if ql and ql not in handle.lower() and ql not in (u.email or "").lower():
            continue
        mem = await _user_membership(db, u.id)
        out.append(DiscoverMember(user_id=u.id, handle=handle, in_crew=mem is not None))
    out.sort(key=lambda m: (m.in_crew, m.handle.lower()))
    return out[:limit]


@router.post(
    "/{crew_id}/invites/by-user",
    response_model=CrewInviteRead,
    status_code=status.HTTP_201_CREATED,
)
async def invite_by_user(
    crew_id: int,
    payload: InviteByUserCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewInviteRead:
    """Invite a discovered member by user_id — resolves their email server-side
    (never exposed to the client) and reuses the email-invite path."""
    target = (
        await db.execute(select(User).where(User.id == payload.user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    return await create_invite(crew_id, CrewInviteCreate(email=target.email), current_user, db)


@router.get("/me/duel", response_model=DuelResponse)
async def my_duel(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> DuelResponse:
    """Head-to-head rich stats: you this week vs last week (always), plus each
    crew-mate's week (when in a crew). Powers the Duel Arena."""
    today = await _athlete_local_today(db, current_user.id)
    week_start = _monday_of(today)
    mem = await _user_membership(db, current_user.id)
    crew_id = mem.crew_id if mem else None
    data = await crew_duel(db, current_user.id, crew_id, week_start)
    return DuelResponse(**data)


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
        crew=CrewRead(
            id=crew.id,
            name=crew.name,
            owner_user_id=crew.owner_user_id,
            member_count=len(members),
        ),
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
        crew=CrewRead(
            id=crew.id,
            name=crew.name,
            owner_user_id=crew.owner_user_id,
            member_count=len(members),
        ),
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
    options: AcceptOptions | None = None,
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

    # Joining a crew never silently enters the member into pre-existing
    # challenges: that's an explicit opt-in (P1-10). The opt-in is stored as
    # the CHALLENGE_OPT_IN_ROLE value in the existing role column.
    role = (
        CHALLENGE_OPT_IN_ROLE
        if (options is not None and options.join_challenges)
        else "member"
    )
    db.add(
        CrewMembership(crew_id=invite.crew_id, user_id=current_user.id, role=role)
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
            id=crew.id,
            name=crew.name,
            owner_user_id=crew.owner_user_id,
            member_count=len(members),
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
    period: str = "week",
) -> StandingsResponse:
    """Standings for the caller's crew over a selectable window.

    `period` is one of day | week | month | year, mapped to a window in the
    caller's local tz: day → [today, today]; week → [Mon..Sun]; month →
    [1st of month .. today]; year → [Jan 1 .. today].

    `week` (ISO yyyy-mm-dd) still works for back-compat: the Monday of that
    date's ISO week is used and `period` is forced to "week".
    """
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=404, detail="not in a crew")

    today = await _athlete_local_today(db, current_user.id)

    if week:
        # Back-compat: explicit week pin overrides the period selector.
        try:
            base = date.fromisoformat(week)
        except ValueError:
            raise HTTPException(status_code=400, detail="bad week date")
        start_on = _monday_of(base)
        end_on = start_on + timedelta(days=6)
        period_name = "week"
    else:
        period_name = (period or "week").lower()
        if period_name == "day":
            start_on = end_on = today
        elif period_name == "month":
            start_on = today.replace(day=1)
            end_on = today
        elif period_name == "year":
            start_on = today.replace(month=1, day=1)
            end_on = today
        else:  # week (default / unknown)
            period_name = "week"
            start_on = _monday_of(today)
            end_on = start_on + timedelta(days=6)

    # Never iterate future days for open-ended windows (month/year end today).
    if period_name in ("month", "year"):
        end_on = min(end_on, today)

    payload = await crew_standings_window(
        db, membership.crew_id, start_on, end_on, current_user.id
    )
    payload["period"] = period_name
    return StandingsResponse(**payload)


# ─── In-app connection flow: incoming invites + accept/decline ──────────────
# The invite is crew-scoped and email-bound. These endpoints let the invitee
# (a real logged-in user whose email matches) see and act on requests IN THE
# APP — no email link needed — so A invites B, B gets a notification, accepts,
# joins A's crew, and both then see each other in the crew standings.
from pydantic import BaseModel  # noqa: E402


class IncomingInvite(BaseModel):
    invite_id: int
    crew_id: int
    crew_name: str
    inviter_handle: str
    created_at: datetime


@router.get("/members/{member_id}/rides", response_model=CrewMemberRides)
async def member_rides(
    member_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    period: str = "month",
    limit: int = 30,
) -> CrewMemberRides:
    """A crew mate's rides in the selected window.

    ACCESS: the caller and `member_id` must be in the SAME crew — checked here,
    following this module's established rule that crew-shared data is scoped by
    membership in the API. A rider outside the crew gets 404, not 403, so the
    endpoint does not confirm that a given user id exists.

    The payload is deliberately narrow (see `CrewMemberRides`): training facts
    only, never GPS. Sharing that a crew mate rode 82 km is the point; sharing
    the track that starts at their house is not, and was never asked for.
    """
    mine = await _user_membership(db, current_user.id)
    if mine is None:
        raise HTTPException(status_code=404, detail="not in a crew")
    if member_id != current_user.id and not await _is_member(db, member_id, mine.crew_id):
        raise HTTPException(status_code=404, detail="not in your crew")

    today = await _athlete_local_today(db, current_user.id)
    name = (period or "month").lower()
    if name == "week":
        start_on = _monday_of(today)
    elif name == "year":
        start_on = today.replace(month=1, day=1)
    else:
        name = "month"
        start_on = today.replace(day=1)
    end_on = today

    member = (await db.execute(select(User).where(User.id == member_id))).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="not in your crew")

    start_utc = datetime.combine(start_on, time.min, tzinfo=UTC)
    end_utc = datetime.combine(end_on, time.max, tzinfo=UTC)
    rows = (await db.execute(
        select(Activity)
        .where(
            Activity.user_id == member_id,
            Activity.started_at >= start_utc,
            Activity.started_at <= end_utc,
        )
        .order_by(Activity.started_at.desc())
    )).scalars().all()

    def to_ride(a: Activity) -> CrewMemberRide:
        return CrewMemberRide(
            activity_id=int(a.id),
            started_at=a.started_at,
            title=a.title,
            sport=a.sport,
            distance_km=round(a.distance_meters / 1000, 2) if a.distance_meters else None,
            duration_s=a.duration_seconds,
            tss=int(round(a.tss)) if a.tss is not None else None,
            elevation_m=a.elevation_gain_m,
            avg_power_w=int(round(a.average_power)) if a.average_power is not None else None,
        )

    handle = member.display_name or (member.email.split("@")[0] if member.email else "rider")
    return CrewMemberRides(
        user_id=member_id,
        handle=f"@{handle}",
        period=name,
        period_start=start_on.isoformat(),
        period_end=end_on.isoformat(),
        rides=[to_ride(a) for a in rows[:max(1, min(limit, 100))]],
        total_rides=len(rows),
    )


@router.get("/invites/incoming", response_model=list[IncomingInvite])
async def incoming_invites(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[IncomingInvite]:
    """Pending crew invites addressed to the caller's email — the invitee's
    in-app notification feed. Expired invites are filtered out."""
    email = (current_user.email or "").lower()
    rows = (
        await db.execute(
            select(CrewInvite, Crew, User)
            .join(Crew, Crew.id == CrewInvite.crew_id)
            .join(User, User.id == CrewInvite.inviter_user_id)
            .where(CrewInvite.invitee_email == email, CrewInvite.status == "pending")
            .order_by(CrewInvite.created_at.desc())
        )
    ).all()
    now = datetime.now(timezone.utc)
    out: list[IncomingInvite] = []
    for inv, crew, inviter in rows:
        exp = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
        if exp < now:
            continue
        out.append(IncomingInvite(
            invite_id=inv.id, crew_id=crew.id, crew_name=crew.name,
            inviter_handle=display_handle(inviter), created_at=inv.created_at,
        ))
    return out


async def _resolve_incoming(db: AsyncSession, invite_id: int, current_user: User) -> CrewInvite:
    invite = (
        await db.execute(select(CrewInvite).where(CrewInvite.id == invite_id))
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="invite not found")
    if (current_user.email or "").lower() != invite.invitee_email:
        raise HTTPException(status_code=403, detail="this invite is not addressed to you")
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invite_not_pending", "msg": f"status: {invite.status}"},
        )
    return invite


@router.post("/invites/{invite_id}/accept-mine", response_model=CrewMineResponse)
async def accept_incoming(
    invite_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    options: AcceptOptions | None = None,
) -> CrewMineResponse:
    """Accept an in-app invite addressed to me → join the inviter's crew so we
    can both see each other. Pre-existing crew challenges are opt-in via
    `options.join_challenges` (default false) — joining a crew never silently
    enters you into a scoreboard."""
    invite = await _resolve_incoming(db, invite_id, current_user)
    exp = invite.expires_at if invite.expires_at.tzinfo else invite.expires_at.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=422, detail={"code": "invite_expired", "msg": "expired"})
    if await _user_membership(db, current_user.id) is not None:
        raise HTTPException(
            status_code=422,
            detail={"code": "already_in_crew", "msg": "leave your current crew first"},
        )
    role = (
        CHALLENGE_OPT_IN_ROLE
        if (options is not None and options.join_challenges)
        else "member"
    )
    db.add(CrewMembership(crew_id=invite.crew_id, user_id=current_user.id, role=role))
    invite.status = "accepted"
    invite.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    crew = (await db.execute(select(Crew).where(Crew.id == invite.crew_id))).scalar_one_or_none()
    members = await _crew_member_rows(db, invite.crew_id)
    pending = await _crew_pending_invites(db, invite.crew_id)
    return CrewMineResponse(
        crew=CrewRead(
            id=crew.id,
            name=crew.name,
            owner_user_id=crew.owner_user_id,
            member_count=len(members),
        ) if crew else None,
        members=_members_to_read(members),
        pending_invites=_invites_to_read(pending),
    )


@router.post("/invites/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
async def decline_incoming(
    invite_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Decline an in-app invite addressed to me."""
    invite = await _resolve_incoming(db, invite_id, current_user)
    invite.status = "declined"
    await db.commit()


class ConnectRequest(BaseModel):
    user_id: int
    crew_name: str | None = None


@router.post("/connect", response_model=CrewInviteRead, status_code=status.HTTP_201_CREATED)
async def connect_with_user(
    payload: ConnectRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> CrewInviteRead:
    """One-shot discover→invite: ensure the caller has a crew (auto-create on
    first connect), then invite the target user into it. The target sees the
    invite in their in-app notification feed and accepts/declines there."""
    target = (
        await db.execute(select(User).where(User.id == payload.user_id))
    ).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=422, detail="cannot connect with yourself")

    mem = await _user_membership(db, current_user.id)
    if mem is None:
        default_name = (payload.crew_name or f"{_handle_from_email(current_user.email or 'my')}'s crew").strip()[:60]
        crew = Crew(name=default_name, owner_user_id=current_user.id)
        db.add(crew)
        await db.flush()
        db.add(CrewMembership(crew_id=crew.id, user_id=current_user.id, role="owner"))
        await db.flush()
        crew_id = crew.id
    else:
        crew_id = mem.crew_id

    return await create_invite(crew_id, CrewInviteCreate(email=target.email), current_user, db)


# ─── Nudge — send a funny trash-talk line to a crew-mate ────────────────────
# A lightweight social poke: pick a witty pre-written line (deterministically,
# so it varies per athlete without RNG) and drop it in the opponent's feed.

# ~12 witty trash-talk lines. Kept intentionally light-hearted.
NUDGE_LINES: list[str] = [
    "Your FTP called — it wants a rematch.",
    "I've seen glaciers with a better power curve.",
    "Nice recovery week... that lasted 3 weeks.",
    "My warm-up is your threshold. Just saying.",
    "Strava called: your last ride filed for early retirement.",
    "Legs of steel? More like legs of soft-serve today.",
    "I drafted behind you once. Fell asleep.",
    "That TSS wouldn't scare a spin-class instructor.",
    "Even your smart trainer is asking for a day off.",
    "You call that a sprint? My grandma calls it a Sunday roll.",
    "Watts up? Not your numbers, apparently.",
    "I'd say catch me if you can, but we both know how that ends.",
]

# Coach-safety interlock: when the recipient's adaptive directive is rest or
# deload, trash talk is swapped for encouragement. Competition never outranks
# physiology — the nudge still lands (crew connection preserved), the content
# changes.
COACH_NUDGE_LINES: list[str] = [
    "Trash talk intercepted by the coach. Translation: your crew misses you at full power.",
    "Your rival poked you — the coach softened it: rest today, terrorize the leaderboard later.",
    "Crew message, coach-approved: recovery is your only workout today. We'll hold your spot.",
    "The smack talk got confiscated. What's left: heal up — we want you at your best.",
    "Someone tried to challenge you mid-recovery. The coach said no. Rest well, come back swinging.",
]


class NudgeCreate(BaseModel):
    to_user_id: int


class NudgeResult(BaseModel):
    text: str
    to_user_id: int
    # True when the recipient is in rest/deload and the coach swapped the
    # trash-talk line for encouragement. Lets the sender UI explain honestly.
    coach_intercepted: bool = False


class IncomingNudge(BaseModel):
    id: int
    from_handle: str
    text: str
    created_at: datetime


@router.post("/nudge", response_model=NudgeResult, status_code=status.HTTP_201_CREATED)
async def send_nudge(
    payload: NudgeCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> NudgeResult:
    """Send a funny trash-talk line to a crew-mate. The line is picked
    deterministically by (nudges already sent by this user) % len(lines) so it
    varies without RNG. 403 if the target isn't in the caller's crew."""
    if payload.to_user_id == current_user.id:
        raise HTTPException(status_code=403, detail="cannot nudge yourself")

    my_mem = await _user_membership(db, current_user.id)
    target_mem = await _user_membership(db, payload.to_user_id)
    if (
        my_mem is None
        or target_mem is None
        or my_mem.crew_id != target_mem.crew_id
    ):
        raise HTTPException(status_code=403, detail="that athlete is not in your crew")

    sent_count = (
        await db.execute(
            select(func.count(CrewNudge.id)).where(
                CrewNudge.from_user_id == current_user.id
            )
        )
    ).scalar_one()

    # Coach-safety interlock: if the recipient's adaptive directive says rest
    # or deload, swap trash talk for encouragement. Never let the physiology
    # check break the social path — on any failure, fall back to trash talk.
    coach_intercepted = False
    try:
        from app.services.adaptive_readiness import build_adaptive_directive

        directive = await build_adaptive_directive(db, payload.to_user_id)
        coach_intercepted = directive.directive in ("rest", "deload")
    except Exception:
        coach_intercepted = False

    lines = COACH_NUDGE_LINES if coach_intercepted else NUDGE_LINES
    text = lines[sent_count % len(lines)]

    db.add(
        CrewNudge(
            from_user_id=current_user.id,
            to_user_id=payload.to_user_id,
            text=text,
        )
    )
    await db.commit()
    return NudgeResult(
        text=text, to_user_id=payload.to_user_id, coach_intercepted=coach_intercepted
    )


@router.get("/nudges/incoming", response_model=list[IncomingNudge])
async def incoming_nudges(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[IncomingNudge]:
    """The caller's UNREAD nudges — their trash-talk notification feed."""
    rows = (
        await db.execute(
            select(CrewNudge, User)
            .join(User, User.id == CrewNudge.from_user_id)
            .where(
                CrewNudge.to_user_id == current_user.id,
                CrewNudge.read_at.is_(None),
            )
            .order_by(CrewNudge.created_at.desc())
        )
    ).all()
    return [
        IncomingNudge(
            id=nudge.id,
            from_handle=display_handle(sender),
            text=nudge.text,
            created_at=nudge.created_at,
        )
        for (nudge, sender) in rows
    ]


@router.post("/nudges/{nudge_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_nudge_read(
    nudge_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Mark one of the caller's incoming nudges as read."""
    nudge = (
        await db.execute(
            select(CrewNudge).where(
                CrewNudge.id == nudge_id,
                CrewNudge.to_user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if nudge is None:
        raise HTTPException(status_code=404, detail="nudge not found")
    if nudge.read_at is None:
        nudge.read_at = datetime.now(timezone.utc)
        await db.commit()


# ─── Custom crew challenges ─────────────────────────────────────────────────
# A crew member defines a challenge (metric + target over a period); the app
# tracks each member's progress and whether they've reached the target so the
# frontend can fire confetti / a notification on completion.


async def _serialize_challenge(
    db: AsyncSession, ch: CrewChallenge
) -> ChallengeRead:
    """Build the challenge read-model, computing each crew member's progress."""
    creator = (
        await db.execute(select(User).where(User.id == ch.creator_user_id))
    ).scalar_one_or_none()

    rows = await _crew_member_rows(db, ch.crew_id)
    participants: list[ChallengeParticipant] = []
    for (_m, u) in rows:
        # No auto-entry (P1-10): only the creator, members who were in the
        # crew when the challenge was made, and explicit opt-ins participate.
        if not member_in_challenge(
            member_user_id=u.id,
            role=_m.role,
            joined_at=_m.joined_at,
            creator_user_id=ch.creator_user_id,
            challenge_created_at=ch.created_at,
        ):
            continue
        value = await challenge_value_for_user(
            db, u.id, ch.starts_on, ch.ends_on, ch.metric
        )
        pct = int(min(100, round(value / ch.target * 100))) if ch.target > 0 else 0
        participants.append(
            ChallengeParticipant(
                user_id=u.id,
                handle=display_handle(u),
                value=value,
                reached=value >= ch.target,
                pct=pct,
            )
        )
    participants.sort(key=lambda p: p.value, reverse=True)

    return ChallengeRead(
        id=ch.id,
        name=ch.name,
        metric=ch.metric,  # type: ignore[arg-type]
        target=ch.target,
        period=ch.period,
        starts_on=ch.starts_on,
        ends_on=ch.ends_on,
        creator_handle=display_handle(creator) if creator else "rider",
        created_at=ch.created_at,
        participants=participants,
    )


@router.post(
    "/challenges",
    response_model=ChallengeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_challenge(
    payload: ChallengeCreate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ChallengeRead:
    """Create a custom challenge for the caller's crew. If period='week' and the
    dates are omitted, defaults to the current crew week (Mon–Sun) in the
    caller's local timezone. 403 if the caller isn't in a crew."""
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        raise HTTPException(status_code=403, detail="not in a crew")

    starts_on = payload.starts_on
    ends_on = payload.ends_on
    if payload.period == "week" and (starts_on is None or ends_on is None):
        today = await _athlete_local_today(db, current_user.id)
        week_start = _monday_of(today)
        starts_on = week_start
        ends_on = week_start + timedelta(days=6)
    if starts_on is None or ends_on is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "missing_dates", "msg": "custom period needs starts_on and ends_on"},
        )
    if ends_on < starts_on:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "bad_dates", "msg": "ends_on must be on or after starts_on"},
        )

    # Default targets scale to the creator's OWN history (P1-10) — never a
    # fixed 800-TSS / 7-days wall. Window-proportional for custom periods.
    target = payload.target
    if target is None:
        if payload.metric not in ("tss", "active_days"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "missing_target",
                    "msg": f"metric '{payload.metric}' needs an explicit target",
                },
            )
        targets = await personal_week_targets(
            db, current_user.id, _monday_of(starts_on)
        )
        window_days = (ends_on - starts_on).days + 1
        scale = window_days / 7.0
        if payload.metric == "tss":
            target = float(max(1, round(targets["weekly_target_tss"] * scale)))
        else:  # active_days
            target = float(max(1, round(targets["active_days_target"] * scale)))

    challenge = CrewChallenge(
        crew_id=membership.crew_id,
        creator_user_id=current_user.id,
        name=payload.name.strip(),
        metric=payload.metric,
        target=target,
        period=payload.period,
        starts_on=starts_on,
        ends_on=ends_on,
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return await _serialize_challenge(db, challenge)


@router.get("/challenges", response_model=list[ChallengeRead])
async def list_challenges(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[ChallengeRead]:
    """Active (non-archived) challenges for the caller's crew, each with every
    crew member's live progress toward the target. Empty when not in a crew."""
    membership = await _user_membership(db, current_user.id)
    if membership is None:
        return []
    rows = (
        await db.execute(
            select(CrewChallenge)
            .where(
                CrewChallenge.crew_id == membership.crew_id,
                CrewChallenge.archived.is_(False),
            )
            .order_by(CrewChallenge.created_at.desc())
        )
    ).scalars().all()
    return [await _serialize_challenge(db, ch) for ch in rows]


@router.delete("/challenges/{challenge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_challenge(
    challenge_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Archive a challenge. Any member of the challenge's crew may archive it;
    404 if it isn't their crew's."""
    membership = await _user_membership(db, current_user.id)
    challenge = (
        await db.execute(
            select(CrewChallenge).where(CrewChallenge.id == challenge_id)
        )
    ).scalar_one_or_none()
    if (
        challenge is None
        or membership is None
        or challenge.crew_id != membership.crew_id
    ):
        raise HTTPException(status_code=404, detail="challenge not found")
    if not challenge.archived:
        challenge.archived = True
        await db.commit()
