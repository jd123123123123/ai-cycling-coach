"""Parse a Garmin Connect activity-details payload into stream records.

Garmin's `/activity-service/activity/{id}/details` returns:

    {
      "metricDescriptors": [{"key": "directPower", "metricsIndex": 10}, ...],
      "activityDetailMetrics": [{"metrics": [<value per descriptor index>]}, ...]
    }

Each row's `metrics` array is positional — you must map descriptor keys to their
`metricsIndex` to read named values. This module flattens that into the record
dicts that `stream_extraction.records_to_streams` consumes:

    {"timestamp": datetime(UTC), "power": float|None, "heart_rate": ..., ...}

`directTimestamp` is epoch milliseconds. Rows without a timestamp are dropped
(they can't be placed on the 1 Hz grid). Pure module: no DB, no Garmin client.
"""
from __future__ import annotations

from datetime import datetime, timezone

# Garmin descriptor key → our record field. Tuples list candidate keys in
# priority order; the first present wins (device/firmware vary).
_FIELD_KEYS = {
    "power": ("directPower",),
    "heart_rate": ("directHeartRate",),
    # Bikes report rpm via directBikeCadence; runs report full steps/min via
    # directDoubleCadence (≈168) — prefer that over directRunCadence (per-leg ≈84).
    "cadence": ("directBikeCadence", "directDoubleCadence", "directRunCadence"),
    "altitude": ("directElevation",),
    "latitude": ("directLatitude",),
    "longitude": ("directLongitude",),
    "speed": ("directSpeed", "directEnhancedSpeed"),
    "grade_adjusted_speed": ("directGradeAdjustedSpeed",),
    "vertical_speed": ("directVerticalSpeed",),
    "distance": ("sumDistance",),
    "temperature": ("directAirTemperature", "directOutsideTemperature"),
    # Cycling dynamics. Garmin reports L/R split as the RIGHT-leg percentage
    # (directRightBalance); left = 100 − right.
    "right_balance": ("directRightBalance", "directLeftRightBalance"),
    "torque_effectiveness": (
        "directLeftTorqueEffectiveness", "directRightTorqueEffectiveness",
    ),
    "pedal_smoothness": (
        "directLeftPedalSmoothness", "directRightPedalSmoothness",
    ),
    "pco_left": ("directLeftPlatformCenterOffset",),
    "pco_right": ("directRightPlatformCenterOffset",),
    "power_phase_left_start": ("directLeftPowerPhaseStart",),
    "power_phase_left_end": ("directLeftPowerPhaseEnd",),
    "power_phase_right_start": ("directRightPowerPhaseStart",),
    "power_phase_right_end": ("directRightPowerPhaseEnd",),
    # Garmin body-battery-of-effort signals (present on capable head units).
    "stamina": ("directAvailableStamina",),
    "stamina_potential": ("directPotentialStamina",),
    "performance_condition": ("directPerformanceCondition",),
    # Running dynamics (Garmin HRM-Pro / Running Dynamics Pod / compatible watch).
    "vertical_oscillation": ("directVerticalOscillation",),
    "ground_contact_time": ("directGroundContactTime",),
    "ground_contact_balance": ("directGroundContactBalance",),
    "vertical_ratio": ("directVerticalRatio",),
    "stride_length": ("directStrideLength",),
}
_TIMESTAMP_KEY = "directTimestamp"


def _index_map(descriptors: list[dict]) -> dict[str, int]:
    return {
        d.get("key"): d.get("metricsIndex")
        for d in descriptors
        if d.get("key") is not None and d.get("metricsIndex") is not None
    }


def _first_index(idx_map: dict[str, int], keys: tuple[str, ...]) -> int | None:
    for k in keys:
        if k in idx_map:
            return idx_map[k]
    return None


def garmin_details_to_records(detail: dict | None) -> list[dict]:
    """Flatten a Garmin activity-details payload into timestamped stream records."""
    if not detail:
        return []
    descriptors = detail.get("metricDescriptors") or []
    rows = detail.get("activityDetailMetrics") or []
    if not descriptors or not rows:
        return []

    idx_map = _index_map(descriptors)
    ts_idx = idx_map.get(_TIMESTAMP_KEY)
    if ts_idx is None:
        return []
    field_idx = {
        field: _first_index(idx_map, keys) for field, keys in _FIELD_KEYS.items()
    }

    def _val(metrics: list, i: int | None):
        if i is None or i >= len(metrics):
            return None
        return metrics[i]

    records: list[dict] = []
    for row in rows:
        metrics = row.get("metrics") or []
        ts_ms = _val(metrics, ts_idx)
        if ts_ms is None:
            continue
        record = {"timestamp": datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc)}
        for fld in _FIELD_KEYS:
            record[fld] = _val(metrics, field_idx[fld])
        records.append(record)
    return records
