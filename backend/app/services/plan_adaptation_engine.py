"""Hourly plan-adaptation engine — plan-engine v2's feedback loop.

Every hour, fresh signals (last night's sleep, HRV vs baseline, athlete
status, workouts done/missed, unplanned load) reshape TODAY + the next six
days of PlannedWorkout rows — within rails, and NEVER silently: every
mutation goes through ``plan_adaptation_log.log_adaptation`` so the athlete
sees what changed and why (adaptation without a feed entry is a bug).

Stability principles (recon-science ADAPTATION RULE SET):
  - fixed weekly skeleton; autoregulate within the day
  - at most ONE material change per run per direction (ease / give)
  - 2-signal agreement or a multi-day trend — never single-day noise
  - every change explained in plain, no-guilt words; diffs are complete
  - user-authored rows (user_plan / user_modified) are never auto-mutated,
    except by the illness interlock (safety outranks preference)

Rules (science-file mapping):
  R4/R5 illness_interlock    athlete says sick → today + tomorrow become rest
  R2    sleep_hrv_downgrade  short sleep AND HRV below band → today's/
                             tomorrow's quality day eased to Z2, slot kept
  R3    missed_key_reflow    missed quality day → re-slotted onto the next
                             free filler day this week, never stacking two
                             hard days (≤ 1 structure change per week)
  R8    extra_load_trim      unplanned/oversized riding → the biggest
                             remaining filler eases one notch toward budget
  R6    green_streak_upgrade 3+ green days + week under budget → ONE filler
                             endurance day steps up one notch (the engine
                             must sometimes give, not only take)

Cheapness contract: the run takes one signal snapshot (profile, week's plan
rows, 35 d of daily metrics, week's rides, meso budget). If the snapshot
fingerprint matches the last quiet run of the same athlete-local day, the
run exits without further queries — no directive build, no guard lookups.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from statistics import mean, pstdev
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.daily_metric import DailyMetric
from app.models.mesocycle_plan import MesocyclePlan
from app.models.plan_adaptation import PlanAdaptation
from app.models.planned_workout import PlannedWorkout
from app.services.adaptive_readiness import build_adaptive_directive
from app.services.hrv_state import estimate_hrv_state
from app.services.athlete_time import (
    day_local_window,
    local_date_of,
    set_athlete_tz_from_profile,
    start_of_today_utc,
    today_local,
)
from app.services.plan_adaptation_log import already_adapted, log_adaptation
from app.services.workout_modifier import (
    _template_exceeds_ceiling,
    endurance_for_duration,
    materialize_template,
    one_notch_easier_id,
    one_notch_harder_id,
)
from app.services.workout_templates import TEMPLATES

logger = logging.getLogger(__name__)

# ─── Tunables (evidence-anchored, see recon-science) ────────────────────────
QUALITY_CATEGORIES = frozenset({"tempo", "sweet_spot", "threshold", "vo2", "anaerobic"})
SHORT_SLEEP_HOURS = 6.0          # Frontiers 2025 meta: acute restriction hurts endurance
POOR_SLEEP_SCORE = 55            # matches adaptive_readiness poor-sleep gate
GREEN_SLEEP_SCORE = 65
GREEN_STREAK_DAYS = 3            # multi-day trend, not single-day noise
# The band lives in `hrv_state` now — this module no longer keeps its own copy.
EXTRA_LOAD_FACTOR = 1.3          # day-TSS >30 % over plan counts as extra load
UNPLANNED_MIN_TSS = 40.0         # same floor plan_absorption uses
WEEK_OVER_TOLERANCE = 1.05       # trim only when the week projects >105 % of budget
WEEK_UNDER_FRACTION = 0.90       # give only when the week projects <90 % of budget
DAY_DONE_TSS = 20.0              # today already ridden → adapt tomorrow instead
MISSED_DONE_TSS = 25.0           # any ride ≥ this counts the planned day as attempted
# User-authored rows are sacred to the automatic loop (autonomy support).
PROTECTED_SOURCES = frozenset({"user_plan", "user_modified"})
ADAPTED_SOURCE = "coach_adapted"

_WD_DE = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
_WD_EN = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

# Quiet-run fingerprint cache: user_id → (athlete-local day iso, fingerprint).
# Only quiet runs are cached — a run that changed the plan always re-evaluates
# next hour (the guards make the re-evaluation a no-op, then it caches).
_LAST_QUIET: dict[int, tuple[str, tuple]] = {}


def reset_snapshot_cache() -> None:
    """Test hook — clear the quiet-run fingerprint cache."""
    _LAST_QUIET.clear()


# ─── Snapshot ────────────────────────────────────────────────────────────────

@dataclass
class _Snapshot:
    user_id: int
    profile: Any
    today: date
    monday: date
    sunday: date
    start_of_day_utc: datetime
    week_start_utc: datetime
    plan_rows: list = field(default_factory=list)       # all sports, monday..span
    bike_rows: list = field(default_factory=list)       # cycling only
    metrics: list = field(default_factory=list)         # 35 d asc by date
    day_actual: dict = field(default_factory=dict)      # local date → cycling TSS
    banked: float = 0.0                                 # cycling TSS monday..today
    status_state: str | None = None
    ftp: int = 0
    weekly_budget: float = 0.0
    fingerprint: tuple = ()

    def bike_on(self, d: date) -> list:
        return [r for r in self.bike_rows if r.date == d]


def _tss_of(template_id: str | None) -> float:
    t = TEMPLATES.get(template_id or "")
    return float(t.base_tss) if t else 0.0


def _category_of(template_id: str | None) -> str | None:
    t = TEMPLATES.get(template_id or "")
    return t.category if t else None


def _is_quality(row: Any) -> bool:
    return _category_of(row.template_id) in QUALITY_CATEGORIES


def _is_filler_endurance(row: Any, *, sunday: date) -> bool:
    """Filler = a rotable endurance day: not the Sunday long-ride slot, not
    user-authored, not already a coach adaptation victim this pass."""
    return (
        _category_of(row.template_id) == "endurance"
        and row.date.weekday() != 6
        and row.date != sunday
        and (row.blocks_source or "") not in PROTECTED_SOURCES | {"coach_absorbed"}
    )


def _day_diff(row: Any) -> dict:
    return {
        "date": row.date.isoformat(),
        "template_id": row.template_id,
        "title": row.title,
        "target_tss": round(_tss_of(row.template_id)),
    }


def _wd(d: date, today: date, lang: str) -> str:
    """Relative-friendly weekday word: heute/morgen beat calendar names."""
    if d == today:
        return "heute" if lang == "de" else "today"
    if d == today + timedelta(days=1):
        return "morgen" if lang == "de" else "tomorrow"
    names = _WD_DE if lang == "de" else _WD_EN
    return names[d.weekday()]


async def _signal_fired_since(
    db: AsyncSession, user_id: int, signal: str, since: datetime
) -> bool:
    """Any-target-date stability guard (already_adapted is per target_date;
    reflow/trim/give need a per-window cap regardless of which day changed)."""
    res = await db.execute(
        select(PlanAdaptation.id)
        .where(
            PlanAdaptation.user_id == user_id,
            PlanAdaptation.signal == signal,
            PlanAdaptation.created_at >= since,
        )
        .limit(1)
    )
    return res.scalar_one_or_none() is not None


async def _build_snapshot(
    db: AsyncSession, user_id: int, profile: Any, now_utc: datetime | None
) -> _Snapshot:
    today = today_local(now_utc)
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    span_end = max(sunday, today + timedelta(days=6))

    plan_rows = (
        await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date >= monday,
                PlannedWorkout.date <= span_end,
            )
        )
    ).scalars().all()
    bike_rows = [r for r in plan_rows if (r.sport or "cycling") == "cycling"]

    metrics = (
        await db.execute(
            select(DailyMetric)
            .where(
                DailyMetric.user_id == user_id,
                DailyMetric.date.isnot(None),
                DailyMetric.date >= today - timedelta(days=35),
                DailyMetric.date <= today,
            )
            .order_by(DailyMetric.date.asc())
        )
    ).scalars().all()

    week_start_utc = day_local_window(monday)[0]
    acts = (
        await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.sport == "cycling",
                Activity.started_at >= week_start_utc,
                Activity.tss.isnot(None),
            )
        )
    ).scalars().all()
    day_actual: dict[date, float] = {}
    for a in acts:
        if a.started_at is None:
            continue
        d = local_date_of(a.started_at)
        day_actual[d] = day_actual.get(d, 0.0) + float(a.tss or 0.0)
    banked = sum(v for d, v in day_actual.items() if monday <= d <= today)

    meso = (
        await db.execute(
            select(MesocyclePlan)
            .where(
                MesocyclePlan.user_id == user_id,
                MesocyclePlan.plan_start_date <= today,
                MesocyclePlan.plan_end_date >= today,
            )
            .order_by(MesocyclePlan.plan_start_date.desc())
        )
    ).scalars().first()
    weekly_budget = 0.0
    if meso is not None:
        targets = meso.weekly_tss_targets or []
        idx = (today - meso.plan_start_date).days // 7
        if 0 <= idx < len(targets):
            weekly_budget = float(targets[idx])
    if weekly_budget <= 0:
        # Fallback: the week's own planned total (plan_absorption convention).
        weekly_budget = sum(
            _tss_of(r.template_id) for r in bike_rows if monday <= r.date <= sunday
        )

    goals = profile.goals if isinstance(profile.goals, dict) else {}
    status_state = ((goals.get("athlete_status") or {}) or {}).get("state")

    latest_metric = metrics[-1] if metrics else None
    fingerprint = (
        today.isoformat(),
        status_state,
        round(weekly_budget),
        tuple(sorted((d.isoformat(), round(v)) for d, v in day_actual.items())),
        tuple(
            (r.date.isoformat(), r.sport, r.template_id, r.blocks_source,
             r.duration_seconds_target)
            for r in sorted(plan_rows, key=lambda r: (r.date, r.id or 0))
        ),
        (
            (latest_metric.date.isoformat(), latest_metric.sleep_score,
             latest_metric.sleep_total_s, latest_metric.hrv_status,
             latest_metric.resting_hr)
            if latest_metric is not None else None
        ),
    )

    return _Snapshot(
        user_id=user_id,
        profile=profile,
        today=today,
        monday=monday,
        sunday=sunday,
        start_of_day_utc=start_of_today_utc(now_utc),
        week_start_utc=week_start_utc,
        plan_rows=list(plan_rows),
        bike_rows=bike_rows,
        metrics=list(metrics),
        day_actual=day_actual,
        banked=banked,
        status_state=status_state,
        ftp=int(profile.ftp_watts or 0),
        weekly_budget=weekly_budget,
        fingerprint=fingerprint,
    )


# ─── Mutation helpers ────────────────────────────────────────────────────────

def _set_rest(row: Any) -> None:
    rest = TEMPLATES.get("rest_day")
    row.template_id = "rest_day"
    row.title = rest.name if rest else "Rest Day"
    row.duration_seconds_target = 0
    row.interval_structure = {"intervals": [], "source": ADAPTED_SOURCE}
    row.blocks_source = ADAPTED_SOURCE


def _apply_template(row: Any, template_id: str, ftp: int,
                    duration_min_target: int | None = None) -> float:
    """Re-materialise ``row`` as ``template_id`` (server-side watts authority,
    same persistence shape as coach_tools). Returns the new predicted TSS."""
    if template_id == "rest_day":
        _set_rest(row)
        return 0.0
    blocks, dur_min, predicted_tss, meta = materialize_template(
        template_id, ftp, duration_min_target=duration_min_target,
        indoor=bool(getattr(row, "indoor", False)),
    )
    row.template_id = template_id
    row.title = meta.get("title") or (TEMPLATES[template_id].name if template_id in TEMPLATES else template_id)
    row.duration_seconds_target = int(dur_min * 60)
    row.interval_structure = {"intervals": blocks, "source": ADAPTED_SOURCE}
    row.blocks_source = ADAPTED_SOURCE
    return float(predicted_tss)


# ─── Rules (each returns a change dict or None; logs its own feed entry) ────

async def _rule_illness(db: AsyncSession, snap: _Snapshot) -> dict | None:
    """R4/R5 — self-declared sick outranks every signal: today + tomorrow rest."""
    if snap.status_state != "sick":
        return None
    if await already_adapted(
        db, snap.user_id, target_date=snap.today, signal="illness",
        since=snap.start_of_day_utc,
    ):
        return None

    before_days: list[dict] = []
    after_days: list[dict] = []
    for d in (snap.today, snap.today + timedelta(days=1)):
        for row in snap.bike_on(d):
            if (row.template_id or "") == "rest_day":
                continue
            before_days.append(_day_diff(row))
            _set_rest(row)
            after_days.append(_day_diff(row))
    if not before_days:
        return None

    message_de = (
        "Krank gemeldet — heute und morgen stehen auf Erholung. "
        "Der Plan wartet auf dich, nicht umgekehrt."
    )
    message_en = (
        "You're marked sick — today and tomorrow are rest days. "
        "The plan waits for you, not the other way round."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=snap.today, source="hourly", signal="illness",
        rule="illness_interlock",
        message_de=message_de, message_en=message_en,
        before={"days": before_days}, after={"days": after_days},
        evidence={"athlete_status": "sick"},
        commit=False,
    )
    return {
        "rule": "illness_interlock", "signal": "illness",
        "dates": [d["date"] for d in after_days],
        "message_de": message_de, "message_en": message_en,
    }


async def _rule_sleep_hrv(
    db: AsyncSession, snap: _Snapshot, directive: Any
) -> dict | None:
    """R2 — short sleep + HRV below band (2-signal agreement) → ease the next
    quality day to Z2, holding the slot and roughly the duration."""
    if snap.ftp <= 0:
        return None
    m = next((x for x in reversed(snap.metrics) if x.date == snap.today), None)
    if m is None:
        return None

    sleep_h = (float(m.sleep_total_s) / 3600.0) if m.sleep_total_s else None
    sleep_score = int(m.sleep_score) if m.sleep_score is not None else None
    short_by_hours = sleep_h is not None and sleep_h < SHORT_SLEEP_HOURS
    short_by_score = sleep_score is not None and sleep_score < POOR_SLEEP_SCORE
    if not (short_by_hours or short_by_score):
        return None
    if directive is None or getattr(directive, "hrv_state", None) != "below":
        return None  # one signal alone never moves the plan

    # Prefer today's quality session unless the day is already ridden.
    target = None
    if snap.day_actual.get(snap.today, 0.0) < DAY_DONE_TSS:
        target = next(
            (r for r in snap.bike_on(snap.today)
             if _is_quality(r) and (r.blocks_source or "") not in PROTECTED_SOURCES),
            None,
        )
    if target is None:
        tomorrow = snap.today + timedelta(days=1)
        target = next(
            (r for r in snap.bike_on(tomorrow)
             if _is_quality(r) and (r.blocks_source or "") not in PROTECTED_SOURCES),
            None,
        )
    if target is None:
        return None
    if await already_adapted(
        db, snap.user_id, target_date=target.date, signal="short_sleep_low_hrv",
        since=snap.start_of_day_utc,
    ):
        return None

    before = _day_diff(target)
    old_title = target.title
    duration_min = int(round((target.duration_seconds_target or 3600) / 60)) or 60
    new_tid = endurance_for_duration(duration_min)
    if new_tid == target.template_id:
        return None
    _apply_template(target, new_tid, snap.ftp, duration_min_target=duration_min)
    after = _day_diff(target)

    day_de = _wd(target.date, snap.today, "de")
    day_en = _wd(target.date, snap.today, "en")
    sleep_de = f"Schlaf {sleep_h:.1f} h".replace(".", ",") if short_by_hours else f"Schlaf-Score {sleep_score}"
    sleep_en = f"Sleep {sleep_h:.1f} h" if short_by_hours else f"Sleep score {sleep_score}"
    message_de = (
        f"{sleep_de} und HRV unter deiner Basislinie — {day_de} wird "
        f"{old_title} zu lockerem Z2. Die Qualität kommt zurück, wenn dein Körper bereit ist."
    )
    message_en = (
        f"{sleep_en} and HRV below your baseline — {day_en}'s "
        f"{old_title} eases to steady Z2. The quality comes back when your body is ready."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=target.date, source="hourly", signal="short_sleep_low_hrv",
        rule="sleep_hrv_downgrade",
        message_de=message_de, message_en=message_en,
        before=before, after=after,
        evidence={
            "sleep_h": round(sleep_h, 2) if sleep_h is not None else None,
            "sleep_score": sleep_score,
            "hrv_state": "below",
            "directive": getattr(directive, "directive", None),
        },
        commit=False,
    )
    return {
        "rule": "sleep_hrv_downgrade", "signal": "short_sleep_low_hrv",
        "dates": [target.date.isoformat()],
        "message_de": message_de, "message_en": message_en,
    }


async def _rule_missed_key(db: AsyncSession, snap: _Snapshot) -> dict | None:
    """R3 — a quality day passed unridden: re-slot it onto the next free
    filler day this week (drop that filler), never stacking two hard days.
    Structure changes are capped at one per week (R9 stability)."""
    if snap.ftp <= 0:
        return None
    missed = [
        r for r in snap.bike_rows
        if snap.monday <= r.date < snap.today
        and _is_quality(r)
        and snap.day_actual.get(r.date, 0.0) < MISSED_DONE_TSS
    ]
    if not missed:
        return None
    missed_row = max(missed, key=lambda r: r.date)
    if missed_row.template_id not in TEMPLATES:
        return None
    if await _signal_fired_since(
        db, snap.user_id, "missed_key_session", snap.week_start_utc
    ):
        return None

    def _day_has_quality(d: date) -> bool:
        return any(_is_quality(r) for r in snap.bike_on(d))

    victim = None
    d = snap.today
    while d <= snap.sunday:
        rows = snap.bike_on(d)
        fillers = [
            r for r in rows
            if _category_of(r.template_id) in ("endurance", "recovery")
            and (r.blocks_source or "") not in PROTECTED_SOURCES | {"coach_absorbed"}
        ]
        day_free = (
            bool(fillers)
            and not _day_has_quality(d)
            and not _day_has_quality(d - timedelta(days=1))
            and not _day_has_quality(d + timedelta(days=1))
            and (d != snap.today or snap.day_actual.get(d, 0.0) < DAY_DONE_TSS)
        )
        if day_free:
            victim = max(fillers, key=lambda r: _tss_of(r.template_id))
            break
        d += timedelta(days=1)
    if victim is None:
        return None

    before = _day_diff(victim)
    key_title = TEMPLATES[missed_row.template_id].name
    _apply_template(victim, missed_row.template_id, snap.ftp)
    after = _day_diff(victim)

    missed_de = _wd(missed_row.date, snap.today, "de")
    missed_en = _wd(missed_row.date, snap.today, "en")
    new_de = _wd(victim.date, snap.today, "de")
    new_en = _wd(victim.date, snap.today, "en")
    message_de = (
        f"{missed_de.capitalize()} verpasst — kein Drama: "
        f"{key_title} liegt jetzt auf {new_de.capitalize()}."
    )
    message_en = (
        f"{missed_en.capitalize()}'s key session slipped — no drama: "
        f"{key_title} now lives on {new_en.capitalize()}."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=victim.date, source="hourly", signal="missed_key_session",
        rule="missed_key_reflow",
        message_de=message_de, message_en=message_en,
        before=before, after=after,
        evidence={
            "missed_date": missed_row.date.isoformat(),
            "missed_template_id": missed_row.template_id,
            "moved_to": victim.date.isoformat(),
        },
        commit=False,
    )
    return {
        "rule": "missed_key_reflow", "signal": "missed_key_session",
        "dates": [victim.date.isoformat()],
        "message_de": message_de, "message_en": message_en,
    }


async def _rule_extra_load(db: AsyncSession, snap: _Snapshot) -> dict | None:
    """R8 — extra riding got banked: trim the biggest remaining filler one
    notch so the week converges back toward its budget."""
    if snap.ftp <= 0 or snap.weekly_budget <= 0:
        return None

    overload_date: date | None = None
    d = snap.monday
    while d <= snap.today:
        actual = snap.day_actual.get(d, 0.0)
        planned = sum(_tss_of(r.template_id) for r in snap.bike_on(d))
        if planned > 0:
            if actual > planned * EXTRA_LOAD_FACTOR and (actual - planned) >= 10:
                overload_date = d
        elif actual >= UNPLANNED_MIN_TSS:
            overload_date = d
        d += timedelta(days=1)
    if overload_date is None:
        return None

    remaining = [
        r for r in snap.bike_rows
        if snap.today < r.date <= snap.sunday and (r.template_id or "") != "rest_day"
    ]
    projected = snap.banked + sum(_tss_of(r.template_id) for r in remaining)
    if projected <= snap.weekly_budget * WEEK_OVER_TOLERANCE:
        return None
    if await _signal_fired_since(
        db, snap.user_id, "extra_load", snap.start_of_day_utc
    ):
        return None

    fillers = [r for r in remaining if _is_filler_endurance(r, sunday=snap.sunday)]
    if not fillers:
        return None
    victim = max(fillers, key=lambda r: _tss_of(r.template_id))
    new_tid = one_notch_easier_id(victim.template_id)
    if new_tid == victim.template_id:
        return None

    before = _day_diff(victim)
    old_title = victim.title
    _apply_template(victim, new_tid, snap.ftp)
    after = _day_diff(victim)

    over_de = _wd(overload_date, snap.today, "de")
    over_en = _wd(overload_date, snap.today, "en")
    day_de = _wd(victim.date, snap.today, "de")
    day_en = _wd(victim.date, snap.today, "en")
    message_de = (
        f"Deine Extra-Kilometer von {over_de.capitalize()} zählen voll — "
        f"{old_title} am {day_de.capitalize()} wird lockerer, die Woche bleibt in Balance."
    )
    message_en = (
        f"Your extra riding on {over_en.capitalize()} counts in full — "
        f"{day_en.capitalize()}'s {old_title} eases off so the week stays balanced."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=victim.date, source="hourly", signal="extra_load",
        rule="extra_load_trim",
        message_de=message_de, message_en=message_en,
        before=before, after=after,
        evidence={
            "overload_date": overload_date.isoformat(),
            "banked": round(snap.banked),
            "projected": round(projected),
            "weekly_budget": round(snap.weekly_budget),
        },
        commit=False,
    )
    return {
        "rule": "extra_load_trim", "signal": "extra_load",
        "dates": [victim.date.isoformat()],
        "message_de": message_de, "message_en": message_en,
    }


def _green_streak(snap: _Snapshot) -> bool:
    """3+ recent days with HRV at/above the lower band and decent sleep —
    the multi-day trend the give-rule requires."""
    # ONE ESTIMATOR, shared with `adaptive_readiness`, the readiness composite
    # and the safety rails. This function used to build its own band from
    # `ln_all[-28:]` — a positional slice that (a) could span months on a sparse
    # series and (b) NESTED the days it was judging inside the reference it
    # judged them against. Both errors ran in the same direction: they made the
    # band easier to clear, and this rule hands out MORE training when it is
    # cleared. See `hrv_state` for the correction.
    rows = [
        (m.date, float(m.hrv_status))
        for m in snap.metrics
        if m.date is not None and m.hrv_status is not None and float(m.hrv_status) > 0
    ]
    state = estimate_hrv_state(rows, today=snap.today)
    if not state.usable:
        return False
    # No day inside the streak window sat below the daily band. `below_days` is
    # the calendar-day count the estimator already computes for exactly this.
    if state.below_days > 0:
        return False

    recent = [
        m for m in snap.metrics
        if m.date is not None and snap.today - timedelta(days=3) <= m.date <= snap.today
    ]
    recent = sorted(recent, key=lambda m: m.date)[-GREEN_STREAK_DAYS:]
    if len(recent) < GREEN_STREAK_DAYS:
        return False
    for m in recent:
        if m.hrv_status is None or float(m.hrv_status) <= 0:
            return False
        if m.sleep_score is not None and int(m.sleep_score) < GREEN_SLEEP_SCORE:
            return False
    return True


async def _rule_green_upgrade(
    db: AsyncSession, snap: _Snapshot, directive: Any
) -> dict | None:
    """R6 — recovery keeps coming back green and the week is under budget:
    give ONE filler endurance day a one-notch step up."""
    if snap.ftp <= 0 or snap.weekly_budget <= 0:
        return None
    if snap.status_state in ("sick", "injured", "break"):
        return None
    if bool(getattr(snap.profile, "injury_flag", False)):
        return None
    ceiling = getattr(directive, "intensity_ceiling", None) if directive else None
    if ceiling in ("rest", "easy"):
        return None
    if not _green_streak(snap):
        return None

    remaining = [
        r for r in snap.bike_rows
        if snap.today < r.date <= snap.sunday and (r.template_id or "") != "rest_day"
    ]
    projected = snap.banked + sum(_tss_of(r.template_id) for r in remaining)
    if projected > snap.weekly_budget * WEEK_UNDER_FRACTION:
        return None
    if await _signal_fired_since(
        db, snap.user_id, "green_streak", snap.start_of_day_utc
    ):
        return None

    def _day_has_quality(d: date) -> bool:
        return any(_is_quality(r) for r in snap.bike_on(d))

    for victim in sorted(
        (r for r in remaining if _is_filler_endurance(r, sunday=snap.sunday)),
        key=lambda r: r.date,
    ):
        new_tid = one_notch_harder_id(victim.template_id)
        if new_tid == victim.template_id:
            continue
        # Map the directive ceiling onto the modifier's rank scale ('hard'
        # sits between moderate and push; treat it as push-capable).
        check_ceiling = "push" if ceiling in (None, "hard", "push") else str(ceiling)
        if _template_exceeds_ceiling(new_tid, check_ceiling):
            continue
        new_cat = _category_of(new_tid)
        if new_cat in QUALITY_CATEGORIES and (
            _day_has_quality(victim.date - timedelta(days=1))
            or _day_has_quality(victim.date + timedelta(days=1))
        ):
            continue  # never stack two hard days
        delta = _tss_of(new_tid) - _tss_of(victim.template_id)
        if projected + delta > snap.weekly_budget:
            continue

        before = _day_diff(victim)
        old_title = victim.title
        _apply_template(victim, new_tid, snap.ftp)
        after = _day_diff(victim)

        day_de = _wd(victim.date, snap.today, "de")
        day_en = _wd(victim.date, snap.today, "en")
        new_title = victim.title
        message_de = (
            f"Drei grüne Tage in Folge und Luft im Wochenbudget — "
            f"{old_title} am {day_de.capitalize()} wird zu {new_title}. Du hast es dir verdient."
        )
        message_en = (
            f"Three green days in a row and room in the week — "
            f"{day_en.capitalize()}'s {old_title} steps up to {new_title}. You've earned it."
        )
        await log_adaptation(
            db, snap.user_id,
            target_date=victim.date, source="hourly", signal="green_streak",
            rule="green_streak_upgrade",
            message_de=message_de, message_en=message_en,
            before=before, after=after,
            evidence={
                "green_days": GREEN_STREAK_DAYS,
                "projected": round(projected),
                "weekly_budget": round(snap.weekly_budget),
                "intensity_ceiling": ceiling,
            },
            commit=False,
        )
        return {
            "rule": "green_streak_upgrade", "signal": "green_streak",
            "dates": [victim.date.isoformat()],
            "message_de": message_de, "message_en": message_en,
        }
    return None


async def _rule_missed_absorbed(db: AsyncSession, snap: _Snapshot) -> dict | None:
    """A missed EASY/endurance (non-quality) planned ride isn't reflowed — it
    is simply absorbed: the load is skipped, the week rolls on, no make-up.

    R3 (``_rule_missed_key``) already re-slots a missed QUALITY day; this rule
    covers the rides R3 stays silent on, so a no-show never passes unseen.
    Purely informational — it logs a feed row but mutates no PlannedWorkout.
    Capped at ONE absorbed acknowledgment per week, and suppressed when a key
    session was reflowed this week (one missed-message per week keeps the feed
    calm, never punitive)."""
    missed = [
        r for r in snap.bike_rows
        if snap.monday <= r.date < snap.today
        and (r.template_id or "") != "rest_day"
        and r.template_id in TEMPLATES
        and not _is_quality(r)
        and _category_of(r.template_id) in ("endurance", "recovery")
        and _tss_of(r.template_id) > 0
        and snap.day_actual.get(r.date, 0.0) < MISSED_DONE_TSS
    ]
    if not missed:
        return None
    # One missed-message per week: don't stack an "absorbed" note on top of a
    # key-session reflow, and don't repeat the absorbed note itself.
    if await _signal_fired_since(
        db, snap.user_id, "missed_ride_absorbed", snap.week_start_utc
    ):
        return None
    if await _signal_fired_since(
        db, snap.user_id, "missed_key_session", snap.week_start_utc
    ):
        return None

    missed_row = max(missed, key=lambda r: r.date)
    title = missed_row.title or (TEMPLATES[missed_row.template_id].name)
    missed_de = _wd(missed_row.date, snap.today, "de")
    missed_en = _wd(missed_row.date, snap.today, "en")
    message_de = (
        f"{missed_de.capitalize()} ausgefallen — kein Nachholen nötig: "
        f"{title} wird einfach absorbiert, die Woche läuft weiter."
    )
    message_en = (
        f"{missed_en.capitalize()}'s ride slipped — no make-up needed: "
        f"{title} is simply absorbed and the week rolls on."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=missed_row.date, source="hourly", signal="missed_ride_absorbed",
        rule="missed_ride_absorbed",
        message_de=message_de, message_en=message_en,
        before=_day_diff(missed_row), after=None,
        evidence={
            "missed_date": missed_row.date.isoformat(),
            "missed_template_id": missed_row.template_id,
            "absorbed": True,
            "skipped_tss": round(_tss_of(missed_row.template_id)),
        },
        commit=False,
    )
    return {
        "rule": "missed_ride_absorbed", "signal": "missed_ride_absorbed",
        "dates": [missed_row.date.isoformat()],
        "message_de": message_de, "message_en": message_en,
    }


# ─── Push (reuses the existing web-push path; send_user_push is immediate) ──

async def _push_today_change(
    db: AsyncSession, profile: Any, changes: list[dict], today: date
) -> int:
    from app.services.push_service import push_configured, send_user_push

    if not push_configured():
        return 0
    today_iso = today.isoformat()
    todays = [c for c in changes if today_iso in c.get("dates", [])]
    if not todays:
        return 0
    try:
        return await send_user_push(
            db, profile,
            "Plan angepasst",
            todays[0]["message_de"],
            "/dashboard?tab=today",
        )
    except Exception:  # noqa: BLE001 — push must never fail the adaptation
        logger.warning("plan-adaptation push failed (user %s)", profile.user_id, exc_info=True)
        return 0


# ─── Entry point ─────────────────────────────────────────────────────────────

async def _rule_readiness(db: AsyncSession, snap: _Snapshot, profile) -> dict | None:
    """R6 — die Bereitschaftsentscheidung ANWENDEN, statt sie nur anzuzeigen.

    `GET /readiness/decision` rechnet laengst ein vollstaendiges Urteil samt
    Beleg: welche Einheit heute stehen sollte, welche der Plan vorsah, und der
    eine gemessene Wert, der es bewegt hat. Der Endpunkt ist read-only und sein
    Docstring sagt, der CLIENT solle es anwenden -- nur hat das nie jemand
    verdrahtet. In der Produktion gemessen: `changed: true`, `can_modify: true`,
    `applied: FALSE`, taeglich, fuer jeden Fahrer. Das Urteil stand da und der
    Plan blieb, wie er war.

    WARUM ZULETZT IN DER KETTE. `illness` (Selbstauskunft) schlaegt alles,
    und `sleep_hrv`/`missed_key`/`extra_load` sind enger gefasst und laenger
    erprobt. Diese Regel greift genau dort, wo bisher NICHTS griff: ein
    gedrueckter Bereitschaftswert ohne die Zwei-Signal-Konjunktion, die R2
    verlangt. Genau der Fall, in dem ein Fahrer grau/54 sah und trotzdem ein
    VO2-Intervall im Plan stand.

    KEINE ZWEITE MEINUNG. Die Regel rechnet nichts nach, sondern wendet an,
    was `compute_readiness_decision` entschieden hat -- zwei Stellen, die
    dasselbe entscheiden, laufen in diesem Repo auseinander, und dann
    widersprechen sich zwei Flaechen an genau den Morgen, auf die es ankommt.
    """
    from app.services.readiness_decision import compute_readiness_decision

    try:
        d = await compute_readiness_decision(db, snap.user_id, profile, locale="de")
    except Exception:  # noqa: BLE001 — ein Urteilsfehler darf den Lauf nie kippen
        logger.exception("readiness decision failed (user %s) — rule skipped", snap.user_id)
        return None

    # Zurueckgehalten heisst zurueckgehalten: ein Urteil auf veralteten Werten
    # darf den Plan nicht anfassen, auch wenn es rechnerisch eines gibt.
    if d.withheld or not d.changed or d.applied:
        return None
    nxt = d.session_now
    if nxt is None or not nxt.template_id:
        return None

    # Nur heute, und nur solange der Tag nicht schon gefahren ist.
    if snap.day_actual.get(snap.today, 0.0) >= DAY_DONE_TSS:
        return None
    target = next(
        (r for r in snap.bike_on(snap.today)
         if (r.blocks_source or "") not in PROTECTED_SOURCES),
        None,
    )
    if target is None or target.template_id == nxt.template_id:
        return None
    if await already_adapted(
        db, snap.user_id, target_date=target.date, signal="readiness_decision",
        since=snap.start_of_day_utc,
    ):
        return None

    before = _day_diff(target)
    old_title = target.title
    minutes = nxt.duration_minutes or int(round((target.duration_seconds_target or 3600) / 60)) or 60
    _apply_template(target, nxt.template_id, snap.ftp, duration_min_target=minutes)
    after = _day_diff(target)

    treiber = (d.driver.text_de if d.driver else None) or "Deine Morgenwerte"
    verdikt = d.verdict.text_de if d.verdict else nxt.title
    message_de = f"{treiber} — aus {old_title} wird {nxt.title}. {verdikt}"
    message_en = (
        f"Today's measurements moved the session — {old_title} becomes {nxt.title}."
    )
    await log_adaptation(
        db, snap.user_id,
        target_date=target.date, source="hourly", signal="readiness_decision",
        rule="readiness_applied",
        message_de=message_de, message_en=message_en,
        before=before, after=after,
        evidence={
            "readiness_score": d.readiness_score,
            "readiness_tier": d.readiness_tier,
            "state": d.verdict.state if d.verdict else None,
            "driver_key": d.driver.key if d.driver else None,
            "driver_text_de": d.driver.text_de if d.driver else None,
            "driver_z": d.driver.z if d.driver else None,
            "counterfactual_de": d.verdict.counterfactual_text_de if d.verdict else None,
            "was": old_title,
            "wird": nxt.title,
        },
        commit=False,
    )
    return {
        "rule": "readiness_applied", "signal": "readiness_decision",
        "dates": [target.date.isoformat()],
        "message_de": message_de, "message_en": message_en,
    }


async def run_for_user(
    db: AsyncSession,
    user_id: int,
    *,
    now_utc: datetime | None = None,
    force: bool = False,
) -> dict:
    """Evaluate TODAY + the next 6 days against fresh signals and apply at
    most one material change per direction (ease / give). Every change is a
    PlannedWorkout mutation (blocks_source='coach_adapted') plus a
    plan_adaptations feed row; a change that touches TODAY also sends one
    web push. Quiet runs are fingerprint-cached and cost only the snapshot."""
    prow = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    profile = prow.scalars().first()
    if profile is None:
        return {"status": "no-profile", "changes": []}
    set_athlete_tz_from_profile(profile)

    snap = await _build_snapshot(db, user_id, profile, now_utc)
    if not snap.bike_rows:
        return {"status": "no-active-plan", "changes": []}

    cached = _LAST_QUIET.get(user_id)
    if not force and cached == (snap.today.isoformat(), snap.fingerprint):
        return {"status": "quiet", "changes": []}

    directive = None
    try:
        directive = await build_adaptive_directive(db, user_id, lang="de")
    except Exception:  # noqa: BLE001 — a directive failure degrades, never blocks
        logger.exception("adaptive directive failed (user %s) — rules degrade gracefully", user_id)

    changes: list[dict] = []

    # EASE direction — first matching rule wins (≤ 1 material change/run).
    ease = await _rule_illness(db, snap)
    if ease is None:
        ease = await _rule_sleep_hrv(db, snap, directive)
    if ease is None:
        ease = await _rule_missed_key(db, snap)
    if ease is None:
        ease = await _rule_extra_load(db, snap)
    if ease is None:
        # ZULETZT: greift genau dort, wo bisher nichts griff -- ein gedrueckter
        # Bereitschaftswert ohne die Zwei-Signal-Konjunktion aus R2.
        ease = await _rule_readiness(db, snap, profile)
    if ease is not None:
        changes.append(ease)

    # GIVE direction — independent cap (adaptation must sometimes give).
    give = await _rule_green_upgrade(db, snap, directive)
    if give is not None:
        changes.append(give)

    # MISSED (non-quality) — informational only: log that an easy ride was
    # absorbed (no plan mutation). R3 above already handles a missed key day;
    # this makes sure an easy no-show is still surfaced, honestly and calmly.
    absorbed = await _rule_missed_absorbed(db, snap)
    if absorbed is not None:
        changes.append(absorbed)

    if changes:
        await db.commit()
        # The personalized-week cache still holds the pre-adaptation week;
        # without this the UI serves the old plan until the TTL expires.
        from app.api.weeks import invalidate_personalized_week_cache

        invalidate_personalized_week_cache(user_id)
        # "Quiet on rest days" (V3 Settings): when today's plan is rest —
        # including when THIS run just turned it into rest — the athlete asked
        # for silence, so the feed row still lands but no push goes out.
        from app.services.streak import _is_rest_planned  # shared rest semantics

        today_rows = snap.bike_on(snap.today)
        rest_today = not today_rows or all(
            _is_rest_planned(r.template_id, r.title) for r in today_rows
        )
        if not (bool(getattr(profile, "quiet_on_rest_days", True)) and rest_today):
            await _push_today_change(db, profile, changes, snap.today)
        return {"status": "adapted", "changes": changes}

    _LAST_QUIET[user_id] = (snap.today.isoformat(), snap.fingerprint)
    return {"status": "no-change", "changes": []}
