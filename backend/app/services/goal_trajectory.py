"""Goal trajectory projection — where is the athlete's fitness pointing, and
will they arrive at race-day with the form they need?

Inputs:
    - PMC series: last N days of {date, ctl, atl, tsb} (from compute_user_pmc)
    - Athlete goals dict (nullable): {target_ctl, event_date, weekly_hours, ...}
    - Current training phase (from detect_training_phase)

Outputs (TrajectoryProjection):
    - Linear-extrapolated CTL at goal date
    - TSB at goal date assuming current taper pattern
    - Mujika taper-window classification (too_flat | ideal | too_fresh | overreached)
    - On-track status (ahead | on_track | behind | no_goal)
    - Weekly TSS required to close any gap
    - Plain-English narrative hook for the UI

Mujika taper targets (from Mujika & Padilla 2003, validated in 2017 meta-analysis):
    - Race-day TSB optimum: +5 to +25 (our "ideal" band)
    - Below -15 = overreached, needs bigger taper
    - +25 to +40 = too fresh (over-tapered, lost form)
    - < +5 = too flat (not enough freshness)
    - > +40 = detrained

Pure function. No DB, no async. Caller supplies the PMC list.

References: .planning/research/training-frameworks.md §§ Banister, Mujika.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

OnTrack = Literal["ahead", "on_track", "behind", "no_goal"]
TaperWindow = Literal["too_flat", "ideal", "too_fresh", "overreached", "unknown"]


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
    ctl_projected_at_goal: float
    ctl_target: float | None
    tsb_projected_at_goal: float
    taper_window: TaperWindow
    on_track: OnTrack
    weekly_tss_required: float
    weekly_tss_actual: float
    narrative_hook: str


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
    average. When `tss` key is missing we estimate from CTL trajectory: the
    change in CTL over 28 days, multiplied by the EWMA decay constant (42),
    approximates average daily TSS (this is the Banister identity in reverse).
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

    # Fallback — derive from CTL delta. CTL_t = CTL_{t-1} + (TSS_t - CTL_{t-1}) / 42
    # Over a stable period, avg TSS ≈ avg CTL. This is a coarse proxy but keeps
    # the metric usable when `tss` isn't attached to the PMC rows.
    avg_ctl = sum(float(r.get("ctl", 0.0)) for r in tail) / max(1, len(tail))
    return round(avg_ctl * 7.0, 1)


# ======================================================================
#  Public API
# ======================================================================

def project(
    user_pmc: list[dict] | list[PMCEntry],
    athlete_goals: dict | None,
    phase: str,
    lang: str = "en",
) -> TrajectoryProjection:
    """Build a forward-looking projection of fitness and form to goal date.

    Graceful degradation:
        - No PMC data             → narrative_hook says so, everything zeros out
        - No goal event_date      → on_track='no_goal', projection is a
                                     CTL-trend observation only
        - No target_ctl           → ctl_target=None, weekly_tss_required is the
                                     current trajectory (0 gap to close)
    """
    de = lang == "de"
    pmc = [_as_pmc_row(e) for e in user_pmc] if user_pmc else []

    if not pmc:
        return TrajectoryProjection(
            days_to_goal=None,
            ctl_now=0.0,
            ctl_7d_delta=0.0,
            ctl_projected_at_goal=0.0,
            ctl_target=None,
            tsb_projected_at_goal=0.0,
            taper_window="unknown",
            on_track="no_goal",
            weekly_tss_required=0.0,
            weekly_tss_actual=0.0,
            narrative_hook=(
                "Noch nicht genug Trainingshistorie für eine Prognose — "
                "log ein paar Wochen und wir zeigen dir, wohin es geht."
            ) if de else (
                "Not enough training history yet to project a trajectory — "
                "log a few weeks and we'll show where you're pointed."
            ),
        )

    ctl_now = float(pmc[-1].get("ctl", 0.0))
    tsb_now = float(pmc[-1].get("tsb", 0.0))
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
    # happened. Treat it as no-goal so we stop projecting "to race day".
    if goal_date is not None and goal_date < date.today():
        goal_date = None

    # ---- No-goal path — emit a useful CTL-trend observation -------------
    if goal_date is None:
        if ctl_7d > 0.5:
            hook = (
                f"Konstanz ist das Ziel — deine Fitness steigt um +{ctl_7d:.1f}/Woche, "
                "eine gesunde Aufbaurate."
            ) if de else (
                f"Consistency is the goal — your fitness is trending +{ctl_7d:.1f}/week, "
                "a healthy build rate."
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
        return TrajectoryProjection(
            days_to_goal=None,
            ctl_now=round(ctl_now, 1),
            ctl_7d_delta=ctl_7d,
            ctl_projected_at_goal=round(ctl_now, 1),
            ctl_target=target_ctl,
            tsb_projected_at_goal=round(tsb_now, 1),
            taper_window="unknown",
            on_track="no_goal",
            weekly_tss_required=weekly_actual,
            weekly_tss_actual=weekly_actual,
            narrative_hook=hook,
        )

    # ---- Days to goal ---------------------------------------------------
    days_to_goal = max(0, (goal_date - date.today()).days)

    # ---- CTL projection — linear extrapolation from trailing 7d delta ---
    daily_rate = ctl_7d / 7.0
    # Linear extrapolation is the documented model, but a long horizon times a
    # deload week must never project a *negative* fitness — floor at 0 (the
    # narrative still reports the honest gap).
    ctl_proj = max(0.0, ctl_now + daily_rate * days_to_goal)
    # During taper, CTL decays — add a soft downward bias over the last 14 days.
    # Mujika: volume cut 40-60% during taper; ATL drops faster than CTL, so CTL
    # drift is modest (~-1 to -3). We apply a fixed -2 for taper/race projections
    # when days_to_goal <= 21.
    if days_to_goal <= 21 and phase in ("taper", "race"):
        ctl_proj -= 2.0

    # ---- TSB projection — assume atl decays with volume cut -------------
    # TSB = CTL - ATL. For taper: ATL drops ~20 points over 7-14 days, so
    # TSB typically lands +15 to +25 if the cut is right. We project by
    # assuming a Mujika-style taper applied proportionally to days_to_goal.
    if days_to_goal <= 14:
        # Taper window: ATL drops ~15 over this period from current ATL
        atl_now = float(pmc[-1].get("atl", ctl_now))
        atl_proj = max(0.0, atl_now - 15.0 * (1.0 - days_to_goal / 14.0))
        tsb_proj = ctl_proj - atl_proj
    else:
        # Far from goal: TSB tracks current pattern + modest fluctuation
        tsb_proj = tsb_now + (ctl_7d * (days_to_goal / 7.0)) * 0.3

    taper_win = _taper_window(tsb_proj) if days_to_goal <= 21 else "unknown"

    # ---- On-track classification ----------------------------------------
    on_track: OnTrack
    gap: float = 0.0
    if target_ctl is None:
        on_track = "on_track"  # no target = can't be off-track
    else:
        gap = target_ctl - ctl_proj
        if gap < -3.0:
            on_track = "ahead"
        elif gap > 3.0:
            on_track = "behind"
        else:
            on_track = "on_track"

    # ---- Weekly TSS required to close gap -------------------------------
    # Rough: extra CTL of `gap` requires `gap * 7` extra weekly TSS (because
    # CTL ≈ weekly_tss / 7 in steady state, via the 42-day EWMA).
    if target_ctl is not None and days_to_goal > 0:
        weeks_left = max(1, days_to_goal / 7.0)
        weekly_tss_required = weekly_actual + (gap * 7.0) / weeks_left
        weekly_tss_required = max(0.0, round(weekly_tss_required, 1))
    else:
        weekly_tss_required = weekly_actual

    # ---- Narrative hook -------------------------------------------------
    hook = _narrative_hook(
        ctl_now=ctl_now,
        ctl_7d=ctl_7d,
        ctl_proj=ctl_proj,
        target_ctl=target_ctl,
        days_to_goal=days_to_goal,
        taper_win=taper_win,
        on_track=on_track,
        weekly_actual=weekly_actual,
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
    weekly_actual: float,
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
            f"Race week — projected freshness lands in the ideal window. "
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
            f"You may be over-tapered — a couple of short openers will sharpen "
            f"you back into the race window."
        )

    if target_ctl is not None:
        if on_track == "on_track":
            return (
                f"Im Plan: Fitness steuert auf {ctl_proj:.0f} zum Renntag zu "
                f"(Ziel {target_ctl:.0f})."
            ) if de else (
                f"On track: fitness projecting to {ctl_proj:.0f} by race day "
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
        # behind
        gap = target_ctl - ctl_proj
        add = max(0, weekly_required - weekly_actual)
        return (
            f"Prognose {ctl_proj:.0f} zum Renntag — Ziel {target_ctl:.0f}. "
            f"Rund {add:.0f} TSS/Woche mehr, um die Lücke von {gap:.0f} Punkten zu schließen."
        ) if de else (
            f"Projecting {ctl_proj:.0f} by race day — target {target_ctl:.0f}. "
            f"Add ~{add:.0f} TSS/week "
            f"to close the {gap:.0f}-point gap."
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
    }
