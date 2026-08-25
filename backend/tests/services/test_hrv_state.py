"""The single HRV state estimator — one computation, consumed everywhere.

Closes four audit findings at once (docs/training-engine-scientific-audit-2026-08.md):
  §4.1 the recent window was nested inside its own baseline
  §4.2 a 7-day MEAN was tested against the spread of SINGLES
  §4.3 two different statistics were tested against one threshold, silently
  §6.2 three modules each built their own HRV construct and could disagree
"""
from __future__ import annotations

import math
from datetime import date, timedelta

import pytest

from app.services.hrv_state import HRV_BASELINE_DAYS, HRV_RECENT_DAYS, estimate_hrv_state


def _series(today: date, values_by_age: dict[int, float]) -> list[tuple[date, float]]:
    """(day, raw RMSSD) pairs keyed by how many days ago the reading is."""
    return [(today - timedelta(days=age), v) for age, v in sorted(values_by_age.items())]


def _steady(today: date, *, n: int = 40, value: float = 50.0, jitter: float = 2.0):
    """A settled athlete: alternating ±jitter so the SD is real but small."""
    return _series(today, {a: value + (jitter if a % 2 else -jitter) for a in range(n)})


def _ref(today: date, *, value: float = 50.0, jitter: float = 2.0, start: int = HRV_RECENT_DAYS, end: int = 40):
    """A realistic reference window — never perfectly flat. A stuck sensor
    (zero dispersion) is deliberately 'unknown', so fixtures must jitter."""
    return {a: value + (jitter if a % 2 else -jitter) for a in range(start, end)}


class TestBaselineIsNotNested:
    def test_baseline_excludes_the_recent_window(self):
        today = date(2026, 8, 25)
        # Flat 50 in the baseline period; the last 7 days crash to 30.
        rows = _series(today, {**_ref(today), **{a: 30.0 for a in range(HRV_RECENT_DAYS)}})
        st = estimate_hrv_state(rows, today=today)
        # A nested baseline would be dragged toward 30 by the crash. A clean one
        # sits at the reference period's own level.
        assert st.ln_baseline == pytest.approx(math.log(50.0), abs=0.01)
        assert st.state == "below"

    def test_a_sustained_suppression_cannot_normalise_itself_away(self):
        """The bias that mattered: with a nested baseline, a long suppression
        drags its own reference down and stops being detectable."""
        today = date(2026, 8, 25)
        # 21 days of baseline at 50, then 7 suppressed days at 40.
        rows = _series(today, {**_ref(today), **{a: 40.0 for a in range(HRV_RECENT_DAYS)}})
        assert estimate_hrv_state(rows, today=today).state == "below"


class TestVarianceCorrectness:
    def test_reports_both_the_convention_and_the_variance_correct_test(self):
        today = date(2026, 8, 25)
        st = estimate_hrv_state(_steady(today), today=today)
        # The literature convention (mean vs baseline ± 0.5 x DAILY sd) drives
        # the state, so behaviour is a faithful replication...
        assert st.state in {"below", "in", "above"}
        # ...and the variance-correct statistic is reported alongside it, so the
        # two can be compared on real athletes instead of argued about.
        assert st.z_mean is not None
        assert st.se_recent is not None
        assert st.se_recent < st.baseline_sd  # SE of a mean is smaller than daily SD

    def test_se_shrinks_as_the_week_fills_in(self):
        today = date(2026, 8, 25)
        base = _ref(today)
        sparse = estimate_hrv_state(
            _series(today, {**base, 0: 48.0, 1: 52.0, 2: 48.0}), today=today)
        full = estimate_hrv_state(
            _series(today, {**base, **{a: 50.0 + (2.0 if a % 2 else -2.0) for a in range(7)}}),
            today=today)
        assert full.n_recent > sparse.n_recent
        assert full.se_recent < sparse.se_recent


class TestTwoTestsAreNamedNotConflated:
    def test_below_days_counts_daily_values_against_the_daily_band(self):
        today = date(2026, 8, 25)
        rows = _series(today, {
            **_ref(today),
            **{a: 50.0 for a in range(3, HRV_RECENT_DAYS)},
            0: 20.0, 1: 20.0, 2: 50.0,   # two recent days far below
        })
        st = estimate_hrv_state(rows, today=today)
        assert st.below_days == 2

    def test_below_days_is_calendar_days_not_rows(self):
        today = date(2026, 8, 25)
        # Three low readings, but spread across a month — not a three-day streak.
        rows = _series(today, {
            **_ref(today),
            **{a: 50.0 for a in range(1, HRV_RECENT_DAYS)},
            0: 20.0, 12: 20.0, 25: 20.0,
        })
        assert estimate_hrv_state(rows, today=today).below_days == 1


class TestHonestUnknowns:
    def test_stale_readings_are_unknown_never_a_green_light(self):
        today = date(2026, 8, 25)
        rows = _series(today, {a: 50.0 for a in range(5, 40)})  # newest is 5 days old
        st = estimate_hrv_state(rows, today=today)
        assert st.state == "unknown"
        assert st.age_days == 5

    def test_no_readings_at_all(self):
        st = estimate_hrv_state([], today=date(2026, 8, 25))
        assert st.state == "unknown"
        assert st.age_days is None
        assert st.z_mean is None

    def test_too_little_baseline_is_unknown(self):
        today = date(2026, 8, 25)
        rows = _series(today, {0: 50.0, 1: 51.0, 2: 49.0})
        assert estimate_hrv_state(rows, today=today).state == "unknown"

    def test_a_flat_sensor_is_unknown_not_certain(self):
        # A perfectly constant series is a stuck sensor, not a settled athlete.
        # With no dispersion there is no scale to judge against, so the honest
        # answer is "we cannot form a band" — which routes to the TSB fallback
        # and can never green-light.
        today = date(2026, 8, 25)
        rows = _series(today, {a: 50.0 for a in range(40)})
        st = estimate_hrv_state(rows, today=today)
        assert st.state == "unknown"
        assert st.baseline_sd == 0.0


class TestOneConstructForEveryConsumer:
    def test_exposes_the_percent_delta_the_rails_and_composite_need(self):
        today = date(2026, 8, 25)
        rows = _series(today, {**_ref(today), **{a: 45.0 for a in range(HRV_RECENT_DAYS)}})
        st = estimate_hrv_state(rows, today=today)
        # -10% on the raw scale, computed from the SAME window policy as the
        # band state — so the rails and the band can no longer disagree about
        # which readings they are describing.
        assert st.delta_pct == pytest.approx(-10.0, abs=0.6)

    def test_cv_comes_from_the_same_window_as_the_mean(self):
        today = date(2026, 8, 25)
        st = estimate_hrv_state(_steady(today), today=today)
        assert st.cv_pct is not None and st.cv_pct > 0

    def test_baseline_window_is_the_documented_length(self):
        assert HRV_BASELINE_DAYS > HRV_RECENT_DAYS


# ─── The durability comparison must compare like with like ─────────────────
# `decoupling_delta = latest - median(prior)` pitted one ride against the median
# of every other ride, whatever its length. Aerobic decoupling scales with
# duration, heat and fuelling, so a five-hour hot endurance ride measured
# against a month of one-hour sessions reports the weather, not the athlete.
# The sound metric (post-kJ power drop, `durability.py`) is not persisted yet,
# so the confound is controlled instead of ignored: only rides of comparable
# WORK are eligible, and when none exist the answer is "no reading".

from app.services.adaptive_readiness import decoupling_delta_matched


def _mixed_week():
    """A realistic week: one long ride, three comparable long ones, and a pile
    of short sessions. The short rides OUTNUMBER the long ones — which is
    exactly why the unmatched median landed among them and why the bias
    existed."""
    return [
        (6.0, 900.0),                                    # latest: long ride, 6%
        (9.0, 950.0), (9.5, 880.0), (8.5, 1000.0),       # comparable long rides
        (2.0, 200.0), (2.2, 180.0), (1.9, 220.0),        # short sessions
        (2.1, 190.0), (2.3, 210.0),
    ]


class TestDecouplingIsMatchedOnWork:
    def test_compares_only_rides_of_similar_work(self):
        # Latest: a 900 kJ ride at 6% decoupling. The short rides sit at 2% and
        # must not drag the baseline down; the comparable long ones sit at 9%,
        # so this ride is an IMPROVEMENT, not a decline.
        rows = _mixed_week()
        assert decoupling_delta_matched(rows) < 0

    def test_the_unmatched_version_would_have_got_it_backwards(self):
        rows = _mixed_week()
        naive = rows[0][0] - sorted(v for v, _ in rows[1:])[len(rows[1:]) // 2]
        assert naive > 0                       # "durability worsening"
        assert decoupling_delta_matched(rows) < 0   # actually improving

    def test_no_comparable_rides_means_no_reading(self):
        rows = [(6.0, 900.0), (2.0, 200.0), (2.2, 180.0), (1.9, 220.0)]
        assert decoupling_delta_matched(rows) is None

    def test_too_few_rides_means_no_reading(self):
        assert decoupling_delta_matched([(6.0, 900.0)]) is None
        assert decoupling_delta_matched([]) is None

    def test_missing_work_values_are_not_guessed(self):
        rows = [(6.0, None), (9.0, 950.0), (9.5, 880.0), (8.5, 1000.0)]
        assert decoupling_delta_matched(rows) is None
