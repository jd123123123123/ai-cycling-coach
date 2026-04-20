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

    First-match-wins rule cascade (ordered by severity):
        1. injury_flag               → 'rest'
        2. hrv_delta_pct < -10       → 'easy'   (Altini acute-suppression threshold)
        3. tsb < -30                 → 'easy'   (overreach territory)
        4. tsb < -10                 → 'moderate'
        5. days_since_rest >= 10     → 'moderate' (forced mini-recovery)
        6. default                   → 'push'
    """
    if ctx.injury_flag:
        return "rest"
    if ctx.hrv_delta_pct < -10:
        return "easy"
    if ctx.tsb < -30:
        return "easy"
    if ctx.tsb < -10:
        return "moderate"
    if ctx.days_since_rest >= 10:
        return "moderate"
    return "push"


def _block_reason(option_intensity: str, ctx: RailContext, ceiling: str) -> str:
    """Human-readable reason string for a blocked option — cites the triggering signal."""
    if ctx.injury_flag:
        return (
            "Blocked: injury flag is set. Rest or very-easy movement only; "
            "resolve the injury before returning to this intensity."
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
