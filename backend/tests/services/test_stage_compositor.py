"""The machine is placed by arithmetic, so these are the properties that hold.

WHY NOT LET THE MODEL DO IT. Measured on two stages: handing the composite to
the image model with "integrate, but do not redraw the bicycle" dropped edge
overlap against the input to 21%, where resampling alone costs 66%. It repaints
the machine. A collectible that is a record of what a rider OWNS cannot be
reinterpreted every time it is shown.
"""
import pytest

PIL = pytest.importorskip("PIL")
pytest.importorskip("numpy")
from PIL import Image  # noqa: E402

from app.services import stage_compositor as sc  # noqa: E402


def _plate(a=(30, 40, 60), b=(200, 180, 140), sun=None):
    """A plate with a sky, a ground and optionally a bright spot for a sun."""
    im = Image.new("RGB", (192, 344))
    px = im.load()
    for y in range(im.height):
        row = a if y < im.height * 0.73 else b
        for x in range(im.width):
            px[x, y] = row
    if sun:
        for y in range(20, 44):
            for x in range(sun - 12, sun + 12):
                if 0 <= x < im.width:
                    px[x, y] = (255, 250, 230)
    return im


def _bike():
    im = Image.new("RGBA", (120, 74), (0, 0, 0, 0))
    d = Image.new("RGBA", (90, 30), (40, 40, 44, 255))
    im.paste(d, (15, 22))
    return im


def test_the_same_inputs_always_give_the_same_picture():
    """Two riders on the same stage must get the same stage. No sampling, no
    seed, no model — the same bytes in, the same bytes out."""
    p, b = _plate(sun=40), _bike()
    assert sc.compose(p, b).tobytes() == sc.compose(p, b).tobytes()


def test_two_plates_are_lit_differently():
    """The whole point of measuring the light rather than authoring one recipe:
    fifty stages must not all light the machine the same way."""
    left = sc.read_light(_plate(sun=25))
    right = sc.read_light(_plate(sun=165))
    assert left.kx < 0 < right.kx, "key direction must follow the plate's own sun"


def test_a_flat_sky_is_read_as_soft_light():
    """An overcast plate has no sun to find; it must not be given a hard key."""
    assert sc.read_light(_plate()).strength < 0.3


def test_the_ground_colour_is_what_bounces():
    light = sc.read_light(_plate(sun=40, b=(200, 60, 40)))
    r, g, _bl = light.bounce
    assert r > g, "the bounce must carry the ground's own colour"


def test_the_machine_keeps_its_geometry():
    """1:1 BY ARITHMETIC. Relighting may change what a pixel looks like; it may
    never change WHERE the machine is. The alpha is the silhouette, and it is
    carried through untouched."""
    b = _bike()
    lit = sc.relight(b, sc.read_light(_plate(sun=40)), 344)
    assert lit.size == b.size
    assert list(lit.getchannel("A").getdata()) == list(b.getchannel("A").getdata())


def test_relighting_does_not_wash_out_a_dark_frame():
    """The first version ADDED the key colour, and a matte black frame came back
    bronze on a sunset stage. Light multiplies; only the rim adds."""
    dark = Image.new("RGBA", (60, 40), (18, 18, 20, 255))
    lit = sc.relight(dark, sc.read_light(_plate(sun=40)), 344).convert("RGB")
    mean = sum(sum(p) / 3 for p in lit.getdata()) / (60 * 40)
    assert mean < 110, f"dark albedo washed out to {mean:.0f}"


def test_a_costume_never_moves_the_machine():
    """A costume is one more composited layer, so the bicycle underneath it is
    bit-identical with or without one."""
    p, b = _plate(sun=40), _bike()
    cos = Image.new("RGBA", (24, 10), (200, 40, 60, 255))
    plain = sc.compose(p, b)
    with_c = sc.compose(p, b, costume=cos, costume_offset=(0.05, -0.25))
    assert plain.size == with_c.size
    assert plain.tobytes() != with_c.tobytes(), "the costume must actually appear"


def test_the_footprint_is_a_function_of_the_PLATE_and_nothing_else():
    """WHAT THE COLLECTIBLE ACTUALLY REQUIRES. The old form of this test asserted
    a constant contact line, which was stricter than the promise and wrong about
    the picture: it stood every machine at 73% of the height whether or not the
    plate's floor was there.

    The promise is that two riders on one stage get one picture, and that holds
    as long as the footprint depends on the PLATE alone — never on the rider,
    the bike, or the hour they opened the app. The width stays a constant
    because nothing measurable should decide it."""
    plate = _plate(sun=40)
    assert sc.BIKE_W == 0.62
    assert sc.ground_line(plate) == sc.ground_line(plate.copy())

    tall = Image.new("RGBA", (120, 74), (0, 0, 0, 0))
    tall.paste(Image.new("RGBA", (40, 60), (9, 9, 9, 255)), (40, 8))
    contact = sc.ground_line(plate)
    assert sc.bike_box(plate.size, _bike(), contact)[3] == \
        sc.bike_box(plate.size, tall, contact)[3], \
        "two riders' bikes must meet the same floor whatever shape they are"


# ── THE GROUND THE PLATE ACTUALLY HAS ───────────────────────────────────────
# `CONTACT` was a constant, and the composition clause only ASKS the model for
# tyres at 72% of the frame height. §2 of the doc already records that the model
# trades prose composition away and that percentages hold better than words —
# but "holds better" is not "obeys". A plate whose ground begins at 60% stands
# the machine 12% of the frame above its own floor, which is precisely the
# floating fault this pipeline has been chasing.


def _textured(ground: float, sky=(60, 70, 110), soil=(150, 130, 100), grain=34):
    """A plate whose near field has grain and whose distance does not.

    This is the real signal: §3 measured mean gradient as the proxy for texture
    and found the distance has none. A detector that only reads brightness
    cannot tell a bright sky from bright limestone.
    """
    import random

    rnd = random.Random(7)
    im = Image.new("RGB", (192, 344))
    px = im.load()
    cut = int(im.height * ground)
    for y in range(im.height):
        for x in range(im.width):
            if y < cut:
                px[x, y] = sky
            else:
                n = rnd.randint(-grain, grain)
                px[x, y] = tuple(max(0, min(255, c + n)) for c in soil)
    return im


def test_the_ground_line_snaps_to_the_floor_the_plate_actually_has():
    """A plate that put its floor at 66% must be told so, not stood on at 73%."""
    assert sc.ground_line(_textured(0.66)) == pytest.approx(0.66, abs=0.04)


def test_a_lower_floor_reads_as_a_lower_floor():
    """The measurement has to move with the plate, not just land near 0.73."""
    assert sc.ground_line(_textured(0.66)) < sc.ground_line(_textured(0.80))


def test_texture_alone_finds_the_floor_when_the_brightness_step_does_not():
    """THE HARD CASE, and the one that decides the feature. A limestone village
    square is as bright as its sky: there is no luminance step to find, only
    grain that starts where the ground does."""
    flat = _textured(0.68, sky=(150, 130, 100), soil=(150, 130, 100), grain=40)
    assert sc.ground_line(flat) == pytest.approx(0.68, abs=0.05)


def test_a_plate_with_no_floor_at_all_keeps_the_measured_default():
    """Never invent a number. A plate that is one material top to bottom has no
    transition to find, and guessing one is worse than the constant that at
    least matches what the prompt asked for."""
    noise = _textured(0.0, soil=(120, 120, 120), grain=30)
    assert sc.ground_line(noise) == sc.CONTACT_FALLBACK


def test_a_plate_that_ignored_the_composition_clause_is_not_guessed_at():
    """THE LIMIT, STATED. This snaps the asked-for line to a nearby real
    boundary; it does not find a floor anywhere in the frame. Measured on the
    first real Dolomites render, a search over the whole lower frame answered
    0.902 — the bottom edge — because a global two-halves objective has no peak
    at a local boundary. A plate whose floor is nowhere near 72% gets the
    fallback and looks exactly as it did before this function existed."""
    assert sc.ground_line(_textured(0.50)) == sc.CONTACT_FALLBACK
    assert sc.ground_line(_textured(0.90)) == sc.CONTACT_FALLBACK


def test_the_machine_stands_on_the_line_the_plate_has():
    """End to end: the same bike on two plates whose floors differ must be
    drawn at two different heights."""
    b = _bike()
    high = sc.compose(_textured(0.66), b)
    low = sc.compose(_textured(0.80), b)
    assert high.tobytes() != low.tobytes()
    assert sc.bike_box(high.size, b, sc.ground_line(_textured(0.66)))[3] < \
        sc.bike_box(low.size, b, sc.ground_line(_textured(0.80)))[3]


# ── A SHADOW IS LIT BY THE SKY ──────────────────────────────────────────────
# §5.4: "A real shadow is not an absence of light, it is a region lit ONLY by
# the sky — blue at noon, orange at sunset. Subtracting grey produces a dead
# patch no photograph contains." `compose` subtracted grey.


def _ground_sample(img, y_frac, x_frac=0.5):
    return img.convert("RGB").getpixel(
        (int(img.width * x_frac), min(img.height - 1, int(img.height * y_frac)))
    )


def test_a_shadow_carries_the_sky_s_colour():
    """THE BUG. Warm soil under a blue sky: where the machine shuts the sun out,
    what is left is skylight, so the ground goes BLUER as well as darker. A grey
    subtraction leaves the hue exactly where it was."""
    plate = _textured(0.70, sky=(40, 80, 190), soil=(210, 170, 110), grain=6)
    out = sc.compose(plate, _bike())
    lit = _ground_sample(out, 0.97, 0.06)          # far corner, no shadow
    shade = _ground_sample(out, 0.755, 0.5)        # under the machine
    assert sum(shade) < sum(lit), "the shadow must still be a shadow"
    assert shade[2] / max(1, shade[0]) > lit[2] / max(1, lit[0]), (
        f"shadow {shade} is no bluer than lit ground {lit}: it was subtracted, "
        f"not lit by the sky"
    )


def test_a_shadow_under_a_warm_sky_goes_warm():
    """The other direction, or the first test is satisfied by a blue constant."""
    plate = _textured(0.70, sky=(220, 120, 40), soil=(160, 160, 160), grain=6)
    out = sc.compose(plate, _bike())
    lit = _ground_sample(out, 0.97, 0.06)
    shade = _ground_sample(out, 0.755, 0.5)
    assert shade[0] / max(1, shade[2]) > lit[0] / max(1, lit[2]), (
        f"shadow {shade} is no warmer than lit ground {lit}"
    )
