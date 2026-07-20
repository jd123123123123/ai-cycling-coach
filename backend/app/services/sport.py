"""Sport-family helper — the single place that answers "are these the same sport?".

The grading gate (usability audit P0-2) requires that a completed activity is
only compliance-graded against a prescription when the sport families match:
a gym session must never be graded against a bike workout. Stored sport values
come from garmin_mapper.GARMIN_SPORT_MAP: 'cycling' | 'running' | 'gym'.
"""

from __future__ import annotations

_FAMILIES: dict[str, str] = {
    "cycling": "cycling",
    "running": "running",
    "gym": "strength",
    "strength": "strength",
    "strength_training": "strength",
}


def sport_family(sport: str | None) -> str:
    """Normalize a stored sport value to its family.

    Unknown/None values map to 'other' — callers must treat 'other' as
    never matching a prescription (ungraded, but still logged/credited).
    """
    if not sport:
        return "other"
    return _FAMILIES.get(sport.strip().lower(), "other")


def same_sport_family(a: str | None, b: str | None) -> bool:
    """True when both sports belong to the same family (and neither is unknown)."""
    fa, fb = sport_family(a), sport_family(b)
    return fa != "other" and fa == fb
