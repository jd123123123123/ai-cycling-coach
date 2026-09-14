"""Plan-change interview + plan (re)build — plan-engine v2.

The contract (science file, onboarding-fields recommendation): changing the
plan CREDITS what was done and asks ONLY what the profile can't already
answer. Three pieces live here:

1. ``build_interview_questions`` — pure, delta-driven question selection.
   The interview never re-asks a known fact; it asks about deltas (goal
   changed? hours changed? what felt wrong?) plus the gaps (fields still
   null on the profile).

2. ``apply_answers`` — pure mapping from interview answers to profile-field
   updates. "Too boring" nudges the variety dial up; "no event" flips to
   maintenance; nothing here is punitive (SDT: autonomy support, no-guilt).

3. ``rebuild_plan`` — the single rebuild path used by POST /plan/build and
   POST /plan/change/apply. It deletes only engine-owned future rows
   (``ai_prescribed`` / ``coach_absorbed``); athlete-owned rows
   (``user_plan`` / ``user_modified`` / ``user_undo``) are sacred and get
   conflict-skipped by the generator — that, plus anchoring the ramp to the
   LIVE CTL (completed work is already inside CTL), is how done work is
   credited. Every rebuild writes a plan_adaptations row (rule='plan_built')
   — adaptation without a feed entry is a bug.
"""
from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.mesocycle_plan import MesocyclePlan
from app.models.planned_workout import PlannedWorkout
from app.services.athlete_time import (
    day_local_window,
    local_date_of,
    set_athlete_tz_from_profile,
    today_local,
    today_local_window,
)
from app.services.plan_adaptation_log import (
    already_adapted,
    last_adaptation,
    log_adaptation,
)

logger = logging.getLogger(__name__)

# blocks_source values the engine may rewrite. Everything else
# (user_plan / user_modified / user_undo) is athlete-owned and sacred.
ENGINE_OWNED_SOURCES: tuple[str, ...] = ("ai_prescribed", "coach_absorbed")

_WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

_FELT_WRONG_OPTIONS = ("too_hard", "too_boring", "too_rigid", "life_changed")

# variety_dial escalation used when the athlete says "too boring"
_VARIETY_BUMP = {None: "mixed", "steady": "mixed", "mixed": "adventurous",
                 "adventurous": "adventurous"}

# German weekday abbreviations for the days_changed feed message.
_WEEKDAY_DE = {"mon": "Mo", "tue": "Di", "wed": "Mi", "thu": "Do",
               "fri": "Fr", "sat": "Sa", "sun": "So"}
_WEEKDAY_EN = {"mon": "Mon", "tue": "Tue", "wed": "Wed", "thu": "Thu",
               "fri": "Fri", "sat": "Sat", "sun": "Sun"}

# Localized phase words for the plan_built feed message — the raw meso key
# ("base2") is engine vocabulary and must never leak into athlete copy
# (review polish: "Phase base2" in the feed).
_PHASE_WORDS: dict[str, tuple[str, str]] = {
    "base": ("Grundlage", "Base"),
    "build": ("Aufbau", "Build"),
    "peak": ("Peak", "Peak"),
    "taper": ("Taper", "Taper"),
    "race": ("Rennen", "Race"),
}


def phase_label(phase: str | None) -> tuple[str, str]:
    """(de, en) athlete-facing label for a meso phase key: 'base2' →
    ('Grundlage 2', 'Base 2'). Unknown keys pass through capitalized."""
    raw = (phase or "").strip()
    if not raw:
        return ("", "")
    m = re.match(r"^([a-z]+)\s*(\d+)?$", raw, re.IGNORECASE)
    stem = (m.group(1) if m else raw).lower()
    num = m.group(2) if m else None
    words = next(
        (v for k, v in _PHASE_WORDS.items() if stem.startswith(k)), None
    )
    if words is None:
        cap = raw[:1].upper() + raw[1:]
        return (cap, cap)
    de, en = words
    return (f"{de} {num}", f"{en} {num}") if num else (de, en)


def _plan_change_lead(signal: str, profile, live_ctl: float | None) -> tuple[str, str]:
    """Signal-specific, no-guilt lead sentence (DE, EN) for the plan-change
    feed — the generic 'Plan angepasst' template was signal-blind (review
    finding 6). Each lead names WHAT the athlete said and WHAT changed.
    """
    ctl_de = f" (CTL {live_ctl:.0f})" if live_ctl is not None else ""
    ctl_en = ctl_de

    if signal == "too_boring":
        return (
            "Zu eintönig — verstanden: neue Einheiten-Formate und ein "
            "anderer Wochenrhythmus, gleiche Fitnessbasis" + ctl_de + ".",
            "Too samey — got it: new session formats and a different weekly "
            "rhythm, same fitness base" + ctl_en + ".",
        )
    if signal == "too_hard":
        return (
            "Zu hart — der Plan startet jetzt bei deiner aktuellen Fitness"
            + ctl_de + ", nichts wird nachgeholt.",
            "Too hard — the plan now starts from your current fitness"
            + ctl_en + ", nothing gets made up.",
        )
    if signal == "too_rigid":
        return (
            "Zu starr — die Woche folgt jetzt deinen Zeitfenstern, mit mehr "
            "Spielraum in den Formaten.",
            "Too rigid — the week now follows your time windows, with more "
            "flexibility in the formats.",
        )
    if signal == "days_changed":
        raw = getattr(profile, "days_available", None)
        days_de = days_en = None
        if isinstance(raw, dict):
            keys = [k for k in _WEEKDAYS if raw.get(k, True)]
            if 0 < len(keys) < 7:
                days_de = "/".join(_WEEKDAY_DE[k] for k in keys)
                days_en = "/".join(_WEEKDAY_EN[k] for k in keys)
        if days_de:
            return (
                f"Neue Trainingstage übernommen — Einheiten liegen jetzt nur "
                f"noch auf {days_de}.",
                f"New training days applied — sessions now land only on "
                f"{days_en}.",
            )
        return (
            "Neue Trainingstage übernommen — harte und lange Einheiten "
            "liegen jetzt auf deinen verfügbaren Tagen.",
            "New training days applied — hard and long sessions now land on "
            "your available days.",
        )
    if signal == "hours_changed":
        hours = getattr(profile, "weekly_hours_available", None)
        if hours:
            return (
                f"Wochenumfang auf {hours:g} h angepasst — der Plan hält "
                "dieses Budget ein.",
                f"Weekly volume set to {hours:g} h — the plan stays inside "
                "that budget.",
            )
    if signal == "goal_removed":
        return (
            "Ohne Zieltermin trainierst du jetzt im Fitness-Aufbau — "
            "Fortschritt ohne Countdown.",
            "With no target date you're now on a fitness-builder progression "
            "— progress without a countdown.",
        )
    if signal == "goal_changed":
        return (
            "Neues Ziel übernommen — Phasen und Schlüsseleinheiten richten "
            "sich jetzt danach aus.",
            "New goal applied — phases and key sessions now point at it.",
        )
    if signal == "life_changed":
        return (
            "Leben geht vor — der Plan passt sich deiner neuen Situation an"
            + ctl_de + ".",
            "Life comes first — the plan adapts to your new situation"
            + ctl_en + ".",
        )
    return (
        "Plan angepasst — verankert an deiner aktuellen Fitness" + ctl_de + ".",
        "Plan updated — anchored to your current fitness" + ctl_en + ".",
    )


# ──────────────────────────────────────────────────────────────────────────
#  1. Question selection (pure)
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class InterviewQuestion:
    id: str
    type: str  # 'choice' | 'text'
    prompt_de: str
    prompt_en: str
    options: list[str] | None = None

    def as_dict(self) -> dict:
        d = {
            "id": self.id,
            "type": self.type,
            "prompt_de": self.prompt_de,
            "prompt_en": self.prompt_en,
        }
        if self.options is not None:
            d["options"] = self.options
        return d


def build_interview_questions(profile) -> list[InterviewQuestion]:
    """Delta-driven question selection. ``profile`` is any object with the
    AthleteProfile attributes (works with SimpleNamespace in tests).

    Rules:
      - 'what felt wrong' is ALWAYS asked — the profile cannot know how the
        plan felt.
      - goal/hours are asked as DELTA confirmations (the profile knows the
        current value; it can't know whether life changed it).
      - days_available / experience_level / hard_day_blackouts are asked
        ONLY while still null on the profile (never re-asked).
      - motivation_style / variety_dial are NEVER asked — they default from
        the onboarding depth selector and are learned from behavior.
    """
    questions: list[InterviewQuestion] = [
        InterviewQuestion(
            id="felt_wrong",
            type="choice",
            prompt_de="Was hat am bisherigen Plan nicht gepasst?",
            prompt_en="What didn't feel right about the plan so far?",
            options=list(_FELT_WRONG_OPTIONS),
        )
    ]

    event_date = getattr(profile, "target_event_date", None)
    if event_date is not None:
        questions.append(
            InterviewQuestion(
                id="goal_changed",
                type="choice",
                prompt_de=f"Ist dein Ziel-Event am {event_date.isoformat()} noch aktuell?",
                prompt_en=f"Is your target event on {event_date.isoformat()} still the goal?",
                options=["same", "new_event", "no_event"],
            )
        )
    else:
        questions.append(
            InterviewQuestion(
                id="goal_new",
                type="choice",
                prompt_de="Worauf arbeitest du hin?",
                prompt_en="What are you working toward?",
                options=["race", "fondo", "audax", "maintenance"],
            )
        )

    hours = getattr(profile, "weekly_hours_available", None)
    if hours is not None:
        questions.append(
            InterviewQuestion(
                id="weekly_hours",
                type="text",
                prompt_de=(
                    f"Aktuell geplant: {hours:g} h/Woche. Wenn sich das geändert hat, "
                    "schick die neue Stundenzahl — sonst leer lassen."
                ),
                prompt_en=(
                    f"Currently planned: {hours:g} h/week. If that changed, send the "
                    "new number of hours — otherwise leave blank."
                ),
            )
        )
    else:
        questions.append(
            InterviewQuestion(
                id="weekly_hours",
                type="text",
                prompt_de="Wie viele Stunden pro Woche sind realistisch?",
                prompt_en="How many hours per week are realistic?",
            )
        )

    if getattr(profile, "days_available", None) is None:
        questions.append(
            InterviewQuestion(
                id="days_available",
                type="text",
                prompt_de=(
                    "An welchen Tagen kannst du trainieren, und welcher Tag ist dein "
                    "langer Tag? (z. B. mo, di, do, sa, so — langer Tag: sa)"
                ),
                prompt_en=(
                    "Which days can you train, and which is your long day? "
                    "(e.g. mon, tue, thu, sat, sun — long day: sat)"
                ),
            )
        )

    if getattr(profile, "experience_level", None) is None:
        questions.append(
            InterviewQuestion(
                id="experience_level",
                type="choice",
                prompt_de="Wie viel strukturiertes Training kennst du schon?",
                prompt_en="How much structured training have you done before?",
                options=["new", "returning", "seasoned"],
            )
        )

    if getattr(profile, "hard_day_blackouts", None) is None:
        questions.append(
            InterviewQuestion(
                id="hard_day_blackouts",
                type="text",
                prompt_de=(
                    "Gibt es Tage, an denen harte Einheiten nie liegen sollen? "
                    "(optional, z. B. mo, fr)"
                ),
                prompt_en=(
                    "Any days where hard sessions should never land? "
                    "(optional, e.g. mon, fri)"
                ),
            )
        )

    return questions


# ──────────────────────────────────────────────────────────────────────────
#  2. Answer → profile-update mapping (pure)
# ──────────────────────────────────────────────────────────────────────────

@dataclass
class AppliedAnswers:
    """Result of mapping interview answers onto the profile."""

    updates: dict = field(default_factory=dict)   # AthleteProfileUpdate kwargs
    signals: list[str] = field(default_factory=list)  # machine-readable drivers
    notes: list[str] = field(default_factory=list)    # honest, human-readable


def apply_answers(profile, answers: dict) -> AppliedAnswers:
    """Map interview answers to profile-field updates. Pure — no DB.

    Never punitive: 'too_hard' does NOT slash anything (the rebuild anchors
    to live CTL, which is the honest feasibility fix); 'too_boring' turns
    the variety dial up one notch.
    """
    out = AppliedAnswers()
    answers = answers or {}

    felt = answers.get("felt_wrong")
    if felt in _FELT_WRONG_OPTIONS:
        out.signals.append(felt)
        if felt == "too_boring":
            current = getattr(profile, "variety_dial", None)
            bumped = _VARIETY_BUMP.get(current, "mixed")
            if bumped != current:
                out.updates["variety_dial"] = bumped
                out.notes.append(f"variety dial {current or 'unset'} -> {bumped}")
        elif felt == "too_rigid":
            # Rigidity is a structure complaint — the fix is real availability
            # data, not more intensity. Nudge variety only from 'steady'.
            if getattr(profile, "variety_dial", None) in (None, "steady"):
                out.updates["variety_dial"] = "mixed"
                out.notes.append("variety dial -> mixed (plan felt rigid)")

    goal_changed = answers.get("goal_changed")
    if goal_changed == "no_event" or answers.get("goal_new") == "maintenance":
        out.updates["target_event_date"] = None
        out.updates["target_event_type"] = "maintenance"
        out.updates["target_priority"] = None
        out.signals.append("goal_removed")
        out.notes.append("goal -> maintenance (no target event)")
    elif goal_changed == "new_event" or answers.get("goal_new") in ("race", "fondo", "audax"):
        # Structured event fields ride along in the same answers payload.
        if answers.get("target_event_date"):
            out.updates["target_event_date"] = answers["target_event_date"]
        if answers.get("target_event_type") in ("race", "fondo", "audax", "maintenance"):
            out.updates["target_event_type"] = answers["target_event_type"]
        elif answers.get("goal_new") in ("race", "fondo", "audax"):
            out.updates["target_event_type"] = answers["goal_new"]
        if answers.get("target_priority") in ("A", "B", "C"):
            out.updates["target_priority"] = answers["target_priority"]
        if out.updates:
            out.signals.append("goal_changed")

    if answers.get("weekly_hours") not in (None, "", 0):
        try:
            hours = float(answers["weekly_hours"])
        except (TypeError, ValueError):
            hours = None
        if hours is not None and 1.0 <= hours <= 40.0:
            if hours != getattr(profile, "weekly_hours_available", None):
                out.updates["weekly_hours_available"] = hours
                out.signals.append("hours_changed")
                out.notes.append(f"weekly hours -> {hours:g}")

    if isinstance(answers.get("days_available"), dict):
        out.updates["days_available"] = answers["days_available"]
        out.signals.append("days_changed")

    if isinstance(answers.get("hard_day_blackouts"), list):
        cleaned = [d for d in answers["hard_day_blackouts"] if d in _WEEKDAYS]
        if len(cleaned) < 7:
            out.updates["hard_day_blackouts"] = cleaned

    if answers.get("experience_level") in ("new", "returning", "seasoned"):
        out.updates["experience_level"] = answers["experience_level"]

    # Direct sets are allowed (autonomy support) but never required.
    if answers.get("motivation_style") in ("race_focused", "fitness_builder", "fun_variety"):
        out.updates["motivation_style"] = answers["motivation_style"]
    if answers.get("variety_dial") in ("steady", "mixed", "adventurous"):
        out.updates["variety_dial"] = answers["variety_dial"]

    if felt == "life_changed":
        out.notes.append("life changed — availability answers applied above")

    return out


# ──────────────────────────────────────────────────────────────────────────
#  3. Current-state snapshot (credits what was done)
# ──────────────────────────────────────────────────────────────────────────

async def interview_state(db: AsyncSession, user_id: int, profile) -> dict:
    """What the athlete has already done under the current plan.

    weeks_completed / sessions_done / compliance_pct / ctl_delta_since_start
    / favorite_session (most-completed archetype — there is no per-ride RPE
    satisfaction store yet, so 'most completed' is the honest proxy).
    """
    set_athlete_tz_from_profile(profile)
    today = today_local()

    # Earliest surviving meso anchor = plan start (program switches delete
    # old anchors, so this is the start of the CURRENT plan lineage).
    res = await db.execute(
        select(MesocyclePlan.plan_start_date)
        .where(MesocyclePlan.user_id == user_id)
        .order_by(MesocyclePlan.plan_start_date.asc())
        .limit(1)
    )
    plan_start: date | None = res.scalar_one_or_none()

    state: dict = {
        "weeks_completed": 0,
        "sessions_done": 0,
        "planned_sessions": 0,
        "compliance_pct": None,
        "ctl_delta_since_start": None,
        "favorite_session": None,
    }
    if plan_start is None:
        return state

    state["weeks_completed"] = max(0, (today - plan_start).days // 7)

    # Planned non-rest sessions in [plan_start, today)
    pw_res = await db.execute(
        select(PlannedWorkout).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= plan_start,
            PlannedWorkout.date < today,
        )
    )
    planned = [
        pw for pw in pw_res.scalars().all()
        if (pw.template_id or "") != "rest_day" and pw.sport != "rest"
    ]
    state["planned_sessions"] = len(planned)

    # Activities in the same window, bucketed by athlete-local day + sport
    if planned:
        act_res = await db.execute(
            select(Activity).where(
                Activity.user_id == user_id,
                Activity.started_at >= day_local_window(plan_start)[0],
                Activity.started_at < day_local_window(today)[0],
            )
        )
        done_days: set[tuple[str, str]] = set()
        for a in act_res.scalars().all():
            if a.started_at is None:
                continue
            done_days.add((local_date_of(a.started_at).isoformat(), a.sport))

        done_templates: Counter[str] = Counter()
        sessions_done = 0
        for pw in planned:
            if (pw.date.isoformat(), pw.sport) in done_days:
                sessions_done += 1
                if pw.template_id:
                    done_templates[pw.template_id] += 1
        state["sessions_done"] = sessions_done
        state["compliance_pct"] = round(100.0 * sessions_done / len(planned))

        if done_templates:
            fav_id, fav_count = done_templates.most_common(1)[0]
            fav: dict = {"template_id": fav_id, "completed": fav_count}
            try:
                from app.services.workout_templates import get_template

                tmpl = get_template(fav_id)
                if tmpl is not None:
                    fav["title"] = tmpl.name
                    fav["category"] = tmpl.category
            except Exception:  # noqa: BLE001 — favorite is decoration, never a 500
                pass
            state["favorite_session"] = fav

    # CTL now vs CTL at plan start (live PMC — completed work lives in CTL)
    try:
        from app.services.pmc_service import compute_user_pmc

        rows = (await compute_user_pmc(db, user_id, days=120)).get("total") or []
        if rows:
            ctl_now = float(rows[-1].get("ctl") or 0.0)
            start_iso = plan_start.isoformat()
            ctl_start = None
            for row in rows:
                if str(row.get("date")) >= start_iso:
                    ctl_start = float(row.get("ctl") or 0.0)
                    break
            if ctl_start is None:
                ctl_start = float(rows[0].get("ctl") or 0.0)
            state["ctl_delta_since_start"] = round(ctl_now - ctl_start, 1)
    except Exception:  # noqa: BLE001 — snapshot must never break the interview
        logger.exception("interview_state: PMC computation failed for user_id=%s", user_id)

    return state


# ──────────────────────────────────────────────────────────────────────────
#  4. Rebuild (shared by POST /plan/build and POST /plan/change/apply)
# ──────────────────────────────────────────────────────────────────────────

async def rebuild_plan(
    db: AsyncSession,
    user_id: int,
    profile,
    *,
    source: str,
    signal: str,
    carried: dict | None = None,
    idempotent_per_day: bool = False,
    atomic: bool = False,
) -> dict:
    """Rebuild the plan from the profile via the generator's PUBLIC entry
    point. Credits completed work two ways:

      1. The ramp is anchored to the LIVE CTL (completed sessions are inside
         CTL by construction) — asserted below, never silently dropped.
      2. Athlete-owned rows (user_plan/user_modified/user_undo) survive and
         are conflict-skipped by the generator.

    Writes exactly one plan_adaptations row (rule='plan_built'). With
    ``idempotent_per_day`` a second call on the same athlete-local day
    returns the existing plan without rebuilding or re-logging.
    """
    from app.services.mesocycle_generator import generate_mesocycle
    from app.services.pmc_service import compute_user_pmc

    # Guard BEFORE any destructive delete — the generator would raise the
    # same ValueError, but only after we had already wiped future rows.
    if (getattr(profile, "primary_sport", None) or "cycling") == "cycling" and (
        getattr(profile, "ftp_watts", 0) or 0
    ) < 100:
        raise ValueError(
            "Athlete FTP is below the 100 W minimum for plan generation — "
            "set FTP before building a plan"
        )

    set_athlete_tz_from_profile(profile)
    today = today_local()
    monday = today - timedelta(days=today.weekday())

    if idempotent_per_day and await already_adapted(
        db, user_id, target_date=today, signal=signal,
        since=today_local_window()[0],
    ):
        summary = await _week_summary(db, user_id, monday)
        summary["rebuilt"] = False
        return summary

    # Count the sacred rows we are about to preserve — the feed message
    # states this honestly.
    sacred_res = await db.execute(
        select(PlannedWorkout.id).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date > today,
            PlannedWorkout.blocks_source.not_in(ENGINE_OWNED_SOURCES),
        )
    )
    preserved = len(sacred_res.scalars().all())

    # Delete ONLY engine-owned future rows (both sports — this is a whole-plan
    # rebuild; the generator replans runs too). Past days are history: sacred.
    await db.execute(
        delete(PlannedWorkout).where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date > today,
            PlannedWorkout.blocks_source.in_(ENGINE_OWNED_SOURCES),
        )
    )
    await db.execute(
        delete(MesocyclePlan).where(
            MesocyclePlan.user_id == user_id,
            MesocyclePlan.plan_start_date >= monday - timedelta(days=28),
        )
    )
    if atomic:
        await db.flush()
    else:
        await db.commit()

    # Live CTL is the generator's anchor — the mechanism that credits every
    # completed session. If PMC has data, the anchor MUST exist.
    live_ctl: float | None = None
    pmc_rows: list = []
    try:
        pmc_rows = (await compute_user_pmc(db, user_id, days=90)).get("total") or []
        if pmc_rows:
            live_ctl = float(pmc_rows[-1].get("ctl") or 0.0)
    except Exception:  # noqa: BLE001 — degrade to proximity-only phase detection
        logger.exception("rebuild_plan: PMC failed for user_id=%s", user_id)
    assert not pmc_rows or live_ctl is not None, (
        "live CTL must anchor the rebuild when PMC data exists — "
        "completed work is credited through the CTL anchor"
    )

    meso = await generate_mesocycle(
        db, user_id, plan_start_date=monday, current_ctl=live_ctl
    )
    # generate_mesocycle leaves the commit to its caller (weeks.py does the
    # same) — without this the fresh plan silently rolls back.
    if atomic:
        await db.flush()
    else:
        await db.commit()

    summary = await _week_summary(db, user_id, monday)
    summary["rebuilt"] = True
    summary["phase"] = meso.phase
    summary["weekly_tss_targets"] = list(meso.weekly_tss_targets or [])
    summary["preserved_sessions"] = preserved
    summary["ctl_anchor"] = live_ctl

    # Hours reconciliation (review finding 4): the response must let the UI
    # reconcile the delivered week with the stated hours — planned_hours from
    # the actual rows, plus the generator's persisted anchor explanation.
    summary["declared_hours"] = getattr(profile, "weekly_hours_available", None)
    meso_evidence = getattr(meso, "evidence", None) or {}
    summary["hours_note"] = meso_evidence.get("hours_note")
    summary["progression"] = meso_evidence.get("progression")

    carried = carried or {}
    sessions_done = carried.get("sessions_done")
    n_sessions = sum(1 for d in summary["week"] if d.get("template_id") != "rest_day")

    if source == "plan_change":
        # Signal-specific lead (review finding 6: 'too_boring' and
        # 'days_changed' used to share one generic template), then the
        # credit suffix — done work always counts, never guilt.
        lead_de, lead_en = _plan_change_lead(signal, profile, live_ctl)
        done_de = (
            f" Deine {sessions_done} absolvierten Einheiten zählen weiter."
            if sessions_done else ""
        )
        done_en = (
            f" Your {sessions_done} completed sessions still count."
            if sessions_done else ""
        )
        message_de = (
            lead_de + done_de
            + (f" {preserved} eigene Einheiten bleiben unangetastet." if preserved else "")
        )
        message_en = (
            lead_en + done_en
            + (f" {preserved} of your own sessions stay untouched." if preserved else "")
        )
    else:
        phase_de, phase_en = phase_label(meso.phase)
        message_de = (
            f"Plan erstellt: Phase {phase_de}, {n_sessions} Einheiten diese Woche — "
            f"aufgebaut auf deiner aktuellen Fitness"
            f"{f' (CTL {live_ctl:.0f})' if live_ctl is not None else ''}."
        )
        message_en = (
            f"Plan built: phase {phase_en}, {n_sessions} sessions this week — "
            f"built on your current fitness"
            f"{f' (CTL {live_ctl:.0f})' if live_ctl is not None else ''}."
        )

    # Double-log guard (review NEW-3): a double rebuild minutes apart wrote
    # two IDENTICAL "Plan angepasst" rows. When the NEWEST feed row already
    # says exactly this (same signal, same athlete-local day, identical
    # message, nothing logged in between), suppress the duplicate — an
    # idempotency guard on the append-only stream, never a delete.
    newest = await last_adaptation(db, user_id)
    duplicate = (
        newest is not None
        and newest.rule == "plan_built"
        and newest.signal == signal
        and newest.target_date == today
        and newest.message_de == message_de
    )
    if not duplicate:
        await log_adaptation(
            db,
            user_id,
            target_date=today,
            source=source,
            signal=signal,
            rule="plan_built",
            commit=not atomic,
            message_de=message_de,
            message_en=message_en,
            before=None,
            after={
                "plan_start_date": monday.isoformat(),
                "phase": meso.phase,
                "weekly_tss_targets": list(meso.weekly_tss_targets or []),
            },
            evidence={
                "ctl_anchor": live_ctl,
                "preserved_sessions": preserved,
                **{k: v for k, v in carried.items() if v is not None},
            },
        )

    return summary


async def _week_summary(db: AsyncSession, user_id: int, monday: date) -> dict:
    """Compact current-week summary for the build/apply responses."""
    res = await db.execute(
        select(PlannedWorkout)
        .where(
            PlannedWorkout.user_id == user_id,
            PlannedWorkout.date >= monday,
            PlannedWorkout.date < monday + timedelta(days=7),
        )
        .order_by(PlannedWorkout.date.asc())
    )
    rows = res.scalars().all()

    def _title_de(template_id: str | None, fallback: str) -> str:
        """German template title (additive) so the interview's new-week list
        can render locale-honest rows — mirrors weeks._localized_title."""
        from app.services.run_workout_templates import RUN_TEMPLATES
        from app.services.workout_templates import TEMPLATES

        if not template_id:
            return fallback
        t = TEMPLATES.get(template_id)
        if t is not None and getattr(t, "name_de", ""):
            return t.name_de
        rt = RUN_TEMPLATES.get(template_id)
        if rt is not None and getattr(rt, "name_de", ""):
            return rt.name_de
        return fallback

    week = [
        {
            "date": pw.date.isoformat(),
            "sport": pw.sport,
            "title": pw.title,
            "title_de": _title_de(pw.template_id, pw.title),
            "template_id": pw.template_id,
            "blocks_source": pw.blocks_source,
            "duration_seconds_target": getattr(pw, "duration_seconds_target", None),
        }
        for pw in rows
    ]
    planned_hours = round(
        sum(float(getattr(pw, "duration_seconds_target", None) or 0) for pw in rows)
        / 3600.0,
        1,
    )
    return {
        "plan_start_date": monday.isoformat(),
        "week": week,
        "planned_hours": planned_hours,
    }
