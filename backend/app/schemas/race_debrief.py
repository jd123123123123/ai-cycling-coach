"""Pydantic contract for the Race Debrief (one deep analysis of a single ride).

Every analytical block is Optional and renders nothing when absent — mirrors the
graceful-degradation contract of the underlying analyzers. Field names match the
Phase-1 analyzer dataclasses so the orchestrator can map them directly.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DebriefHeader(BaseModel):
    title: str
    date: str
    sport: str
    distance_km: float
    #: Nullable: a ride with no recorded ascent AND no segments has no honest
    #: number to give, and a confident 0 on a ride that climbed is worse than a
    #: dash. See `race_debrief` for why this stopped being a segment sum.
    elevation_m: float | None
    moving_time_s: int
    #: Nullable: a ride recorded without a power meter has no normalized power.
    #: It used to be a hard `float` because the debrief refused to build at all
    #: without a power channel, so the field could not be absent. Now that such a
    #: ride gets a report, the number has to be able to say "not measured" —
    #: 0 W would read as a ride that produced nothing.
    np_watts: float | None = None
    if_: float | None = None
    tss: float
    #: Nullable for the same reason as `np_watts`: work done is the integral of
    #: the power channel, so no channel means no kilojoules. Garmin's own energy
    #: figure lives in `calories` instead — it is measured from heart rate and
    #: survives a missing meter.
    total_kj: float | None = None
    avg_speed_kmh: float
    #: The head unit's recorded energy expenditure. Present for power-less rides,
    #: where it is the only honest energy number the report can show.
    calories: int | None = None


class DebriefVerdict(BaseModel):
    #: Nullable: every input to the execution score (the split, the variability
    #: index, the matches burned, the PRs) is a power measurement. A ride with no
    #: power meter is not a bad ride, it is an UNGRADED one, and printing the
    #: scorer's 80-point starting prior as a "B" would be a verdict nobody
    #: measured. Both fields are None together; `ai_verdict` still carries a
    #: factual line about what the recording does contain.
    grade_letter: str | None = None
    grade_score: float | None = None
    ai_verdict: str
    ai_model: str
    went_well: list[str] = []
    watch_out: list[str] = []


class KeyMomentOut(BaseModel):
    kind: str
    at_s: int
    label: str
    value: float
    tone: str


class RoutePoint(BaseModel):
    lat: float
    lng: float
    power: float | None = None
    grade: float | None = None


class DebriefStory(BaseModel):
    # Downsampled aligned series for the synchronized timeline.
    t: list[int] = []
    power: list[float] = []
    hr: list[float | None] = []
    wbal: list[float] = []
    altitude: list[float | None] = []
    speed: list[float | None] = []
    moments: list[KeyMomentOut] = []
    route: list[RoutePoint] = []


class SegmentOut(BaseModel):
    kind: str
    start_s: int
    end_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    elev_loss_m: float
    avg_grade_pct: float
    avg_power: float | None = None
    avg_speed_ms: float | None = None


class ClimbOut(BaseModel):
    start_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    avg_grade_pct: float
    vam_m_per_h: float
    w_per_kg: float | None = None
    avg_power: float | None = None
    category: str


class PacingOut(BaseModel):
    first_half_np: float
    second_half_np: float
    split_pct: float
    variability_index: float | None = None
    surge_count: int
    phase_np: list[float] = []
    final_30min_np: float | None = None
    zone_time_pct: dict[str, float] = {}


class EffortMatchOut(BaseModel):
    duration_s: int
    ride_watts: float
    best_watts: float | None = None
    pct_of_best: float | None = None
    is_pr: bool


class EfficiencyOut(BaseModel):
    efficiency_factor: float | None = None
    avg_hr: float | None = None
    decoupling_pct: float | None = None
    #: Nullable: this block is emitted for a power-less ride too, carrying the
    #: average heart rate on its own. EF and decoupling are both power:HR ratios
    #: and stay None there; so does the NP they would have been divided by.
    np_watts: float | None = None


class MatchOut(BaseModel):
    start_s: int
    end_s: int
    depth_j: float
    min_bal_j: float


class MatchbookOut(BaseModel):
    matches: list[MatchOut] = []
    match_count: int
    time_above_cp_s: int
    min_bal_j: float
    fully_depleted: bool


class QuadrantOut(BaseModel):
    q1_pct: float
    q2_pct: float
    q3_pct: float
    q4_pct: float
    force_threshold_n: float
    cadence_threshold_rpm: float
    sample_count: int


class FuelingOut(BaseModel):
    total_kj: float
    total_kcal: float
    cho_g_estimate: float
    fat_g_estimate: float
    carb_target_g_per_h: tuple[float, float]
    duration_h: float
    likely_underfueled: bool | None = None
    note: str


class WkoModelOut(BaseModel):
    mftp_watts: float
    cp_watts: float
    w_prime_j: float
    frc_j: float
    pmax_watts: float
    tte_s: int | None = None
    vo2max_estimate: float | None = None
    r_squared: float


class CdaOut(BaseModel):
    cda_m2: float
    sample_count: int
    avg_speed_ms: float


class PrescriptionOut(BaseModel):
    priority: int
    headline: str
    race_tactic: str
    training_fix: str
    tone: str = "neutral"


class RaceDebrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity_id: int
    header: DebriefHeader
    verdict: DebriefVerdict
    story: DebriefStory | None = None
    segments: list[SegmentOut] = []
    climbs: list[ClimbOut] = []
    pacing: PacingOut | None = None
    efforts: list[EffortMatchOut] = []
    efficiency: EfficiencyOut | None = None
    matchbook: MatchbookOut | None = None
    quadrant: QuadrantOut | None = None
    fueling: FuelingOut | None = None
    wko: WkoModelOut | None = None
    cda: CdaOut | None = None
    plan: list[PrescriptionOut] = []
    lang: str = "en"
    generated_at: datetime | None = None
