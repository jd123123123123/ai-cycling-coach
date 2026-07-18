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
    """

    grade: Grade
    duration: CompliancePair
    tss: CompliancePair
    intensity_factor: CompliancePair | None  # IF = NP / FTP
    variability_index: float | None          # VI = NP / avgP
    ef: float | None                         # NP / avgHR
    decoupling_pct: float | None             # Pw:HR drift % (if streams present)
    zone_match_pct: float | None             # reserved for when streams land
    phase: str
    session_type: str
    template_id: str
    template_title: str  # display name of the template actually graded against


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
    """Best-effort local-calendar date for a completed activity.

    The Activity model only carries a UTC-aware `started_at`. Until we
    persist an explicit `local_date` column we approximate the local
    date from `started_at` (UTC). For most riders this is correct ±1
    day at the timezone boundary — acceptable for grading lookup.
    """
    if activity.started_at is None:
        return None
    return activity.started_at.date()


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
    # Rule: whenever the live pick is a real session, grade against it — that
    # keeps the target coherent with the plan card. Only fall back to the
    # persisted recommendation when the live pick is itself rest-like but the
    # recommendation carries real work (keeps older briefs sensible).
    chosen_template: WorkoutTemplate = target_template
    used_recommendation = False
    target_is_real = not _is_rest_like(target_template)
    if not target_is_real and rec is not None:
        rec_template = _template_from_recommendation(rec)
        if rec_template is not None and not _is_rest_like(rec_template):
            chosen_template = rec_template
            used_recommendation = True

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
    return {
        "grade": rc.grade,
        "duration": compliance_pair_to_dict(rc.duration),
        "tss": compliance_pair_to_dict(rc.tss),
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
