"""planned_week_total — THE weekly planned-TSS producer (audit P0-5).

Must include dual-sport secondary rows (run/strength) via the
template_tss_estimate fallback chain, and return None (never 0) when no row
yields an estimate.
"""
from __future__ import annotations

from types import SimpleNamespace

from app.services.mesocycle_generator import (
    _RUN_TSS_PER_MIN_EASY,
    _RUN_TSS_PER_MIN_QUALITY,
    template_tss_estimate,
)
from app.services.run_workout_templates import RUN_TEMPLATES
from app.services.weekly_recap import planned_week_total
from app.services.workout_templates import TEMPLATES


def _row(template_id: str | None, duration: int | None = None) -> SimpleNamespace:
    return SimpleNamespace(template_id=template_id, duration_seconds_target=duration)


class TestTemplateTssEstimate:
    def test_bike_template_uses_base_tss(self):
        assert template_tss_estimate("recovery_60") == float(
            TEMPLATES["recovery_60"].base_tss
        )

    def test_run_easy_template_estimated_from_duration(self):
        t = RUN_TEMPLATES["run_easy_45"]
        expected = (t.duration_s / 60.0) * _RUN_TSS_PER_MIN_EASY
        assert template_tss_estimate("run_easy_45") == expected

    def test_run_quality_template_uses_quality_rate(self):
        t = RUN_TEMPLATES["run_tempo_20"]
        expected = (t.duration_s / 60.0) * _RUN_TSS_PER_MIN_QUALITY
        assert template_tss_estimate("run_tempo_20") == expected

    def test_unknown_template_with_duration_falls_back(self):
        # e.g. a strength/custom session — 40 min at the conservative rate.
        assert template_tss_estimate("strength_full_body", 40 * 60) == (
            40 * _RUN_TSS_PER_MIN_EASY
        )

    def test_unknown_template_without_duration_is_none(self):
        assert template_tss_estimate("strength_full_body") is None
        assert template_tss_estimate(None) is None


class TestPlannedWeekTotal:
    def test_includes_secondary_run_rows(self):
        """Bike + shadowed run rows on the same date BOTH count (294-vs-284)."""
        bike = _row("z2_endurance_90")
        run = _row("run_easy_45")
        both = planned_week_total([bike, run])
        bike_only = planned_week_total([bike])
        assert both is not None and bike_only is not None
        run_est = template_tss_estimate("run_easy_45")
        assert both == int(round(TEMPLATES["z2_endurance_90"].base_tss + run_est))
        assert both > bike_only

    def test_unknown_rows_use_duration_fallback(self):
        total = planned_week_total([_row("mystery_strength", 30 * 60)])
        assert total == int(round(30 * _RUN_TSS_PER_MIN_EASY))

    def test_empty_or_unresolvable_is_none_never_zero(self):
        assert planned_week_total([]) is None
        assert planned_week_total([_row(None), _row("nope")]) is None

    def test_rest_day_rows_count_as_zero_but_not_none(self):
        # A week of only rest rows is a real (0-TSS) plan, not "no plan".
        assert planned_week_total([_row("rest_day")]) == 0


class TestHeaderMatchesDisplayedSessionSum:
    def test_rounds_per_session_not_once_at_the_sum(self):
        """Review finding: header 290 vs visible session sum 289. The UI shows
        each session as a rounded integer, so the header total must equal the
        sum of those integers — Σ round(v), never round(Σ v)."""
        # Two rows whose estimates end in .3/.3: round(Σ)=round(x.6) rounds up,
        # Σ round() keeps them down — the exact off-by-one class.
        rows = [_row("strength_a", int(41.3 / 1.0 * 60)), _row("strength_b", int(41.3 * 60))]
        vals = [
            template_tss_estimate(r.template_id, r.duration_seconds_target)
            for r in rows
        ]
        expected = sum(int(round(v)) for v in vals if v is not None)
        assert planned_week_total(rows) == expected
