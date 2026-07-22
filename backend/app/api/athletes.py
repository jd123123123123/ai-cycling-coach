import logging
from datetime import date as date_type
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.garmin_credential import GarminCredential
from app.models.user import User
from app.schemas.athlete import AthleteProfileRead, AthleteProfileUpdate
from app.services.athlete_service import get_or_create_profile, update_profile
from app.services.garmin_sync_service import sync_user_garmin
from app.services.streak import build_streak, repair_streak

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/athletes", tags=["athletes"])


@router.get("/me", response_model=AthleteProfileRead)
async def get_my_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Get the current user's athlete profile. Creates an empty profile if none exists."""
    profile = await get_or_create_profile(db, current_user.id)
    return profile


@router.put("/me", response_model=AthleteProfileRead)
async def update_my_profile(
    data: AthleteProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteProfileRead:
    """Update the current user's athlete profile fields (partial update)."""
    profile = await update_profile(db, current_user.id, data)
    return profile


# ─── Athlete status — forgiving-streak + plan input ─────────────────────────
# "sick" / "injured" / "break" pause the streak (never break it) and push the
# adaptive directive to rest, which in turn mutes competitive surfaces via the
# coach-safety interlock. "healthy" clears the status.

AthleteState = Literal["healthy", "sick", "injured", "break"]


class AthleteStatusUpdate(BaseModel):
    state: AthleteState


class AthleteStatusRead(BaseModel):
    state: AthleteState
    since: date_type | None = None


@router.put("/me/status", response_model=AthleteStatusRead)
async def set_my_status(
    payload: AthleteStatusUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> AthleteStatusRead:
    """Set the athlete's life status. Stored in the profile's goals JSONB
    (additive — no migration); `healthy` removes it."""
    profile = await get_or_create_profile(db, current_user.id)
    goals = dict(profile.goals or {})
    if payload.state == "healthy":
        goals.pop("athlete_status", None)
        result = AthleteStatusRead(state="healthy", since=None)
    else:
        existing = goals.get("athlete_status") or {}
        # Keep the original `since` when re-affirming the same state.
        since = (
            existing.get("since")
            if existing.get("state") == payload.state and existing.get("since")
            else date_type.today().isoformat()
        )
        goals["athlete_status"] = {"state": payload.state, "since": since}
        result = AthleteStatusRead(state=payload.state, since=date_type.fromisoformat(since))
    profile.goals = goals
    flag_modified(profile, "goals")
    await db.commit()
    return result


@router.get("/me/streak")
async def my_streak(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> dict:
    """Plan-aware forgiving streak: trained days and planned rest days extend
    it, sick/injured/break days pause it, only a skipped planned session (or an
    unplanned gap) breaks it. Includes per-day states for the current week and
    `consistency: {met, planned}` — planned training days met so far vs planned
    training days in the whole athlete-local week (P1-11: planned rest days
    never count against, future days are never 'missed')."""
    return await build_streak(db, current_user.id)


# ─── One-tap morning-after streak repair (backlog 03·C2) ────────────────────
# The soft streak-break card offers a kind, HONEST recovery: the most common
# false break is a ride the athlete really did but Garmin hadn't synced yet when
# the break was computed. This endpoint triggers a fresh sync (best-effort) and
# RE-EVALUATES the streak against real activities — it restores only when a
# qualifying ride for the missed day now exists, never a manipulative free undo.


class StreakRepairResult(BaseModel):
    """Outcome of a morning-after repair re-check."""

    repaired: bool
    # "restored" — a real ride now covers the missed day, the streak stands.
    # "nothing_to_repair" — the missed day still has no qualifying ride (honest).
    reason: Literal["restored", "nothing_to_repair"]
    streak: int
    repaired_date: date_type | None = None
    # Whether a fresh Garmin sync actually ran during this check (best-effort;
    # false when no account is connected or a sync was already in flight).
    synced: bool = False


@router.post("/me/streak/repair", response_model=StreakRepairResult)
async def repair_my_streak(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db_for_user),
) -> StreakRepairResult:
    """Re-evaluate the just-broken streak after a fresh sync (backlog 03·C2).

    Best-effort pulls any late-arriving ride from a connected Garmin account,
    then honestly re-checks the streak: it restores ONLY when a real qualifying
    activity for the missed day now exists. If no such ride exists, it returns
    ``nothing_to_repair`` — it never buys back a streak that wasn't earned."""
    # 1. Best-effort fresh sync so a late ride is pulled in before we re-check.
    #    Non-fatal: a failed/absent sync just means we re-check existing data
    #    (which already includes Coros/Wahoo/Apple/manual activities).
    synced = False
    cred_row = await db.execute(
        select(GarminCredential).where(GarminCredential.user_id == current_user.id)
    )
    credential = cred_row.scalar_one_or_none()
    # Capture the day that broke the streak BEFORE syncing, so we can tell
    # whether a freshly-arrived ride actually covers it.
    pre = await build_streak(db, current_user.id)
    prior_break_day = pre.get("break_day")

    if credential is not None and credential.sync_status != "syncing":
        try:
            await sync_user_garmin(db, credential)
            synced = True
        except Exception as exc:  # noqa: BLE001 — repair still runs on stale data
            logger.warning(
                "Streak-repair sync failed for user_id=%s (re-checking existing data): %s",
                current_user.id,
                exc,
            )

    # 2. Honest re-evaluation against real activities + the plan.
    result = await repair_streak(db, current_user.id, prior_break_day)
    return StreakRepairResult(synced=synced, **result)
