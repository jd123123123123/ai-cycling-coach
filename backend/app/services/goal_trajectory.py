"""Goal trajectory projection — where is the athlete's fitness pointing, and
will they arrive at race-day with the form they need?

July 2026 rewrite (usability audit P0-4): the old linear extrapolation
("CTL 33 → 0, HINTER DEM ZIEL, ~296 TSS/Wo.") is replaced with a FORWARD
SIMULATION of the athlete's own plan:

    - Day by day from tomorrow to the day before the event, roll the app's
      own 42/7 CTL/ATL EWMA (training_load.update_ctl_atl) under:
        (a) materialized PlannedWorkout rows (template base TSS, with the
            run/strength fallback via mesocycle_generator.template_tss_estimate);
        (b) beyond the materialized plan, PURELY synthesized weeks — phase from
            detect_training_phase at that simulated week, Issurin 4-week block
            cycling, weekly TSS from mesocycle_generator.weekly_tss_target with
            the Friel 8% week-over-week cap carried across weeks, spread /7 per
            day. The taper falls out naturally from the phase ramp factors.
    - HONESTY GUARD: no target event, or fewer than ~14 days of real training
      history → projection_basis='none' with null projections and
      on_track='unknown'. We NEVER emit 0 as a projection.
    - weekly_tss_required is the plan's own next-7-days TSS (its ramp), not
      actual+gap arithmetic.
    - on_track='behind' only when the simulated race-day CTL misses target_ctl
      by more than 10%.

Entry points:
    - compute_goal_trajectory(db, user_id, profile, lang) — THE one producer
      every surface (coach /goal-trajectory endpoint, period report) calls.
      Normalizes the goals dict internally (first-class event date overwrites
      the JSONB copy; default target_ctl injected from event type/priority).
    - project(...) — the pure simulation core; kept signature-compatible for
      coach_service / session_report callers.

Mujika taper targets (Mujika & Padilla 2003):
    - Race-day TSB optimum: +5 to +25 (our "ideal" band)
    - Below -15 = overreached; +25 to +40 = too fresh; < +5 = too flat.

References: .planning/research/training-frameworks.md §§ Banister, Mujika.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import TYPE_CHECKING, Literal

if TYPE_CHECKING:  # pragma: no cover
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.athlete_profile import AthleteProfile

OnTrack = Literal["ahead", "on_track", "behind", "no_goal", "unknown"]
TaperWindow = Literal["too_flat", "ideal", "too_fresh", "overreached", "unknown"]
ProjectionBasis = Literal["plan", "synthesized", "none"]

# Honesty guard: below this many days of real training history the EWMA is
# still dominated by its zero seed — any race-day number would be noise.
MIN_HISTORY_DAYS = 14

# on_track tolerance: 'behind'/'ahead' only when the simulated race-day CTL
# misses/beats target_ctl by more than this fraction (audit P0-4).
ON_TRACK_TOLERANCE = 0.10


# ======================================================================
#  Data shapes
# ======================================================================

@dataclass(frozen=True)
class PMCEntry:
    """Lightweight shape — callers using compute_user_pmc can just pass dicts;
    we dict-unpack defensively in the projection function.
    """

    date: date
    ctl: float
    atl: float
    tsb: float


@dataclass(frozen=True)
class TrajectoryProjection:
    days_to_goal: int | None
    ctl_now: float
    ctl_7d_delta: float
    ctl_projected_at_goal: float | None
    ctl_target: float | None
    tsb_projected_at_goal: float | None
    taper_window: TaperWindow
    on_track: OnTrack
    weekly_tss_required: float | None
    weekly_tss_actual: float
    narrative_hook: str
    projection_basis: ProjectionBasis


# ======================================================================
#  Mujika taper thresholds
# ======================================================================

TSB_IDEAL_MIN = 5.0
TSB_IDEAL_MAX = 25.0
TSB_TOO_FRESH_MAX = 40.0
TSB_OVERREACHED = -15.0


def _taper_window(tsb_at_goal: float) -> TaperWindow:
    """Classify TSB at race day per Mujika taper literature."""
    if tsb_at_goal < TSB_OVERREACHED:
        return "overreached"
    if tsb_at_goal < TSB_IDEAL_MIN:
        return "too_flat"
    if tsb_at_goal <= TSB_IDEAL_MAX:
        return "ideal"
    if tsb_at_goal <= TSB_TOO_FRESH_MAX:
        return "too_fresh"
    return "too_fresh"  # anything above 40 is also "too fresh / detrained"


# ======================================================================
#  Helpers
# ======================================================================

def _as_pmc_row(entry: dict | PMCEntry) -> dict:
    """Normalize — callers may pass dicts (from compute_user_pmc) or PMCEntry."""
    if isinstance(entry, dict):
        return entry
    return {"date": entry.date, "ctl": entry.ctl, "atl": entry.atl, "tsb": entry.tsb}


def _ctl_7d_delta(pmc: list[dict]) -> float:
    """CTL change from 7 days ago to today. 0 when <8 rows available."""
    if len(pmc) < 8:
        return 0.0
    today = float(pmc[-1].get("ctl", 0.0))
    week_ago = float(pmc[-8].get("ctl", 0.0))
    return round(today - week_ago, 2)


def _trailing_weekly_tss(pmc: list[dict], days: int = 28) -> float:
    """Trailing weekly TSS average over the last `days` entries.

    Sums TSS over the last N rows (each row is one day) and scales to a per-week
    average. When `tss` key is missing we estimate from CTL trajectory: over a
    stable period avg TSS ≈ avg CTL (the Banister identity in reverse).
    """
    if not pmc:
        return 0.0
    tail = pmc[-days:]
    total = 0.0
    tss_present = False
    for row in tail:
        if "tss" in row and row["tss"] is not None:
            total += float(row["tss"])
            tss_present = True
    if tss_present and tail:
        # Scale to weekly
        return round(total / len(tail) * 7.0, 1)

    # Fallback — derive from CTL. Coarse proxy when `tss` isn't attached.
    avg_ctl = sum(float(r.get("ctl", 0.0)) for r in tail) / max(1, len(tail))
    return round(avg_ctl * 7.0, 1)


def _history_days(pmc: list[dict], today: date) -> int:
    """Days of REAL training history: today minus the first day with TSS > 0.

    The PMC series is zero-padded back to the window start for new athletes,
    so `len(pmc)` overstates history. When no row carries a `tss` key at all
    (legacy callers passing bare CTL rows) fall back to the row count.
    """
    if not pmc:
        return 0
    if not any("tss" in r for r in pmc):
        return len(pmc)
    active = [r["date"] for r in pmc if float(r.get("tss") or 0.0) > 0.0]
    if not active:
        return 0
    first = min(active)
    return (today - first).days + 1


# ======================================================================
#  Forward simulation core
# ======================================================================

def _simulate_to_event(
    *,
    ctl_now: float,
    atl_now: float,
    today: date,
    event_date: date,
    target_ctl: float | None,
    planned_by_date: dict[date, float],
) -> dict:
    """Roll the 42/7 EWMA day-by-day from tomorrow to the day BEFORE the event.

    Race-day form = the state entering race day (we never guess the race's own
    TSS). Days inside the materialized plan horizon with no row are honest
    rest days (0 TSS). Days beyond the horizon are synthesized week-by-week
    via the app's own periodization engine.

    Returns {ctl, atl, tsb, basis, next_week_tss}.
    """
    from app.services.mesocycle_generator import (
        FRIEL_RAMP_CAP_PCT,
        issurin_block_for_week,
        weekly_tss_target,
    )
    from app.services.training_load import update_ctl_atl
    from app.services.training_periodization import detect_training_phase

    ctl = float(ctl_now)
    atl = float(atl_now)
    plan_horizon = max(planned_by_date) if planned_by_date else None

    used_synth = False
    synth_week_idx = 0
    prev_build_week: float | None = None
    synth_week_monday: date | None = None
    daily_synth = 0.0
    next7_tss = 0.0
    next7_end = today + timedelta(days=7)

    d = today + timedelta(days=1)
    while d < event_date:
        if plan_horizon is not None and d <= plan_horizon:
            tss = planned_by_date.get(d, 0.0)
        else:
            monday = d - timedelta(days=d.weekday())
            if monday != synth_week_monday:
                synth_week_monday = monday
                # Phase as it would be detected AT that simulated week, with
                # the simulated CTL — the taper emerges from the ramp factors.
                phase = detect_training_phase(
                    event_date,
                    ctl,
                    target_ctl=target_ctl,
                    today=max(monday, today),
                )
                block = issurin_block_for_week(synth_week_idx % 4)
                weekly = float(weekly_tss_target(ctl, phase, block))
                if block != "recovery":
                    if prev_build_week is not None:
                        weekly = min(
                            weekly, prev_build_week * (1.0 + FRIEL_RAMP_CAP_PCT)
                        )
                    prev_build_week = weekly
                daily_synth = weekly / 7.0
                synth_week_idx += 1
            tss = daily_synth
            used_synth = True

        ctl, atl = update_ctl_atl(ctl, atl, tss)
        if d <= next7_end:
            next7_tss += tss
        d += timedelta(days=1)

    return {
        "ctl": ctl,
        "atl": atl,
        "tsb": ctl - atl,
        "basis": "synthesized" if used_synth else "plan",
        "next_week_tss": round(next7_tss, 1),
    }


# ======================================================================
#  Public API — pure core
# ======================================================================

def _none_basis(
    *,
    pmc: list[dict],
    ctl_now: float,
    ctl_7d: float,
    weekly_actual: float,
    days_to_goal: int | None,
    target_ctl: float | None,
    hook: str,
) -> TrajectoryProjection:
    """Honest null projection — the frontend renders 'Prognose folgt …'."""
    return TrajectoryProjection(
        days_to_goal=days_to_goal,
        ctl_now=round(ctl_now, 1),
        ctl_7d_delta=ctl_7d,
        ctl_projected_at_goal=None,
        ctl_target=target_ctl,
        tsb_projected_at_goal=None,
        taper_window="unknown",
        on_track="unknown",
        weekly_tss_required=None,
        weekly_tss_actual=weekly_actual,
        narrative_hook=hook,
        projection_basis="none",
    )


def project(
    user_pmc: list[dict] | list[PMCEntry],
    athlete_goals: dict | None,
    phase: str,
    lang: str = "en",
    *,
    planned_by_date: dict[date, float] | None = None,
    today: date | None = None,
) -> TrajectoryProjection:
    """Forward-simulate fitness and form to the goal date.

    `phase` is retained for caller compatibility (coach_service /
    session_report pass it) but the simulation detects the phase per simulated
    week itself.

    Honesty guard (audit P0-4): no target event, past event, or fewer than
    MIN_HISTORY_DAYS days of real training history → projection_basis='none',
    null projections, on_track='unknown'. Never a fabricated 0.
    """
    de = lang == "de"
    today = today or date.today()
    pmc = [_as_pmc_row(e) for e in user_pmc] if user_pmc else []

    if not pmc:
        return _none_basis(
            pmc=pmc, ctl_now=0.0, ctl_7d=0.0, weekly_actual=0.0,
            days_to_goal=None, target_ctl=None,
            hook=(
                "Noch nicht genug Trainingshistorie für eine Prognose — "
                "log ein paar Wochen und wir zeigen dir, wohin es geht."
            ) if de else (
                "Not enough training history yet to project a trajectory — "
                "log a few weeks and we'll show where you're pointed."
            ),
        )

    ctl_now = float(pmc[-1].get("ctl", 0.0))
    atl_now = float(pmc[-1].get("atl", ctl_now))
    ctl_7d = _ctl_7d_delta(pmc)
    weekly_actual = _trailing_weekly_tss(pmc, days=28)

    # ---- Goal parsing ---------------------------------------------------
    goals = athlete_goals if isinstance(athlete_goals, dict) else {}
    target_ctl: float | None = None
    target_ctl_raw = goals.get("target_ctl")
    if isinstance(target_ctl_raw, (int, float)):
        target_ctl = float(target_ctl_raw)

    # event_date may be nested in `target_event` (existing shape) or flat
    event_date_str: str | None = None
    if isinstance(goals.get("target_event"), dict):
        event_date_str = goals["target_event"].get("date")
    if not event_date_str and isinstance(goals.get("event_date"), str):
        event_date_str = goals["event_date"]

    goal_date: date | None = None
    if event_date_str:
        try:
            goal_date = date.fromisoformat(event_date_str)
        except (ValueError, TypeError):
            goal_date = None

    # A target event in the past is not an active goal — the race already
    # happened. No projection "to race day".
    if goal_date is not None and goal_date < today:
        goal_date = None

    # ---- Honesty guard: no event → basis 'none' (with a trend hook) ------
    if goal_date is None:
        if ctl_7d > 0.5:
            hook = (
                f"Konstanz ist das Ziel — deine Fitness steigt um +{ctl_7d:.1f}/Woche, "
                "eine gesunde Aufbaurate. Leg ein Zielevent an, dann rechnen wir "
                "den Renntag hoch."
            ) if de else (
                f"Consistency is the goal — your fitness is trending +{ctl_7d:.1f}/week, "
                "a healthy build rate. Set a target event and we'll project race day."
            )
        elif ctl_7d < -0.5:
            hook = (
                f"Deine Fitness ist diese Woche um {ctl_7d:+.1f} gesunken — entweder ein "
                "geplanter Deload oder ein Zeichen, etwas Umfang draufzulegen."
            ) if de else (
                f"Your fitness has dipped {ctl_7d:+.1f} this week — either a planned "
                "deload or a sign to add a little volume."
            )
        else:
            hook = (
                "Du hältst das Niveau — konstanter Umfang ist die Basis."
            ) if de else "You're holding steady — consistent volume is the base."
        return _none_basis(
            pmc=pmc, ctl_now=ctl_now, ctl_7d=ctl_7d, weekly_actual=weekly_actual,
            days_to_goal=None, target_ctl=target_ctl, hook=hook,
        )

    days_to_goal = max(0, (goal_date - today).days)

    # ---- Honesty guard: not enough real history → basis 'none' -----------
    if _history_days(pmc, today) < MIN_HISTORY_DAYS:
        hook = (
            "Prognose folgt — nach 2-3 Trainingswochen können wir den Renntag "
            "hochrechnen."
        ) if de else (
            "Forecast coming — after 2-3 weeks of training we can project "
            "race day."
        )
        return _none_basis(
            pmc=pmc, ctl_now=ctl_now, ctl_7d=ctl_7d, weekly_actual=weekly_actual,
            days_to_goal=days_to_goal, target_ctl=target_ctl, hook=hook,
        )

    # ---- Forward simulation to race day ---------------------------------
    sim = _simulate_to_event(
        ctl_now=ctl_now,
        atl_now=atl_now,
        today=today,
        event_date=goal_date,
        target_ctl=target_ctl,
        planned_by_date=planned_by_date or {},
    )
    ctl_proj = sim["ctl"]
    tsb_proj = sim["tsb"]
    basis: ProjectionBasis = sim["basis"]
    weekly_tss_required = sim["next_week_tss"]

    taper_win = _taper_window(tsb_proj) if days_to_goal <= 21 else "unknown"

    # ---- On-track classification (only with a valid projection) ----------
    on_track: OnTrack
    if target_ctl is None or target_ctl <= 0:
        on_track = "on_track"  # no target = can't be off-track
    elif ctl_proj < target_ctl * (1.0 - ON_TRACK_TOLERANCE):
        on_track = "behind"
    elif ctl_proj > target_ctl * (1.0 + ON_TRACK_TOLERANCE):
        on_track = "ahead"
    else:
        on_track = "on_track"

    # ---- Narrative hook -------------------------------------------------
    hook = _narrative_hook(
        ctl_now=ctl_now,
        ctl_7d=ctl_7d,
        ctl_proj=ctl_proj,
        target_ctl=target_ctl,
        days_to_goal=days_to_goal,
        taper_win=taper_win,
        on_track=on_track,
        weekly_required=weekly_tss_required,
        lang=lang,
    )

    return TrajectoryProjection(
        days_to_goal=days_to_goal,
        ctl_now=round(ctl_now, 1),
        ctl_7d_delta=ctl_7d,
        ctl_projected_at_goal=round(ctl_proj, 1),
        ctl_target=target_ctl,
        tsb_projected_at_goal=round(tsb_proj, 1),
        taper_window=taper_win,
        on_track=on_track,
        weekly_tss_required=weekly_tss_required,
        weekly_tss_actual=weekly_actual,
        narrative_hook=hook,
        projection_basis=basis,
    )


def _narrative_hook(
    *,
    ctl_now: float,
    ctl_7d: float,
    ctl_proj: float,
    target_ctl: float | None,
    days_to_goal: int,
    taper_win: TaperWindow,
    on_track: OnTrack,
    weekly_required: float,
    lang: str = "en",
) -> str:
    """One-line narrative the UI can drop into the trajectory card."""
    de = lang == "de"
    if days_to_goal <= 7 and taper_win == "ideal":
        return (
            "Rennwoche — deine prognostizierte Frische liegt im idealen Fenster. "
            "Vertrau dem Taper."
        ) if de else (
            "Race week — projected freshness lands in the ideal window. "
            "Trust the taper."
        )
    if days_to_goal <= 14 and taper_win == "overreached":
        return (
            f"Du steckst mit {days_to_goal} Tagen noch tief in der Ermüdung — "
            "der Umfang muss diese Woche deutlicher runter."
        ) if de else (
            f"You're still heavy in fatigue with {days_to_goal}d to go — "
            "volume cut needs to be sharper this week."
        )
    if days_to_goal <= 14 and taper_win == "too_fresh":
        return (
            "Du bist vielleicht über-getapert — ein paar kurze Öffner bringen "
            "dich zurück ins Renn-Fenster."
        ) if de else (
            "You may be over-tapered — a couple of short openers will sharpen "
            "you back into the race window."
        )

    if target_ctl is not None:
        if on_track == "on_track":
            return (
                f"Im Plan: Der Trainingsplan bringt dich auf {ctl_proj:.0f} zum "
                f"Renntag (Ziel {target_ctl:.0f})."
            ) if de else (
                f"On track: the plan carries you to {ctl_proj:.0f} by race day "
                f"(target {target_ctl:.0f})."
            )
        if on_track == "ahead":
            return (
                f"Vor dem Plan — Prognose {ctl_proj:.0f} bei Ziel {target_ctl:.0f}. "
                "Raum zum Schärfen."
            ) if de else (
                f"Ahead of plan — projecting {ctl_proj:.0f} vs target {target_ctl:.0f}. "
                "Room to sharpen."
            )
        # behind — the projection already simulates the plan's own ramp, so
        # the honest message is "the plan as written doesn't get there".
        gap = target_ctl - ctl_proj
        return (
            f"Prognose {ctl_proj:.0f} zum Renntag — Ziel {target_ctl:.0f}. "
            f"Der Plan (~{weekly_required:.0f} TSS nächste Woche) schließt die "
            f"Lücke von {gap:.0f} Punkten nicht — Umfang erhöhen oder Ziel anpassen."
        ) if de else (
            f"Projecting {ctl_proj:.0f} by race day — target {target_ctl:.0f}. "
            f"The plan (~{weekly_required:.0f} TSS next week) doesn't close the "
            f"{gap:.0f}-point gap — raise volume or adjust the goal."
        )

    # No explicit CTL target — talk about trajectory quality
    if ctl_7d > 0.5:
        return (
            f"Fitness steigt um +{ctl_7d:.1f}/Woche — gesunde Aufbaurate "
            f"Richtung Renntag in {days_to_goal} Tagen."
        ) if de else (
            f"Fitness trending +{ctl_7d:.1f}/week — healthy build rate "
            f"toward race day in {days_to_goal}d."
        )
    if ctl_7d < -0.5:
        return (
            f"Fitness sinkt um {ctl_7d:+.1f}/Woche bei {days_to_goal} Tagen bis zum Ziel — "
            "entweder Deload oder mehr Umfang, je nach Gefühl."
        ) if de else (
            f"Fitness dipping {ctl_7d:+.1f}/week with {days_to_goal}d to goal — "
            "either deload or add volume, depending on how you feel."
        )
    return (
        f"Stabil bei CTL {ctl_now:.0f} mit {days_to_goal} Tagen zu gehen — "
        "konstanter Umfang ist die Basis."
    ) if de else (
        f"Holding steady at CTL {ctl_now:.0f} with {days_to_goal}d to go — "
        "consistent volume is the base."
    )


# ======================================================================
#  Goals normalization — moved here from api/coach.py so EVERY consumer
#  (coach endpoint, period report) gets the identical goals dict.
# ======================================================================

def normalize_athlete_goals(profile: AthleteProfile | None) -> dict:
    """Build the goals dict `project()` understands from an AthleteProfile.

    - The first-class `target_event_date` column is the source of truth for
      the event DATE — the JSONB goals blob can carry a stale nested date
      (observed: a past date shadowing the real one, collapsing the whole
      projection to no-goal). Overwrite the date, keep the name.
    - Inject `default_target_ctl` (event type + priority) when the profile
      didn't pin a target_ctl explicitly, so the on-track classifier can
      answer "behind / on / ahead".
    """
    from app.services.training_periodization import default_target_ctl

    goals: dict = {}
    if profile is not None and isinstance(getattr(profile, "goals", None), dict):
        goals = dict(profile.goals)
    if profile is not None and getattr(profile, "target_event_date", None):
        existing = (
            goals.get("target_event")
            if isinstance(goals.get("target_event"), dict)
            else {}
        )
        goals["target_event"] = {
            **existing,
            "date": profile.target_event_date.isoformat(),
        }
    if "target_ctl" not in goals and profile is not None:
        derived = default_target_ctl(
            getattr(profile, "target_event_type", None),
            getattr(profile, "target_priority", None),
        )
        if derived is not None:
            goals["target_ctl"] = derived
    return goals


# ======================================================================
#  THE one producer — async entry point over the DB
# ======================================================================

async def compute_goal_trajectory(
    db: AsyncSession,
    user_id: int,
    profile: AthleteProfile | None,
    lang: str = "en",
) -> dict | None:
    """One producer for the race-day forecast (usability audit P0-4/P0-5).

    Loads the window-invariant PMC, normalizes goals INTERNALLY (first-class
    event date + default target_ctl injection), collects the materialized
    PlannedWorkout TSS, runs the forward simulation and returns the
    trajectory_to_dict payload enriched with event metadata:

        {**trajectory_to_dict(...), "event_name", "event_date", "event_type",
         "target_priority"}

    Callers (api/coach.py goal-trajectory endpoint, period_report
    build_trajectory) must NOT re-normalize goals — that fork is exactly what
    produced the 271-vs-294 disagreement.
    """
    from sqlalchemy import select

    from app.models.planned_workout import PlannedWorkout
    from app.services.athlete_time import set_athlete_tz_from_profile, today_local
    from app.services.mesocycle_generator import template_tss_estimate
    from app.services.pmc_service import compute_user_pmc
    from app.services.training_periodization import detect_training_phase

    set_athlete_tz_from_profile(profile)
    today = today_local()

    pmc_full = await compute_user_pmc(db, user_id, days=90, profile=profile)
    pmc_rows = pmc_full.get("total") or []
    ctl_now = float(pmc_rows[-1].get("ctl") or 0.0) if pmc_rows else 0.0

    goals = normalize_athlete_goals(profile)

    goal_date = getattr(profile, "target_event_date", None) if profile else None
    phase = (
        detect_training_phase(goal_date, ctl_now, today=today)
        if profile is not None
        else "base"
    )

    # Materialized plan → date-keyed TSS (bike/run/strength all resolve).
    planned_by_date: dict[date, float] = {}
    if goal_date is not None and goal_date > today:
        pw_res = await db.execute(
            select(PlannedWorkout).where(
                PlannedWorkout.user_id == user_id,
                PlannedWorkout.date > today,
                PlannedWorkout.date < goal_date,
            )
        )
        for pw in pw_res.scalars().all():
            est = template_tss_estimate(
                getattr(pw, "template_id", None),
                getattr(pw, "duration_seconds_target", None),
            )
            if est is not None:
                planned_by_date[pw.date] = planned_by_date.get(pw.date, 0.0) + float(est)

    tp = project(
        pmc_rows,
        athlete_goals=goals,
        phase=phase,
        lang=lang,
        planned_by_date=planned_by_date,
        today=today,
    )
    payload = trajectory_to_dict(tp)

    # Event metadata so the UI doesn't need a second fetch.
    event_name: str | None = None
    if isinstance(goals.get("target_event"), dict):
        event_name = goals["target_event"].get("name")
    payload["event_name"] = event_name
    payload["event_date"] = goal_date.isoformat() if goal_date else None
    payload["event_type"] = (
        getattr(profile, "target_event_type", None) if profile else None
    )
    payload["target_priority"] = (
        getattr(profile, "target_priority", None) if profile else None
    )
    return payload


# ======================================================================
#  Serialization
# ======================================================================

def trajectory_to_dict(tp: TrajectoryProjection) -> dict:
    return {
        "days_to_goal": tp.days_to_goal,
        "ctl_now": tp.ctl_now,
        "ctl_7d_delta": tp.ctl_7d_delta,
        "ctl_projected_at_goal": tp.ctl_projected_at_goal,
        "ctl_target": tp.ctl_target,
        "tsb_projected_at_goal": tp.tsb_projected_at_goal,
        "taper_window": tp.taper_window,
        "on_track": tp.on_track,
        "weekly_tss_required": tp.weekly_tss_required,
        "weekly_tss_actual": tp.weekly_tss_actual,
        "narrative_hook": tp.narrative_hook,
        "projection_basis": tp.projection_basis,
    }
