"""The Fahrten dock's grain payload — SAISON / MONAT / WOCHE.

Three self-contained blocks with identical shape, so the screen can swap the
selected grain without special-casing any of them. Every grain carries its own
totals AND its own bars, and the totals are the sum of the bars — see
`services/ride_rhythm` for why that is a rule and not a coincidence.
"""
from pydantic import BaseModel, Field


class RhythmBucket(BaseModel):
    """One bar: a month, a Monday-started ISO week, or a day."""

    start: str = Field(description="ISO date of the bucket's first day (YYYY-MM-DD)")
    km: float = Field(description="Distance ridden in this bucket, 1 decimal")
    rides: int = Field(description="Rides started in this bucket")
    hours: float = Field(description="Moving time in this bucket, 1 decimal")
    elevation_m: int = Field(description="Ascent in this bucket, whole metres")


class RhythmGrain(BaseModel):
    """One grain's window: what it adds up to, and how it is shaped."""

    label: str = Field(description='Human label for the window ("2026", "Letzte 30 Tage")')
    km: float
    rides: int
    hours: float
    elevation_m: int
    buckets: list[RhythmBucket] = Field(
        description="Oldest first. Every bucket in the window is present, empty ones included."
    )


class RideRhythm(BaseModel):
    """Season / month / week, each one grain finer than the last."""

    season: RhythmGrain
    month: RhythmGrain
    week: RhythmGrain
