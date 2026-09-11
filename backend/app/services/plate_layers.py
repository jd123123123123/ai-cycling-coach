"""Split a stage plate into the half behind the machine and the half in front.

WHY THIS EXISTS. Today's hero composites the rider's bike as a CUT-OUT over a
stage plate — two sibling DOM layers, the plate underneath. That means the plate
is behind the machine by construction: a tyre can never sink into grass, and
every scene reads as a sticker laid on a landscape however well the plate itself
was rendered. Prompting cannot fix it; only a second layer can.

`split` cuts the plate's near ground into a transparent PNG that the client
paints ABOVE the bike (`W3TodayStage`, z-order plate 0 · machine 1 · near ground
2 · chrome 3). The wheels then disappear into the material instead of standing
on a picture of it.

WHY THE FRONT LAYER IS CUT FROM THE PLATE AND NOT RENDERED SEPARATELY. A second
render of "the same grass, isolated" never matches — different blade directions,
a different sun angle, a palette half a step off — and the seam reads instantly
against a plate the eye is already looking at. Cutting the band out of the plate
makes the match structural: they are the same pixels. Composited back in
register the duplication is invisible, because the only thing that changed is
what those pixels are drawn OVER.

THE TOP EDGE IS THE ENTIRE PROBLEM. A straight horizontal cut reads as a strip
of wallpaper laid across the bike — worse than no layer at all. So the alpha
ramps in over a tall feather, smoothstepped so the ramp does not band, and the
ramp's start is displaced per column by multi-octave noise. The boundary then
wanders the way a real grass line wanders.

WHAT THIS DOES NOT DO. It does not know where the bike is. The band is placed by
fraction, and `BAND_TOP` is tuned to sit just below the horizon so it eats the
contact patch and nothing above the hub. A plate whose horizon sits elsewhere
needs its own `band_top`, which is why the caller may pass one.
"""
from __future__ import annotations

import base64
import io
import logging
import math
import random

logger = logging.getLogger(__name__)

#: Where the near ground begins, as a fraction of plate height. Just below the
#: measured horizon: high enough to bury the tyre contact patch, low enough that
#: it never crosses a hub and turns the wheel into a floating arc.
BAND_TOP = 0.755

#: How far the alpha takes to reach opaque, as a fraction of plate height. Tall
#: on purpose — a short ramp is a visible edge, and a visible edge is the defect.
FEATHER = 0.13

#: How far the boundary may wander on noise alone, as a fraction of the feather.
WANDER = 0.9

#: How far the plate's own blurred luminance may lift the boundary — what makes
#: the edge climb over a boulder instead of ruling straight through it.
LIFT = 0.7


def _noise_row(width: int, seed: int) -> list[float]:
    """Smooth multi-octave 1-D noise in [-1, 1] — the ragged grass line.

    Three octaves rather than one: a single sine is a wave, and a wave reads as
    a decorative scallop. Layered periods read as vegetation.
    """
    octaves = (73, 167, 349)
    amps = (1.0, 0.5, 0.25)
    rnd = random.Random(seed)
    phases = [rnd.random() * math.tau for _ in octaves]
    total = sum(amps)
    return [
        sum(a * math.sin(x / o * math.tau + p) for o, a, p in zip(octaves, amps, phases)) / total
        for x in range(width)
    ]


def split(
    plate_b64: str,
    *,
    band_top: float = BAND_TOP,
    feather: float = FEATHER,
    seed: int = 7,
) -> tuple[str, str] | None:
    """`(back_png_b64, front_png_b64)` for one plate, or None if it cannot be read.

    The back layer is the plate unchanged — the machine is drawn over all of it.
    The front layer is the same pixels carrying an alpha that fades in downward.

    Never raises: a stage that cannot be split must fall back to the single-layer
    plate it has always been, not take the room down with it.
    """
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except Exception:                                    # pragma: no cover
        logger.warning("plate_layers: Pillow unavailable")
        return None

    try:
        raw = base64.b64decode(plate_b64.split(",", 1)[-1])
        im = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        logger.warning("plate_layers: unreadable plate", exc_info=True)
        return None

    w, h = im.size
    if w < 8 or h < 8:
        return None

    top = int(h * band_top)
    feather_px = max(1, int(h * feather))
    noise = _noise_row(w, seed)

    # ── A SOLID BAND WITH A SHAPED TOP EDGE ───────────────────────────────
    #
    # Two wrong versions got us here and both are worth recording.
    #
    # 1. A smooth vertical alpha ramp. That is a translucent VEIL, not
    #    occlusion: the ground showed straight through the wheels and the
    #    machine read as a ghost. Occlusion is binary per pixel.
    # 2. A binary mask keyed on the plate's local contrast, so lit stones would
    #    occlude and shadowed gaps would not. It produced mush — the plate's
    #    foreground is rendered heavily OUT OF FOCUS, so there is no crisp
    #    silhouette left in the pixels to recover. You cannot matte individual
    #    objects out of an image whose blur has already merged them with what
    #    is behind them.
    #
    # So the band is SOLID, and all the work goes into the one line that
    # matters: its top edge. That edge is displaced by multi-octave noise AND
    # by the plate's own heavily-blurred luminance, so it climbs over the pale
    # mass of a boulder and dips into the dark gap beside it — content-aware at
    # the only scale that survives a defocus, and unambiguous everywhere else.
    grey = im.convert("L").filter(ImageFilter.GaussianBlur(radius=max(3.0, w / 55)))
    gpx = grey.load()

    probe_y = min(h - 1, top + feather_px // 2)
    raw = [
        top + (noise[x] * WANDER + ((gpx[x, probe_y] / 255.0 - 0.5) * 2.0) * LIFT) * feather_px
        for x in range(w)
    ]

    # SMOOTH THE CURVE ALONG X, and this is the step whose absence produced a
    # comb. Drawn straight, the edge changes by tens of pixels between adjacent
    # columns and the machine looks shredded rather than occluded. A real stone
    # silhouette undulates over TENS of pixels, so the boundary is averaged over
    # a window of that order before anything is drawn.
    span = max(3, int(w / 70))
    edge = []
    for x in range(w):
        lo, hi = max(0, x - span), min(w, x + span + 1)
        edge.append(sum(raw[lo:hi]) / (hi - lo))

    alpha = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(alpha)
    for x in range(w):
        draw.line([(x, max(0, int(edge[x]))), (x, h)], fill=255)

    # Anti-aliasing on the silhouette, and nothing more. Any real blur here
    # brings the veil straight back.
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=0.8))


    front = im.copy().convert("RGBA")
    front.putalpha(alpha)

    def _b64(img: "Image.Image") -> str:
        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()

    return _b64(im), _b64(front)
