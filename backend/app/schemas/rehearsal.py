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

from app.services.rehearsal.knobs import Surface
from app.services.rehearsal.simulator import Draft, Effort

SourceKind = Literal["gpx", "crew_event", "activity", "target_event"]

#: Same ceiling the crew tour uploader enforces (crew_events.MAX_TOUR_BYTES).
#: GPX is text, so 10 MB is generous for any real route -- but the field is a
#: JSON string on an authenticated POST, and without a bound one request can
#: pin a worker parsing hundreds of megabytes.
MAX_GPX_BYTES = 10 * 1024 * 1024


class OverridesMixin(BaseModel):
    """The knobs that change WHO is riding, WHEN, and on WHAT.

    All optional, all meaning "leave it as it is" when absent — a PATCH that
    names only `draft` must not silently reset the athlete's target time.
    """

    #: Body weight only; bike mass is separate so "3 kg off me" and "a lighter
    #: bike" are answerable independently.
    weight_kg: float | None = Field(None, ge=30, le=200)
    bike_mass_kg: float | None = Field(None, ge=4, le=30)
    surface: Surface | None = None
    #: Hour of day (UTC) the ride starts; None averages the daylight window.
    start_hour: int | None = Field(None, ge=0, le=23)
    #: Rehearse against projected fitness for the event date, not today's CP.
    use_projected_cp: bool | None = None
    #: "I want to finish inside this." Triggers the backward solve.
    target_time_s: float | None = Field(None, ge=300)


class AssumptionsIn(OverridesMixin):
    """PATCH body. Every field optional: omitted means "leave it as it was"."""

    draft: Draft | None = None
    effort: Effort | None = None
    use_weather: bool | None = None


class AssumptionsOut(BaseModel):
    draft: Draft
    effort: Effort
    use_weather: bool
    # Echoed back so the controls can render their own state after a reload
    # rather than resetting to the defaults on every visit.
    weight_kg: float | None = None
    bike_mass_kg: float | None = None
    surface: Surface = "asphalt"
    start_hour: int | None = None
    use_projected_cp: bool = False
    target_time_s: float | None = None


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
    weight_kg: float | None = Field(None, ge=30, le=200)
    bike_mass_kg: float | None = Field(None, ge=4, le=30)
    surface: Surface = "asphalt"
    start_hour: int | None = Field(None, ge=0, le=23)
    use_projected_cp: bool = False
    target_time_s: float | None = Field(None, ge=300)

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


class ActualOut(BaseModel):
    """The recorded ride next to the prediction of it.

    Present only on a rehearsal of an activity, and only when the two are
    genuinely comparable -- a truncated stream produces no comparison rather
    than a fake model error.
    """

    actual_time_s: float
    predicted_time_s: float
    #: Positive when the model predicted SLOWER than the rider actually rode.
    error_s: float
    error_pct: float
    #: Whether the recorded time landed inside p10-p90. This is the test of
    #: the BAND, not of the median: a band that never contains the outcome is
    #: too narrow however good its centre.
    inside_band: bool | None = None


class ZoneOut(BaseModel):
    zone: int
    name_en: str
    name_de: str
    seconds: float
    fraction: float


class DemandOut(BaseModel):
    """What the ROUTE demands at a duration, against what the RIDER has.

    `athlete_best_w` is None when the athlete has no comparable effort on file.
    The demand itself is always present: it is a property of the road, and worth
    showing even to a rider with nothing to compare it against.
    """

    duration_s: int
    required_w: float
    athlete_best_w: float | None = None
    spare_w: float | None = None
    #: required / best. Above 1.0 means the road asks for more than the rider
    #: has ever produced for that long.
    ratio: float | None = None


class MatchesOut(BaseModel):
    count: int
    count_uncapped: int
    time_above_cp_s: float
    min_balance_j: float
    fully_depleted: bool
    starts_s: list[float] = []


class HeartRateOut(BaseModel):
    avg_bpm: float
    max_bpm: float
    #: Always True. A predicted heart rate is a model on top of a model and the
    #: surface must say so.
    is_estimate: bool = True


class TrainingEffectOut(BaseModel):
    """A documented analogue of Firstbeat's Training Effect, not a reproduction."""

    aerobic: float
    anaerobic: float
    recovery_hours_low: float
    recovery_hours_high: float
    is_estimate: bool = True


class BatteryOut(BaseModel):
    start_pct: float
    finish_pct: float
    cost_pct: float
    is_estimate: bool = True


class ChapterOut(BaseModel):
    """One stretch of road a rider would name out loud."""

    start_m: float
    end_m: float
    length_m: float
    avg_gradient_pct: float
    avg_power_w: float
    duration_s: float
    zone: int
    climb_id: int | None = None
    kind: str


class PrOut(BaseModel):
    """Read off the SAME band the page shows, so the two cannot contradict."""

    pr_s: float
    probability: float
    margin_s: float
    is_estimate: bool = True


class FuelOut(BaseModel):
    """Fuel ADEQUACY. Never weight, never a deficit, never a calorie budget."""

    carbs_g_per_hour_low: float
    carbs_g_per_hour_high: float
    carbs_g_total: float
    energy_kcal: float
    fluid_l: float
    bottles: int
    sweat_l_per_hour: float
    temperature_c: float | None = None
    is_estimate: bool = True


class AttemptOut(BaseModel):
    activity_id: int
    date: str
    duration_s: float
    avg_power_w: float | None = None


class HistoryOut(BaseModel):
    attempts: list[AttemptOut] = []
    best_s: float
    forecast_vs_best_s: float | None = None
    count: int
    #: False when there are too few rides to talk about a direction of travel.
    trend_is_meaningful: bool


class RehearsalOut(BaseModel):
    id: int
    name: str | None = None
    #: Kept by the athlete. Every rehearsal is stored; this marks the ones
    #: worth coming back to.
    saved: bool = False
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
    #: The backward solve. All None unless a target time was asked for.
    #: `target_reachable` and `target_costs_blow_up` are separate answers: a
    #: time the clock allows but W' does not is a warning, not a plan.
    target_time_s: float | None = None
    target_reachable: bool | None = None
    target_costs_blow_up: bool | None = None
    #: Solved intensity as a percentage of the effort setting's normal pace.
    target_intensity_pct: float | None = None
    #: Best time available at full gas, when the target is out of reach.
    fastest_possible_s: float | None = None
    #: True when the CP used was PROJECTED to the event date rather than
    #: measured today -- the surface has to say which fitness it simulated.
    cp_is_projected: bool = False
    #: Populated only when this rehearsal is of a ride that was actually done.
    actual: ActualOut | None = None
    #: How many of the athlete's own completed rides the band width was
    #: calibrated on. 0 means the reasoned default, not a measurement.
    band_samples: int = 0

    # ── Forecast layer ────────────────────────────────────────────────────
    # All derived from one 1 Hz expansion of the simulated ride, so a predicted
    # NP is comparable with a recorded one rather than a parallel estimate.
    avg_power_w: float | None = None
    normalized_power_w: float | None = None
    intensity_factor: float | None = None
    tss: float | None = None
    variability_index: float | None = None
    #: The anchor zones and TSS were computed against, and whether it was a CP
    #: standing in for a missing FTP.
    ftp_used_w: float | None = None
    ftp_is_cp_fallback: bool = False
    zones: list[ZoneOut] = []
    demand: list[DemandOut] = []
    matches: MatchesOut | None = None
    heart_rate: HeartRateOut | None = None
    training_effect: TrainingEffectOut | None = None
    battery: BatteryOut | None = None
    chapters: list[ChapterOut] = []
    pr: PrOut | None = None
    fuel: FuelOut | None = None
    history: HistoryOut | None = None

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
