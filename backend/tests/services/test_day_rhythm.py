"""Unit tests for day_rhythm — whole-day intraday rhythm signals.

Synthetic fixtures only; the AsyncSession is mocked (same pattern as
test_biometrics_snapshot.py). Verifies the honesty contract everywhere:
sparse/missing inputs degrade field-by-field to None, never to fabricated
numbers.

Fixture world: athlete in Europe/Berlin (CEST, UTC+2 in May), target day
2026-05-03, "now" 08:34 UTC = 10:34 local.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

from app.services.day_rhythm import (
    bedtime_stats,
    best_training_window,
    compute_day_rhythm,
    hourly_stats,
    render_day_rhythm_context,
    stress_curve,
    today_so_far,
)

TZ = ZoneInfo("Europe/Berlin")  # CEST in May: local = UTC + 2
TARGET = date(2026, 5, 3)
NOW_UTC = datetime(2026, 5, 3, 8, 34, tzinfo=timezone.utc)  # 10:34 local
USER_ID = 5

HISTORY_DATES = [TARGET - timedelta(days=d) for d in range(5, 0, -1)]  # Apr 28..May 2


def _utc(day: date, local_hour: int, minute: int = 0) -> datetime:
    """UTC instant for a Berlin-local wall time (CEST → UTC-2h offset)."""
    return datetime(day.year, day.month, day.day, local_hour, minute, tzinfo=TZ).astimezone(
        timezone.utc
    )


def _history_stress_points() -> list[tuple[datetime, float]]:
    """5 days, one sample per local hour 6..21: morning 20, afternoon 40
    (peak 55 at 14-15h), hours 17-18 = 25, evening 30."""
    points = []
    for day in HISTORY_DATES:
        for hour in range(6, 22):
            if hour in (14, 15):
                value = 55.0
            elif hour in (17, 18):
                value = 25.0
            elif hour < 12:
                value = 20.0
            elif hour < 18:
                value = 40.0
            else:
                value = 30.0
            points.append((_utc(day, hour), value))
    return points


def _today_stress_points() -> list[tuple[datetime, float]]:
    """Quiet morning: value 10 (typical is 20). Hours 9+10 get 3 samples each
    so today's 2h peak window is derivable; hours 7-8 get 2 each."""
    points = []
    for hour, count in ((7, 2), (8, 2), (9, 3), (10, 3)):
        for i in range(count):
            points.append((_utc(TARGET, hour, i * 10), 10.0))
    return points


def _hr_values_for_day(day: date) -> list[list[float]]:
    """2-min-style intraday HR: elevated (120 bpm) at local 17-18h, 60 elsewhere."""
    values = []
    for hour in range(7, 21):
        bpm = 120.0 if hour in (17, 18) else 60.0
        for minute in (0, 20, 40):
            ts = _utc(day, hour, minute)
            values.append([int(ts.timestamp() * 1000), bpm])
    return values


def _sleep_dto(day: date, onset_local_hour: int, onset_minute: int) -> dict:
    onset = _utc(day, onset_local_hour, onset_minute)
    return {
        "sleepStartTimestampGMT": int(onset.timestamp() * 1000),
        "sleepTimeSeconds": 28000,
    }


def _daily_row(day: date, steps: int | None, raw_data: dict | None) -> SimpleNamespace:
    return SimpleNamespace(date=day, steps=steps, raw_data=raw_data)


def _sample_row(dt: datetime, value: float) -> SimpleNamespace:
    return SimpleNamespace(recorded_at=dt, value=value, metric_type="stress")


def _mock_db(stress_rows: list, daily_rows: list) -> SimpleNamespace:
    """Two execute() calls per compute_day_rhythm: (1) samples, (2) dailies."""
    db = SimpleNamespace()
    calls = {"i": 0}

    async def _execute(_query):
        calls["i"] += 1
        rows = stress_rows if calls["i"] == 1 else daily_rows
        scalars = SimpleNamespace(all=lambda: list(rows))
        return SimpleNamespace(scalars=lambda: scalars)

    db.execute = AsyncMock(side_effect=_execute)
    return db


# ----------------------------------------------------------------------
# bedtime_stats
# ----------------------------------------------------------------------


class TestBedtimeStats:
    def test_midnight_straddling_onsets_small_stddev(self):
        # 23:30, 00:10 (+1d), 23:50, 00:05 (+1d) local — a consistent sleeper.
        onsets = [
            _utc(date(2026, 5, 1), 23, 30),
            _utc(date(2026, 5, 3), 0, 10),
            _utc(date(2026, 5, 3), 23, 50),
            _utc(date(2026, 5, 5), 0, 5),
        ]
        result = bedtime_stats(onsets, TZ)
        assert result is not None
        stddev, typical, nights = result
        assert nights == 4
        assert stddev < 30  # no circular-wraparound blowup across midnight
        assert typical in ("23:57", "23:58")  # median of 690,730,710,725 → 717.5

    def test_too_few_nights_returns_none(self):
        onsets = [_utc(date(2026, 5, 1), 23, 0)] * 3
        assert bedtime_stats(onsets, TZ) is None


# ----------------------------------------------------------------------
# hourly_stats
# ----------------------------------------------------------------------


class TestHourlyStats:
    def test_buckets_by_local_hour_and_counts_days(self):
        # 12:00 UTC = 14:00 Berlin local in May.
        points = [
            (datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc), 30.0),
            (datetime(2026, 5, 2, 12, 30, tzinfo=timezone.utc), 50.0),
        ]
        stats = hourly_stats(points, TZ)
        assert set(stats.keys()) == {14}
        mean, n, days = stats[14]
        assert mean == 40.0
        assert n == 2
        assert days == 2

    def test_empty_points(self):
        assert hourly_stats([], TZ) == {}


# ----------------------------------------------------------------------
# stress_curve
# ----------------------------------------------------------------------


class TestStressCurve:
    def test_band_means_and_peak_window(self):
        curve = stress_curve(_history_stress_points(), _today_stress_points(), TZ)
        assert curve is not None
        # Morning pulled below 20 by today's quiet samples, afternoon well above.
        assert curve["morning_mean"] < 20.5
        assert curve["afternoon_mean"] > curve["morning_mean"]
        assert curve["evening_mean"] is not None
        assert curve["peak_window_local"] == "14-16h"  # the 55-stress block
        assert curve["days_used"] == 6  # 5 history days + today

    def test_todays_peak_needs_three_samples_per_hour(self):
        curve = stress_curve(_history_stress_points(), _today_stress_points(), TZ)
        # Only hours 9 and 10 have >= 3 samples today → window must be 9-11h.
        assert curve["today_peak_window_local"] == "9-11h"

    def test_no_points_returns_none(self):
        assert stress_curve([], [], TZ) is None

    def test_sparse_days_yield_none_bands(self):
        # 2 days of data < MIN_DAYS_PER_HOUR (3) → every band None → curve None.
        two_days = [
            p for p in _history_stress_points()
            if p[0].astimezone(TZ).date() in set(HISTORY_DATES[:2])
        ]
        assert stress_curve(two_days, [], TZ) is None


# ----------------------------------------------------------------------
# best_training_window
# ----------------------------------------------------------------------


class TestBestTrainingWindow:
    def test_combined_hr_and_stress_picks_active_low_stress_window(self):
        stress_stats = hourly_stats(_history_stress_points(), TZ)
        hr_points = []
        for day in HISTORY_DATES:
            for ts_ms, bpm in _hr_values_for_day(day):
                hr_points.append(
                    (datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc), bpm)
                )
        hr_stats = hourly_stats(hr_points, TZ)

        window = best_training_window(stress_stats, hr_stats)
        assert window is not None
        # 17-19h: HR maximally elevated AND stress near its waking minimum.
        assert window["start_hour_local"] == 17
        assert window["end_hour_local"] == 19
        assert window["window_label"] == "17-19h"
        assert window["label"] == "observed pattern"
        assert "active" in window["basis"]
        assert window["days_used"] >= 3

    def test_stress_only_picks_calmest_hours(self):
        stress_stats = hourly_stats(_history_stress_points(), TZ)
        window = best_training_window(stress_stats, {})
        assert window is not None
        # Calmest waking hours: morning (20) or the 17-18h dip (25). Morning wins.
        assert window["start_hour_local"] < 12
        assert window["label"] == "observed pattern"
        assert "calm" in window["basis"]

    def test_insufficient_coverage_returns_none(self):
        # Two candidate windows only (< 3) → refuse to call a pattern.
        sparse = {
            7: (20.0, 30, 5),
            8: (22.0, 30, 5),
            9: (21.0, 30, 5),
        }  # windows 7-9 and 8-10... only starts 7 and 8 → 2 candidates
        assert best_training_window(sparse, {}) is None

    def test_empty_stats_returns_none(self):
        assert best_training_window({}, {}) is None


# ----------------------------------------------------------------------
# today_so_far
# ----------------------------------------------------------------------


class TestTodaySoFar:
    def test_quiet_morning_vs_same_hours_baseline(self):
        result = today_so_far(
            _today_stress_points(),
            _history_stress_points(),
            steps_today=2121,
            prior_day_steps=[8000, 8200, 7900, 8500, 8100],
            now_utc=NOW_UTC,
            tz=TZ,
        )
        assert result is not None
        assert result["as_of_local"] == "10:34"
        assert result["stress_so_far_mean"] == 10.0
        # History band 06:00-10:34 local = hours 6..10 at stress 20.
        assert result["typical_same_hours_stress"] == 20.0
        assert result["stress_vs_typical_pct"] == -50.0
        assert result["steps_today"] == 2121
        assert result["typical_full_day_steps"] == 8100
        assert "FULL-DAY" in result["steps_note"]

    def test_few_today_samples_degrade_stress_but_keep_steps(self):
        few = _today_stress_points()[:3]  # < MIN_TODAY_STRESS_SAMPLES (5)
        result = today_so_far(
            few, _history_stress_points(), 2121,
            [8000, 8200, 7900, 8500, 8100], NOW_UTC, TZ,
        )
        assert result is not None
        assert result["stress_so_far_mean"] is None
        assert result["stress_vs_typical_pct"] is None
        assert result["steps_today"] == 2121

    def test_steps_baseline_needs_five_days(self):
        result = today_so_far(
            _today_stress_points(), _history_stress_points(), 2121,
            [8000, 8200], NOW_UTC, TZ,
        )
        assert result["typical_full_day_steps"] is None

    def test_nothing_observed_returns_none(self):
        assert today_so_far([], [], None, [], NOW_UTC, TZ) is None


# ----------------------------------------------------------------------
# compute_day_rhythm (mocked AsyncSession)
# ----------------------------------------------------------------------


class TestComputeDayRhythm:
    async def test_full_synthetic_day(self):
        stress_rows = [
            _sample_row(dt, v)
            for dt, v in (_history_stress_points() + _today_stress_points())
        ]
        daily_rows = []
        for i, day in enumerate(HISTORY_DATES):
            daily_rows.append(
                _daily_row(
                    day,
                    steps=[8000, 8200, 7900, 8500, 8100][i],
                    raw_data={
                        "sleep": {"dailySleepDTO": _sleep_dto(day, 23, 30 + i)},
                        "heart_rates": {"heartRateValues": _hr_values_for_day(day)},
                    },
                )
            )
        daily_rows.append(_daily_row(TARGET, steps=2121, raw_data=None))
        db = _mock_db(stress_rows, daily_rows)

        rhythm = await compute_day_rhythm(
            db, USER_ID, target_date=TARGET, tz=TZ, now_utc=NOW_UTC
        )

        assert rhythm is not None
        assert rhythm["bedtime_consistency_min"] is not None
        assert rhythm["bedtime_consistency_min"] < 10  # onsets 23:30..23:34
        assert rhythm["bedtime_typical_onset_local"].startswith("23:3")
        assert rhythm["bedtime_nights_used"] == 5
        assert rhythm["stress_curve"]["peak_window_local"] == "14-16h"
        assert rhythm["best_training_window"]["start_hour_local"] == 17
        assert rhythm["best_training_window"]["label"] == "observed pattern"
        assert rhythm["today_so_far"]["stress_vs_typical_pct"] == -50.0
        assert rhythm["today_so_far"]["steps_today"] == 2121
        assert rhythm["history_days"] == 21
        assert "stress (3-min intraday)" in rhythm["channels_used"]
        assert "heart_rate (2-min intraday)" in rhythm["channels_used"]
        assert "sleep windows" in rhythm["channels_used"]
        assert "steps (day totals)" in rhythm["channels_used"]

    async def test_no_data_at_all_returns_none(self):
        db = _mock_db([], [])
        assert (
            await compute_day_rhythm(
                db, USER_ID, target_date=TARGET, tz=TZ, now_utc=NOW_UTC
            )
            is None
        )

    async def test_naps_and_missing_raw_data_are_skipped(self):
        # One daily row with a 1h "sleep" (nap) + one with no raw_data:
        # bedtime must stay None, steps baseline too sparse → None, but the
        # dict itself exists because steps_today was observed.
        nap_dto = {"sleepStartTimestampGMT": int(NOW_UTC.timestamp() * 1000),
                   "sleepTimeSeconds": 3600}
        daily_rows = [
            _daily_row(HISTORY_DATES[-1], steps=8000,
                       raw_data={"sleep": {"dailySleepDTO": nap_dto}}),
            _daily_row(TARGET, steps=500, raw_data=None),
        ]
        db = _mock_db([], daily_rows)
        rhythm = await compute_day_rhythm(
            db, USER_ID, target_date=TARGET, tz=TZ, now_utc=NOW_UTC
        )
        assert rhythm is not None
        assert rhythm["bedtime_consistency_min"] is None
        assert rhythm["stress_curve"] is None
        assert rhythm["best_training_window"] is None
        assert rhythm["today_so_far"]["steps_today"] == 500
        assert rhythm["today_so_far"]["typical_full_day_steps"] is None
        assert rhythm["today_so_far"]["stress_so_far_mean"] is None


# ----------------------------------------------------------------------
# render_day_rhythm_context
# ----------------------------------------------------------------------


class TestRenderContext:
    def _full_rhythm(self) -> dict:
        return {
            "bedtime_consistency_min": 22.0,
            "bedtime_typical_onset_local": "23:32",
            "bedtime_nights_used": 5,
            "stress_curve": {
                "morning_mean": 19.4,
                "afternoon_mean": 42.5,
                "evening_mean": 30.0,
                "peak_window_local": "14-16h",
                "today_peak_window_local": "9-11h",
                "days_used": 6,
            },
            "best_training_window": {
                "start_hour_local": 17,
                "end_hour_local": 19,
                "window_label": "17-19h",
                "label": "observed pattern",
                "basis": "usually active (elevated HR) with historically low stress in this window",
                "days_used": 5,
            },
            "today_so_far": {
                "as_of_local": "10:34",
                "stress_so_far_mean": 10.0,
                "typical_same_hours_stress": 20.0,
                "stress_vs_typical_pct": -50.0,
                "steps_today": 2121,
                "typical_full_day_steps": 8100,
                "steps_note": "…",
            },
            "history_days": 21,
            "channels_used": ["stress (3-min intraday)"],
        }

    def test_full_rhythm_renders_all_sections(self):
        text = render_day_rhythm_context(self._full_rhythm())
        assert text is not None
        assert "Day rhythm" in text
        assert "23:32" in text
        assert "±22" in text
        assert "usually peaks 14-16h" in text
        assert "observed pattern, not a rule" in text
        assert "17-19h" in text
        assert "10:34" in text
        assert "-50%" in text
        assert "2121 steps" in text
        assert "FULL day" in text  # steps honesty label survives rendering
        assert "never as prescriptive certainty" in text

    def test_none_input_returns_none(self):
        assert render_day_rhythm_context(None) is None

    def test_all_none_fields_return_none(self):
        empty = {
            "bedtime_consistency_min": None,
            "bedtime_typical_onset_local": None,
            "bedtime_nights_used": 0,
            "stress_curve": None,
            "best_training_window": None,
            "today_so_far": None,
            "history_days": 21,
            "channels_used": [],
        }
        assert render_day_rhythm_context(empty) is None

    def test_partial_rhythm_renders_only_observed_lines(self):
        partial = {
            "bedtime_consistency_min": None,
            "stress_curve": {
                "morning_mean": None,
                "afternoon_mean": None,
                "evening_mean": None,
                "peak_window_local": "14-16h",
                "today_peak_window_local": None,
                "days_used": 4,
            },
            "best_training_window": None,
            "today_so_far": None,
            "history_days": 21,
        }
        text = render_day_rhythm_context(partial)
        assert text is not None
        assert "usually peaks 14-16h" in text
        assert "Sleep onset" not in text
        assert "Today so far" not in text
        assert "Best training window" not in text
