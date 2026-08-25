"""TSS is measured in units nobody recorded — audit §7.2.

The key property under test is that the history is not lost: the scoring
threshold can be RECOVERED exactly by inverting the formula that produced the
stored number.
"""
from __future__ import annotations

import pytest

from app.services.load_units import (
    derive_scoring_ftp,
    rebase_tss,
    threshold_drift,
)
from app.services.training_load import calculate_cycling_tss


class TestRecoveryIsExactNotEstimated:
    @pytest.mark.parametrize("ftp,np_w,dur", [
        (250.0, 250.0, 3600),      # an hour at threshold — TSS 100 by definition
        (312.0, 268.0, 7200),
        (188.0, 240.0, 1800),
        (401.0, 305.0, 12_600),
    ])
    def test_round_trips_through_the_real_tss_function(self, ftp, np_w, dur):
        # Score a ride the way the app scores it, then recover the threshold.
        tss = calculate_cycling_tss(dur, np_w, ftp)
        assert derive_scoring_ftp(tss, np_w, dur) == pytest.approx(ftp, abs=0.2)

    def test_an_hour_at_threshold_is_100_tss(self):
        # Sanity anchor: if this drifts, the recovery arithmetic is wrong too.
        assert calculate_cycling_tss(3600, 250.0, 250.0) == pytest.approx(100.0, abs=0.01)

    def test_implausible_results_are_refused_not_stored(self):
        # An hrTSS ride has no FTP behind its number. Inventing one would
        # corrupt every re-basing that followed.
        assert derive_scoring_ftp(tss=100.0, normalized_power=15.0, duration_seconds=3600) is None
        assert derive_scoring_ftp(tss=1.0, normalized_power=300.0, duration_seconds=3600) is None

    def test_missing_inputs_give_no_answer(self):
        assert derive_scoring_ftp(None, 250.0, 3600) is None
        assert derive_scoring_ftp(100.0, None, 3600) is None
        assert derive_scoring_ftp(100.0, 250.0, None) is None
        assert derive_scoring_ftp(0.0, 250.0, 3600) is None


class TestRebasing:
    def test_the_same_ride_scores_lower_against_a_higher_threshold(self):
        # This IS the drift the audit described: identical work, different unit.
        scored_at_250 = calculate_cycling_tss(3600, 250.0, 250.0)   # 100
        rebased = rebase_tss(scored_at_250, 250.0, 275.0)
        assert rebased < scored_at_250
        # And it matches scoring the ride against the new threshold directly.
        assert rebased == pytest.approx(calculate_cycling_tss(3600, 250.0, 275.0), abs=0.01)

    def test_rebasing_to_the_same_threshold_changes_nothing(self):
        assert rebase_tss(100.0, 250.0, 250.0) == pytest.approx(100.0)

    def test_an_unlabelled_tss_is_left_alone_not_guessed(self):
        # Converting with an unknown unit is worse than not converting.
        assert rebase_tss(100.0, None, 275.0) == 100.0
        assert rebase_tss(100.0, 250.0, None) == 100.0

    def test_a_ten_percent_threshold_gain_is_a_twenty_percent_load_shift(self):
        # Why "CTL 85 in March" and "CTL 85 in August" are not the same training.
        rebased = rebase_tss(100.0, 250.0, 275.0)
        assert 82.0 < rebased < 84.0   # ≈ (250/275)² = 0.826


class TestDriftIsReportable:
    def test_a_stable_season_is_comparable(self):
        d = threshold_drift([250.0, 251.0, 250.0, 252.0])
        assert d.spread_pct == pytest.approx(0.8, abs=0.05)
        assert d.comparable is True

    def test_a_season_of_real_improvement_is_not(self):
        d = threshold_drift([250.0, 265.0, 280.0])
        assert d.spread_pct == pytest.approx(12.0, abs=0.05)
        assert d.comparable is False
        assert d.min_ftp == 250.0 and d.max_ftp == 280.0

    def test_counts_what_it_could_not_label(self):
        d = threshold_drift([250.0, None, None, 255.0])
        assert d.labelled == 2
        assert d.unlabelled == 2

    def test_nothing_labelled_makes_no_claim(self):
        d = threshold_drift([None, None])
        assert d.spread_pct is None
        assert d.comparable is False
        assert d.labelled == 0

    def test_a_single_ride_is_not_a_trend(self):
        d = threshold_drift([250.0])
        assert d.spread_pct is None
        assert d.comparable is False


class TestTheWritePathRecordsTheUnit:
    """A stored TSS with a NULL unit is exactly the state this work exists to
    end. If `_scoring_ftp` quietly returns None for ordinary power rides, the
    column fills with nulls and nothing downstream can re-base — so the write
    path is pinned here, not just the arithmetic."""

    def _data(self, np_w, dur, sport="cycling"):
        from types import SimpleNamespace
        return SimpleNamespace(
            normalized_power=np_w, average_power=None,
            duration_seconds=dur, sport=sport,
        )

    def test_a_power_ride_records_the_threshold_it_was_scored_against(self):
        from app.services.activity_service import _scoring_ftp
        from types import SimpleNamespace

        profile = SimpleNamespace(ftp_watts=250)
        tss = calculate_cycling_tss(3600, 260.0, 250.0)
        assert _scoring_ftp(self._data(260.0, 3600), profile, tss) == pytest.approx(250.0, abs=0.2)

    def test_falls_back_to_average_power_the_way_scoring_does(self):
        from app.services.activity_service import _scoring_ftp
        from types import SimpleNamespace

        data = SimpleNamespace(normalized_power=None, average_power=240.0,
                               duration_seconds=3600, sport="cycling")
        tss = calculate_cycling_tss(3600, 240.0, 250.0)
        assert _scoring_ftp(data, SimpleNamespace(ftp_watts=250), tss) == pytest.approx(250.0, abs=0.2)

    def test_an_hr_scored_ride_records_no_unit(self):
        # hrTSS has no FTP behind it. Labelling it with the athlete's current
        # FTP would be a fabricated unit that corrupts every later re-basing.
        from app.services.activity_service import _scoring_ftp
        from types import SimpleNamespace

        data = SimpleNamespace(normalized_power=None, average_power=None,
                               duration_seconds=3600, sport="cycling")
        assert _scoring_ftp(data, SimpleNamespace(ftp_watts=250), 65.0) is None

    def test_no_tss_means_no_unit(self):
        from app.services.activity_service import _scoring_ftp
        from types import SimpleNamespace

        assert _scoring_ftp(self._data(260.0, 3600), SimpleNamespace(ftp_watts=250), None) is None
