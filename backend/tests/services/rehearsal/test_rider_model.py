"""The athlete's physical inputs, and what happens when they are missing.

Nullability drives the refusals in the spec (§6) rather than being silently
defaulted: no CP or no body weight means no predicted time at all.
"""
from __future__ import annotations

import pytest

from app.services.rehearsal.rider_model import (
    CDA_FALLBACK_M2,
    BIKE_MASS_KG,
    available_cp,
    build_rider_model,
)


def _full(**over):
    kwargs = dict(
        cp_watts=250.0, w_prime_j=20000.0, weight_kg=72.0,
        cda_m2=0.30, durability_drop_pct=6.0,
    )
    kwargs.update(over)
    return build_rider_model(**kwargs)


class TestBuildRiderModel:
    def test_adds_bike_mass_to_rider_mass(self):
        assert _full().mass_kg == pytest.approx(72.0 + BIKE_MASS_KG)

    def test_uses_the_measured_cda_when_there_is_one(self):
        m = _full()
        assert m.cda_m2 == pytest.approx(0.30)
        assert m.cda_is_default is False

    def test_falls_back_to_a_default_cda_and_says_so(self):
        m = _full(cda_m2=None)
        assert m.cda_m2 == pytest.approx(CDA_FALLBACK_M2)
        assert m.cda_is_default is True

    def test_cannot_predict_without_cp(self):
        assert _full(cp_watts=None).can_predict_time is False

    def test_cannot_predict_without_body_weight(self):
        assert _full(weight_kg=None).can_predict_time is False

    def test_can_predict_with_cp_and_weight(self):
        assert _full().can_predict_time is True


class TestAvailableCp:
    def test_full_cp_when_fresh(self):
        assert available_cp(_full(), 0.0) == pytest.approx(250.0)

    def test_fades_as_work_accumulates(self):
        m = _full(durability_drop_pct=6.0)
        late = available_cp(m, 2500.0)
        assert late < 250.0
        # The measured drop is the drop at the measurement threshold, not a
        # licence to fade without limit.
        assert late > 250.0 * 0.85

    def test_never_fades_when_durability_was_never_measured(self):
        m = _full(durability_drop_pct=0.0)
        assert available_cp(m, 4000.0) == pytest.approx(250.0)

    def test_fade_is_monotonic(self):
        m = _full()
        assert available_cp(m, 3000.0) < available_cp(m, 1000.0) <= available_cp(m, 0.0)
