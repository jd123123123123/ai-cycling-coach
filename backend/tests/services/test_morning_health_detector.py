"""Tests for the morning-health early-warning detector.

Coverage matrix (per the feature spec):
  * normal vitals            → none
  * illness cluster          → elevated / high
  * single mild deviation    → none (a lone dip is not a warning)
  * insufficient baseline    → none
  * recommendation wording keyed to the actual deviating signals
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.morning_health_detector import detect_morning_health


def _series(n: int, *, rhr=48, hrv=65, resp=13.0, spo2=96.0, sleep=82):
    """Build `n` days of steady baseline readings ending yesterday."""
    start = date.today() - timedelta(days=n)
    return [
        {
            "date": start + timedelta(days=i),
            "rhr": rhr, "hrv": hrv, "respiration": resp, "spo2": spo2, "sleep_score": sleep,
        }
        for i in range(n)
    ]


def _today(**over):
    d = {"date": date.today(), "rhr": 48, "hrv": 65, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82}
    d.update(over)
    return d


class TestNormal:
    def test_steady_normal_vitals_return_none(self):
        daily = _series(20) + [_today()]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["signals"] == []
        assert out["recommendation_de"] is None

    def test_empty_history_returns_none(self):
        out = detect_morning_health([])
        assert out["level"] == "none"


class TestInsufficientBaseline:
    def test_too_few_days_returns_none_not_a_guess(self):
        # Only 3 prior days — below the 5-reading minimum for RHR + HRV.
        daily = _series(3) + [_today(rhr=60, hrv=40, respiration=16.0)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["signals"] == []

    def test_no_baseline_when_prior_metrics_all_missing(self):
        prior = [
            {"date": date.today() - timedelta(days=i), "rhr": None, "hrv": None,
             "respiration": None, "spo2": None, "sleep_score": None}
            for i in range(10, 0, -1)
        ]
        out = detect_morning_health(prior + [_today(rhr=70, hrv=30)])
        assert out["level"] == "none"


class TestSingleMildDeviation:
    def test_single_mild_rhr_bump_is_not_a_warning(self):
        # RHR +5 only (mild), everything else normal → none.
        daily = _series(20) + [_today(rhr=53)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"

    def test_lone_poor_sleep_night_is_not_illness(self):
        daily = _series(20) + [_today(sleep_score=45)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"

    def test_single_mild_hrv_dip_is_not_a_warning(self):
        # HRV −11% (just over mild), nothing else → none (needs a cluster).
        daily = _series(20) + [_today(hrv=57)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"


class TestCluster:
    def test_classic_illness_cluster_is_high(self):
        # RHR +7, HRV −30%, respiration +3 — the full acute-infection triad.
        daily = _series(20) + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        assert out["level"] == "high"
        metrics = {s["metric"] for s in out["signals"]}
        assert {"resting_hr", "hrv", "respiration"} <= metrics

    def test_two_marker_cluster_is_elevated(self):
        # RHR +6 (mild) + HRV −14% (mild) — two core markers, neither strong.
        daily = _series(20) + [_today(rhr=54, hrv=56)]
        out = detect_morning_health(daily)
        assert out["level"] == "elevated"

    def test_strong_single_core_plus_corroborator_is_elevated(self):
        # HRV −25% (strong) + low SpO₂ corroboration.
        daily = _series(20) + [_today(hrv=48, spo2=93.0)]
        out = detect_morning_health(daily)
        assert out["level"] == "elevated"

    def test_strong_single_core_alone_is_watch(self):
        # RHR +8 (strong) but nothing else deviates → watch, not elevated.
        daily = _series(20) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        assert out["level"] == "watch"


class TestRecommendationWording:
    def test_high_recommendation_cites_the_deviating_markers(self):
        daily = _series(20) + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        de = out["recommendation_de"]
        en = out["recommendation_en"]
        # The German copy names the real markers and stays non-diagnostic.
        assert "Ruhepuls" in de and "HRV" in de
        assert "+7" in de  # RHR delta bpm
        assert "−" in de and "%" in de  # HRV percent drop, minus-sign formatted
        assert "Arzt" in de or "Ärztin" in de  # high tier suggests a doctor check
        assert "resting HR" in en and "HRV" in en

    def test_elevated_recommendation_mentions_easy_or_rest(self):
        daily = _series(20) + [_today(rhr=54, hrv=56)]
        out = detect_morning_health(daily)
        assert "locker" in out["recommendation_de"] or "Ruhe" in out["recommendation_de"]
        assert out["headline_de"] is not None

    def test_watch_recommendation_is_gentle(self):
        daily = _series(20) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        assert "leichten Tag" in out["recommendation_de"] or "beobachte" in out["recommendation_de"]

    def test_signals_carry_value_baseline_and_severity(self):
        daily = _series(20) + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        assert rhr["value"] == 55
        assert rhr["baseline"] == 48
        assert rhr["direction"] == "up"
        assert rhr["severity"] == "strong"
        assert rhr["delta"] == 7.0


class TestOpportunityInsufficientData:
    def test_single_good_day_is_not_a_story(self):
        # Today's RHR is well below baseline, but YESTERDAY was ordinary —
        # the improvement has not been sustained, so this must not fire.
        daily = _series(20) + [_today(rhr=40)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["polarity"] is None

    def test_too_few_days_for_the_sustain_window_is_none(self):
        daily = _series(1) + [_today(rhr=40)]
        out = detect_morning_health(daily)
        assert out["level"] == "none"
        assert out["polarity"] is None


class TestOpportunityCluster:
    def test_sustained_rhr_and_hrv_improvement_is_high(self):
        # Two days running: RHR clearly below baseline (48 -> 40) AND HRV
        # clearly above baseline (65 -> 85) — both core markers, both strong.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "high"
        assert out["polarity"] == "opportunity"
        metrics = {s["metric"] for s in out["signals"]}
        assert {"resting_hr", "hrv"} <= metrics

    def test_sustained_mild_two_marker_improvement_is_elevated(self):
        # RHR 48->43 (mild improvement, ~5 below) and HRV 65->72 (mild, ~11%
        # above) held for two days.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 43, "hrv": 72, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=43, hrv=72),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "elevated"
        assert out["polarity"] == "opportunity"

    def test_single_marker_alone_is_watch_not_elevated(self):
        # Only RHR improves (sustained, strong); HRV stays at baseline.
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 39, "hrv": 65, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=39, hrv=65),
        ]
        out = detect_morning_health(daily)
        assert out["level"] == "watch"
        assert out["polarity"] == "opportunity"

    def test_a_recent_illness_signal_still_takes_priority_over_any_improvement(self):
        # RHR is up (illness direction) — even if some other metric looked
        # good, the warning path must win; the two are checked in order and
        # the warning is never silently downgraded to good news.
        daily = _series(20) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        assert out["level"] == "watch"
        assert out["polarity"] == "warning"


class TestOpportunityRecommendationWording:
    def test_high_opportunity_recommendation_is_encouraging_not_alarmed(self):
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85, "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["headline_de"] is not None
        assert "Ruhepuls" in out["recommendation_de"] or "HRV" in out["recommendation_de"]
        # Never medicalized wording on the good-news path.
        assert "Arzt" not in out["recommendation_de"]


class TestSignalSeries:
    def test_warning_signals_carry_their_recent_series(self):
        daily = _series(20) + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        # Enough history exists, so a series is attached, oldest first with
        # today's value last — that ordering is what the sparkline draws.
        assert len(rhr["series"]) >= 7
        assert rhr["series"][-1] == 55

    def test_opportunity_signals_carry_their_recent_series(self):
        daily = _series(19) + [
            {"date": date.today() - timedelta(days=1), "rhr": 40, "hrv": 85,
             "respiration": 13.0, "spo2": 96.0, "sleep_score": 82},
            _today(rhr=40, hrv=85),
        ]
        out = detect_morning_health(daily)
        assert out["polarity"] == "opportunity"
        hrv = next(s for s in out["signals"] if s["metric"] == "hrv")
        assert len(hrv["series"]) >= 7
        assert hrv["series"][-1] == 85

    def test_series_is_empty_when_history_is_too_short_to_imply_a_trend(self):
        # 6 prior days + today = 7 rows, but the RHR baseline needs 5 priors and
        # the series needs 7 usable points; with exactly 7 total this is the
        # boundary — assert the rule holds rather than a specific count.
        daily = _series(6) + [_today(rhr=56)]
        out = detect_morning_health(daily)
        for sig in out["signals"]:
            assert sig["series"] == [] or len(sig["series"]) >= 7

    def test_series_preserves_chronological_order_not_just_todays_value_last(self):
        # The other tests in this class fill every prior day with the SAME
        # constant, which means a reversed or shuffled series would satisfy all
        # of them — only today's distinct value sits at a checked index. So this
        # one gives every day a DISTINGUISHABLE resting-HR value and pins the
        # whole list. A reversed series draws a curve that rises while the cited
        # number says the value fell, which no other assertion here can see.
        n = 14
        start = date.today() - timedelta(days=n)
        # 40, 41, 42 … one unique value per day, oldest first.
        prior = [
            {"date": start + timedelta(days=i), "rhr": 40 + i, "hrv": 65,
             "respiration": 13.0, "spo2": 96.0, "sleep_score": 82}
            for i in range(n)
        ]
        # Today jumps well above the trailing baseline, firing the warning path
        # so a resting-HR signal is actually emitted to carry the series.
        daily = prior + [_today(rhr=70, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        # Window is the last 14 rows: the last 13 priors (41..53) then today.
        expected = [40 + i for i in range(1, n)] + [70]
        assert rhr["series"] == expected
        # Stated separately so a failure reads unambiguously as an ORDER problem
        # rather than a windowing one.
        assert rhr["series"] == sorted(rhr["series"]), "series must be oldest-first"

    def test_series_skips_missing_readings_rather_than_emitting_nulls(self):
        prior = _series(20)
        prior[5]["rhr"] = None
        prior[9]["rhr"] = None
        daily = prior + [_today(rhr=55, hrv=45, respiration=16.0)]
        out = detect_morning_health(daily)
        rhr = next(s for s in out["signals"] if s["metric"] == "resting_hr")
        # A sparkline cannot draw a null; gaps are omitted, not zero-filled
        # (a zero would render as a cliff to the floor of the chart).
        assert all(isinstance(v, (int, float)) for v in rhr["series"])
