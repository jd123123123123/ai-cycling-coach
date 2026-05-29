"""External-platform workout matcher.

Surfaces structured workouts from Zwift / TrainerRoad / etc. that match the
day's prescription. The catalogue is hand-curated (data/external_workouts.json)
because scraping platform libraries wholesale runs into copyright + ToS issues
and external URLs rot constantly. Each entry carries enough metadata that the
frontend can build a robust per-platform search URL on its own.

Matching is intentionally simple:
    1. Filter to the requested category (recovery / endurance / tempo /
       sweet_spot / threshold / vo2). Empty results fall back to "endurance"
       so the panel never goes blank.
    2. Drop entries whose `min_ftp` exceeds the athlete's FTP.
    3. Rank by closeness to `target_minutes` (linear |Δ|).
    4. Return the top N (default 5).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal


Platform = Literal["zwift", "trainerroad", "rouvy"]
Category = Literal["recovery", "endurance", "tempo", "sweet_spot", "threshold", "vo2"]

_CATALOGUE_PATH = Path(__file__).parent.parent / "data" / "external_workouts.json"


@dataclass(frozen=True)
class ExternalWorkout:
    id: str
    title: str
    platform: str
    category: str
    duration_min: int
    intensity_factor: float
    structure: str
    min_ftp: int | None


@lru_cache(maxsize=1)
def _load_catalogue() -> tuple[ExternalWorkout, ...]:
    raw = json.loads(_CATALOGUE_PATH.read_text())
    items: list[ExternalWorkout] = []
    for entry in raw.get("workouts", []):
        items.append(
            ExternalWorkout(
                id=entry["id"],
                title=entry["title"],
                platform=entry["platform"],
                category=entry["category"],
                duration_min=int(entry["duration_min"]),
                intensity_factor=float(entry["intensity_factor"]),
                structure=entry["structure"],
                min_ftp=entry.get("min_ftp"),
            )
        )
    return tuple(items)


def _ftp_ok(workout: ExternalWorkout, athlete_ftp: int | None) -> bool:
    if workout.min_ftp is None:
        return True
    if athlete_ftp is None:
        return False  # Workout requires a min FTP; without one, skip.
    return athlete_ftp >= workout.min_ftp


def match_workouts(
    *,
    category: str,
    target_minutes: int,
    athlete_ftp: int | None,
    limit: int = 5,
    platforms: tuple[str, ...] | None = None,
) -> list[ExternalWorkout]:
    """Return up to `limit` external workouts matching the requested category.

    Falls back to 'endurance' if the category yields no usable matches — keeps
    the UI panel from going blank for edge categories ('rest' has no library).
    """
    catalogue = _load_catalogue()

    def candidates_for(cat: str) -> list[ExternalWorkout]:
        out = [w for w in catalogue if w.category == cat and _ftp_ok(w, athlete_ftp)]
        if platforms:
            out = [w for w in out if w.platform in platforms]
        return out

    pool = candidates_for(category)
    if not pool and category != "endurance":
        pool = candidates_for("endurance")

    pool.sort(key=lambda w: abs(w.duration_min - target_minutes))
    return pool[:limit]


def predict_tss(workout: ExternalWorkout) -> int:
    """Coggan TSS = (duration_h * IF^2 * 100). Constant across athletes for
    the same IF/duration; we surface it as a quick load comparator."""
    hours = workout.duration_min / 60.0
    return int(round(hours * workout.intensity_factor**2 * 100))
