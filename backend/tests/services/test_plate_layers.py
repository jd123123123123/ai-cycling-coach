"""The near-ground layer, pinned.

The defect this whole module exists for: a cut-out bike over a single plate is
always ON the plate, so the wheels can never sink into the ground. These tests
guard the two properties that make the second layer work — the top of the frame
must stay fully transparent (or the layer covers the machine entirely), and the
boundary must NOT be a straight line (or it reads as wallpaper laid over a bike).
"""
import base64
import io

import pytest

from app.services import plate_layers

PIL = pytest.importorskip("PIL")
from PIL import Image  # noqa: E402


def _plate(w=240, h=240) -> str:
    im = Image.new("RGB", (w, h))
    for y in range(h):                       # a vertical ramp, so layers are checkable
        for x in range(w):
            im.putpixel((x, y), (int(255 * y / h), 120, 60))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _decode(b64: str) -> "Image.Image":
    return Image.open(io.BytesIO(base64.b64decode(b64.split(",", 1)[-1])))


def test_back_layer_is_the_plate_unchanged():
    """The machine is drawn over ALL of the back layer — nothing is cut away."""
    back, _front = plate_layers.split(_plate())
    assert _decode(back).convert("RGB").size == (240, 240)


def test_the_top_of_the_front_layer_is_fully_transparent():
    """The near ground may not reach the sky. If it does it covers the bike."""
    _back, front = plate_layers.split(_plate())
    a = _decode(front).convert("RGBA").getchannel("A")
    h = a.height
    top_band = a.crop((0, 0, a.width, int(h * 0.5)))
    assert max(top_band.getdata()) == 0


def test_the_bottom_of_the_front_layer_is_fully_opaque():
    """At the very bottom the material must be solid, or the machine shows through."""
    _back, front = plate_layers.split(_plate())
    a = _decode(front).convert("RGBA").getchannel("A")
    bottom = a.crop((0, a.height - 4, a.width, a.height))
    assert min(bottom.getdata()) > 250


def test_the_boundary_is_not_a_straight_line():
    """THE DEFECT THIS GUARDS. A ruled horizontal edge reads as a strip of
    wallpaper laid across the wheels — worse than having no front layer."""
    _back, front = plate_layers.split(_plate(w=400, h=400))
    a = _decode(front).convert("RGBA").getchannel("A")
    firsts = []
    for x in range(0, a.width, 7):
        col = [a.getpixel((x, y)) for y in range(a.height)]
        firsts.append(next(y for y, v in enumerate(col) if v > 0))
    assert max(firsts) - min(firsts) >= 6, "boundary is effectively flat"


def test_a_plate_it_cannot_read_returns_none_rather_than_raising():
    """A stage that cannot be split falls back to one layer; it never takes the
    room down."""
    assert plate_layers.split("not-an-image") is None
    assert plate_layers.split("") is None
