"""Wire shapes for the routine-ride switch, its preview and its overrides.

Everything here is deliberately explicit rather than a bare dict: the profile
screen prints `occurrences`, `distance_km` and `start_local` beside the German
`reason`, and a shape the frontend has to guess at is a shape it will
eventually guess wrong.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class RoutinePreference(BaseModel):
    """The VIEWER's switch. Whose preference this is matters: it changes what
    the caller sees and nobody else's feed."""

    hide_routine_rides: bool
    #: Echoed so the settings copy can say "aus den letzten 60 Tagen" without
    #: hard-coding a number the backend is free to change.
    window_days: int
    min_occurrences: int


class RoutinePreferenceUpdate(BaseModel):
    hide_routine_rides: bool


class RoutineOverrideUpdate(BaseModel):
    """`null` clears the ruling and hands the ride back to the detector."""

    is_routine: bool | None = None


class RoutineRideSample(BaseModel):
    """One ride, as the preview lists it."""

    activity_id: int
    started_at: datetime
    title: str | None = None
    distance_km: float | None = None
    duration_s: int | None = None
    is_routine: bool
    #: Plain German, built from resolved numbers.
    reason: str
    #: "detector" | "rider"
    decided_by: str
    cluster_key: str | None = None
    occurrences: int = 0


class RoutineClusterOut(BaseModel):
    """A repeating shape in the rider's own riding — the thing the switch acts
    on. `is_routine` false clusters are carried too, so the screen can show the
    near misses ("nur 2 ähnliche Fahrten") instead of only the verdict."""

    key: str
    occurrences: int
    distance_km: float
    #: "04:55" — the rider's own local clock, not UTC.
    start_local: str
    #: "werktags" | "wochenende" | "alle"
    weekday_class: str
    is_routine: bool
    #: How many rides in the cluster carry a commute marker in the title, and
    #: which marker — "MdRzA".
    marked: int = 0
    marker_text: str | None = None
    reason: str
    first_at: datetime
    last_at: datetime
    activity_ids: list[int] = Field(default_factory=list)


class RoutinePreview(BaseModel):
    """What the switch would do, before anybody flips it.

    A switch whose effect you cannot see before flipping it is a switch nobody
    trusts — so this endpoint exists purely to be looked at.
    """

    enabled: bool
    window_days: int
    min_occurrences: int
    #: Rides examined in the window (those with a usable distance).
    considered: int
    #: How many of them would be left out of the feed right now.
    hidden_count: int
    #: The rider's median ride distance in the window — the yardstick behind
    #: "more than twice your usual", stated so the number is not a mystery.
    median_distance_km: float | None = None
    clusters: list[RoutineClusterOut] = Field(default_factory=list)
    #: Newest first, capped — enough to recognise the pattern, not the archive.
    sample: list[RoutineRideSample] = Field(default_factory=list)


class RoutineVerdictOut(BaseModel):
    """The answer after a rider rules on one ride."""

    activity_id: int
    is_routine: bool
    reason: str
    decided_by: str
    cluster_key: str | None = None
    occurrences: int = 0
