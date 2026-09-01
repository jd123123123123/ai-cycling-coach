"""The compositor's two real failure modes, pinned.

Both of these SHIPPED before they were caught, and neither was visible to any
type checker or lint: the marks landed in the top-left corner of the image, and
a half-disc centred on the eye left the real eyeball showing above it. They are
geometry bugs, so they are tested as geometry — where the ink actually lands.
"""
import base64
import io

import numpy as np
import pytest
from PIL import Image

from app.services import face_marks as fm

W, H = 512, 512
LEFT, RIGHT = (200.0, 230.0), (312.0, 230.0)


def _flat(colour=(190, 150, 130)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (W, H), colour).save(buf, "WEBP", quality=95)
    return buf.getvalue()


def _painted(out: bytes) -> np.ndarray:
    """Boolean map of the pixels the compositor changed."""
    a = np.asarray(Image.open(io.BytesIO(_flat())).convert("RGB"), dtype=np.int16)
    b = np.asarray(Image.open(io.BytesIO(out)).convert("RGB"), dtype=np.int16)
    return np.abs(a - b).max(axis=2) > 12


def test_marks_land_on_the_eyes_not_in_a_corner():
    """THE COORDINATE-SPACE BUG. Gemini answers in a 0-1000 space; the first
    version read those numbers as pixels, so every mark clustered into the
    top-left eighth of a 1536px render. Assert the ink is where the eyes are."""
    painted = _painted(fm.composite(_flat(), fm.Landmarks(LEFT, RIGHT)))
    assert painted.any(), "compositor drew nothing at all"

    ys, xs = np.nonzero(painted)
    cx, cy = xs.mean(), ys.mean()
    assert abs(cx - 256.0) < 40, f"ink centred at x={cx:.0f}, eyes are at x=256"
    assert abs(cy - 215.0) < 55, f"ink centred at y={cy:.0f}, eyes are at y=230"
    # And nothing at all in the corner the bug used to fill.
    assert not painted[: H // 4, : W // 4].any()


def test_white_sits_over_the_eye_not_below_it():
    """THE HALF-DISC BUG. Centred on the eye centre, the disc's flat top edge
    ran through the middle of the eyeball and the render's own eye showed above
    it. EYE_TOP_RISE lifts it; assert the mark's top clears the eye centre."""
    painted = _painted(fm.composite(_flat(), fm.Landmarks(LEFT, RIGHT)))
    col = painted[:, int(LEFT[0])]
    top = int(np.nonzero(col)[0].min())
    assert top < LEFT[1], f"mark starts at y={top}, below the eye at y={LEFT[1]}"


def test_brow_clears_the_eye_so_the_two_never_fuse():
    """A bar touching the white reads as one fused object rather than two
    marks — the defect the prompt version kept producing.

    Measured on the MARKS, not on "pixels that changed": the drop shadow spans
    the gap by design, so a changed-pixel run is continuous even when the bar
    and the white are plainly separate. What must hold is that between the
    lowest brow ink and the highest white there is lit skin — darkened by the
    shadow, but still skin rather than either mark.
    """
    out = fm.composite(_flat(), fm.Landmarks(LEFT, RIGHT))
    col = np.asarray(Image.open(io.BytesIO(out)).convert("RGB"),
                     dtype=np.int16)[:, int(LEFT[0])]
    lum = col.mean(axis=1)
    ink, white = lum < 90, lum > 200

    assert ink.any() and white.any(), "expected both a brow bar and an eye white"
    brow_bottom = int(np.nonzero(ink[: int(LEFT[1])])[0].max())
    white_top = int(np.nonzero(white)[0].min())
    assert white_top > brow_bottom, "the white starts before the bar has ended"

    between = lum[brow_bottom + 1 : white_top]
    assert len(between) >= 4, f"only {len(between)}px between bar and white"
    assert not (between < 90).any() and not (between > 200).any(), \
        "the gap between the marks is itself painted"


@pytest.mark.parametrize("lm, why", [
    (fm.Landmarks((12.0, 9.0), (28.0, 9.0)), "both eyes in the corner"),
    (fm.Landmarks((10.0, 230.0), (500.0, 230.0)), "interocular wider than a head"),
    (fm.Landmarks((200.0, 230.0), (212.0, 230.0)), "eyes almost touching"),
    (fm.Landmarks((200.0, 150.0), (312.0, 330.0)), "head rolled 58 degrees"),
    (fm.Landmarks((200.0, 460.0), (312.0, 460.0)), "eyes below the chin line"),
])
def test_confidently_wrong_landmarks_are_refused(lm, why):
    """`confident: false` was never the danger. This is."""
    assert not fm._plausible(lm, W, H), why


def test_a_normal_face_is_accepted():
    assert fm._plausible(fm.Landmarks(LEFT, RIGHT), W, H)


def test_roll_carries_into_the_marks():
    """One measurement gives position, scale AND roll — so a tilted head gets
    tilted marks with no second vision call."""
    level = fm.Landmarks(LEFT, RIGHT)
    tilted = fm.Landmarks((200.0, 210.0), (312.0, 250.0))
    assert abs(level.roll_deg) < 0.01
    assert 15.0 < tilted.roll_deg < 25.0
    assert abs(level.unit - 112.0) < 0.01


@pytest.mark.asyncio
async def test_no_face_ships_the_render_untouched(monkeypatch):
    """The fallback is the whole reason the guard can afford to be strict."""
    monkeypatch.setattr(fm, "locate_eyes", lambda _b64: _none())
    src = "data:image/webp;base64," + base64.b64encode(_flat()).decode()
    out, marked = await fm.apply_marks(src)
    assert out == src and marked is False


async def _none():
    return None
