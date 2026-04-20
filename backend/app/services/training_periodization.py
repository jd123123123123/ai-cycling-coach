"""Training periodization + session selection — rules-based picker that runs
BEFORE the LLM sees the snapshot.

Design:
    - `detect_training_phase` maps (goal_date, CTL trajectory) to a Friel phase.
    - `weekly_intensity_quota` returns target hours split by intensity zone for
      the phase (Seiler-polarized, phase-weighted).
    - `session_type_for_today` picks the category ('endurance' | 'sweet_spot' |
      'vo2' | 'recovery' | 'rest') for this specific day given weekly progress,
      TSB, the safety_rails intensity ceiling, and day-of-week.
    - `pick_template` resolves the category to a concrete WorkoutTemplate given
      the athlete's FTP and the available minutes for the session.

The LLM's job is then to rubber-stamp (or, rarely, substitute to an adjacent
template) the pre-picked workout. This keeps the coach deterministic and
prevents hallucinated intervals.

References: Friel (Training Bible), Seiler & Tonnessen 2009 on polarized
distribution, Mujika taper protocols.
"""
from __future__ import annotations

from datetime import date
from typing import Literal

from app.services.workout_templates import TEMPLATES, WorkoutTemplate


Phase = Literal[
    "offseason",
    "base1",
    "base2",
    "build1",
    "build2",
    "peak",
    "taper",
    "race",
    "maintenance",
]

SessionType = Literal[
    "rest",
    "recovery",
    "endurance",
    "tempo",
    "sweet_spot",
    "threshold",
    "vo2",
]


# ======================================================================
#  Phase detector — from goal date + CTL trajectory
# ======================================================================

def detect_training_phase(
    goal_date: date | None,
    current_ctl: float,
    weeks_of_history: int = 12,
) -> Phase:
    """Pick the Friel phase based on goal proximity and fitness trajectory.

    Week-to-goal boundaries:
        - goal_date None and CTL < 30        → offseason
        - goal_date None and CTL ≥ 30        → maintenance
        - >16 weeks to goal                  → base1 (CTL < 40) / base2 (CTL ≥ 40)
        - 8–16 weeks                         → build1 (CTL < 55) / build2 (CTL ≥ 55)
        - 4–7 weeks                          → peak
        - 1–3 weeks                          → taper
        - race week (0–7 days)               → race

    `weeks_of_history` is not currently used but is reserved for future
    "second-year base" detection when we have multi-year CTL.
    """
    if goal_date is None:
        return "offseason" if current_ctl < 30 else "maintenance"

    days_to_goal = (goal_date - date.today()).days

    if days_to_goal < 0:
        # Goal is in the past — treat as maintenance until the profile is updated
        return "maintenance"

    if days_to_goal <= 7:
        return "race"
    if days_to_goal <= 21:
        return "taper"
    if days_to_goal <= 49:  # ~7 weeks
        return "peak"
    if days_to_goal <= 112:  # 16 weeks
        return "build2" if current_ctl >= 55 else "build1"
    return "base2" if current_ctl >= 40 else "base1"


# ======================================================================
#  Weekly intensity quota — phase-weighted Seiler polarized
# ======================================================================

# Keys: z1_z2_ratio, hard_ratio, target_rest_days. Together they split the
# weekly availability into Z1-Z2 (easy) vs above-LT (hard) hours.
_PHASE_MIX: dict[Phase, dict[str, float]] = {
    "offseason":   {"easy_ratio": 0.95, "hard_ratio": 0.00, "rest_days": 3.0},
    "base1":       {"easy_ratio": 0.90, "hard_ratio": 0.05, "rest_days": 2.0},
    "base2":       {"easy_ratio": 0.85, "hard_ratio": 0.10, "rest_days": 2.0},
    "build1":      {"easy_ratio": 0.80, "hard_ratio": 0.15, "rest_days": 2.0},
    "build2":      {"easy_ratio": 0.75, "hard_ratio": 0.20, "rest_days": 2.0},
    "peak":        {"easy_ratio": 0.75, "hard_ratio": 0.20, "rest_days": 2.0},
    "taper":       {"easy_ratio": 0.85, "hard_ratio": 0.10, "rest_days": 3.0},
    "race":        {"easy_ratio": 0.95, "hard_ratio": 0.00, "rest_days": 4.0},
    "maintenance": {"easy_ratio": 0.85, "hard_ratio": 0.10, "rest_days": 2.0},
}


def weekly_intensity_quota(phase: Phase, weekly_hours: float) -> dict:
    """Return the target weekly split for the phase.

    Returns:
        {
          "phase": phase,
          "z1_z2_hours": float,
          "hard_hours": float,     # tempo+SS+threshold+VO2 combined
          "vo2_sessions": int,     # target number of VO2 sessions/week
          "threshold_sessions": int,
          "rest_days": int,
          "total_hours": weekly_hours,
        }

    The easy/hard split follows Seiler 80/20, bent by phase: base goes 90/10,
    build goes 75/25, taper goes 85/15.
    """
    mix = _PHASE_MIX[phase]
    easy = round(weekly_hours * mix["easy_ratio"], 1)
    hard = round(weekly_hours * mix["hard_ratio"], 1)

    # Derive VO2 vs threshold session counts — VO2 is higher-stress so fewer reps
    vo2_sessions = 0
    threshold_sessions = 0
    if phase in ("build1", "build2", "peak"):
        vo2_sessions = 1 if phase == "build1" else 1
        threshold_sessions = 1 if phase == "build1" else 2
    elif phase == "base2":
        threshold_sessions = 1

    return {
        "phase": phase,
        "z1_z2_hours": easy,
        "hard_hours": hard,
        "vo2_sessions": vo2_sessions,
        "threshold_sessions": threshold_sessions,
        "rest_days": int(round(mix["rest_days"])),
        "total_hours": weekly_hours,
    }


# ======================================================================
#  Session picker — what type of workout should TODAY be?
# ======================================================================

# First-match-wins rule cascade. Every return is a SessionType.
_INTENSITY_CEILING_MAX: dict[str, SessionType] = {
    "rest":     "rest",
    "easy":     "recovery",     # at most a Z1 spin
    "moderate": "sweet_spot",   # tempo or sweet spot at most
    "push":     "vo2",          # everything allowed
}


def _downgrade_to_ceiling(pick: SessionType, ceiling: str) -> SessionType:
    """If the picked session exceeds the safety-rails ceiling, downgrade.

    Precedence (low→high): rest < recovery < endurance < tempo < sweet_spot <
    threshold < vo2.
    """
    precedence: list[SessionType] = [
        "rest", "recovery", "endurance", "tempo", "sweet_spot", "threshold", "vo2",
    ]
    max_allowed = _INTENSITY_CEILING_MAX.get(ceiling, "vo2")
    allowed_idx = precedence.index(max_allowed)
    pick_idx = precedence.index(pick)
    if pick_idx > allowed_idx:
        return precedence[allowed_idx]
    return pick


def session_type_for_today(
    phase: Phase,
    weekly_progress: dict | None,
    tsb: float,
    intensity_ceiling: str,
    day_of_week: int,
) -> SessionType:
    """Pick today's session category.

    Rule cascade (ordered):
        1. If intensity_ceiling=='rest'         → 'rest'
        2. If intensity_ceiling=='easy'         → 'recovery' (Z1 spin)
        3. If phase=='race'                     → 'rest' (race week opener)
        4. If day_of_week in Sunday and phase has long-ride → 'endurance' (long)
        5. If phase build1/build2/peak and day_of_week==2 (Wed) → VO2 or threshold
        6. If phase base1/base2 → mostly endurance, one sweet_spot in base2
        7. Default → 'endurance'

    `weekly_progress` can be {'hard_sessions_done', 'hours_done'} — currently
    used only for "already hit weekly VO2 quota → downgrade to sweet_spot".

    `day_of_week` follows Python convention: Monday=0, Sunday=6.
    """
    # Rails first — non-negotiable
    if intensity_ceiling == "rest":
        return "rest"
    if intensity_ceiling == "easy":
        return "recovery"

    # Race week — nothing hard
    if phase == "race":
        return "recovery" if day_of_week < 5 else "rest"

    # Taper — keep intensity but volume is low; Wed is key session
    if phase == "taper":
        if day_of_week == 2:
            return "sweet_spot"
        if day_of_week in (0, 4, 6):
            return "rest" if day_of_week == 0 else "recovery"
        return "endurance"

    # Weekly progress guardrails
    progress = weekly_progress or {}
    hard_done = int(progress.get("hard_sessions_done", 0))
    vo2_done = int(progress.get("vo2_sessions_done", 0))

    # Sunday = long Z2 for base/build/peak (unless TSB is deeply negative)
    if day_of_week == 6 and phase in ("base1", "base2", "build1", "build2", "peak"):
        pick: SessionType = "endurance"
        return _downgrade_to_ceiling(pick, intensity_ceiling)

    # Monday = context-aware rest.
    # Default coaching cadence rests after a hard Sunday; don't blanket-rest when
    # the athlete's weekend was light or load history is sparse (CTL <= 20).
    if day_of_week == 0:
        yesterday_tss = float(progress.get("yesterday_tss", 0.0))
        last_48h_tss = float(progress.get("last_48h_tss", 0.0))
        week_tss = float(progress.get("total_tss_this_week", 0.0))
        # Earned the rest if yesterday was hard OR 48h cumulative was big
        if yesterday_tss >= 60 or last_48h_tss >= 90:
            return "rest"
        # Got a decent stimulus over the weekend but nothing crushing → active recovery
        if last_48h_tss >= 40:
            return "recovery"
        # Otherwise the week is behind — start it with easy endurance
        return _downgrade_to_ceiling("endurance", intensity_ceiling)

    # Friday = easy before weekend long ride
    if day_of_week == 4 and phase in ("base2", "build1", "build2", "peak"):
        return "recovery"

    # Mid-week quality — the "workout day" in Friel periodization
    if day_of_week in (1, 2, 3):
        if phase in ("build1", "build2", "peak"):
            # Wed=VO2 priority, Tue/Thu=threshold or sweet_spot
            if day_of_week == 2:
                # VO2 only if we haven't blown our weekly quota AND TSB not crushed
                if vo2_done < 1 and tsb > -15:
                    return _downgrade_to_ceiling("vo2", intensity_ceiling)
                return _downgrade_to_ceiling("sweet_spot", intensity_ceiling)
            # Tue/Thu threshold or sweet spot
            if hard_done < 2:
                # base2 prefers sweet_spot; build prefers threshold
                pick = "threshold" if phase in ("build2", "peak") else "sweet_spot"
                return _downgrade_to_ceiling(pick, intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        if phase == "base2":
            # One sweet_spot mid-week in late base
            if hard_done < 1 and day_of_week == 2:
                return _downgrade_to_ceiling("sweet_spot", intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        # base1 / offseason / maintenance — all endurance mid-week
        return _downgrade_to_ceiling("endurance", intensity_ceiling)

    # Saturday — long ride candidate when Sunday is used for a race/event
    if day_of_week == 5:
        return _downgrade_to_ceiling("endurance", intensity_ceiling)

    # Default catch-all
    return _downgrade_to_ceiling("endurance", intensity_ceiling)


# ======================================================================
#  Template picker — session category + minutes → concrete WorkoutTemplate
# ======================================================================

# For each session type, we list candidate template IDs in rough order of
# preference, along with their nominal minutes. The picker walks the list
# and returns the first whose nominal duration fits inside available_minutes.
# If none fit, it returns the shortest member of the category (best effort).
_CATEGORY_CANDIDATES: dict[SessionType, list[str]] = {
    "rest":       ["rest_day"],
    "recovery":   ["recovery_30"],
    "endurance":  [
        "z2_long_180", "z2_long_120", "z2_endurance_90", "z2_endurance_60",
    ],
    "tempo":      ["tempo_3x10"],
    "sweet_spot": ["sweet_spot_2x20"],
    "threshold":  ["threshold_2x15", "over_under_3x5"],
    "vo2":        ["vo2_5x4", "vo2_micro_30x30"],
}


def _template_minutes(t: WorkoutTemplate) -> int:
    return int(round(sum(b.duration_s for b in t.blocks) / 60))


def pick_template(
    session_type: SessionType,
    athlete_ftp: int | None,
    available_minutes: int,
    templates: dict[str, WorkoutTemplate] | None = None,
) -> WorkoutTemplate:
    """Pick the best-fit template for today's session type + time window.

    Args:
        session_type: category from session_type_for_today.
        athlete_ftp: used to filter out templates with min_ftp_required > ftp.
        available_minutes: today's time window (from profile availability or
            calendar free slot; callers pass a sensible default like 90).
        templates: dependency-injected template dict (defaults to global
            TEMPLATES). Test callers can pass a reduced set for coverage.

    Returns:
        The first candidate that fits in available_minutes AND passes the
        FTP gate. Falls back to the shortest candidate in the category if
        none fit — better to prescribe something than nothing.
    """
    lib = templates if templates is not None else TEMPLATES
    candidates = _CATEGORY_CANDIDATES.get(session_type, ["z2_endurance_60"])

    allowed: list[WorkoutTemplate] = []
    for tid in candidates:
        t = lib.get(tid)
        if t is None:
            continue
        if t.min_ftp_required is not None:
            if athlete_ftp is None or athlete_ftp < t.min_ftp_required:
                continue
        allowed.append(t)

    if not allowed:
        # Category safety net — if the whole category was FTP-gated out (e.g.
        # a brand-new athlete with FTP < 180 gets no VO2), fall back to
        # sweet_spot / endurance in that order.
        for fallback_tid in ("sweet_spot_2x20", "z2_endurance_60", "recovery_30", "rest_day"):
            t = lib.get(fallback_tid)
            if t is None:
                continue
            if t.min_ftp_required is not None:
                if athlete_ftp is None or athlete_ftp < t.min_ftp_required:
                    continue
            return t
        # Absolute last resort: return the first template in the library
        return next(iter(lib.values()))

    # First candidate that fits — candidates are ordered by preferred length
    # (longest first for endurance so we pick the biggest session the window
    # allows). For other categories there's typically only 1-2 candidates.
    for t in allowed:
        if _template_minutes(t) <= max(1, available_minutes):
            return t

    # None fits — return the shortest allowed option
    return min(allowed, key=_template_minutes)
