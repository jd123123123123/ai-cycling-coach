"""Everything a finished ride can honestly say about itself.

`earn_modifiers` refuses to fire a modifier whose fact is None, which makes this
module's job narrow and strict: report what is KNOWN, and return None the moment
it is not. Every resolver here would be easy to make "helpful" by guessing, and
each guess would quietly turn a real bonus into a lie — a rider who is awarded a
rain bonus on a dry day can never again trust the ones they earned.

Five facts that `activities` cannot answer on its own live here. Without them,
five items in the catalogue — a third of it, including `lanterne_rouge`, the one
that serves the coaching — could never fire at all. Unwinnable is worse than
rare.

  · surface            the device's own activity subtype
  · was_wet / temp_c   archived weather at the ride's real coordinates
  · with_crew          a crew member riding at the same time
  · honoured_easy_day  the plan asked for easy, and the rider delivered easy

EVERY RESOLVER IS BEST-EFFORT AND NON-FATAL. This runs on the ingestion path,
and a weather API being slow must never delay a rider's ride landing. Each is
wrapped by the caller and each returns None rather than raising.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.planned_workout import PlannedWorkout

logger = logging.getLogger(__name__)

# ── surface ─────────────────────────────────────────────────────────────────
#: The device's own activity subtype → our surface bucket. Taken from
#: `garmin_mapper.GARMIN_SPORT_MAP`'s keys, which is the same vocabulary the
#: ingestion already understands.
#:
#: Anything not listed resolves to None, NOT to "road". A generic "cycling"
#: typeKey genuinely does not say what the surface was, and defaulting it to
#: road would hand every such ride the road-only bonuses for free.
_SURFACE: dict[str, str] = {
    "gravel_cycling": "gravel",
    "mountain_biking": "mtb",
    "road_biking": "road",
}


def surface_of(activity: Activity) -> str | None:
    """What the device said the ride was, or None.

    Read from the provider payload rather than inferred from speed or
    elevation: a slow road ride and a fast gravel ride are indistinguishable by
    numbers, and a wrong guess here silently pays the wrong bonus.
    """
    raw = activity.raw_data
    if not isinstance(raw, dict):
        return None
    type_key = ""
    at = raw.get("activityType")
    if isinstance(at, dict):
        type_key = str(at.get("typeKey") or "")
    # Wahoo/COROS and our own seeds use a flat key.
    if not type_key:
        type_key = str(raw.get("sport_type") or raw.get("sub_sport") or "")
    return _SURFACE.get(type_key.lower().strip())


# ── weather ─────────────────────────────────────────────────────────────────
#: Millimetres of precipitation across the ride window, above which the ride
#: counts as wet. A trace of 0.1 mm over three hours is not the rain
#: Schutzbleche are for.
WET_MM = 0.5


async def weather_of(
    db: AsyncSession, activity: Activity
) -> tuple[bool | None, float | None]:
    """`(was_wet, temp_c)` at the ride's real coordinates, or `(None, None)`.

    Needs a GPS fix from the ride's own stream — with no coordinates there is
    no honest answer, and the app does not fall back to the athlete's home or
    to "probably the same as today".
    """
    from app.models.activity_stream import ActivityStream

    try:
        stream = (
            await db.execute(
                select(ActivityStream).where(
                    ActivityStream.activity_id == activity.id,
                )
            )
        ).scalar_one_or_none()
    except Exception:
        logger.info("stream read failed for weather (non-fatal)", exc_info=True)
        return None, None
    if stream is None:
        return None, None

    # The stream row already caches a weather blob for rides that have been
    # analysed. Reusing it means the common case costs no network call at all,
    # and — more importantly — the ride's weather cannot end up reported two
    # different ways by two different features.
    hourly = None
    cached = stream.weather
    if isinstance(cached, dict) and isinstance(cached.get("hourly"), dict):
        hourly = cached["hourly"]

    if hourly is None:
        data = stream.streams
        if not isinstance(data, dict):
            return None, None
        lats = [v for v in (data.get("latitude") or []) if v]
        lngs = [v for v in (data.get("longitude") or []) if v]
        if not lats or not lngs:
            return None, None

        start = activity.started_at
        end = start + timedelta(seconds=activity.duration_seconds or 3600)

        from app.services import weather_client

        body = await weather_client.fetch_ride_weather(
            float(lats[0]), float(lngs[0]), start, end,
        )
        hourly = (body or {}).get("hourly") if isinstance(body, dict) else None

    if not isinstance(hourly, dict):
        return None, None

    precip = [p for p in (hourly.get("precipitation") or []) if p is not None]
    temps = [t for t in (hourly.get("temperature_2m") or []) if t is not None]

    was_wet = sum(precip) >= WET_MM if precip else None
    temp_c = sum(temps) / len(temps) if temps else None
    return was_wet, temp_c


# ── crew ────────────────────────────────────────────────────────────────────
#: How much of the two rides must overlap in time to count as riding together.
#: Generous on purpose — clocks and auto-pause differ between head units, and
#: two people on the same ride routinely record windows that differ by minutes.
CREW_OVERLAP_S = 15 * 60


async def with_crew_of(db: AsyncSession, user_id: int, activity: Activity) -> bool | None:
    """True when a crew member was riding at the same time.

    None — not False — when the rider has no crew at all. "You were not with
    your crew" and "you have no crew" are different statements, and only the
    first is evidence about this ride.
    """
    from app.models.crew import CrewMembership

    try:
        mine = (
            await db.execute(
                select(CrewMembership.crew_id).where(CrewMembership.user_id == user_id)
            )
        ).scalars().all()
        if not mine:
            return None

        mates = (
            await db.execute(
                select(CrewMembership.user_id).where(
                    CrewMembership.crew_id.in_(mine),
                    CrewMembership.user_id != user_id,
                )
            )
        ).scalars().all()
        if not mates:
            return None

        start = activity.started_at
        end = start + timedelta(seconds=activity.duration_seconds or 0)
        window_start = start - timedelta(seconds=CREW_OVERLAP_S)
        window_end = end + timedelta(seconds=CREW_OVERLAP_S)

        hit = (
            await db.execute(
                select(Activity.id).where(
                    Activity.user_id.in_(mates),
                    Activity.sport == "cycling",
                    Activity.started_at >= window_start,
                    Activity.started_at <= window_end,
                ).limit(1)
            )
        ).first()
        return hit is not None
    except Exception:
        logger.info("crew overlap check failed (non-fatal)", exc_info=True)
        return None


# ── the easy day ────────────────────────────────────────────────────────────
#: The plan asked for easy when nothing in it is prescribed above this share of
#: FTP. 78 % is the top of endurance / bottom of tempo — a session whose hardest
#: block sits there is a genuine easy day, and one with anything above it is
#: asking for work no matter how gentle the rest of it looks.
EASY_PLAN_PCT_FTP = 78
#: The rider honoured it when their actual intensity factor stayed at or below
#: this. Deliberately a little above the plan's own ceiling: a rider who drifts
#: to 0.80 on a climb has still ridden an easy day, and the item is meant to
#: reward the discipline rather than police it to the decimal.
EASY_ACTUAL_IF = 0.80


def _plan_asked_easy(planned: PlannedWorkout) -> bool | None:
    """Whether the prescription itself is an easy one.

    Read from `interval_structure`'s own power targets rather than from a TSS
    figure, because `planned_workouts` carries no TSS column and reconstructing
    one would need the rider's FTP, their duration and an estimator — three more
    ways to be wrong about a judgement that is meant to be simple.

    None when the plan carries no power targets at all: a session with no
    prescribed intensity says nothing about how hard it was meant to be, and
    guessing "easy" would hand out the bonus for free.
    """
    structure = planned.interval_structure
    if not isinstance(structure, dict):
        return None
    intervals = structure.get("intervals")
    if not isinstance(intervals, list) or not intervals:
        return None

    pcts = [
        float(i["power_target_pct_ftp"])
        for i in intervals
        if isinstance(i, dict) and i.get("power_target_pct_ftp") is not None
    ]
    if not pcts:
        return None
    return max(pcts) <= EASY_PLAN_PCT_FTP


async def honoured_easy_day_of(
    db: AsyncSession, user_id: int, activity: Activity
) -> bool | None:
    """True when the plan asked for an easy day and the rider kept it easy.

    The hardest discipline in endurance training and the one a plan most needs,
    which is why `lanterne_rouge` pays more for it than any tyre pays for
    anything.

    None whenever a judgement cannot honestly be made: no plan for that day, no
    prescribed intensity to read, or no way to compute what the rider actually
    did. Riding hard on a hard day returns False, not None — that is a real
    answer about a real ride, it is simply not this bonus.
    """
    try:
        planned = (
            await db.execute(
                select(PlannedWorkout).where(
                    PlannedWorkout.user_id == user_id,
                    PlannedWorkout.date == activity.started_at.date(),
                    PlannedWorkout.sport == "cycling",
                )
            )
        ).scalars().first()
        if planned is None:
            return None

        asked_easy = _plan_asked_easy(planned)
        if asked_easy is None:
            return None
        if not asked_easy:
            return False

        # The rider's own intensity, by the same Coggan relation the rest of the
        # app uses. Without TSS and a duration there is nothing to judge.
        dur = activity.duration_seconds
        if activity.tss is None or not dur:
            return None
        actual_if = (float(activity.tss) / ((dur / 3600) * 100)) ** 0.5
        return actual_if <= EASY_ACTUAL_IF
    except Exception:
        logger.info("easy-day check failed (non-fatal)", exc_info=True)
        return None
