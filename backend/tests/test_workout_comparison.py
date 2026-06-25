"""Unit tests for the pure workout-comparison core."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.workout_comparison import (
    normalize_title, rep_from_activity, build_trend, pick_headline,
    group_activities, build_group_summary, build_group_detail,
)


def _act(**kw):
    base = dict(
        id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), title="Zwift - Rønnestad",
        sport="cycling", duration_seconds=3600, distance_meters=30000.0, tss=70.0,
        average_power=200.0, normalized_power=210.0, average_hr=150, max_hr=175,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_normalize_strips_platform_prefix_and_counter():
    assert normalize_title("Zwift - Breakfast Returns (1)") == "breakfast returns"
    assert normalize_title("ROUVY - IRONMAN 70.3") == "ironman 70.3"
    assert normalize_title("  Zwift -  Aerobic   Forge ") == "aerobic forge"


def test_normalize_none_and_blank():
    assert normalize_title(None) is None
    assert normalize_title("   ") is None


def test_normalize_plain_title_unchanged():
    assert normalize_title("Berlin Laufen") == "berlin laufen"


def test_rep_efficiency_and_pace():
    rep = rep_from_activity(_act(normalized_power=210.0, average_hr=150,
                                 duration_seconds=3600, distance_meters=30000.0))
    assert rep.efficiency_factor == round(210.0 / 150, 3)
    assert rep.pace_s_per_km == round(3600 / 30.0, 1)


def test_rep_missing_power_or_hr_yields_none_efficiency():
    rep = rep_from_activity(_act(normalized_power=None, average_power=None))
    assert rep.efficiency_factor is None


def test_build_trend_direction_and_delta():
    up = build_trend("avg_power", [200.0, 220.0], improving_up=True)
    assert up.delta == 20.0 and up.pct == 10.0 and up.improving is True
    down = build_trend("pace", [300.0, 280.0], improving_up=False)
    assert down.improving is True  # pace dropped → better
    none = build_trend("np", [None, 200.0], improving_up=True)
    assert none.improving is None  # < 2 real points


def test_grouping_buckets_normalized_titles():
    acts = [_act(id=1, title="Zwift - Forge"), _act(id=2, title="Forge"),
            _act(id=3, title="Berlin Laufen")]
    groups = group_activities(acts)
    assert sorted((k, len(v)) for k, v in groups.items()) == [("berlin laufen", 1), ("forge", 2)]


def test_summary_count_dates_and_headline():
    a1 = _act(id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
              normalized_power=200.0, average_hr=160)
    a2 = _act(id=2, started_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
              normalized_power=220.0, average_hr=160)
    s = build_group_summary("forge", [a1, a2])
    assert s.count == 2 and s.first_date == "2026-01-01" and s.last_date == "2026-02-01"
    assert s.headline.text.startswith("Efficiency") and s.headline.tone == "good"


def test_detail_orders_reps_oldest_to_newest_with_trends():
    a1 = _act(id=1, started_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
    a2 = _act(id=2, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    d = build_group_detail("forge", [a1, a2])
    assert [r.activity_id for r in d.reps] == [2, 1]  # oldest first
    assert {t.metric for t in d.trends} == {"efficiency", "avg_power", "np", "avg_hr", "pace", "tss"}


def test_headline_falls_back_to_count_when_no_metrics():
    a1 = _act(id=1, average_power=None, normalized_power=None, average_hr=None, distance_meters=None)
    a2 = _act(id=2, average_power=None, normalized_power=None, average_hr=None, distance_meters=None)
    s = build_group_summary("x", [a1, a2])
    assert s.headline.text == "2× logged" and s.headline.tone == "neutral"
