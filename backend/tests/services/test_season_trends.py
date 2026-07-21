"""Tests for the season-trends builder (season_trends).

Pure functions only — the async composer is exercised via the API test. These
cover the two view-specific derivations the Progress surface adds: contiguous
monthly bucket assembly (with honest None gaps) and the first-vs-latest metric
summary (including the empty-athlete case).
"""
from __future__ import annotations

from app.services.season_trends import build_points, metric_summary


class TestBuildPoints:
    def test_empty_athlete_yields_no_points(self):
        assert build_points(2026, {}, {}, {}, {}) == []

    def test_span_covers_first_to_last_month_with_any_metric(self):
        # VO₂max only in May+Jul, p20 only in Jun → span May..Jul, contiguous.
        pts = build_points(
            2026,
            vo2_by_month={5: 50.6, 7: 54.1},
            weight_by_month={},
            durability_by_month={},
            p20_by_month={6: 240.0},
        )
        assert [p["month"] for p in pts] == ["2026-05", "2026-06", "2026-07"]
        # Honest gaps: June has no VO₂max, May/Jul have no p20.
        by_month = {p["month"]: p for p in pts}
        assert by_month["2026-05"]["vo2max"] == 50.6
        assert by_month["2026-06"]["vo2max"] is None
        assert by_month["2026-06"]["p20min_w"] == 240
        assert by_month["2026-05"]["p20min_w"] is None
        assert by_month["2026-07"]["vo2max"] == 54.1

    def test_localized_month_labels(self):
        pts = build_points(2026, {3: 51.0}, {}, {}, {})
        assert pts[0]["month_en"] == "Mar"
        assert pts[0]["month_de"] == "Mär"

    def test_p20_is_integer_rounded(self):
        pts = build_points(2026, {}, {}, {}, {5: 221.28})
        assert pts[0]["p20min_w"] == 221
        assert isinstance(pts[0]["p20min_w"], int)


class TestMetricSummary:
    def test_first_vs_latest_delta(self):
        pts = build_points(2026, {5: 50.6, 6: 51.5, 7: 54.1}, {}, {}, {})
        s = metric_summary(pts, "vo2max")
        assert s["first"] == 50.6
        assert s["latest"] == 54.1
        assert s["delta"] == 3.5
        assert s["n_points"] == 3
        assert s["lower_is_better"] is False

    def test_empty_metric_is_honest(self):
        pts = build_points(2026, {5: 50.6}, {}, {}, {})
        s = metric_summary(pts, "weight_kg", lower_is_better=True)
        assert s == {
            "first": None, "latest": None, "delta": None,
            "n_points": 0, "lower_is_better": True,
        }

    def test_p20_delta_stays_integer(self):
        pts = build_points(2026, {}, {}, {}, {1: 160.0, 7: 244.0})
        s = metric_summary(pts, "p20min_w")
        assert s["delta"] == 84
        assert isinstance(s["delta"], int)

    def test_lower_is_better_flag_passthrough(self):
        pts = build_points(2026, {}, {}, {5: 6.3, 7: 4.1}, {})
        s = metric_summary(pts, "durability_pct", lower_is_better=True)
        assert s["delta"] == -2.2
        assert s["lower_is_better"] is True
