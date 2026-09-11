"""Place a rider's machine into a stage WITHOUT letting a model repaint it.

WHY THIS EXISTS. Handing the composite to the image model and asking it to
"integrate, but do not redraw the bicycle" does not work. Measured on two
stages: edge overlap between what went in and what came back fell to 21%, where
resampling alone costs 66%. It repaints the machine — different decals, moved
silhouette — and a collectible that is a record of what a rider OWNS cannot be
reinterpreted on every stage.

So the model never sees the bicycle. It renders the empty world; everything
after that is arithmetic, which makes the result identical for every rider by
construction rather than by instruction, costs nothing per rider, and makes a
costume trivial — a costume is one more layer composited at a known offset.

THE HARD PART IS THE LIGHT. A cut-out is lit for a near-black studio; a stage is
lit for wherever it is. Pasted flat it reads as a sticker, and pasted flat with
ONE canned lighting recipe it reads as fifty stickers that all look the same.
So the light is READ OUT OF THE PLATE — key direction, key colour, sky, bounce,
contrast — and the machine is relit to those numbers. Every stage lights it
differently because every plate is lit differently, and none of it is a guess.

WHAT IT CANNOT DO. There are no surface normals in a cut-out, so this is not a
render — it is a lighting IMPRESSION built from the alpha: a directional ramp
for form, an edge band for rim, a bottom ramp for bounce, all shaped by how far
each pixel sits from the silhouette. It is convincing at stage scale and would
not survive a close crop.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass

logger = logging.getLogger(__name__)

#: How wide the machine stands, identical on every stage and for every rider —
#: this is what makes two riders' Randonneur the same picture.
BIKE_W = 0.62

#: Where the machine stands when the plate will not say.
#:
#: THIS USED TO BE THE ONLY ANSWER, and it was a wish rather than a measurement.
#: `bike_build.STAGE_COMPOSITION` ASKS the model for "tyres meeting the ground at
#: about 72% of the image HEIGHT", and §2 of `docs/w3-stage-rendering.md` already
#: records that the model trades prose composition away and that percentages hold
#: better than words. Better is not obeyed: a plate that put its floor at 60%
#: stood the machine 12% of the frame above its own ground, which is the floating
#: fault this pipeline has spent its whole life chasing. `ground_line` reads the
#: floor off the plate; this is what it falls back to when there is no floor to
#: find, because inventing a number is worse than using the one we asked for.
CONTACT_FALLBACK = 0.730

#: How far from the asked-for line a real floor is looked for.
#:
#: NARROW ON PURPOSE, AND THE FIRST VERSION WAS NOT. It searched 0.42–0.92 for
#: whichever row best split the plate into two halves, and measured on the first
#: real render it answered 0.902 — the very bottom of the band. The profile shows
#: why: on a real plate that score is almost flat (0.42 at the horizon, 0.48 at
#: the bottom edge) because a "split the frame in two" objective is dominated by
#: the overall top-bright, bottom-dark trend and has no peak at the boundary at
#: all. A global split cannot find a local edge.
#:
#: So this does the one thing it can do honestly: `STAGE_COMPOSITION` asks the
#: model for tyres at 72% of the height and the model lands NEAR it, so the
#: floor is snapped to the nearest real material boundary within reach of the
#: line that was asked for. A plate that ignored the clause by more than this is
#: not a plate to make a silent guess about — it gets the fallback, and looks
#: exactly as it did before this function existed.
_GROUND_SEARCH = 0.11

#: The scale a boundary is looked for at: a material edge is a step over a few
#: percent of the frame, not a gradual recession over a third of it.
_GROUND_WINDOW = 0.03

#: How much of a step counts as a floor. Below this there is no boundary near
#: the asked-for line and the fallback is the honest answer.
_GROUND_MIN_STEP = 0.14

#: The scales the step is measured against, in 8-bit levels: a texture step of
#: this much mean gradient, or this much luma, is a whole floor's worth of
#: evidence. Absolute rather than normalised ON PURPOSE — min-maxing across rows
#: turns the random variation of a uniform noise plate into a confident answer.
_TEX_SCALE = 24.0
_LUMA_SCALE = 60.0


@dataclass(frozen=True)
class StageLight:
    """The lighting of one plate, measured rather than authored."""

    #: Unit vector the key light travels FROM, in image space (x right, y down).
    kx: float
    ky: float
    #: The key's colour, and how hard it is (0 flat overcast … 1 hard sun).
    key: tuple[int, int, int]
    strength: float
    #: What fills the shadows, and what the ground throws back up.
    sky: tuple[int, int, int]
    bounce: tuple[int, int, int]


def _local_step(v, k: int):
    """For every row, how far the `k` rows below it sit from the `k` above.

    A LOCAL edge detector, at the scale a material boundary actually has. The
    first version compared the mean of EVERYTHING below a row with the mean of
    everything above it, which is a different question — it asks where the
    picture divides in two, and a plate that simply darkens toward the bottom
    answers "at the bottom", however sharp the real boundary further up is.

    One cumulative sum rather than a window per row: a 2K plate has two thousand
    candidates and this runs on the request path.
    """
    import numpy as np

    n = len(v)
    cs = np.concatenate([[0.0], np.cumsum(v)])
    i = np.arange(n)
    lo = np.clip(i - k, 0, n)
    hi = np.clip(i + k, 0, n)
    above = np.where(i > lo, (cs[i] - cs[lo]) / np.maximum(i - lo, 1), 0.0)
    below = np.where(hi > i, (cs[hi] - cs[i]) / np.maximum(hi - i, 1), 0.0)
    return np.abs(below - above)


def ground_line(plate) -> float:
    """Where this plate's own floor begins, as a fraction of its height.

    TWO SIGNALS, BECAUSE EITHER ONE ALONE IS BLIND. Brightness finds the floor
    on most plates — a sky is not the colour of a road — and finds nothing at
    all on a limestone village square, where the ground is exactly as bright as
    the air above it. Texture is the signal that survives that case, and §3
    already established mean gradient as this pipeline's texture proxy: the near
    field has grain and the distance has none. Each is scored on its own and
    only their MAGNITUDES are added, because on a normal plate they point in
    opposite directions — a bright sky over textured ground — and a single
    combined feature cancels itself out exactly when it is needed.

    MEASURED DOWN THE MIDDLE. `bike_build.STAGE_COMPOSITION` puts the machine in
    the centre and reserves the outer eighth of the frame for nothing, so the
    centre is both where the answer matters and where the near layer of foliage
    the plate prompt asks for is least likely to lie about it.

    Returns `CONTACT_FALLBACK` when there is no floor to find.
    """
    try:
        import numpy as np

        a = np.asarray(plate.convert("L"), dtype=np.float32)
        h, w = a.shape
        if h < 16 or w < 4:
            return CONTACT_FALLBACK
        # NATIVE PIXEL SPACING, NOT A RESIZE. Downscaling averages grain away,
        # which is the one thing being measured — so this takes a slice of real
        # columns instead of a smaller copy of all of them.
        if w > 384:
            c0 = (w - 384) // 2
            a = a[:, c0:c0 + 384]

        luma = a.mean(axis=1)
        tex_x = np.abs(np.diff(a, axis=1)).mean(axis=1)
        tex_y = np.abs(np.diff(a, axis=0)).mean(axis=1)
        tex = tex_x.copy()
        tex[:-1] = 0.5 * (tex_x[:-1] + tex_y)

        k = max(2, int(h * _GROUND_WINDOW))
        score = (
            0.70 * np.clip(_local_step(tex, k) / _TEX_SCALE, 0.0, 1.0)
            + 0.30 * np.clip(_local_step(luma, k) / _LUMA_SCALE, 0.0, 1.0)
        )

        lo = max(k, int(h * (CONTACT_FALLBACK - _GROUND_SEARCH)))
        hi = min(len(score) - k, int(h * (CONTACT_FALLBACK + _GROUND_SEARCH)))
        if hi <= lo:
            return CONTACT_FALLBACK
        band = score[lo:hi]
        best = int(np.argmax(band))
        if float(band[best]) < _GROUND_MIN_STEP:
            return CONTACT_FALLBACK
        return (lo + best) / h
    except Exception:
        # A plate we cannot measure is not a plate we refuse to stand a bike on.
        logger.warning("ground line unreadable; using the default", exc_info=True)
        return CONTACT_FALLBACK


def bike_box(size, bike, contact: float):
    """Where the machine is drawn, for one plate size and one measured floor.

    Named and exported because two callers need to agree on it: `compose` draws
    the bike there, and anything that wants to know where the machine stands —
    a near-ground layer, a costume, a share card — must not re-derive it.
    """
    W, H = size
    bw = int(W * BIKE_W)
    bh = int(bw / (bike.width / bike.height))
    x0 = (W - bw) // 2
    y1 = int(H * contact)
    return (x0, y1 - bh, x0 + bw, y1)


def read_light(plate, ground: float | None = None) -> StageLight:
    """Measure a plate's lighting.

    The key direction is the vector from the frame's centre to the brightest
    weighted point of the upper half — for a sky with a sun in it that is the
    sun, and for an overcast one it lands near the top centre, which is the
    right answer for overcast. `strength` is the spread between the brightest
    and the median of the upper half: a hard sun separates them, a flat sky does
    not, and that single number decides how much modelling the machine gets.
    """
    from PIL import Image, ImageFilter

    contact = ground_line(plate) if ground is None else ground
    small = plate.convert("RGB").resize((96, 172), Image.LANCZOS)
    blur = small.filter(ImageFilter.GaussianBlur(2.0))
    px = blur.load()
    w, h = blur.size
    top = int(h * 0.55)

    lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

    best, bx, by = -1.0, w / 2, 0.0
    vals = []
    for y in range(top):
        for x in range(w):
            v = lum(px[x, y])
            vals.append(v)
            if v > best:
                best, bx, by = v, x, y
    vals.sort()
    median = vals[len(vals) // 2] if vals else 0.0
    strength = max(0.0, min(1.0, (best - median) / 140.0))

    # Direction from the subject toward the light.
    dx, dy = (bx - w / 2), (by - h * contact)
    n = math.hypot(dx, dy) or 1.0
    kx, ky = dx / n, dy / n

    key = px[int(bx), int(by)]
    sky = blur.crop((0, 0, w, max(1, top // 2))).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    gy = int(h * contact)
    bounce = blur.crop((0, gy, w, h)).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    return StageLight(kx, ky, key, strength, sky, bounce)


def _fields(alpha):
    """Form, edge and normals, approximated from the silhouette alone.

    A cut-out has no surface normals. What it does have is an alpha, and the
    gradient of a heavily blurred alpha points outward from the silhouette — a
    usable stand-in for "which way is this bit of the machine facing". `depth`
    is how far inside the shape a pixel sits, which stands in for how much the
    tubing turns away from the viewer.
    """
    import numpy as np
    from PIL import Image, ImageFilter

    a = np.asarray(alpha, dtype=np.float32) / 255.0
    soft = np.asarray(
        Image.fromarray((a * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(9.0)),
        dtype=np.float32,
    ) / 255.0
    gy, gx = np.gradient(soft)
    mag = np.hypot(gx, gy) + 1e-6
    nx, ny = -gx / mag, -gy / mag          # outward-facing
    depth = np.clip(soft, 0.0, 1.0)
    edge = np.clip(mag / (mag.max() or 1.0), 0.0, 1.0)
    return a, depth, edge, nx, ny


def relight(bike, light: "StageLight", frame_h: int):
    """Relight a cut-out to a stage's measured light. Returns RGBA.

    Five passes, each answering one thing the eye checks: is it the right
    colour for this place, does it have form, does the light wrap its edge,
    does the ground throw anything back, and is it as contrasty as its
    surroundings. Nothing here is authored per stage — every number comes from
    `read_light`, so fifty stages produce fifty different results.
    """
    import numpy as np
    from PIL import Image

    rgb = np.asarray(bike.convert("RGB"), dtype=np.float32) / 255.0
    a, depth, edge, nx, ny = _fields(bike.getchannel("A"))

    key = np.array(light.key, dtype=np.float32) / 255.0
    sky = np.array(light.sky, dtype=np.float32) / 255.0
    bnc = np.array(light.bounce, dtype=np.float32) / 255.0
    s = light.strength

    # THE LIGHT MULTIPLIES, IT DOES NOT ADD. The first version added the key
    # colour on top of the machine, which washes out dark albedo: a matte black
    # frame came back bronze on a sunset stage and chrome on a bright one. A
    # surface can only ever REFLECT the light that falls on it, so the base
    # colour is multiplied by the illumination and only the rim — a specular
    # highlight, which genuinely is additive — is added afterwards, and small.

    # 1 · ILLUMINATION — what light actually falls on each part of the machine.
    #     Sky fills everything; the key adds on top of it wherever the
    #     silhouette turns toward the light, falling off into the shape.
    facing = np.clip(nx * light.kx + ny * light.ky, -1.0, 1.0)
    lit = np.clip(facing, 0.0, 1.0) * (0.35 + 0.65 * depth)

    ambient = sky[None, None, :] * (0.55 + 0.25 * (1.0 - s))
    direct = key[None, None, :] * (lit * (0.55 + 0.75 * s))[..., None]

    # 2 · BOUNCE — the ground throws its own colour up onto the underside, and
    #     only onto the parts the key cannot reach.
    h = rgb.shape[0]
    up = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None] ** 2
    bounced = bnc[None, None, :] * (up * (1.0 - np.clip(facing, 0.0, 1.0)) * 0.55)[..., None]

    illum = ambient + direct + bounced
    out = rgb * illum * 1.55                     # 1.55 keeps mid-greys where they were

    # 3 · RIM — the one additive term, because a specular highlight really is
    #     light added rather than reflected. Edge only, key-facing only, and
    #     deliberately small: this is the thing that reads as expensive and the
    #     thing that ruins the picture when it is overdone.
    rim = edge * np.clip(facing, 0.0, 1.0) ** 3
    out += (rim * (0.22 + 0.42 * s))[..., None] * key[None, None, :]

    # 4 · CONTRAST — a hard-lit scene wants a hard-lit subject.
    mid = 0.5
    out = np.clip(mid + (out - mid) * (1.0 + 0.18 * s), 0.0, 1.0)

    img = Image.fromarray((out * 255).astype("uint8"), "RGB").convert("RGBA")
    img.putalpha(bike.getchannel("A"))
    return img


def _shadow(bike, light: "StageLight", size, box):
    """The machine's shadow, cast by the SAME light the relighting used.

    A shadow that disagrees with the highlights is the loudest possible tell,
    so both come from one measurement. The silhouette is squashed toward the
    ground plane and sheared away from the key — a cheap projection that reads
    correctly because the camera is locked side-on — then blurred by how soft
    the light is: a hard sun keeps its edges, an overcast sky does not.
    """
    import numpy as np
    from PIL import Image, ImageFilter

    W, H = size
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    s = light.strength

    sil = bike.getchannel("A").resize((bw, bh), Image.LANCZOS)
    squash = 0.16 + 0.10 * (1.0 - s)          # how flat it lies on the ground
    sh_h = max(4, int(bh * squash))
    sil = sil.resize((bw, sh_h), Image.LANCZOS)

    # Away from the light, and further when the light is low.
    lean = -light.kx * (1.0 - abs(light.ky)) * 2.4 - light.kx * 0.55
    dx = int(bw * lean * 0.5)

    canvas = Image.new("L", (W, H), 0)
    canvas.paste(sil, (x0 + dx, y1 - sh_h // 2))
    canvas = canvas.filter(ImageFilter.GaussianBlur(bw * (0.030 + 0.055 * (1.0 - s))))

    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    arr *= (0.55 + 0.40 * s)

    # THE OCCLUSION CORE. A cast shadow alone still floats; what plants a thing
    # is the near-black where its contact patch shuts the light out entirely.
    core = Image.new("L", (W, H), 0)
    core.paste(sil.resize((bw, max(3, sh_h // 3)), Image.LANCZOS), (x0, y1 - sh_h // 6))
    core = core.filter(ImageFilter.GaussianBlur(bw * 0.012))
    arr = np.clip(arr + np.asarray(core, dtype=np.float32) / 255.0 * 0.55, 0.0, 1.0)
    return Image.fromarray((arr * 255).astype("uint8"), "L")


def _lay_shadow(plate, shadow, light: "StageLight"):
    """Put the shadow on the ground the way light actually works.

    THE BUG THIS REPLACES, and it was named in the document that specified this
    module before it was written. §5.4: "A real shadow is not an absence of
    light, it is a region lit ONLY by the sky — blue at noon, orange at sunset.
    Subtracting grey produces a dead patch no photograph contains." This function
    subtracted grey. Measured on a warm road under a blue sky, lit ground
    (205,165,105) became (178,138,78): the same 27 levels off every channel, so
    the shadow came out very slightly WARMER than the sunlit ground beside it,
    under a sky that is the only thing lighting it.

    A shadow is not a subtraction, it is a MULTIPLICATION — the same argument
    `relight` already makes for the machine, applied to the floor it stands on.
    Blocking the key leaves the surface lit by the sky alone, so what remains is
    the plate's own colour times the sky's colour, dimmer and tinted.

    TINTED, NOT MONOCHROME. Normalising the sky to its brightest channel keeps
    every factor at or below one, so no channel can be brighter in shadow than
    out of it; the 0.6 power then eases the hue back, because a shadow carries a
    cast of the sky rather than becoming a picture of it.
    """
    import numpy as np
    from PIL import Image

    rgb = np.asarray(plate.convert("RGB"), dtype=np.float32)
    a = np.asarray(shadow, dtype=np.float32)[..., None] / 255.0

    sky = np.array(light.sky, dtype=np.float32)
    tint = (sky / max(float(sky.max()), 1.0)) ** 0.6

    # How much light the key was contributing, and therefore how much is lost
    # when the machine blocks it: a hard sun leaves a deep shadow, an overcast
    # sky barely leaves one at all.
    depth = 0.35 + 0.35 * light.strength
    ambient = tint * (1.0 - depth)

    k = (1.0 - a) + a * ambient[None, None, :]
    return Image.fromarray(np.clip(rgb * k, 0, 255).astype("uint8"), "RGB")


def compose(plate, bike, *, costume=None, costume_offset=(0.0, 0.0)):
    """A stage, finished. The plate is untouched and the machine is untouched.

    `costume` is an optional RGBA layer — a katana, a flag, a string of lights —
    composited at a fraction of the bike's own box. It is relit by the same
    measured light, so it belongs to the picture rather than sitting on top of
    it, and like the machine it is never model-generated and therefore cannot
    drift.
    """
    from PIL import Image

    W, H = plate.size
    # ONE MEASUREMENT, TWO USERS. The floor decides both where the machine
    # stands and where `read_light` samples the bounce, and the two disagreeing
    # is a bike lit by a road it is not standing on.
    contact = ground_line(plate)
    light = read_light(plate, contact)

    box = bike_box((W, H), bike, contact)
    bw, bh = box[2] - box[0], box[3] - box[1]

    shadow = _shadow(bike, light, (W, H), box)
    ground = _lay_shadow(plate, shadow, light)

    canvas = ground.convert("RGBA")
    canvas.alpha_composite(relight(bike, light, H).resize((bw, bh), Image.LANCZOS), (box[0], box[1]))

    if costume is not None:
        cw = int(bw * costume.width / bike.width)
        ch = int(cw * costume.height / costume.width)
        cx = box[0] + int(bw * costume_offset[0])
        cy = box[1] + int(bh * costume_offset[1])
        canvas.alpha_composite(relight(costume, light, H).resize((cw, ch), Image.LANCZOS), (cx, cy))

    return canvas.convert("RGB")
