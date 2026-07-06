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


# Channels that forward-fill ("carry last seen"): decay slowly or are positional,
# None until the first reading. Power is handled separately (never None).
_CARRY_CHANNELS = (
    "heart_rate", "cadence", "altitude", "latitude", "longitude",
    "speed", "distance", "temperature",
    "left_right_balance", "torque_effectiveness", "pedal_smoothness",
)


@dataclass(frozen=True)
class ActivityStreams:
    power: list[float] = field(default_factory=list)
    heart_rate: list[float | None] = field(default_factory=list)
    cadence: list[float | None] = field(default_factory=list)
    altitude: list[float | None] = field(default_factory=list)
    latitude: list[float | None] = field(default_factory=list)
    longitude: list[float | None] = field(default_factory=list)
    speed: list[float | None] = field(default_factory=list)
    distance: list[float | None] = field(default_factory=list)
    temperature: list[float | None] = field(default_factory=list)
    left_right_balance: list[float | None] = field(default_factory=list)
    torque_effectiveness: list[float | None] = field(default_factory=list)
    pedal_smoothness: list[float | None] = field(default_factory=list)

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
    carry: dict[str, list[float | None]] = {c: [] for c in _CARRY_CHANNELS}
    last: dict[str, float | None] = {c: None for c in _CARRY_CHANNELS}

    prev_ts: datetime | None = None
    prev_power = 0.0
    prev_carry: dict[str, float | None] = {c: None for c in _CARRY_CHANNELS}

    for r in ordered:
        p = r.get("power")
        power_v = float(p) if p is not None else 0.0
        for c in _CARRY_CHANNELS:
            v = r.get(c)
            if v is not None:
                last[c] = float(v)

        ts = _ts(r)
        if prev_ts is not None:
            gap = int(round((ts - prev_ts).total_seconds()))
            if 1 < gap <= max_gap_s:
                for _ in range(gap - 1):
                    power.append(prev_power)
                    for c in _CARRY_CHANNELS:
                        carry[c].append(prev_carry[c])
            # gap > max_gap_s → stop: emit nothing. gap <= 1 → nothing to bridge.

        power.append(power_v)
        for c in _CARRY_CHANNELS:
            carry[c].append(last[c])
        prev_ts = ts
        prev_power = power_v
        prev_carry = dict(last)

    return ActivityStreams(power=power, **carry)
