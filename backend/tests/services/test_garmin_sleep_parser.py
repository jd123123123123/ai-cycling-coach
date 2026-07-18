"""Tests for parsing Garmin sleep-payload vitals (stages / SpO₂ / respiration / HRV)."""
from __future__ import annotations

from app.services.garmin_sleep_parser import (
    SLEEP_VITALS_FIELDS,
    apply_sleep_vitals,
    merge_raw_snapshots,
    parse_sleep_vitals,
)


def _real_payload() -> dict:
    """Shape taken from an actual stored get_sleep_data response (user 5,
    2026-07-16) — keys and value types match Garmin's free feed exactly."""
    return {
        "avgOvernightHrv": 84.0,
        "restingHeartRate": 46,
        "bodyBatteryChange": 67,
        "skinTempDataExists": False,
        "dailySleepDTO": {
            "sleepTimeSeconds": 21660,
            "deepSleepSeconds": 6060,
            "lightSleepSeconds": 11220,
            "remSleepSeconds": 4380,
            "awakeSleepSeconds": 720,
            "awakeCount": 1,
            "deviceRemCapable": True,
            "averageSpO2Value": 94.0,
            "lowestSpO2Value": 81,
            "highestSpO2Value": 100,
            "averageRespirationValue": 11.0,
            "lowestRespirationValue": 7.0,
            "highestRespirationValue": 17.0,
            "avgSleepStress": 11.0,
            "sleepScores": {"overall": {"value": 76}},
        },
    }


class TestParseSleepVitals:
    def test_full_real_payload(self):
        v = parse_sleep_vitals(_real_payload())
        assert v["sleep_total_s"] == 21660
        assert v["sleep_deep_s"] == 6060
        assert v["sleep_light_s"] == 11220
        assert v["sleep_rem_s"] == 4380
        assert v["sleep_awake_s"] == 720
        assert v["sleep_awake_count"] == 1
        assert v["spo2_avg"] == 94.0
        assert v["spo2_low"] == 81
        assert v["spo2_high"] == 100
        assert v["respiration_avg"] == 11.0
        assert v["respiration_low"] == 7.0
        assert v["respiration_high"] == 17.0
        assert v["sleep_stress_avg"] == 11.0
        # avgOvernightHrv arrives float-formatted ("84.0") → int column
        assert v["hrv_overnight_avg"] == 84

    def test_none_payload_returns_all_none(self):
        v = parse_sleep_vitals(None)
        assert set(v.keys()) == set(SLEEP_VITALS_FIELDS)
        assert all(val is None for val in v.values())

    def test_untracked_night_yields_no_fabricated_zeros(self):
        # Watch not worn: DTO exists but sleepTimeSeconds is 0.
        v = parse_sleep_vitals({"dailySleepDTO": {"sleepTimeSeconds": 0, "deepSleepSeconds": 0}})
        assert v["sleep_total_s"] is None
        assert v["sleep_deep_s"] is None
        assert v["spo2_avg"] is None

    def test_missing_dto_still_parses_top_level_hrv(self):
        v = parse_sleep_vitals({"avgOvernightHrv": 72})
        assert v["hrv_overnight_avg"] == 72
        assert v["sleep_total_s"] is None

    def test_rem_incapable_device_reports_none_not_zero(self):
        payload = _real_payload()
        payload["dailySleepDTO"]["deviceRemCapable"] = False
        payload["dailySleepDTO"]["remSleepSeconds"] = 0
        v = parse_sleep_vitals(payload)
        assert v["sleep_rem_s"] is None
        assert v["sleep_deep_s"] == 6060  # other stages unaffected

    def test_pulse_ox_disabled_night(self):
        # Real pattern seen in stored data (e.g. 2026-06-30): sleep tracked
        # but no SpO₂ keys at all.
        payload = _real_payload()
        for k in ("averageSpO2Value", "lowestSpO2Value", "highestSpO2Value"):
            del payload["dailySleepDTO"][k]
        v = parse_sleep_vitals(payload)
        assert v["spo2_avg"] is None
        assert v["spo2_low"] is None
        assert v["sleep_total_s"] == 21660

    def test_malformed_values_are_dropped_not_raised(self):
        payload = {
            "avgOvernightHrv": "not-a-number",
            "dailySleepDTO": {
                "sleepTimeSeconds": "21660",  # numeric string is fine
                "deepSleepSeconds": {"weird": True},  # garbage → None
            },
        }
        v = parse_sleep_vitals(payload)
        assert v["hrv_overnight_avg"] is None
        assert v["sleep_total_s"] == 21660
        assert v["sleep_deep_s"] is None


class _MetricStub:
    """Bare attribute bag standing in for a DailyMetric ORM row."""

    def __init__(self, **kwargs):
        for f in SLEEP_VITALS_FIELDS:
            setattr(self, f, None)
        for k, val in kwargs.items():
            setattr(self, k, val)


class TestApplySleepVitals:
    def test_fills_none_columns(self):
        m = _MetricStub()
        filled = apply_sleep_vitals(m, parse_sleep_vitals(_real_payload()))
        assert m.sleep_total_s == 21660
        assert m.spo2_low == 81
        assert "sleep_total_s" in filled and "spo2_low" in filled

    def test_never_clobbers_existing_reading(self):
        m = _MetricStub(sleep_total_s=20000, spo2_avg=95.0)
        filled = apply_sleep_vitals(m, parse_sleep_vitals(_real_payload()))
        assert m.sleep_total_s == 20000  # kept
        assert m.spo2_avg == 95.0  # kept
        assert m.sleep_deep_s == 6060  # gap filled
        assert "sleep_total_s" not in filled

    def test_all_none_vitals_is_a_noop(self):
        m = _MetricStub(sleep_total_s=20000)
        filled = apply_sleep_vitals(m, parse_sleep_vitals(None))
        assert filled == []
        assert m.sleep_total_s == 20000


class TestMergeRawSnapshots:
    def test_new_data_wins_when_present(self):
        old = {"sleep": {"a": 1}, "stress": {"old": True}}
        new = {"sleep": {"a": 2}, "stress": {"new": True}}
        assert merge_raw_snapshots(old, new) == new

    def test_null_new_source_keeps_old_rich_payload(self):
        # The clobber case: re-sync where the sleep endpoint failed.
        old = {"sleep": {"dailySleepDTO": {"sleepTimeSeconds": 21660}}, "hrv": None}
        new = {"sleep": None, "hrv": {"hrvSummary": {"lastNightAvg": 84}}}
        merged = merge_raw_snapshots(old, new)
        assert merged["sleep"] == old["sleep"]
        assert merged["hrv"] == new["hrv"]

    def test_empty_list_and_dict_count_as_missing(self):
        old = {"body_battery": [{"charged": 80}], "summary": {"totalSteps": 9000}}
        new = {"body_battery": [], "summary": {}}
        merged = merge_raw_snapshots(old, new)
        assert merged["body_battery"] == [{"charged": 80}]
        assert merged["summary"] == {"totalSteps": 9000}

    def test_handles_missing_sides(self):
        new = {"sleep": {"x": 1}}
        assert merge_raw_snapshots(None, new) == new
        assert merge_raw_snapshots(new, None) == new
        assert merge_raw_snapshots(None, None) is None


class TestMapperIntegration:
    def test_map_daily_metrics_includes_vitals_keys(self):
        from app.services.garmin_mapper import map_daily_metrics

        mapped = map_daily_metrics(
            _real_payload(), None, None, None, None, None,
        )
        assert mapped["sleep_total_s"] == 21660
        assert mapped["spo2_avg"] == 94.0
        assert mapped["respiration_avg"] == 11.0
        assert mapped["hrv_overnight_avg"] == 84
        # Pre-existing extraction still intact
        assert mapped["sleep_score"] == 76
        assert mapped["raw_data"]["sleep"]["dailySleepDTO"]["sleepTimeSeconds"] == 21660
