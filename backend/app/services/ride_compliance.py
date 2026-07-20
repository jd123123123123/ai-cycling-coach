"""Ride compliance scoring — how well did the athlete's completed ride match
what the periodization layer would have prescribed for the same day?

The "should have been" baseline is the template picked by `session_type_for_today`
+ `pick_template` (both already running inside build_snapshot). We compare the
actual activity's duration + TSS + intensity against that baseline and emit a
five-grade score:

    perfect      — both duration and TSS within ±10% of target
    strong       — one metric within 10%, the other within 25% (or both <=20%)
    okay         — both within 30%, no severe outlier
    overcooked   — duration OR TSS >30% above target (crossed "too much")
    undercooked  — duration OR TSS >30% below target (crossed "too little")

Mixed profiles (short-and-hard, long-and-easy) resolve toward the "too much"
side when TSS is high, otherwise toward "too little".

Additional compliance metrics we surface per activity (when data is present):
    IF  = NP / FTP        (Coggan Intensity Factor)
    VI  = NP / avgP       (Coggan Variability Index — >1.06 means pacing drift)
    EF  = NP / avgHR      (Friel/San Millán aerobic-efficiency signal)

All functions here are PURE — no DB, no async. The caller fetches today's
Activity from the session and passes it in along with the picked template,
phase, session_type, and FTP.

Out-of-scope for v1:
    - Per-second power streams (interval-by-interval compliance)
    - Zone-distribution match (we emit `zone_match_pct=None` until streams land)
    - RPE-power decoupling (Kolie Moore) — requires user-reported RPE

References: .planning/research/training-frameworks.md §§ Coggan, Friel, San Millán.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services import athlete_time
from app.services.sport import same_sport_family
from app.services.workout_templates import IntervalBlock, WorkoutTemplate, get_template

_log = logging.getLogger(__name__)

Grade = Literal["perfect", "strong", "okay", "overcooked", "undercooked"]
Band = Literal["match", "over", "under"]


# ======================================================================
#  Data shapes
# ======================================================================

@dataclass(frozen=True)
class CompliancePair:
    """One target-vs-actual pair with its delta and band classification.

    delta_pct = (actual - target) / target * 100 — signed.
    band:
        'match' — |delta_pct| <= 10
        'over'  — delta_pct > 10
        'under' — delta_pct < -10
    """

    target: float
    actual: float
    delta_pct: float
    band: Band


@dataclass(frozen=True)
class RideCompliance:
    """Full compliance report for one completed activity vs one target template.

    `phase`, `session_type`, and `template_id` are the context the narrative
    layer uses to craft the physiological read + goal-trajectory paragraphs.

    `graded=False` (with grade/duration/tss = None) means the sport gate
    refused to grade: the activity's sport family does not match the
    prescription's (e.g. a gym session on a bike-Z2 day — usability audit
    P0-2). Downstream must render a neutral "logged" card, never a grade.
    """

    grade: Grade | None
    duration: CompliancePair | None
    tss: CompliancePair | None
    intensity_factor: CompliancePair | None  # IF = NP / FTP
    variability_index: float | None          # VI = NP / avgP
    ef: float | None                         # NP / avgHR
    decoupling_pct: float | None             # Pw:HR drift % (if streams present)
    zone_match_pct: float | None             # reserved for when streams land
    phase: str
    session_type: str
    template_id: str
    template_title: str  # display name of the template actually graded against
    graded: bool = True  # False → sport-gate refusal, render neutral "logged"


# ======================================================================
#  Helpers
# ======================================================================

def _pair(target: float, actual: float) -> CompliancePair:
    """Build a CompliancePair from target + actual. delta_pct is 0 when target
    is <= 0 (rest days have target=0 TSS; we treat any non-zero actual as 'over').

    Rounding precision auto-adapts: small-magnitude targets (IF < 5) round to 2
    decimals, everything else rounds to 1 decimal. This keeps IF=0.65 readable
    without quantising it to 0.7.
    """
    if target <= 0:
        if actual <= 0:
            return CompliancePair(target=target, actual=actual, delta_pct=0.0, band="match")
        # Any work on a rest day registers as "over" with delta=+inf semantics.
        return CompliancePair(target=target, actual=actual, delta_pct=100.0, band="over")

    delta = (actual - target) / target * 100.0
    if delta > 10.0:
        band: Band = "over"
    elif delta < -10.0:
        band = "under"
    else:
        band = "match"

    # IF values (typically 0.5..1.3) need 2 decimals; TSS/duration need 1.
    precision = 2 if target < 5.0 else 1
    return CompliancePair(
        target=round(target, precision),
        actual=round(actual, precision),
        delta_pct=round(delta, 1),
        band=band,
    )


def _template_duration_minutes(template: WorkoutTemplate) -> float:
    total_s = sum(b.duration_s for b in template.blocks)
    return total_s / 60.0 if total_s > 0 else 0.0


def _scale_tss_for_duration(template: WorkoutTemplate, actual_minutes: float) -> float:
    """For rest-day templates (base_tss=0), target TSS stays 0 regardless.
    For any other template we use the template's base_tss as the target.
    This matches `parametrize_template` which only scales watts, not TSS
    (TSS comes from the template's designed volume).
    """
    return float(template.base_tss)


# ======================================================================
#  Grading
# ======================================================================

def _grade_from_pairs(
    duration: CompliancePair,
    tss: CompliancePair,
) -> Grade:
    """Apply the grading rubric.

    Rules (first match wins):
        1. |dur| <= 10 AND |tss| <= 10                      → perfect
        2. dur > +30 OR tss > +30                           → overcooked
        3. dur < -30 OR tss < -30                           → undercooked
        4. (one <=10 AND other <=25) OR (both <=20)         → strong
        5. both <= 30                                        → okay
        6. Mixed fallback: tss high → overcooked, else undercooked
    """
    ad, at = abs(duration.delta_pct), abs(tss.delta_pct)

    # 1. perfect — tight band both sides
    if ad <= 10.0 and at <= 10.0:
        return "perfect"

    # 2. overcooked — either axis crosses the "too much" line
    if duration.delta_pct > 30.0 or tss.delta_pct > 30.0:
        return "overcooked"

    # 3. undercooked — either axis crosses the "too little" line
    if duration.delta_pct < -30.0 or tss.delta_pct < -30.0:
        return "undercooked"

    # 4. strong — one tight, the other within reason, or both snug
    if (ad <= 10.0 and at <= 25.0) or (at <= 10.0 and ad <= 25.0) or (ad <= 20.0 and at <= 20.0):
        return "strong"

    # 5. okay — both within 30%
    if ad <= 30.0 and at <= 30.0:
        return "okay"

    # 6. mixed fallback — precedence: high TSS wins "overcooked"
    if tss.delta_pct > 0:
        return "overcooked"
    return "undercooked"


# ======================================================================
#  Offseason / maintenance — no periodization target
# ======================================================================

# When phase is offseason or maintenance the template picker defaults to
# endurance, but grading against a fixed picked_template in that phase can
# penalize any chill ride. Instead, grade against an absolute TSS band.
_ABSOLUTE_TSS_BANDS: dict[str, tuple[float, float]] = {
    # phase → (good_low, good_high). Above good_high + 40% = overcooked,
    # below good_low - 40% = undercooked. Between = strong/perfect by exactness.
    "offseason":   (25.0, 80.0),
    "maintenance": (30.0, 100.0),
}


def _absolute_grade(actual_tss: float, phase: str) -> Grade:
    low, high = _ABSOLUTE_TSS_BANDS.get(phase, (25.0, 80.0))
    if actual_tss > high * 1.5:
        return "overcooked"
    if actual_tss < low * 0.5:
        return "undercooked"
    if low <= actual_tss <= high:
        # Tight band inside "good" → perfect; loose → strong
        mid = (low + high) / 2.0
        return "perfect" if abs(actual_tss - mid) / mid <= 0.15 else "strong"
    # Outside good band but not yet extreme
    return "okay"


# ======================================================================
#  Public API
# ======================================================================

def score_ride(
    actual_activity: Activity,
    target_template: WorkoutTemplate,
    ftp: int | None,
    phase: str,
    session_type: str,
) -> RideCompliance:
    """Grade a single completed ride against the template that would have been
    prescribed for the same day-state.

    Handles edge cases:
        - HR-only device (no NP / no avgP): IF/VI are None, EF computes from
          avgHR if present, grading falls back to duration + TSS.
        - FTP unknown or zero: IF is None, VI still computes if avgP present.
        - Phase is offseason / maintenance: grade against absolute TSS band
          (`_ABSOLUTE_TSS_BANDS`) since there's no specific prescribed target.
        - target_template is rest_day (base_tss=0) but athlete rode: any
          non-trivial TSS → overcooked.
    """
    # ---- Actuals --------------------------------------------------------
    actual_minutes = (actual_activity.duration_seconds or 0) / 60.0
    actual_tss = float(actual_activity.tss or 0.0)
    np = actual_activity.normalized_power
    avg_p = actual_activity.average_power
    avg_hr = actual_activity.average_hr

    # ---- Targets --------------------------------------------------------
    target_minutes = _template_duration_minutes(target_template)
    target_tss = _scale_tss_for_duration(target_template, actual_minutes)

    duration_pair = _pair(target_minutes, actual_minutes)
    tss_pair = _pair(target_tss, actual_tss)

    # ---- Intensity factor (IF = NP / FTP) -------------------------------
    if_pair: CompliancePair | None = None
    if np is not None and ftp and ftp > 0:
        # Target IF is implied by the template — use the max zone's target_pct_ftp
        # as a coarse proxy when we don't have per-zone time. For steady templates
        # (one main block) this equals the block's target_pct_ftp.
        main_blocks = [b for b in target_template.blocks if b.name not in ("Warm-up", "Cool-down", "Recovery")]
        if main_blocks:
            target_if = sum(b.target_pct_ftp for b in main_blocks) / len(main_blocks)
        else:
            target_if = 0.65  # endurance default
        actual_if = np / ftp
        if_pair = _pair(target_if, actual_if)

    # ---- Variability Index (VI = NP / avgP) -----------------------------
    vi: float | None = None
    if np is not None and avg_p and avg_p > 0:
        vi = round(np / avg_p, 3)

    # ---- Efficiency Factor (EF = NP / avgHR) ----------------------------
    ef: float | None = None
    if np is not None and avg_hr and avg_hr > 0:
        ef = round(np / avg_hr, 3)
    elif avg_p is not None and avg_hr and avg_hr > 0:
        # HR-only or power-only-no-NP fallback: use avg power as NP proxy
        ef = round(avg_p / avg_hr, 3)

    # ---- Decoupling — only available when raw_data streams exist --------
    # The advanced_metrics module handles computation from streams; we just
    # pick up the summary if the caller already stashed it on the activity.
    decoupling_pct: float | None = None
    if isinstance(actual_activity.raw_data, dict):
        stashed = actual_activity.raw_data.get("decoupling_pct")
        if isinstance(stashed, (int, float)):
            decoupling_pct = float(stashed)

    # ---- Grade ----------------------------------------------------------
    # Absorb-and-replan invariant (roadmap P1.4): an unplanned ride on a
    # rest/no-plan day is a FREE ride the plan absorbs — grading it against a
    # zero-TSS target would brand every group ride "overcooked", the exact
    # guilt mechanic the product exists to kill. Judge it on the absolute
    # band instead; the plan rebalances the rest of the week separately.
    unplanned_free_ride = (target_template.base_tss or 0) <= 1 and actual_tss >= 20
    if unplanned_free_ride:
        band_phase = phase if phase in _ABSOLUTE_TSS_BANDS else "maintenance"
        grade: Grade = _absolute_grade(actual_tss, band_phase)
    elif phase in _ABSOLUTE_TSS_BANDS:
        grade = _absolute_grade(actual_tss, phase)
    else:
        grade = _grade_from_pairs(duration_pair, tss_pair)

    return RideCompliance(
        grade=grade,
        duration=duration_pair,
        tss=tss_pair,
        intensity_factor=if_pair,
        variability_index=vi,
        ef=ef,
        decoupling_pct=decoupling_pct,
        zone_match_pct=None,  # reserved for stream-based analysis
        phase=phase,
        session_type=session_type,
        template_id=target_template.id,
        template_title=target_template.name,
    )


# ======================================================================
#  Serialization — for sticking into the snapshot dict
# ======================================================================

def compliance_pair_to_dict(p: CompliancePair) -> dict:
    return {
        "target": p.target,
        "actual": p.actual,
        "delta_pct": p.delta_pct,
        "band": p.band,
    }


# ======================================================================
#  Recommendation-aware scoring (Phase 4 — today-runthrough Step 4)
# ======================================================================
#
# The original `score_ride()` above is pure: caller supplies a
# `target_template`, we grade. The problem with that flow as the *outer*
# evaluation entry point is that the caller (build_snapshot) re-runs the
# template picker against post-ride state — so the picker is grading
# itself. We need the grader to read what the coach actually told the
# athlete to do, which lives in `coach_recommendations` keyed by
# (user_id, target_date).
#
# `score()` is the new entry point. It looks up the recommendation row
# for the activity's local date and grades against its blocks. If no row
# exists (e.g. older briefs from before this plumbing landed) we fall
# back to the supplied `target_template` so callers don't break.

def _local_date_for_activity(activity: Activity):
    """Athlete-local calendar date for a completed activity.

    Uses `athlete_time.local_date_of()` so a 22:30 Berlin ride (20:30 UTC)
    attributes to the local day it happened on, not the UTC-next day.
    Callers must bind the athlete tz first via
    `athlete_time.set_athlete_tz_from_profile(profile)` — the ContextVar
    falls back to Europe/Berlin otherwise (single-user MVP default).
    """
    if activity.started_at is None:
        return None
    return athlete_time.local_date_of(activity.started_at)


def _template_sport(template_id: str | None) -> str:
    """Implied sport of a template id.

    The cycling library (workout_templates.py) uses bare ids
    ('z2_endurance_60', 'rest_day', …); run templates
    (run_workout_templates.py) are prefixed 'run_'. Strength has no
    template library yet — accept a 'strength'/'gym' prefix defensively.
    Everything else is cycling.
    """
    tid = (template_id or "").lower()
    if tid.startswith("run_"):
        return "running"
    if tid.startswith(("strength", "gym")):
        return "gym"
    return "cycling"


def _ungraded(
    template: WorkoutTemplate,
    phase: str,
    session_type: str,
) -> RideCompliance:
    """Neutral 'logged, not graded' result — the sport gate refused to grade.

    No grade, no compliance pairs, no percentages: downstream renders a
    neutral card with the activity's own facts instead of a compliance
    verdict against a different sport's prescription.
    """
    return RideCompliance(
        grade=None,
        duration=None,
        tss=None,
        intensity_factor=None,
        variability_index=None,
        ef=None,
        decoupling_pct=None,
        zone_match_pct=None,
        phase=phase,
        session_type=session_type,
        template_id=template.id,
        template_title=template.name,
        graded=False,
    )


def _is_rest_like(template: WorkoutTemplate | None) -> bool:
    """A template is 'rest-like' when it prescribes no real work — a rest day,
    an empty/zero-TSS shell, or a template whose id is literally a rest day.

    Used to decide whether a persisted `coach_recommendations` row is a coherent
    grading target. A stale/empty row that resolves to a rest day must NOT
    override a real session the athlete was actually shown on the plan card.
    """
    if template is None:
        return True
    tid = (template.id or "").lower()
    if "rest" in tid:
        return True
    return float(template.base_tss or 0.0) <= 0.0 and _template_duration_minutes(template) <= 0.0


def _template_from_recommendation(rec) -> WorkoutTemplate | None:
    """Reconstruct a WorkoutTemplate from a CoachRecommendation row so the
    pure `score_ride()` grader can run unchanged.

    Strategy: prefer rebuilding from `rec.blocks` (% FTP + duration is what
    grading needs — watts are irrelevant to TSS/duration banding). If the
    blocks payload is malformed or empty, fall back to the canonical
    template registry by `template_id` so we still produce a sensible grade.
    """
    blocks_data = rec.blocks if isinstance(rec.blocks, list) else []
    rebuilt: list[IntervalBlock] = []
    for b in blocks_data:
        if not isinstance(b, dict):
            continue
        try:
            rebuilt.append(
                IntervalBlock(
                    name=str(b.get("name") or "Main"),
                    duration_s=int(b.get("duration_s") or 0),
                    target_pct_ftp=float(b.get("target_pct_ftp") or 0.0),
                    target_rpe=int(b.get("rpe") or b.get("target_rpe") or 5),
                    zone=int(b.get("zone") or 1),
                )
            )
        except (TypeError, ValueError):
            continue

    if rebuilt:
        return WorkoutTemplate(
            id=str(rec.template_id),
            name=str(rec.title or rec.template_id),
            category="endurance",  # category is not stored on the rec; placeholder
            purpose="",
            framework_cited=str(rec.framework_cited or ""),
            blocks=rebuilt,
            base_tss=float(rec.predicted_tss or 0),
        )

    # Fallback: registry lookup by template_id.
    return get_template(str(rec.template_id))


async def score(
    db: AsyncSession,
    user_id: int,
    actual_activity: Activity,
    target_template: WorkoutTemplate,
    ftp: int | None,
    phase: str,
    session_type: str,
) -> RideCompliance:
    """Recommendation-aware compliance score.

    1. Look up `coach_recommendations` for (user_id, activity.local_date).
    2. If found: grade against its template (rebuilt from blocks); persist
       the eval back onto the row so the audit trail is complete.
    3. If not found: fall back to `target_template` (existing re-pick flow)
       so older briefs don't break.

    Return shape is identical to `score_ride()` — callers don't change.
    """
    # Lazy import to avoid any import-cycle risk; the model is registered
    # via app.models.__init__ at process start anyway.
    from app.models.coach_recommendation import CoachRecommendation

    target_date = _local_date_for_activity(actual_activity)
    rec = None
    if target_date is not None:
        try:
            rec_q = await db.execute(
                select(CoachRecommendation).where(
                    CoachRecommendation.user_id == user_id,
                    CoachRecommendation.target_date == target_date,
                )
            )
            rec = rec_q.scalar_one_or_none()
        except Exception:  # pragma: no cover — DB hiccup, fall back
            _log.exception(
                "coach_recommendations lookup failed; falling back to re-pick "
                "(user_id=%s, date=%s)", user_id, target_date,
            )
            rec = None

    # Grading-target selection.
    #
    # `target_template` is the LIVE picked template — exactly what the athlete
    # was shown on today's plan card (e.g. "Progressive Z2"). The persisted
    # `coach_recommendations` row is only preferred when it is a COHERENT real
    # session: a stale or empty row that resolves to a rest day (or a row that
    # disagrees with a real live prescription) must never win, otherwise the
    # review grades the completed ride against the wrong target (the classic
    # "Rest Day" / 180 min / 156 TSS mismatch).
    #
    # Rule: whenever the live pick is a real session OF THE ACTIVITY'S SPORT,
    # grade against it — that keeps the target coherent with the plan card.
    # Fall back to the persisted recommendation when the live pick is
    # rest-like (keeps older briefs sensible) or belongs to a different sport
    # family (a run rec must grade a run even when the live pick is a bike
    # template), provided the recommendation carries real same-sport work.
    activity_sport = getattr(actual_activity, "sport", None) or "cycling"
    rec_sport = (getattr(rec, "sport", None) or "cycling") if rec is not None else None

    chosen_template: WorkoutTemplate = target_template
    used_recommendation = False
    live_matches_sport = same_sport_family(activity_sport, _template_sport(target_template.id))
    target_is_real = not _is_rest_like(target_template)
    if (not target_is_real or not live_matches_sport) and rec is not None:
        if same_sport_family(activity_sport, rec_sport):
            rec_template = _template_from_recommendation(rec)
            if rec_template is not None and not _is_rest_like(rec_template):
                chosen_template = rec_template
                used_recommendation = True

    # ---- Sport gate (usability audit P0-2) --------------------------------
    # A completed activity may only be compliance-graded against a
    # prescription of the SAME sport family. Yesterday's 10:21 gym session
    # must never be graded as today's Z2 bike ride — return a neutral
    # "logged" result instead (grade None, graded=False, no pairs).
    prescription_sport = (
        rec_sport if used_recommendation else _template_sport(chosen_template.id)
    )
    if not same_sport_family(activity_sport, prescription_sport or "cycling"):
        return _ungraded(chosen_template, phase, session_type)

    compliance = score_ride(
        actual_activity=actual_activity,
        target_template=chosen_template,
        ftp=ftp,
        phase=phase,
        session_type=session_type,
    )

    # Persist the eval back onto the recommendation row when we used it.
    if used_recommendation and rec is not None:
        try:
            rec.evaluated_at = datetime.now(UTC)
            rec.eval_grade = compliance.grade
            rec.eval_payload = ride_compliance_to_dict(compliance)
            await db.commit()
        except Exception:  # pragma: no cover — best-effort write-back
            _log.exception(
                "coach_recommendations eval write-back failed (id=%s)", rec.id,
            )

    return compliance


def ride_compliance_to_dict(rc: RideCompliance) -> dict:
    # Ungraded results (sport gate) carry no pairs. Serialize them as empty
    # dicts, not None: every existing consumer does `(c.get("tss") or {})`
    # or `compliance.get("tss", {})` — an empty dict keeps both patterns
    # crash-free while still carrying no percentages to render.
    return {
        "grade": rc.grade,
        "graded": rc.graded,
        "duration": compliance_pair_to_dict(rc.duration) if rc.duration else {},
        "tss": compliance_pair_to_dict(rc.tss) if rc.tss else {},
        "intensity_factor": (
            compliance_pair_to_dict(rc.intensity_factor) if rc.intensity_factor else None
        ),
        "variability_index": rc.variability_index,
        "ef": rc.ef,
        "decoupling_pct": rc.decoupling_pct,
        "zone_match_pct": rc.zone_match_pct,
        "phase": rc.phase,
        "session_type": rc.session_type,
        "template_id": rc.template_id,
        "template_title": rc.template_title,
    }
