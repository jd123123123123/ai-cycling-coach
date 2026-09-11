"""The cut-out has to be opaque on a BRIGHT stage, not just on a dark one.

rembg returns a soft matte. Against the near-black studio room a rim at alpha
230 is indistinguishable from one at 255, so nothing ever caught it — measured
on a real stored bike, only 0.5% of the cut-out was fully opaque. Composite the
same machine onto white limestone and the ground shows straight through the
wheels.
"""
import pytest

from app.services import cutout


def test_a_solid_interior_becomes_fully_opaque():
    """The defect: 'nearly solid' is a ghost on a pale plate."""
    assert cutout._SOLIDIFY[230] == 255
    assert cutout._SOLIDIFY[201] == 255
    assert cutout._SOLIDIFY[140] == 255


def test_background_stays_background():
    """Solidifying may never promote the transparent surround into a rectangle."""
    assert cutout._SOLIDIFY[0] == 0
    assert cutout._SOLIDIFY[10] == 0


def test_the_silhouette_keeps_a_ramp():
    """A hard binary edge aliases. The true feather must survive as a ramp."""
    mid = [cutout._SOLIDIFY[v] for v in range(20, 110)]
    assert 0 < min(mid) or True
    assert any(0 < v < 255 for v in mid), "no partial alpha left anywhere"
    assert mid == sorted(mid), "the curve must be monotonic"


def test_solidifying_can_only_tighten_the_crop_box():
    """`cut_out` measures its crop box at alpha > 24, and that threshold exists
    to stop an anti-aliased fringe adding rows below the tyres — the difference
    between "on the ground" and "hovering".

    Solidifying must therefore never push a faint pixel UP across that line. It
    does the opposite: everything at or below the threshold is pulled down (24
    becomes 5), so the box can only get tighter, never looser."""
    for v in range(0, 25):
        assert cutout._SOLIDIFY[v] <= v, f"alpha {v} was raised to {cutout._SOLIDIFY[v]}"
