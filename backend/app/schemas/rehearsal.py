"""Wire shapes for /rehearsals. Task 10's TypeScript mirrors these exactly.

Two rules are encoded in the types rather than left to the router:

  * a predicted time is never returned without its band -- `total_time_s` and
    `band` are both optional and are only ever populated together, so a client
    cannot render a bare number that looks more certain than it is;
  * `can_predict=False` is a 201-level answer, not an error, carrying the
    terrain and a `missing` list naming what the athlete's profile lacks.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.services.rehearsal.simulator import Draft, Effort

SourceKind = Literal["gpx", "crew_event", "activity", "target_event"]


class AssumptionsIn(BaseModel):
    """PATCH body. Every field optional: omitted means "leave it as it was"."""

    draft: Draft | None = None
    effort: Effort | None = None
    use_weather: bool | None = None


class AssumptionsOut(BaseModel):
    draft: Draft
    effort: Effort
    use_weather: bool


class RehearsalCreate(BaseModel):
    source_kind: SourceKind = "gpx"
    #: Raw GPX text, for source_kind='gpx'.
    gpx: str | None = None
    #: The crew event / activity id, for the other source kinds (Task 12).
    source_ref: int | None = None
    name: str | None = Field(None, max_length=160)
    #: Only a dated route can carry weather.
    ride_date: date | None = None
    draft: Draft = "solo"
    effort: Effort = "fondo"
    use_weather: bool = True


class ClimbOut(BaseModel):
    climb_id: int
    start_m: float
    end_m: float
    length_m: float
    elev_gain_m: float
    avg_grade_pct: float


class SegmentOut(BaseModel):
    start_m: float
    gradient_pct: float
    power_w: float
    speed_ms: float
    elapsed_s: float
    w_bal_j: float
    climb_id: int | None = None


class BandOut(BaseModel):
    p10_s: float
    p50_s: float
    p90_s: float
    draws: int


class BlowUpOut(BaseModel):
    distance_m: float
    climb_id: int | None = None


class RehearsalOut(BaseModel):
    id: int
    name: str | None = None
    source_kind: SourceKind
    source_ref: int | None = None
    distance_m: float
    ascent_m: float
    created_at: datetime
    assumptions: AssumptionsOut

    can_predict: bool
    #: Names of the inputs the athlete's profile lacks, e.g. ['cp', 'weight'].
    missing: list[str] = []
    climbs: list[ClimbOut] = []
    segments: list[SegmentOut] = []
    #: Populated only together with `band` -- never a bare time.
    total_time_s: float | None = None
    band: BandOut | None = None
    total_kj: float | None = None
    carbs_g_per_hour: float | None = None
    blow_ups: list[BlowUpOut] = []
    #: True when CdA is the labelled fallback rather than a measurement.
    cda_is_default: bool = True
    #: True when the durability fade is the unmeasured default (currently
    #: always, until a stored durability_drop_pct exists) -- never a
    #: fabricated "you slow down at km 180" without a real measurement
    #: behind it.
    durability_is_default: bool = True
    weather_used: bool = False

    @model_validator(mode="after")
    def _time_and_band_together(self) -> RehearsalOut:
        """Never a bare time without the band, or a band without a time."""
        if (self.total_time_s is None) != (self.band is None):
            raise ValueError("total_time_s and band must both be set or both be None")
        return self


class RehearsalListItem(BaseModel):
    """List rows carry the headline only -- segments are far too big for a list."""

    id: int
    name: str | None = None
    source_kind: SourceKind
    distance_m: float
    ascent_m: float
    created_at: datetime
    can_predict: bool
    total_time_s: float | None = None
    band: BandOut | None = None

    @model_validator(mode="after")
    def _time_and_band_together(self) -> RehearsalListItem:
        """Never a bare time without the band, or a band without a time."""
        if (self.total_time_s is None) != (self.band is None):
            raise ValueError("total_time_s and band must both be set or both be None")
        return self


class RehearsalListOut(BaseModel):
    rehearsals: list[RehearsalListItem] = []
