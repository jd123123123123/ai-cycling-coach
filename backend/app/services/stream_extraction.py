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

A *recorded* 0 W sample (genuine coasting) is preserved. HR/cadence/altitude —
and the other carry-fill channels: GPS lat/lng, speed, distance, temperature,
and the pedal-biomechanics channels (`_CARRY_CHANNELS`) — forward-fill from the
last reading (they decay slowly or are positional); they stay None until the
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
    "speed", "grade_adjusted_speed", "vertical_speed", "distance", "temperature",
    # Cycling dynamics
    "right_balance", "torque_effectiveness", "pedal_smoothness",
    "pco_left", "pco_right",
    "power_phase_left_start", "power_phase_left_end",
    "power_phase_right_start", "power_phase_right_end",
    "stamina", "stamina_potential", "performance_condition",
    # Running dynamics
    "vertical_oscillation", "ground_contact_time", "ground_contact_balance",
    "vertical_ratio", "stride_length",
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
    grade_adjusted_speed: list[float | None] = field(default_factory=list)
    vertical_speed: list[float | None] = field(default_factory=list)
    distance: list[float | None] = field(default_factory=list)
    temperature: list[float | None] = field(default_factory=list)
    # Cycling dynamics
    right_balance: list[float | None] = field(default_factory=list)
    torque_effectiveness: list[float | None] = field(default_factory=list)
    pedal_smoothness: list[float | None] = field(default_factory=list)
    pco_left: list[float | None] = field(default_factory=list)
    pco_right: list[float | None] = field(default_factory=list)
    power_phase_left_start: list[float | None] = field(default_factory=list)
    power_phase_left_end: list[float | None] = field(default_factory=list)
    power_phase_right_start: list[float | None] = field(default_factory=list)
    power_phase_right_end: list[float | None] = field(default_factory=list)
    stamina: list[float | None] = field(default_factory=list)
    stamina_potential: list[float | None] = field(default_factory=list)
    performance_condition: list[float | None] = field(default_factory=list)
    # Running dynamics
    vertical_oscillation: list[float | None] = field(default_factory=list)
    ground_contact_time: list[float | None] = field(default_factory=list)
    ground_contact_balance: list[float | None] = field(default_factory=list)
    vertical_ratio: list[float | None] = field(default_factory=list)
    stride_length: list[float | None] = field(default_factory=list)

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
