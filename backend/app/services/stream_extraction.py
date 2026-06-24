"""Normalize raw activity records into aligned 1 Hz streams.

FIT/TCX files and Garmin activity-details payloads give a list of timestamped
records at irregular cadence: Garmin "smart recording" samples every few seconds
(not 1 Hz), and auto-pause leaves multi-minute gaps where the athlete was
stopped. The science layer (`analyze_streams`) assumes a clean moving-time
1 Hz array, so this module reconstructs one with two distinct gap policies:

  * Short gap (≤ `max_gap_s`) — a smart-recording interval or sensor dropout.
    The athlete was still riding, so the missing seconds are forward-filled from
    the previous sample (carrying power too). Zero-filling here would invent
    coasting seconds and crater Normalized Power.
  * Large gap (> `max_gap_s`) — auto-pause / a stop. That time is *excluded*
    (the timeline compresses), so stopped time never dilutes NP / CP.

A *recorded* 0 W sample (genuine coasting) is preserved. HR/cadence/altitude
forward-fill from the last reading (they decay slowly); they stay None until the
first reading.

Pure module: no DB, no Garmin, no file IO. The FIT/Garmin adapters parse bytes
into `records` dicts and hand them here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

# Gaps longer than this (seconds) are treated as stops and excluded, not filled.
DEFAULT_MAX_GAP_S = 10


@dataclass(frozen=True)
class ActivityStreams:
    power: list[float] = field(default_factory=list)
    heart_rate: list[float | None] = field(default_factory=list)
    cadence: list[float | None] = field(default_factory=list)
    altitude: list[float | None] = field(default_factory=list)

    @property
    def duration_s(self) -> int:
        return len(self.power)


def _ts(record: dict) -> datetime:
    return record["timestamp"]


def records_to_streams(
    records: list[dict], max_gap_s: int = DEFAULT_MAX_GAP_S
) -> ActivityStreams:
    """Reconstruct a moving-time 1 Hz stream from records (see module docstring)."""
    if not records:
        return ActivityStreams()

    ordered = sorted(records, key=_ts)
    power: list[float] = []
    hr: list[float | None] = []
    cad: list[float | None] = []
    alt: list[float | None] = []

    last_hr: float | None = None
    last_cad: float | None = None
    last_alt: float | None = None
    prev_ts: datetime | None = None
    prev_power = 0.0
    prev_hr = prev_cad = prev_alt = None

    for r in ordered:
        p = r.get("power")
        power_v = float(p) if p is not None else 0.0
        # HR/cadence/altitude forward-fill at the record level (carry last seen).
        h = r.get("heart_rate")
        if h is not None:
            last_hr = float(h)
        c = r.get("cadence")
        if c is not None:
            last_cad = float(c)
        a = r.get("altitude")
        if a is not None:
            last_alt = float(a)

        ts = _ts(r)
        if prev_ts is not None:
            gap = int(round((ts - prev_ts).total_seconds()))
            if 1 < gap <= max_gap_s:
                # Bridge a short gap by forward-filling the previous sample.
                for _ in range(gap - 1):
                    power.append(prev_power)
                    hr.append(prev_hr)
                    cad.append(prev_cad)
                    alt.append(prev_alt)
            # gap > max_gap_s → stop: emit nothing for the gap (compress time).
            # gap <= 1 → adjacent samples, nothing to bridge.

        power.append(power_v)
        hr.append(last_hr)
        cad.append(last_cad)
        alt.append(last_alt)
        prev_ts = ts
        prev_power, prev_hr, prev_cad, prev_alt = power_v, last_hr, last_cad, last_alt

    return ActivityStreams(power=power, heart_rate=hr, cadence=cad, altitude=alt)
