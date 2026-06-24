"""Tests for the period-report cache: schema field + model import."""
from datetime import datetime, timezone

from app.schemas.period_report import PeriodReport


def _minimal_report_kwargs() -> dict:
    return dict(
        days=7, start_date="2026-06-18", end_date="2026-06-24",
        prev_start_date="2026-06-11", prev_end_date="2026-06-17",
        has_baseline=False, grade_letter=None, grade_score=None,
        radar=[], improvements=[], weaknesses=[], milestones=[],
        ai_verdict="x", ai_model="rule-based-fallback",
    )


def test_generated_at_defaults_none():
    r = PeriodReport(**_minimal_report_kwargs())
    assert r.generated_at is None


def test_generated_at_round_trips_through_dump_and_validate():
    ts = datetime(2026, 6, 24, 7, 30, tzinfo=timezone.utc)
    r = PeriodReport(**_minimal_report_kwargs(), generated_at=ts)
    dumped = r.model_dump(mode="json")
    # merging a stored timestamp back in (the cache read path) validates cleanly
    again = PeriodReport.model_validate({**dumped, "generated_at": ts})
    assert again.generated_at == ts
