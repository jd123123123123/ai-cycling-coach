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
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.models.coach_recommendation import CoachRecommendation
from app.services import advanced_metrics
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
from app.services.goal_trajectory import project as project_trajectory, trajectory_to_dict
from app.services.pmc_service import compute_user_pmc
from app.services.ride_compliance import ride_compliance_to_dict, score_ride
from app.services.safety_rails import (
    RailContext,
    intensity_ceiling,
    max_tss_for_day,
    validate_chat_response,
)
from app.services.training_periodization import (
    SessionType,
    detect_training_phase,
    pick_template,
    session_type_for_today,
    weekly_intensity_quota,
)
from app.services.workout_templates import (
    TEMPLATES,
    PrescribedWorkout,
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
# TODO(today-runthrough/step2): replace _ATHLETE_TZ with
# AthleteProfile.timezone once a tz column lands. Hardcoded to
# Europe/Berlin for the single-user MVP (user is in Berlin).
_ATHLETE_TZ = ZoneInfo("Europe/Berlin")


def _today_local(now_utc: datetime | None = None) -> date:
    """Return today's date in the athlete's local timezone."""
    now = (now_utc or datetime.now(timezone.utc)).astimezone(_ATHLETE_TZ)
    return now.date()


def _today_local_window(now_utc: datetime | None = None) -> tuple[datetime, datetime]:
    """Athlete-local today 00:00 → tomorrow 00:00, returned as UTC datetimes."""
    today = _today_local(now_utc)
    start_local = datetime.combine(today, datetime.min.time(), tzinfo=_ATHLETE_TZ)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def _week_local_window(now_utc: datetime | None = None) -> tuple[datetime, datetime]:
    """Monday 00:00 → next Monday 00:00 in athlete-local, returned as UTC datetimes."""
    today = _today_local(now_utc)
    monday_local = today - timedelta(days=today.weekday())
    start_local = datetime.combine(monday_local, datetime.min.time(), tzinfo=_ATHLETE_TZ)
    end_local = start_local + timedelta(days=7)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


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
            non_rest_dates.add(started.astimezone(_ATHLETE_TZ).date())

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
    """Fetch today's most significant completed activity.

    "Today" is the athlete's local calendar day (Europe/Berlin for now —
    see `_ATHLETE_TZ` TODO). When multiple activities land on the same
    local day (e.g. a commute + a real ride), we return the highest-TSS
    one — that's the session worth grading.
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


async def _weekly_progress(db: AsyncSession, user_id: int) -> dict:
    """This calendar-week's training progress — used by session_type_for_today
    to avoid exceeding the weekly hard-session quota.

    All "today" / "this week" / "yesterday" windows are computed in the
    athlete's local timezone (see `_ATHLETE_TZ`). Activities are filtered
    by their UTC-stored `started_at` against the local-day boundaries
    converted to UTC.
    """
    # Athlete-local week (Monday → next Monday) and today/yesterday windows
    since_week, _end_week_utc = _week_local_window()
    since_today, end_today = _today_local_window()
    # Yesterday's window (athlete-local calendar day)
    since_yesterday = since_today - timedelta(days=1)
    end_yesterday = since_today
    # Rolling 48h window — independent of week boundary so Monday can see Sunday's load
    now_utc = datetime.now(timezone.utc)
    since_48h = now_utc - timedelta(hours=48)

    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= min(since_week, since_48h))
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
    yesterday_tss = 0.0
    last_48h_tss = 0.0

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
            today_duration_minutes += float(a.duration_seconds or 0) / 60.0
            if a.duration_seconds and a.duration_seconds >= 600:
                tss_per_hour = (tss / a.duration_seconds) * 3600.0
                today_max_tss_per_hour = max(today_max_tss_per_hour, tss_per_hour)
        # Yesterday's cumulative TSS (half-open window)
        if since_yesterday <= started < end_yesterday:
            yesterday_tss += tss
        # Rolling 48h
        if started >= since_48h:
            last_48h_tss += tss

    return {
        "hard_sessions_done": hard_sessions,
        "vo2_sessions_done": vo2_sessions,
        "total_tss_this_week": round(total_tss, 1),
        "total_hours_this_week": round(total_hours, 1),
        "today_tss": round(today_tss, 1),
        "today_duration_minutes": round(today_duration_minutes, 1),
        "today_max_tss_per_hour": round(today_max_tss_per_hour, 1),
        "yesterday_tss": round(yesterday_tss, 1),
        "last_48h_tss": round(last_48h_tss, 1),
    }


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

    goal_event_date = None
    goal_target = None
    goal_date_obj: date | None = None
    if profile and isinstance(profile.goals, dict):
        te = profile.goals.get("target_event")
        if isinstance(te, dict):
            goal_event_date = te.get("date")
            goal_target = te.get("name")
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

    # ---------------------------------------------------------
    # Periodization — detect phase + pick today's session
    # ---------------------------------------------------------
    ftp = profile.ftp_watts if profile else None
    weekly_hours = profile.weekly_hours_available if profile else 8.0
    if weekly_hours is None or weekly_hours <= 0:
        weekly_hours = 8.0

    phase = detect_training_phase(goal_date_obj, float(pmc.get("ctl", 0.0)))
    quota = weekly_intensity_quota(phase, float(weekly_hours))

    rails_ctx = RailContext(
        ctl=float(pmc["ctl"]),
        atl=float(pmc["atl"]),
        tsb=float(pmc["tsb"]),
        hrv_delta_pct=float(hrv.get("delta_pct") or 0.0),
        injury_flag=bool(profile.injury_flag) if profile else False,
        days_since_rest=int(days_since_rest),
    )
    ceiling = intensity_ceiling(rails_ctx)

    today_session: SessionType = session_type_for_today(
        phase=phase,
        weekly_progress=weekly_prog,
        tsb=float(pmc.get("tsb", 0.0)),
        intensity_ceiling=ceiling,
        day_of_week=_today_local().weekday(),
    )

    # Today's available minutes — weekly_hours/7 rounded up, capped at 180 min
    # so we don't auto-pick a 3h long ride on a Tuesday.
    today_available_minutes = min(180, max(30, int(round((weekly_hours * 60) / 7))))

    # Pick + parametrize the template
    picked_template = pick_template(
        session_type=today_session,
        athlete_ftp=ftp,
        available_minutes=today_available_minutes,
    )

    picked_preview: dict | None = None
    if ftp and ftp > 0:
        try:
            prescribed = parametrize_template(picked_template, int(ftp), duration_scale=1.0)
            picked_preview = prescribed_workout_to_dict(prescribed)
        except ValueError:
            picked_preview = None

    # ---------------------------------------------------------
    # Post-ride review — when today_tss >= 25 the athlete has
    # already trained; grade it against the picked template
    # and project goal trajectory. Both live inside the snapshot
    # under `post_ride`; the rule-based brief + LLM prompt both
    # read from there.
    # ---------------------------------------------------------
    post_ride_data: dict | None = None
    today_tss_val = float(weekly_prog.get("today_tss", 0.0))
    if today_tss_val >= 25.0:
        activity = await _todays_primary_activity(db, user_id)
        if activity is not None:
            compliance = score_ride(
                actual_activity=activity,
                target_template=picked_template,
                ftp=int(ftp) if ftp else None,
                phase=phase,
                session_type=today_session,
            )
            # Goal trajectory projection — project() is pure, accepts dict rows.
            # We hand it the 'total' PMC series; if it's empty (sparse history)
            # project() emits a neutral narrative.
            pmc_full = await compute_user_pmc(db, user_id, days=90)
            trajectory = project_trajectory(
                user_pmc=pmc_full.get("total") or [],
                athlete_goals=profile.goals if profile and isinstance(profile.goals, dict) else None,
                phase=phase,
            )

            post_ride_data = {
                "compliance": ride_compliance_to_dict(compliance),
                "trajectory": trajectory_to_dict(trajectory),
                "target_template": {
                    "id": picked_template.id,
                    "title": picked_template.name,
                    "category": picked_template.category,
                    "framework_cited": picked_template.framework_cited,
                    "purpose": picked_template.purpose,
                },
                "actual_activity": {
                    "id": activity.id,
                    "duration_minutes": int(round((activity.duration_seconds or 0) / 60)),
                    "tss": float(activity.tss or 0.0),
                    "normalized_power": activity.normalized_power,
                    "average_power": activity.average_power,
                    "average_hr": activity.average_hr,
                    "started_at": activity.started_at.isoformat() if activity.started_at else None,
                },
            }

    snapshot: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "language": language,
        "athlete": {
            "goal_event_date": goal_event_date,
            "goal_target": goal_target,
            "weekly_hours": weekly_hours,
            "ftp": ftp,
            "weight_kg": profile.weight_kg if profile else None,
            "injury_flag": bool(profile.injury_flag) if profile else False,
            "injury_note": profile.injury_note if profile else None,
            "goal_phase": phase,
            "today_available_minutes": today_available_minutes,
        },
        "pmc": pmc,
        "biometrics": {
            "hrv": hrv,
            "rhr": rhr,
            "sleep": sleep,
        },
        "distribution": zones,
        "activities_14d": activities,
        "why_tired": tired,
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


def _rewrite_prescribed_workout(
    template_id: str,
    ftp: int,
    duration_minutes_hint: int | None,
    why_this_workout: str | None,
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
            "framework_cited": template.framework_cited,
            "purpose": template.purpose,
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
            "why_this_workout": why_this_workout or template.purpose,
        }

    prescribed: PrescribedWorkout = parametrize_template(
        template, int(ftp), duration_scale=duration_scale,
    )
    out = prescribed_workout_to_dict(prescribed)
    out["why_this_workout"] = why_this_workout or template.purpose
    return out


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

    llm_workout = llm_payload.get("prescribed_workout") or {}
    template_id = str(llm_workout.get("template_id") or "")
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

    # Post-ride override: if the snapshot says the athlete trained today
    # (post_ride present) we force rest_day regardless of what the LLM picked.
    # The post_ride_review replaces the workout card in the UI — a second
    # prescription would muddy the UX.
    post_ride_present = bool(snapshot.get("post_ride"))
    if post_ride_present:
        template_id = "rest_day"
        why = why or "You've already trained today — review below."

    # Step 4: rewrite watts
    duration_hint = llm_workout.get("duration_minutes")
    try:
        duration_hint = int(duration_hint) if duration_hint is not None else None
    except (TypeError, ValueError):
        duration_hint = None

    new_workout = _rewrite_prescribed_workout(template_id, ftp, duration_hint, why)

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

    # Post-ride review — if the snapshot carries post_ride data, ensure the
    # payload has a complete review. Take the LLM's narrative fields when
    # present and fill any missing ones from the deterministic builder.
    if post_ride_present:
        snapshot_post = snapshot.get("post_ride") or {}
        language = snapshot.get("language", "simple")
        fallback_review = _build_post_ride_review(snapshot_post, language)
        llm_review = llm_payload.get("post_ride_review")
        if isinstance(llm_review, dict):
            # Merge — LLM wins on narrative fields, compliance numbers always
            # come from the deterministic scorer (LLM can't override math).
            merged = dict(fallback_review)
            for narrative_key in ("headline", "physiological_read", "goal_trajectory", "next_session_nudge"):
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

_HEADLINE_BY_GRADE_TECHNICAL: dict[str, str] = {
    "perfect":     "Perfect execution",
    "strong":      "Strong session",
    "okay":        "Okay session — margins loose",
    "overcooked":  "Overcooked — TSS above target",
    "undercooked": "Undercooked — below prescribed load",
}

# Simple-mode next-session nudges keyed by (grade, session_type category).
# Grade drives tone; session_type hints at what to do next.
def _simple_nudge(grade: str, session_type: str, phase: str) -> str:
    if grade == "perfect":
        return "Tomorrow: rest is earned — you got exactly what today needed."
    if grade == "strong":
        return "Eat well, sleep hard. Tomorrow's ride stays easy."
    if grade == "okay":
        return "Next time aim for a closer match to the prescribed time and effort."
    if grade == "overcooked":
        return "Recover hard tonight. Tomorrow's an easy day — seriously."
    # undercooked
    if session_type == "vo2":
        return "Add 5-10 min to your next hard interval block."
    if session_type == "threshold":
        return "Your next threshold block should hit a bit longer — aim for the full target."
    return "Your next ride can stretch a bit longer — you have the legs for it."


def _technical_nudge(grade: str, session_type: str, phase: str) -> str:
    if grade == "perfect":
        return "Recovery tonight is earned — parasympathetic window open for adaptation."
    if grade == "strong":
        return f"Consolidate: Z1 spin or rest tomorrow so {session_type} stimulus absorbs."
    if grade == "okay":
        return "Next same-category block: tighten within ±10% of template prescription."
    if grade == "overcooked":
        return "ATL will spike tonight; TSB dropping → rest day required per Banister."
    # undercooked
    if session_type == "vo2":
        return "Add one more interval (4-5→5-6) next VO2 block; Coggan Z5 stimulus needs minimum 20 min time-at-VO2max."
    if session_type == "threshold":
        return "Stretch threshold intervals 15→18 min next block to hit LT2 adaptation threshold."
    return "Next endurance block can extend 10-15 min to stimulate San Millán Z2 ceiling."


# Physiological read generators — concise "what your body did" sentences.
def _simple_physio_read(compliance: dict, trajectory: dict) -> str:
    parts: list[str] = []
    grade = compliance.get("grade")
    ef = compliance.get("ef")
    vi = compliance.get("variability_index")
    dur = compliance.get("duration", {})
    tss = compliance.get("tss", {})
    actual_min = int(round(dur.get("actual", 0)))
    actual_effort = int(round(tss.get("actual", 0)))

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


def _technical_physio_read(compliance: dict, trajectory: dict) -> str:
    parts: list[str] = []
    grade = compliance.get("grade")
    ef = compliance.get("ef")
    vi = compliance.get("variability_index")
    if_pair = compliance.get("intensity_factor") or {}
    tss = compliance.get("tss", {})
    actual_tss = int(round(tss.get("actual", 0)))
    target_tss = int(round(tss.get("target", 0)))

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


def _simple_trajectory_narrative(trajectory: dict) -> str:
    hook = trajectory.get("narrative_hook")
    if not hook:
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


def _technical_trajectory_narrative(trajectory: dict) -> str:
    hook = trajectory.get("narrative_hook")
    if hook:
        return hook
    return (
        f"CTL {trajectory.get('ctl_now', 0):.1f}, 7d delta {trajectory.get('ctl_7d_delta', 0):+.1f}. "
        "Continue current pattern."
    )


def _build_post_ride_review(
    snapshot_post_ride: dict,
    language: str,
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

    if language == "simple":
        headline = _HEADLINE_BY_GRADE_SIMPLE.get(grade, "Session logged")
        physio = _simple_physio_read(compliance, trajectory)
        trajectory_narrative = _simple_trajectory_narrative(trajectory)
        nudge = _simple_nudge(grade, session_type, phase)
    else:
        headline = _HEADLINE_BY_GRADE_TECHNICAL.get(grade, "Session logged")
        physio = _technical_physio_read(compliance, trajectory)
        trajectory_narrative = _technical_trajectory_narrative(trajectory)
        nudge = _technical_nudge(grade, session_type, phase)

    return {
        "grade": grade,
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
    }


def _simple_rationale(
    pmc: dict,
    hrv: dict,
    sleep: dict,
    zones: dict,
    ceiling: str,
    injury_flag: bool,
) -> str:
    """Build a plain-English rationale that avoids FTP/TSS/CTL/Z-jargon entirely.

    Draws from the same signals as the technical path, but phrases them the
    way a friend would ("your sleep's been light", "you're catching up from
    last week's rides").
    """
    if injury_flag:
        return (
            "Your body's asking for a break while that injury heals. "
            "A day off today pays off next week — promise."
        )

    hrv_delta = hrv.get("delta_pct") if hrv else None
    sleep_debt = sleep.get("total_debt_hours") if sleep else None
    tsb = pmc.get("tsb")

    parts: list[str] = []

    # Opener — set the tone
    if ceiling == "rest":
        parts.append("Your body's waving the white flag today.")
    elif ceiling == "easy":
        parts.append("You're running on empty — let's keep it chill.")
    elif ceiling == "moderate":
        parts.append("You're in decent shape but not fully fresh.")
    else:
        parts.append("Legs feel good, let's make it count.")

    # Cite something the athlete actually did or feels
    if isinstance(hrv_delta, (int, float)) and hrv_delta < -8:
        parts.append("Your body's showing signs of fatigue the last week.")
    elif isinstance(sleep_debt, (int, float)) and sleep_debt > 3:
        parts.append("Sleep's been short lately — that adds up.")
    elif isinstance(tsb, (int, float)) and tsb < -15:
        parts.append("You've been riding hard — fatigue's catching up.")
    elif isinstance(tsb, (int, float)) and tsb > 15:
        parts.append("You've rested plenty and your legs are ready.")
    elif zones and zones.get("grey_zone_flag"):
        parts.append(
            "You've been riding the middle gears a lot — let's go easy or hard, not in-between."
        )

    # Close with what the workout is for
    if ceiling in ("rest", "easy"):
        parts.append("Today's about recovery.")
    elif ceiling == "moderate":
        parts.append("Today's about putting in solid time without digging a hole.")
    else:
        parts.append("Today's about building the good kind of tired.")

    return " ".join(parts)


def _technical_rationale(
    pmc: dict,
    hrv: dict,
    zones: dict,
    ceiling: str,
    max_tss: float,
    phase: str,
) -> str:
    """The current (pre-5.2) rationale, kept for technical mode."""
    parts: list[str] = []
    parts.append(
        f"TSB is {pmc['tsb']:.1f}, CTL {pmc['ctl']:.1f} (Banister fitness-fatigue)."
    )
    if hrv.get("delta_pct") is not None:
        parts.append(
            f"7-day HRV {hrv['delta_pct']:+.1f}% vs 28-day baseline."
        )
    if zones.get("grey_zone_flag"):
        parts.append(
            f"Z2 creep: {zones['z2_pct']}% of recent time — above Seiler grey-zone threshold."
        )
    parts.append(
        f"Ceiling: '{ceiling}', TSS cap {max_tss:.0f}. Friel phase: {phase}."
    )
    return " ".join(parts)


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

    # Verdict tuned to ceiling + picked session type
    picked_id = snapshot.get("picked_template_id") or "z2_endurance_60"
    session_type = snapshot.get("today_session_type") or "endurance"

    # Re-verify template under ceiling
    rank = _SESSION_RANK.get(picked_id, 0)
    max_rank = _CEILING_MAX_RANK.get(ceiling, 6)
    if rank > max_rank:
        picked_id = _safe_template_for_ceiling(ceiling)

    template = TEMPLATES.get(picked_id, TEMPLATES["z2_endurance_60"])

    # --------------------------------------------------------------
    # Verdict
    # --------------------------------------------------------------
    if language == "simple":
        if ctx.injury_flag:
            verdict = "Rest today — take care of that injury"
        elif ceiling in ("rest", "easy"):
            verdict = _SIMPLE_VERDICT_BY_CEILING[ceiling]
        else:
            verdict = _SIMPLE_VERDICT_BY_SESSION.get(
                session_type, _SIMPLE_VERDICT_BY_CEILING.get(ceiling, "Easy day today")
            )
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
    # Rationale
    # --------------------------------------------------------------
    if language == "simple":
        rationale = _simple_rationale(
            pmc=pmc, hrv=hrv, sleep=sleep, zones=zones,
            ceiling=ceiling, injury_flag=ctx.injury_flag,
        )
    else:
        rationale = _technical_rationale(
            pmc=pmc, hrv=hrv, zones=zones,
            ceiling=ceiling, max_tss=max_tss,
            phase=athlete.get("goal_phase", "base"),
        )

    # --------------------------------------------------------------
    # Prescribed workout — shared shape, different why_this_workout + title
    # --------------------------------------------------------------
    if language == "simple":
        if ctx.injury_flag:
            why_this = (
                "Let's not make things worse — a rest day now pays off later."
            )
        elif ceiling in ("rest", "easy"):
            why_this = (
                "Your body's tired from what you've been doing. "
                "Easy today means you bounce back faster."
            )
        else:
            why_this = (
                "You've been consistent — today's about adding a bit of quality "
                "without burning a match."
            )
        why_this = why_this[:300]
    else:
        why_parts: list[str] = [f"Phase: {athlete.get('goal_phase', 'base')}."]
        why_parts.append(f"TSB {pmc['tsb']:.0f}, CTL {pmc['ctl']:.0f}.")
        if hrv.get("delta_pct") is not None:
            why_parts.append(f"HRV {hrv['delta_pct']:+.0f}%.")
        why_parts.append(template.purpose)
        why_this = " ".join(why_parts)[:300]

    # --------------------------------------------------------------
    # "Already rode today" override — acknowledge the completed session
    # instead of prescribing another one on top of it.
    # --------------------------------------------------------------
    wp = snapshot.get("weekly_progress") or {}
    today_tss = float(wp.get("today_tss", 0.0))
    today_minutes = float(wp.get("today_duration_minutes", 0.0))
    today_tss_per_hour = float(wp.get("today_max_tss_per_hour", 0.0))
    if today_tss >= 25.0:
        # Session intensity label for the friendly verdict
        if today_tss_per_hour >= 90:
            effort_simple = "tough session"
            effort_tech = "high-intensity session"
        elif today_tss_per_hour >= 65:
            effort_simple = "solid ride"
            effort_tech = "threshold-adjacent session"
        else:
            effort_simple = "ride"
            effort_tech = "endurance session"
        # Round display numbers
        mins_disp = int(round(today_minutes))
        tss_disp = int(round(today_tss))
        if language == "simple":
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
    )

    # In simple mode, overwrite the title with a plain-English one
    if language == "simple":
        simple_title = _SIMPLE_TITLE_BY_CATEGORY.get(
            template.category, "Ride today"
        )
        prescribed["title"] = simple_title

    # --------------------------------------------------------------
    # Alternates — shared label, different one-liners
    # --------------------------------------------------------------
    less_time_tid = "z2_endurance_60" if template.id != "z2_endurance_60" else "recovery_30"
    if language == "simple":
        alternates = [
            {
                "label": "less_time",
                "one_liner": _SIMPLE_ALTERNATE_LESS_TIME,
                "template_id": less_time_tid,
            },
            {
                "label": "recover",
                "one_liner": _SIMPLE_ALTERNATE_RECOVER,
                "template_id": "recovery_30",
            },
        ]
    else:
        less_time_tpl = TEMPLATES[less_time_tid]
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
            note = "Long easy ride — build the base." if language == "simple" \
                else "Long Z2 — build aerobic base."
        elif weekday == 2:
            tss = round(min(ctx.ctl * 0.9, max_tss if max_tss else ctx.ctl * 0.9), 0)
            note = "Hard ride mid-week." if language == "simple" \
                else "Mid-week quality — intervals near threshold."
        elif weekday in (0, 4):
            tss = round(ctx.ctl * 0.3, 0)
            note = "Rest or easy spin." if language == "simple" \
                else "Rest or easy spin."
        else:
            tss = round(ctx.ctl * 0.6, 0)
            note = "Easy hour on the bike." if language == "simple" \
                else "Endurance Z2."
        outlook.append({"day_offset": i, "suggested_tss": tss, "note": note})

    # --------------------------------------------------------------
    # Frameworks cited — plain English in simple mode
    # --------------------------------------------------------------
    if language == "simple":
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
        post_ride_review = _build_post_ride_review(post_ride_payload, language)

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


async def generate_brief(snapshot: dict, language: str = "simple") -> dict:
    """Generate a brief — LLM path with rule-based fallback.

    Returns a dict with keys: verdict, rationale, prescribed_workout, alternates,
    outlook_7d, frameworks_cited, model_used. The prescribed_workout watts are
    always re-derived from the athlete's FTP server-side.

    `language` picks the system prompt (simple vs technical). The snapshot is
    also stamped with `language` so the rule-based fallback can branch on it.
    """
    # Ensure the snapshot carries the language so rule-based fallback + user
    # message rendering both see the same value.
    snapshot = {**snapshot, "language": language}

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
                "text": system_prompt_for_language(language),  # type: ignore[arg-type]
                "cache_control": {"type": "ephemeral"},
            }
        ]

        user_message = build_user_message(snapshot)

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
) -> CoachBrief:
    """Return the most-recent brief for `language` if < COACH_BRIEF_CACHE_HOURS
    old, else regenerate.

    Cache key includes language — a brief cached in 'technical' is NOT served to
    a 'simple' request. This is implemented by filtering on
    `evidence->>'language'`; pre-5.2 rows (no language key) are treated as
    'simple' for backward compat.

    Always persists the brief (even cache misses) so every generation is
    auditable. Caller is responsible for committing the session on return.
    """
    if language not in ("simple", "technical"):
        language = "simple"

    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)
        # JSONB language filter: match rows where evidence->>'language' equals
        # the requested language. Pre-5.2 rows (language key missing) count as
        # 'simple' — coalesce keeps them servable.
        lang_expr = CoachBrief.evidence["language"].astext
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
            )
            .order_by(CoachBrief.generated_at.desc())
            .limit(1)
        )
        cached = recent.scalar_one_or_none()
        if cached is not None:
            return cached

    snapshot = await build_snapshot(db, user_id, language=language)
    brief_payload = await generate_brief(snapshot, language=language)

    # Keep the language marker in persisted evidence so cache lookups can
    # discriminate without requiring a schema change.
    if "language" not in snapshot:
        snapshot["language"] = language

    # Phase 5.3 — the post_ride_review lives inside evidence (no schema
    # migration required; JSONB keeps it cheap). _brief_to_read extracts
    # it on response assembly.
    evidence_payload = dict(snapshot)
    if brief_payload.get("post_ride_review") is not None:
        evidence_payload["post_ride_review"] = brief_payload["post_ride_review"]

    brief = CoachBrief(
        user_id=user_id,
        verdict=brief_payload["verdict"],
        rationale=brief_payload["rationale"],
        evidence=evidence_payload,
        # options kept for backward compat on the old column — always None now
        options=None,
        prescribed_workout=brief_payload.get("prescribed_workout"),
        alternates=brief_payload.get("alternates") or [],
        outlook_7d=brief_payload.get("outlook_7d"),
        frameworks_cited=brief_payload.get("frameworks_cited") or [],
        raw_prompt=system_prompt_for_language(language),  # type: ignore[arg-type]
        model_used=brief_payload["model_used"],
    )
    db.add(brief)
    await db.commit()
    await db.refresh(brief)

    # Phase 4 (today-runthrough Step 4): persist the prescription as a
    # coach_recommendations row keyed by (user_id, target_date). Post-ride
    # compliance grading reads from this table so it scores against what
    # the athlete actually saw — not against a re-pick of the template.
    #
    # TODO(Step 6 — tomorrow_plan): when the brief carries a tomorrow_plan
    # block, also upsert a row for target_date=today+1. For now we only
    # write today's row.
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

    return brief


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
        db.add(rec)
    else:
        existing.template_id = template_id
        existing.title = title
        existing.duration_minutes = duration_minutes
        existing.predicted_tss = predicted_tss
        existing.framework_cited = framework_cited
        existing.blocks = blocks
        existing.why_this_workout = why
        existing.source_brief_id = brief.id
        # Reset eval — the new prescription hasn't been graded yet.
        existing.evaluated_at = None
        existing.eval_grade = None
        existing.eval_payload = None

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
