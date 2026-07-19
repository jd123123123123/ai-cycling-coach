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

# An athlete this far below their event's CTL demand has nothing worth
# preserving — tapering would shed the little fitness they have. The last
# building window is worth more than freshness until CTL clears this fraction
# of target (Friel: you can only taper what you've built).
_UNDERBUILT_TAPER_FRACTION = 0.85


def detect_training_phase(
    goal_date: date | None,
    current_ctl: float,
    weeks_of_history: int = 12,
    target_ctl: float | None = None,
) -> Phase:
    """Pick the Friel phase based on goal proximity and fitness trajectory.

    Week-to-goal boundaries:
        - goal_date None and CTL < 30        → offseason
        - goal_date None and CTL ≥ 30        → maintenance
        - >16 weeks to goal                  → base1 (CTL < 40) / base2 (CTL ≥ 40)
        - 8–16 weeks                         → build1 (CTL < 55) / build2 (CTL ≥ 55)
        - 4–7 weeks                          → peak
        - 1–3 weeks                          → taper*
        - race week (0–7 days)               → race

    *Under-built override: in the taper window, if `target_ctl` is known and
    `current_ctl` is below `_UNDERBUILT_TAPER_FRACTION` of it, we keep the
    athlete in `peak` (keep loading) rather than tapering fitness they never
    built. Inside the final 7 days we always freshen — you can't build a base
    in race week. With `target_ctl=None` the decision is purely calendar-based
    (unchanged behaviour for callers that don't pass a target).

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
        if (
            target_ctl is not None
            and current_ctl < _UNDERBUILT_TAPER_FRACTION * target_ctl
        ):
            # Under-built — keep peaking through the would-be taper window.
            return "peak"
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


# How the athlete's chosen weekly-intensity philosophy bends the phase default.
#   hard_mult  — scales the hard/easy hour split (polarized trims the grey
#                zone, sweet-spot pushes more time near threshold).
#   vo2_delta / threshold_delta — reshape the quality-session mix toward each
#                model's signature (polarized → VO2 pole, sweet-spot → threshold).
_MODEL_ADJ: dict[str, dict[str, float]] = {
    "polarized": {"hard_mult": 0.90, "vo2_delta": 0, "threshold_delta": -1},
    "sweetspot": {"hard_mult": 1.25, "vo2_delta": -1, "threshold_delta": 1},
    "pyramidal": {"hard_mult": 1.00, "vo2_delta": 0, "threshold_delta": 0},
}


def weekly_intensity_quota(
    phase: Phase,
    weekly_hours: float,
    training_model: str | None = None,
    days_per_week: int | None = None,
    block_position: str | None = None,
) -> dict:
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
          "training_model": str | None,
        }

    The easy/hard split follows Seiler 80/20, bent by phase: base goes 90/10,
    build goes 75/25, taper goes 85/15. When the athlete has chosen a weekly
    intensity philosophy in onboarding (`training_model`), the split + quality
    mix are further bent toward it, and `days_per_week` caps quality sessions
    and sets the rest-day floor so we never plan more days than they have.

    With `training_model=None` the result is identical to the phase baseline
    (so existing callers/tests are unaffected).
    """
    mix = _PHASE_MIX[phase]
    base_hard_ratio = mix["hard_ratio"]
    hard_ratio = base_hard_ratio

    # Derive VO2 vs threshold session counts — VO2 is higher-stress so fewer reps.
    # VARIETY FLOOR (July 2026, user feedback: "4 weeks of consecutive Z2"):
    # every non-offseason build/base/maintenance week carries at least ONE
    # quality touch. Science: even classic base retains a weekly high-intensity
    # stimulus for VO2max/neuromuscular maintenance (Seiler's 80/20 counts the
    # 20; Rønnestad 2014 shows weekly HIT maintenance preserves adaptations).
    # Monotony is also a modeled risk (Foster) — identical weeks raise strain.
    vo2_sessions = 0
    threshold_sessions = 0
    if phase in ("build1", "build2", "peak"):
        vo2_sessions = 1
        threshold_sessions = 1 if phase == "build1" else 2
    elif phase == "base2":
        vo2_sessions = 1
        threshold_sessions = 1
    elif phase == "base1":
        # One short MAP touch per week — keeps the ceiling from sagging while
        # the base builds, and keeps the plan humane to look at.
        vo2_sessions = 1
    elif phase == "maintenance":
        threshold_sessions = 1

    adj = _MODEL_ADJ.get(training_model or "")
    if adj is not None:
        hard_ratio = round(base_hard_ratio * adj["hard_mult"], 4)
        # Only reshape the quality mix when the phase actually prescribes it.
        if vo2_sessions + threshold_sessions > 0:
            vo2_sessions = max(0, min(2, vo2_sessions + int(adj["vo2_delta"])))
            threshold_sessions = max(0, min(3, threshold_sessions + int(adj["threshold_delta"])))

    # Recovery (deload) week overrides the model: drop the hard sessions and
    # pull the hard-hour share down to a token amount. Volume is cut separately
    # by the mesocycle TSS target (~−35%); this is the intensity side of the
    # break week, so a deload isn't just a shorter hard week.
    is_recovery = block_position == "recovery"
    if is_recovery:
        vo2_sessions = 0
        threshold_sessions = 0
        hard_ratio = round(base_hard_ratio * 0.3, 4)

    # Conserve total load: easy absorbs whatever the hard ratio gained/lost, so
    # the no-model path keeps the exact phase easy_ratio.
    easy_ratio = max(0.0, mix["easy_ratio"] + (base_hard_ratio - hard_ratio))
    easy = round(weekly_hours * easy_ratio, 1)
    hard = round(weekly_hours * hard_ratio, 1)

    rest_days = int(round(mix["rest_days"]))
    if is_recovery:
        rest_days = min(6, rest_days + 1)
    if days_per_week is not None and days_per_week > 0:
        # Honor real availability: at least (7 − training days) rest, and never
        # more quality sessions than (training days − 1 easy day), trimming
        # threshold before VO2.
        rest_days = max(rest_days, 7 - int(days_per_week))
        rest_days = min(6, rest_days)
        max_hard = max(0, min(3, int(days_per_week) - 1))
        while vo2_sessions + threshold_sessions > max_hard and threshold_sessions > 0:
            threshold_sessions -= 1
        while vo2_sessions + threshold_sessions > max_hard and vo2_sessions > 0:
            vo2_sessions -= 1

    return {
        "phase": phase,
        "z1_z2_hours": easy,
        "hard_hours": hard,
        "vo2_sessions": vo2_sessions,
        "threshold_sessions": threshold_sessions,
        "rest_days": rest_days,
        "total_hours": weekly_hours,
        "training_model": training_model,
        "block_position": block_position,
    }


# ======================================================================
#  Session picker — what type of workout should TODAY be?
# ======================================================================

# First-match-wins rule cascade. Every return is a SessionType.
_INTENSITY_CEILING_MAX: dict[str, SessionType] = {
    "rest":     "rest",
    "easy":     "recovery",     # at most a Z1 spin
    "moderate": "sweet_spot",   # tempo or sweet spot at most
    "push":     "anaerobic",    # everything allowed, incl. neuromuscular sprints
}


def _downgrade_to_ceiling(pick: SessionType, ceiling: str) -> SessionType:
    """If the picked session exceeds the safety-rails ceiling, downgrade.

    Precedence (low→high): rest < recovery < endurance < tempo < sweet_spot <
    threshold < vo2 < anaerobic. Anaerobic sits at the top because it's the
    most acutely stressful — short / fully-rested / above-VO2 efforts — and
    should never auto-downgrade *to* (it's only picked by explicit rules,
    e.g. taper sharpening). When the ceiling caps below anaerobic, the
    cap-to-vo2 fallback is the sensible neighbor.
    """
    precedence: list[SessionType] = [
        "rest", "recovery", "endurance", "tempo", "sweet_spot",
        "threshold", "vo2", "anaerobic",
    ]
    max_allowed = _INTENSITY_CEILING_MAX.get(ceiling, "vo2")
    allowed_idx = precedence.index(max_allowed)
    pick_idx = precedence.index(pick)
    if pick_idx > allowed_idx:
        return precedence[allowed_idx]
    return pick


def _apply_model_bias(pick: SessionType, training_model: str | None) -> SessionType:
    """Bend a quality-day pick toward the athlete's chosen weekly model.

    Polarized avoids the grey zone — tempo/sweet-spot "middle" work becomes easy
    endurance, keeping only the true hard poles (VO2/threshold). Sweet-spot
    trades VO2 sharpness for sustained near-threshold work. None/pyramidal leave
    the pick untouched.
    """
    if training_model == "polarized":
        return "endurance" if pick in ("tempo", "sweet_spot") else pick
    if training_model == "sweetspot":
        return "sweet_spot" if pick in ("vo2", "threshold") else pick
    return pick


def session_type_for_today(
    phase: Phase,
    weekly_progress: dict | None,
    tsb: float,
    intensity_ceiling: str,
    day_of_week: int,
    training_model: str | None = None,
    is_recovery_week: bool = False,
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

    # Already trained today — don't prescribe another session.
    # Threshold: today_tss >= 25 (anything beyond a coffee spin).
    # We return "rest" so the prescribed_workout resolves to rest_day; the coach
    # service writes a congratulatory verdict when progress.today_tss > 0.
    progress_for_today_check = weekly_progress or {}
    if float(progress_for_today_check.get("today_tss", 0.0)) >= 25.0:
        return "rest"

    # Race week — easy except one race-pace tune-up. Wed gets a short
    # sub-threshold opener so the engine is primed without depleting the
    # tank (the picker resolves "threshold" + the race-week intensity ceiling
    # to race_pace_60_95 when it's a sane fit; otherwise it falls to the
    # short threshold reps).
    if phase == "race":
        if day_of_week == 2:
            return _downgrade_to_ceiling("threshold", intensity_ceiling)
        return "recovery" if day_of_week < 5 else "rest"

    # Taper — keep intensity, drop volume. Mujika's taper protocol: short
    # neuromuscular sharpening (≤30s sprints with long rests) preserves peak
    # power without accumulating fatigue. Wed in taper → anaerobic (sprints
    # are first in the candidate list, ahead of Tabata's higher-strain
    # capacity work). Mon/Fri/Sun easy; Tue/Thu/Sat endurance.
    if phase == "taper":
        if day_of_week == 2:
            return _downgrade_to_ceiling("anaerobic", intensity_ceiling)
        if day_of_week in (0, 4, 6):
            return "rest" if day_of_week == 0 else "recovery"
        return "endurance"

    # Weekly progress guardrails
    progress = weekly_progress or {}
    hard_done = int(progress.get("hard_sessions_done", 0))
    vo2_done = int(progress.get("vo2_sessions_done", 0))
    # Hard/easy alternation: if a quality session (TSS/h ≥ 60, ≈ IF 0.78+) has
    # already happened in the last 72h, the picker mustn't stack another hard
    # day. Wednesday is allowed to override because VO2 is the keystone weekly
    # session and Wed-VO2 already has its own (vo2_done, tsb) guards.
    recent_quality = int(progress.get("last_72h_quality_count", 0))

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
        # Recovery (deload) week — strip mid-week intensity. The Issurin 3:1
        # block already cut volume ~35%; pulling the quality days down to easy
        # endurance makes it a true break week, not just a shorter hard week.
        if is_recovery_week:
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        # Volume-based alternation guard — applies to ALL mid-week quality days,
        # Wednesday included. A big rolling 48h load is typically a long
        # endurance ride whose intensity was too low to register as a 'quality'
        # session (TSS/h < 60) yet which still dumped the week's largest acute
        # load into the legs. Wednesday's keystone-VO2 guards (vo2_done, tsb)
        # miss this: vo2_done resets every Monday and tsb > -15 can persist
        # after a single long day — so "4h ride yesterday -> VO2 today, you're
        # fresh" slips through. These windows are rolling (48h), so they see the
        # weekend across the Monday calendar boundary.
        yesterday_tss = float(progress.get("yesterday_tss", 0.0))
        last_48h_tss = float(progress.get("last_48h_tss", 0.0))
        recent_big_volume = yesterday_tss >= 90.0 or last_48h_tss >= 120.0
        if recent_big_volume:
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        # Intensity-based 72h hard/easy guard on Tue (1) / Thu (3) — Wednesday's
        # VO2 has its own quota guard and is the planned keystone, so a recent
        # *quality* session alone doesn't block it (the volume guard above still
        # does when the prior load was genuinely large).
        if day_of_week in (1, 3) and recent_quality >= 1:
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        if phase in ("build1", "build2", "peak"):
            # Wed=VO2 priority, Tue/Thu=threshold or sweet_spot
            if day_of_week == 2:
                # VO2 only if we haven't blown our weekly quota AND TSB not crushed
                if vo2_done < 1 and tsb > -15:
                    pick = "vo2"
                else:
                    pick = "sweet_spot"
                return _downgrade_to_ceiling(_apply_model_bias(pick, training_model), intensity_ceiling)
            # Tue/Thu quality. build2/peak run two threshold days. build1
            # progresses *within* the week: first quality day = sweet spot,
            # second quality day = threshold (real periodization isn't a flat
            # week of identical SST — it ramps). The intensity-ceiling
            # downgrade below still caps the pick when readiness says so, so
            # there's no need for a separate TSB gate here.
            if hard_done < 2:
                if phase in ("build2", "peak"):
                    pick = "threshold"
                else:  # build1
                    pick = "threshold" if hard_done >= 1 else "sweet_spot"
                return _downgrade_to_ceiling(_apply_model_bias(pick, training_model), intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        if phase == "base2":
            # One sweet_spot mid-week in late base
            if hard_done < 1 and day_of_week == 2:
                return _downgrade_to_ceiling(_apply_model_bias("sweet_spot", training_model), intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        if phase == "base1":
            # Variety floor (July 2026): ONE short VO2/MAP touch per week even
            # in early base — Wednesday keystone. Keeps the aerobic ceiling
            # from sagging through a long base (Rønnestad maintenance dose)
            # and kills the "4 identical Z2 weeks" monotony.
            if vo2_done < 1 and hard_done < 1 and day_of_week == 2:
                return _downgrade_to_ceiling(_apply_model_bias("vo2", training_model), intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        if phase == "maintenance":
            # Keep one quality touch so maintenance doesn't decay into mush.
            if hard_done < 1 and day_of_week == 2:
                return _downgrade_to_ceiling(_apply_model_bias("sweet_spot", training_model), intensity_ceiling)
            return _downgrade_to_ceiling("endurance", intensity_ceiling)
        # offseason — all endurance mid-week
        return _downgrade_to_ceiling("endurance", intensity_ceiling)

    # Saturday — long ride candidate when Sunday is used for a race/event
    if day_of_week == 5:
        return _downgrade_to_ceiling("endurance", intensity_ceiling)

    # Default catch-all
    return _downgrade_to_ceiling("endurance", intensity_ceiling)


# ======================================================================
#  Event specificity — climbing / low-cadence routing for mountain events
# ======================================================================

# event_type → priority → CTL floor for "race-ready". Conservative coaching
# floors from Friel's Cyclist's Training Bible Ch.5 (training-stress thresholds
# for event success), intentionally low-end so the gap reads "behind" rather
# than "way behind" for athletes still in early base. Shared by the goal
# trajectory narrative and the under-built taper override.
_DEFAULT_TARGET_CTL: dict[str, dict[str, float]] = {
    "fondo":       {"A": 70.0, "B": 60.0, "C": 50.0},
    "race":        {"A": 75.0, "B": 65.0, "C": 55.0},
    "audax":       {"A": 65.0, "B": 55.0, "C": 50.0},
    "maintenance": {"A": 50.0, "B": 45.0, "C": 40.0},
}


def default_target_ctl(event_type: str | None, priority: str | None) -> float | None:
    """Derive a race-ready CTL floor from event type + priority.

    Returns None when the event type is unknown so callers degrade gracefully
    (no synthetic target). Priority defaults to "B" when unset.
    """
    if not event_type:
        return None
    by_priority = _DEFAULT_TARGET_CTL.get(event_type.lower())
    if not by_priority:
        return None
    return by_priority.get((priority or "B").upper())


# Mountain events (fondo / hilly road race) are limited by sustained
# low-cadence climbing endurance. During the specificity window we route each
# quality session to its climbing variant so every hard day rehearses the
# event demand — not just the Saturday long ride.
_MOUNTAIN_EVENT_TYPES = frozenset({"fondo", "race"})
_MOUNTAIN_QUALITY_TEMPLATE: dict[SessionType, str] = {
    "tempo": "cadence_low_lcf_4x6",     # low-cadence force tempo
    "threshold": "threshold_hill_4x10",  # sustained climbing-threshold reps
    "vo2": "vo2_hill_6x3",               # hill VO2 — climbing power ceiling
}
# Issurin transmutation window — climbing specificity belongs close to the
# event, after generic capacity is built (>56d) and before the final freshen
# (<14d).
_SPECIFICITY_WINDOW_DAYS = (14, 56)


def mountain_event_template(
    session_type: SessionType,
    event_type: str | None,
    days_to_event: int | None,
    day_of_week: int,
) -> str | None:
    """Climbing-emphasis template id for a mountain-event athlete, else None.

    Returns the climbing/low-cadence variant for the session type when the
    athlete targets a fondo/race inside the specificity window:
        - endurance + Saturday → z2_climbing_long (weekend keystone)
        - tempo                → cadence_low_lcf_4x6
        - threshold            → threshold_hill_4x10
        - vo2                  → vo2_hill_6x3
    Easy/recovery days and mid-week endurance are never overridden.
    """
    if event_type is None or event_type.lower() not in _MOUNTAIN_EVENT_TYPES:
        return None
    if days_to_event is None:
        return None
    lo, hi = _SPECIFICITY_WINDOW_DAYS
    if not (lo <= days_to_event <= hi):
        return None
    if session_type == "endurance" and day_of_week == 5:  # Saturday long ride
        return "z2_climbing_long"
    return _MOUNTAIN_QUALITY_TEMPLATE.get(session_type)


# ======================================================================
#  Template picker — session category + minutes → concrete WorkoutTemplate
# ======================================================================

# For each session type, we list candidate template IDs in rough order of
# preference, along with their nominal minutes. The picker walks the list
# and returns the first whose nominal duration fits inside available_minutes.
# If none fit, it returns the shortest member of the category (best effort).
_CATEGORY_CANDIDATES: dict[SessionType, list[str]] = {
    "rest":       ["rest_day"],
    # Recovery day rotation — easy spin OR the FSR fast-pedal skill drill.
    # Both stay sub-LT1 in power; the drill adds neuromuscular maintenance
    # without raising load. Listed by descending length so the picker walks
    # to whichever fits the window.
    "recovery":   ["recovery_60", "cadence_high_fsr_6x3", "recovery_30"],
    # Endurance: longest first. MAF / fasted / progressive variants are
    # phase-specific and not in the default picker rotation (use them via
    # preferred_template_id at the planner level).
    "endurance":  [
        "z2_long_240", "z2_long_180", "z2_long_120",
        "z2_progressive_90", "z2_endurance_90", "z2_endurance_60",
    ],
    # Tempo includes the low-cadence force drill (still Z3 power, but a
    # strength-biased rep that targets Type-IIa recruitment via cadence).
    "tempo":      [
        "tempo_2x30", "tempo_4x15", "tempo_progression_60",
        "cadence_low_lcf_4x6", "tempo_3x10",
    ],
    # Sweet-spot ordered longest→shortest. sub_threshold_2x40 is genuinely
    # SST density even though categorized internally as sweet_spot.
    "sweet_spot": [
        "sub_threshold_2x40", "sweet_spot_4x15", "sweet_spot_3x20",
        "sweet_spot_2x20",
    ],
    # Threshold: Norwegian 4×8 (highest tolerance) + heavy hill / pyramid /
    # descending variants for race specificity, then the classic 2×15 +
    # short over-unders.
    "threshold": [
        "threshold_seiler_4x8", "threshold_hill_4x10",
        "over_under_4x12", "threshold_descending",
        "threshold_pyramid", "lactate_shuttles_3x8",
        "threshold_2x15", "over_under_3x5",
    ],
    # VO2: long polarized for big days, then highest-evidence short-intervals
    # (Rønnestad), then the long 3×6 and 5×4 reps, hill VO2, microbursts,
    # MAP 5×3, descending ladder, and the Billat 30×30.
    "vo2": [
        "polarized_long_z2_4x4",
        "vo2_ronnestad_3x13", "vo2_3x6", "vo2_5x4",
        "vo2_hill_6x3", "vo2_microbursts_30x15_45",
        "vo2_map_5x3", "vo2_descending_5_4_3_2_1",
        "vo2_micro_30x30",
    ],
    # Anaerobic / neuromuscular — peak power + capacity. Order is
    # taper-friendly first (short, fully-rested sprints preserve peak power
    # without fatigue accumulation — Mujika neuromuscular protocol). When
    # session_type_for_today returns "anaerobic" in taper week, sprints win
    # the picker; capacity work sits below for non-taper peak/build use.
    "anaerobic": [
        "neuromuscular_sprints_8x15",
        "neuromuscular_spinup_6x30",
        "neuromuscular_standing_6x10",
        "anaerobic_capacity_5x3_130",
        "anaerobic_8x90s",
        "anaerobic_tabata_8x20_10",
    ],
}


def _template_minutes(t: WorkoutTemplate) -> int:
    return int(round(sum(b.duration_s for b in t.blocks) / 60))


def pick_template(
    session_type: SessionType,
    athlete_ftp: int | None,
    available_minutes: int,
    templates: dict[str, WorkoutTemplate] | None = None,
    preferred_template_id: str | None = None,
    rotation_key: int = 0,
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

    # Event-specific override: caller can pin a preferred template (e.g.
    # climbing-emphasis on Saturday for fondo athletes). We honour it iff
    # the template exists, passes the FTP gate, and fits the time window.
    if preferred_template_id:
        t = lib.get(preferred_template_id)
        if t is not None:
            ftp_ok = (
                t.min_ftp_required is None
                or (athlete_ftp is not None and athlete_ftp >= t.min_ftp_required)
            )
            if ftp_ok and _template_minutes(t) <= max(1, available_minutes):
                return t
        # Preferred template didn't fit — fall through to normal candidate flow.

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

    # Everything that fits the time window. Candidates are ordered by
    # preferred length (longest first for endurance).
    fitting = [t for t in allowed if _template_minutes(t) <= max(1, available_minutes)]
    if not fitting:
        # None fits — return the shortest allowed option
        return min(allowed, key=_template_minutes)

    # VARIETY ROTATION (July 2026 — anti-monotony): rotation_key deterministically
    # rotates among the fitting candidates instead of always first-fit, so a
    # week of endurance days cycles progressive/steady/tempo-touch variants
    # rather than repeating one template for a month. rotation_key=0 preserves
    # the historical "biggest session that fits" choice (existing callers/tests
    # unchanged); planners pass week+day derived keys.
    if rotation_key:
        return fitting[rotation_key % len(fitting)]
    return fitting[0]
