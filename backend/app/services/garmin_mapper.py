"""Garmin activity and daily metrics data mapper.

Transforms raw Garmin Connect API response dicts into our domain models:
- map_garmin_activity: Garmin activity JSON -> ActivityCreate (or None for unsupported sports)
- map_daily_metrics: Multiple biometric API responses -> flat dict for DailyMetric creation

All field extractions use .get() with None defaults — Garmin's response shapes are
inconsistently documented and fields may be absent for older devices or missing data.

Power field keys (averagePower / avgPower / normalizedPower) have LOW confidence in
their exact names; both variants are tried per RESEARCH.md notes.
"""
import logging
from datetime import datetime, timezone

from app.schemas.activity import ActivityCreate
from app.services.garmin_sleep_parser import parse_sleep_vitals

logger = logging.getLogger(__name__)

# Maps Garmin activityType.typeKey to our sport types.
# Unsupported types (swimming, hiking, yoga, etc.) are NOT listed here.
# map_garmin_activity returns None for any typeKey not in this dict.
GARMIN_SPORT_MAP: dict[str, str] = {
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "gravel_cycling": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "strength_training": "gym",
    "fitness_equipment": "gym",
}


# Elevation-gain keys seen across providers/payloads, most-specific first.
# Garmin activity summaries use camelCase `elevationGain`; our seeded/synthetic
# rows and COROS-preserved rows use snake_case `total_ascent` / `elevation_gain`;
# stream-derived enrichment uses `elev_gain_m` / `ascent_m`.
_ELEVATION_KEYS = (
    "elevationGain",
    "elevation_gain",
    "totalAscent",
    "total_ascent",
    "elev_gain_m",
    "ascent_m",
)


def extract_elevation_gain_m(raw) -> float | None:
    """Pull total ascent (Höhenmeter, metres) out of an activity raw_data blob.

    Mirrors the ``crew_score._extract_vo2max`` pattern: one place that tolerates
    a JSON-string blob, a missing/None blob, and the several key spellings
    Garmin/COROS/synthetic payloads use. Returns None (never a fabricated 0) for
    indoor/no-GPS rides or any non-positive/unparseable value — the caller keeps
    an honest "—".
    """
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            import json  # noqa: PLC0415 — lazy, only on the rare string path

            raw = json.loads(raw)
        except Exception:
            return None
    if not isinstance(raw, dict):
        return None
    for key in _ELEVATION_KEYS:
        val = raw.get(key)
        if val is None:
            continue
        try:
            num = float(val)
        except (TypeError, ValueError):
            continue
        # Non-positive ascent is treated as "no elevation" — an indoor/trainer
        # ride reports 0, which we must not surface as a real climb.
        if num > 0:
            return num
    return None


def map_garmin_activity(raw: dict) -> ActivityCreate | None:
    """Transform a raw Garmin activity dict into an ActivityCreate schema.

    Returns None for:
    - Activities with unsupported sport types (swimming, hiking, etc.)
    - Activities missing activityId (required for idempotent deduplication)

    Field mapping notes:
    - startTimeGMT is preferred over startTimeLocal (always UTC, no ambiguity)
    - Power keys: tries avgPower first, then averagePower (both seen in community data)
    - duration_seconds: 0-duration activities are stored as None (avoids TSS calculation errors)

    Args:
        raw: Raw activity dict from GarminConnectClient.get_activities()

    Returns:
        ActivityCreate with all available fields populated, or None if skipped.
    """
    # Sport type mapping — return None for unsupported sports
    type_key = raw.get("activityType", {}).get("typeKey", "")
    sport = GARMIN_SPORT_MAP.get(type_key)
    if sport is None:
        logger.debug("Skipping activity with unsupported sport type: %s", type_key)
        return None

    # External ID is required for idempotent deduplication
    activity_id = raw.get("activityId")
    if activity_id is None:
        logger.warning(
            "Skipping Garmin activity with missing activityId (raw keys: %s)",
            list(raw.keys()),
        )
        return None

    # Parse started_at — prefer GMT (always UTC); fall back to local time string
    started_at = _parse_garmin_datetime(raw)
    if started_at is None:
        logger.warning(
            "Skipping Garmin activity %s: cannot parse start time from %r / %r",
            activity_id,
            raw.get("startTimeGMT"),
            raw.get("startTimeLocal"),
        )
        return None

    # Duration — store None instead of 0 to avoid division-by-zero in TSS calcs
    raw_duration = raw.get("duration", 0)
    duration_seconds = int(raw_duration) if raw_duration and int(raw_duration) > 0 else None

    # Power fields — LOW confidence on exact key names per RESEARCH.md
    # Garmin uses both "avgPower" and "averagePower" depending on the endpoint
    average_power_raw = raw.get("avgPower") or raw.get("averagePower")
    average_power = float(average_power_raw) if average_power_raw is not None else None

    normalized_power_raw = raw.get("normalizedPower")
    normalized_power = float(normalized_power_raw) if normalized_power_raw is not None else None

    # Optional numeric fields — cast defensively
    average_hr_raw = raw.get("averageHR")
    average_hr = int(average_hr_raw) if average_hr_raw is not None else None

    max_hr_raw = raw.get("maxHR")
    max_hr = int(max_hr_raw) if max_hr_raw is not None else None

    calories_raw = raw.get("calories")
    calories = int(calories_raw) if calories_raw is not None else None

    distance_raw = raw.get("distance")
    distance_meters = float(distance_raw) if distance_raw is not None else None

    # Total ascent (Höhenmeter) straight from the Garmin activity summary —
    # None for indoor/trainer rides that report no elevation.
    elevation_gain_m = extract_elevation_gain_m(raw)

    return ActivityCreate(
        sport=sport,
        started_at=started_at,
        duration_seconds=duration_seconds,
        distance_meters=distance_meters,
        elevation_gain_m=elevation_gain_m,
        average_power=average_power,
        normalized_power=normalized_power,
        average_hr=average_hr,
        max_hr=max_hr,
        calories=calories,
        title=raw.get("activityName"),
        source="garmin",
        external_id=str(activity_id),
    )


def _parse_garmin_datetime(raw: dict) -> datetime | None:
    """Parse Garmin start time into a timezone-aware UTC datetime.

    Tries startTimeGMT first (always UTC), then startTimeLocal as fallback.
    Handles both ISO format with and without timezone offset.

    Returns None if neither field can be parsed.
    """
    for field in ("startTimeGMT", "startTimeLocal"):
        value = raw.get(field)
        if not value:
            continue
        try:
            dt = datetime.fromisoformat(str(value).strip())
            # If the string had no timezone info, assume UTC (Garmin GMT field = UTC)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                # Normalize any offset to UTC
                dt = dt.astimezone(timezone.utc)
            return dt
        except (ValueError, TypeError) as exc:
            logger.debug("Failed to parse Garmin datetime %r from field %s: %s", value, field, exc)
            continue
    return None


def map_daily_metrics(
    sleep_data: dict | None,
    hrv_data: dict | None,
    body_battery_data: list[dict] | None,
    heart_rate_data: dict | None,
    stress_data: dict | None,
    user_summary: dict | None,
    training_status: dict | None = None,
    training_readiness: dict | list | None = None,
) -> dict:
    """Transform multiple Garmin biometric API responses into a flat DailyMetric dict.

    Each data source is optional — returns None for any field where the source
    is None or the key is absent. This handles devices that don't support HRV,
    users without sleep data, etc.

    Sleep score extraction path:
        1. dailySleepDTO.sleepScores.overall.value (newer Garmin firmware)
        2. dailySleepDTO.sleepScore (older firmware fallback)

    HRV extraction path:
        1. hrvSummary.lastNight (primary)
        2. hrv5MinHigh (fallback for some devices)

    Args:
        sleep_data: Response from get_sleep_data (may contain dailySleepDTO)
        hrv_data: Response from get_hrv_data (None if device doesn't support HRV)
        body_battery_data: Response from get_body_battery (list; use [0].charged)
        heart_rate_data: Response from get_heart_rates (contains restingHeartRate)
        stress_data: Response from get_all_day_stress (contains avgStressLevel)
        user_summary: Response from get_user_summary (contains totalSteps)

    Returns:
        Flat dict with keys matching DailyMetric columns plus raw_data.
    """
    # --- Sleep score ---
    sleep_score = None
    if sleep_data is not None:
        daily_sleep_dto = sleep_data.get("dailySleepDTO") or {}
        # Try nested sleepScores.overall.value first (newer Garmin)
        sleep_scores = daily_sleep_dto.get("sleepScores") or {}
        overall = sleep_scores.get("overall") or {}
        sleep_score = overall.get("value")
        # Fall back to top-level sleepScore (older Garmin firmware)
        if sleep_score is None:
            sleep_score = daily_sleep_dto.get("sleepScore")

    # --- HRV ---
    # Garmin's actual payload uses hrvSummary.lastNightAvg (overnight rMSSD avg).
    # The earlier `lastNight` key was a guess and never matched — resulting in
    # zero HRV populated. Fall back to lastNight5MinHigh then weeklyAvg so users
    # on older firmware / partial devices still get something.
    hrv_status = None
    if hrv_data is not None:
        hrv_summary = hrv_data.get("hrvSummary") or {}
        hrv_status = (
            hrv_summary.get("lastNightAvg")
            or hrv_summary.get("lastNight5MinHigh")
            or hrv_summary.get("weeklyAvg")
        )

    # --- Body battery ---
    # Prefer the most recent intraday reading (bodyBatteryValuesArray[-1][1]) over
    # the daily `charged` field. `charged` is the morning/peak value captured when
    # you wake up; the intraday array tracks the live value throughout the day and
    # matches what the watch face displays.
    body_battery = None
    if body_battery_data and len(body_battery_data) > 0:
        entry = body_battery_data[0]
        bb_array = entry.get("bodyBatteryValuesArray") or []
        for row in reversed(bb_array):
            if isinstance(row, list) and len(row) >= 2 and row[1] is not None:
                body_battery = row[1]
                break
        # Fall back to daily charged value if no intraday readings exist
        if body_battery is None:
            body_battery = entry.get("charged")

    # --- Resting heart rate ---
    resting_hr = None
    if heart_rate_data is not None:
        resting_hr = heart_rate_data.get("restingHeartRate")

    # --- Stress level ---
    stress_level = None
    if stress_data is not None:
        stress_level = stress_data.get("avgStressLevel")

    # --- Steps ---
    steps = None
    if user_summary is not None:
        steps = user_summary.get("totalSteps")

    # VO₂max + fitness age from training status; readiness score/recovery from readiness.
    vo2max = None
    if training_status:
        vo2max = (
            ((training_status.get("mostRecentVO2Max") or {}).get("generic") or {})
            .get("vo2MaxValue")
        )
    tr_score = None
    recovery_time_hours = None
    if isinstance(training_readiness, list) and training_readiness:
        tr0 = training_readiness[0]
        tr_score = tr0.get("score")
        rt = tr0.get("recoveryTime")  # minutes
        if rt is not None:
            recovery_time_hours = round(rt / 60) if rt > 48 else rt

    # Preserve all raw responses for forward compatibility (new fields, debugging)
    raw_data = {
        "sleep": sleep_data,
        "hrv": hrv_data,
        "body_battery": body_battery_data,
        "heart_rates": heart_rate_data,
        "stress": stress_data,
        "summary": user_summary,
        "training_status": training_status,
        "training_readiness": training_readiness,
    }

    # Sleep stages / SpO₂ / respiration / overnight HRV — the free sleep
    # payload carries all of these; garmin_sleep_parser flattens them into
    # DailyMetric column values (all-None for untracked nights).
    sleep_vitals = parse_sleep_vitals(sleep_data)

    return {
        "sleep_score": sleep_score,
        "hrv_status": hrv_status,
        "body_battery": body_battery,
        "resting_hr": resting_hr,
        "stress_level": stress_level,
        "steps": steps,
        "training_readiness": tr_score,
        "recovery_time_hours": recovery_time_hours,
        **sleep_vitals,
        "raw_data": raw_data,
        "_vo2max": vo2max,  # not a column; surfaced via API from raw_data
    }
