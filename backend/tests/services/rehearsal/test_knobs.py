"""The athlete-settable knobs, and the ranges they stay honest in.

Correct physics applied to absurd input produces confident nonsense, which is
worse than an error: a 4 kg rider gets a beautifully computed, entirely fake
climbing time. These bounds are the guard.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.knobs import (
    SURFACE_CRR,
    OverrideError,
    RiderOverrides,
    validate,
)
from app.services.rehearsal.rider_model import DEFAULT_CRR


class TestSurface:
    def test_asphalt_matches_the_default_so_the_knob_changes_nothing_by_itself(self):
        # If these ever diverge, every pre-existing rehearsal silently changes
        # its numbers the first time the surface control is rendered.
        assert SURFACE_CRR["asphalt"] == DEFAULT_CRR
        assert RiderOverrides().crr() == DEFAULT_CRR

    def test_rougher_surfaces_cost_more(self):
        assert SURFACE_CRR["asphalt"] < SURFACE_CRR["rough"] < SURFACE_CRR["gravel"]

    def test_an_unknown_surface_falls_back_rather_than_raising_mid_simulation(self):
        rogue = RiderOverrides(surface="ice")  # type: ignore[arg-type]
        assert rogue.crr() == SURFACE_CRR["asphalt"]


class TestValidation:
    def test_an_untouched_set_of_overrides_is_valid(self):
        validate(RiderOverrides())

    @pytest.mark.parametrize("kg", [4.0, 29.9, 200.1, 900.0])
    def test_refuses_a_body_weight_outside_human_range(self, kg):
        with pytest.raises(OverrideError, match="body weight"):
            validate(RiderOverrides(weight_kg=kg))

    @pytest.mark.parametrize("kg", [30.0, 72.0, 200.0])
    def test_accepts_real_body_weights(self, kg):
        validate(RiderOverrides(weight_kg=kg))

    @pytest.mark.parametrize("kg", [0.5, 3.9, 31.0])
    def test_refuses_an_impossible_bike(self, kg):
        with pytest.raises(OverrideError, match="bike weight"):
            validate(RiderOverrides(bike_mass_kg=kg))

    def test_refuses_an_unknown_surface(self):
        with pytest.raises(OverrideError, match="surface"):
            validate(RiderOverrides(surface="ice"))  # type: ignore[arg-type]

    @pytest.mark.parametrize("hour", [-1, 24, 99])
    def test_refuses_an_hour_that_is_not_an_hour(self, hour):
        with pytest.raises(OverrideError, match="start hour"):
            validate(RiderOverrides(start_hour=hour))

    @pytest.mark.parametrize("hour", [0, 6, 23])
    def test_accepts_every_real_hour(self, hour):
        validate(RiderOverrides(start_hour=hour))

    def test_refuses_a_target_time_that_is_a_typo(self):
        with pytest.raises(OverrideError, match="target time"):
            validate(RiderOverrides(target_time_s=12.0))


class TestDefaultsMeanUntouched:
    def test_none_never_reads_as_a_deliberate_zero(self):
        o = RiderOverrides()
        assert o.weight_kg is None
        assert o.bike_mass_kg is None
        assert o.start_hour is None
        assert o.target_time_s is None
        assert o.use_projected_cp is False
