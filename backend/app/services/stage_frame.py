"""Stand every stage's machine in the same box, by measurement rather than by asking.

WHY THIS EXISTS. `bike_build.BIKE_CAMERA` asks in prose for a centred machine
filling the frame with an even margin, and `STAGE_COMPOSITION` states the crop
budget as percentages. The model lands NEAR both and never on them. Measured
across nine finished stages of one rider's bike:

    contact line, as a fraction of frame height   0.637 … 0.840   (spread 0.203)
    wheelbase, as a fraction of frame width       0.470 … 0.555   (spread 0.086)
    midpoint, as a fraction of frame width        0.489 … 0.510   (spread 0.021)

So the tyres were landing anywhere across a FIFTH of the frame height. Swiping
through a rider's collection made the bicycle jump — bigger here, lower there —
while the world changed behind it, and for a collectible whose whole promise is
"this is the same machine every time" that is the one thing that must not
happen. No prompt wording fixes it: §2 of `docs/w3-stage-rendering.md` already
measured that prose composition gets traded away, and percentages hold better
than words without being obeyed.

SO NORMALISE AFTERWARDS, WHICH IS ARITHMETIC. Find the machine in the render,
compute the one similarity transform that puts it on a canonical box, and apply
it while downscaling — the resize from the render to the stored frame is already
happening, so the correction is free and costs no extra sharpness. After it, the
same nine stages hold the contact line to a spread of 0.005 and the wheelbase to
0.007: forty times and twelve times tighter.

FINDING IT: THE TWO WHEELS. Everything else about the machine varies between
stages. The bars and the saddle are ambiguous against a busy world, the
silhouette depends on background contrast, and the paint is relit every time.
The wheels do not: they are two circles of equal radius on a horizontal line,
and `BIKE_CAMERA` locks a flat side elevation precisely so they stay true
circles rather than ellipses. From two circles come all three numbers the
transform needs — scale from the centre separation, horizontal position from the
midpoint, and the contact line from centre-y plus radius.

AND THE RIDER'S OWN CUT-OUT CALIBRATES IT. The wheelbase-to-wheel-radius ratio
is the one thing that makes the search stable (see `_refine`), and it does not
have to be assumed: the stored cut-out has an ALPHA CHANNEL, so that bike's own
geometry is exactly measurable with no circle fitting at all — two contact runs
in the bottom row give the separation, and the leftmost column's run gives the
wheel centre height. Measured on a real Standert the true ratio is 2.878 where
the road-bike average is 2.93, and on a fat bike or a 650b frame the gap would
be far larger. `geometry_from_cutout` reads it; `RATIO_DEFAULT` is only the
fallback for a bike whose cut-out cannot be measured.

NO NEW DEPENDENCY. numpy and Pillow are both already hard requirements; this
container has no cv2, no scipy and no skimage, and a framing step is not worth a
60 MB wheel. Detection runs on a 280 px copy and costs 0.42 s against a 17-21 s
model render.

NEVER FATAL, AND NEVER A GUESS. A render whose wheels cannot be found, or whose
detection fails the plausibility gate, is returned exactly as it would have been
before this module existed, and logged. A stage framed slightly wrong is worth
having; a stage mangled by a bad measurement is not.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# ── the composition contract ────────────────────────────────────────────────
#
# THESE THREE NUMBERS ARE THE REAL CONTRACT, and they belong here rather than in
# prose. `STAGE_COMPOSITION` has been asking the model for them and not getting
# them; enforced by arithmetic they simply hold. Chosen at the MEDIAN of what
# nine real renders already produced, so the corrections are small and
# symmetric rather than all pulling one way.
TARGET_SEP = 0.520      # wheel-centre separation, as a fraction of frame width
TARGET_MID_X = 0.500    # midpoint between the wheel centres
TARGET_CONTACT = 0.735  # where the tyres meet the ground, as a fraction of height

#: Wheelbase over wheel radius, when a bike's own cut-out cannot be measured.
#: About 1.00 m over 0.34 m for a road bicycle — and the coarse vote returned
#: 2.89-2.96 unprompted across eight real renders, which is the same number.
RATIO_DEFAULT = 2.93

#: How far a pair may sit from the calibrated ratio and still be that bicycle.
_RATIO_TOL = 0.14
#: How much of the frame width the wheelbase may plausibly span on a stage.
#: Outside this the detection is wrong, and a wrong detection must decline.
_FILL_MIN, _FILL_MAX = 0.32, 0.68

#: How much of each wheel's circumference must actually BE a radial edge,
#: relative to the picture's own gradient level.
#:
#: THE GATE THAT STOPS A CONFIDENT WRONG ANSWER. Without it the vote always
#: returns its best pair however weak, because the search only ranks candidates
#: and never judges them — so pure random noise came back as a bicycle. The
#: separation is enormous and was measured rather than chosen: across five real
#: stage renders the weaker wheel covered 0.69 to 0.98 of its circumference,
#: a synthetic circle covered 1.00, and uniform noise covered 0.06. A floor here
#: sits five times above noise and comfortably below every real reading, with
#: room for a wheel half-hidden by foreground grass.
_MIN_COVERAGE = 0.35

_DET_W = 280            # detection width in pixels
_EDGE_PCT = 92.0        # keep the strongest gradients only
_ALPHA_ON = 0.55        # what counts as opaque when reading a cut-out


@dataclass(frozen=True)
class Wheels:
    """Both wheels of one machine: shared radius, shared centre height."""

    left_x: float
    right_x: float
    centre_y: float
    radius: float

    @property
    def sep(self) -> float:
        return abs(self.right_x - self.left_x)

    @property
    def mid_x(self) -> float:
        return (self.left_x + self.right_x) / 2.0

    @property
    def contact_y(self) -> float:
        return self.centre_y + self.radius

    @property
    def ratio(self) -> float:
        return self.sep / self.radius if self.radius else 0.0


# ── exact geometry, from a cut-out's alpha ──────────────────────────────────

def geometry_from_cutout(data_url: str) -> float | None:
    """This bike's own wheelbase-to-radius ratio, or None.

    NO CIRCLE FITTING AND NO GUESSING. A cut-out carries its geometry in its
    alpha channel, so the two measurements needed are direct reads:

      · the bottom band of the silhouette contains exactly TWO runs — the two
        contact patches — and their centres are the wheel positions;
      · at the leftmost opaque column the only thing present is the rear tyre's
        back edge, so that run's vertical midpoint is the wheel centre height,
        and the radius is the distance down to the contact row.

    Returns None rather than a number whenever the silhouette does not look like
    a side-on bicycle — two contact patches and nothing else — because a wrong
    ratio is worse than the average one.
    """
    try:
        import base64
        import io

        import numpy as np
        from PIL import Image

        raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
        im = Image.open(io.BytesIO(base64.b64decode(raw)))
        if "A" not in im.mode:
            return None
        a = (np.asarray(im.convert("RGBA").getchannel("A"), dtype=np.float32) / 255.0) > _ALPHA_ON
        if a.sum() < 500:
            return None
        ys, xs = np.nonzero(a)
        x0, x1, y1 = int(xs.min()), int(xs.max()), int(ys.max())
        width = x1 - x0 + 1
        if width < 32:
            return None

        # The contact patches: the bottom band, split into runs. A gap of more
        # than a fortieth of the machine's width separates two wheels.
        band = a[max(0, y1 - max(2, width // 180)):y1 + 1, :]
        cols = np.nonzero(band.any(axis=0))[0]
        if len(cols) < 4:
            return None
        gap = max(6, width // 40)
        runs: list[tuple[int, int]] = []
        start = prev = int(cols[0])
        for c in cols[1:]:
            c = int(c)
            if c > prev + gap:
                runs.append((start, prev))
                start = c
            prev = c
        runs.append((start, prev))
        if len(runs) != 2:
            # One run is a bike seen end-on or a blob; three or more is a
            # kickstand, a shadow or something that is not this camera.
            return None

        sep = ((runs[1][0] + runs[1][1]) - (runs[0][0] + runs[0][1])) / 2.0
        left_col = a[:, x0:x0 + max(2, width // 270)].any(axis=1)
        rows = np.nonzero(left_col)[0]
        radius = float(y1 - (int(rows.min()) + int(rows.max())) / 2.0)
        if radius <= 4 or sep <= 0:
            return None
        ratio = sep / radius
        if not (RATIO_DEFAULT * (1 - 0.45) <= ratio <= RATIO_DEFAULT * (1 + 0.45)):
            return None
        return round(float(ratio), 4)
    except Exception:
        logger.warning("cut-out geometry unreadable; using the default ratio", exc_info=True)
        return None


# ── finding the wheels in a rendered stage ─────────────────────────────────

def _box(a, r: int):
    """Mean over a (2r+1) square, via an integral image.

    Pillow's Gaussian blur refuses mode "F", and a box pass twice over is
    plenty for smoothing a vote accumulator.
    """
    import numpy as np

    h, w = a.shape
    ii = np.zeros((h + 1, w + 1), dtype=np.float64)
    ii[1:, 1:] = a.cumsum(0).cumsum(1)
    ys = np.arange(h)
    xs = np.arange(w)
    y0 = np.clip(ys - r, 0, h)[:, None]
    y1 = np.clip(ys + r + 1, 0, h)[:, None]
    x0 = np.clip(xs - r, 0, w)[None, :]
    x1 = np.clip(xs + r + 1, 0, w)[None, :]
    s = ii[y1, x1] - ii[y0, x1] - ii[y1, x0] + ii[y0, x0]
    return (s / ((y1 - y0) * (x1 - x0))).astype(np.float32)


def _ring_score(gx, gy, cx: float, cy: float, r: float, n: int = 96) -> float:
    """How circular an edge actually sits at (cx, cy, r).

    Samples the circumference and dots the local gradient with the radial unit
    vector, so an edge that genuinely curves around this centre scores and a
    straight edge crossing it does not. This is the check the coarse vote cannot
    make: the vote proposes candidates, this decides between neighbours.
    """
    import numpy as np

    h, w = gx.shape
    t = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)
    ux, uy = np.cos(t), np.sin(t)
    xs = cx + r * ux
    ys = cy + r * uy
    ok = (xs >= 1) & (xs < w - 1) & (ys >= 1) & (ys < h - 1)
    if ok.sum() < n * 0.6:
        return -1.0
    xi = xs[ok].astype(np.int32)
    yi = ys[ok].astype(np.int32)
    return float(np.abs(gx[yi, xi] * ux[ok] + gy[yi, xi] * uy[ok]).mean())


def _coverage(gx, gy, cx: float, cy: float, r: float, med: float, n: int = 180) -> float:
    """The fraction of this circle's circumference that is a real radial edge.

    `_ring_score` returns an average, which a few very strong points can carry;
    this returns a COUNT, which they cannot. That difference is what separates a
    wheel from a field of noise — see `_MIN_COVERAGE`.
    """
    import numpy as np

    h, w = gx.shape
    t = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False)
    ux, uy = np.cos(t), np.sin(t)
    xs = cx + r * ux
    ys = cy + r * uy
    ok = (xs >= 1) & (xs < w - 1) & (ys >= 1) & (ys < h - 1)
    if ok.sum() < n * 0.6:
        return 0.0
    xi = xs[ok].astype(np.int32)
    yi = ys[ok].astype(np.int32)
    radial = np.abs(gx[yi, xi] * ux[ok] + gy[yi, xi] * uy[ok])
    return float((radial > 2.0 * med).mean())


def _refine(gx, gy, lx: float, rx: float, cy: float, ratio: float):
    """Sharpen the pair under the constraints a bicycle actually obeys.

    ONE RADIUS AND ONE CENTRE HEIGHT, AND THE RADIUS IS NOT FREE. On a locked
    side elevation both wheels are the same size and sit on the same horizontal
    line, so those are one shared pair rather than two measurements each; and
    the radius follows from the separation through this bike's own `ratio`.

    LEAVING THE RADIUS FREE WAS MEASURED AND IT DEGENERATES. The score happily
    shrinks a circle onto a short stretch of strong edge: it took a real lunar
    render's wheels from 189 px to 150 px and a pasture render's to 54 px, both
    physically impossible at the separation they sat at. Pinning it removes the
    one degenerate direction in the search, leaving three unknowns — the two
    centre-x values and the shared centre-y.
    """
    import numpy as np

    best = None
    for dlx in np.arange(-9.0, 9.1, 1.5):
        for drx in np.arange(-9.0, 9.1, 1.5):
            sep = abs((rx + drx) - (lx + dlx))
            rr = sep / ratio
            if rr < 5:
                continue
            for dy in np.arange(-9.0, 9.1, 1.5):
                yy = cy + dy
                sl = _ring_score(gx, gy, lx + dlx, yy, rr)
                sr = _ring_score(gx, gy, rx + drx, yy, rr)
                if sl <= 0 or sr <= 0:
                    continue
                # The weaker wheel carries the score, so a good fit on one and
                # nothing on the other cannot win.
                score = min(sl, sr) + 0.35 * (sl + sr)
                if best is None or score > best[0]:
                    best = (score, lx + dlx, rx + drx, yy, rr)
    if best is None:
        return None
    _, nlx, nrx, ncy, nr = best
    return nlx, nrx, ncy, nr


def find_wheels(img, ratio: float = RATIO_DEFAULT) -> Wheels | None:
    """Both wheels of the machine in a rendered stage, or None.

    A gradient-direction Hough vote: at a circle's edge the luminance gradient
    points along the radius, so every strong edge pixel votes for a centre one
    radius away in each direction. Circles accumulate; texture does not.

    SCORED AS PAIRS, NOT AS PEAKS. The strongest single circle is usually a
    wheel and occasionally the sun, an arch or a bin lid, so only pairs that
    satisfy this bicycle's own geometry are considered — one radius, one centre
    height, and a separation that matches `ratio`.
    """
    try:
        import numpy as np
        from PIL import Image, ImageFilter

        w0, h0 = img.size
        if w0 < 64 or h0 < 64:
            return None
        k = _DET_W / w0
        small = img.convert("L").resize((_DET_W, max(8, round(h0 * k))), Image.LANCZOS)
        a = np.asarray(small.filter(ImageFilter.GaussianBlur(1.1)), dtype=np.float32)
        h, w = a.shape

        gy, gx = np.gradient(a)
        mag = np.hypot(gx, gy)
        ys, xs = np.nonzero(mag > np.percentile(mag, _EDGE_PCT))
        if len(xs) < 200:
            return None
        n = mag[ys, xs]
        nx, ny = gx[ys, xs] / n, gy[ys, xs] / n

        # The wheelbase must fall inside the plausibility gate, so the radius
        # only has to be searched over the band that gate allows.
        r_lo = max(5, int(w * _FILL_MIN / ratio) - 3)
        r_hi = int(w * _FILL_MAX / ratio) + 3
        sep_lo, sep_hi = ratio * (1 - _RATIO_TOL), ratio * (1 + _RATIO_TOL)

        best = None
        for r in range(r_lo, r_hi + 1, 2):
            acc = np.zeros((h, w), dtype=np.float32)
            for sgn in (-1.0, 1.0):
                cx = np.rint(xs + sgn * r * nx).astype(np.int32)
                cy = np.rint(ys + sgn * r * ny).astype(np.int32)
                ok = (cx >= 0) & (cx < w) & (cy >= 0) & (cy < h)
                np.add.at(acc, (cy[ok], cx[ok]), 1.0)
            # Normalise by circumference so a big radius cannot win on sheer
            # number of votes, and smooth so a slightly-off circle still peaks.
            acc = _box(_box(acc, 2), 2) / float(r)

            flat = acc.ravel()
            top = np.argpartition(flat, -40)[-40:]
            cand = sorted(((flat[t], int(t % w), int(t // w)) for t in top), reverse=True)
            for i in range(len(cand)):
                sa, xa, ya = cand[i]
                for j in range(i + 1, len(cand)):
                    sb, xb, yb = cand[j]
                    sep = abs(xa - xb)
                    if sep < r * sep_lo or sep > r * sep_hi:
                        continue
                    if abs(ya - yb) > sep * 0.09:
                        continue
                    score = (sa + sb) * (1.0 - abs(ya - yb) / max(sep, 1))
                    if best is None or score > best[0]:
                        lo, hi = (xa, xb) if xa < xb else (xb, xa)
                        best = (score, float(lo), float(hi), (ya + yb) / 2.0, float(r))
        if best is None:
            return None

        sharp = _refine(gx, gy, best[1], best[2], best[3], ratio)
        if sharp is None:
            return None
        lx, rx, cy, r = sharp
        if not (_FILL_MIN <= abs(rx - lx) / float(w) <= _FILL_MAX):
            return None
        # IS IT ACTUALLY THERE. The search ranks candidates; nothing so far has
        # judged whether the winner is a wheel at all, and without this a frame
        # of pure noise reframes itself on an imagined bicycle.
        med = float(np.median(mag)) + 1e-6
        if min(_coverage(gx, gy, lx, cy, r, med),
               _coverage(gx, gy, rx, cy, r, med)) < _MIN_COVERAGE:
            return None
        inv = 1.0 / k
        return Wheels(lx * inv, rx * inv, cy * inv, r * inv)
    except Exception:
        logger.warning("wheel detection failed; the frame is left alone", exc_info=True)
        return None


# ── the reframe ─────────────────────────────────────────────────────────────

def normalise(img, out_size: tuple[int, int], ratio: float = RATIO_DEFAULT):
    """Reframe so the machine lands on the canonical box. Returns (image, info).

    The transform is a SIMILARITY — uniform scale plus translation, three
    degrees of freedom for the three things measured. It never rotates and never
    stretches, so the world is not distorted and the machine keeps its geometry
    exactly; only the window onto the render moves.
    """
    from PIL import Image

    W, H = out_size
    wheels = find_wheels(img, ratio)
    if wheels is None:
        return img.resize((W, H), Image.LANCZOS), {"ok": False, "why": "wheels not found"}

    scale = (TARGET_SEP * W) / wheels.sep
    tx, ty = TARGET_MID_X * W, TARGET_CONTACT * H
    x0 = wheels.mid_x - tx / scale
    y0 = wheels.contact_y - ty / scale
    x1 = wheels.mid_x + (W - tx) / scale
    y1 = wheels.contact_y + (H - ty) / scale

    # PADDING IS EDGE-EXTENDED, AND COUNTED.
    #
    # MEASURED, because the first version of this claimed a 2K source would
    # never need it and that was wrong. A real 1536x2752 render came back with
    # its contact line at 0.680 of the height; moving it to 0.735 puts the
    # window's top edge 306 px ABOVE the top of the render. The correction is
    # mostly a vertical translation and a crop cannot invent sky.
    #
    # So the source is pre-padded by replicating its edge rows. That is close to
    # free HERE and nowhere else: the band being extended is the top of the
    # frame, which `bike_build.STAGE_COMPOSITION` already reserves as empty sky
    # for the portrait to sit over, so duplicating its topmost row upward adds
    # nothing the eye can find — 306 px of it is invisible on a real render.
    # The amount is still returned, because a stage needing a lot of padding is
    # a stage whose prompt composition is drifting and wants fixing upstream.
    import numpy as np

    pad_l = max(0, int(np.ceil(-x0)) + 2)
    pad_t = max(0, int(np.ceil(-y0)) + 2)
    pad_r = max(0, int(np.ceil(x1 - img.width)) + 2)
    pad_b = max(0, int(np.ceil(y1 - img.height)) + 2)
    src = img
    if pad_l or pad_t or pad_r or pad_b:
        arr = np.pad(
            np.asarray(img.convert("RGB")),
            ((pad_t, pad_b), (pad_l, pad_r), (0, 0)), mode="edge",
        )
        src = Image.fromarray(arr)
        x0 += pad_l
        y0 += pad_t

    out = src.transform(
        (W, H), Image.AFFINE,
        (1.0 / scale, 0.0, x0, 0.0, 1.0 / scale, y0),
        resample=Image.BICUBIC,
    )
    return out, {
        "ok": True,
        "scale": round(float(scale), 4),
        "ratio": round(float(ratio), 4),
        "sep_px": round(wheels.sep, 1),
        "contact_y": round(wheels.contact_y, 1),
        "pad": {"t": pad_t, "l": pad_l, "r": pad_r, "b": pad_b},
    }
