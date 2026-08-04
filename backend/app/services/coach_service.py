"""Coach service — assembles the athlete snapshot, runs the rules-based
periodization + session picker, calls Claude with the picked template in
context, validates the response against the template library, rewrites watts
from the athlete's FTP, filters through safety_rails, and caches the result in
coach_briefs with a 6-hour TTL.

Design invariants:
    - App MUST boot when ANTHROPIC_API_KEY is absent. Anthropic SDK is imported
      lazily so `ModuleNotFoundError` on the SDK cannot crash module import.
    - When the API key is absent OR the Anthropic call fails, generate_brief
      falls back to a rules-based brief synthesised from the picked template.
      model_used='rule-based-fallback' is recorded.
    - Template watts are re-derived server-side from the athlete's FTP. The
      LLM may tune duration (±15%) but cannot dictate watts. If it returns
      watts that drift from `ftp × target_pct_ftp`, `resolve_and_prescribe`
      silently overrides them.
    - Safety rails run AFTER the LLM. If the LLM prescribes above the rails'
      intensity ceiling, we downgrade the workout to a safe template and
      record the substitution in the rationale.
    - Prompt caching uses cache_control ephemeral on the system prompt, giving
      ~80% input-token cost savings on cache hits within a 5-min window.

References: see .planning/research/training-frameworks.md and
.planning/research/athlete-pain-points.md.
"""
from __future__ import annotations

import json as _json_mod
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator, Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.models.coach_recommendation import CoachRecommendation
from app.models.daily_metric import DailyMetric
from app.services import advanced_metrics
from app.services.execution_sayings import EXECUTION_SAYINGS_DE, saying_for
from app.services.advanced_metrics import (
    ctl_atl_tsb_snapshot,
    hrv_trend,
    rhr_trend,
    sleep_debt,
    why_am_i_tired,
    zone_distribution,
)
from app.services.analytical_aggregates import (
    pmc_window_summary,
    recovery_trend_summary,
)
from app.services.coach_prompt import (
    BRIEF_TOOL,
    SYSTEM_PROMPT,
    build_user_message,
    system_prompt_for_language,
)
from app.services.coach_tools import TOOL_SCHEMAS, dispatch_tool
from app.services.day_rhythm import compute_day_rhythm, render_day_rhythm_context
from app.services.goal_trajectory import project as project_trajectory, trajectory_to_dict
from app.services.pmc_service import compute_user_pmc
from app.services.ride_compliance import ride_compliance_to_dict, score_ride
from app.services.safety_rails import (
    RailContext,
    intensity_ceiling,
    max_tss_for_day,
    validate_chat_response,
)
from app.services.mesocycle_generator import current_block_position
from app.services.training_periodization import (
    SessionType,
    default_target_ctl,
    detect_training_phase,
    mountain_event_template,
    pick_template,
    session_type_for_today,
    weekly_intensity_quota,
)
from app.services.workout_templates import (
    TEMPLATES,
    PrescribedWorkout,
    WorkoutTemplate,
    get_template,
    parametrize_template,
    prescribed_workout_to_dict,
)

logger = logging.getLogger(__name__)


# ======================================================================
#  Athlete-local time helpers
# ======================================================================
#
# All "today" / "this week" windows in this module are computed in the
# athlete's local timezone, then converted to UTC for DB queries against
# `Activity.started_at` (stored in UTC). Without this, an athlete in
# Berlin riding at 22:00 local would see their activity attributed to
# the *next* UTC day — the coach would prescribe a second session on
# top of the one they just finished.
#
# The implementation now lives in app.services.athlete_time so that weeks,
# streaks, PMC bucketing and grading share the same notion of "today"
# (usability audit P0-2). Aliased here to preserve this module's internal
# naming and its public `set_athlete_tz_from_profile` import surface.
from app.services.athlete_time import (  # noqa: E402
    DEFAULT_ATHLETE_TZ as _DEFAULT_ATHLETE_TZ,
    athlete_tz as _athlete_tz,
    set_athlete_tz_from_profile,
    today_local as _today_local,
    today_local_window as _today_local_window,
    week_local_window as _week_local_window,
)


# ======================================================================
#  Snapshot builder — ALL the features the coach sees
# ======================================================================


async def _activity_summary_14d(db: AsyncSession, user_id: int) -> dict:
    """Aggregate metrics across the last 14 days of activities.

    Returns:
        {count, total_tss, avg_ef, avg_decoupling, durability_last_long_ride}
    """
    since = datetime.now(timezone.utc) - timedelta(days=14)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.asc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    if not activities:
        return {
            "count": 0,
            "total_tss": 0.0,
            "avg_ef": None,
            "avg_decoupling": None,
            "durability_last_long_ride": None,
        }

    total_tss = sum(a.tss or 0 for a in activities)
    efs: list[float] = []
    decs: list[float] = []
    last_durability: float | None = None
    last_long_ride_time: datetime | None = None

    for a in activities:
        m = advanced_metrics.compute_activity_metrics(a)
        if m["ef"] is not None:
            efs.append(m["ef"])
        if m["decoupling"] is not None:
            decs.append(m["decoupling"])
        if m["durability"] is not None:
            if last_long_ride_time is None or a.started_at > last_long_ride_time:
                last_durability = m["durability"]
                last_long_ride_time = a.started_at

    avg_ef = round(sum(efs) / len(efs), 3) if efs else None
    avg_decoupling = round(sum(decs) / len(decs), 2) if decs else None

    return {
        "count": len(activities),
        "total_tss": round(float(total_tss), 1),
        "avg_ef": avg_ef,
        "avg_decoupling": avg_decoupling,
        "durability_last_long_ride": last_durability,
    }


async def _days_since_rest(db: AsyncSession, user_id: int) -> int:
    """Consecutive recent days where TSS > 20 (i.e. not true rest)."""
    since = datetime.now(timezone.utc) - timedelta(days=30)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.desc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    # Bucket activity dates in athlete-local time so "today" lines up with
    # the rest of the snapshot (a 22:00 Berlin ride is "today", not "tomorrow").
    non_rest_dates: set[date] = set()
    for a in activities:
        if (a.tss or 0) > 20 and a.started_at is not None:
            started = a.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            non_rest_dates.add(started.astimezone(_athlete_tz()).date())

    today = _today_local()
    count = 0
    d = today
    while d in non_rest_dates and count < 30:
        count += 1
        d -= timedelta(days=1)
    return count


async def _recent_daily_tss(db: AsyncSession, user_id: int, days: int = 7) -> list[dict]:
    """Last 7 days of daily TSS for the LLM to build outlook from."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
        .order_by(Activity.started_at.asc())
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    by_date: dict[date, float] = {}
    for a in activities:
        by_date[a.started_at.date()] = by_date.get(a.started_at.date(), 0.0) + float(a.tss or 0)

    return [
        {"date": d.isoformat(), "tss": round(tss, 1)}
        for d, tss in sorted(by_date.items())
    ]


async def _todays_primary_activity(db: AsyncSession, user_id: int) -> Activity | None:
    """DEPRECATED — kept for any external import. Step 3 callers use
    `_todays_activities` to support multi-activity wrap-ups.

    "Today" is the athlete's local calendar day (Europe/Berlin for now —
    athlete tz from `set_athlete_tz_from_profile`). Returns the highest-TSS activity when multiple
    land on the same local day.
    """
    start_today_utc, end_today_utc = _today_local_window()
    stmt = (
        select(Activity)
        .where(
            Activity.user_id == user_id,
            Activity.started_at >= start_today_utc,
            Activity.started_at < end_today_utc,
        )
        .order_by(Activity.tss.desc().nullslast(), Activity.started_at.desc())
        .limit(1)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _todays_activities(db: AsyncSession, user_id: int) -> dict:
    """Step 3 — fetch ALL activities for the athlete's local "today" with
    their summary metrics, plus aggregated totals.

    Replaces `_todays_primary_activity` for the post-ride review flow. The
    frontend renders a stacked summary + per-row mini cards when count >= 2.

    Returns:
        {
            "rows": [Activity, ...],              # ORM rows, sorted by started_at asc
            "activities": [                       # serialised per-activity wrap-ups
                {
                    "title": str, "sport": str, "tss": float|None,
                    "duration_minutes": int|None, "distance_km": float|None,
                    "intensity_factor": float|None,   # NP / FTP
                    "efficiency_factor": float|None,  # NP / avg_hr
                    "variability_index": float|None,  # NP / avg_p
                },
                ...
            ],
            "totals": {
                "tss": float, "duration_minutes": int,
                "distance_km": float, "count": int,
            },
        }

    `intensity_factor` / `efficiency_factor` / `variability_index` return
    None when the underlying inputs are missing (HR-only ride, no FTP, no
    NP) — never crashes on missing fields.
    """
    start_today_utc, end_today_utc = _today_local_window()
    stmt = (
        select(Activity)
        .where(
            Activity.user_id == user_id,
            Activity.started_at >= start_today_utc,
            Activity.started_at < end_today_utc,
        )
        .order_by(Activity.started_at.asc())
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    # FTP for IF computation — single profile lookup.
    profile_q = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_q.scalar_one_or_none()
    ftp = (
        int(profile.ftp_watts)
        if profile is not None and profile.ftp_watts and profile.ftp_watts > 0
        else None
    )

    activities: list[dict] = []
    total_tss = 0.0
    total_duration_minutes = 0
    total_distance_km = 0.0

    for a in rows:
        np = a.normalized_power
        avg_p = a.average_power
        avg_hr = a.average_hr

        # IF = NP / FTP
        intensity_factor: float | None = None
        if np is not None and ftp:
            try:
                intensity_factor = round(float(np) / float(ftp), 3)
            except (TypeError, ValueError, ZeroDivisionError):
                intensity_factor = None

        # EF = NP / avgHR (or avgP / avgHR fallback)
        efficiency_factor: float | None = None
        if np is not None and avg_hr and float(avg_hr) > 0:
            try:
                efficiency_factor = round(float(np) / float(avg_hr), 3)
            except (TypeError, ValueError, ZeroDivisionError):
                efficiency_factor = None
        elif avg_p is not None and avg_hr and float(avg_hr) > 0:
            try:
                efficiency_factor = round(float(avg_p) / float(avg_hr), 3)
            except (TypeError, ValueError, ZeroDivisionError):
                efficiency_factor = None

        # VI = NP / avgP
        variability_index: float | None = None
        if np is not None and avg_p and float(avg_p) > 0:
            try:
                variability_index = round(float(np) / float(avg_p), 3)
            except (TypeError, ValueError, ZeroDivisionError):
                variability_index = None

        duration_min = (
            int(round(float(a.duration_seconds) / 60.0))
            if a.duration_seconds
            else None
        )
        distance_km = (
            round(float(a.distance_meters) / 1000.0, 2)
            if a.distance_meters
            else None
        )
        tss_val = float(a.tss) if a.tss is not None else None
        sport = str(a.sport) if a.sport else "cycling"
        title = a.title or sport.title()

        activities.append({
            "title": str(title)[:120],
            "sport": sport,
            "tss": tss_val,
            "duration_minutes": duration_min,
            "distance_km": distance_km,
            "intensity_factor": intensity_factor,
            "efficiency_factor": efficiency_factor,
            "variability_index": variability_index,
        })

        if tss_val is not None:
            total_tss += tss_val
        if duration_min is not None:
            total_duration_minutes += duration_min
        if distance_km is not None:
            total_distance_km += distance_km

    return {
        "rows": rows,
        "activities": activities,
        "totals": {
            "tss": round(total_tss, 1),
            "duration_minutes": int(total_duration_minutes),
            "distance_km": round(total_distance_km, 2),
            "count": len(rows),
        },
    }


async def _weekly_progress(db: AsyncSession, user_id: int) -> dict:
    """This calendar-week's training progress — used by session_type_for_today
    to avoid exceeding the weekly hard-session quota.

    All "today" / "this week" / "yesterday" windows are computed in the
    athlete's local timezone (athlete tz from `set_athlete_tz_from_profile`). Activities are filtered
    by their UTC-stored `started_at` against the local-day boundaries
    converted to UTC.
    """
    # Athlete-local week (Monday → next Monday) and today/yesterday windows
    since_week, _end_week_utc = _week_local_window()
    since_today, end_today = _today_local_window()
    # Yesterday's window (athlete-local calendar day)
    since_yesterday = since_today - timedelta(days=1)
    end_yesterday = since_today
    # Rolling 48h / 72h / 7d windows — independent of the week boundary so
    # Monday can still see the weekend's load. The rolling 7d sum is the
    # "did you train recently" signal the calendar-week total can't give: after
    # Monday resets total_tss_this_week to 0, rolling_7d_tss still carries the
    # prior week so the brief never frames a freshly-loaded athlete as "fresh".
    now_utc = datetime.now(timezone.utc)
    since_48h = now_utc - timedelta(hours=48)
    since_72h = now_utc - timedelta(hours=72)
    since_7d = now_utc - timedelta(days=7)

    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= min(since_week, since_7d))
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    hard_sessions = 0
    vo2_sessions = 0
    total_tss = 0.0
    total_hours = 0.0
    today_tss = 0.0
    today_duration_minutes = 0.0
    today_max_tss_per_hour = 0.0
    # Sport-split today tallies (audit P0-2): the coach's already-trained logic
    # must know whether today's minutes were RIDDEN or done in another sport —
    # a 58-min gym session must not read as a completed bike session.
    today_ride_tss = 0.0
    today_ride_minutes = 0.0
    today_other_minutes = 0.0
    today_other_by_family: dict[str, float] = {}
    yesterday_tss = 0.0
    last_48h_tss = 0.0
    rolling_7d_tss = 0.0
    # Count of "quality" sessions in the prior 72h. Quality = sustained intensity
    # at or near tempo: TSS/hour >= 60 (≈ IF 0.78+) over a session of 25min+.
    # Used by session_type_for_today to avoid stacking back-to-back hard days
    # without an easy buffer — the standard hard/easy alternation rule.
    last_72h_quality_count = 0

    from app.services.sport import sport_family as _sport_family

    for a in activities:
        tss = float(a.tss or 0)
        started = a.started_at
        # Week totals
        if started >= since_week:
            total_tss += tss
            total_hours += float(a.duration_seconds or 0) / 3600.0
            if a.duration_seconds and (a.duration_seconds >= 600):
                tss_per_hour = (tss / a.duration_seconds) * 3600.0
                if tss_per_hour >= 75:
                    hard_sessions += 1
                if tss_per_hour >= 100:
                    vo2_sessions += 1
        # Today's cumulative TSS + duration + peak intensity (half-open window)
        if since_today <= started < end_today:
            today_tss += tss
            minutes = float(a.duration_seconds or 0) / 60.0
            today_duration_minutes += minutes
            fam = _sport_family(getattr(a, "sport", None) or "cycling")
            if fam == "cycling":
                today_ride_tss += tss
                today_ride_minutes += minutes
            else:
                today_other_minutes += minutes
                today_other_by_family[fam] = (
                    today_other_by_family.get(fam, 0.0) + minutes
                )
            if a.duration_seconds and a.duration_seconds >= 600:
                tss_per_hour = (tss / a.duration_seconds) * 3600.0
                today_max_tss_per_hour = max(today_max_tss_per_hour, tss_per_hour)
        # Yesterday's cumulative TSS (half-open window)
        if since_yesterday <= started < end_yesterday:
            yesterday_tss += tss
        # Rolling 48h
        if started >= since_48h:
            last_48h_tss += tss
        # Rolling trailing 7 days — survives the Monday calendar-week reset
        if started >= since_7d:
            rolling_7d_tss += tss
        # Rolling 72h — flag prior quality sessions so today's picker doesn't
        # stack a second hard session without an easy day in between. We count
        # the session itself; whether it was today is filtered by the picker.
        if started >= since_72h and a.duration_seconds and a.duration_seconds >= 1500:
            tss_per_hour_72h = (tss / a.duration_seconds) * 3600.0
            if tss_per_hour_72h >= 60.0:
                last_72h_quality_count += 1

    # Dominant other-sport family today (label for cross-sport credit copy).
    today_other_sport = (
        max(today_other_by_family, key=lambda k: today_other_by_family[k])
        if today_other_by_family else None
    )

    return {
        "hard_sessions_done": hard_sessions,
        "vo2_sessions_done": vo2_sessions,
        "total_tss_this_week": round(total_tss, 1),
        "total_hours_this_week": round(total_hours, 1),
        "today_tss": round(today_tss, 1),
        "today_duration_minutes": round(today_duration_minutes, 1),
        "today_max_tss_per_hour": round(today_max_tss_per_hour, 1),
        # Sport-split today tallies (audit P0-2) — 'today_ride_*' is the
        # cycling family only; 'today_other_*' is everything else. The
        # already-trained override keys off the RIDE tally, never the total.
        "today_ride_tss": round(today_ride_tss, 1),
        "today_ride_minutes": round(today_ride_minutes, 1),
        "today_other_sport": today_other_sport,
        "today_other_minutes": round(today_other_minutes, 1),
        "yesterday_tss": round(yesterday_tss, 1),
        "last_48h_tss": round(last_48h_tss, 1),
        "rolling_7d_tss": round(rolling_7d_tss, 1),
        "last_72h_quality_count": last_72h_quality_count,
    }


# Review 2026-07-21: the block-opener FTP-test override must never fire when
# the FTP anchor is already fresh (live case: an all-out test prescribed 3
# minutes after the athlete manually entered their FTP).
_FTP_FRESHNESS_DAYS = 21


def _ftp_is_fresh(
    profile: AthleteProfile | None,
    today: date,
    max_age_days: int = _FTP_FRESHNESS_DAYS,
) -> bool:
    """True when the most recent ftp_history entry (manual or measured) is
    within `max_age_days` of `today`. Malformed entries are skipped; no
    history → not fresh."""
    history = getattr(profile, "ftp_history", None) if profile is not None else None
    if not isinstance(history, list):
        return False
    latest: date | None = None
    for entry in history:
        if not isinstance(entry, dict):
            continue
        raw = entry.get("measured_at")
        if not isinstance(raw, str):
            continue
        try:
            measured = datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            continue
        if latest is None or measured > latest:
            latest = measured
    # Future-dated entries (clock skew) count as fresh — a test is pointless.
    return latest is not None and (today - latest).days <= max_age_days


async def build_snapshot(
    db: AsyncSession,
    user_id: int,
    language: str = "simple",
) -> dict:
    """Assemble every feature the coach needs in one round of DB hits,
    including the pre-picked workout template the LLM will rubber-stamp.

    `language` is stamped into the snapshot so that:
        - `generate_brief` can route to the right system prompt
        - the cache in `get_or_generate_brief` can key on language
          (different language = cache miss = regenerate)
        - `_rule_based_brief` can pick simple vs technical phrasing
    """
    profile_result = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = profile_result.scalar_one_or_none()

    # Step 2 — bind the athlete tz for the rest of this request before any
    # _today_local() / _today_local_window() call runs further down.
    set_athlete_tz_from_profile(profile)

    goal_event_date = None
    goal_target = None
    goal_date_obj: date | None = None
    if profile and isinstance(profile.goals, dict):
        te = profile.goals.get("target_event")
        if isinstance(te, dict):
            goal_event_date = te.get("date")
            goal_target = te.get("name")
    # First-class column BEATS the JSONB copy (same rule as 01a9ac1 for the
    # trajectory): a stale goals.target_event.date (live-observed: 2026-07-05
    # vs the real 2026-12-05) otherwise poisons days_to_goal, phase detection
    # and every event-anchored sentence in the brief.
    if profile is not None and getattr(profile, "target_event_date", None):
        goal_event_date = profile.target_event_date.isoformat()
    if goal_event_date:
        try:
            goal_date_obj = date.fromisoformat(goal_event_date)
        except (ValueError, TypeError):
            goal_date_obj = None

    pmc = await ctl_atl_tsb_snapshot(db, user_id)
    hrv = await hrv_trend(db, user_id, days=7)
    rhr = await rhr_trend(db, user_id, days=7)
    sleep = await sleep_debt(db, user_id, days=14)
    zones = await zone_distribution(db, user_id, days=28)
    activities = await _activity_summary_14d(db, user_id)
    tired = await why_am_i_tired(db, user_id)
    days_since_rest = await _days_since_rest(db, user_id)
    recent_daily = await _recent_daily_tss(db, user_id, days=7)
    weekly_prog = await _weekly_progress(db, user_id)
    # Athlete-level Critical Power from the cross-ride power-duration envelope
    # (stream-derived). None until enough rides with power streams exist — the
    # brief falls back to the stored FTP in that case.
    from app.services.athlete_power_profile import compute_athlete_power_profile
    power_profile = await compute_athlete_power_profile(db, user_id)

    # ---------------------------------------------------------
    # Periodization — detect phase + pick today's session
    # ---------------------------------------------------------
    ftp = profile.ftp_watts if profile else None
    weekly_hours = profile.weekly_hours_available if profile else 8.0
    if weekly_hours is None or weekly_hours <= 0:
        weekly_hours = 8.0

    # Athlete's weekly-intensity philosophy from onboarding (stored in the
    # free-form goals JSON). Shapes the quota + each day's session pick.
    goals_json = (profile.goals or {}) if profile else {}
    training_model = goals_json.get("training_model")
    days_per_week = goals_json.get("days_per_week")

    # Where today sits in the athlete's Issurin 3:1 mesocycle (if they have an
    # active plan) — so the live brief deloads on a break week, not just the
    # generated plan. None when off-plan → loading default.
    today_block = await current_block_position(db, user_id, _today_local())
    today_is_recovery = today_block == "recovery"

    # Race-ready CTL target — explicit goals.target_ctl wins, else derive from
    # event type + priority. Feeds the under-built taper override so we don't
    # taper an athlete who never built the base their event demands.
    target_ctl_for_phase: float | None = None
    if profile is not None:
        goals_dict = profile.goals if isinstance(profile.goals, dict) else {}
        raw_target = goals_dict.get("target_ctl")
        if isinstance(raw_target, (int, float)):
            target_ctl_for_phase = float(raw_target)
        else:
            target_ctl_for_phase = default_target_ctl(
                profile.target_event_type, profile.target_priority
            )

    phase = detect_training_phase(
        goal_date_obj,
        float(pmc.get("ctl", 0.0)),
        target_ctl=target_ctl_for_phase,
    )
    quota = weekly_intensity_quota(
        phase,
        float(weekly_hours),
        training_model=training_model,
        days_per_week=days_per_week,
        block_position=today_block,
    )

    # ---------------------------------------------------------
    # Multi-factor readiness + new safety signals
    # ---------------------------------------------------------
    # ACWR (Bourdon 2017): ATL/CTL — sweet-spot 0.8-1.3, danger > 1.5.
    ctl_val = float(pmc.get("ctl") or 0.0)
    atl_val = float(pmc.get("atl") or 0.0)
    acwr_val = (atl_val / ctl_val) if ctl_val > 0 else None

    # TSB velocity over last 2 days — Banister-derived NFOR predictor.
    # Pull the trailing PMC series (compute_user_pmc is called later for the
    # trajectory; we issue a lightweight 7-day fetch here to avoid double work).
    tsb_velocity_2d: float | None = None
    try:
        from app.services.pmc_service import compute_user_pmc as _pmc_recent
        pmc_recent = await _pmc_recent(db, user_id, days=7)
        rows = pmc_recent.get("total") or []
        if len(rows) >= 3:
            tsb_today = float(rows[-1].get("tsb") or 0.0)
            tsb_yest = float(rows[-2].get("tsb") or 0.0)
            tsb_dby = float(rows[-3].get("tsb") or 0.0)
            d1 = tsb_today - tsb_yest
            d2 = tsb_yest - tsb_dby
            tsb_velocity_2d = round((d1 + d2) / 2.0, 2)
    except Exception:
        tsb_velocity_2d = None

    # Readiness score (multi-factor composite). Inputs are pulled from already-
    # computed aggregates; missing signals are skipped (weights renormalize).
    from app.services.readiness_score import ReadinessInputs, compute_readiness

    hrv_data = hrv if isinstance(hrv, dict) else {}
    rhr_data = rhr if isinstance(rhr, dict) else {}
    sleep_data = sleep if isinstance(sleep, dict) else {}
    body_battery_wake_val: int | None = None
    # Pull today's biometrics two ways:
    #   1. daily_metrics row (Garmin's daily summary — `body_battery_wake` column,
    #      often NULL on accounts where user_summary endpoint returns nothing).
    #   2. compute_today_snapshot — derives wake from intraday samples directly,
    #      so it works even when Garmin's summary endpoint hasn't populated.
    # Prefer the intraday-derived value (more reliable / always-fresh); fall
    # back to the DB column when intraday is empty.
    today_metric_q = await db.execute(
        select(DailyMetric)
        .where(DailyMetric.user_id == user_id, DailyMetric.date == _today_local())
        .order_by(DailyMetric.recorded_at.desc())
        .limit(1)
    )
    today_metric_row = today_metric_q.scalar_one_or_none()
    try:
        from app.services.biometrics_snapshot import compute_today_snapshot
        today_snap = await compute_today_snapshot(db, user_id, _today_local())
        if today_snap.body_battery.wake is not None:
            body_battery_wake_val = today_snap.body_battery.wake
    except Exception:
        # Snapshot is best-effort — fall through to the DB column.
        pass
    if body_battery_wake_val is None and today_metric_row is not None:
        body_battery_wake_val = today_metric_row.body_battery_wake

    readiness_inputs = ReadinessInputs(
        hrv_7d_mean=hrv_data.get("current_mean"),
        hrv_28d_baseline=hrv_data.get("baseline_28d_mean"),
        hrv_cv_pct=None,  # not currently computed; placeholder for future Plews CV
        rhr_7d_mean=rhr_data.get("current_mean"),
        rhr_28d_baseline=rhr_data.get("baseline_28d_mean"),
        sleep_score_last_night=(today_metric_row.sleep_score if today_metric_row else None),
        avg_nightly_debt_h=sleep_data.get("avg_nightly_debt"),
        tsb=pmc.get("tsb"),
        ctl=ctl_val,
        atl=atl_val,
        body_battery_wake=body_battery_wake_val,
    )
    readiness_report = compute_readiness(readiness_inputs)

    rails_ctx = RailContext(
        ctl=ctl_val,
        atl=atl_val,
        tsb=float(pmc["tsb"]),
        hrv_delta_pct=float(hrv.get("delta_pct") or 0.0),
        injury_flag=bool(profile.injury_flag) if profile else False,
        days_since_rest=int(days_since_rest),
        acwr=acwr_val,
        tsb_velocity_2d=tsb_velocity_2d,
        readiness_score=readiness_report.overall,
    )
    ceiling = intensity_ceiling(rails_ctx)

    today_session: SessionType = session_type_for_today(
        phase=phase,
        weekly_progress=weekly_prog,
        tsb=float(pmc.get("tsb", 0.0)),
        intensity_ceiling=ceiling,
        day_of_week=_today_local().weekday(),
        training_model=training_model,
        is_recovery_week=today_is_recovery,
    )

    # Today's available minutes — weekly_hours/7 rounded up, capped at 180 min
    # so we don't auto-pick a 3h long ride on a Tuesday.
    today_available_minutes = min(180, max(30, int(round((weekly_hours * 60) / 7))))

    # Event-specificity override — for a fondo / hilly-race A-event inside the
    # transmutation window, route every quality day to its climbing variant
    # (low-cadence force tempo, hill threshold, hill VO2) plus the Saturday
    # climbing long ride. Maratona dles Dolomites and similar grand fondos are
    # bottlenecked by sustained low-cadence climbing endurance, not by generic
    # Z2 hours — so the specificity belongs on the hard days, not just the
    # weekend. Saving these blocks for closer to the event is Issurin block
    # periodization (Transmutation phase).
    preferred_template_id: str | None = None
    today_local_date = _today_local()
    if profile is not None and profile.target_event_date is not None:
        preferred_template_id = mountain_event_template(
            session_type=today_session,
            event_type=profile.target_event_type,
            days_to_event=(profile.target_event_date - today_local_date).days,
            day_of_week=today_local_date.weekday(),
        )

    # Race-week Wednesday gets a single race-pace tune-up — the Mujika
    # taper's "confidence ride": one sustained sub-threshold effort that
    # primes the engine without depleting freshness. session_type_for_today
    # returns 'threshold' for race-week Wed; we pin the specific template
    # here so the picker doesn't fall to a heavier 2×15 / over-unders.
    if (
        phase == "race"
        and today_local_date.weekday() == 2  # Wednesday
        and today_session == "threshold"
    ):
        preferred_template_id = "race_pace_60_95"

    # Peak-phase Thursday for race-targeted athletes — surges + tempo base
    # that mirrors road-race / crit demands. Threshold-class load but with
    # the stochastic profile races actually deliver, not a clean 4×8 block.
    if (
        phase == "peak"
        and today_local_date.weekday() == 3  # Thursday
        and today_session in ("threshold", "vo2")
        and profile is not None
        and profile.target_event_type == "race"
    ):
        preferred_template_id = "crit_simulation_stochastic"

    # FTP test slot — first Tuesday of a fresh build/peak block, when CTL
    # is rebuilding and a clean test anchors the next 4-week ramp. We
    # detect "early in the block" via days-since-last-recovery-week:
    # `weekly_progress.last_72h_quality_count == 0` AND the athlete is in
    # build1/build2/peak AND no test in the last 5 weeks. The 5-week
    # cooldown lives in activity history; we proxy it by skipping when the
    # athlete is mid-block (hard_done already counted this week). First
    # Tuesday of the phase will have hard_done == 0 and no recent quality.
    if (
        phase in ("build1", "build2", "peak")
        and today_local_date.weekday() == 1  # Tuesday
        and today_session in ("sweet_spot", "threshold")
        and int((weekly_prog or {}).get("hard_sessions_done", 0)) == 0
        and int((weekly_prog or {}).get("last_72h_quality_count", 0)) == 0
        and int((weekly_prog or {}).get("total_tss_this_week", 0)) < 50
        # Review 2026-07-21: never prescribe an all-out test when the FTP
        # anchor is already FRESH — live case fired the test 3 minutes after
        # the athlete manually entered their FTP. A manual/measured
        # ftp_history entry within the window makes a test pointless pain.
        and not _ftp_is_fresh(profile, today_local_date)
    ):
        # Block-opener test. Quietly skipped when the athlete already has
        # a recent quality session or any meaningful week-load — i.e. the
        # rule only fires on a *clean* Tuesday at block start.
        preferred_template_id = "ftp_test_20min"

    # Planned-rest override (audit P0-3): when TODAY's PlannedWorkout row says
    # rest, the plan IS the decision — the readiness-driven session picker may
    # not prescribe a session on a Ruhetag (the audit's four-voices blocker:
    # the rule-based brief happily picked a Z2 spin while Today/Recovery said
    # rest). Sick/trained overrides still apply later in the verdict cascade.
    try:
        from app.models.planned_workout import PlannedWorkout as _PW_pick
        _pick_pw_rows = list((await db.execute(
            select(_PW_pick).where(
                _PW_pick.user_id == user_id,
                _PW_pick.date == today_local_date,
            )
        )).scalars().all())
        if _pick_pw_rows and all(
            (getattr(r, "template_id", None) or "") == "rest_day"
            or "ruhetag" in str(getattr(r, "title", "") or "").lower()
            or "rest" in str(getattr(r, "title", "") or "").lower()
            for r in _pick_pw_rows
        ):
            today_session = "rest"
            preferred_template_id = None
    except Exception:  # pragma: no cover — plan lookup must never block the brief
        logger.exception("today planned-rest lookup failed (user_id=%s)", user_id)

    # Pick + parametrize the template
    picked_template = pick_template(
        session_type=today_session,
        athlete_ftp=ftp,
        available_minutes=today_available_minutes,
        preferred_template_id=preferred_template_id,
        rotation_key=date.today().toordinal(),
    )

    # Derive best-available LTHR so workout blocks can show HR targets
    # alongside watts. Priority: stored LTHR → 0.85 × MHR → 0.85 × Tanaka(age).
    from app.services.hr_zones import derive_lthr
    derived_lthr = derive_lthr(
        lthr=getattr(profile, "lthr_cycling", None) if profile else None,
        max_heart_rate=getattr(profile, "max_heart_rate", None) if profile else None,
        date_of_birth=getattr(profile, "date_of_birth", None) if profile else None,
    )

    picked_preview: dict | None = None
    if ftp and ftp > 0:
        try:
            prescribed = parametrize_template(
                picked_template, int(ftp), duration_scale=1.0, lthr=derived_lthr,
            )
            picked_preview = prescribed_workout_to_dict(prescribed)
        except ValueError:
            picked_preview = None

    # ---------------------------------------------------------
    # Post-ride review — Step 3: trigger lowered to >=1 activity
    # AND total today duration >= 20 minutes (was today_tss >= 25).
    # When count >= 2 we also assemble per-activity wrap-ups so the
    # frontend can render a stacked summary + per-row mini cards.
    # ---------------------------------------------------------
    post_ride_data: dict | None = None
    today_bundle = await _todays_activities(db, user_id)
    today_rows: list[Activity] = today_bundle["rows"]  # type: ignore[assignment]
    today_count = int(today_bundle["totals"]["count"])
    today_total_minutes = int(today_bundle["totals"]["duration_minutes"])

    if today_count >= 1 and today_total_minutes >= 20:
        # Primary activity for the top-level grade (highest-TSS when n=1
        # there's only one; when n>=2 we still pick a "primary" so the
        # narrative + targets fall back gracefully — the FE will hide the
        # top-level grade for n>=2 and show per-ride chips instead).
        primary = max(
            today_rows,
            key=lambda a: (a.tss or 0.0, a.duration_seconds or 0),
        )

        # Goal trajectory — via the single normalized entry point
        # (goal_trajectory.compute_goal_trajectory, which normalizes goals +
        # projection basis internally). Falls back to the legacy pure
        # project() while the new entry point lands in the same wave.
        trajectory_dict: dict = {}
        try:
            import inspect as _inspect
            from app.services import goal_trajectory as _gt_mod
            _compute_traj = getattr(_gt_mod, "compute_goal_trajectory", None)
            if _compute_traj is not None:
                _traj_res = _compute_traj(db, user_id, profile)
                if _inspect.isawaitable(_traj_res):
                    _traj_res = await _traj_res
                trajectory_dict = _traj_res or {}
            else:
                pmc_full = await compute_user_pmc(db, user_id, days=90)
                trajectory_dict = trajectory_to_dict(project_trajectory(
                    user_pmc=pmc_full.get("total") or [],
                    athlete_goals=(
                        profile.goals if profile and isinstance(profile.goals, dict) else None
                    ),
                    phase=phase,
                ))
        except Exception:  # pragma: no cover — trajectory must never block the brief
            logger.exception("goal trajectory computation failed for user_id=%s", user_id)
            trajectory_dict = {}

        # Per-activity compliance (await — uses async ride_compliance.score()
        # which reads the persisted coach_recommendations row from Step 4).
        from app.services import ride_compliance as _ride_compliance_module
        per_activity_compliance: list[dict | None] = []
        for row in today_rows:
            try:
                rc = await _ride_compliance_module.score(
                    db=db,
                    user_id=user_id,
                    actual_activity=row,
                    target_template=picked_template,
                    ftp=int(ftp) if ftp else None,
                    phase=phase,
                    session_type=today_session,
                )
                per_activity_compliance.append(ride_compliance_to_dict(rc))
            except Exception:  # pragma: no cover — never block the brief
                logger.exception(
                    "per-activity compliance scoring failed (activity_id=%s)",
                    getattr(row, "id", None),
                )
                per_activity_compliance.append(None)

        # Graded-aware primary selection (audit P0-2): the day's primary grade
        # may come ONLY from a graded (sport-matching) activity. Re-anchor the
        # primary on the highest-TSS graded row when one exists — otherwise
        # (all activities ungraded, e.g. only a gym log on a bike-plan day)
        # the primary keeps its facts but the review carries no grade.
        def _is_graded(c: dict | None) -> bool:
            return (
                isinstance(c, dict)
                and c.get("graded", True) is not False
                and bool(c.get("grade"))
            )

        _graded_rows = [
            r for r, c in zip(today_rows, per_activity_compliance) if _is_graded(c)
        ]
        if _graded_rows:
            primary = max(
                _graded_rows,
                key=lambda a: (a.tss or 0.0, a.duration_seconds or 0),
            )

        # Sport-aware session count. The top-level ride grade compares against
        # the endurance prescription (picked_template), so only same-discipline
        # sessions as the primary ride may drive the single-vs-multi decision
        # and the aggregate target. A strength/gym log on the same day still
        # renders as its own row (in `activities`), but must NOT flip the
        # endurance comparison into "Two sessions" mode or add its TSS target
        # into the ride's aggregate.
        primary_sport = (getattr(primary, "sport", None) or "cycling")
        endurance_rows = [
            r for r in today_rows
            if (getattr(r, "sport", None) or "cycling") == primary_sport
        ]
        endurance_count = len(endurance_rows)
        _comp_by_row_id = {
            id(r): c for r, c in zip(today_rows, per_activity_compliance)
        }

        # Single-session fields (top-level compliance) — populated only when
        # exactly one same-discipline session. For endurance_count >= 2 we still
        # need the schema fields, but we leave the top-level grade None and
        # aggregate the duration/TSS pairs over same-sport rides only.
        if endurance_count <= 1:
            primary_compliance = _comp_by_row_id.get(id(primary))
            if primary_compliance is None:
                # Compliance scoring raised — legacy sync fallback, but ONLY
                # for cycling: score_ride grades against the bike template and
                # must never fabricate a grade for another sport's session.
                from app.services.sport import sport_family as _sport_family_fn
                if _sport_family_fn(primary_sport) == "cycling":
                    primary_compliance = ride_compliance_to_dict(
                        score_ride(
                            actual_activity=primary,
                            target_template=picked_template,
                            ftp=int(ftp) if ftp else None,
                            phase=phase,
                            session_type=today_session,
                        )
                    )
                else:
                    primary_compliance = {
                        "grade": None,
                        "graded": False,
                        "duration": {},
                        "tss": {},
                        "intensity_factor": None,
                        "variability_index": None,
                        "ef": None,
                        "decoupling_pct": None,
                        "zone_match_pct": None,
                        "phase": phase,
                        "session_type": today_session,
                        "template_id": picked_template.id,
                        "template_title": picked_template.name,
                    }
        else:
            # For endurance_count >= 2, build aggregate duration / tss pairs
            # (target = sum over per-ride targets, actual = sum of actuals) —
            # summed over same-discipline rides only. Grade is intentionally
            # None — the FE renders per-ride chips instead.
            agg_target_min = 0.0
            agg_actual_min = 0.0
            agg_target_tss = 0.0
            agg_actual_tss = 0.0
            for r in endurance_rows:
                agg_actual_min += (r.duration_seconds or 0) / 60.0
                agg_actual_tss += float(r.tss or 0.0)
                c = _comp_by_row_id.get(id(r))
                if not c:
                    continue
                d = c.get("duration") or {}
                t = c.get("tss") or {}
                agt = d.get("target")
                tgt = t.get("target")
                if isinstance(agt, (int, float)):
                    agg_target_min += float(agt)
                if isinstance(tgt, (int, float)):
                    agg_target_tss += float(tgt)

            def _pct(target: float, actual: float) -> float:
                if target <= 0:
                    return 0.0
                return round((actual - target) / target * 100.0, 1)

            def _band(delta_pct: float) -> str:
                if delta_pct > 10:
                    return "over"
                if delta_pct < -10:
                    return "under"
                return "match"

            dur_delta = _pct(agg_target_min, agg_actual_min)
            tss_delta = _pct(agg_target_tss, agg_actual_tss)
            primary_compliance = {
                "grade": None,
                "duration": {
                    "target": round(agg_target_min, 1),
                    "actual": round(agg_actual_min, 1),
                    "delta_pct": dur_delta,
                    "band": _band(dur_delta),
                },
                "tss": {
                    "target": round(agg_target_tss, 1),
                    "actual": round(agg_actual_tss, 1),
                    "delta_pct": tss_delta,
                    "band": _band(tss_delta),
                },
                "intensity_factor": None,
                "variability_index": None,
                "ef": None,
                "decoupling_pct": None,
                "zone_match_pct": None,
                "phase": phase,
                "session_type": today_session,
                "template_id": picked_template.id,
                "template_title": picked_template.name,
            }

        # Target-template descriptor for the review header. It MUST reflect the
        # same prescription the compliance actually graded against — not the
        # live `picked_template`, which flips to a rest day once the athlete has
        # already trained today. When the athlete completed today's Progressive
        # Z2, ride_compliance.score() correctly grades against that real session
        # (from the recommendation) while picked_template is now "Rest day"; we
        # source id/title from the compliance result so title + numbers are one
        # coherent source and the header never reads "Rest day" for a graded ride.
        from app.services.workout_templates import get_template as _get_template
        graded_id = None
        graded_title = None
        if isinstance(primary_compliance, dict):
            graded_id = primary_compliance.get("template_id")
            graded_title = primary_compliance.get("template_title")
        graded_tpl = _get_template(graded_id) if graded_id else None
        target_template_descriptor = {
            "id": graded_id or picked_template.id,
            "title": graded_title or picked_template.name,
            "category": graded_tpl.category if graded_tpl else picked_template.category,
            "framework_cited": (
                graded_tpl.framework_cited if graded_tpl else picked_template.framework_cited
            ),
            "purpose": graded_tpl.purpose if graded_tpl else picked_template.purpose,
        }

        # Stitch per-activity compliance grades into the activities[] list so
        # _build_post_ride_review can hand them to the frontend untouched.
        # Ungraded activities (sport gate: graded=False) contribute a neutral
        # "logged" entry — sport + duration stay, compliance_grade stays None.
        activities_out: list[dict] = []
        for entry, comp in zip(today_bundle["activities"], per_activity_compliance):
            row = dict(entry)
            row["compliance_grade"] = comp.get("grade") if _is_graded(comp) else None
            activities_out.append(row)

        post_ride_data = {
            "compliance": primary_compliance,
            "trajectory": trajectory_dict,
            "target_template": target_template_descriptor,
            "actual_activity": {
                "id": primary.id,
                "duration_minutes": int(round((primary.duration_seconds or 0) / 60)),
                "tss": float(primary.tss or 0.0),
                "normalized_power": primary.normalized_power,
                "average_power": primary.average_power,
                "average_hr": primary.average_hr,
                "started_at": primary.started_at.isoformat() if primary.started_at else None,
            },
            # Step 3 — multi-activity additions
            "activities": activities_out,
            "totals": today_bundle["totals"],
            # Sport family of the primary (graded when possible) activity —
            # resolve_and_prescribe uses this so a gym-only day never forces
            # the bike plan to rest_day.
            "primary_sport": primary_sport,
            # Sport-aware count of same-discipline sessions as the primary ride.
            # Drives the single-vs-multi headline so a gym log alongside a ride
            # doesn't force the endurance grade into "Two sessions" mode.
            "primary_session_count": endurance_count,
        }

    # ---------------------------------------------------------
    # Today-runthrough Step 7 — forward-looking + recap inputs.
    # All threaded into the user message (not the cached prefix)
    # so prompt-cache hashes stay stable.
    # ---------------------------------------------------------
    today_local_date = _today_local()
    tomorrow_local_date = today_local_date + timedelta(days=1)

    # Yesterday's recommendation row keyed to TODAY's local date — the row
    # we wrote when yesterday's brief generated. Used by the recap-with-eval
    # narrative ("we recommended X; you actually did Y").
    yesterday_rec_payload: dict | None = None
    try:
        ye_q = await db.execute(
            select(CoachRecommendation).where(
                CoachRecommendation.user_id == user_id,
                CoachRecommendation.target_date == today_local_date,
            )
        )
        ye_rec = ye_q.scalar_one_or_none()
        if ye_rec is not None:
            yesterday_rec_payload = {
                "template_id": ye_rec.template_id,
                "title": ye_rec.title,
                "duration_minutes": ye_rec.duration_minutes,
                "predicted_tss": ye_rec.predicted_tss,
                "framework_cited": ye_rec.framework_cited,
                "why_this_workout": ye_rec.why_this_workout,
            }
    except Exception:  # pragma: no cover — best-effort; never break snapshot
        logger.exception("failed to load yesterday_recommendation for user_id=%s", user_id)

    # Today's aggregated activity list (Step 3) — flat dicts the LLM can read.
    todays_activities_payload: list[dict] = []
    for row in today_rows:
        todays_activities_payload.append({
            "title": getattr(row, "name", None) or getattr(row, "title", None) or "Activity",
            "sport": getattr(row, "sport", None) or "cycling",
            "duration_minutes": int(round((getattr(row, "duration_seconds", 0) or 0) / 60)),
            "tss": float(getattr(row, "tss", 0) or 0),
            "intensity_factor": getattr(row, "intensity_factor", None),
            "efficiency_factor": getattr(row, "efficiency_factor", None),
            "variability_index": getattr(row, "variability_index", None),
        })

    # Tomorrow's outlook — pre-compute the same way _rule_based_brief does
    # (CTL × weekday multiplier + plain-English note) so the LLM has
    # outlook_7d[1] available in the user message even on its own path.
    _ctl_for_outlook = float(pmc.get("ctl") or 0.0)
    _tomorrow_weekday = tomorrow_local_date.weekday()
    if _tomorrow_weekday == 6:
        _tomorrow_tss = round(_ctl_for_outlook * 1.1, 0)
        _tomorrow_note = (
            "Long easy ride — build the base." if language == "simple"
            else "Long Z2 — build aerobic base."
        )
    elif _tomorrow_weekday == 2:
        _tomorrow_tss = round(_ctl_for_outlook * 0.9, 0)
        _tomorrow_note = (
            "Hard ride mid-week." if language == "simple"
            else "Mid-week quality — intervals near threshold."
        )
    elif _tomorrow_weekday in (0, 4):
        _tomorrow_tss = round(_ctl_for_outlook * 0.3, 0)
        _tomorrow_note = "Rest or easy spin."
    else:
        _tomorrow_tss = round(_ctl_for_outlook * 0.6, 0)
        _tomorrow_note = (
            "Easy hour on the bike." if language == "simple" else "Endurance Z2."
        )
    tomorrow_outlook_payload: dict = {
        "day_offset": 1,
        "suggested_tss": _tomorrow_tss,
        "note": _tomorrow_note,
    }

    # TODAY's PlannedWorkout rows (audit P0-3) — the planned-rest truth the
    # daily decision + LLM prompt key off. Previously only TOMORROW's row was
    # queried, so the narrative could contradict today's actual plan.
    today_planned_payload: dict | None = None
    today_planned_is_rest = False
    try:
        from app.models.planned_workout import PlannedWorkout as _PW_today
        today_pw_q = await db.execute(
            select(_PW_today).where(
                _PW_today.user_id == user_id,
                _PW_today.date == today_local_date,
            )
        )
        _today_pw_rows = list(today_pw_q.scalars().all())
        _today_non_rest = [
            r for r in _today_pw_rows
            if (getattr(r, "template_id", None) or "") != "rest_day"
            and "ruhetag" not in str(getattr(r, "title", "") or "").lower()
            and "rest" not in str(getattr(r, "title", "") or "").lower()
        ]
        if _today_pw_rows and not _today_non_rest:
            today_planned_is_rest = True
        elif _today_non_rest:
            from app.services.sport import sport_family as _fam_fn
            _today_primary_pw = next(
                (r for r in _today_non_rest if _fam_fn(getattr(r, "sport", None)) == "cycling"),
                _today_non_rest[0],
            )
            today_planned_payload = {
                "title": _today_primary_pw.title,
                "template_id": _today_primary_pw.template_id,
                "sport": _today_primary_pw.sport,
                "duration_minutes": (
                    int(round((_today_primary_pw.duration_seconds_target or 0) / 60))
                    if _today_primary_pw.duration_seconds_target else None
                ),
                "indoor": bool(_today_primary_pw.indoor),
            }
    except Exception:  # pragma: no cover — model may be absent in some envs
        logger.exception("failed to load today's planned workout for user_id=%s", user_id)

    # Tomorrow's PlannedWorkout — optional; present if the athlete has a
    # scheduled session. Skipped silently when the model isn't reachable.
    tomorrow_planned_payload: dict | None = None
    try:
        from app.models.planned_workout import PlannedWorkout
        pw_q = await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date == tomorrow_local_date,
            )
        )
        pw_row = pw_q.scalar_one_or_none()
        if pw_row is not None:
            tomorrow_planned_payload = {
                "title": pw_row.title,
                "template_id": pw_row.template_id,
                "sport": pw_row.sport,
                "duration_minutes": (
                    int(round((pw_row.duration_seconds_target or 0) / 60))
                    if pw_row.duration_seconds_target else None
                ),
                "indoor": bool(pw_row.indoor),
            }
    except Exception:  # pragma: no cover — model may be absent in some envs
        logger.exception("failed to load tomorrow_planned_workout for user_id=%s", user_id)

    # Fall back: if no DB row, project tomorrow's session via the same
    # picker that drives today's. Keeps the LLM from defaulting to "rest
    # day" just because the planned_workouts table happens to be empty.
    # Conservative weekly_progress: assume today's quality session lands
    # (bump hard_done if today is hard) so the picker respects the
    # alternation rule when projecting tomorrow.
    if tomorrow_planned_payload is None:
        try:
            projected_progress = dict(weekly_prog or {})
            # If today is a quality session category, count it as done for
            # tomorrow's projection — prevents stacking two hard days.
            if today_session in ("threshold", "vo2", "sweet_spot", "anaerobic"):
                projected_progress["hard_sessions_done"] = int(
                    projected_progress.get("hard_sessions_done", 0)
                ) + 1
                if today_session == "vo2":
                    projected_progress["vo2_sessions_done"] = int(
                        projected_progress.get("vo2_sessions_done", 0)
                    ) + 1
                # Today counts as a recent quality session for the 72h guard.
                projected_progress["last_72h_quality_count"] = int(
                    projected_progress.get("last_72h_quality_count", 0)
                ) + 1

            # Tomorrow may cross into a new mesocycle week — re-resolve its block.
            tomorrow_block = await current_block_position(db, user_id, tomorrow_local_date)
            tomorrow_session: SessionType = session_type_for_today(
                phase=phase,
                weekly_progress=projected_progress,
                tsb=float(pmc.get("tsb", 0.0)),
                intensity_ceiling=ceiling,
                day_of_week=tomorrow_local_date.weekday(),
                training_model=training_model,
                is_recovery_week=(tomorrow_block == "recovery"),
            )
            # Use the same per-day-minutes the today flow already computed
            # — close enough for a one-day projection; the picker only
            # needs a window, not a calendar.
            # Same climbing-specificity routing as today's prescription so the
            # tomorrow card rehearses the event demand on quality days too.
            tomorrow_preferred_id = (
                mountain_event_template(
                    session_type=tomorrow_session,
                    event_type=profile.target_event_type,
                    days_to_event=(profile.target_event_date - tomorrow_local_date).days,
                    day_of_week=tomorrow_local_date.weekday(),
                )
                if profile is not None and profile.target_event_date is not None
                else None
            )
            tomorrow_template = pick_template(
                session_type=tomorrow_session,
                athlete_ftp=ftp,
                available_minutes=today_available_minutes,
                preferred_template_id=tomorrow_preferred_id,
                rotation_key=tomorrow_local_date.toordinal(),
            )
            tomorrow_planned_payload = {
                "title": tomorrow_template.name,
                "template_id": tomorrow_template.id,
                "sport": "cycling",
                "duration_minutes": int(round(
                    sum(b.duration_s for b in tomorrow_template.blocks) / 60
                )),
                "indoor": False,
                "category": tomorrow_template.category,
                "predicted_tss": tomorrow_template.base_tss,
                "projected": True,  # marker so downstream knows this isn't
                                    # a user-scheduled row, it's a projection
            }
        except Exception:  # pragma: no cover
            logger.exception("failed to project tomorrow's session for user_id=%s", user_id)

    # Whole-day intraday rhythm — bedtime consistency, stress curve, observed
    # best-training-window, today-vs-same-hours baseline. Best-effort: sparse
    # data degrades field-by-field to None inside compute_day_rhythm (never
    # fabricated), and any failure leaves the key as None.
    day_rhythm_payload: dict | None = None
    try:
        day_rhythm_payload = await compute_day_rhythm(
            db, user_id, target_date=_today_local(), tz=_athlete_tz()
        )
    except Exception:  # pragma: no cover — never break snapshot assembly
        logger.exception("day_rhythm computation failed for user_id=%s", user_id)

    snapshot: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "athlete": {
            "goal_event_date": goal_event_date,
            "goal_target": goal_target,
            "goal_event_type": profile.target_event_type if profile else None,
            "goal_priority": profile.target_priority if profile else None,
            "days_to_goal": (
                (profile.target_event_date - _today_local()).days
                if profile and profile.target_event_date else None
            ),
            "weekly_hours": weekly_hours,
            "ftp": ftp,
            "weight_kg": profile.weight_kg if profile else None,
            "injury_flag": bool(profile.injury_flag) if profile else False,
            "injury_note": profile.injury_note if profile else None,
            "goal_phase": phase,
            "today_available_minutes": today_available_minutes,
            # Best-available LTHR for HR-zone derivation downstream. Priority:
            # stored LTHR → 0.85 × MHR → 0.85 × Tanaka(age) → None.
            "lthr": derived_lthr,
            "max_hr": (
                profile.max_heart_rate if profile and profile.max_heart_rate else None
            ),
            "resting_hr": (
                profile.resting_heart_rate if profile and profile.resting_heart_rate else None
            ),
            # UI depth register ('guide' | 'numbers' | 'pro') — drives how much
            # evidence the rule-based reasoning layer weaves into its prose.
            "detail_level": profile.detail_level if profile else None,
        },
        "readiness": {
            "score": readiness_report.overall,
            "ceiling": readiness_report.ceiling,
            "flags": readiness_report.flags,
            "components": [
                {"name": c.name, "score": c.score, "weight": c.weight, "note": c.note}
                for c in readiness_report.components
            ],
        },
        "acwr": acwr_val,
        "tsb_velocity_2d": tsb_velocity_2d,
        "pmc": pmc,
        "biometrics": {
            "hrv": hrv,
            "rhr": rhr,
            "sleep": sleep,
        },
        "distribution": zones,
        "activities_14d": activities,
        "why_tired": tired,
        "power_profile": power_profile,
        "recent_trend": recent_daily,
        "weekly_intensity_quota": quota,
        "weekly_progress": weekly_prog,
        "today_session_type": today_session,
        "picked_template_id": picked_template.id,
        "picked_template_preview": picked_preview,
        "available_templates": list(TEMPLATES.keys()),
        "rails_context": {
            "ctl": pmc["ctl"],
            "atl": pmc["atl"],
            "tsb": pmc["tsb"],
            "hrv_delta_pct": hrv.get("delta_pct") or 0.0,
            "injury_flag": bool(profile.injury_flag) if profile else False,
            "days_since_rest": days_since_rest,
            "intensity_ceiling": ceiling,
        },
        # Phase 5.3 — post-ride review data (None when today_tss<25 or no activity)
        "post_ride": post_ride_data,
        # Step 7 (today-runthrough) — forward-looking + recap inputs. Each
        # block is optional from the LLM's perspective: build_user_message
        # only renders sections that are present.
        "yesterday_recommendation": yesterday_rec_payload,
        "todays_activities": todays_activities_payload,
        # TODAY's plan truth (audit P0-3): the daily decision + LLM narrative
        # must agree with what is actually planned today — never contradict it.
        "today_planned_workout": today_planned_payload,
        "today_planned_is_rest": today_planned_is_rest,
        "tomorrow_planned_workout": tomorrow_planned_payload,
        # tomorrow_outlook — pre-computed forward projection (CTL ×
        # weekday multiplier) so the LLM has outlook_7d[1] in the user
        # message regardless of which path generates the brief.
        "tomorrow_outlook": tomorrow_outlook_payload,
        # Whole-day intraday rhythm (day_rhythm.py) — lands in CoachBrief
        # evidence['day_rhythm'] via the dict(snapshot) evidence payload.
        "day_rhythm": day_rhythm_payload,
    }
    return snapshot


# ======================================================================
#  Brief generation — LLM path + rule-based fallback
# ======================================================================

def _rails_from_snapshot(snapshot: dict) -> RailContext:
    rc = snapshot["rails_context"]
    return RailContext(
        ctl=float(rc["ctl"]),
        atl=float(rc["atl"]),
        tsb=float(rc["tsb"]),
        hrv_delta_pct=float(rc["hrv_delta_pct"] or 0.0),
        injury_flag=bool(rc["injury_flag"]),
        days_since_rest=int(rc["days_since_rest"]),
    )


# ----------------------------------------------------------------------
# resolve_and_prescribe — the server-side watts authority
# ----------------------------------------------------------------------

# Intensity rank for downgrade fallback when LLM picks above the rails ceiling
_SESSION_RANK: dict[str, int] = {
    "rest_day": 0,
    "recovery_30": 1,
    "z2_endurance_60": 2,
    "z2_endurance_90": 2,
    "z2_long_120": 2,
    "z2_long_180": 2,
    "tempo_3x10": 3,
    "sweet_spot_2x20": 4,
    "threshold_2x15": 5,
    "over_under_3x5": 5,
    "vo2_5x4": 6,
    "vo2_micro_30x30": 6,
}

_CEILING_MAX_RANK: dict[str, int] = {
    "rest": 0,
    "easy": 1,
    "moderate": 4,  # sweet_spot is the moderate ceiling
    "push": 6,
}


def _safe_template_for_ceiling(ceiling: str) -> str:
    return {
        "rest": "rest_day",
        "easy": "recovery_30",
        "moderate": "sweet_spot_2x20",
        "push": "vo2_5x4",
    }.get(ceiling, "z2_endurance_60")


def _verdict_for_template(template_id: str, language: str, ceiling: str, de: bool = False) -> str | None:
    """Verdict line that matches the actual prescribed template — used after
    the safety rails (or post-ride override) replace the LLM's pick so the
    hero verdict doesn't contradict the workout card.
    """
    tpl = TEMPLATES.get(template_id)
    if tpl is None:
        return None
    # Template categories line up with session_type keys for everything except
    # "anaerobic" (which we treat as the closest neighbour, vo2).
    category = "vo2" if tpl.category == "anaerobic" else tpl.category
    if language == "simple":
        if de:
            if ceiling in ("rest", "easy") and category in ("rest", "recovery"):
                return _SIMPLE_VERDICT_BY_CEILING_DE[ceiling]
            return _SIMPLE_VERDICT_BY_SESSION_DE.get(category, tpl.name)
        if ceiling in ("rest", "easy") and category in ("rest", "recovery"):
            return _SIMPLE_VERDICT_BY_CEILING[ceiling]
        return _SIMPLE_VERDICT_BY_SESSION.get(category, tpl.name)
    # technical
    if de:
        technical_by_session_de = {
            "vo2":        "VO2 heute — du bist frisch",
            "threshold":  "Schwelle heute — Qualitätsfenster",
            "sweet_spot": "Sweet Spot heute — Fitness aufbauen",
            "tempo":      "Tempo heute — unter der Schwelle",
            "endurance":  tpl.name,
            "recovery":   "Recovery-Spin — parasympathisch halten",
            "rest":       "Ruhetag — voll parasympathisch",
        }
        return technical_by_session_de.get(category, tpl.name)
    technical_by_session = {
        "vo2":        "VO2 today — you're fresh",
        "threshold":  "Threshold today — quality window",
        "sweet_spot": "Sweet spot today — build fitness",
        "tempo":      "Tempo today — sub-threshold",
        "endurance":  tpl.name,
        "recovery":   "Recovery spin — maintain parasympathetic",
        "rest":       "Rest day — full parasympathetic",
    }
    return technical_by_session.get(category, tpl.name)


def _plain_why(template, de: bool) -> str:
    """Plain-language why fallback for the prescribed-workout card. Reuses the
    register-aware _what_sentence in its plain ("numbers") register so the EN
    side never serves the lab-register template.purpose ('canonical Z5
    stimulus') — that jargon stays on the dict's separate `purpose` field for
    the pro detail view. DE uses the beginner-safe purpose_de."""
    return _what_sentence(template, "numbers", de)


def _rewrite_prescribed_workout(
    template_id: str,
    ftp: int,
    duration_minutes_hint: int | None,
    why_this_workout: str | None,
    lthr: int | None = None,
    de: bool = False,
) -> dict:
    """Re-derive watts from FTP for the given template, applying a duration
    nudge if the LLM's suggested duration_minutes differs by <= ±15% from the
    template default.
    """
    template = get_template(template_id)
    if template is None:
        # Unknown id — fall back to Z2 endurance 60 as the safest default
        template = TEMPLATES["z2_endurance_60"]
        template_id = template.id

    default_minutes = int(round(sum(b.duration_s for b in template.blocks) / 60)) or 60
    duration_scale = 1.0
    if duration_minutes_hint and duration_minutes_hint > 0 and default_minutes > 0:
        raw_scale = duration_minutes_hint / default_minutes
        # Clamp to ±15% so a rogue LLM cannot triple the ride
        duration_scale = max(0.85, min(1.15, raw_scale))

    if ftp <= 0:
        # Cannot derive watts — return a minimal stub using template base_tss.
        # Frontend will show zone/RPE without watts.
        return {
            "template_id": template_id,
            "title": template.name,
            "title_de": template.name_de,
            "framework_cited": template.framework_cited,
            "purpose": template.purpose,
            "purpose_de": template.purpose_de,
            "category": template.category,
            "duration_minutes": default_minutes,
            "total_duration_s": default_minutes * 60,
            "predicted_tss": template.base_tss,
            "predicted_ef_range": [1.30, 1.60],
            "blocks": [
                {
                    "name": b.name,
                    "duration_s": b.duration_s,
                    "target_watts_low": 0,
                    "target_watts_high": 0,
                    "target_pct_ftp": b.target_pct_ftp,
                    "zone": b.zone,
                    "rpe": b.target_rpe,
                }
                for b in template.blocks
            ],
            "why_this_workout": why_this_workout or _plain_why(template, de),
        }

    prescribed: PrescribedWorkout = parametrize_template(
        template, int(ftp), duration_scale=duration_scale, lthr=lthr,
    )
    out = prescribed_workout_to_dict(prescribed)
    # Locale-honest fallback: when the caller has no bespoke "why", the
    # template purpose must speak the athlete's language (round-2 review:
    # DE users saw raw EN template prose on Today / Einheit des Tages).
    out["why_this_workout"] = why_this_workout or _plain_why(template, de)
    return out


def sanitize_outlook_7d(raw: object) -> list[dict] | None:
    """Coerce an LLM-emitted outlook_7d into a clean list of OutlookEntry-shaped
    dicts, or None. Drops anything that isn't a well-formed entry (strings,
    fragments, out-of-range offsets, non-numeric TSS) — garbage must never be
    persisted; a brief without an outlook is fine, a poisoned one 500s reads."""
    if not isinstance(raw, list):
        return None
    entries: list[dict] = []
    for e in raw:
        if not isinstance(e, dict):
            continue
        try:
            day_offset = int(e.get("day_offset"))  # type: ignore[arg-type]
            suggested_tss = float(e.get("suggested_tss"))  # type: ignore[arg-type]
        except (TypeError, ValueError):
            continue
        if not 0 <= day_offset <= 6:
            continue
        note = e.get("note")
        entries.append({
            "day_offset": day_offset,
            "suggested_tss": suggested_tss,
            "note": note if isinstance(note, str) else "",
        })
    return entries or None


def resolve_and_prescribe(snapshot: dict, llm_payload: dict) -> dict:
    """Validate the LLM's prescribed workout against the template library and
    rewrite watts from the athlete's FTP.

    Workflow:
        1. Pull template_id from llm_payload.prescribed_workout.
        2. If unknown → substitute with snapshot.picked_template_id.
        3. If the chosen template's intensity exceeds rails.intensity_ceiling →
           downgrade to the safe template for that ceiling.
        4. Re-parametrise with FTP (LLM's watts are discarded; duration is
           nudged ±15% at most).
        5. Do the same for alternates (minus the duration hint — alternates use
           template defaults).

    Returns the payload with corrected `prescribed_workout` + `alternates`.
    """
    athlete = snapshot.get("athlete", {})
    ftp = int(athlete.get("ftp") or 0)
    rails_ctx = snapshot.get("rails_context", {})
    ceiling = str(rails_ctx.get("intensity_ceiling", "push"))
    # LTHR for HR-target derivation. Snapshot carries the derived value
    # under athlete.lthr; falls back to None.
    lthr_for_hr = athlete.get("lthr")
    lthr_for_hr = int(lthr_for_hr) if isinstance(lthr_for_hr, (int, float)) and lthr_for_hr > 0 else None

    llm_workout = llm_payload.get("prescribed_workout") or {}
    # Defensive (live-observed 2026-07-20): the LLM occasionally emits
    # prescribed_workout as a bare template-id STRING instead of an object.
    # Crashing here silently downgraded the athlete to the rule-based brief;
    # coerce instead — the id is all the resolver needs (watts are rewritten
    # server-side anyway).
    if isinstance(llm_workout, str):
        llm_workout = {"template_id": llm_workout}
    elif not isinstance(llm_workout, dict):
        llm_workout = {}
    template_id = str(llm_workout.get("template_id") or "")
    original_template_id = template_id
    why = llm_workout.get("why_this_workout")

    # Step 1+2: validate template_id
    if template_id not in TEMPLATES:
        template_id = snapshot.get("picked_template_id") or "z2_endurance_60"

    # Step 3: enforce ceiling
    rank = _SESSION_RANK.get(template_id, 0)
    max_rank = _CEILING_MAX_RANK.get(ceiling, 6)
    if rank > max_rank:
        template_id = _safe_template_for_ceiling(ceiling)
        # Note the downgrade in the rationale if the LLM's copy contradicts it
        if why:
            why = (
                f"{why.rstrip()} "
                f"[Auto-downgraded to {template_id} — intensity ceiling is '{ceiling}']"
            )
        else:
            why = (
                f"Downgraded to {template_id} per safety rails: "
                f"intensity ceiling is '{ceiling}'."
            )

    # Post-ride override: if the athlete completed a RIDE today we force
    # rest_day regardless of what the LLM picked — the post_ride_review
    # replaces the workout card in the UI. SPORT-AWARE (audit P0-2): a gym
    # or run log on a bike-plan day does NOT flip the bike plan to rest;
    # the plan stays the instruction and the review renders alongside.
    post_ride_present = bool(snapshot.get("post_ride"))
    post_ride_forces_rest = False
    if post_ride_present:
        from app.services.sport import sport_family as _fam_rp
        _pr = snapshot.get("post_ride") or {}
        _pr_sport = _pr.get("primary_sport") if isinstance(_pr, dict) else None
        post_ride_forces_rest = _pr_sport is None or _fam_rp(_pr_sport) == "cycling"
    if post_ride_forces_rest:
        template_id = "rest_day"
        why = why or "You've already trained today — review below."

    # Planned-rest override (audit P0-3): when TODAY's PlannedWorkout row says
    # rest, the brief must never prescribe a session — every surface renders
    # the ONE daily decision, and the decision's precedence puts the plan's
    # rest day above the readiness-driven pick. Without this, the rule-based
    # fallback happily prescribed a Z2 spin on a Ruhetag while Today/Recovery
    # said rest (the audit's four-voices blocker, alive on the Plan tab).
    planned_rest_forces_rest = bool(snapshot.get("today_planned_is_rest")) and not post_ride_present
    if planned_rest_forces_rest and template_id != "rest_day":
        template_id = "rest_day"
        why = None  # rest-day copy comes from the verdict/template, not the old pick

    # If the rails (or post-ride/planned-rest override) replaced the LLM's
    # pick, the LLM's verdict line was written for the *old* workout — it'll
    # read "Hard intervals — you're fresh" while the card now shows an easy
    # spin. Realign verdict to the actual prescribed template so the hero
    # matches the recommendation.
    template_changed = (
        original_template_id in TEMPLATES and original_template_id != template_id
    ) or (rank > max_rank) or post_ride_forces_rest or planned_rest_forces_rest
    if template_changed:
        language = "technical" if snapshot.get("language") == "technical" else "simple"
        realigned = _verdict_for_template(template_id, language, ceiling)
        if realigned:
            llm_payload = dict(llm_payload)
            llm_payload["verdict"] = realigned

    # Step 4: rewrite watts
    duration_hint = llm_workout.get("duration_minutes")
    try:
        duration_hint = int(duration_hint) if duration_hint is not None else None
    except (TypeError, ValueError):
        duration_hint = None

    new_workout = _rewrite_prescribed_workout(template_id, ftp, duration_hint, why, lthr=lthr_for_hr, de=snapshot.get("locale") == "de")

    # Step 5: alternates — validate ids, rewrite watts
    llm_alternates = llm_payload.get("alternates") or []
    resolved_alternates: list[dict] = []
    seen_labels: set[str] = set()
    for alt in llm_alternates:
        if not isinstance(alt, dict):
            continue
        label = str(alt.get("label", "")).strip()
        if label not in ("less_time", "recover") or label in seen_labels:
            continue
        alt_tid = str(alt.get("template_id") or "")
        if alt_tid not in TEMPLATES:
            # Sensible defaults per label
            alt_tid = "z2_endurance_60" if label == "less_time" else "recovery_30"
        one_liner = str(alt.get("one_liner") or "").strip()[:80]
        if not one_liner:
            tpl = TEMPLATES[alt_tid]
            one_liner = (
                f"Shorter: {tpl.name}" if label == "less_time"
                else f"Easier: {tpl.name}"
            )
        resolved_alternates.append({
            "label": label,
            "one_liner": one_liner,
            "template_id": alt_tid,
        })
        seen_labels.add(label)

    # Ensure both required labels are present
    if "less_time" not in seen_labels:
        default_tid = "z2_endurance_60" if template_id != "z2_endurance_60" else "recovery_30"
        tpl = TEMPLATES[default_tid]
        resolved_alternates.insert(0, {
            "label": "less_time",
            "one_liner": f"Shorter: {tpl.name}",
            "template_id": default_tid,
        })
    if "recover" not in seen_labels:
        resolved_alternates.append({
            "label": "recover",
            "one_liner": "Full recovery: 30 min Z1 spin",
            "template_id": "recovery_30",
        })

    out = dict(llm_payload)
    out["prescribed_workout"] = new_workout
    out["alternates"] = resolved_alternates[:2]
    # Defensive (live-observed 2026-07-21, same class as the bare-string
    # prescribed_workout above): the LLM occasionally emits outlook_7d as a
    # raw unparsed tool-call fragment (a STRING like
    # '\n<parameter name="day_offset">6'). Persisting it verbatim poisoned
    # the cache and 500'd every subsequent /coach/brief read. Sanitize here
    # so garbage never reaches the row.
    out["outlook_7d"] = sanitize_outlook_7d(llm_payload.get("outlook_7d"))

    # Post-ride review — if the snapshot carries post_ride data, ensure the
    # payload has a complete review. Take the LLM's narrative fields when
    # present and fill any missing ones from the deterministic builder.
    if post_ride_present:
        snapshot_post = snapshot.get("post_ride") or {}
        language = snapshot.get("language", "simple")
        # German rendering flag — the LLM path (this function) previously
        # dropped `de`, so German briefs rendered the review in English.
        # Mirror the rule-based path: render German whenever the UI locale is de.
        de = snapshot.get("ui_locale") == "de"
        fallback_review = _build_post_ride_review(snapshot_post, language, de=de)
        llm_review = llm_payload.get("post_ride_review")
        if isinstance(llm_review, dict):
            # Merge — LLM wins on narrative fields, compliance numbers always
            # come from the deterministic scorer (LLM can't override math).
            merged = dict(fallback_review)
            # The headline is a fixed, grade-keyed phrase. The LLM tends to emit
            # it in English even for a German brief, which would clobber the
            # localized fallback. For German, always keep the German headline
            # from the grade map; only let the LLM override the longer,
            # genuinely-generated narrative fields.
            narrative_keys = ("physiological_read", "goal_trajectory", "next_session_nudge")
            if not de:
                narrative_keys = ("headline", *narrative_keys)
            # Ungraded day (sport gate) — NEVER emit a nudge, not even an
            # LLM-written one: there is no prescription-vs-actual to coach on.
            _comp_for_merge = snapshot_post.get("compliance") or {}
            if _comp_for_merge.get("graded", True) is False:
                narrative_keys = tuple(
                    k for k in narrative_keys if k != "next_session_nudge"
                )
            for narrative_key in narrative_keys:
                if isinstance(llm_review.get(narrative_key), str) and llm_review[narrative_key].strip():
                    merged[narrative_key] = llm_review[narrative_key]
            out["post_ride_review"] = merged
        else:
            out["post_ride_review"] = fallback_review
    else:
        out["post_ride_review"] = None

    return out


# ----------------------------------------------------------------------
# Rule-based fallback — always produces a complete PrescribedWorkout
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Language-aware phrase maps for rule-based fallback
# ----------------------------------------------------------------------

# Category-based plain-English titles (simple mode)
_SIMPLE_TITLE_BY_CATEGORY: dict[str, str] = {
    "recovery":   "Easy spin",
    "endurance":  "Chill ride",
    "tempo":      "Steady push",
    "sweet_spot": "Focused effort",
    "threshold":  "Hard ride",
    "vo2":        "Hard intervals",
    "anaerobic":  "Sprint day",
    "rest":       "Rest day",
}

# Simple-mode verdict phrases by (ceiling, session_type)
_SIMPLE_VERDICT_BY_CEILING: dict[str, str] = {
    "rest":     "Rest up — let your body heal",
    "easy":     "Take it easy today",
    "moderate": "Steady effort — nothing crazy",
    "push":     "You're good to go",
}

_SIMPLE_VERDICT_BY_SESSION: dict[str, str] = {
    "vo2":        "Hard intervals — you're fresh",
    "threshold":  "Hard ride — quality day",
    "sweet_spot": "Focused effort today",
    "tempo":      "Steady push today",
    "endurance":  "Easy hour on the bike",
    "recovery":   "Easy spin — just move",
    "rest":       "Rest day — legs up",
}

# Simple-mode alternate one-liners (smart-friend-at-the-bike-shop tone)
_SIMPLE_ALTERNATE_LESS_TIME = "Got 30 min? Just spin the legs."
_SIMPLE_ALTERNATE_RECOVER = "Tired? Put your legs up, do nothing."

# German (informal du/dein) parallels for the simple-mode maps above.
_SIMPLE_TITLE_BY_CATEGORY_DE: dict[str, str] = {
    "recovery":   "Lockeres Ausrollen",
    "endurance":  "Entspannte Ausfahrt",
    "tempo":      "Gleichmäßiger Druck",
    "sweet_spot": "Fokussierte Einheit",
    "threshold":  "Harte Ausfahrt",
    "vo2":        "Harte Intervalle",
    "anaerobic":  "Sprint-Tag",
    "rest":       "Ruhetag",
}

_SIMPLE_VERDICT_BY_CEILING_DE: dict[str, str] = {
    "rest":     "Ruh dich aus — lass deinen Körper heilen",
    "easy":     "Nimm's heute locker",
    "moderate": "Gleichmäßige Einheit — nichts Verrücktes",
    "push":     "Du bist bereit — leg los",
}

_SIMPLE_VERDICT_BY_SESSION_DE: dict[str, str] = {
    "vo2":        "Harte Intervalle — du bist frisch",
    "threshold":  "Harte Ausfahrt — Qualitätstag",
    "sweet_spot": "Fokussierte Einheit heute",
    "tempo":      "Gleichmäßiger Druck heute",
    "endurance":  "Lockere Stunde auf dem Rad",
    "recovery":   "Lockeres Ausrollen — einfach bewegen",
    "rest":       "Ruhetag — Beine hoch",
}

_SIMPLE_ALTERNATE_LESS_TIME_DE = "Nur 30 min? Roll einfach die Beine locker."
_SIMPLE_ALTERNATE_RECOVER_DE = "Müde? Beine hoch, mach gar nichts."


# ======================================================================
# Post-ride review narrative templates — language + grade aware
# ======================================================================

# Short headlines by grade (shared — the grade pill carries the tone).
_HEADLINE_BY_GRADE_SIMPLE: dict[str, str] = {
    "perfect":     "You nailed it",
    "strong":      "Solid work",
    "okay":        "Not bad — a bit off",
    "overcooked":  "That was more than needed",
    "undercooked": "Lighter than planned",
}

_HEADLINE_BY_GRADE_SIMPLE_DE: dict[str, str] = {
    "perfect":     "Perfekt getroffen",
    "strong":      "Solide Arbeit",
    "okay":        "Nicht schlecht — ein bisschen daneben",
    "overcooked":  "Das war mehr als nötig",
    "undercooked": "Leichter als geplant",
}

_HEADLINE_BY_GRADE_TECHNICAL_DE: dict[str, str] = {
    "perfect":     "Perfekte Ausführung",
    "strong":      "Starke Einheit",
    "okay":        "Okaye Einheit — lockere Toleranz",
    "overcooked":  "Übertrieben — TSS über Ziel",
    "undercooked": "Zu leicht — unter der vorgegebenen Last",
}

_HEADLINE_BY_GRADE_TECHNICAL: dict[str, str] = {
    "perfect":     "Perfect execution",
    "strong":      "Strong session",
    "okay":        "Okay session — margins loose",
    "overcooked":  "Overcooked — TSS above target",
    "undercooked": "Undercooked — below prescribed load",
}

# Simple-mode next-session nudges keyed by (grade, session_type category).
# Grade drives tone; session_type hints at what to do next.
def _simple_nudge(grade: str, session_type: str, phase: str, de: bool = False) -> str:
    if de:
        if grade == "perfect":
            return "Morgen: Ruhe ist verdient — du hast genau das geholt, was heute nötig war."
        if grade == "strong":
            return "Iss gut, schlaf tief. Morgen bleibt die Ausfahrt locker."
        if grade == "okay":
            return "Kürzer als geplant — völlig okay. Die Woche fängt das auf."
        if grade == "overcooked":
            return "Erhol dich heute Abend richtig. Morgen ist ein lockerer Tag — im Ernst."
        # undercooked
        if session_type == "vo2":
            return "Häng beim nächsten harten Intervallblock 5-10 min dran."
        if session_type == "threshold":
            return "Dein nächster Schwellenblock darf etwas länger sein — ziel auf das volle Ziel."
        return "Deine nächste Ausfahrt darf etwas länger werden — die Beine geben es her."
    if grade == "perfect":
        return "Tomorrow: rest is earned — you got exactly what today needed."
    if grade == "strong":
        return "Eat well, sleep hard. Tomorrow's ride stays easy."
    if grade == "okay":
        return "Shorter than planned — fine. The week absorbs it."
    if grade == "overcooked":
        return "Recover hard tonight. Tomorrow's an easy day — seriously."
    # undercooked
    if session_type == "vo2":
        return "Add 5-10 min to your next hard interval block."
    if session_type == "threshold":
        return "Your next threshold block should hit a bit longer — aim for the full target."
    return "Your next ride can stretch a bit longer — you have the legs for it."


def _technical_nudge(grade: str, session_type: str, phase: str, de: bool = False) -> str:
    if de:
        if grade == "perfect":
            return "Erholung heute Abend ist verdient — parasympathisches Fenster für Anpassung offen."
        if grade == "strong":
            return f"Konsolidieren: Z1-Ausrollen oder Ruhe morgen, damit der {session_type}-Reiz absorbiert wird."
        if grade == "okay":
            return "Etwas neben der Vorgabe — kein Problem. Der Wochen-Load gleicht das aus."
        if grade == "overcooked":
            return "ATL wird heute Abend hochschießen; TSB fällt → Ruhetag laut Banister erforderlich."
        # undercooked
        if session_type == "vo2":
            return "Häng beim nächsten VO2-Block ein Intervall dran (4-5→5-6); Coggan-Z5-Reiz braucht mindestens 20 min Zeit bei VO2max."
        if session_type == "threshold":
            return "Dehne die Schwellenintervalle im nächsten Block 15→18 min, um die LT2-Anpassungsschwelle zu treffen."
        return "Nächster Endurance-Block kann 10-15 min länger werden, um die San-Millán-Z2-Grenze zu reizen."
    if grade == "perfect":
        return "Recovery tonight is earned — parasympathetic window open for adaptation."
    if grade == "strong":
        return f"Consolidate: Z1 spin or rest tomorrow so {session_type} stimulus absorbs."
    if grade == "okay":
        return "A bit off the prescription — no problem. The weekly load absorbs it."
    if grade == "overcooked":
        return "ATL will spike tonight; TSB dropping → rest day required per Banister."
    # undercooked
    if session_type == "vo2":
        return "Add one more interval (4-5→5-6) next VO2 block; Coggan Z5 stimulus needs minimum 20 min time-at-VO2max."
    if session_type == "threshold":
        return "Stretch threshold intervals 15→18 min next block to hit LT2 adaptation threshold."
    return "Next endurance block can extend 10-15 min to stimulate San Millán Z2 ceiling."


# Physiological read generators — concise "what your body did" sentences.
def _simple_physio_read(compliance: dict, trajectory: dict, de: bool = False) -> str:
    parts: list[str] = []
    grade = compliance.get("grade")
    ef = compliance.get("ef")
    vi = compliance.get("variability_index")
    dur = compliance.get("duration", {})
    tss = compliance.get("tss", {})
    actual_min = int(round(dur.get("actual", 0)))

    if de:
        # Opening line — what happened
        if grade == "perfect":
            parts.append(
                f"Du bist {actual_min} Minuten genau im richtigen Bereich gefahren — "
                "die Grundlagenausdauer baut sich still auf."
            )
        elif grade == "strong":
            parts.append(
                f"{actual_min} Minuten im Kasten, genau im Bereich dessen, was heute gefragt war."
            )
        elif grade == "okay":
            parts.append(
                f"{actual_min} Minuten geschafft — etwas neben dem Ideal, aber trotzdem sinnvolle Zeit auf dem Rad."
            )
        elif grade == "overcooked":
            delta = tss.get("delta_pct", 0)
            parts.append(
                f"Das war größer als der Plan — {abs(int(delta))}% über dem Ziel. "
                "Dein Körper wird es spüren."
            )
        else:  # undercooked
            parts.append(
                f"Leichter als heute nötig — {actual_min} Minuten, obwohl der Plan größer war."
            )

        # Second sentence — EF / VI observation
        if ef is not None and ef >= 1.4:
            parts.append(
                "Deine Herzfrequenz blieb relativ zur Anstrengung niedrig — da zeigt sich Grundlagenausdauer."
            )
        elif ef is not None and ef < 1.1:
            parts.append("Deine Herzfrequenz lief für die getretene Leistung hoch — du bist vielleicht ermüdet.")
        if vi is not None and vi > 1.08:
            parts.append("Das Tempo war unruhig — gleichmäßigere Einheiten holen mehr aus derselben Ausfahrt.")
        elif vi is not None and vi <= 1.06 and grade in ("perfect", "strong"):
            parts.append("Du bist gleichmäßig gefahren — gleichmäßig getretene Ausfahrten arbeiten effizient.")

        return " ".join(parts[:3])

    # Opening line — what happened
    if grade == "perfect":
        parts.append(
            f"You rode {actual_min} minutes at exactly the right effort — "
            "base fitness quietly building."
        )
    elif grade == "strong":
        parts.append(
            f"{actual_min} minutes in the books, right in the ballpark of what today asked for."
        )
    elif grade == "okay":
        parts.append(
            f"{actual_min} minutes done — a bit off the ideal but still useful time on the bike."
        )
    elif grade == "overcooked":
        delta = tss.get("delta_pct", 0)
        parts.append(
            f"That was bigger than the plan — {abs(int(delta))}% above target. "
            "Your body will feel it."
        )
    else:  # undercooked
        parts.append(
            f"Lighter than today called for — {actual_min} minutes when the plan was bigger."
        )

    # Second sentence — EF / VI observation (plain English)
    if ef is not None and ef >= 1.4:
        parts.append(
            "Your heart rate stayed low relative to your effort — that's base fitness showing up."
        )
    elif ef is not None and ef < 1.1:
        parts.append("Your heart rate ran high for the power you put out — you might be fatigued.")
    if vi is not None and vi > 1.08:
        parts.append("Pacing was choppy — smoother efforts get more out of the same ride.")
    elif vi is not None and vi <= 1.06 and grade in ("perfect", "strong"):
        parts.append("You held steady — evenly paced rides do their work efficiently.")

    return " ".join(parts[:3])


def _technical_physio_read(compliance: dict, trajectory: dict, de: bool = False) -> str:
    parts: list[str] = []
    grade = compliance.get("grade")
    ef = compliance.get("ef")
    vi = compliance.get("variability_index")
    if_pair = compliance.get("intensity_factor") or {}
    tss = compliance.get("tss", {})
    actual_tss = int(round(tss.get("actual", 0)))
    target_tss = int(round(tss.get("target", 0)))

    if de:
        # Opening sentence — data-rich
        if grade == "perfect":
            parts.append(
                f"TSS {actual_tss} vs. Ziel {target_tss} — innerhalb von Coggans ±10%-Compliance-Fenster."
            )
        elif grade == "strong":
            parts.append(
                f"TSS {actual_tss} (Ziel {target_tss}) — innerhalb des Starke-Compliance-Bands."
            )
        elif grade == "okay":
            parts.append(
                f"TSS {actual_tss} vs. Ziel {target_tss} — locker, aber innerhalb der 30%-Toleranz."
            )
        elif grade == "overcooked":
            parts.append(
                f"TSS {actual_tss} vs. Ziel {target_tss} ({tss.get('delta_pct', 0):+.0f}%) — "
                "über Coggans Compliance-Obergrenze."
            )
        else:
            parts.append(
                f"TSS {actual_tss} vs. Ziel {target_tss} ({tss.get('delta_pct', 0):+.0f}%) — "
                "unter der vorgegebenen Last."
            )

        # EF commentary — San Millán framework
        if ef is not None:
            if ef >= 1.45:
                parts.append(
                    f"EF {ef} signalisiert vertiefte aerobe Grundlage nach San Milláns Pw:HR-Framework."
                )
            elif ef < 1.15:
                parts.append(
                    f"EF {ef} ist niedrig — entweder Restermüdung oder eine harte Anstrengung, die die HF nahe ans Limit treibt."
                )
            else:
                parts.append(f"EF {ef} — im erwarteten aeroben Band für diesen Einheitstyp.")

        # VI commentary — Coggan variability
        if vi is not None:
            if vi <= 1.06:
                parts.append(f"VI {vi} — Steady-State-Pacing, Coggan-Variabilität eng.")
            elif vi > 1.10:
                parts.append(f"VI {vi} — Pacing-Variabilität über Ziel; an gleichmäßigerer Leistung arbeiten.")

        return " ".join(parts[:3])

    # Opening sentence — data-rich
    if grade == "perfect":
        parts.append(
            f"TSS {actual_tss} vs target {target_tss} — within Coggan's ±10% compliance window."
        )
    elif grade == "strong":
        parts.append(
            f"TSS {actual_tss} (target {target_tss}) — within strong-compliance band."
        )
    elif grade == "okay":
        parts.append(
            f"TSS {actual_tss} vs target {target_tss} — loose but inside the 30% margin."
        )
    elif grade == "overcooked":
        parts.append(
            f"TSS {actual_tss} vs target {target_tss} ({tss.get('delta_pct', 0):+.0f}%) — "
            "above Coggan's compliance ceiling."
        )
    else:
        parts.append(
            f"TSS {actual_tss} vs target {target_tss} ({tss.get('delta_pct', 0):+.0f}%) — "
            "below prescribed load."
        )

    # EF commentary — San Millán framework
    if ef is not None:
        if ef >= 1.45:
            parts.append(
                f"EF {ef} signals aerobic base deepening per San Millán's Pw:HR framework."
            )
        elif ef < 1.15:
            parts.append(
                f"EF {ef} is low — either residual fatigue or a hard effort pushing HR near ceiling."
            )
        else:
            parts.append(f"EF {ef} — within expected aerobic band for this session type.")

    # VI commentary — Coggan variability
    if vi is not None:
        if vi <= 1.06:
            parts.append(f"VI {vi} — steady-state pacing, Coggan variability tight.")
        elif vi > 1.10:
            parts.append(f"VI {vi} — pacing variability above target; work on steadier output.")

    return " ".join(parts[:3])


def _simple_trajectory_narrative(trajectory: dict, de: bool = False) -> str:
    hook = trajectory.get("narrative_hook")
    if not hook:
        if de:
            return "Du baust Kontinuität auf — und genau darum geht's."
        return "You're building consistency — that's the whole game."
    # Strip technical terms from hook if any slipped in (defensive — the
    # trajectory module emits plain-enough text but we scrub anyway for simple).
    replacements = [
        ("CTL ", "fitness "),
        ("TSB", "freshness"),
        ("Banister", "the fitness/fatigue model"),
        ("Mujika", "taper research"),
        ("Coggan", ""),
    ]
    out = hook
    for term, repl in replacements:
        out = out.replace(term, repl)
    # Strip "TSS" tokens since simple mode shouldn't use them.
    # Handle "TSS/week", "TSS total" etc.
    out = out.replace(" TSS/week", "/week of training load").replace(" TSS", " training points")
    return out.strip()


def _technical_trajectory_narrative(trajectory: dict, de: bool = False) -> str:
    hook = trajectory.get("narrative_hook")
    if hook:
        return hook
    if de:
        return (
            f"CTL {trajectory.get('ctl_now', 0):.1f}, 7d-Delta {trajectory.get('ctl_7d_delta', 0):+.1f}. "
            "Aktuelles Muster fortsetzen."
        )
    return (
        f"CTL {trajectory.get('ctl_now', 0):.1f}, 7d delta {trajectory.get('ctl_7d_delta', 0):+.1f}. "
        "Continue current pattern."
    )


def _build_post_ride_review(
    snapshot_post_ride: dict,
    language: str,
    de: bool = False,
) -> dict:
    """Assemble the complete post_ride_review dict for the brief payload.

    Called by _rule_based_brief. The LLM path also uses this as a fallback
    when the model forgets to populate narrative fields — so the shape is
    always complete.
    """
    compliance = snapshot_post_ride.get("compliance") or {}
    trajectory = snapshot_post_ride.get("trajectory") or {}
    target_tpl = snapshot_post_ride.get("target_template") or {}

    grade = compliance.get("grade", "okay")
    session_type = compliance.get("session_type", "endurance")
    phase = compliance.get("phase", "maintenance")

    # Ungraded day (sport gate: graded=False, or no graded activity → grade
    # None): render a neutral "logged" review. NEVER a nudge — there is no
    # prescription-vs-actual comparison to coach on.
    ungraded = compliance.get("graded", True) is False or not grade
    if ungraded:
        headline = "Einheit erfasst" if de else "Session logged"
        physio = (
            "Einheit erfasst — sie zählt für deine Woche, wird aber nicht gegen den heutigen Plan bewertet." if de
            else "Session logged — it counts toward your week, but isn't graded against today's plan."
        )
        trajectory_narrative = (
            _simple_trajectory_narrative(trajectory, de=de)
            if language == "simple"
            else _technical_trajectory_narrative(trajectory, de=de)
        )
        nudge = ""
    elif language == "simple":
        if de:
            # German draws from the deep bank (100+ per grade, cycling by day of
            # year); the single-headline dict is the fallback for a grade the
            # bank does not cover. English keeps its one headline per grade
            # until its own bank is written.
            headline = saying_for(
                EXECUTION_SAYINGS_DE.get(grade, []), date.today(), grade
            ) or _HEADLINE_BY_GRADE_SIMPLE_DE.get(grade, "Einheit erfasst")
        else:
            headline = _HEADLINE_BY_GRADE_SIMPLE.get(grade, "Session logged")
        physio = _simple_physio_read(compliance, trajectory, de=de)
        trajectory_narrative = _simple_trajectory_narrative(trajectory, de=de)
        nudge = _simple_nudge(grade, session_type, phase, de=de)
    else:
        if de:
            # Technical mode keeps its number-forward headlines ("Übertrieben —
            # TSS über Ziel"): the bank is written in the plain-English register
            # and would drop the figure the technical reader came for.
            headline = _HEADLINE_BY_GRADE_TECHNICAL_DE.get(grade, "Einheit erfasst")
        else:
            headline = _HEADLINE_BY_GRADE_TECHNICAL.get(grade, "Session logged")
        physio = _technical_physio_read(compliance, trajectory, de=de)
        trajectory_narrative = _technical_trajectory_narrative(trajectory, de=de)
        nudge = _technical_nudge(grade, session_type, phase, de=de)

    activities = snapshot_post_ride.get("activities") or []
    totals = snapshot_post_ride.get("totals") or {
        "tss": 0.0,
        "duration_minutes": 0,
        "distance_km": 0.0,
        "count": 0,
    }
    # Sport-aware count: prefer the same-discipline session count (set by
    # build_snapshot) so a gym log alongside a ride does not flip the endurance
    # review into multi-session mode. Falls back to the raw activity count for
    # older payloads that predate this field.
    count = int(
        snapshot_post_ride.get("primary_session_count")
        or totals.get("count")
        or len(activities)
    )

    # Step 3 — multi-activity headline override. When n>=2 the LLM/fallback
    # narrative refers to "today's sessions" rather than a single ride; the
    # top-level grade is None (per-ride chips render instead) so the headline
    # should not promise a single grade.
    if count >= 2:
        if de:
            headline = "Zwei Einheiten erfasst" if count == 2 else f"{count} Einheiten erfasst"
        else:
            headline = "Two sessions logged" if count == 2 else f"{count} sessions logged"
        # Top-level grade is None for multi-session — frontend hides the
        # grade pill and renders per-ride chips on each row.
        emitted_grade: str | None = None
    else:
        emitted_grade = grade

    return {
        "grade": emitted_grade,
        "headline": headline,
        "duration": compliance.get("duration", {}),
        "tss": compliance.get("tss", {}),
        "intensity_factor": compliance.get("intensity_factor"),
        "variability_index": compliance.get("variability_index"),
        "ef": compliance.get("ef"),
        "decoupling_pct": compliance.get("decoupling_pct"),
        "physiological_read": physio,
        "goal_trajectory": trajectory_narrative,
        "next_session_nudge": nudge,
        "target_template_id": target_tpl.get("id", ""),
        "target_template_title": target_tpl.get("title", ""),
        "session_type": session_type,
        # Step 3 — pass through the per-activity wrap-ups + totals.
        "activities": list(activities),
        "totals": dict(totals),
    }


# ======================================================================
# Reasoning layer — coach-voice daily explanation (guide | numbers | pro)
# ======================================================================
#
# The rule-based brief must read like a coach explaining, never a system
# reporting. Every register produces a coherent 2-4 sentence narrative:
#   1. WHAT the session does physiologically (plain language, woven from the
#      template's purpose/purpose_de — never raw EN prose in a DE brief),
#   2. WHY today (actual recovery signals when present; honest "no signals
#      yet" for day-1 accounts — never a fabricated "stable since yesterday"),
#   3. what it builds toward (humanized phase name + goal countdown; estimated
#      fitness framed as estimated).
#
# Registers (profile.detail_level, falling back to the language mode):
#   guide   — plain German/English, zero acronyms or raw metrics.
#   numbers — the same narrative with the key numbers embedded in prose.
#   pro     — full evidence chain (readiness, TSB/CTL, ramp, phase, goal
#             countdown) still as flowing prose — never a "TSB 0, CTL 0"
#             fragment dump.

_PHASE_WORDS_EN: dict[str, str] = {
    "base": "Base", "build": "Build", "peak": "Peak", "taper": "Taper",
    "race": "Race", "offseason": "Off-season", "maintenance": "Maintenance",
}
_PHASE_WORDS_DE: dict[str, str] = {
    "base": "Grundlage", "build": "Aufbau", "peak": "Peak", "taper": "Taper",
    "race": "Rennen", "offseason": "Nebensaison", "maintenance": "Erhaltung",
}


def _phase_human(phase: object, de: bool = False) -> str | None:
    """Humanize a phase code ('base2' → 'Grundlage 2' / 'Base 2').

    Mirrors the frontend phaseLabel convention — raw codes like 'base2' or
    'offseason' must never reach athlete-facing copy.
    """
    if not phase:
        return None
    raw = str(phase).strip()
    m = re.match(r"^([a-z]+)\s*(\d+)?$", raw, re.IGNORECASE)
    stem = (m.group(1) if m else raw).lower()
    words = _PHASE_WORDS_DE if de else _PHASE_WORDS_EN
    label = next((v for k, v in words.items() if stem.startswith(k)), None)
    if label is None:
        label = raw.capitalize()
    if m and m.group(2):
        label = f"{label} {m.group(2)}"
    return label


def _phase_stem(phase: object) -> str:
    if not phase:
        return ""
    m = re.match(r"^([a-z]+)", str(phase).strip(), re.IGNORECASE)
    return (m.group(1).lower() if m else str(phase).lower())


def _detail_register(snapshot: dict) -> str:
    """Resolve the reasoning register: profile detail_level wins; the request
    language is the fallback for accounts that never chose a depth."""
    dl = (snapshot.get("athlete") or {}).get("detail_level")
    if dl in ("guide", "numbers", "pro"):
        return str(dl)
    return "pro" if snapshot.get("language") == "technical" else "guide"


def _signal_state(snapshot: dict) -> dict:
    """Honesty flags derived from the same decision inputs the brief builder
    already receives — never recomputed elsewhere.

    day_one           — no recovery signals AND no training history: every
                        claim about "your signals" would be fabricated.
    fitness_estimated — an FTP exists but no ride history backs it: the
                        number is a self-assessment, and copy must say so.
    """
    hrv = (snapshot.get("biometrics") or {}).get("hrv") or {}
    acts = snapshot.get("activities_14d") or {}
    pmc = snapshot.get("pmc") or {}
    athlete = snapshot.get("athlete") or {}
    hrv_n = int(hrv.get("samples_n") or 0)
    act_n = int(acts.get("count") or 0)
    ctl = float(pmc.get("ctl") or 0.0)
    has_recovery_signals = hrv_n > 0 and hrv.get("delta_pct") is not None
    has_training_history = act_n > 0 or ctl >= 5.0
    return {
        "has_recovery_signals": has_recovery_signals,
        "has_training_history": has_training_history,
        "day_one": not has_recovery_signals and not has_training_history,
        "fitness_estimated": (
            not has_training_history and int(athlete.get("ftp") or 0) > 0
        ),
    }


# Plain-English WHAT sentences by template category — used in EN guide mode
# where the template's own `purpose` is too technical ("Raises VO2max
# ceiling; the canonical Z5 stimulus"). German uses purpose_de, which is
# beginner-safe by construction.
_GUIDE_WHAT_EN: dict[str, str] = {
    "rest": "A full day off — recovery is where your body actually turns training into fitness.",
    "recovery": "A really easy spin that helps your legs flush out fatigue without adding any new strain.",
    "endurance": "A relaxed, steady ride that teaches your body to burn fat for fuel and grows your endurance engine.",
    "tempo": "Brisk, controlled stretches a notch below race effort — they build your staying power at speed.",
    "sweet_spot": "Strong but controlled efforts just under your limit — a lot of fitness gain without wrecking you.",
    "threshold": "Hard, steady efforts right at the edge of what you can hold — the kind of work that raises that edge.",
    "vo2": "Short, very hard efforts that push your engine right to its ceiling — that's what makes the ceiling rise.",
    "anaerobic": "Short sprints with full recovery in between — they build your top-end punch.",
}


def _what_sentence(template: WorkoutTemplate, register: str, de: bool) -> str:
    """Sentence 1 — what the session does physiologically, in the athlete's
    language. Consumes the template's purpose; never restates EN in a DE brief."""
    if de:
        return template.purpose_de or template.purpose
    if register in ("guide", "numbers"):
        # numbers = the plain narrative WITH numbers woven in elsewhere — the
        # raw template purpose ("canonical Z5 stimulus") is pro-only register.
        return _GUIDE_WHAT_EN.get(
            template.category,
            "A session picked to move your fitness forward one solid step.",
        )
    return template.purpose


def _reasoning_facts(snapshot: dict) -> dict:
    """Collect the shared fact pack for the reasoning sentences — all values
    come straight off the snapshot (the canonical decision inputs)."""
    pmc = snapshot.get("pmc") or {}
    hrv = (snapshot.get("biometrics") or {}).get("hrv") or {}
    sleep = (snapshot.get("biometrics") or {}).get("sleep") or {}
    readiness = snapshot.get("readiness") or {}
    return {
        "tsb": pmc.get("tsb"),
        "ctl": pmc.get("ctl"),
        "ramp": pmc.get("ctl_7d_delta"),
        "hrv_delta": hrv.get("delta_pct"),
        "sleep_debt": sleep.get("total_debt_hours"),
        "readiness_score": readiness.get("score"),
        # Age of the newest HRV reading, so the narrative can refuse to speak
        # about recovery in the present tense off a reading from Tuesday.
        "hrv_age_days": hrv.get("latest_age_days"),
    }


# How old the newest HRV reading may be before the recovery narrative stops
# describing it in the present tense. 1 = this morning's sync hasn't landed
# yet but last night's has, which is still "your recovery readings".
_RECOVERY_CLAIM_MAX_AGE_DAYS = 1


def _recovery_claim_is_current(facts: dict) -> bool:
    """Whether the recovery readings are fresh enough to be spoken about now.

    `_signal_state.has_recovery_signals` already goes false once the newest
    reading falls out of `hrv_trend`'s 7-day window — but that leaves days 1
    through 6 wide open. An athlete whose watch last synced five days ago read
    "Deine Erholungswerte liegen in deinem normalen Bereich" / "Your recovery
    readings are inside your normal range" as a statement about this morning,
    when it was a statement about last Tuesday. There is no honest way to date
    a sentence in this position (it is the opening clause of a flowing daily
    paragraph), so the claim is WITHHELD and the paragraph falls through to
    the load-based narrative, which is built from rides and stays true.

    A missing age is treated as stale: every production snapshot carries it,
    so absence means we cannot vouch for the reading's currency.
    """
    age = facts.get("hrv_age_days")
    return isinstance(age, int) and not isinstance(age, bool) and age <= _RECOVERY_CLAIM_MAX_AGE_DAYS


def _fatigue_key(facts: dict, state: dict) -> str:
    """Pick the strongest honest signal narrative. HRV claims only when HRV
    data exists AND is current; load claims only when training history exists."""
    hrv_delta = facts.get("hrv_delta")
    sleep_debt = facts.get("sleep_debt")
    tsb = facts.get("tsb")
    recovery_current = state["has_recovery_signals"] and _recovery_claim_is_current(facts)
    if recovery_current and isinstance(hrv_delta, (int, float)) and hrv_delta < -8:
        return "hrv_low"
    if isinstance(sleep_debt, (int, float)) and sleep_debt > 3:
        return "sleep_short"
    if state["has_training_history"] and isinstance(tsb, (int, float)):
        if tsb < -15:
            return "deep_fatigue"
        if tsb < -5:
            return "carrying_fatigue"
        if tsb > 15:
            return "very_fresh"
    if recovery_current:
        return "signals_normal"
    return "load_normal"


_SIGNAL_PHRASE_DE: dict[str, str] = {
    "hrv_low": "Deine Erholungswerte liegen diese Woche unter deinem üblichen Niveau",
    "sleep_short": "Dein Schlaf war zuletzt knapp, und das summiert sich",
    "deep_fatigue": "Die letzten Fahrten stecken dir noch deutlich in den Beinen",
    "carrying_fatigue": "Du trägst noch etwas Ermüdung aus den letzten Tagen mit dir",
    "very_fresh": "Du bist gut erholt und hast richtig Frische im Tank",
    "signals_normal": "Deine Erholungswerte liegen in deinem normalen Bereich",
    "load_normal": "Deine Belastung der letzten Tage lässt heute Spielraum",
}
_SIGNAL_PHRASE_EN: dict[str, str] = {
    "hrv_low": "Your recovery readings have sat below your usual level this week",
    "sleep_short": "Sleep has been short lately, and that adds up",
    "deep_fatigue": "Your recent rides are still sitting deep in your legs",
    "carrying_fatigue": "You're carrying a bit of fatigue from the last few days",
    "very_fresh": "You're well rested with real freshness in the tank",
    "signals_normal": "Your recovery readings are inside your normal range",
    "load_normal": "Your recent training load leaves room today",
}

_CEILING_ACTION_DE: dict[str, str] = {
    # 'rest' = the safety rails forced the day off (ACWR spike, injury flag) —
    # the signals really are the cause, so "deshalb" is right.
    "rest": "deshalb ist heute bewusst frei",
    # 'planned_rest' = the plan scheduled the day off. The signals did not cause
    # it, and the causal connector produced a small nonsense ("du bist gut
    # erholt — deshalb ist heute bewusst frei"): being fresh is not why you rest.
    "planned_rest": "und heute steht trotzdem ein freier Tag im Plan, damit die letzte Arbeit einsickert",
    "easy": "deshalb bleibt es heute ganz locker, damit dein Körper aufholen kann",
    "moderate": "solide Arbeit geht heute, aber ohne Ausreißer nach oben",
    "push": "genau der Tag, an dem eine fordernde Einheit ihre volle Wirkung entfaltet",
}
_CEILING_ACTION_EN: dict[str, str] = {
    "rest": "so today is deliberately off",
    "planned_rest": "and today is still a scheduled day off, so the recent work can sink in",
    "easy": "so today stays properly easy so your body can catch up",
    "moderate": "solid work is fine today, just without spikes",
    # NOTE: no "exactly"/"directly" here — simple-mode hygiene tests ban the
    # substring "ctl", which hides inside those words.
    "push": "just the kind of day a demanding session does its best work",
}


def _day_one_sentence(register: str, de: bool, planned_tss: int) -> str:
    """Honest day-1 copy — no fabricated signal claims, ever."""
    if de:
        base = (
            "Noch keine Signale von dir — wir starten nach Plan "
            "und lernen dich mit jeder Fahrt besser kennen."
        )
        if register == "numbers" and planned_tss > 0:
            return base + f" Als Startpunkt stehen heute rund {planned_tss} TSS im Plan."
        if register == "pro":
            extra = (
                f" Die Steuerung startet planbasiert (~{planned_tss} TSS)"
                if planned_tss > 0 else " Die Steuerung startet planbasiert"
            )
            return (
                "Noch keine Datenbasis — keine HRV-, Schlaf- oder Belastungshistorie."
                + extra + " und kalibriert, sobald Signale eintreffen."
            )
        return base
    base = (
        "No training signals from you yet — we start on plan "
        "and get to know you with every ride."
    )
    if register == "numbers" and planned_tss > 0:
        return base + f" Today's starting point is about {planned_tss} TSS."
    if register == "pro":
        extra = (
            f" Prescription starts plan-based (~{planned_tss} TSS)"
            if planned_tss > 0 else " Prescription starts plan-based"
        )
        return (
            "No data baseline yet — no HRV, sleep or load history."
            + extra + " and calibrates as signals arrive."
        )
    return base


def _why_today_sentence(
    snapshot: dict, ceiling: str, register: str, de: bool, planned_tss: int,
) -> str:
    """Sentence 2 — why today, from the actual signals (or honestly without)."""
    state = _signal_state(snapshot)
    facts = _reasoning_facts(snapshot)
    if state["day_one"]:
        return _day_one_sentence(register, de, planned_tss)

    key = _fatigue_key(facts, state)
    signal = (_SIGNAL_PHRASE_DE if de else _SIGNAL_PHRASE_EN)[key]
    action = (_CEILING_ACTION_DE if de else _CEILING_ACTION_EN).get(
        ceiling, (_CEILING_ACTION_DE if de else _CEILING_ACTION_EN)["moderate"]
    )

    if register == "guide":
        return f"{signal} — {action}."

    hrv_delta = facts.get("hrv_delta")
    tsb = facts.get("tsb")
    ctl = facts.get("ctl")
    ramp = facts.get("ramp")
    score = facts.get("readiness_score")

    if register == "numbers":
        clauses: list[str] = []
        if state["has_recovery_signals"] and isinstance(hrv_delta, (int, float)):
            clauses.append(
                f"dein HRV liegt {hrv_delta:+.0f} % zu deiner Baseline" if de
                else f"your HRV sits {hrv_delta:+.0f}% vs your baseline"
            )
        if state["has_training_history"] and isinstance(tsb, (int, float)):
            clauses.append(
                f"deine Frische bei {tsb:+.0f}" if de
                else f"your freshness at {tsb:+.0f}"
            )
        lead = signal if not clauses else (
            (" und ".join(clauses) if de else " and ".join(clauses))
        )
        if clauses:
            lead = lead[0].upper() + lead[1:]
        tss_tail = ""
        if planned_tss > 0:
            tss_tail = (
                f"; geplant sind heute rund {planned_tss} TSS" if de
                else f"; today's plan is about {planned_tss} TSS"
            )
        return f"{lead} — {action}{tss_tail}."

    # pro — full evidence chain, still flowing prose.
    ev: list[str] = []
    if isinstance(score, (int, float)):
        ev.append(f"Readiness {score:.0f}/100")
    if state["has_training_history"] and isinstance(tsb, (int, float)) and isinstance(ctl, (int, float)):
        ramp_txt = (
            (f", 7-Tage-Ramp {ramp:+.1f}" if de else f", 7-day ramp {ramp:+.1f}")
            if isinstance(ramp, (int, float)) else ""
        )
        ev.append(
            f"TSB {tsb:+.1f} bei CTL {ctl:.0f}{ramp_txt}" if de
            else f"TSB {tsb:+.1f} on CTL {ctl:.0f}{ramp_txt}"
        )
    if state["has_recovery_signals"] and isinstance(hrv_delta, (int, float)):
        ev.append(
            f"HRV {hrv_delta:+.1f} % zur 28-Tage-Baseline" if de
            else f"HRV {hrv_delta:+.1f}% vs the 28-day baseline"
        )
    pro_action_de = {
        "rest": "die Signale verlangen einen vollständigen Ruhetag; nach Banister wirkt der letzte Reiz erst in der Entlastung",
        "easy": "die Erholung hinkt der Belastung hinterher, also wird heute bewusst entlastet, damit die Banister-Bilanz nicht kippt",
        "moderate": "genug Substanz für kontrollierte Arbeit, aber kein Fenster für maximale Reize — die Banister-Bilanz bleibt so im Gleichgewicht",
        "push": "das Qualitätsfenster ist offen, und nach Banister-Logik ist genau jetzt der Moment, den Reiz zu setzen",
    }
    pro_action_en = {
        "rest": "the signals call for a full rest day; per Banister the last stimulus only lands during the unload",
        "easy": "recovery is lagging the load, so today unloads deliberately to keep the Banister balance from tipping",
        "moderate": "enough in the tank for controlled work, but no window for maximal stimulus — that keeps the Banister balance intact",
        "push": "the quality window is open, and by Banister logic this is exactly the moment to place the stimulus",
    }
    action_pro = (pro_action_de if de else pro_action_en).get(
        ceiling, (pro_action_de if de else pro_action_en)["moderate"]
    )
    ev_txt = ", ".join(ev)
    tss_tail = ""
    if planned_tss > 0:
        tss_tail = (
            f" Die Einheit bringt ~{planned_tss} TSS." if de
            else f" The session lands ~{planned_tss} TSS."
        )
    if ev_txt:
        return f"{ev_txt} — {action_pro}.{tss_tail}"
    return f"{signal} — {action_pro}.{tss_tail}"


_EVENT_WORD: dict[str, tuple[str, str]] = {
    # goal_event_type → (en, de)
    "race": ("race", "Rennen"),
    "fondo": ("big ride", "Marathon"),
    "audax": ("long-distance ride", "Brevet"),
}


def _builds_toward_sentence(
    snapshot: dict, register: str, de: bool, is_rest: bool = False,
) -> str | None:
    """Sentence 3 — what today builds toward: humanized phase + honest goal
    countdown, plus the estimated-fitness disclosure when it applies.

    `is_rest` swaps the phrasings that presuppose a session today ("each of
    these sessions feeds your Base 1 phase") for ones that hold on a rest day,
    where the phase progresses through recovery rather than through work."""
    athlete = snapshot.get("athlete") or {}
    state = _signal_state(snapshot)
    phase_label = _phase_human(athlete.get("goal_phase"), de)
    stem = _phase_stem(athlete.get("goal_phase"))
    days = athlete.get("days_to_goal")
    days = int(days) if isinstance(days, (int, float)) else None
    ev_en, ev_de = _EVENT_WORD.get(
        str(athlete.get("goal_event_type") or ""), ("goal event", "Ziel-Event")
    )
    event = ev_de if de else ev_en

    sentence: str | None = None
    if days is not None and 0 <= days <= 7:
        sentence = (
            f"Dein {event} ist diese Woche — jetzt zählt Frische mehr als jeder zusätzliche Reiz."
            if de else
            f"Your {event} is this week — freshness now matters more than any extra stimulus."
        )
    elif days is not None and 7 < days <= 180 and phase_label and is_rest:
        weeks = max(1, round(days / 7))
        sentence = (
            f"Auch dieser freie Tag gehört zu deiner Phase {phase_label} — noch {days} Tage ({weeks} Wochen) bis zu deinem {event}."
            if de else
            f"This day off is part of your {phase_label} phase too — {days} days ({weeks} weeks) to go until your {event}."
        )
    elif days is not None and 7 < days <= 180 and phase_label:
        weeks = max(1, round(days / 7))
        if register == "pro":
            sentence = (
                f"Du stehst in {phase_label} der Friel-Periodisierung, {days} Tage vor deinem {event} — genau darauf zahlt die heutige Einheit ein."
                if de else
                f"You're in {phase_label} of the Friel periodization, {days} days out from your {event} — today's session feeds exactly that."
            )
        elif register == "numbers":
            sentence = (
                f"Jede dieser Einheiten zahlt auf deine Phase {phase_label} ein — noch {days} Tage ({weeks} Wochen) bis zu deinem {event}."
                if de else
                f"Each of these sessions feeds your {phase_label} phase — {days} days ({weeks} weeks) to go until your {event}."
            )
        else:
            sentence = (
                f"Jede dieser Einheiten zahlt auf deine Phase {phase_label} ein — noch {weeks} Wochen bis zu deinem {event}."
                if de else
                f"Each of these sessions feeds your {phase_label} phase — {weeks} weeks to go until your {event}."
            )
    elif phase_label:
        by_stem_de = {
            "base": f"Du bist in der Phase {phase_label} — hier entsteht das Fundament, auf dem die härteren Wochen später aufbauen.",
            "build": f"Du bist mitten in {phase_label} — aus der Grundlage wird jetzt Wettkampfhärte.",
            "peak": "In der Peak-Phase geht es um Feinschliff — die Qualität bleibt hoch, der Umfang sinkt.",
            "taper": "Im Taper sammelst du Frische — die Arbeit ist getan, jetzt lässt du sie wirken.",
            "race": "Wettkampfwoche — Frische ist jetzt das ganze Spiel.",
            "offseason": "Gerade ist Nebensaison — lockere Bewegung hält den Motor warm, ohne Substanz zu kosten.",
            "maintenance": "Du hältst gerade dein Niveau — Kontinuität ist das, was deine Fitness trägt.",
        }
        by_stem_en = {
            "base": f"You're in your {phase_label} phase — building the foundation the harder weeks will stand on.",
            "build": f"You're deep in {phase_label} — base fitness is turning into race readiness now.",
            "peak": "Peak phase is about fine-tuning — quality stays high while volume comes down.",
            "taper": "The taper is where you bank freshness — the work is done, now you let it land.",
            "race": "Race week — freshness is the whole game now.",
            "offseason": "It's the off-season — easy movement keeps the engine warm without draining you.",
            "maintenance": "You're in maintenance — consistency is what carries your fitness.",
        }
        sentence = (by_stem_de if de else by_stem_en).get(stem)

    if state["fitness_estimated"]:
        estimate = (
            "Dein Ausgangsniveau ist dabei aus deiner Selbsteinschätzung geschätzt — wir kalibrieren es mit jeder aufgezeichneten Fahrt."
            if de else
            "Your starting level is estimated from your self-assessment — we calibrate it with every recorded ride."
        )
        return f"{sentence} {estimate}" if sentence else estimate
    return sentence


def _day_link_sentence(
    snapshot: dict, ceiling: str, register: str, de: bool, planned_tss: int,
) -> str:
    """The why-this-workout bridge: why THIS session fits TODAY."""
    state = _signal_state(snapshot)
    facts = _reasoning_facts(snapshot)
    if state["day_one"]:
        return (
            "Für heute starten wir nach Plan — die Signale zum Feinjustieren sammeln wir ab jetzt."
            if de else
            "For today we start on plan — the signals for fine-tuning start collecting now."
        )
    if register == "guide":
        link_de = {
            "rest": "Heute ist bewusst frei, damit die letzte Arbeit einsickern kann.",
            "planned_rest": "Heute ist bewusst frei, damit die letzte Arbeit einsickern kann.",
            "easy": "Heute passt sie, weil dein Körper gerade vor allem Erholung verwerten kann.",
            "moderate": "Heute passt sie, weil solide Arbeit drin ist, ohne dich zu leeren.",
            "push": "Heute passt sie, weil du die nötige Frische dafür mitbringst.",
        }
        link_en = {
            "rest": "Today is deliberately off so the recent work can sink in.",
            "planned_rest": "Today is deliberately off so the recent work can sink in.",
            "easy": "It fits today because what your body can use most right now is recovery.",
            "moderate": "It fits today because there's room for solid work without emptying you.",
            "push": "It fits today because you bring the freshness it needs.",
        }
        return (link_de if de else link_en).get(
            ceiling, (link_de if de else link_en)["moderate"]
        )

    hrv_delta = facts.get("hrv_delta")
    tsb = facts.get("tsb")
    bits: list[str] = []
    if state["has_recovery_signals"] and isinstance(hrv_delta, (int, float)):
        bits.append(
            f"HRV {hrv_delta:+.0f} % zur Baseline" if de else f"HRV {hrv_delta:+.0f}% vs baseline"
        )
    if state["has_training_history"] and isinstance(tsb, (int, float)):
        bits.append(f"TSB {tsb:+.0f}" if register == "pro" else (
            f"Frische {tsb:+.0f}" if de else f"freshness {tsb:+.0f}"
        ))
    ev = ", ".join(bits)
    fit_de = {
        "rest": "heute zahlt Ruhe mehr ein als jeder weitere Reiz",
        "planned_rest": "heute zahlt Ruhe mehr ein als jeder weitere Reiz",
        "easy": "heute verwertet dein Körper Entlastung besser als Reiz",
        "moderate": "kontrollierte Arbeit ist heute gut verkraftbar",
        "push": "heute darf Qualität rein",
    }
    fit_en = {
        "rest": "rest returns more today than any further stimulus",
        "planned_rest": "rest returns more today than any further stimulus",
        "easy": "your body converts unloading better than stimulus today",
        "moderate": "controlled work is well within reach today",
        "push": "quality belongs in today",
    }
    fit = (fit_de if de else fit_en).get(ceiling, (fit_de if de else fit_en)["moderate"])
    tss_txt = (
        (f" — die Einheit bringt ~{planned_tss} TSS" if de else f" — the session lands ~{planned_tss} TSS")
        if planned_tss > 0 else ""
    )
    if ev:
        # "Heute passt sie" / "It fits today" both point at a session. On a rest
        # day there is no "sie" to fit, so the evidence is stated plainly
        # instead of being hung off a pronoun with no referent.
        if ceiling in ("rest", "planned_rest"):
            return (f"{ev} — {fit}." if de else f"{ev} — {fit}.")
        return (
            f"Heute passt sie: {ev} — {fit}{tss_txt}." if de
            else f"It fits today: {ev} — {fit}{tss_txt}."
        )
    return (f"{fit[0].upper()}{fit[1:]}{tss_txt}.")


def _daily_reasoning(
    snapshot: dict,
    template: WorkoutTemplate,
    ceiling: str,
    register: str,
    de: bool,
) -> tuple[str, str]:
    """Build (rationale, why_this_workout) as coherent coach prose.

    rationale       — the day explanation: why today looks like this, and
                      where it leads (2-3 sentences).
    why_this_workout — the session explanation: what it does physiologically,
                      why it fits today, what it builds toward (2-3 sentences).
    """
    injury = bool((snapshot.get("rails_context") or {}).get("injury_flag"))
    if injury:
        if de:
            rationale = (
                "Dein Körper braucht gerade eine Pause, damit die Verletzung heilen kann. "
                "Ein freier Tag heute zahlt sich nächste Woche doppelt aus."
            )
            why_this = (
                "Erst heilen, dann trainieren — die heutige Pause schützt den ganzen Block, "
                "nicht nur diesen einen Tag."
            )
            if register == "pro":
                rationale += (
                    " Die Sicherheits-Rails halten die Intensität auf Ruhe, bis die Verletzung abgeklungen ist."
                )
        else:
            rationale = (
                "Your body needs a break while that injury heals. "
                "A day off today pays back double next week."
            )
            why_this = (
                "Heal first, train second — today's pause protects the whole block, "
                "not just this one day."
            )
            if register == "pro":
                rationale += (
                    " Safety rails hold intensity at rest until the injury clears."
                )
        return rationale, why_this

    planned_tss = 0 if template.category == "rest" else int(round(template.base_tss))
    # The safety ceiling is a LIMIT — "nothing harder than this is permitted
    # today" — not a prescription. On a rest or recovery day it can legitimately
    # sit at 'push': nothing about the athlete is dangerous, there simply isn't a
    # session. Handing the raw ceiling to the narrative helpers made them read it
    # as the plan, and the brief contradicted itself inside a single payload:
    #
    #   verdict:   "Rest day — legs up"
    #   rationale: "Your freshness at +18 — just the kind of day a demanding
    #               session does its best work."
    #
    # The prose describes the DAY, so it takes the narrower of ceiling and what
    # is actually prescribed. Rest and recovery templates are the two categories
    # that carry no session for the 'push'/'moderate' copy to be about.
    # 'planned_rest' keeps a scheduled day off distinct from a rails-forced one
    # (the rails still win when THEY say rest — an injury day is not "as
    # planned"). The narrative maps carry entries for both.
    narrative_ceiling = (
        ("rest" if ceiling == "rest" else "planned_rest") if template.category == "rest"
        else "easy" if template.category == "recovery"
        else ceiling
    )
    is_rest = template.category == "rest"
    what = _what_sentence(template, register, de)
    why_today = _why_today_sentence(snapshot, narrative_ceiling, register, de, planned_tss)
    toward = _builds_toward_sentence(snapshot, register, de, is_rest=is_rest)
    day_link = _day_link_sentence(snapshot, narrative_ceiling, register, de, planned_tss)

    rationale = " ".join(s for s in (why_today, toward) if s)
    why_this = " ".join(s for s in (what, day_link, toward) if s)
    return rationale, why_this


def _rule_based_brief(snapshot: dict) -> dict:
    """Deterministic brief synthesized from safety_rails + snapshot +
    pre-picked template. Used when ANTHROPIC_API_KEY is unset OR the LLM
    call fails.

    Branches on `snapshot['language']` ('simple' | 'technical'; defaults to
    'simple') to pick verdict/title/rationale/one-liner phrasing. Both paths
    produce the same structural shape — only text tone changes.

    Always produces:
        - a prescribed_workout derived from snapshot.picked_template_id
          (re-parametrised with the athlete's current FTP)
        - 2 alternates (less_time + recover)
        - 7-day outlook with per-day TSS targets
    """
    ctx = _rails_from_snapshot(snapshot)
    ceiling = intensity_ceiling(ctx)
    max_tss = max_tss_for_day(ctx.ctl)
    pmc = snapshot["pmc"]
    hrv = snapshot["biometrics"]["hrv"]
    sleep = snapshot["biometrics"].get("sleep", {})
    zones = snapshot["distribution"]
    athlete = snapshot.get("athlete", {})
    ftp = int(athlete.get("ftp") or 0)
    # Anything that isn't exactly 'technical' is treated as 'simple'. This
    # mirrors the endpoint's Literal narrowing + keeps unknown / corrupt
    # values from leaking jargon into what's supposed to be a plain-English
    # response.
    language = "technical" if snapshot.get("language") == "technical" else "simple"
    # German rendering flag — when the UI locale is 'de' every user-facing
    # string below (and in the helpers) renders in informal German.
    de = snapshot.get("ui_locale") == "de"

    # Verdict tuned to ceiling + picked session type
    picked_id = snapshot.get("picked_template_id") or "z2_endurance_60"
    session_type = snapshot.get("today_session_type") or "endurance"

    # Re-verify template under ceiling
    rank = _SESSION_RANK.get(picked_id, 0)
    max_rank = _CEILING_MAX_RANK.get(ceiling, 6)
    if rank > max_rank:
        picked_id = _safe_template_for_ceiling(ceiling)

    template = TEMPLATES.get(picked_id, TEMPLATES["z2_endurance_60"])
    # Keep session_type in sync with the (possibly downgraded) template so the
    # verdict maps below don't describe a harder session than what we actually
    # prescribed — "anaerobic" collapses to "vo2" for verdict purposes.
    session_type = "vo2" if template.category == "anaerobic" else template.category

    # --------------------------------------------------------------
    # Verdict
    # --------------------------------------------------------------
    if language == "simple":
        if de:
            if ctx.injury_flag:
                verdict = "Ruhetag — kümmer dich um die Verletzung"
            elif ceiling in ("rest", "easy"):
                verdict = _SIMPLE_VERDICT_BY_CEILING_DE[ceiling]
            else:
                verdict = _SIMPLE_VERDICT_BY_SESSION_DE.get(
                    session_type, _SIMPLE_VERDICT_BY_CEILING_DE.get(ceiling, "Lockerer Tag heute")
                )
        else:
            if ctx.injury_flag:
                verdict = "Rest today — take care of that injury"
            elif ceiling in ("rest", "easy"):
                verdict = _SIMPLE_VERDICT_BY_CEILING[ceiling]
            else:
                verdict = _SIMPLE_VERDICT_BY_SESSION.get(
                    session_type, _SIMPLE_VERDICT_BY_CEILING.get(ceiling, "Easy day today")
                )
    else:
        if de:
            if ceiling == "rest":
                verdict = "Ruhe — Verletzung hat Vorrang"
            elif ceiling == "easy":
                if ctx.hrv_delta_pct < -10:
                    verdict = "Nur Recovery — HRV auffällig"
                else:
                    verdict = "Nur Recovery — TSB-Überlastung"
            elif ceiling == "moderate":
                verdict = f"{template.name} — Ermüdung managen"
            else:
                label_by_session_de = {
                    "vo2":        "VO2 heute — du bist frisch",
                    "threshold":  "Schwelle heute — Qualitätsfenster",
                    "sweet_spot": "Sweet Spot heute — Fitness aufbauen",
                    "tempo":      "Tempo heute — unter der Schwelle",
                    "endurance":  f"{template.name}",
                    "recovery":   "Recovery-Spin — parasympathisch halten",
                    "rest":       "Ruhetag — voll parasympathisch",
                }
                verdict = label_by_session_de.get(session_type, template.name)
        else:
            if ceiling == "rest":
                verdict = "Rest — injury takes priority"
            elif ceiling == "easy":
                if ctx.hrv_delta_pct < -10:
                    verdict = "Recovery only — HRV flagged"
                else:
                    verdict = "Recovery only — TSB overreach"
            elif ceiling == "moderate":
                verdict = f"{template.name} — manage fatigue"
            else:
                label_by_session = {
                    "vo2":        "VO2 today — you're fresh",
                    "threshold":  "Threshold today — quality window",
                    "sweet_spot": "Sweet spot today — build fitness",
                    "tempo":      "Tempo today — sub-threshold",
                    "endurance":  f"{template.name}",
                    "recovery":   "Recovery spin — maintain parasympathetic",
                    "rest":       "Rest day — full parasympathetic",
                }
                verdict = label_by_session.get(session_type, template.name)

    # --------------------------------------------------------------
    # Rationale + why_this_workout — the reasoning layer. One coherent
    # coach-voice narrative per register (guide | numbers | pro); the raw
    # "Phase: offseason. TSB 0, CTL 0." debug fragments are gone for good.
    # --------------------------------------------------------------
    register = _detail_register(snapshot)
    rationale, why_this = _daily_reasoning(
        snapshot, template, ceiling, register, de,
    )

    # --------------------------------------------------------------
    # "Already rode today" override — acknowledge the completed session
    # instead of prescribing another one on top of it.
    # --------------------------------------------------------------
    wp = snapshot.get("weekly_progress") or {}
    today_tss = float(wp.get("today_tss", 0.0))
    today_minutes = float(wp.get("today_duration_minutes", 0.0))
    today_tss_per_hour = float(wp.get("today_max_tss_per_hour", 0.0))
    # Sport-split tallies (audit P0-2): the full "already trained → rest_day"
    # override may fire ONLY on ride minutes. A 58-min gym session on a
    # bike-plan day keeps the bike plan visible; the strength work is
    # acknowledged in the rationale instead (cross-sport credit).
    today_ride_minutes = float(wp.get("today_ride_minutes", wp.get("today_duration_minutes", 0.0)))
    today_ride_tss = float(wp.get("today_ride_tss", wp.get("today_tss", 0.0)))
    today_other_minutes = float(wp.get("today_other_minutes", 0.0))
    today_other_sport = wp.get("today_other_sport")
    from app.services.sport import sport_family as _fam
    post_ride_payload_probe = snapshot.get("post_ride")
    post_ride_primary_sport = (
        post_ride_payload_probe.get("primary_sport")
        if isinstance(post_ride_payload_probe, dict) else None
    )
    post_ride_present_for_rule = bool(post_ride_payload_probe) and (
        post_ride_primary_sport is None or _fam(post_ride_primary_sport) == "cycling"
    )
    ride_done_today = post_ride_present_for_rule or today_ride_minutes >= 20.0
    other_sport_done_today = (not ride_done_today) and today_other_minutes >= 20.0

    if other_sport_done_today and template.id != "rest_day":
        # Cross-sport credit: keep today's bike plan as the instruction and
        # acknowledge the non-ride work. No rest_day override, no "Ausfahrt".
        o_mins = int(round(today_other_minutes))
        if de:
            o_label = {"strength": "Krafttraining", "running": "Lauf"}.get(
                str(today_other_sport), "Training"
            )
            rationale = (
                f"Heute schon {o_mins} Min {o_label} — das zählt. "
                f"Die geplante Rad-Einheit steht weiterhin: {rationale}"
            )
        else:
            o_label = {"strength": "strength session", "running": "run"}.get(
                str(today_other_sport), "session"
            )
            rationale = (
                f"{o_mins} min of {o_label} already banked today — it counts. "
                f"Your planned ride still stands: {rationale}"
            )

    if ride_done_today:
        # Session intensity label for the friendly verdict
        if de:
            if today_tss_per_hour >= 90:
                effort_simple = "harte Einheit"
                effort_tech = "hochintensive Einheit"
            elif today_tss_per_hour >= 65:
                effort_simple = "solide Ausfahrt"
                effort_tech = "schwellennahe Einheit"
            else:
                effort_simple = "Ausfahrt"
                effort_tech = "Endurance-Einheit"
        else:
            if today_tss_per_hour >= 90:
                effort_simple = "tough session"
                effort_tech = "high-intensity session"
            elif today_tss_per_hour >= 65:
                effort_simple = "solid ride"
                effort_tech = "threshold-adjacent session"
            else:
                effort_simple = "ride"
                effort_tech = "endurance session"
        # Round display numbers — RIDE tallies only (a same-day gym session
        # must not inflate the "min heute geschafft" hero).
        mins_disp = int(round(today_ride_minutes if today_ride_minutes > 0 else today_minutes))
        tss_disp = int(round(today_ride_tss if today_ride_tss > 0 else today_tss))
        if language == "simple":
            if de:
                verdict = f"Stark — {mins_disp} min heute geschafft"
                rationale = (
                    f"Du hast heute schon eine {effort_simple} eingebaut "
                    f"({mins_disp} min). Das ist die Arbeit — keine zweite Einheit nötig. "
                    "Tanken, trinken und die Erholung ihren Job machen lassen."
                )
                why_this = (
                    "Du hast schon trainiert. Die heutige Einheit ist erfasst, "
                    "also ist der schlaue Zug jetzt Ruhe und Erholung. "
                    "Morgen kommst du stärker zurück."
                )[:300]
            else:
                verdict = f"Nice — {mins_disp} min done today"
                rationale = (
                    f"You already got a {effort_simple} in today "
                    f"({mins_disp} min). That's the work — no second session needed. "
                    "Fuel, hydrate, and let recovery do its thing."
                )
                why_this = (
                    "You've already trained. Today's session is logged, "
                    "so the smart move is rest and recovery. "
                    "Tomorrow you'll come back stronger."
                )[:300]
        else:
            if de:
                verdict = f"Einheit abgeschlossen — {tss_disp} TSS erfasst"
                rationale = (
                    f"Die heutige {effort_tech} steht in den Büchern: {mins_disp} min, "
                    f"{tss_disp} TSS, {today_tss_per_hour:.0f} TSS/h Spitze. "
                    f"Noch eine Einheit obendrauf würde ATL erhöhen, ohne "
                    f"adaptiven Nutzen — Erholung priorisieren."
                )
                why_this = (
                    f"Heute schon trainiert ({tss_disp} TSS). "
                    "Eine zweite Einheit würde gegen die Absorption arbeiten, nicht Fitness aufbauen. "
                    "Lass den Körper konsolidieren."
                )[:300]
            else:
                verdict = f"Session complete — {tss_disp} TSS logged"
                rationale = (
                    f"Today's {effort_tech} is on the books: {mins_disp} min, "
                    f"{tss_disp} TSS, {today_tss_per_hour:.0f} TSS/h peak. "
                    f"Stacking another workout on top would push ATL up without "
                    f"adaptive benefit — prioritise recovery."
                )
                why_this = (
                    f"Already trained today ({tss_disp} TSS). "
                    "A second session would fight absorption, not add fitness. "
                    "Let the body consolidate."
                )[:300]
        # Force the prescribed template to rest so downstream renders cleanly.
        template = TEMPLATES.get("rest_day", template)

    prescribed = _rewrite_prescribed_workout(
        template_id=template.id,
        ftp=ftp,
        duration_minutes_hint=None,
        why_this_workout=why_this,
        de=de,
    )

    # In simple mode, overwrite the title with a plain-English one
    if language == "simple":
        if de:
            simple_title = _SIMPLE_TITLE_BY_CATEGORY_DE.get(
                template.category, "Ausfahrt heute"
            )
        else:
            simple_title = _SIMPLE_TITLE_BY_CATEGORY.get(
                template.category, "Ride today"
            )
        prescribed["title"] = simple_title
        if de:
            # Keep the DE display field in lockstep — clients prefer title_de
            # under a German locale, and it must not regress a simple title
            # back to the technical template name.
            prescribed["title_de"] = simple_title

    # --------------------------------------------------------------
    # Alternates — shared label, different one-liners
    # --------------------------------------------------------------
    less_time_tid = "z2_endurance_60" if template.id != "z2_endurance_60" else "recovery_30"
    if language == "simple":
        alternates = [
            {
                "label": "less_time",
                "one_liner": _SIMPLE_ALTERNATE_LESS_TIME_DE if de else _SIMPLE_ALTERNATE_LESS_TIME,
                "template_id": less_time_tid,
            },
            {
                "label": "recover",
                "one_liner": _SIMPLE_ALTERNATE_RECOVER_DE if de else _SIMPLE_ALTERNATE_RECOVER,
                "template_id": "recovery_30",
            },
        ]
    else:
        less_time_tpl = TEMPLATES[less_time_tid]
        if de:
            alternates = [
                {
                    "label": "less_time",
                    "one_liner": f"Kürzeres Fenster: {less_time_tpl.name} (~{int(less_time_tpl.base_tss)} TSS)",
                    "template_id": less_time_tid,
                },
                {
                    "label": "recover",
                    "one_liner": "Müde? 30 min Z1 Recovery-Spin.",
                    "template_id": "recovery_30",
                },
            ]
        else:
            alternates = [
                {
                    "label": "less_time",
                    "one_liner": f"Shorter window: {less_time_tpl.name} (~{int(less_time_tpl.base_tss)} TSS)",
                    "template_id": less_time_tid,
                },
                {
                    "label": "recover",
                    "one_liner": "Tired? 30 min Z1 recovery spin.",
                    "template_id": "recovery_30",
                },
            ]

    # --------------------------------------------------------------
    # 7-day outlook — language-aware notes
    # --------------------------------------------------------------
    outlook: list[dict[str, Any]] = []
    for i in range(7):
        weekday = (_today_local() + timedelta(days=i)).weekday()
        if weekday == 6:
            tss = round(min(ctx.ctl * 1.1, max_tss if max_tss else ctx.ctl * 1.1), 0)
            if de:
                note = "Lange lockere Ausfahrt — Grundlage aufbauen." if language == "simple" \
                    else "Langes Z2 — aerobe Grundlage aufbauen."
            else:
                note = "Long easy ride — build the base." if language == "simple" \
                    else "Long Z2 — build aerobic base."
        elif weekday == 2:
            tss = round(min(ctx.ctl * 0.9, max_tss if max_tss else ctx.ctl * 0.9), 0)
            if de:
                note = "Harte Ausfahrt unter der Woche." if language == "simple" \
                    else "Qualität unter der Woche — Intervalle nahe der Schwelle."
            else:
                note = "Hard ride mid-week." if language == "simple" \
                    else "Mid-week quality — intervals near threshold."
        elif weekday in (0, 4):
            tss = round(ctx.ctl * 0.3, 0)
            if de:
                note = "Ruhe oder lockeres Ausrollen." if language == "simple" \
                    else "Ruhe oder lockeres Ausrollen."
            else:
                note = "Rest or easy spin." if language == "simple" \
                    else "Rest or easy spin."
        else:
            tss = round(ctx.ctl * 0.6, 0)
            if de:
                note = "Lockere Stunde auf dem Rad." if language == "simple" \
                    else "Endurance Z2."
            else:
                note = "Easy hour on the bike." if language == "simple" \
                    else "Endurance Z2."
        outlook.append({"day_offset": i, "suggested_tss": tss, "note": note})

    # --------------------------------------------------------------
    # Frameworks cited — plain English in simple mode
    # --------------------------------------------------------------
    if language == "simple":
        if de:
            frameworks_cited = [
                "Ruhe macht dich schneller",
                "Lockere Tage zählen",
                "Kontinuität schlägt Intensität",
            ]
        else:
            frameworks_cited = [
                "Rest makes you faster",
                "Easy days matter",
                "Consistency beats intensity",
            ]
    else:
        frameworks_cited = [
            "Banister fitness-fatigue",
            "Seiler polarized",
            "Friel periodization",
            template.framework_cited,
        ]

    # --------------------------------------------------------------
    # Post-ride review — attached when today's activity was scored
    # (snapshot.post_ride is populated by build_snapshot when
    # today_tss >= 25). The review replaces the prescribed-workout
    # card in the UI; prescribed_workout itself stays rest_day.
    # --------------------------------------------------------------
    post_ride_payload = snapshot.get("post_ride")
    post_ride_review: dict | None = None
    if isinstance(post_ride_payload, dict):
        post_ride_review = _build_post_ride_review(post_ride_payload, language, de=de)

    return {
        "verdict": verdict,
        "rationale": rationale,
        "prescribed_workout": prescribed,
        "alternates": alternates,
        "outlook_7d": outlook,
        "frameworks_cited": frameworks_cited,
        "model_used": "rule-based-fallback",
        "post_ride_review": post_ride_review,
    }


def _extract_tool_use(message: Any) -> dict | None:
    """Find the `brief_response` tool_use block in a Claude message response."""
    content = getattr(message, "content", None) or []
    for block in content:
        block_type = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
        if block_type == "tool_use":
            name = getattr(block, "name", None) or (isinstance(block, dict) and block.get("name"))
            if name == "brief_response":
                inp = getattr(block, "input", None) or (isinstance(block, dict) and block.get("input"))
                if isinstance(inp, dict):
                    return inp
    return None


async def generate_brief(snapshot: dict, language: str = "simple", locale: str = "en") -> dict:
    """Generate a brief — LLM path with rule-based fallback.

    Returns a dict with keys: verdict, rationale, prescribed_workout, alternates,
    outlook_7d, frameworks_cited, model_used. The prescribed_workout watts are
    always re-derived from the athlete's FTP server-side.

    `language` picks the system prompt (simple vs technical). The snapshot is
    also stamped with `language` so the rule-based fallback can branch on it.
    """
    # Ensure the snapshot carries the language so rule-based fallback + user
    # message rendering both see the same value. Also stamp the UI locale so the
    # rule-based path can render German when the UI is in German.
    snapshot = {**snapshot, "language": language, "ui_locale": locale}

    if not settings.ANTHROPIC_API_KEY:
        logger.info("ANTHROPIC_API_KEY not set — using rule-based fallback brief")
        return _rule_based_brief(snapshot)

    try:
        # Import lazily so a missing SDK can't break app boot
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

        system_blocks = [
            {
                "type": "text",
                "text": system_prompt_for_language(language, locale=locale),  # type: ignore[arg-type]
                "cache_control": {"type": "ephemeral"},
            }
        ]

        user_message = build_user_message(snapshot)
        # Day-rhythm evidence block — appended here (not in build_user_message)
        # so the wiring stays local to the evidence assembly. None → no block.
        rhythm_ctx = render_day_rhythm_context(snapshot.get("day_rhythm"))
        if rhythm_ctx:
            user_message = user_message + "\n\n" + rhythm_ctx

        response = await client.messages.create(
            model=settings.COACH_MODEL,
            max_tokens=2048,
            system=system_blocks,
            tools=[BRIEF_TOOL],
            tool_choice={"type": "tool", "name": "brief_response"},
            messages=[{"role": "user", "content": user_message}],
        )

        payload = _extract_tool_use(response)
        if payload is None:
            logger.warning("Claude response had no brief_response tool_use — falling back")
            return _rule_based_brief(snapshot)

        # Validate + rewrite watts + enforce rails
        resolved = resolve_and_prescribe(snapshot, payload)
        resolved["model_used"] = settings.COACH_MODEL

        return resolved
    except Exception as exc:
        logger.exception("Claude brief generation failed, falling back: %s", exc)
        return _rule_based_brief(snapshot)


# ======================================================================
#  Cache read-through
# ======================================================================

async def get_or_generate_brief(
    db: AsyncSession,
    user_id: int,
    force: bool = False,
    language: str = "simple",
    locale: str = "en",
) -> CoachBrief:
    """Return the most-recent brief for `language` + `locale` if <
    COACH_BRIEF_CACHE_HOURS old, else regenerate.

    Cache key is (language, locale) — a brief in (technical, en) is NOT served
    to a (technical, de) request. Implemented as a coalesce filter on
    evidence->>'language' / evidence->>'locale' so pre-locale rows still match
    'en' for backward compat.
    """
    if language not in ("simple", "technical"):
        language = "simple"
    if locale not in ("en", "de"):
        locale = "en"

    if not force:
        # Day-freshness gate (audit P0-2): bind the athlete tz FIRST, then
        # never serve a brief generated before the athlete-local start of
        # today — a stale "58 min heute geschafft" hero from yesterday must
        # die at midnight regardless of sync health. The 15-min-sync delete
        # remains as an optimization, not the correctness mechanism.
        from app.services.athlete_time import start_of_today_utc as _start_of_today_utc
        try:
            _prof_q = await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
            set_athlete_tz_from_profile(_prof_q.scalar_one_or_none())
        except Exception:  # pragma: no cover — mocked sessions / RLS quirks
            pass
        start_today_utc = _start_of_today_utc()

        ttl_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)
        cutoff = max(ttl_cutoff, start_today_utc)
        lang_expr = CoachBrief.evidence["language"].astext
        locale_expr = CoachBrief.evidence["locale"].astext
        from sqlalchemy import func
        recent = await db.execute(
            select(CoachBrief)
            .where(
                CoachBrief.user_id == user_id,
                CoachBrief.generated_at >= cutoff,
                # Schema guard: pre-05.1 rows had no prescribed_workout.
                # Treat them as cache misses so the athlete never sees a legacy brief.
                CoachBrief.prescribed_workout.isnot(None),
                func.coalesce(lang_expr, "simple") == language,
                func.coalesce(locale_expr, "en") == locale,
            )
            .order_by(CoachBrief.generated_at.desc())
            .limit(1)
        )
        cached = recent.scalar_one_or_none()
        # Python-side re-check of the day gate — belt and braces for sessions
        # that don't evaluate the SQL predicate (mocks) and for clock skew.
        if cached is not None and cached.generated_at is not None:
            _gen = cached.generated_at
            if _gen.tzinfo is None:
                _gen = _gen.replace(tzinfo=timezone.utc)
            if _gen < start_today_utc:
                cached = None
        if cached is not None:
            # A rule-based-fallback brief means the LLM call FAILED at
            # generation time (API hiccup) while a key is configured. Caching
            # it for the full TTL leaves the athlete with terse templated copy
            # all day (user-reported). Honor it for only 30 minutes, then
            # retry the LLM on the next read.
            if (
                cached.model_used == "rule-based-fallback"
                and settings.ANTHROPIC_API_KEY
                and cached.generated_at
                < datetime.now(timezone.utc) - timedelta(minutes=30)
            ):
                pass  # fall through to regeneration
            else:
                return cached

    snapshot = await build_snapshot(db, user_id, language=language)
    brief_payload = await generate_brief(snapshot, language=language, locale=locale)

    # Persist language + locale markers in evidence for cache discrimination.
    if "language" not in snapshot:
        snapshot["language"] = language
    snapshot["locale"] = locale

    # Phase 5.3 — the post_ride_review lives inside evidence (no schema
    # migration required; JSONB keeps it cheap). _brief_to_read extracts
    # it on response assembly.
    evidence_payload = dict(snapshot)
    if brief_payload.get("post_ride_review") is not None:
        evidence_payload["post_ride_review"] = brief_payload["post_ride_review"]
    # Step 7 — stash forward-looking blocks in evidence (no schema migration).
    # _brief_to_read pulls them back out for the API response.
    if brief_payload.get("tomorrow_plan") is not None:
        evidence_payload["tomorrow_plan"] = brief_payload["tomorrow_plan"]
    if brief_payload.get("regeneration") is not None:
        evidence_payload["regeneration"] = brief_payload["regeneration"]

    brief = CoachBrief(
        user_id=user_id,
        verdict=brief_payload["verdict"],
        rationale=brief_payload["rationale"],
        evidence=evidence_payload,
        # options kept for backward compat on the old column — always None now
        options=None,
        prescribed_workout=brief_payload.get("prescribed_workout"),
        alternates=brief_payload.get("alternates") or [],
        # Belt-and-braces re-sanitize at the write boundary — no code path may
        # persist a non-list / malformed outlook (poisoned rows 500'd reads).
        outlook_7d=sanitize_outlook_7d(brief_payload.get("outlook_7d")),
        frameworks_cited=brief_payload.get("frameworks_cited") or [],
        raw_prompt=system_prompt_for_language(language, locale=locale),  # type: ignore[arg-type]
        model_used=brief_payload["model_used"],
    )
    db.add(brief)
    await db.commit()
    await db.refresh(brief)

    # Phase 4 (today-runthrough Step 4): persist the prescription as a
    # coach_recommendations row keyed by (user_id, target_date). Post-ride
    # compliance grading reads from this table so it scores against what
    # the athlete actually saw — not against a re-pick of the template.
    try:
        await _upsert_recommendation_for_today(
            db=db,
            user_id=user_id,
            brief=brief,
            language=language,
        )
    except Exception:  # pragma: no cover — best-effort plumbing
        # We never want recommendation persistence to break brief generation.
        # Log + swallow; the fallback path in ride_compliance will re-pick.
        logging.getLogger(__name__).exception(
            "coach_recommendation upsert failed for user_id=%s", user_id,
        )

    # Step 7 (today-runthrough) — when the brief carries a tomorrow_plan,
    # also persist a coach_recommendations row for tomorrow's local date so
    # tomorrow's post-ride compliance grader has something to score against.
    try:
        tomorrow_plan_payload = brief_payload.get("tomorrow_plan")
        if isinstance(tomorrow_plan_payload, dict):
            await _upsert_recommendation_for_tomorrow(
                db=db,
                user_id=user_id,
                brief=brief,
                tomorrow_plan=tomorrow_plan_payload,
            )
    except Exception:  # pragma: no cover
        logging.getLogger(__name__).exception(
            "tomorrow coach_recommendation upsert failed for user_id=%s", user_id,
        )

    return brief


# ======================================================================
#  Coach-brief refresh POLICY (July 2026)
#
#  The brief regenerates on exactly FOUR triggers — never on every 15-min
#  Garmin sync (LLM cost + churn). Three are scheduler-owned and live here
#  (morning, evening, missed-session); the fourth (a completed workout) is
#  the Garmin sync deleting the cached brief only when a NEW activity landed.
#  Each scheduler trigger is deduped per athlete-local day via a marker in
#  AthleteProfile.goals["brief_refresh"] — same JSONB-marker pattern as the
#  morning-push "last_sent". Cheap: nothing regenerates when no trigger fired.
# ======================================================================

# Athlete-local hours (24h) at/after which each scheduler trigger may fire.
MORNING_BRIEF_HOUR = 6      # local morning refresh (brief ready before the day)
EVENING_BRIEF_HOUR = 18     # local wind-down refresh
MISSED_BRIEF_HOUR = 21      # after this, an unridden planned session is a miss


def _brief_refresh_state(profile: AthleteProfile) -> dict:
    """Read the per-athlete brief-refresh dedup markers from goals JSONB."""
    goals = profile.goals or {}
    state = goals.get("brief_refresh")
    return dict(state) if isinstance(state, dict) else {}


def _save_brief_refresh_state(profile: AthleteProfile, state: dict) -> None:
    from sqlalchemy.orm.attributes import flag_modified

    goals = dict(profile.goals or {})
    goals["brief_refresh"] = state
    profile.goals = goals
    flag_modified(profile, "goals")


async def _has_missed_session_today(
    db: AsyncSession, user_id: int, today: date
) -> bool:
    """True when today has a planned non-rest cycling session whose window has
    passed with no matching ride — a genuine miss the brief should acknowledge.

    Reuses existing signals: streak._is_rest_planned for rest semantics and the
    plan-engine's MISSED_DONE_TSS threshold for "did they actually train".
    """
    from app.models.planned_workout import PlannedWorkout
    from app.services.plan_adaptation_engine import MISSED_DONE_TSS
    from app.services.streak import _is_rest_planned

    rows = (
        await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date == today,
                func.coalesce(PlannedWorkout.sport, "cycling") == "cycling",
            )
        )
    ).scalars().all()
    sessions = [r for r in rows if not _is_rest_planned(r.template_id, r.title)]
    if not sessions:
        return False

    start_utc, end_utc = _today_local_window()
    acts = (
        await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.started_at >= start_utc,
                Activity.started_at < end_utc,
            )
        )
    ).scalars().all()
    done_tss = sum(float(a.tss or 0.0) for a in acts)
    return done_tss < MISSED_DONE_TSS


async def refresh_brief_scheduled_triggers(
    db: AsyncSession,
    profile: AthleteProfile,
    now_utc: datetime | None = None,
) -> list[str]:
    """Force-regenerate the coach brief for the scheduler-owned triggers that
    fired in the athlete's LOCAL time — morning, evening, missed-session —
    deduped once per local day per trigger. Returns the trigger names that
    fired (empty when none did → no LLM cost).

    Called hourly by the scheduler for every athlete. Force=True keeps the
    rule-based fallback available with no API keys; a per-user try/except in
    the caller isolates failures.
    """
    set_athlete_tz_from_profile(profile)
    now_local = (now_utc or datetime.now(timezone.utc)).astimezone(_athlete_tz())
    today = now_local.date()
    today_iso = today.isoformat()
    state = _brief_refresh_state(profile)
    fired: list[str] = []

    if now_local.hour >= MORNING_BRIEF_HOUR and state.get("morning") != today_iso:
        await get_or_generate_brief(db, profile.user_id, force=True)
        state["morning"] = today_iso
        fired.append("morning")

    if now_local.hour >= EVENING_BRIEF_HOUR and state.get("evening") != today_iso:
        await get_or_generate_brief(db, profile.user_id, force=True)
        state["evening"] = today_iso
        fired.append("evening")

    if now_local.hour >= MISSED_BRIEF_HOUR and state.get("missed") != today_iso:
        if await _has_missed_session_today(db, profile.user_id, today):
            await get_or_generate_brief(db, profile.user_id, force=True)
            state["missed"] = today_iso
            fired.append("missed")

    if fired:
        _save_brief_refresh_state(profile, state)
        await db.commit()
    return fired


async def _upsert_recommendation_for_today(
    db: AsyncSession,
    user_id: int,
    brief: CoachBrief,
    language: str,
) -> None:
    """Write (or replace) the coach_recommendations row for today's local date.

    Idempotent on (user_id, target_date): if a row exists for today we update
    in place rather than appending — there's only ever one "what's prescribed
    today" answer per athlete per day, even if the brief is regenerated.
    """
    pw = brief.prescribed_workout
    if not isinstance(pw, dict) or not pw.get("template_id"):
        # Rest-day briefs / pre-5.1 fallbacks — nothing to grade against.
        return

    today_local = _today_local()

    existing_q = await db.execute(
        select(CoachRecommendation).where(
            CoachRecommendation.user_id == user_id,
            CoachRecommendation.target_date == today_local,
        )
    )
    existing = existing_q.scalar_one_or_none()

    blocks = pw.get("blocks") or []
    template_id = str(pw.get("template_id"))
    title = str(pw.get("title") or template_id)
    duration_minutes = int(pw.get("duration_minutes") or 0)
    predicted_tss = int(round(float(pw.get("predicted_tss") or 0)))
    framework_cited = pw.get("framework_cited") or None
    why = pw.get("why_this_workout") or None
    # Sport family of the prescribed workout — bike templates are 'cycling',
    # run templates are prefixed 'run_'. The compliance sport gate reads this.
    rec_sport = "running" if template_id.startswith("run_") else (
        "strength" if template_id.startswith(("strength", "gym")) else "cycling"
    )

    if existing is None:
        rec = CoachRecommendation(
            user_id=user_id,
            target_date=today_local,
            template_id=template_id,
            title=title,
            duration_minutes=duration_minutes,
            predicted_tss=predicted_tss,
            framework_cited=framework_cited,
            blocks=blocks,
            why_this_workout=why,
            source_brief_id=brief.id,
        )
        if hasattr(CoachRecommendation, "sport"):
            rec.sport = rec_sport
        db.add(rec)
    else:
        # Pin the day's plan. Once a real (non-rest) prescription has been
        # written for today, a later regeneration must NOT replace it with a
        # rest_day. Regenerations are forced to rest_day the moment the athlete
        # has trained today (see resolve_and_prescribe / session_type_for_today),
        # and they fire often (1h TTL + activity-create + Garmin-sync all
        # invalidate the brief). If we clobbered the pinned plan, the post-ride
        # review would grade the completed ride against a rest target (duration
        # and TSS 0) and report "rode on a rest day" — contradicting the
        # morning's prescription. Keep the pinned plan as the compliance target;
        # only link the latest brief and leave any eval intact.
        existing_tid = getattr(existing, "template_id", None)
        if existing_tid not in (None, "rest_day") and template_id == "rest_day":
            existing.source_brief_id = brief.id
            await db.commit()
            return
        existing.template_id = template_id
        existing.title = title
        existing.duration_minutes = duration_minutes
        existing.predicted_tss = predicted_tss
        existing.framework_cited = framework_cited
        existing.blocks = blocks
        existing.why_this_workout = why
        existing.source_brief_id = brief.id
        if hasattr(CoachRecommendation, "sport"):
            existing.sport = rec_sport
        # Reset eval — the new prescription hasn't been graded yet.
        existing.evaluated_at = None
        existing.eval_grade = None
        existing.eval_payload = None

    await db.commit()


async def _upsert_recommendation_for_tomorrow(
    db: AsyncSession,
    user_id: int,
    brief: CoachBrief,
    tomorrow_plan: dict,
) -> None:
    """Persist tomorrow's `tomorrow_plan` payload as a coach_recommendations row.

    The tomorrow_plan shape is lighter than today's prescribed_workout — no
    blocks, no template_id mapping. We store the intensity_chip as the
    `template_id` (so ride_compliance has a category anchor) and the
    description as the title. `blocks` is required by the schema → store an
    empty list; ride_compliance falls back to re-picking when blocks is empty.

    Idempotent on (user_id, tomorrow_local).
    """
    description = str(tomorrow_plan.get("description") or "").strip()
    intensity_chip = str(tomorrow_plan.get("intensity_chip") or "").strip()
    if not description or not intensity_chip:
        return

    tomorrow_local = _today_local() + timedelta(days=1)
    predicted_tss = int(round(float(tomorrow_plan.get("predicted_tss") or 0)))
    # Title is capped at the schema column length; description shows in full
    # via why_this_workout.
    title = (description[:197] + "...") if len(description) > 200 else description

    existing_q = await db.execute(
        select(CoachRecommendation).where(
            CoachRecommendation.user_id == user_id,
            CoachRecommendation.target_date == tomorrow_local,
        )
    )
    existing = existing_q.scalar_one_or_none()

    if existing is None:
        rec = CoachRecommendation(
            user_id=user_id,
            target_date=tomorrow_local,
            template_id=intensity_chip,
            title=title,
            duration_minutes=0,        # unknown until tomorrow's brief
            predicted_tss=predicted_tss,
            framework_cited=None,
            blocks=[],
            why_this_workout=description,
            source_brief_id=brief.id,
        )
        db.add(rec)
    else:
        # Don't clobber a more-detailed row already written by tomorrow's
        # actual brief generation — only update if this is still the
        # forward-looking placeholder (blocks empty).
        if not existing.blocks:
            existing.template_id = intensity_chip
            existing.title = title
            existing.predicted_tss = predicted_tss
            existing.why_this_workout = description
            existing.source_brief_id = brief.id

    await db.commit()


# ======================================================================
#  Chat streaming — SSE
# ======================================================================

async def coach_chat_stream(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
    language: str = "simple",
) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted chunks for the /coach/chat endpoint.

    `language` picks the system prompt (simple vs technical). The snapshot used
    to ground the chat also has `language` stamped, so the user message markers
    reinforce the style.
    """
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set — chat unavailable")

    if language not in ("simple", "technical"):
        language = "simple"

    import anthropic
    import json as _json

    snapshot = await build_snapshot(db, user_id, language=language)
    chat_system = (
        system_prompt_for_language(language)  # type: ignore[arg-type]
        + "\n\n--- Athlete snapshot ---\n"
        + build_user_message(snapshot)
    )
    # Day-rhythm evidence block — same wiring as generate_brief. None → skip.
    _rhythm_ctx = render_day_rhythm_context(snapshot.get("day_rhythm"))
    if _rhythm_ctx:
        chat_system = chat_system + "\n\n" + _rhythm_ctx

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    buffer: list[str] = []

    try:
        async with client.messages.stream(
            model=settings.COACH_CHAT_MODEL,
            max_tokens=1024,
            system=[{"type": "text", "text": chat_system, "cache_control": {"type": "ephemeral"}}],
            messages=[
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in ("user", "assistant")
            ],
        ) as stream:
            async for text_delta in stream.text_stream:
                buffer.append(text_delta)
                yield f"data: {_json.dumps({'type': 'delta', 'text': text_delta})}\n\n"

        full_text = "".join(buffer)
        allowed, safe_text = validate_chat_response(full_text)
        if not allowed:
            replace_payload = _json.dumps({
                "type": "replace",
                "text": safe_text,
                "reason": "nutrition_safety_filter",
            })
            yield f"data: {replace_payload}\n\n"
        done_payload = _json.dumps({"type": "done"})
        yield f"data: {done_payload}\n\n"
    except Exception as exc:
        logger.exception("Claude chat stream failed: %s", exc)
        yield f"data: {_json.dumps({'type': 'error', 'message': str(exc)})}\n\n"


# ======================================================================
#  Analytical chat — tool-use loop + deterministic fallback
# ======================================================================
#
# Phase 6 extension of /coach/chat. generate_chat_stream (above) was a simple
# passthrough to Claude with a snapshot prelude. That's enough for small-talk
# but can't answer arbitrary analytical questions without pulling data.
#
# run_tool_use_loop wraps `anthropic.messages.create` with tool_use handling:
#   1. Send messages + TOOL_SCHEMAS.
#   2. If stop_reason='tool_use', dispatch each tool_use block via
#      coach_tools.dispatch_tool, append results, loop.
#   3. If stop_reason='end_turn' (or max_iterations hit), return final text.
#
# When ANTHROPIC_API_KEY is absent we fall back to two deterministic handlers:
#   - "why am I tired?" — reuses the rule-based brief rationale
#   - "analyze my last N weeks" — reads pmc_window_summary +
#     recovery_trend_summary and writes a template-string answer
# Any other pattern gets a polite refusal pointing at the API-key upgrade.
# ======================================================================


_WHY_TIRED_RE = re.compile(
    r"\b(why.*(tired|fatigued|exhausted|wiped|beat|drained)|recover)\b",
    re.IGNORECASE,
)
_LAST_N_WEEKS_RE = re.compile(
    r"(?:last|past|previous)\s+(\d{1,2})\s+weeks?",
    re.IGNORECASE,
)


def _get_anthropic_client():
    """Lazy Anthropic client factory — patchable in tests.

    Must stay a thin wrapper: it's patched in tests to inject a sequenced
    fake client, and it's lazy so module import works without anthropic
    installed.
    """
    import anthropic
    return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def run_tool_use_loop(
    messages: list[dict],
    user_id: int,
    db: AsyncSession,
    language: Literal["simple", "technical"] = "simple",
    max_iterations: int = 5,
) -> str:
    """Tool-use loop for /coach/chat analytical Q&A.

    Returns the final concatenated text (caller streams it chunk-wise to the
    SSE client for UI consistency). When ANTHROPIC_API_KEY is absent, routes
    to a deterministic fallback instead.
    """
    if not settings.ANTHROPIC_API_KEY:
        return await _fallback_analytical_answer(messages, user_id, db, language)

    client = _get_anthropic_client()
    system_text = system_prompt_for_language(language, context="chat_analytical")

    # Normalise incoming messages — strip roles we don't support, ensure
    # 'content' is a string (frontend contract) or list (internal loop state).
    working_messages: list[dict] = []
    for m in messages:
        role = m.get("role") if isinstance(m, dict) else None
        if role not in ("user", "assistant"):
            continue
        content = m.get("content")
        if content is None:
            continue
        working_messages.append({"role": role, "content": content})

    for _iteration in range(max_iterations):
        response = await client.messages.create(
            model=settings.COACH_CHAT_MODEL,
            max_tokens=2048,
            system=[{
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=TOOL_SCHEMAS,
            messages=working_messages,
        )

        stop_reason = getattr(response, "stop_reason", None)
        content_blocks = getattr(response, "content", []) or []

        if stop_reason != "tool_use":
            # Done — concatenate every text block the model emitted
            text_parts: list[str] = []
            for b in content_blocks:
                btype = getattr(b, "type", None) or (isinstance(b, dict) and b.get("type"))
                if btype == "text":
                    text = getattr(b, "text", None) or (isinstance(b, dict) and b.get("text"))
                    if text:
                        text_parts.append(text)
            return "".join(text_parts)

        # stop_reason == 'tool_use' — dispatch every tool_use block,
        # append the assistant message + tool_result user message, loop.
        tool_results: list[dict] = []
        for block in content_blocks:
            btype = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
            if btype != "tool_use":
                continue
            name = getattr(block, "name", None) or (isinstance(block, dict) and block.get("name"))
            tool_input = (
                getattr(block, "input", None)
                or (isinstance(block, dict) and block.get("input"))
                or {}
            )
            tool_use_id = getattr(block, "id", None) or (isinstance(block, dict) and block.get("id"))
            try:
                result = await dispatch_tool(name, tool_input, user_id=user_id, db=db)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": _json_mod.dumps(result, default=str),
                })
            except Exception as exc:  # noqa: BLE001 — surface to Claude via is_error
                logger.warning("dispatch_tool(%s) raised: %s", name, exc)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": f"Error: {exc}",
                    "is_error": True,
                })

        working_messages.append({"role": "assistant", "content": content_blocks})
        working_messages.append({"role": "user", "content": tool_results})

    # Exhausted max_iterations
    return (
        "Analysis exceeded tool-use budget; returning partial result. "
        "Try a more specific question."
    )


async def _fallback_analytical_answer(
    messages: list[dict],
    user_id: int,
    db: AsyncSession,
    language: Literal["simple", "technical"] = "simple",
) -> str:
    """Deterministic chat fallback when ANTHROPIC_API_KEY is absent.

    Supports two patterns:
        - "why am I tired?" / "I'm fatigued" / recovery questions →
          reuses the rule-based brief rationale so the answer reflects
          today's PMC/HRV/sleep signals exactly.
        - "analyze my last N weeks" / "past N weeks" → reads
          pmc_window_summary + recovery_trend_summary for that window and
          builds a plain-English summary.

    Any other prompt gets a polite refusal that names the upgrade path.
    """
    last_user = next(
        (m.get("content") for m in reversed(messages)
         if isinstance(m, dict) and m.get("role") == "user"
         and isinstance(m.get("content"), str)),
        "",
    )
    text = last_user or ""

    # Pattern 2 first so "why am I tired in the last 2 weeks" prefers the
    # specific analytical range rather than the generic fatigue narrative.
    m = _LAST_N_WEEKS_RE.search(text)
    if m:
        try:
            n_weeks = max(1, min(int(m.group(1)), 12))  # clamp 1..12
        except (TypeError, ValueError):
            n_weeks = 4
        return await _fallback_last_n_weeks(
            user_id=user_id, db=db, n_weeks=n_weeks, language=language,
        )

    if _WHY_TIRED_RE.search(text):
        return await _fallback_why_tired(user_id=user_id, db=db, language=language)

    # Unknown pattern — refuse politely, name the upgrade path.
    if language == "technical":
        return (
            "Analytical chat currently requires the coach upgrade "
            "(ANTHROPIC_API_KEY). Without it I can answer 'why am I tired?' "
            "and 'analyze my last N weeks' via the deterministic synthesizer; "
            "anything else needs the LLM."
        )
    return (
        "Chat with the full coach needs the upgrade (ANTHROPIC_API_KEY). "
        "Without it I can still tell you 'why am I tired?' or walk you through "
        "'my last N weeks' — ask me either of those and I've got you."
    )


async def _fallback_why_tired(
    user_id: int,
    db: AsyncSession,
    language: str,
) -> str:
    """Fatigue narrative — reuses the rule-based brief rationale so the
    tone + data footprint match the /coach/brief fallback exactly.
    """
    try:
        snapshot = await build_snapshot(db, user_id, language=language)
        snapshot = {**snapshot, "language": language}
        brief = _rule_based_brief(snapshot)
        rationale = brief.get("rationale") or ""
        verdict = brief.get("verdict") or ""
        # Two-sentence answer: verdict + rationale. If verdict is empty just
        # return the rationale.
        if verdict and rationale:
            return f"{verdict}. {rationale}"
        return rationale or verdict or "No data yet to tell you why — try syncing Garmin."
    except Exception as exc:  # noqa: BLE001 — defensive
        logger.exception("fallback why-tired failed: %s", exc)
        if language == "technical":
            return (
                "Fallback fatigue synthesizer unavailable; snapshot build "
                "failed. Check Garmin sync + daily_metrics freshness."
            )
        return "Hmm, I couldn't pull your recent data. Try syncing Garmin and asking again."


async def run_tool_use_loop_events(
    messages: list[dict],
    user_id: int,
    db: AsyncSession,
    language: Literal["simple", "technical"] = "simple",
    max_iterations: int = 5,
) -> AsyncIterator[dict]:
    """Streaming variant of run_tool_use_loop — yields structured events
    during the tool-use lifecycle so the UI can render intermediate state.

    Event shapes:
        {"type": "tool_use_start", "name": str, "input": dict}
        {"type": "tool_use_result", "name": str, "result": dict | str,
         "is_error": bool}
        {"type": "text", "text": str}        # final assistant text (single frame)

    When ANTHROPIC_API_KEY is absent, routes to the deterministic fallback
    and yields a single {"type": "text"} event. Tool events are only
    emitted on the LLM path (fallback has no real tool calls to narrate).
    """
    if not settings.ANTHROPIC_API_KEY:
        final_text = await _fallback_analytical_answer(messages, user_id, db, language)
        yield {"type": "text", "text": final_text}
        return

    client = _get_anthropic_client()
    system_text = system_prompt_for_language(language, context="chat_analytical")

    working_messages: list[dict] = []
    for m in messages:
        role = m.get("role") if isinstance(m, dict) else None
        if role not in ("user", "assistant"):
            continue
        content = m.get("content")
        if content is None:
            continue
        working_messages.append({"role": role, "content": content})

    for _iteration in range(max_iterations):
        response = await client.messages.create(
            model=settings.COACH_CHAT_MODEL,
            max_tokens=2048,
            system=[{
                "type": "text",
                "text": system_text,
                "cache_control": {"type": "ephemeral"},
            }],
            tools=TOOL_SCHEMAS,
            messages=working_messages,
        )

        stop_reason = getattr(response, "stop_reason", None)
        content_blocks = getattr(response, "content", []) or []

        if stop_reason != "tool_use":
            text_parts: list[str] = []
            for b in content_blocks:
                btype = getattr(b, "type", None) or (isinstance(b, dict) and b.get("type"))
                if btype == "text":
                    text = getattr(b, "text", None) or (isinstance(b, dict) and b.get("text"))
                    if text:
                        text_parts.append(text)
            yield {"type": "text", "text": "".join(text_parts)}
            return

        # stop_reason == 'tool_use' — dispatch every tool_use block,
        # yield start/result events, append messages, loop.
        tool_results: list[dict] = []
        for block in content_blocks:
            btype = getattr(block, "type", None) or (isinstance(block, dict) and block.get("type"))
            if btype != "tool_use":
                continue
            name = (
                getattr(block, "name", None)
                or (isinstance(block, dict) and block.get("name"))
            )
            tool_input = (
                getattr(block, "input", None)
                or (isinstance(block, dict) and block.get("input"))
                or {}
            )
            tool_use_id = getattr(block, "id", None) or (isinstance(block, dict) and block.get("id"))

            # Emit start frame so UI can render "Analyzing your..." before
            # the tool runs.
            yield {"type": "tool_use_start", "name": name, "input": tool_input}

            # present_answer is TERMINAL: the model's final structured answer.
            # Dispatch (pure normalize), run the ED-safety filter on the summary
            # exactly like assembled prose, emit the result, and END the turn —
            # no further model round-trip, no trailing text event (the card IS
            # the answer, so the frontend suppresses the empty AssistantBubble).
            if name == "present_answer":
                try:
                    result = await dispatch_tool(name, tool_input, user_id=user_id, db=db)
                    summary = result.get("summary", "") if isinstance(result, dict) else ""
                    allowed, safe_summary = validate_chat_response(summary)
                    if not allowed and isinstance(result, dict):
                        result = {**result, "summary": safe_summary}
                    yield {
                        "type": "tool_use_result",
                        "name": name,
                        "result": result,
                        "is_error": False,
                    }
                except Exception as exc:  # noqa: BLE001
                    logger.warning("dispatch_tool(present_answer) raised: %s", exc)
                    yield {
                        "type": "tool_use_result",
                        "name": name,
                        "result": {"error": str(exc)},
                        "is_error": True,
                    }
                return

            try:
                result = await dispatch_tool(name, tool_input, user_id=user_id, db=db)
                yield {
                    "type": "tool_use_result",
                    "name": name,
                    "result": result,
                    "is_error": False,
                }
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": _json_mod.dumps(result, default=str),
                })
            except Exception as exc:  # noqa: BLE001
                logger.warning("dispatch_tool(%s) raised: %s", name, exc)
                yield {
                    "type": "tool_use_result",
                    "name": name,
                    "result": {"error": str(exc)},
                    "is_error": True,
                }
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": f"Error: {exc}",
                    "is_error": True,
                })

        working_messages.append({"role": "assistant", "content": content_blocks})
        working_messages.append({"role": "user", "content": tool_results})

    # Exhausted max_iterations
    yield {
        "type": "text",
        "text": (
            "Analysis exceeded tool-use budget; returning partial result. "
            "Try a more specific question."
        ),
    }


async def generate_analytical_chat_stream(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
    language: Literal["simple", "technical"] = "simple",
) -> AsyncIterator[str]:
    """SSE stream for /coach/chat analytical Q&A.

    Runs the tool-use event generator and emits SSE frames as tools are
    dispatched so the UI can show "Analyzing your..." intermediate states
    and render modification cards inline in the message stream.

    SSE frame shapes emitted:
        data: {"type": "tool_use_start", "name": ..., "input": {...}}
        data: {"type": "tool_use_result", "name": ..., "result": {...}, "is_error": bool}
        data: {"type": "delta", "text": "..."}                # chunked final text
        data: {"type": "replace", "text": "...safe...", "reason": "nutrition_safety_filter"}
        data: {"type": "done"}

    Works with or without ANTHROPIC_API_KEY (fallback path in run_tool_use_loop_events
    emits only a single text event — no tool frames — which is expected).
    """
    import json as _json

    if language not in ("simple", "technical"):
        language = "simple"

    final_text = ""

    try:
        async for evt in run_tool_use_loop_events(
            messages=messages,
            user_id=user_id,
            db=db,
            language=language,
        ):
            etype = evt.get("type")
            if etype == "tool_use_start":
                yield (
                    "event: tool_use_start\n"
                    f"data: {_json.dumps({'name': evt.get('name'), 'input': evt.get('input', {})}, default=str)}\n\n"
                )
            elif etype == "tool_use_result":
                yield (
                    "event: tool_use_result\n"
                    f"data: {_json.dumps({'name': evt.get('name'), 'result': evt.get('result'), 'is_error': evt.get('is_error', False)}, default=str)}\n\n"
                )
            elif etype == "text":
                final_text = evt.get("text") or ""
    except Exception as exc:  # noqa: BLE001 — surface error frame to the client
        logger.exception("Analytical chat loop failed: %s", exc)
        yield f"data: {_json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
        return

    # Chunk the final text so the UI feels streaming (≈20 chars/chunk).
    CHUNK_SIZE = 20
    if not final_text:
        yield f"data: {_json.dumps({'type': 'delta', 'text': ''})}\n\n"
    else:
        for i in range(0, len(final_text), CHUNK_SIZE):
            delta = final_text[i : i + CHUNK_SIZE]
            yield f"data: {_json.dumps({'type': 'delta', 'text': delta})}\n\n"

    # Run ED-keyword filter on the assembled buffer. If triggered, emit the
    # same 'replace' frame the prior streaming path uses so the UI pattern is
    # consistent for both chat flows.
    allowed, safe_text = validate_chat_response(final_text)
    if not allowed:
        yield f"data: {_json.dumps({'type': 'replace', 'text': safe_text, 'reason': 'nutrition_safety_filter'})}\n\n"

    yield f"data: {_json.dumps({'type': 'done'})}\n\n"


async def _fallback_last_n_weeks(
    user_id: int,
    db: AsyncSession,
    n_weeks: int,
    language: str,
) -> str:
    """Deterministic summary of the last N weeks: PMC trend + recovery flags."""
    end = _today_local()
    start = end - timedelta(days=n_weeks * 7 - 1)

    try:
        pmc = await pmc_window_summary(
            user_id=user_id, start_date=start, end_date=end, db=db,
        )
        recovery = await recovery_trend_summary(
            user_id=user_id, days=n_weeks * 7, db=db,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("fallback last_n_weeks failed: %s", exc)
        if language == "technical":
            return (
                f"Could not retrieve PMC + recovery aggregates for the last "
                f"{n_weeks} weeks. Check DB connectivity."
            )
        return (
            f"Hmm, I couldn't pull your last {n_weeks} weeks of data. "
            "Try syncing Garmin and asking again."
        )

    agg = pmc.get("aggregate", {}) or {}
    trend = pmc.get("trend", {}) or {}
    rec_agg = recovery.get("aggregate", {}) or {}
    flags = recovery.get("flags", []) or []

    direction = trend.get("direction", "insufficient_data")

    if direction == "insufficient_data":
        if language == "technical":
            return (
                f"Insufficient PMC data for the last {n_weeks} weeks — "
                "activities missing or sync gap. Nothing reliable to report."
            )
        return (
            f"I don't have enough ride data for the last {n_weeks} weeks to "
            "tell you much. Try syncing Garmin, then ask again."
        )

    total_tss = agg.get("total_tss", 0.0)
    avg_ctl = agg.get("avg_ctl", 0.0)
    avg_tsb = agg.get("avg_tsb", 0.0)
    ramp = agg.get("ramp_rate", 0.0)
    hrv_pct = rec_agg.get("hrv_trend_pct", 0.0) or 0.0
    sleep_debt_h = rec_agg.get("sleep_debt_hours", 0.0) or 0.0

    if language == "technical":
        direction_line = {
            "building": f"CTL climbing ({ramp:+.1f}/week) — fitness accruing.",
            "maintaining": "CTL flat — maintenance phase.",
            "freshening": "TSB rising — freshening / taper territory.",
            "overreaching": "TSB crashing — ATL outpacing CTL (overreach risk).",
        }.get(direction, direction)
        flags_line = (
            f"Recovery flags: {', '.join(flags)}." if flags
            else "No recovery flags triggered."
        )
        return (
            f"Last {n_weeks} weeks (Banister): {direction_line} "
            f"Avg CTL {avg_ctl:.0f}, avg TSB {avg_tsb:+.0f}, total TSS {total_tss:.0f}. "
            f"HRV trend {hrv_pct:+.1f}% vs baseline; sleep debt {sleep_debt_h:.1f}h. "
            f"{flags_line}"
        )

    # Simple mode — plain English, no jargon
    direction_friendly = {
        "building": "your fitness has been climbing",
        "maintaining": "you've held steady",
        "freshening": "your legs have been freshening up",
        "overreaching": "you've been digging a deep hole — the fatigue is outrunning the fitness",
    }.get(direction, "your training's been mixed")

    bits: list[str] = []
    bits.append(
        f"Over the last {n_weeks} week{'s' if n_weeks != 1 else ''}, "
        f"{direction_friendly}."
    )

    flag_hints: list[str] = []
    if "low_hrv" in flags:
        flag_hints.append("your body's showing signs of fatigue")
    if "sleep_debt" in flags:
        flag_hints.append("you've been short on sleep")
    if "rhr_elevated" in flags:
        flag_hints.append("your resting heart rate has been creeping up")

    if flag_hints:
        bits.append(
            "On the recovery side, " + " and ".join(flag_hints) + "."
        )
    else:
        bits.append("Recovery's been solid — no red flags.")

    if direction == "overreaching":
        bits.append("Take an easy week — you've earned it and you need it.")
    elif direction == "building":
        bits.append("Keep this rhythm for a couple more weeks, then plan a down-week.")
    elif direction == "freshening":
        bits.append("You're coming into form — use it wisely.")
    elif direction == "maintaining":
        bits.append("Consistency is quietly doing the work.")

    return " ".join(bits)
