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

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, AsyncIterator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.coach_brief import CoachBrief
from app.services import advanced_metrics
from app.services.advanced_metrics import (
    ctl_atl_tsb_snapshot,
    hrv_trend,
    rhr_trend,
    sleep_debt,
    why_am_i_tired,
    zone_distribution,
)
from app.services.coach_prompt import BRIEF_TOOL, SYSTEM_PROMPT, build_user_message
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

    non_rest_dates: set[date] = set()
    for a in activities:
        if (a.tss or 0) > 20:
            non_rest_dates.add(a.started_at.date())

    today = date.today()
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


async def _weekly_progress(db: AsyncSession, user_id: int) -> dict:
    """This calendar-week's training progress — used by session_type_for_today
    to avoid exceeding the weekly hard-session quota.
    """
    # Week starts on Monday
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    since = datetime.combine(monday, datetime.min.time(), tzinfo=timezone.utc)

    stmt = (
        select(Activity)
        .where(Activity.user_id == user_id, Activity.started_at >= since)
    )
    result = await db.execute(stmt)
    activities = list(result.scalars().all())

    hard_sessions = 0
    vo2_sessions = 0
    total_tss = 0.0
    total_hours = 0.0

    for a in activities:
        tss = float(a.tss or 0)
        total_tss += tss
        total_hours += float(a.duration_seconds or 0) / 3600.0
        # Heuristic: TSS/hour > 75 → threshold-or-above session
        if a.duration_seconds and (a.duration_seconds >= 600):
            tss_per_hour = (tss / a.duration_seconds) * 3600.0
            if tss_per_hour >= 75:
                hard_sessions += 1
            if tss_per_hour >= 100:  # very high-intensity = VO2
                vo2_sessions += 1

    return {
        "hard_sessions_done": hard_sessions,
        "vo2_sessions_done": vo2_sessions,
        "total_tss_this_week": round(total_tss, 1),
        "total_hours_this_week": round(total_hours, 1),
    }


async def build_snapshot(db: AsyncSession, user_id: int) -> dict:
    """Assemble every feature the coach needs in one round of DB hits,
    including the pre-picked workout template the LLM will rubber-stamp.
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
        day_of_week=date.today().weekday(),
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

    snapshot: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
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
    return out


# ----------------------------------------------------------------------
# Rule-based fallback — always produces a complete PrescribedWorkout
# ----------------------------------------------------------------------

def _rule_based_brief(snapshot: dict) -> dict:
    """Deterministic brief synthesized from safety_rails + snapshot +
    pre-picked template. Used when ANTHROPIC_API_KEY is unset OR the LLM
    call fails.

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
    zones = snapshot["distribution"]
    athlete = snapshot.get("athlete", {})
    ftp = int(athlete.get("ftp") or 0)

    # Verdict tuned to ceiling + picked session type
    picked_id = snapshot.get("picked_template_id") or "z2_endurance_60"
    session_type = snapshot.get("today_session_type") or "endurance"

    # Re-verify template under ceiling
    rank = _SESSION_RANK.get(picked_id, 0)
    max_rank = _CEILING_MAX_RANK.get(ceiling, 6)
    if rank > max_rank:
        picked_id = _safe_template_for_ceiling(ceiling)

    template = TEMPLATES.get(picked_id, TEMPLATES["z2_endurance_60"])

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
        # Build a session-typed verdict
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

    # Rationale citing numbers
    rationale_parts: list[str] = []
    rationale_parts.append(
        f"TSB is {pmc['tsb']:.1f}, CTL {pmc['ctl']:.1f} (Banister fitness-fatigue)."
    )
    if hrv.get("delta_pct") is not None:
        rationale_parts.append(
            f"7-day HRV {hrv['delta_pct']:+.1f}% vs 28-day baseline."
        )
    if zones.get("grey_zone_flag"):
        rationale_parts.append(
            f"Z2 creep: {zones['z2_pct']}% of recent time — above Seiler grey-zone threshold."
        )
    rationale_parts.append(
        f"Ceiling: '{ceiling}', TSS cap {max_tss:.0f}. Friel phase: {athlete.get('goal_phase', 'base')}."
    )
    rationale = " ".join(rationale_parts)

    # Prescribed workout
    why_parts: list[str] = [f"Phase: {athlete.get('goal_phase', 'base')}."]
    why_parts.append(f"TSB {pmc['tsb']:.0f}, CTL {pmc['ctl']:.0f}.")
    if hrv.get("delta_pct") is not None:
        why_parts.append(f"HRV {hrv['delta_pct']:+.0f}%.")
    why_parts.append(template.purpose)
    why_this = " ".join(why_parts)[:300]

    prescribed = _rewrite_prescribed_workout(
        template_id=template.id,
        ftp=ftp,
        duration_minutes_hint=None,
        why_this_workout=why_this,
    )

    # Alternates
    less_time_tid = "z2_endurance_60" if template.id != "z2_endurance_60" else "recovery_30"
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

    # 7-day outlook
    outlook: list[dict[str, Any]] = []
    for i in range(7):
        weekday = (date.today() + timedelta(days=i)).weekday()
        if weekday == 6:
            tss = round(min(ctx.ctl * 1.1, max_tss if max_tss else ctx.ctl * 1.1), 0)
            note = "Long Z2 — build aerobic base."
        elif weekday == 2:
            tss = round(min(ctx.ctl * 0.9, max_tss if max_tss else ctx.ctl * 0.9), 0)
            note = "Mid-week quality — intervals near threshold."
        elif weekday in (0, 4):
            tss = round(ctx.ctl * 0.3, 0)
            note = "Rest or easy spin."
        else:
            tss = round(ctx.ctl * 0.6, 0)
            note = "Endurance Z2."
        outlook.append({"day_offset": i, "suggested_tss": tss, "note": note})

    return {
        "verdict": verdict,
        "rationale": rationale,
        "prescribed_workout": prescribed,
        "alternates": alternates,
        "outlook_7d": outlook,
        "frameworks_cited": [
            "Banister fitness-fatigue",
            "Seiler polarized",
            "Friel periodization",
            template.framework_cited,
        ],
        "model_used": "rule-based-fallback",
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


async def generate_brief(snapshot: dict) -> dict:
    """Generate a brief — LLM path with rule-based fallback.

    Returns a dict with keys: verdict, rationale, prescribed_workout, alternates,
    outlook_7d, frameworks_cited, model_used. The prescribed_workout watts are
    always re-derived from the athlete's FTP server-side.
    """
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
                "text": SYSTEM_PROMPT,
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
) -> CoachBrief:
    """Return the most-recent brief if < COACH_BRIEF_CACHE_HOURS old, else regenerate.

    Always persists the brief (even cache misses) so every generation is
    auditable. Caller is responsible for committing the session on return.
    """
    if not force:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.COACH_BRIEF_CACHE_HOURS)
        recent = await db.execute(
            select(CoachBrief)
            .where(CoachBrief.user_id == user_id, CoachBrief.generated_at >= cutoff)
            .order_by(CoachBrief.generated_at.desc())
            .limit(1)
        )
        cached = recent.scalar_one_or_none()
        if cached is not None:
            return cached

    snapshot = await build_snapshot(db, user_id)
    brief_payload = await generate_brief(snapshot)

    brief = CoachBrief(
        user_id=user_id,
        verdict=brief_payload["verdict"],
        rationale=brief_payload["rationale"],
        evidence=snapshot,
        # options kept for backward compat on the old column — always None now
        options=None,
        prescribed_workout=brief_payload.get("prescribed_workout"),
        alternates=brief_payload.get("alternates") or [],
        outlook_7d=brief_payload.get("outlook_7d"),
        frameworks_cited=brief_payload.get("frameworks_cited") or [],
        raw_prompt=SYSTEM_PROMPT,
        model_used=brief_payload["model_used"],
    )
    db.add(brief)
    await db.commit()
    await db.refresh(brief)
    return brief


# ======================================================================
#  Chat streaming — SSE
# ======================================================================

async def coach_chat_stream(
    db: AsyncSession,
    user_id: int,
    messages: list[dict],
) -> AsyncIterator[str]:
    """Async generator yielding SSE-formatted chunks for the /coach/chat endpoint."""
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY not set — chat unavailable")

    import anthropic
    import json as _json

    snapshot = await build_snapshot(db, user_id)
    chat_system = (
        SYSTEM_PROMPT
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
