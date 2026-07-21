"""Unit tests for weekly_wrapped pure helpers.

Synthetic Activity fixtures only — the pure transforms (day series, ride score,
peak-power comparison, hh:mm formatting) carry the honesty contract: sparse
inputs degrade to None, never to fabricated numbers.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

from app.services.weekly_wrapped import (
    POWER_APPLIANCES,
    WEEKDAY_KEYS,
    _fmt_hm,
    _peak_power_of,
    daily_effort,
    power_comparison,
    ride_score,
)

START = date(2026, 7, 6)  # a Monday


def _act(day_offset: int, tss: float, km: float, raw: dict | None = None):
    d = datetime(2026, 7, 6, 9, 0, tzinfo=timezone.utc)
    return SimpleNamespace(
        started_at=d.replace(day=6 + day_offset),
        tss=tss,
        distance_meters=km * 1000,
        raw_data=raw,
    )


def test_daily_effort_seven_buckets_mon_to_sun():
    week = [_act(0, 60, 30), _act(5, 200, 80), _act(5, 40, 15)]
    days = daily_effort(week, START)
    assert [b["key"] for b in days] == WEEKDAY_KEYS
    assert len(days) == 7
    # Monday
    assert days[0]["tss"] == 60 and days[0]["sessions"] == 1
    # Saturday aggregates the two rides
    assert days[5]["tss"] == 240 and days[5]["sessions"] == 2
    assert days[5]["km"] == 95.0
    # Empty days stay with zeros
    assert days[1]["tss"] == 0 and days[1]["sessions"] == 0


def test_daily_effort_flags_single_peak_day():
    week = [_act(0, 60, 30), _act(5, 240, 95), _act(3, 100, 40)]
    days = daily_effort(week, START)
    peaks = [b for b in days if b["peak"]]
    assert len(peaks) == 1
    assert peaks[0]["key"] == "sat"


def test_daily_effort_no_peak_when_empty_week():
    days = daily_effort([], START)
    assert all(not b["peak"] for b in days)
    assert all(b["tss"] == 0 for b in days)


def test_ride_score_none_without_enough_history():
    assert ride_score(200, [100, 120]) is None
    assert ride_score(None, [1, 2, 3, 4, 5, 6]) is None
    assert ride_score(0, [1, 2, 3, 4, 5, 6]) is None


def test_ride_score_top_ride_scores_high_and_bounded():
    history = [50, 60, 70, 80, 90, 100]
    top = ride_score(300, history)
    assert top is not None and 90 <= top <= 99
    # A modest ride still lands in the satisfying band, never below 1.
    modest = ride_score(10, history)
    assert modest is not None and modest >= 1


def test_peak_power_reads_only_honest_peak_fields():
    assert _peak_power_of(_act(0, 100, 30, {"peak_power": 1240})) == 1240.0
    assert _peak_power_of(_act(0, 100, 30, {"max_power": 900})) == 900.0
    # Normalized/average power must NOT be mistaken for a sprint peak.
    assert _peak_power_of(_act(0, 100, 30, {"normalized_power": 250})) is None
    assert _peak_power_of(_act(0, 100, 30, None)) is None


def test_power_comparison_puts_you_first_with_appliances():
    rows = power_comparison(1240, de=True)
    assert rows[0]["you"] is True
    assert rows[0]["watts"] == 1240
    assert rows[0]["label"] == "Du"
    keys = [r["key"] for r in rows[1:]]
    assert keys == [a[0] for a in POWER_APPLIANCES]


def test_fmt_hm():
    assert _fmt_hm(18.666) == "18h 40m"
    assert _fmt_hm(0) == "0h 00m"
    assert _fmt_hm(2.25) == "2h 15m"
