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

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.rehearsal.simulator import Draft, Effort

SourceKind = Literal["gpx", "crew_event", "activity", "target_event"]

#: Same ceiling the crew tour uploader enforces (crew_events.MAX_TOUR_BYTES).
#: GPX is text, so 10 MB is generous for any real route -- but the field is a
#: JSON string on an authenticated POST, and without a bound one request can
#: pin a worker parsing hundreds of megabytes.
MAX_GPX_BYTES = 10 * 1024 * 1024


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

    @field_validator("gpx")
    @classmethod
    def _gpx_within_limit(cls, v: str | None) -> str | None:
        """Bound the upload, in BYTES -- a multibyte name inflates a char count."""
        if v is not None and len(v.encode("utf-8")) > MAX_GPX_BYTES:
            raise ValueError(
                f"that GPX file is too large -- the limit is "
                f"{MAX_GPX_BYTES // (1024 * 1024)} MB"
            )
        return v


class ClimbOut(BaseModel):
    climb_id: int
    start_m: float
    end_m: float
    length_m: float
    elev_gain_m: float
    avg_grade_pct: float


class SegmentOut(BaseModel):
    """Terrain always; pacing only when there was a prediction to make.

    `power_w`/`speed_ms`/`elapsed_s`/`w_bal_j` are None for a
    `can_predict=false` rehearsal -- the road is measured, the ride is not, and
    a nullable field is the only way to say so without a fabricated zero.
    """

    start_m: float
    gradient_pct: float
    #: Measured altitude, so the silhouette never has to be integrated back
    #: out of the gradients by the client.
    elevation_m: float | None = None
    #: Where the segment starts, so the map and the profile can be driven by one
    #: shared index instead of the client resampling the route a second time.
    #: Nullable because rehearsals stored before the map shipped have no
    #: coordinates on their persisted segments and must still load.
    lat: float | None = None
    lng: float | None = None
    power_w: float | None = None
    speed_ms: float | None = None
    elapsed_s: float | None = None
    w_bal_j: float | None = None
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
    #: True when no measured W′ backs this rider (profile FTP rather than a
    #: fitted CP curve). The simulator then has no ceiling to enforce, so it
    #: reports no blow-up and a flat-zero W′ series -- which must read as "we
    #: cannot tell you where you break", never as "you never break".
    w_prime_is_default: bool = True
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
