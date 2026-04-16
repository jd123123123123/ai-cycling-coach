from datetime import date, datetime

from pydantic import BaseModel


class PMCEntry(BaseModel):
    """Single day entry in the Performance Management Chart."""

    date: date
    ctl: float  # Chronic Training Load (fitness)
    atl: float  # Acute Training Load (fatigue)
    tsb: float  # Training Stress Balance (form = CTL - ATL)
    tss: float  # Training Stress Score for this day


class PMCResponse(BaseModel):
    """Performance Management Chart response with per-sport breakdown."""

    entries: list[PMCEntry]
    per_sport: dict[str, list[PMCEntry]]


class ZoneEntry(BaseModel):
    """Single training zone with boundaries."""

    name: str
    min_val: int | float | None = None
    max_val: int | float | None = None


class PowerZonesResponse(BaseModel):
    """Coggan 7-zone power zones derived from FTP."""

    ftp_watts: int
    zones: dict[str, ZoneEntry]


class PaceZonesResponse(BaseModel):
    """Seiler 3-zone running zones derived from threshold pace."""

    threshold_pace_ms: float  # threshold speed in m/s
    zones: dict[str, ZoneEntry]


class FTPHistoryEntry(BaseModel):
    """Single FTP measurement in the athlete's FTP history."""

    ftp_watts: int
    measured_at: datetime
    source: str


class FTPHistoryResponse(BaseModel):
    """FTP history for an athlete."""

    current_ftp: int | None
    history: list[FTPHistoryEntry]
