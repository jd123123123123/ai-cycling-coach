"""Activity CRUD service with auto-TSS calculation.

TSS is computed on creation based on sport type and athlete profile thresholds:
- cycling: power-based (Coggan TSS) using NP or average_power as fallback
- running: pace-based (rTSS) using distance/duration-derived speed; hrTSS
  fallback when threshold pace is missing but HR data exists
- gym: HR-based (hrTSS via Banister TRIMP)
- any other sport (padel, tennis, rowing, …): HR-based (hrTSS) whenever a
  heart-rate anchor exists — cross-training the app doesn't plan is still load

hrTSS inputs are DERIVED when the profile lacks them (usability audit P0-5 —
a 45-min HR-117 run must never count 0):
- max HR: profile value, else Tanaka from date_of_birth (hr_zones.derive_max_hr)
- LTHR:   measured value, else 0.90 × derived max HR
- resting HR: profile value, else rolling 30d median from daily_metrics,
  else 60 bpm default.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.schemas.activity import ActivityCreate
from app.services.athlete_time import (
    day_local_window,
    local_date_of,
    set_athlete_tz_from_profile,
)
from app.services.hr_zones import derive_max_hr
from app.services.training_load import (
    calculate_cycling_tss,
    calculate_hr_tss,
    calculate_running_tss,
)

logger = logging.getLogger(__name__)

# 0.90 × HRmax is a standard, widely-used estimate of lactate-threshold HR
# (LTHR) when no measured threshold is available.
_LTHR_HRMAX_FRACTION = 0.90

# Population-default resting HR — last resort when the profile has no resting
# HR AND daily_metrics carries no wearable readings. A conservative middle
# value; hrTSS is only mildly sensitive to it.
_DEFAULT_RESTING_HR = 60.0

# Absolute last-resort TSS: when a ride has NEITHER power NOR usable HR, estimate
# load from duration at an assumed moderate-endurance intensity (IF≈0.70), so a
# logged ride still carries a load instead of a blank. Deliberately rough — the
# intensity is assumed, not measured — used only after power and hrTSS both fail.
# TSS = hours × IF² × 100  (Coggan definition with an assumed IF).
_ASSUMED_ENDURANCE_IF = 0.70


def _estimate_ride_tss_from_duration(duration_seconds: int | float) -> float:
    """Duration-only TSS estimate at an assumed endurance intensity."""
    hours = float(duration_seconds) / 3600.0
    return round(hours * (_ASSUMED_ENDURANCE_IF ** 2) * 100.0, 1)


async def resting_hr_estimate(db: AsyncSession, user_id: int) -> float | None:
    """Rolling 30-day median of the athlete's wearable resting HR, or None."""
    from statistics import median

    from app.models.daily_metric import DailyMetric

    since = datetime.now(UTC) - timedelta(days=30)
    res = await db.execute(
        select(DailyMetric.resting_hr).where(
            DailyMetric.user_id == user_id,
            DailyMetric.recorded_at >= since,
            DailyMetric.resting_hr.is_not(None),
        )
    )
    vals = [float(v) for v in res.scalars().all() if v]
    return float(median(vals)) if vals else None


def _compute_hr_tss(
    duration: int | float,
    data: ActivityCreate,
    profile: AthleteProfile,
    measured_lthr: float | None,
    context: str,
    resting_hr_fallback: float | None = None,
) -> float | None:
    """Compute hrTSS from HR data, deriving missing profile thresholds.

    Derivation chain (only average_hr is strictly required):
        max HR     — profile.max_heart_rate → Tanaka(date_of_birth) → give up
        LTHR       — measured → 0.90 × max HR
        resting HR — profile → daily-metrics median (caller-supplied) → 60 bpm

    Guards against division-by-zero (HRmax must exceed HRrest).
    """
    if not data.average_hr:
        logger.debug("Skipping %s hrTSS: no average_hr on activity", context)
        return None

    hr_max = derive_max_hr(
        max_heart_rate=profile.max_heart_rate,
        date_of_birth=getattr(profile, "date_of_birth", None),
    )
    if hr_max is None:
        logger.debug(
            "Skipping %s hrTSS: no max HR and no date_of_birth to derive one",
            context,
        )
        return None

    lthr = (
        float(measured_lthr)
        if measured_lthr
        else round(_LTHR_HRMAX_FRACTION * hr_max)
    )
    hr_rest = float(
        profile.resting_heart_rate or resting_hr_fallback or _DEFAULT_RESTING_HR
    )

    if hr_max <= hr_rest:
        logger.warning(
            "Skipping %s hrTSS: max_hr (%s) <= resting_hr (%s)",
            context,
            hr_max,
            hr_rest,
        )
        return None
    try:
        # TODO: add sex field to AthleteProfile — defaulting to "male" for now
        return calculate_hr_tss(
            duration_seconds=duration,
            average_hr=float(data.average_hr),
            lthr=float(lthr),
            hr_rest=hr_rest,
            hr_max=float(hr_max),
            sex="male",
        )
    except (ValueError, ZeroDivisionError) as exc:
        logger.warning("%s hrTSS calculation failed: %s", context, exc)
        return None



def _scoring_ftp(data, profile, tss: float | None) -> float | None:
    """The threshold `tss` was computed against, or None when it has none.

    Recorded alongside every TSS because TSS is meaningless without its unit
    (see `services/load_units` and `models/activity.ftp_watts_at_scoring`).
    Derived by recovery rather than by assuming `profile.ftp_watts`: the power
    path is not the only way a TSS gets made, and an hrTSS number has no FTP
    behind it. If the arithmetic cannot vouch for the value, it stays NULL.
    """
    from app.services.load_units import derive_scoring_ftp

    return derive_scoring_ftp(
        tss,
        getattr(data, "normalized_power", None) or getattr(data, "average_power", None),
        getattr(data, "duration_seconds", None),
    )


def _compute_tss(
    data: ActivityCreate,
    profile: AthleteProfile,
    resting_hr_fallback: float | None = None,
) -> float | None:
    """Compute TSS from activity data and athlete profile thresholds.

    Returns None only when no usable signal exists (no power for cycling; no
    HR anchor at all for the hrTSS paths).
    """
    duration = data.duration_seconds
    if not duration or duration <= 0:
        return None

    if data.sport == "cycling":
        # Prefer power (normalized_power, else average_power as an NP estimate).
        np_value = data.normalized_power or data.average_power
        if np_value is not None and profile.ftp_watts:
            try:
                return calculate_cycling_tss(duration, np_value, profile.ftp_watts)
            except ValueError as exc:
                logger.warning("Cycling TSS calculation failed: %s", exc)
                # fall through to the hrTSS estimate below
        # No usable power (no power meter, or no FTP) → hrTSS when HR exists.
        # Many riders record heart rate but not power; a distance-only ride with
        # an average HR should still earn an honest load instead of NULL. Anchor
        # on cycling LTHR, then running, then age-derived (handled downstream).
        measured = profile.lthr_cycling or profile.lthr_running
        hr_tss = _compute_hr_tss(
            duration, data, profile, measured, context="cycling",
            resting_hr_fallback=resting_hr_fallback,
        )
        if hr_tss is not None:
            return hr_tss
        # Neither power nor usable HR — assume load from duration so the ride is
        # never blank (user directive). Rough estimate; see the helper.
        return _estimate_ride_tss_from_duration(duration)

    elif data.sport == "running":
        # Preferred: pace-based rTSS when a real running threshold pace is set.
        if profile.running_threshold_pace_ms and data.distance_meters:
            # Compute speed in m/s from distance and duration
            speed_ms = data.distance_meters / duration
            try:
                return calculate_running_tss(duration, speed_ms, profile.running_threshold_pace_ms)
            except ValueError as exc:
                logger.warning("Running TSS calculation failed: %s", exc)
                return None
        # Fallback: HR-based TSS when threshold pace is missing but HR data
        # exists. A run with an average HR ALWAYS gets an hrTSS estimate as
        # long as any max-HR anchor (measured or age-derived) exists.
        measured = profile.lthr_running or profile.lthr_cycling
        return _compute_hr_tss(
            duration, data, profile, measured, context="running",
            resting_hr_fallback=resting_hr_fallback,
        )

    elif data.sport == "gym":
        # Prefer a measured LTHR (cycling, then running); estimate 0.90×HRmax
        # only when both measured thresholds are null.
        measured = profile.lthr_cycling or profile.lthr_running
        return _compute_hr_tss(
            duration, data, profile, measured, context="gym",
            resting_hr_fallback=resting_hr_fallback,
        )

    # Any OTHER sport (padel, tennis, rowing, hiking, an unrecognized one…)
    # still earns an honest hrTSS estimate whenever it carries a heart-rate
    # anchor. Cross-training the app doesn't plan is still real load on the
    # body — a padel session logged with HR should never count 0. No HR anchor
    # ⇒ None (never a fabricated load).
    measured = profile.lthr_cycling or profile.lthr_running
    return _compute_hr_tss(
        duration, data, profile, measured, context=data.sport or "other",
        resting_hr_fallback=resting_hr_fallback,
    )


async def create_activity(
    db: AsyncSession,
    user_id: int,
    data: ActivityCreate,
    profile: AthleteProfile,
) -> Activity:
    """Create an activity with auto-computed TSS.

    TSS is calculated from sport type + athlete profile thresholds, deriving
    missing HR thresholds (Tanaka max HR, daily-metrics resting HR) so
    HR-only runs/gym sessions still earn an honest hrTSS estimate.
    """
    # Resting-HR fallback only matters on the hrTSS paths — fetch lazily.
    # Any HR-bearing activity can take the hrTSS path now (incl. cross-training
    # sports the app doesn't plan), so the gate is HR presence, not sport.
    resting_hr_fallback: float | None = None
    if data.average_hr and not profile.resting_heart_rate:
        resting_hr_fallback = await resting_hr_estimate(db, user_id)

    tss = _compute_tss(data, profile, resting_hr_fallback=resting_hr_fallback)
    # Provider-supplied load (e.g. COROS Training Load) is a last-resort TSS
    # fallback: only used when we could not compute a sport-based TSS at all
    # (no FTP for cycling / no HR anchor). The computed value always wins.
    if tss is None and getattr(data, "external_tss", None) is not None:
        tss = float(data.external_tss)

    # Elevation gain: prefer the explicitly-mapped value; self-heal from a
    # preserved raw_data blob (e.g. COROS rides that only carry it there).
    from app.services.garmin_mapper import extract_elevation_gain_m

    elevation_gain_m = data.elevation_gain_m
    if elevation_gain_m is None:
        elevation_gain_m = extract_elevation_gain_m(getattr(data, "raw_data", None))

    activity = Activity(
        user_id=user_id,
        sport=data.sport,
        started_at=data.started_at,
        duration_seconds=data.duration_seconds,
        distance_meters=data.distance_meters,
        elevation_gain_m=elevation_gain_m,
        average_power=data.average_power,
        normalized_power=data.normalized_power,
        average_hr=data.average_hr,
        max_hr=data.max_hr,
        calories=data.calories,
        title=data.title,
        source=data.source,
        external_id=data.external_id,
        raw_data=getattr(data, "raw_data", None),
        tss=tss,
        # The unit that TSS is expressed in — see models/activity.
        ftp_watts_at_scoring=_scoring_ftp(data, profile, tss),
    )

    db.add(activity)
    await db.flush()
    await db.refresh(activity)

    # Invalidate any coach brief generated on the same ATHLETE-LOCAL day as
    # this activity so the next /coach/brief read regenerates with the new
    # ride in evidence. UTC-midnight windows attributed late-evening rides to
    # the wrong day (usability audit P0-2).
    # Defensive: failure must not break activity creation.
    try:
        set_athlete_tz_from_profile(profile)
        activity_day = local_date_of(activity.started_at)
        day_start_utc, _ = day_local_window(activity_day)
        await db.execute(
            delete(CoachBrief).where(
                CoachBrief.user_id == user_id,
                CoachBrief.generated_at >= day_start_utc,
            )
        )
    except Exception as exc:
        logger.warning(
            "Failed to invalidate coach_briefs for user_id=%s after activity create (non-fatal): %s",
            user_id,
            exc,
        )

    # Give a GPX-uploaded route rehearsal its actual-vs-predicted comparison
    # now that the ride behind it exists. Only cycling rides carry a route
    # rehearsal could plausibly be "of"; other sports skip the query entirely.
    # Defensive: a matching bug must not break activity creation.
    if activity.sport == "cycling":
        try:
            from app.services.rehearsal.retro_match import attach_actual_if_matching

            await attach_actual_if_matching(db, user_id, activity)
        except Exception as exc:
            logger.warning(
                "Retro rehearsal match failed for user_id=%s after activity create (non-fatal): %s",
                user_id,
                exc,
            )

    # Award RideCoin for the ride at ingestion (push, not pull): base from TSS,
    # lifted by the athlete's forgiving streak. Idempotent per activity, so a
    # re-sync never double-pays. Defensive: the reward layer must never break
    # activity creation — a rider's ride is sacred, the game on top is not.
    try:
        from app.services import rewards
        from app.services.streak import build_streak

        streak = await build_streak(db, user_id)
        award = await rewards.award_ride(
            db, user_id, activity.id, activity.tss, int(streak.get("streak", 0)),
        )
        # If this rider was recruited via a referral and is inside their 30-day
        # window, accrue the recruiter's 10% cut of what this ride just earned.
        # Only on a genuinely-new award (award_ride returns None on a re-sync),
        # so a ride accrues at most once. Runs on a system session (the
        # recruiter's row is invisible to this rider's RLS session) and commits
        # independently, so it can never roll back the ride itself.
        if award and award.get("total", 0) > 0:
            from app.services import referral

            await referral.accrue_for_ride(user_id, int(award["total"]))

        # The bike economy settles on the same ingestion: the component
        # odometers absorb this ride's kilometres, the equipped loadout pays
        # what its conditional bonuses actually earned on THIS ride, and a new
        # Eddington number pays its milestone. Every step is idempotent per
        # activity and individually guarded — see `ride_economy.settle`.
        from app.services import ride_economy

        await ride_economy.settle(
            db, user_id, activity, int((award or {}).get("total", 0)),
        )
    except Exception as exc:
        logger.warning(
            "RideCoin award failed for user_id=%s after activity create (non-fatal): %s",
            user_id,
            exc,
        )

    return activity


async def list_activities(
    db: AsyncSession,
    user_id: int,
    sport: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 50,
) -> list[Activity]:
    """List activities for a user with optional filters.

    Results are ordered by started_at DESC (most recent first).
    """
    query = select(Activity).where(Activity.user_id == user_id)

    if sport is not None:
        query = query.where(Activity.sport == sport)
    if start_date is not None:
        query = query.where(Activity.started_at >= start_date)
    if end_date is not None:
        query = query.where(Activity.started_at <= end_date)

    query = query.order_by(Activity.started_at.desc()).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())


async def recompute_missing_tss(
    db: AsyncSession, user_id: int, days: int | None = None
) -> int:
    """Backfill TSS for the user's activities that currently have tss IS NULL.

    Loads the athlete profile once, then recomputes TSS for every NULL-tss
    activity by reconstructing the same input _compute_tss expects from the
    stored Activity fields. Only updates rows where a value could be computed
    (e.g. HR data now yields hrTSS via the derived-threshold fallback).
    `days` limits the scan to the trailing window (sync uses 90).

    NOTE: backfilled TSS deliberately shifts CTL history — that is the point.
    It ships together with the window-invariant PMC so every surface moves
    once, consistently.

    Returns the count of rows updated.
    """
    profile = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile.scalar_one_or_none()
    if profile is None:
        logger.info("recompute_missing_tss: no athlete profile for user_id=%s", user_id)
        return 0

    query = select(Activity).where(
        Activity.user_id == user_id,
        Activity.tss.is_(None),
    )
    if days is not None:
        query = query.where(
            Activity.started_at >= datetime.now(UTC) - timedelta(days=days)
        )
    result = await db.execute(query)
    activities = list(result.scalars().all())

    # One resting-HR estimate for the whole batch (30d wearable median).
    resting_hr_fallback: float | None = None
    if not profile.resting_heart_rate:
        resting_hr_fallback = await resting_hr_estimate(db, user_id)

    updated = 0
    for activity in activities:
        # ActivityCreate enforces duration_seconds > 0; skip malformed rows
        # (they could never yield a TSS anyway).
        if not activity.duration_seconds or activity.duration_seconds <= 0:
            continue
        # Reconstruct the ActivityCreate-shaped input _compute_tss expects.
        data = ActivityCreate(
            sport=activity.sport,
            started_at=activity.started_at,
            duration_seconds=activity.duration_seconds,
            distance_meters=activity.distance_meters,
            average_power=activity.average_power,
            normalized_power=activity.normalized_power,
            average_hr=activity.average_hr,
            max_hr=activity.max_hr,
        )
        tss = _compute_tss(data, profile, resting_hr_fallback=resting_hr_fallback)
        if tss is not None:
            activity.tss = tss
            activity.ftp_watts_at_scoring = _scoring_ftp(data, profile, tss)
            updated += 1

    if updated:
        await db.commit()

    logger.info(
        "recompute_missing_tss: user_id=%s scanned=%d updated=%d",
        user_id,
        len(activities),
        updated,
    )
    return updated


async def backfill_missing_elevation(
    db: AsyncSession, user_id: int, days: int | None = None
) -> int:
    """Backfill elevation_gain_m for rows that have it NULL but carry a raw_data
    blob with an ascent figure (seeded/synthetic + COROS-preserved rides).

    Idempotent and self-healing: only touches rows where elevation is currently
    NULL and a positive ascent can be extracted from the stored raw_data. Mirrors
    ``recompute_missing_tss`` — wired into the post-sync path so historical rows
    fill in once their raw payload is present. `days` limits the trailing scan.

    Returns the count of rows updated.
    """
    from app.services.garmin_mapper import extract_elevation_gain_m

    query = select(Activity).where(
        Activity.user_id == user_id,
        Activity.elevation_gain_m.is_(None),
        Activity.raw_data.isnot(None),
    )
    if days is not None:
        query = query.where(
            Activity.started_at >= datetime.now(UTC) - timedelta(days=days)
        )
    result = await db.execute(query)
    activities = list(result.scalars().all())

    updated = 0
    for activity in activities:
        elev = extract_elevation_gain_m(activity.raw_data)
        if elev is not None:
            activity.elevation_gain_m = elev
            updated += 1

    if updated:
        await db.commit()

    logger.info(
        "backfill_missing_elevation: user_id=%s scanned=%d updated=%d",
        user_id,
        len(activities),
        updated,
    )
    return updated


async def get_activity(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
) -> Activity | None:
    """Retrieve a single activity by ID, scoped to the requesting user."""
    result = await db.execute(
        select(Activity).where(
            Activity.id == activity_id,
            Activity.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def delete_activity(
    db: AsyncSession,
    user_id: int,
    activity_id: int,
) -> bool:
    """Delete a single activity owned by ``user_id``.

    Returns True when a row was deleted, False when no matching activity exists
    for this user (missing or owned by someone else). The caller commits.
    """
    activity = await get_activity(db, user_id=user_id, activity_id=activity_id)
    if activity is None:
        return False
    await db.delete(activity)
    await db.flush()
    return True
