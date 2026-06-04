"""Unit tests for the period_report pure scoring core."""
from __future__ import annotations

from app.services.period_report import (
    WindowMetrics,
    _clamp,
    _inv_score,
    _lerp_score,
    build_deltas,
    build_milestones,
    build_radar,
    composite_grade,
    letter_for_score,
)


class TestHelpers:
    def test_clamp_bounds(self):
        assert _clamp(-5) == 0.0
        assert _clamp(150) == 100.0
        assert _clamp(42) == 42.0

    def test_lerp_score_maps_range_to_0_100(self):
        assert _lerp_score(0, 0, 10) == 0.0
        assert _lerp_score(10, 0, 10) == 100.0
        assert _lerp_score(5, 0, 10) == 50.0
        assert _lerp_score(-3, 0, 10) == 0.0
        assert _lerp_score(99, 0, 10) == 100.0

    def test_inv_score_is_higher_when_value_lower(self):
        assert _inv_score(0, 0, 10) == 100.0
        assert _inv_score(10, 0, 10) == 0.0
        assert _inv_score(2.5, 0, 10) == 75.0


class TestLetterBanding:
    def test_bands(self):
        assert letter_for_score(95) == "A+"
        assert letter_for_score(91) == "A"
        assert letter_for_score(88) == "A-"
        assert letter_for_score(84) == "B+"
        assert letter_for_score(81) == "B"
        assert letter_for_score(78) == "B-"
        assert letter_for_score(74) == "C+"
        assert letter_for_score(70) == "C"
        assert letter_for_score(66) == "C-"
        assert letter_for_score(50) == "D"

    def test_monotonic_non_increasing_grade(self):
        order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D"]
        last_idx = -1
        for s in range(100, -1, -1):
            idx = order.index(letter_for_score(s))
            assert idx >= last_idx, f"score {s} -> {letter_for_score(s)} broke ordering"
            last_idx = idx


def _full_window(**over) -> WindowMetrics:
    """A WindowMetrics with healthy defaults; override per test."""
    base = dict(
        days=7, pmc_days=7,
        avg_ctl=50.0, ctl_delta=4.0, avg_tsb=-5.0,
        total_tss=500.0, activity_count=5, training_days=5, longest_streak=3,
        avg_if=0.72, avg_ef=1.5, avg_decoupling=4.0, grey_pct=10.0,
        avg_hrv=60.0, avg_rhr=50.0, avg_sleep_hours=7.5,
        sleep_debt_hours=1.0, biometric_days=7,
    )
    base.update(over)
    return WindowMetrics(**base)


class TestRadar:
    def test_full_data_all_axes_scored(self):
        axes = build_radar(_full_window(), _full_window())
        keys = {a.key for a in axes}
        assert keys == {"aerobic", "recovery", "consistency", "intensity", "durability"}
        assert all(a.score is not None and not a.insufficient_data for a in axes)

    def test_no_pmc_marks_aerobic_insufficient(self):
        cur = _full_window(pmc_days=0, avg_ctl=None, ctl_delta=None)
        axis = next(a for a in build_radar(cur, _full_window()) if a.key == "aerobic")
        assert axis.insufficient_data is True
        assert axis.score is None

    def test_no_activities_marks_intensity_and_durability_insufficient(self):
        cur = _full_window(activity_count=0, avg_if=None, avg_decoupling=None, grey_pct=None)
        axes = {a.key: a for a in build_radar(cur, _full_window())}
        assert axes["intensity"].insufficient_data is True
        assert axes["durability"].insufficient_data is True

    def test_climbing_fitness_scores_higher_than_detraining(self):
        up = next(a for a in build_radar(_full_window(ctl_delta=6.0), None) if a.key == "aerobic")
        down = next(a for a in build_radar(_full_window(ctl_delta=-6.0), None) if a.key == "aerobic")
        assert up.score > down.score

    def test_more_grey_zone_lowers_intensity(self):
        clean = next(a for a in build_radar(_full_window(grey_pct=5.0), None) if a.key == "intensity")
        junk = next(a for a in build_radar(_full_window(grey_pct=35.0), None) if a.key == "intensity")
        assert clean.score > junk.score


class TestComposite:
    def test_grade_from_axes(self):
        score, letter = composite_grade(build_radar(_full_window(), _full_window()))
        assert 0 <= score <= 100
        assert letter == letter_for_score(score)

    def test_renormalizes_over_available_axes(self):
        cur = _full_window(pmc_days=0, avg_ctl=None, ctl_delta=None)
        score, letter = composite_grade(build_radar(cur, _full_window()))
        assert score is not None

    def test_empty_window_returns_low_score(self):
        empty = WindowMetrics(
            days=7, pmc_days=0, avg_ctl=None, ctl_delta=None, avg_tsb=None,
            total_tss=0.0, activity_count=0, training_days=0, longest_streak=0,
            avg_if=None, avg_ef=None, avg_decoupling=None, grey_pct=None,
            avg_hrv=None, avg_rhr=None, avg_sleep_hours=None,
            sleep_debt_hours=None, biometric_days=0,
        )
        score, letter = composite_grade(build_radar(empty, None))
        assert score is not None
        assert score < 40


class TestDeltas:
    def test_significant_ctl_gain_is_improvement(self):
        cur = _full_window(avg_ctl=54.0)
        prev = _full_window(avg_ctl=50.0)
        imp, weak = build_deltas(cur, prev)
        assert any(i.key == "ctl" and i.is_improvement for i in imp)

    def test_tiny_ctl_change_is_filtered(self):
        cur = _full_window(avg_ctl=50.5)
        prev = _full_window(avg_ctl=50.0)
        imp, weak = build_deltas(cur, prev)
        assert not any(i.key == "ctl" for i in imp + weak)

    def test_rising_rhr_is_weakness(self):
        cur = _full_window(avg_rhr=55.0)
        prev = _full_window(avg_rhr=50.0)
        imp, weak = build_deltas(cur, prev)
        assert any(w.key == "rhr" and not w.is_improvement for w in weak)

    def test_falling_decoupling_is_improvement(self):
        cur = _full_window(avg_decoupling=2.0)
        prev = _full_window(avg_decoupling=6.0)
        imp, weak = build_deltas(cur, prev)
        assert any(i.key == "decoupling" and i.is_improvement for i in imp)

    def test_no_previous_window_returns_empty(self):
        imp, weak = build_deltas(_full_window(), None)
        assert imp == [] and weak == []


class TestMilestones:
    def test_streak_milestone_when_streak_long(self):
        ms = build_milestones(_full_window(longest_streak=5))
        assert any(m.icon_key == "flame" for m in ms)

    def test_no_streak_milestone_for_short_streak(self):
        ms = build_milestones(_full_window(longest_streak=1))
        assert not any(m.icon_key == "flame" for m in ms)

    def test_big_load_milestone(self):
        ms = build_milestones(_full_window(total_tss=900.0))
        assert any(m.icon_key == "zap" for m in ms)

    def test_empty_window_no_milestones(self):
        ms = build_milestones(_full_window(
            longest_streak=0, total_tss=0.0, training_days=0, activity_count=0))
        assert ms == []
