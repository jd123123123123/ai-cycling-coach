"""The engine may notice the athlete's threshold moved — and must ask.

Audit §7.1: nothing wrote `ftp_watts` from the model, so the unit every other
number is measured in only ever changed when somebody typed it. The rule the
athlete set: propose when there is evidence, show the evidence, ask.
"""
from __future__ import annotations

from datetime import date

import pytest

from app.services.threshold_proposal import (
    MIN_CHANGE_PCT,
    build_proposal,
)

TEST_DAY = date(2026, 8, 20)


def _strong_test(watts: float):
    """A 20-minute effort implying `watts` threshold."""
    return watts / 0.95


class TestItProposesOnRealEvidence:
    def test_a_test_effort_raises_a_proposal(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(280),
                           best_20min_on=TEST_DAY)
        assert p is not None
        assert p.proposed_watts == 280
        assert p.direction == "up"
        assert p.delta_watts == 30

    def test_the_model_alone_can_raise_one(self):
        p = build_proposal(current_ftp=250, eftp_w=278.0, cp_se_w=6.0,
                           cp_identifiable=True, model_rides=20)
        assert p is not None
        assert p.proposed_watts == 278

    def test_both_estimators_agreeing_is_high_confidence(self):
        p = build_proposal(
            current_ftp=250, best_20min_w=_strong_test(280), best_20min_on=TEST_DAY,
            eftp_w=277.0, cp_se_w=5.0, cp_identifiable=True, model_rides=20,
        )
        assert p.confidence == "high"
        assert {e.kind for e in p.evidence} == {"test_effort", "model"}

    def test_one_estimator_alone_is_only_moderate(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(280),
                           best_20min_on=TEST_DAY)
        assert p.confidence == "moderate"

    def test_the_test_effort_wins_when_both_speak(self):
        # A measurement of the thing itself beats an inference from the curve.
        p = build_proposal(
            current_ftp=250, best_20min_w=_strong_test(280), best_20min_on=TEST_DAY,
            eftp_w=274.0, cp_se_w=5.0, cp_identifiable=True, model_rides=20,
        )
        assert p.proposed_watts == 280


class TestItStaysQuietWithoutEvidence:
    def test_contradicting_estimators_propose_nothing(self):
        # Two estimators that disagree are not evidence; they are a reason to
        # wait for another ride.
        p = build_proposal(
            current_ftp=250, best_20min_w=_strong_test(300), best_20min_on=TEST_DAY,
            eftp_w=262.0, cp_se_w=5.0, cp_identifiable=True, model_rides=20,
        )
        assert p is None

    def test_an_unidentifiable_fit_may_not_move_anybody(self):
        # A two-point CP fit is exact by construction and proves nothing.
        p = build_proposal(current_ftp=250, eftp_w=280.0, cp_se_w=2.0,
                           cp_identifiable=False, model_rides=20)
        assert p is None

    def test_a_loose_fit_may_not_either(self):
        p = build_proposal(current_ftp=250, eftp_w=280.0, cp_se_w=40.0,
                           cp_identifiable=True, model_rides=20)
        assert p is None

    def test_too_few_rides_behind_the_model(self):
        p = build_proposal(current_ftp=250, eftp_w=280.0, cp_se_w=5.0,
                           cp_identifiable=True, model_rides=3)
        assert p is None

    def test_a_change_inside_the_noise_is_not_worth_interrupting_for(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(254),
                           best_20min_on=TEST_DAY)
        assert p is None

    def test_no_evidence_at_all(self):
        assert build_proposal(current_ftp=250) is None

    def test_no_current_threshold_means_nothing_to_compare(self):
        assert build_proposal(current_ftp=None, best_20min_w=350.0) is None


class TestSayingNoIsRespected:
    def test_a_dismissed_number_is_not_raised_again(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(280),
                           best_20min_on=TEST_DAY, dismissed_watts=280)
        assert p is None

    def test_but_a_genuinely_new_number_still_is(self):
        # Dismissing 280 must not silence the app forever — 300 is new news.
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(300),
                           best_20min_on=TEST_DAY, dismissed_watts=280)
        assert p is not None
        assert p.proposed_watts == 300


class TestTheCopyMatchesTheMoment:
    def test_an_increase_is_celebrated(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(280),
                           best_20min_on=TEST_DAY)
        assert p.headline_de == "Du bist stärker geworden."
        assert "stärker" in p.headline_de

    def test_a_decrease_is_never_framed_as_failure(self):
        p = build_proposal(current_ftp=280, best_20min_w=_strong_test(250),
                           best_20min_on=TEST_DAY)
        assert p.direction == "down"
        # It explains WHY thresholds fall and what the cost of not fixing it is,
        # rather than scolding.
        assert "Krankheit" in p.body_de or "Pause" in p.body_de
        for word in ("schlecht", "verloren", "Rückschritt", "versagt"):
            assert word not in p.body_de

    def test_the_evidence_is_shown_not_just_the_number(self):
        p = build_proposal(
            current_ftp=250, best_20min_w=_strong_test(280), best_20min_on=TEST_DAY,
            eftp_w=277.0, cp_se_w=5.0, cp_identifiable=True, model_rides=20,
        )
        joined = " ".join(e.de for e in p.evidence)
        assert "20-Minuten" in joined      # the effort itself
        assert "20 Fahrten" in joined      # how much the model rests on
        assert "0,95" in joined            # the coefficient, stated

    def test_it_says_what_accepting_will_change(self):
        p = build_proposal(current_ftp=250, best_20min_w=_strong_test(280),
                           best_20min_on=TEST_DAY)
        assert "Zonen" in p.body_de
        assert "zones" in p.body_en


class TestTheThresholdsAreCoherent:
    def test_the_minimum_change_is_a_real_percentage(self):
        assert MIN_CHANGE_PCT > 0
        # A 3% move on a 250 W athlete is 7.5 W — comfortably outside power
        # meter noise, which is the point.
        assert 250 * MIN_CHANGE_PCT / 100 > 5
