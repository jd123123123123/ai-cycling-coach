"""Unit tests for the period_report insight builders — intensity (TID),
load dynamics (Foster), and the ranked prescription list."""
from __future__ import annotations

from app.services.period_report import (
    WindowMetrics,
    build_intensity,
    build_load_dynamics,
    build_prescriptions,
)


def _window(**over) -> WindowMetrics:
    """Healthy 14-day window; override per test."""
    base = dict(
        days=14, pmc_days=14,
        avg_ctl=55.0, ctl_delta=4.0, avg_tsb=-3.0,
        total_tss=700.0, activity_count=8, training_days=8, longest_streak=3,
        avg_if=0.72, avg_ef=1.5, avg_decoupling=4.0, grey_pct=10.0,
        avg_hrv=60.0, avg_rhr=50.0, avg_sleep_hours=7.5,
        sleep_debt_hours=1.0, biometric_days=14,
        z1_count=6, z2_count=1, z3_count=1,
        daily_tss=[80, 0, 60, 0, 120, 40, 0, 90, 0, 70, 0, 110, 30, 0],
    )
    base.update(over)
    return WindowMetrics(**base)


class TestIntensity:
    def test_none_when_no_classified_rides(self):
        assert build_intensity(_window(z1_count=0, z2_count=0, z3_count=0), "build1") is None

    def test_polarized_window_is_aligned_for_polar_phase(self):
        mix = build_intensity(_window(z1_count=8, z2_count=1, z3_count=2), "peak")
        assert mix is not None
        assert mix.model == "polarized"
        assert mix.target_model == "polarized"
        assert mix.aligned is True
        assert mix.fix is None
        assert mix.sample_rides == 11
        assert abs(mix.z1_pct + mix.z2_pct + mix.z3_pct - 100.0) < 0.5

    def test_grey_heavy_window_gets_a_fix(self):
        mix = build_intensity(_window(z1_count=2, z2_count=6, z3_count=1), "peak")
        assert mix is not None
        assert mix.aligned is False
        assert mix.fix  # non-empty recommendation


class TestLoadDynamics:
    def test_none_when_too_few_training_days(self):
        assert build_load_dynamics(_window(training_days=2)) is None

    def test_computes_ramp_and_monotony(self):
        ld = build_load_dynamics(_window())
        assert ld is not None
        assert ld.ramp_per_week == 2.0  # ctl_delta 4 over 14 days = 2/wk
        assert ld.monotony is not None and ld.monotony > 0
        assert ld.strain is not None

    def test_flat_daily_load_flags_monotonous(self):
        ld = build_load_dynamics(_window(daily_tss=[50] * 14, ctl_delta=0.5))
        assert ld is not None
        # zero variance → monotony undefined, but a perfectly even grind reads as monotonous/flat
        assert ld.flag in {"monotonous", "flat"}


class TestPrescriptions:
    def test_at_least_one_and_capped_at_four(self):
        rx = build_prescriptions(70.0, _window(), causes=[], intensity=None,
                                 load_dynamics=None, trajectory=None)
        assert 1 <= len(rx) <= 4
        assert [p.priority for p in rx] == list(range(1, len(rx) + 1))

    def test_high_severity_cause_backs_off_first(self):
        class _C:
            severity = "high"
        rx = build_prescriptions(60.0, _window(avg_tsb=-25.0), causes=[_C()],
                                 intensity=None, load_dynamics=None, trajectory=None)
        assert rx[0].tone == "bad"
        assert "recover" in rx[0].headline.lower() or "back off" in rx[0].headline.lower()
        # while recovering, never tell the athlete to add load
        assert not any("add" in p.detail.lower() and "tss" in p.detail.lower() for p in rx)

    def test_intensity_fix_surfaces_as_a_prescription(self):
        mix = build_intensity(_window(z1_count=2, z2_count=6, z3_count=1), "peak")
        rx = build_prescriptions(72.0, _window(), causes=[], intensity=mix,
                                 load_dynamics=None, trajectory=None)
        assert any(p.icon_key == "balance" for p in rx)

    def test_trajectory_gap_prescribes_more_load(self):
        from app.schemas.period_report import Trajectory
        traj = Trajectory(
            days_to_goal=60, ctl_now=50.0, ctl_7d_delta=1.0,
            ctl_projected_at_goal=58.0, ctl_target=75.0,
            tsb_projected_at_goal=-5.0, taper_window="too_flat",
            on_track="behind", weekly_tss_required=600.0, weekly_tss_actual=400.0,
            narrative="Behind the curve toward race day.",
        )
        rx = build_prescriptions(70.0, _window(), causes=[], intensity=None,
                                 load_dynamics=None, trajectory=traj)
        assert any(p.icon_key == "build" and "track" in p.headline.lower() for p in rx)

    def test_next_step_mirrors_top_prescription(self):
        from app.services.period_report import _next_step_from
        rx = build_prescriptions(70.0, _window(), causes=[], intensity=None,
                                 load_dynamics=None, trajectory=None)
        step = _next_step_from(rx)
        assert step.headline == rx[0].headline
        assert step.detail == rx[0].detail
        assert step.tone == rx[0].tone
