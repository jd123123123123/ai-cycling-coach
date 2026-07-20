"""hrTSS fallback derivation (audit P0-5): a 45-min HR-117 run must never
count 0 TSS just because the profile lacks resting/max HR.

Derivation chain under test:
    max HR     — profile → Tanaka(date_of_birth)
    LTHR       — measured → 0.90 × max HR
    resting HR — profile → daily-metrics median (passed in) → 60 default
"""
from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace

from app.schemas.activity import ActivityCreate
from app.services.activity_service import _compute_tss


def _profile(**overrides) -> SimpleNamespace:
    base = dict(
        ftp_watts=None,
        lthr_cycling=None,
        lthr_running=None,
        running_threshold_pace_ms=None,
        max_heart_rate=None,
        resting_heart_rate=None,
        date_of_birth="1990-05-01",
        weight_kg=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _run(avg_hr: int | None = 117, minutes: int = 45, distance: float | None = None) -> ActivityCreate:
    return ActivityCreate(
        sport="running",
        started_at=datetime(2026, 7, 18, 17, 30, tzinfo=UTC),
        duration_seconds=minutes * 60,
        distance_meters=distance,
        average_hr=avg_hr,
    )


class TestRunHrTssFallback:
    def test_hr_only_run_with_dob_only_gets_tss(self):
        """No thresholds at all, just date_of_birth + avg HR → hrTSS > 0."""
        tss = _compute_tss(_run(), _profile())
        assert tss is not None
        assert tss > 0

    def test_uses_daily_metrics_resting_hr_when_provided(self):
        base = _compute_tss(_run(), _profile())
        with_low_rhr = _compute_tss(_run(), _profile(), resting_hr_fallback=45.0)
        assert base is not None and with_low_rhr is not None
        # Lower resting HR → higher HRR fraction denominator shift → values differ
        assert base != with_low_rhr

    def test_measured_values_preferred_over_derived(self):
        derived = _compute_tss(_run(), _profile())
        measured = _compute_tss(
            _run(),
            _profile(max_heart_rate=190, resting_heart_rate=48, lthr_running=168),
        )
        assert derived is not None and measured is not None
        # Both compute; measured profile changes the result (uses real anchors).
        assert measured != derived

    def test_no_hr_and_no_pace_still_none(self):
        """Without ANY signal (no HR, no threshold pace) we stay honest: None."""
        assert _compute_tss(_run(avg_hr=None), _profile()) is None

    def test_no_dob_no_max_hr_returns_none(self):
        """No max-HR anchor at all → no fabricated number."""
        assert _compute_tss(_run(), _profile(date_of_birth=None)) is None

    def test_rtss_still_preferred_when_pace_threshold_set(self):
        """Threshold pace + distance → pace-based rTSS path, not hrTSS."""
        profile = _profile(running_threshold_pace_ms=3.5)
        run = _run(distance=9000.0)
        tss = _compute_tss(run, profile)
        # rTSS for 45min at 3.33 m/s vs threshold 3.5 ≈ 68
        assert tss is not None
        assert 50 < tss < 90


class TestGymHrTssFallback:
    def test_gym_session_with_dob_only_gets_tss(self):
        data = ActivityCreate(
            sport="gym",
            started_at=datetime(2026, 7, 18, 7, 0, tzinfo=UTC),
            duration_seconds=50 * 60,
            average_hr=105,
        )
        tss = _compute_tss(data, _profile())
        assert tss is not None
        assert tss > 0
