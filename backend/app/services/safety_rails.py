"""Hard-coded guardrails that filter AI recommendations AFTER the LLM returns.

Rationale (addresses pain-point #6 from .planning/research/athlete-pain-points.md):
    Every major training app that uses AI has shipped dangerous recommendations —
    TrainerRoad sending injured athletes to threshold days, Runna pushing runners
    into overtraining. The LLM can suggest anything; these rails reject dangerous
    suggestions BEFORE the response reaches the user.

Design principles:
    1. Never silently drop options — mark `blocked=True` with a `reason` so the
       athlete sees WHAT was filtered and WHY. Transparency is the whole point.
    2. Hard-coded thresholds, not LLM-evaluated — we cannot trust the LLM to
       self-police. These rules are deterministic, unit-tested, and never
       over-ridden at runtime.
    3. ED-keyword filter runs on every chat response; blocked responses are
       replaced with a canned safe-redirect, not streamed silently.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RailContext:
    """State fed to the safety rails. All fields are derived from the athlete's
    actual data (PMC + daily_metrics + profile) — never from the LLM's output.
    """
    ctl: float                 # Chronic Training Load (fitness)
    atl: float                 # Acute Training Load (fatigue)
    tsb: float                 # Training Stress Balance = CTL - ATL
    hrv_delta_pct: float       # 7d HRV vs 28d baseline, as percentage (may be 0 if no data)
    injury_flag: bool          # athlete-flagged current injury
    days_since_rest: int       # consecutive days with TSS > 20
    # Optional with defaults so existing call sites keep working — the new
    # ACWR + TSB-velocity guards activate only when these are populated.
    acwr: float | None = None              # ATL / CTL (Bourdon 2017)
    tsb_velocity_2d: float | None = None   # TSB drop per day, avg over last 2d
    readiness_score: int | None = None     # 0-100 composite (readiness_score module)


# ----------------------------------------------------------------------
# Load ceilings
# ----------------------------------------------------------------------

# 1.3 × CTL is the overload boundary. >1.5×CTL is unambiguously in overload
# territory (Coggan / Friel consensus). Capping at 1.3 leaves headroom for an
# hour of tempo without silencing every hard day.
TSS_CEILING_CTL_MULTIPLIER = 1.3


def max_tss_for_day(ctl: float) -> float:
    """Maximum TSS the rails will allow for a single day.

    Returns 0 when CTL is non-positive (new athlete / extended detrain) —
    the safe default is "start small and build" rather than extrapolating
    a huge ceiling from a CTL of 0.
    """
    if ctl <= 0:
        return 0.0
    return round(ctl * TSS_CEILING_CTL_MULTIPLIER, 1)


# ----------------------------------------------------------------------
# Intensity ceiling — deterministic rule-based
# ----------------------------------------------------------------------

INTENSITY_RANK = {"rest": 0, "easy": 1, "moderate": 2, "push": 3}


def intensity_ceiling(ctx: RailContext) -> str:
    """Maximum intensity allowed for today given the athlete's state.

    First-match-wins rule cascade (ordered by severity, most-evidence-backed
    signals first). Hard rules take precedence over the soft readiness score.

        1. injury_flag                          → 'rest'
        2. ACWR > 2.0                           → 'rest'   (Bourdon 2017)
        3. tsb_velocity_2d <= -5/day (2d)       → 'easy'   (Banister NFOR predictor)
        4. ACWR > 1.8                           → 'easy'
        5. hrv_delta_pct < -10                  → 'easy'   (Altini acute-suppression)
        6. tsb < -30                            → 'easy'
        7. ACWR > 1.5                           → 'moderate'  (injury risk doubles)
        8. tsb < -25                            → 'moderate'  (deep end of the grey
           zone — TSB -10..-25 is *productive* fatigue, the state build blocks
           are meant to be ridden in, so intensity there is governed by the
           acute recovery markers above, not by the calendar TSB number)
        9. days_since_rest >= 10                → 'moderate' (forced mini-recovery)
       10. readiness_score < 35                 → 'easy'   (composite floor)
       11. readiness_score < 55                 → 'moderate' (composite caution)
       12. default                              → 'push'

    Order matters — the hard rails fire first; composite readiness only
    contributes at the margin. This is intentional: a single dangerous
    signal (e.g. ACWR 2.1) should never get washed out by an otherwise
    OK readiness score.
    """
    if ctx.injury_flag:
        return "rest"
    # ACWR is mathematically unstable at low chronic load — Lolli et al.
    # 2019 (BJSM) and Bourdon 2017 both note the ratio amplifies at small
    # denominators (CTL < ~20). Below that floor the absolute load is
    # genuinely small and the ratio carries no injury-risk signal; we
    # suppress the ACWR rules entirely and lean on TSB / HRV / readiness.
    acwr_eligible = ctx.acwr is not None and ctx.ctl >= 20.0
    if acwr_eligible and ctx.acwr > 2.0:
        return "rest"
    if ctx.tsb_velocity_2d is not None and ctx.tsb_velocity_2d <= -5.0:
        return "easy"
    if acwr_eligible and ctx.acwr > 1.8:
        return "easy"
    if ctx.hrv_delta_pct < -10:
        return "easy"
    if ctx.tsb < -30:
        return "easy"
    if acwr_eligible and ctx.acwr > 1.5:
        return "moderate"
    if ctx.tsb < -25:
        return "moderate"
    if ctx.days_since_rest >= 10:
        return "moderate"
    # Composite readiness as a soft floor — applied last so it can't
    # override the hard rules above but still catches "everything looks
    # fine individually, but the gestalt is iffy" cases.
    if ctx.readiness_score is not None:
        if ctx.readiness_score < 35:
            return "easy"
        if ctx.readiness_score < 55:
            return "moderate"
    return "push"


def _block_reason(option_intensity: str, ctx: RailContext, ceiling: str) -> str:
    """Human-readable reason string for a blocked option — cites the triggering signal."""
    if ctx.injury_flag:
        return (
            "Blocked: injury flag is set. Rest or very-easy movement only; "
            "resolve the injury before returning to this intensity."
        )
    if ctx.acwr is not None and ctx.acwr > 2.0:
        return (
            f"Blocked: ACWR is {ctx.acwr:.2f} (>2.0 = severe overload). "
            "Bourdon 2017 — injury/illness risk multiplies. Rest day."
        )
    if ctx.tsb_velocity_2d is not None and ctx.tsb_velocity_2d <= -5.0:
        return (
            f"Blocked: TSB dropping {abs(ctx.tsb_velocity_2d):.1f}/day for 2d — "
            "non-functional overreach predictor (Banister). Easy day."
        )
    if ctx.acwr is not None and ctx.acwr > 1.8:
        return (
            f"Blocked: ACWR {ctx.acwr:.2f} (>1.8) — Bourdon 2017 injury-risk "
            "zone. Cap at easy until ratio recovers."
        )
    if ctx.hrv_delta_pct < -10:
        return (
            f"Blocked: HRV is {abs(round(ctx.hrv_delta_pct, 1))}% below baseline "
            f"(>10% drop triggers intensity reduction)."
        )
    if ctx.tsb < -30:
        return (
            f"Blocked: TSB is {round(ctx.tsb, 1)} (< -30 = overreach territory). "
            f"Prioritize recovery."
        )
    if ctx.acwr is not None and ctx.acwr > 1.5:
        return (
            f"Blocked: ACWR {ctx.acwr:.2f} (>1.5) — Bourdon 2017 caution zone. "
            "Cap at moderate today."
        )
    if ctx.tsb < -10:
        return (
            f"Blocked: TSB is {round(ctx.tsb, 1)} — keep it moderate today to "
            f"avoid stacking fatigue."
        )
    if ctx.days_since_rest >= 10:
        return (
            f"Blocked: {ctx.days_since_rest} consecutive training days without a "
            f"true rest day — forced mini-recovery."
        )
    # Should never hit this — rails only block when a rule fires
    return f"Blocked: intensity ceiling is '{ceiling}', option is '{option_intensity}'."


def filter_recommendation(options: list[dict], ctx: RailContext) -> list[dict]:
    """Mark options as blocked when they exceed the intensity ceiling.

    MUST NOT drop options. Transparency requires showing both the filtered set AND
    what was filtered — the frontend renders blocked options greyed-out with the
    reason so the athlete learns WHICH signal constrained the choice.

    Input shape (per option): {intensity, title, why, tss_target, ...}
    Output: same shape with `blocked: bool` and `block_reason: str | None` added.
    """
    ceiling = intensity_ceiling(ctx)
    ceiling_rank = INTENSITY_RANK[ceiling]
    max_tss = max_tss_for_day(ctx.ctl)

    out: list[dict] = []
    for opt in options:
        intensity = opt.get("intensity", "push")
        rank = INTENSITY_RANK.get(intensity, INTENSITY_RANK["push"])
        tss_target = float(opt.get("tss_target", 0) or 0)

        blocked = False
        reason: str | None = None

        if rank > ceiling_rank:
            blocked = True
            reason = _block_reason(intensity, ctx, ceiling)
        elif max_tss > 0 and tss_target > max_tss:
            blocked = True
            reason = (
                f"Blocked: TSS target {tss_target:.0f} exceeds the daily ceiling "
                f"({max_tss:.0f} = 1.3 × CTL)."
            )

        out.append({
            **opt,
            "blocked": blocked,
            "block_reason": reason,
        })
    return out


# ----------------------------------------------------------------------
# Eating-disorder-adjacent filter — runs on every chat response
# ----------------------------------------------------------------------

# Phrases / fragments that are dangerous for endurance athletes (especially
# under-fuelling risk / RED-S territory). Match is substring + case-insensitive.
# Keep the list tight — false positives on "carb timing" or "fasted z2" must not
# trigger the rail.
ED_KEYWORDS: list[str] = [
    "restrict calories",
    "caloric restriction",
    "skip meals",
    "skip a meal",
    "drop weight fast",
    "lose weight fast",
    "cut weight",
    "intermittent fasting before training",
    "intermittent fasting before rides",
    "intermittent fasting before workouts",
    "low body fat goal",
    "target body fat",
    "get leaner",
    "eat less to perform",
    "starve the fat",
    "under-eat",
    "under eat",
    "undereating",
    "weight loss as a goal",
    "race weight goal",
]

# Canned safe response when ED content is detected — redirects without shaming.
SAFE_NUTRITION_REDIRECT = (
    "I can't recommend restriction-based approaches — endurance performance and "
    "long-term health both depend on adequate fueling. If you'd like, I can help "
    "with nutrient timing around sessions, carb intake for long rides, or general "
    "eating-around-training questions. For body-composition goals, a registered "
    "sports dietitian is the right resource."
)


def scan_nutrition_advice(text: str) -> list[str]:
    """Return ED-adjacent phrases found in `text`. Empty list = safe.

    Case-insensitive substring match. Used in two places:
        1. Pre-check on LLM-generated chat responses before streaming to user
        2. Input screening on user messages (optional future use)
    """
    if not text:
        return []
    lower = text.lower()
    return [kw for kw in ED_KEYWORDS if kw in lower]


def validate_chat_response(text: str) -> tuple[bool, str]:
    """Returns (allowed, text_to_use).

    If ED keywords are found → returns (False, SAFE_NUTRITION_REDIRECT).
    Otherwise returns (True, original_text).

    Callers should stream text_to_use regardless of `allowed` — the redirect
    IS the response when blocked. `allowed` is returned for logging/telemetry.
    """
    matches = scan_nutrition_advice(text)
    if matches:
        return False, SAFE_NUTRITION_REDIRECT
    return True, text
