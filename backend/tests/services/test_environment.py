"""Tests for pure environment math (air density, relative wind)."""
from __future__ import annotations

import math

from app.services.environment import air_density, relative_wind


class TestAirDensity:
    def test_sea_level_default_temp(self):
        assert air_density(0.0) == round_close(1.225)

    def test_altitude_reduces_density(self):
        assert air_density(2000.0) < air_density(0.0)

    def test_warmer_air_is_less_dense(self):
        assert air_density(0.0, temp_c=35.0) < air_density(0.0, temp_c=5.0)


class TestRelativeWind:
    def test_direct_headwind(self):
        # Travelling due north (0°), wind coming FROM the north (0°) at 5 m/s.
        assert relative_wind(0.0, 0.0, 5.0) == round_close(5.0)

    def test_direct_tailwind(self):
        # Travelling north, wind FROM the south (180°) → tailwind (negative).
        assert relative_wind(0.0, 180.0, 5.0) == round_close(-5.0)

    def test_pure_crosswind_is_zero(self):
        assert abs(relative_wind(0.0, 90.0, 5.0)) < 1e-9


def round_close(x):
    class _Close:
        def __eq__(self, other):
            return math.isclose(other, x, rel_tol=1e-2, abs_tol=1e-2)
    return _Close()
