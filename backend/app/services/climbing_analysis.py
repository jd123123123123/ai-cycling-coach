"""Per-climb metrics: VAM, W/kg, and a rough climb category.

Pure module. Consumes the climb-kind Segments from ride_segmentation. Category
uses the classic "climb score" = elevation_gain_m × average_grade_fraction ×
100, bucketed to the Tour-style HC/1/2/3/4 bands (approximate — for athlete
context, not race officiating).
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.ride_segmentation import Segment

# climb-score thresholds (elev_gain_m * grade_fraction * 100), ascending band edges
_CATEGORY_BANDS = [
    (8000.0, "HC"),
    (6400.0, "1"),
    (3200.0, "2"),
    (1600.0, "3"),
    (800.0, "4"),
]


def _category(elev_gain_m: float, avg_grade_pct: float) -> str:
    score = elev_gain_m * (avg_grade_pct / 100.0) * 100.0
    for threshold, label in _CATEGORY_BANDS:
        if score >= threshold:
            return label
    return "uncat"


@dataclass(frozen=True)
class Climb:
    start_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    avg_grade_pct: float
    vam_m_per_h: float
    w_per_kg: float | None
    avg_power: float | None
    category: str


def analyze_climbs(segments: list[Segment], mass_kg: float | None = None) -> list[Climb]:
    """Metrics for each climb-kind segment. Returns [] when there are no climbs."""
    climbs: list[Climb] = []
    for s in segments:
        if s.kind != "climb" or s.duration_s <= 0:
            continue
        vam = s.elev_gain_m / (s.duration_s / 3600.0)
        w_per_kg = (
            round(s.avg_power / mass_kg, 2)
            if s.avg_power is not None and mass_kg and mass_kg > 0
            else None
        )
        climbs.append(Climb(
            start_s=s.start_s, duration_s=s.duration_s, distance_m=s.distance_m,
            elev_gain_m=s.elev_gain_m, avg_grade_pct=s.avg_grade_pct,
            vam_m_per_h=round(vam, 1), w_per_kg=w_per_kg, avg_power=s.avg_power,
            category=_category(s.elev_gain_m, s.avg_grade_pct),
        ))
    return climbs
