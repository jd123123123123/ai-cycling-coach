"""The machine stands in the same box on every stage, or the frame is left alone.

WHY THE PROPERTIES ARE THESE. `bike_build.BIKE_CAMERA` asks in prose for a
centred machine and the model lands near it, never on it: measured across nine
finished stages the contact line landed anywhere across 0.203 of the frame
height. So this module reframes by measurement — and the two things it must
never do are distort the world and guess. Every test below is one of those two.
"""
import base64
import io

import pytest

pytest.importorskip("PIL")
pytest.importorskip("numpy")
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from app.services import stage_frame as sf  # noqa: E402


# ── fixtures: silhouettes and scenes with geometry we chose ────────────────

def _cutout(sep=600, r=210, pad=60) -> str:
    """A side-on two-wheeled silhouette on transparency, at a known ratio."""
    w = sep + 2 * r + 2 * pad
    h = 2 * r + 2 * pad
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cy = pad + r
    for cx in (pad + r, pad + r + sep):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(30, 30, 34, 255), width=max(3, r // 12))
    # a frame, so the silhouette is not only two rings
    d.line([(pad + r, cy), (pad + r + sep, cy)], fill=(30, 30, 34, 255), width=max(3, r // 14))
    d.line([(pad + r + sep // 3, cy - r), (pad + r + sep, cy)], fill=(30, 30, 34, 255), width=max(3, r // 14))
    buf = io.BytesIO()
    im.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _scene(sep=560, r=195, mid_x=0.5, contact=0.70, size=(1080, 1935)):
    """A textured world with two wheels standing in it at a chosen place."""
    W, H = size
    rng = np.random.default_rng(11)
    a = (rng.random((H, W, 3)) * 46 + 96).astype("uint8")
    im = Image.fromarray(a)
    d = ImageDraw.Draw(im)
    cy = contact * H - r
    cx0 = mid_x * W - sep / 2
    for cx in (cx0, cx0 + sep):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(16, 16, 18), width=16)
    d.line([(cx0, cy), (cx0 + sep, cy)], fill=(16, 16, 18), width=11)
    return im


# ── the exact read, from a cut-out's alpha ────────────────────────────────

def test_a_cutout_reports_its_own_wheelbase_ratio():
    """The whole reason the ratio is not a constant: a rider's own cut-out knows
    it exactly, from two contact runs and one column, with no circle fitting."""
    assert sf.geometry_from_cutout(_cutout(sep=600, r=210)) == pytest.approx(600 / 210, abs=0.04)


def test_a_longer_wheelbase_reads_longer():
    """MEASURED ON REAL RIDERS. Three production cut-outs read 2.885, 2.891 and
    3.007 — the last a hybrid with a flat bar. A fixed 2.93 is wrong for that
    rider, which is the case this function exists for."""
    race = sf.geometry_from_cutout(_cutout(sep=590, r=210))
    tourer = sf.geometry_from_cutout(_cutout(sep=680, r=210))
    assert race is not None and tourer is not None
    assert tourer > race


def test_an_image_with_no_alpha_is_not_measured():
    """A render is not a cut-out. Without transparency there are no contact runs
    to read and the answer must be "I do not know", never a number."""
    buf = io.BytesIO()
    Image.new("RGB", (400, 260), (90, 90, 90)).save(buf, "PNG")
    url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    assert sf.geometry_from_cutout(url) is None


def test_a_silhouette_that_is_not_two_wheels_is_refused():
    """Three things touching the ground is a kickstand, a shadow, or something
    that is not this camera — and a wrong ratio is worse than the average one."""
    im = Image.new("RGBA", (900, 400), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for cx in (150, 450, 750):
        d.ellipse([cx - 90, 200, cx + 90, 380], outline=(20, 20, 20, 255), width=12)
    buf = io.BytesIO()
    im.save(buf, "PNG")
    assert sf.geometry_from_cutout(
        "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    ) is None


def test_garbage_never_raises():
    """Every optional step in this pipeline degrades rather than failing the
    render — the same contract `cutout` and `cyclr_studio` keep."""
    assert sf.geometry_from_cutout("not-an-image") is None
    assert sf.geometry_from_cutout("") is None


# ── finding the wheels in a rendered stage ────────────────────────────────

def test_the_wheels_are_found_in_a_textured_scene():
    w = sf.find_wheels(_scene(sep=560, r=195), ratio=560 / 195)
    assert w is not None
    assert w.sep == pytest.approx(560, rel=0.06)
    assert w.contact_y == pytest.approx(0.70 * 1935, rel=0.04)


def test_one_wheel_is_not_a_bicycle():
    """The vote scores PAIRS, not peaks, because the strongest single circle is
    sometimes the sun, an arch or a bin lid."""
    W, H = 1080, 1935
    rng = np.random.default_rng(5)
    im = Image.fromarray((rng.random((H, W, 3)) * 46 + 96).astype("uint8"))
    ImageDraw.Draw(im).ellipse([440, 1150, 830, 1540], outline=(16, 16, 18), width=16)
    assert sf.find_wheels(im) is None


def test_a_detection_outside_the_plausibility_gate_declines():
    """A pair far too small to be the stage's machine must not reframe the
    picture. Measured on a real pasture render, the coarse vote locked onto a
    wheelbase of 0.28 of the frame width — the gate is what stopped it."""
    im = _scene(sep=150, r=52, contact=0.62)
    assert sf.find_wheels(im, ratio=150 / 52) is None


# ── the reframe ───────────────────────────────────────────────────────────

def test_the_machine_lands_on_the_canonical_box():
    """THE WHOLE POINT. Two scenes that put the machine in different places must
    come out with it in the same place."""
    high = _scene(sep=520, r=181, contact=0.62, mid_x=0.46)
    low = _scene(sep=600, r=209, contact=0.84, mid_x=0.54)
    for src in (high, low):
        out, info = sf.normalise(src, (1080, 1935), ratio=520 / 181)
        assert info["ok"], info
        w = sf.find_wheels(out, ratio=520 / 181)
        assert w is not None
        assert w.sep / out.width == pytest.approx(sf.TARGET_SEP, abs=0.02)
        assert w.contact_y / out.height == pytest.approx(sf.TARGET_CONTACT, abs=0.02)
        assert w.mid_x / out.width == pytest.approx(sf.TARGET_MID_X, abs=0.02)


def test_the_world_is_never_stretched():
    """A similarity transform, not an affine one. The machine's own proportions
    must survive, or the reframe has changed the thing it exists to protect."""
    ratio = 560 / 195
    src = _scene(sep=560, r=195, contact=0.66)
    out, info = sf.normalise(src, (1080, 1935), ratio=ratio)
    assert info["ok"]
    w = sf.find_wheels(out, ratio=ratio)
    assert w is not None
    assert w.ratio == pytest.approx(ratio, rel=0.05)


def test_the_same_render_always_reframes_the_same_way():
    """No sampling anywhere in here. Two riders on one stage get one picture."""
    src = _scene(contact=0.66)
    a, ia = sf.normalise(src, (1080, 1935))
    b, ib = sf.normalise(src, (1080, 1935))
    assert a.tobytes() == b.tobytes()
    assert ia == ib


def test_a_frame_it_cannot_read_is_returned_at_the_right_size_anyway():
    """Degrading means looking exactly like it did before this module existed —
    which includes being the size the caller asked for."""
    rng = np.random.default_rng(3)
    noise = Image.fromarray((rng.random((900, 500, 3)) * 255).astype("uint8"))
    out, info = sf.normalise(noise, (1080, 1935))
    assert out.size == (1080, 1935)
    assert info["ok"] is False


def test_padding_is_reported_so_a_drifting_stage_can_be_found():
    """A render whose machine sits high needs sky the crop cannot invent, so the
    top edge is replicated — measured at 306 px on a real 1536x2752 render. It
    is allowed and it is counted, because a stage needing a lot of it has a
    prompt problem upstream."""
    out, info = sf.normalise(_scene(sep=560, r=195, contact=0.58), (1080, 1935), ratio=560 / 195)
    assert info["ok"]
    assert info["pad"]["t"] > 0
    assert out.size == (1080, 1935)
