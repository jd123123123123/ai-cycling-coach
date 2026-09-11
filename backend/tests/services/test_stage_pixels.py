"""A stage is the whole screen, so its pixels are the whole quality.

THE DEFECT THESE PIN. `STORE_MAX_PX` was written when every render was SQUARE:
`thumbnail((1536, 1536))` fits an image INSIDE that box, so a 1:1 render stored
1536 px wide and a 9:16 render stores 864 — a 44% loss of horizontal resolution
on the one image that is displayed full-bleed at device width. A reference phone
is 390 pt at DPR 3, so the stage is painted 1170 px wide: 864 px of source is a
1.35x upscale, and it reads as exactly what the rider called it, pixelated.

AND THE PLATE WAS STILL SQUARE. `docs/w3-stage-rendering.md` §2 records plates
being rendered 1:1 as a fixed bug, and `STAGE_ASPECT = "9:16"` as the fix — but
`places.ensure_plate` never passed it and `places.plate_prompt` still ends with
"Square 1:1 frame". A square plate handed to a portrait scene render is a
reference the model has to extend to fill the frame, which is a second, quieter
way to lose the detail the plate was paid for.
"""
import base64
import io

import pytest

pytest.importorskip("PIL")
from PIL import Image  # noqa: E402

from app.services import cyclr_studio, places  # noqa: E402


def _png(w: int, h: int) -> bytes:
    """A render of the given shape, with enough detail to survive a resize."""
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            px[x, y] = ((x * 7) % 256, (y * 5) % 256, ((x + y) * 3) % 256)
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue()


def _stored(png: bytes) -> "Image.Image":
    url = cyclr_studio._to_data_url(png)
    return Image.open(io.BytesIO(base64.b64decode(url.split(",", 1)[1])))


def test_a_portrait_stage_keeps_the_width_the_screen_paints():
    """THE PIXELATION BUG. A 2K 9:16 render arrives 1152x2048 and was stored
    864 wide, because a square cap fits a portrait inside it by its HEIGHT.

    The store target is the phone, not the render: 1080 is within 8% of the
    1170 device px a 390 pt screen paints, and measured on a real plate it
    carries 96% of native sharpness for 76% of 1280's payload. What must never
    happen again is the frame's width being decided by its height."""
    stored = _stored(_png(1152, 2048))
    assert stored.width == cyclr_studio.STAGE_STORE_MAX_W
    assert stored.width > 864, "the square cap is back"


def test_a_square_collectible_is_still_capped():
    """The garage collectible is a product shot displayed at 1080 px at most.
    Nothing about the stage fix may make every bike four times the payload."""
    stored = _stored(_png(2048, 2048))
    assert max(stored.size) == cyclr_studio.STORE_MAX_PX


def test_an_oversized_portrait_is_still_capped():
    """A 4K portrait render is 2304x4096, and no surface displays that. The cap
    moved from the long edge to the WIDTH; it did not go away."""
    stored = _stored(_png(2304, 4096))
    assert stored.width == cyclr_studio.STAGE_STORE_MAX_W
    assert stored.height == pytest.approx(cyclr_studio.STAGE_STORE_MAX_W * 16 / 9, abs=2)


def test_a_landscape_render_is_capped_on_its_long_edge():
    """Only PORTRAIT is special, because only portrait is the room. A wide
    image has no full-bleed surface and keeps the old rule."""
    stored = _stored(_png(2048, 1152))
    assert max(stored.size) == cyclr_studio.STORE_MAX_PX


def test_a_place_plate_is_rendered_at_the_stage_aspect():
    """§2's bug, still live on the plate path. A plate is the background of a
    9:16 scene; rendering it square makes the model extend it to fill, which is
    detail paid for and thrown away."""
    seen: dict = {}

    async def _fake_generate(prompt, seed_src, size="", aspect="1:1"):
        seen["aspect"] = aspect
        seen["prompt"] = prompt
        return "data:image/webp;base64,AA=="

    class _Db:
        async def commit(self):
            return None

    class _Place:
        slug = "dolomites"
        name = "Dolomiten"
        prose = "a pass road under limestone towers"
        plate_url = None

    import asyncio

    place = _Place()
    orig = cyclr_studio._generate
    cyclr_studio._generate = _fake_generate
    try:
        asyncio.run(places.ensure_plate(_Db(), place))
    finally:
        cyclr_studio._generate = orig

    assert seen.get("aspect") == cyclr_studio.STAGE_ASPECT


def test_the_plate_prompt_does_not_ask_for_a_square():
    """The aspect is passed as a parameter AND stated in the prose, and the two
    disagreeing is how a portrait render comes back with a square composition
    letterboxed into it."""
    class _Place:
        prose = "a pass road under limestone towers"

    prompt = places.plate_prompt(_Place())
    assert "1:1" not in prompt
    assert "quare" not in prompt, "the plate prompt still asks for a square frame"


def test_an_edit_asks_for_the_render_size_like_every_other_path(monkeypatch):
    """THE BIGGEST OF THE THREE, AND THE ONE A RIDER SEES.

    `_generate` sends `size or RENDER_SIZE`; `edit_image` sent `size` and its
    default is the empty string, so the whole EDIT path — which is the live
    stage path, `garage.get_today_stage` and `stage_unlock` — never asked for
    2K and got the provider's default. Measured on a real call: 768x1376.

    Two costs, not one. The room is painted ~1170 px wide, so 768 is a 1.52x
    upscale; and `DEFAULT_IMAGE_MODEL`'s own note says 2K exists because at 1K
    the model resolves a rider's frame decals at the same scale as the spokes
    and a Standert comes back reading "Stanlert". Every stage was doing that.
    """
    # Exercise the render contract without depending on local API credentials.
    monkeypatch.setattr(cyclr_studio, "_gemini_ready", lambda: True)
    seen: dict = {}

    async def _fake_render(contents, seed_src, size, aspect="1:1", **kw):
        seen["size"] = size
        return None

    import asyncio

    orig = cyclr_studio._render
    cyclr_studio._render = _fake_render
    try:
        asyncio.run(cyclr_studio.edit_image("data:image/webp;base64,AA==", "p", "seed"))
    finally:
        cyclr_studio._render = orig

    assert seen.get("size") == cyclr_studio.RENDER_SIZE
