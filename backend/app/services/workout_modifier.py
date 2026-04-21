"""Pure modification operations for planned workouts.

The Phase 6 Wave 2 tool-use story: the LLM reads user intent from the chat
("I only have 45 min today", "make it harder", "swap to indoor") and emits a
structured call to ``modify_planned_workout``. This service is the authoritative
executor of that intent — it NEVER authors intervals, always routes through the
12-template library + the existing parametrize_template + the existing safety
rails, so a malicious or hallucinating LLM cannot sneak junk past server-side
authority (the 05.1 "templates are the atomic unit" decision).

Design invariants (preserved from 05.1):
    1. Templates are atomic. Modifications pick from the 12-library and bend
       duration ±15% via ``parametrize_template.duration_scale`` — nothing
       more. Cascades (harder / easier) walk an ordered list; shorten /
       lengthen beyond the 15% band substitute to the adjacent template in
       the same direction.
    2. Server-side watts authority. Every ``ModificationResult`` carries
       blocks materialised from the athlete's current FTP; the LLM never
       sees raw watts it could later regurgitate.
    3. Rails applied AFTER template substitution, never before. Downgrades
       surface as ``rails_downgraded=True`` with a human-readable
       ``reason`` — the LLM is instructed to narrate the downgrade; silent
       drops violate the 05-01 transparency contract.
    4. Precedence: ``injury_flag`` > ``intensity_ceiling`` > user intent.
       Injury always wins (recovery_30 or rest_day). Ceiling caps harder
       cascades. User intent drives the rest.
    5. Pure computation — this module does NO DB I/O. Callers (the tool
       handler in ``coach_tools.py``) load the PlannedWorkout, compute a
       ``ModificationResult``, then persist + audit in a single transaction.

References:
    - ``workout_templates.TEMPLATES`` — the 12-template library
    - ``workout_templates.parametrize_template`` — materialises watts + scales
      main-block durations (±15% clamped internally)
    - ``coach_service._safe_template_for_ceiling`` — shared downgrade map
      keyed on intensity_ceiling ('rest'/'easy'/'moderate'/'push')
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.services.workout_templates import (
    TEMPLATES,
    WorkoutTemplate,
    parametrize_template,
    prescribed_workout_to_dict,
)


# ======================================================================
# Ordered library — the single cascade spine
# ======================================================================
#
# Ordered roughly by base_tss / physiological intensity. The harder and easier
# cascades are derived from this list by index shifts, so adding a new template
# only requires inserting it in the right position here.
#
# NOTE: These IDs MUST exist in ``workout_templates.TEMPLATES``. The cascade
# tests in test_workout_modifier.py enforce this invariant at CI time.

ORDERED_TEMPLATES: list[str] = [
    "rest_day",          # 0   TSS  rest
    "recovery_30",       # 15  TSS  recovery
    "z2_endurance_60",   # 45  TSS  endurance
    "z2_endurance_90",   # 68  TSS  endurance
    "z2_long_120",       # 90  TSS  endurance (volume step)
    "z2_long_180",       # 135 TSS  endurance (San Millán signature)
    "tempo_3x10",        # 70  TSS  tempo  (first intensity step)
    "sweet_spot_2x20",   # 85  TSS  sweet_spot
    "threshold_2x15",    # 78  TSS  threshold
    "over_under_3x5",    # 78  TSS  threshold
    "vo2_5x4",           # 72  TSS  vo2
    "vo2_micro_30x30",   # 65  TSS  vo2
]


TEMPLATE_HARDER_CASCADE: dict[str, str] = {
    t: ORDERED_TEMPLATES[min(i + 1, len(ORDERED_TEMPLATES) - 1)]
    for i, t in enumerate(ORDERED_TEMPLATES)
}

TEMPLATE_EASIER_CASCADE: dict[str, str] = {
    t: ORDERED_TEMPLATES[max(i - 1, 0)]
    for i, t in enumerate(ORDERED_TEMPLATES)
}


# ======================================================================
# Ceiling → safe-template mapping
# ======================================================================
#
# Mirrors coach_service._safe_template_for_ceiling so that the rails behaviour
# is identical whether a workout was prescribed by the coach brief or later
# modified via chat. If coach_service's map changes, change this too — tests
# in test_workout_modifier_safety_rails.py cross-check the mapping.

_SAFE_TEMPLATE_FOR_CEILING: dict[str, str] = {
    "rest": "rest_day",
    "easy": "recovery_30",
    "moderate": "sweet_spot_2x20",
    "push": "vo2_5x4",
}


# Rank each template against the intensity_ceiling scale so we can detect
# "this substitution would exceed the ceiling" without a string comparison.
# Ordering: rest(0) < easy(1) < moderate(2) < push(3). Templates that don't
# fit cleanly get their nearest conservative rank.
_TEMPLATE_CEILING_RANK: dict[str, int] = {
    "rest_day": 0,
    "recovery_30": 1,
    "z2_endurance_60": 2,
    "z2_endurance_90": 2,
    "z2_long_120": 2,
    "z2_long_180": 2,
    "tempo_3x10": 2,
    "sweet_spot_2x20": 2,
    "threshold_2x15": 3,
    "over_under_3x5": 3,
    "vo2_5x4": 3,
    "vo2_micro_30x30": 3,
}

_CEILING_RANK: dict[str, int] = {
    "rest": 0,
    "easy": 1,
    "moderate": 2,
    "push": 3,
}


def _template_exceeds_ceiling(template_id: str, ceiling: str) -> bool:
    """True when the template's intensity rank is above the ceiling rank.

    Unknown templates/ceilings default to 'does not exceed' — the caller has
    already picked from a known set, so this is defensive only.
    """
    t_rank = _TEMPLATE_CEILING_RANK.get(template_id, 2)
    c_rank = _CEILING_RANK.get(ceiling, 3)
    return t_rank > c_rank


# ======================================================================
# Result dataclass
# ======================================================================

@dataclass
class ModificationResult:
    """Output of ``apply_modification``.

    ``blocks`` is the serialised ``parametrize_template`` result — the same
    shape the frontend already renders for the prescribed_workout card, so no
    new materialiser is needed downstream.

    ``before`` snapshots the pre-modification state for the audit row (the
    ``coach_briefs.evidence.modification`` JSONB field).

    ``rails_downgraded=True`` + ``reason`` is the transparency contract: the
    LLM narrates the downgrade to the user, and the audit row records WHY the
    modification diverged from user intent.
    """
    template_id: str
    duration_min: int
    blocks: list[dict]
    indoor: bool
    rails_downgraded: bool
    reason: str
    before: dict
    # Predicted TSS helps the audit row + the frontend badge without a second
    # parametrize_template call.
    predicted_tss: float = 0.0
    # Extra metadata the audit row may want (e.g. category, framework_cited).
    metadata: dict[str, Any] = field(default_factory=dict)


# ======================================================================
# Core entry point
# ======================================================================

_ALLOWED_TYPES = ("shorten", "lengthen", "harder", "easier", "indoor")


def apply_modification(
    planned_workout: Any,
    modification_type: str,
    params: dict,
    user_snapshot: dict,
    ftp_w: int,
) -> ModificationResult:
    """Execute a user-intent modification on a planned workout.

    Args:
        planned_workout: anything with ``.template_id``, ``.duration_min`` and
            ``.indoor`` attributes. The ORM ``PlannedWorkout`` works, as does
            a ``SimpleNamespace`` for tests. We deliberately avoid importing
            the ORM class here to keep this module pure (no DB coupling).
        modification_type: one of ``shorten``, ``lengthen``, ``harder``,
            ``easier``, ``indoor``.
        params: type-specific parameters. ``shorten``/``lengthen`` require
            ``{"duration_min": int}``. Other types accept ``{}``.
        user_snapshot: dict with (at minimum) ``intensity_ceiling`` and
            ``injury_flag``. Extra keys (``ctl``, ``tsb``, etc.) are ignored
            for now but harmless.
        ftp_w: athlete's current FTP in watts. Must be > 0 —
            ``parametrize_template`` refuses to materialise watts from zero.

    Returns:
        ModificationResult with downgraded-aware ``template_id``, materialised
        ``blocks``, ``rails_downgraded`` flag, and a ``reason`` suitable for
        direct user narration.

    Raises:
        ValueError: unknown modification_type, missing required params,
            or ``ftp_w <= 0``.
    """
    before = {
        "template_id": getattr(planned_workout, "template_id", None),
        "duration_min": int(getattr(planned_workout, "duration_min", 0) or 0),
    }

    if ftp_w <= 0:
        raise ValueError("apply_modification requires ftp_w > 0")

    # Defensive template resolution — PlannedWorkout.template_id could be
    # garbage (rollback scenario, legacy row). Default to z2_endurance_60 so
    # the cascade has a known anchor point. The test
    # ``test_unknown_current_template_falls_back_safely`` covers this.
    current_template_id = before["template_id"]
    if current_template_id not in TEMPLATES:
        current_template_id = "z2_endurance_60"

    # 1. Injury override — strongest rail. Always wins, regardless of user intent.
    if user_snapshot.get("injury_flag"):
        return _build_injury_override(
            indoor_override=bool(getattr(planned_workout, "indoor", False)),
            ftp_w=ftp_w,
            before=before,
        )

    # 2. Dispatch by modification_type
    if modification_type == "shorten":
        return _apply_shorten(current_template_id, planned_workout, params, ftp_w, before)
    if modification_type == "lengthen":
        return _apply_lengthen(current_template_id, planned_workout, params, ftp_w, before)
    if modification_type == "harder":
        return _apply_harder(current_template_id, planned_workout, user_snapshot, ftp_w, before)
    if modification_type == "easier":
        return _apply_easier(current_template_id, planned_workout, ftp_w, before)
    if modification_type == "indoor":
        return _apply_indoor(current_template_id, planned_workout, ftp_w, before)

    raise ValueError(
        f"Unknown modification_type: {modification_type!r}. "
        f"Allowed: {', '.join(_ALLOWED_TYPES)}"
    )


# ======================================================================
# Per-modification handlers
# ======================================================================

def _base_template_minutes(template: WorkoutTemplate) -> int:
    """Total default duration in minutes (pre-scaling). Never 0."""
    total_s = sum(b.duration_s for b in template.blocks)
    if total_s <= 0:
        return 30  # recovery_30 / rest_day fallback
    return int(round(total_s / 60))


def _materialize(
    template_id: str,
    ftp_w: int,
    duration_min_target: int | None,
    indoor: bool,
) -> tuple[list[dict], int, float, dict]:
    """Run parametrize_template and serialise for storage.

    Returns (blocks, actual_duration_min, predicted_tss, metadata).

    ``duration_min_target`` is honoured within parametrize_template's clamp
    ([0.7, 1.15] × base duration). Pass None to use the template default.
    """
    template = TEMPLATES[template_id]
    base_minutes = _base_template_minutes(template)
    if duration_min_target is None or base_minutes == 0:
        scale = 1.0
    else:
        scale = duration_min_target / base_minutes
    pw = parametrize_template(template, ftp_w, duration_scale=scale)
    pw_dict = prescribed_workout_to_dict(pw)
    metadata = {
        "category": pw_dict["category"],
        "framework_cited": pw_dict["framework_cited"],
        "title": pw_dict["title"],
    }
    return (
        pw_dict["blocks"],
        pw_dict["duration_minutes"],
        pw_dict["predicted_tss"],
        metadata,
    )


def _build_injury_override(indoor_override: bool, ftp_w: int, before: dict) -> ModificationResult:
    """Hard-override to recovery_30 when injury_flag is set."""
    blocks, duration_min, predicted_tss, metadata = _materialize(
        "recovery_30", ftp_w, duration_min_target=None, indoor=indoor_override,
    )
    return ModificationResult(
        template_id="recovery_30",
        duration_min=duration_min,
        blocks=blocks,
        indoor=indoor_override,
        rails_downgraded=True,
        reason="injury flag active; easy recovery only",
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )


def _apply_shorten(
    template_id: str,
    pw: Any,
    params: dict,
    ftp_w: int,
    before: dict,
) -> ModificationResult:
    new_minutes = params.get("duration_min")
    if new_minutes is None:
        raise ValueError("shorten requires params.duration_min")
    new_minutes = int(new_minutes)

    base = _base_template_minutes(TEMPLATES[template_id])
    floor_minutes = int(round(base * 0.85))  # parametrize_template clamp

    if new_minutes >= floor_minutes:
        # Within the ±15% tolerance band — parametrize_template handles it
        blocks, duration_min, predicted_tss, metadata = _materialize(
            template_id, ftp_w, duration_min_target=new_minutes, indoor=bool(pw.indoor),
        )
        return ModificationResult(
            template_id=template_id,
            duration_min=duration_min,
            blocks=blocks,
            indoor=bool(pw.indoor),
            rails_downgraded=False,
            reason="duration adjusted within template tolerance",
            before=before,
            predicted_tss=predicted_tss,
            metadata=metadata,
        )

    # Below the floor — substitute down the easier cascade until we find a
    # template whose default duration is close to (or below) the requested
    # duration. This avoids "shortening" to another 90-min template.
    substituted_id = _cascade_toward_duration(
        template_id, new_minutes, direction="shorter",
    )
    blocks, duration_min, predicted_tss, metadata = _materialize(
        substituted_id, ftp_w, duration_min_target=new_minutes, indoor=bool(pw.indoor),
    )
    return ModificationResult(
        template_id=substituted_id,
        duration_min=duration_min,
        blocks=blocks,
        indoor=bool(pw.indoor),
        rails_downgraded=False,
        reason=(
            f"shortened beyond template tolerance; substituted to "
            f"{substituted_id} (shorter session)"
        ),
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )


def _apply_lengthen(
    template_id: str,
    pw: Any,
    params: dict,
    ftp_w: int,
    before: dict,
) -> ModificationResult:
    new_minutes = params.get("duration_min")
    if new_minutes is None:
        raise ValueError("lengthen requires params.duration_min")
    new_minutes = int(new_minutes)

    base = _base_template_minutes(TEMPLATES[template_id])
    ceiling_minutes = int(round(base * 1.15))

    if new_minutes <= ceiling_minutes:
        blocks, duration_min, predicted_tss, metadata = _materialize(
            template_id, ftp_w, duration_min_target=new_minutes, indoor=bool(pw.indoor),
        )
        return ModificationResult(
            template_id=template_id,
            duration_min=duration_min,
            blocks=blocks,
            indoor=bool(pw.indoor),
            rails_downgraded=False,
            reason="duration adjusted within template tolerance",
            before=before,
            predicted_tss=predicted_tss,
            metadata=metadata,
        )

    substituted_id = _cascade_toward_duration(
        template_id, new_minutes, direction="longer",
    )
    blocks, duration_min, predicted_tss, metadata = _materialize(
        substituted_id, ftp_w, duration_min_target=new_minutes, indoor=bool(pw.indoor),
    )
    return ModificationResult(
        template_id=substituted_id,
        duration_min=duration_min,
        blocks=blocks,
        indoor=bool(pw.indoor),
        rails_downgraded=False,
        reason=(
            f"lengthened beyond template tolerance; substituted to "
            f"{substituted_id} (longer session)"
        ),
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )


def _cascade_toward_duration(
    start_template_id: str,
    target_minutes: int,
    direction: str,
) -> str:
    """Walk the Z2 endurance family to land on the template whose base
    duration is closest to ``target_minutes`` on the requested side.

    We keep the category the same — shortening a Z2 endurance session stays in
    the Z2 family (just shorter); lengthening stays in Z2 (just longer).
    Going outside the category via shorten/lengthen would confuse the user.
    """
    if start_template_id not in TEMPLATES:
        return "z2_endurance_60"

    start_category = TEMPLATES[start_template_id].category

    # Candidates in the same category
    candidates = [
        tid for tid, tmpl in TEMPLATES.items()
        if tmpl.category == start_category
    ]

    if direction == "shorter":
        # Pick the longest candidate whose base <= target
        ranked = sorted(
            candidates,
            key=lambda t: _base_template_minutes(TEMPLATES[t]),
        )
        best = start_template_id
        for tid in ranked:
            if _base_template_minutes(TEMPLATES[tid]) <= target_minutes:
                best = tid
        # Fallback: if no candidate is shorter, drop to recovery_30
        if best == start_template_id:
            # Only drop to recovery when the target is genuinely tiny (<30min)
            if target_minutes < 30:
                return "recovery_30"
            # Otherwise pick the shortest in-category candidate
            return ranked[0]
        return best

    # direction == "longer"
    ranked = sorted(
        candidates,
        key=lambda t: _base_template_minutes(TEMPLATES[t]),
    )
    best = start_template_id
    for tid in ranked:
        if _base_template_minutes(TEMPLATES[tid]) >= target_minutes:
            best = tid
            break
        best = tid
    return best


def _apply_harder(
    template_id: str,
    pw: Any,
    snapshot: dict,
    ftp_w: int,
    before: dict,
) -> ModificationResult:
    next_template = TEMPLATE_HARDER_CASCADE.get(template_id, template_id)
    ceiling = str(snapshot.get("intensity_ceiling") or "push")
    at_top = next_template == template_id

    if _template_exceeds_ceiling(next_template, ceiling):
        safe_id = _SAFE_TEMPLATE_FOR_CEILING.get(ceiling, "z2_endurance_60")
        # If current is ALREADY at/above ceiling, downgrade to safe; otherwise
        # clamp to the highest template below the ceiling.
        if _template_exceeds_ceiling(template_id, ceiling):
            chosen_id = safe_id
        else:
            chosen_id = template_id  # stay at current (still below ceiling)
        blocks, duration_min, predicted_tss, metadata = _materialize(
            chosen_id, ftp_w, duration_min_target=before["duration_min"] or None,
            indoor=bool(pw.indoor),
        )
        return ModificationResult(
            template_id=chosen_id,
            duration_min=duration_min,
            blocks=blocks,
            indoor=bool(pw.indoor),
            rails_downgraded=True,
            reason=(
                f"blocked by intensity ceiling ('{ceiling}') — harder cascade "
                f"would have selected {next_template}, which exceeds today's "
                f"recovery state"
            ),
            before=before,
            predicted_tss=predicted_tss,
            metadata=metadata,
        )

    # Normal step — next_template is within ceiling (or at_top == True)
    blocks, duration_min, predicted_tss, metadata = _materialize(
        next_template, ftp_w, duration_min_target=before["duration_min"] or None,
        indoor=bool(pw.indoor),
    )
    reason = (
        "already at the top of the harder cascade; no further step available"
        if at_top
        else "substituted up one step in the harder cascade"
    )
    return ModificationResult(
        template_id=next_template,
        duration_min=duration_min,
        blocks=blocks,
        indoor=bool(pw.indoor),
        rails_downgraded=False,
        reason=reason,
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )


def _apply_easier(
    template_id: str,
    pw: Any,
    ftp_w: int,
    before: dict,
) -> ModificationResult:
    prev_template = TEMPLATE_EASIER_CASCADE.get(template_id, template_id)
    at_bottom = prev_template == template_id

    blocks, duration_min, predicted_tss, metadata = _materialize(
        prev_template, ftp_w, duration_min_target=before["duration_min"] or None,
        indoor=bool(pw.indoor),
    )
    reason = (
        "already at the bottom of the easier cascade (rest day)"
        if at_bottom
        else "substituted down one step in the easier cascade"
    )
    return ModificationResult(
        template_id=prev_template,
        duration_min=duration_min,
        blocks=blocks,
        indoor=bool(pw.indoor),
        rails_downgraded=False,
        reason=reason,
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )


def _apply_indoor(
    template_id: str,
    pw: Any,
    ftp_w: int,
    before: dict,
) -> ModificationResult:
    """Indoor is a flag-only modification — template, duration, and watts are
    unchanged. We re-materialise to make sure ``blocks`` is stored in the
    canonical shape even if the caller provided a PlannedWorkout without
    pre-materialised blocks."""
    blocks, duration_min, predicted_tss, metadata = _materialize(
        template_id, ftp_w, duration_min_target=before["duration_min"] or None,
        indoor=True,
    )
    return ModificationResult(
        template_id=template_id,
        duration_min=duration_min,
        blocks=blocks,
        indoor=True,
        rails_downgraded=False,
        reason="moved indoors; template and power targets unchanged",
        before=before,
        predicted_tss=predicted_tss,
        metadata=metadata,
    )
