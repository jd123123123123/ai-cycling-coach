"""Unit tests for weekly_wrapped pure helpers.

Synthetic Activity fixtures only — the pure transforms (day series, ride score,
peak-power comparison, hh:mm formatting) carry the honesty contract: sparse
inputs degrade to None, never to fabricated numbers.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

import app.services.weekly_wrapped as ww
from app.services.weekly_wrapped import (
    CITY_PAIRS,
    POWER_APPLIANCES,
    ROUTE_VIEW_H,
    ROUTE_VIEW_W,
    WEEKDAY_KEYS,
    _fmt_hm,
    _parse_flavor_json,
    _peak_power_of,
    daily_effort,
    fallback_city_comparison,
    fallback_saddle_line,
    generate_wrapped_flavor,
    power_comparison,
    project_route,
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


# ── Route projection ─────────────────────────────────────────────────────────


def test_project_route_none_below_two_points():
    assert project_route([], []) is None
    assert project_route([52.5], [13.4]) is None


def test_project_route_points_inside_viewbox_and_aspect_correct():
    # A rough square loop near Berlin.
    lats = [52.50, 52.52, 52.52, 52.50, 52.50]
    lngs = [13.40, 13.40, 13.44, 13.44, 13.40]
    out = project_route(lats, lngs)
    assert out is not None
    assert out["view"] == {"w": ROUTE_VIEW_W, "h": ROUTE_VIEW_H}
    xs = [p[0] for p in out["points"]]
    ys = [p[1] for p in out["points"]]
    # Every projected point lies inside the viewbox.
    assert all(0 <= x <= ROUTE_VIEW_W for x in xs)
    assert all(0 <= y <= ROUTE_VIEW_H for y in ys)
    # Longitude spans twice the latitude here → x extent > y extent (no stretch
    # to a square).
    assert (max(xs) - min(xs)) > (max(ys) - min(ys))


def test_project_route_drops_bad_samples_and_null_island():
    lats = [52.50, "nope", 0.0, 52.52, float("nan")]
    lngs = [13.40, 13.41, 0.0, 13.44, 13.45]
    out = project_route(lats, lngs)
    assert out is not None
    # Only the two clean, non-(0,0) samples survive.
    assert out["n_points"] == 2


def test_project_route_downsamples_and_keeps_last_point():
    lats = [52.50 + i * 1e-4 for i in range(1000)]
    lngs = [13.40 + i * 1e-4 for i in range(1000)]
    out = project_route(lats, lngs, max_points=200)
    assert out is not None
    assert out["n_points"] == 200
    # Last projected point corresponds to the true final sample (bottom-left,
    # since it's the max-lat/max-lng corner → x max, y min-ish); just assert it
    # matches a fresh full projection's endpoint.
    full = project_route(lats, lngs, max_points=10000)
    assert out["points"][-1] == full["points"][-1]


# ── AI-flavour fallbacks (deterministic, no key needed) ──────────────────────


def test_fallback_city_comparison_picks_closest_pair():
    line = fallback_city_comparison(292, de=True)
    # Closest real pair to 292 km is Berlin–Hamburg (290).
    assert "Berlin" in line and "Hamburg" in line
    assert "292" in line


def test_fallback_city_comparison_zero_is_honest():
    assert fallback_city_comparison(0, de=True)
    assert fallback_city_comparison(0, de=False)


def test_city_pairs_are_ordered_and_plausible():
    assert all(km > 0 for _, _, km in CITY_PAIRS)


def test_fallback_saddle_line_varies_by_week_and_is_never_empty():
    a = fallback_saddle_line(6.0, iso_week=10, de=True)
    b = fallback_saddle_line(6.0, iso_week=11, de=True)
    assert a and b and a != b
    assert "6.0" in a
    # Zero saddle time degrades to a kind rest-week line, not a crash.
    assert fallback_saddle_line(0, iso_week=1, de=True)


def test_parse_flavor_json_defensive():
    assert _parse_flavor_json("") is None
    assert _parse_flavor_json("no json here") is None
    ok = _parse_flavor_json('prefix {"cities": " A ", "saddle": "B"} suffix')
    assert ok == {"cities": "A", "saddle": "B"}
    # Missing/blank fields drop out (caller merges over fallback).
    assert _parse_flavor_json('{"cities": "", "saddle": "  "}') is None


@pytest.mark.asyncio
async def test_generate_flavor_falls_back_without_key(monkeypatch):
    monkeypatch.setattr(ww.settings, "ANTHROPIC_API_KEY", None)
    ww._FLAVOR_CACHE.clear()
    out = await generate_wrapped_flavor(
        user_id=1, distance_km=290, saddle_hours=6.0,
        iso_week=10, iso_week_key="2026-W10", lang="de",
    )
    assert "Berlin" in out["cities"] or "Hamburg" in out["cities"]
    assert out["saddle"]


@pytest.mark.asyncio
async def test_generate_flavor_ai_path_parses_and_caches(monkeypatch):
    monkeypatch.setattr(ww.settings, "ANTHROPIC_API_KEY", "sk-test")
    ww._FLAVOR_CACHE.clear()
    calls = {"n": 0}

    class _Block:
        text = '{"cities": "Deine 290 km ≈ Berlin nach Hamburg.", "saddle": "6.0 Stunden — stark."}'

    class _Resp:
        content = [_Block()]

    class _Msgs:
        async def create(self, **_kwargs):
            calls["n"] += 1
            return _Resp()

    class _FakeClient:
        def __init__(self, *_a, **_k):
            self.messages = _Msgs()

    import anthropic
    monkeypatch.setattr(anthropic, "AsyncAnthropic", _FakeClient)

    out = await generate_wrapped_flavor(
        user_id=7, distance_km=290, saddle_hours=6.0,
        iso_week=10, iso_week_key="2026-W10", lang="de",
    )
    assert out["cities"].startswith("Deine 290 km")
    assert out["saddle"].startswith("6.0 Stunden")
    assert calls["n"] == 1
    # Second call for the same week hits the per-process cache (no LLM call).
    again = await generate_wrapped_flavor(
        user_id=7, distance_km=290, saddle_hours=6.0,
        iso_week=10, iso_week_key="2026-W10", lang="de",
    )
    assert again == out
    assert calls["n"] == 1
