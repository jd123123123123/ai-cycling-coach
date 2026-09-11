"""Routine rides — the switch, the preview that justifies it, and the rider's
right to overrule the detector on any single ride.

  GET  /rides/routine/preference            the caller's switch + the params
  PUT  /rides/routine/preference            flip it
  GET  /rides/routine/preview               what flipping it would remove
  PUT  /rides/routine/{activity_id}/override   the rider's own ruling on one ride
  GET  /rides/routine/{activity_id}            what the detector thinks of one ride

WHOSE PREFERENCE, WHOSE RIDE. The switch belongs to the VIEWER: it decides what
the caller's own crew feed shows, and it cannot change anybody else's feed. The
per-ride override belongs to the RIDE'S OWNER: only the athlete who rode it may
say "this one WAS worth posting", and that ruling then applies in every feed.
The two are separate on purpose, and the endpoints enforce it — the override
route 404s on a ride the caller did not do.

HIDING IS NEVER DELETING. Nothing here removes anything: the preference is read
by exactly one call site (`app/api/crew_chat.py`'s feed), and a ride marked
routine keeps counting for TSS, CTL/ATL, weekly totals, streaks and Eddington,
which read `activities` and know nothing about any of this.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.schemas.routine_rides import (
    RoutineClusterOut,
    RoutineOverrideUpdate,
    RoutinePreference,
    RoutinePreferenceUpdate,
    RoutinePreview,
    RoutineRideSample,
    RoutineVerdictOut,
)
from app.services import routine_rides as svc

router = APIRouter(prefix="/rides/routine", tags=["routine-rides"])


# ──────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────


async def _profile(db: AsyncSession, user_id: int) -> AthleteProfile | None:
    return (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()


def _pref_of(profile: AthleteProfile | None) -> bool:
    """Default OFF, and OFF for an athlete who has no profile row yet. A new
    feature must not silently change what somebody already sees."""
    if profile is None:
        return False
    return bool(getattr(profile, "hide_routine_rides", False))


def _clock(minute_of_day: int) -> str:
    m = minute_of_day % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d}"


# ──────────────────────────────────────────────────────────────────────
# The switch
# ──────────────────────────────────────────────────────────────────────


@router.get("/preference", response_model=RoutinePreference)
async def get_preference(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutinePreference:
    profile = await _profile(db, user.id)
    return RoutinePreference(
        hide_routine_rides=_pref_of(profile),
        window_days=svc.DEFAULT_PARAMS.window_days,
        min_occurrences=svc.DEFAULT_PARAMS.min_occurrences,
    )


@router.put("/preference", response_model=RoutinePreference)
async def set_preference(
    payload: RoutinePreferenceUpdate,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutinePreference:
    """Flip the caller's own switch.

    404 rather than a silent no-op when the athlete has no profile row: writing
    the preference nowhere and answering 200 is how a setting appears to save
    and then comes back off.
    """
    profile = await _profile(db, user.id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="athlete profile not found",
        )
    profile.hide_routine_rides = payload.hide_routine_rides
    await db.commit()
    return RoutinePreference(
        hide_routine_rides=payload.hide_routine_rides,
        window_days=svc.DEFAULT_PARAMS.window_days,
        min_occurrences=svc.DEFAULT_PARAMS.min_occurrences,
    )


# ──────────────────────────────────────────────────────────────────────
# What the switch would do
# ──────────────────────────────────────────────────────────────────────


@router.get("/preview", response_model=RoutinePreview)
async def preview(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    sample_limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> RoutinePreview:
    """The count and a sample of what "Routinefahrten ausblenden" would remove
    from the caller's feed — computed live, so it is what would actually
    happen and not a description of what was once intended."""
    profile = await _profile(db, user.id)
    result, decided, facts = await svc.preview_for_user(db, user_id=user.id)

    hidden = [v for v in decided.values() if v.is_routine]

    clusters = [
        RoutineClusterOut(
            key=c.key,
            occurrences=c.occurrences,
            distance_km=round(c.distance_m / 1000, 1),
            start_local=_clock(c.start_minute_local),
            weekday_class=c.weekday_class,
            is_routine=c.is_routine,
            marked=c.marked,
            marker_text=c.marker_text,
            # The cluster's own reason, taken from any member — every member of
            # a cluster carries the same detector sentence.
            reason=next(
                (
                    result.verdicts[aid].reason
                    for aid in c.activity_ids
                    if aid in result.verdicts
                ),
                "",
            ),
            first_at=c.first_at,
            last_at=c.last_at,
            activity_ids=list(c.activity_ids),
        )
        for c in sorted(
            result.clusters.values(),
            key=lambda c: (not c.is_routine, -c.occurrences),
        )
    ]

    sample_ids = sorted(
        (v.activity_id for v in hidden if v.activity_id in facts),
        key=lambda aid: facts[aid].started_at,
        reverse=True,
    )[:sample_limit]

    sample = [
        RoutineRideSample(
            activity_id=aid,
            started_at=facts[aid].started_at,
            title=facts[aid].title,
            distance_km=(
                round(facts[aid].distance_m / 1000, 1)
                if facts[aid].distance_m is not None
                else None
            ),
            duration_s=facts[aid].duration_s,
            is_routine=decided[aid].is_routine,
            reason=decided[aid].reason,
            decided_by=decided[aid].decided_by,
            cluster_key=decided[aid].cluster_key,
            occurrences=decided[aid].occurrences,
        )
        for aid in sample_ids
        if aid in facts
    ]

    return RoutinePreview(
        enabled=_pref_of(profile),
        window_days=svc.DEFAULT_PARAMS.window_days,
        min_occurrences=svc.DEFAULT_PARAMS.min_occurrences,
        considered=result.considered,
        hidden_count=len(hidden),
        median_distance_km=(
            round(result.median_distance_m / 1000, 1)
            if result.median_distance_m
            else None
        ),
        clusters=clusters,
        sample=sample,
    )


# ──────────────────────────────────────────────────────────────────────
# One ride
# ──────────────────────────────────────────────────────────────────────


async def _own_ride_or_404(db: AsyncSession, *, user_id: int, activity_id: int):
    """Only the athlete who rode it may rule on it, or read its verdict here.

    Note the query matches on id AND user_id: on a composite-PK hypertable
    `db.get(Activity, id)` is not available, and scoping in the WHERE clause is
    the authorisation check as well as the lookup.
    """
    act = (
        await db.execute(
            select(Activity).where(
                Activity.id == activity_id, Activity.user_id == user_id
            )
        )
    ).scalars().first()
    if act is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="activity not found"
        )
    return act


@router.get("/{activity_id}", response_model=RoutineVerdictOut)
async def ride_verdict(
    activity_id: int,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutineVerdictOut:
    """Why this ride is (or is not) treated as routine — the sentence a rider
    reads before deciding whether to disagree with it."""
    await _own_ride_or_404(db, user_id=user.id, activity_id=activity_id)
    verdicts = await svc.verdicts_for_rides(
        db, user_ids=[user.id], activity_ids=[activity_id]
    )
    v = verdicts.get(activity_id)
    if v is None:
        return RoutineVerdictOut(
            activity_id=activity_id,
            is_routine=False,
            reason="Keine vergleichbare Fahrt im Fenster.",
            decided_by="detector",
        )
    return RoutineVerdictOut(
        activity_id=v.activity_id,
        is_routine=v.is_routine,
        reason=v.reason,
        decided_by=v.decided_by,
        cluster_key=v.cluster_key,
        occurrences=v.occurrences,
    )


@router.put("/{activity_id}/override", response_model=RoutineVerdictOut)
async def set_ride_override(
    activity_id: int,
    payload: RoutineOverrideUpdate,
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RoutineVerdictOut:
    """The rider's own ruling on one ride, which outranks the detector forever.

    `{"is_routine": false}` — "this one WAS worth posting", and it stays in the
    feed however strongly the pattern says otherwise.
    `{"is_routine": true}`  — hide this one.
    `{"is_routine": null}`  — clear the ruling and let the detector decide
    again, because an override a rider cannot undo is a worse trap than the
    detector was.
    """
    await _own_ride_or_404(db, user_id=user.id, activity_id=activity_id)
    await svc.set_override(
        db, user_id=user.id, activity_id=activity_id, is_routine=payload.is_routine
    )
    await db.commit()
    return await ride_verdict(activity_id, user, db)
