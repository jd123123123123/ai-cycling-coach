"""Parser for the rich vitals inside Garmin's sleep payload.

Garmin's free `get_sleep_data` response (the same payload we already fetch and
store in daily_metrics.raw_data["sleep"]) carries far more than the sleep
score we historically extracted:

    dailySleepDTO.sleepTimeSeconds / deepSleepSeconds / lightSleepSeconds /
        remSleepSeconds / awakeSleepSeconds / awakeCount     — sleep stages
    dailySleepDTO.averageSpO2Value / lowestSpO2Value /
        highestSpO2Value                                     — pulse-ox (SpO₂)
    dailySleepDTO.averageRespirationValue / lowest / highest — respiration rate
    dailySleepDTO.avgSleepStress                             — overnight stress
    avgOvernightHrv (payload top level)                      — overnight HRV avg

This module turns that payload into flat column values for DailyMetric and
applies them progressively (never clobbering an already-captured reading).

Honesty rules baked in:
- A night with no tracked sleep (sleepTimeSeconds absent or 0) yields all-None
  stage/vitals values — we never store fabricated zeros for untracked nights.
- REM seconds are dropped when the device reports deviceRemCapable=false —
  an incapable device reports 0, which is "unknown", not "0 minutes of REM".
- Skin temperature is intentionally NOT parsed: Garmin's free feed reports
  skinTempDataExists=false (no skin-temp data is delivered), so any value we
  produced would be fabricated.
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

# Column names on DailyMetric that this parser produces. hrv_overnight_avg is a
# pre-existing (never previously populated) column; the rest are added by
# migration f3a4b5c6d7e8.
SLEEP_VITALS_FIELDS: tuple[str, ...] = (
    "sleep_total_s",
    "sleep_deep_s",
    "sleep_light_s",
    "sleep_rem_s",
    "sleep_awake_s",
    "sleep_awake_count",
    "spo2_avg",
    "spo2_low",
    "spo2_high",
    "respiration_avg",
    "respiration_low",
    "respiration_high",
    "sleep_stress_avg",
    "hrv_overnight_avg",
)


def _as_int(value) -> int | None:
    """Defensive int cast — Garmin mixes ints and floats ("84.0") per field."""
    if value is None:
        return None
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _as_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_sleep_vitals(sleep_data: dict | None) -> dict:
    """Extract sleep stages, SpO₂, respiration and overnight HRV from a raw
    Garmin sleep payload.

    Returns a dict with ALL keys from SLEEP_VITALS_FIELDS, None-filled for
    anything absent. Safe on None / malformed input.
    """
    vitals: dict = {k: None for k in SLEEP_VITALS_FIELDS}
    if not isinstance(sleep_data, dict):
        return vitals

    # Overnight HRV lives at the payload top level and can be present even on
    # nights where the sleep DTO is thin.
    vitals["hrv_overnight_avg"] = _as_int(sleep_data.get("avgOvernightHrv"))

    dto = sleep_data.get("dailySleepDTO")
    if not isinstance(dto, dict):
        return vitals

    total_s = _as_int(dto.get("sleepTimeSeconds"))
    if not total_s:
        # Untracked night (watch not worn / manual entry with no stages):
        # leave every stage/vital as None rather than storing fake zeros.
        return vitals

    vitals["sleep_total_s"] = total_s
    vitals["sleep_deep_s"] = _as_int(dto.get("deepSleepSeconds"))
    vitals["sleep_light_s"] = _as_int(dto.get("lightSleepSeconds"))
    # REM: only trust the value on REM-capable devices. An explicit false
    # means the 0 Garmin reports is "can't measure", not "no REM".
    if dto.get("deviceRemCapable") is False:
        vitals["sleep_rem_s"] = None
    else:
        vitals["sleep_rem_s"] = _as_int(dto.get("remSleepSeconds"))
    vitals["sleep_awake_s"] = _as_int(dto.get("awakeSleepSeconds"))
    vitals["sleep_awake_count"] = _as_int(dto.get("awakeCount"))

    vitals["spo2_avg"] = _as_float(dto.get("averageSpO2Value"))
    vitals["spo2_low"] = _as_int(dto.get("lowestSpO2Value"))
    vitals["spo2_high"] = _as_int(dto.get("highestSpO2Value"))

    vitals["respiration_avg"] = _as_float(dto.get("averageRespirationValue"))
    vitals["respiration_low"] = _as_float(dto.get("lowestRespirationValue"))
    vitals["respiration_high"] = _as_float(dto.get("highestRespirationValue"))

    vitals["sleep_stress_avg"] = _as_float(dto.get("avgSleepStress"))
    return vitals


def apply_sleep_vitals(metric, vitals: dict) -> list[str]:
    """Progressively fill sleep-vitals columns on a DailyMetric ORM row.

    Mirrors upsert_daily_metric's contract: only a currently-None column is
    written, and only with a non-None value — a later partial re-sync can
    never wipe a reading that was already captured.

    Returns the list of column names that were filled (empty if nothing new).
    """
    filled: list[str] = []
    for field in SLEEP_VITALS_FIELDS:
        new_val = vitals.get(field)
        if new_val is None:
            continue
        if getattr(metric, field, None) is None:
            setattr(metric, field, new_val)
            filled.append(field)
    return filled


def merge_raw_snapshots(old_raw: dict | None, new_raw: dict | None) -> dict | None:
    """Merge two raw_data source-snapshot dicts, newest-non-null wins.

    upsert_daily_metric always overwrites raw_data with the latest API
    snapshot. That is correct when the new snapshot is richer, but a re-sync
    where one endpoint failed (e.g. sleep fetch timed out → "sleep": null)
    would silently destroy the rich sleep payload captured earlier — and with
    it the Recovery tab's sleep stages / SpO₂ / respiration for that night.

    This merge keeps each per-source key ("sleep", "hrv", ...) from whichever
    snapshot actually has data: the new value wins unless it is None/empty
    while the old one had content.
    """
    if not isinstance(old_raw, dict):
        return new_raw
    if not isinstance(new_raw, dict):
        return old_raw

    merged = dict(old_raw)
    for key, new_val in new_raw.items():
        old_val = old_raw.get(key)
        if new_val is None or new_val == [] or new_val == {}:
            if old_val is not None and old_val != [] and old_val != {}:
                continue  # keep the old, richer value
        merged[key] = new_val
    return merged
