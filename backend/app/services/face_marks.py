"""The flat face marks, composited onto the render instead of prompted into it.

WHY THIS EXISTS. The eyes and brow bars used to be described in the image
prompt and drawn by the model. That works about three times in four: the model
would draw a real eyebrow *and* the bar, or let the bar touch the eye so the
two read as one fused object, or drift the angle. `cyclr_studio`'s own comment
had already called it — the marks are "on their way out — the app is moving to
compositing them as separate artwork, which is the only way they can be
swapped, bought, and made to land in the same place twice."

Three times in four is what a prompt buys. This is the fourth.

── REGISTRATION ────────────────────────────────────────────────────────────

One vision call returns the two eye centres. That pair carries everything the
marks need: position (their midpoint), scale (the distance between them) and
ROLL (the angle of the line joining them). So every mark is authored once in
INTEROCULAR UNITS — 1u = the eye-centre separation — and lands correctly on any
head at any size or tilt without a second measurement.

The geometry below was measured off the reference render rather than invented:
the white is a half-disc 0.70u wide and 0.345u tall; the brow is a capsule
0.92u × 0.150u sitting at 12°.

Two of those numbers were then tuned against real renders rather than the
reference, and both for the same reason — the mark has to WIN over what the
render already put there. `EYE_TOP_RISE` lifts the white above the eye centre
because a disc centred on the eye leaves the real eyeball showing above it, and
`BROW_RISE` was raised from 0.30 to 0.44 (with the capsule thickened to match)
because at 0.30 the bar sat *below* the rendered brow ridge and the face wore
both. The prompt asks for a bare brow ridge as well; that request lands most of
the time, and the raised, thicker bar covers the times it does not.

── WHY IT IS NOT A FLAT FILL ───────────────────────────────────────────────

A previous attempt drew these as flat SVG and it read as a sticker on a
photograph, because a constant colour contradicts the lit surface at every
pixel. What the reference actually does, measured:

  · the mark's own pixels follow the SKIN's luminance gradient beneath it —
    multiply by the blurred local luma. This is the single biggest cue.
  · TWO shadow layers, not one: a tight near-black contact notch right under
    the silhouette, and a separate soft drop peaking below it.
  · the "black" is #1F201D, not #0D0D0D — it needs headroom for a highlight.
  · a specular band about a third down from the top edge, not a rim at the edge.
  · the silhouette self-darkens over the last pixel or two.

All of that is a few lines of numpy over an alpha mask, which is why this needs
no Blender bake, no GPU and no second service.
"""
from __future__ import annotations

import base64
import io
import json
import logging
import math
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from app.config import settings

log = logging.getLogger(__name__)

# ── the measured constants ──────────────────────────────────────────────────
#: Half-disc: flat top edge, rounded bottom. Width and height in interocular u.
EYE_W, EYE_H = 0.70, 0.345
#: WHERE THE FLAT TOP SITS relative to the eye centre. The first version hung
#: the whole disc below the centre, so the rider's real eye looked out over the
#: top of it. The top edge belongs just above the upper lid.
EYE_TOP_RISE = 0.13
#: Brow capsule, and how far its centre sits above the eye centre.
BROW_W, BROW_H = 0.92, 0.150
#: ABOVE THE REAL BROW, not under it. At 0.30u the bar landed below the
#: rider's own eyebrow and both were visible at once — the exact fault
#: compositing was supposed to end.
BROW_RISE = 0.44
#: The gap that stopped the two marks reading as one object. A stated distance
#: rather than the word "separate", which is what the prompt used to rely on.
BROW_TILT_DEG = 12.0
#: The dark shape biting into the white's upper edge, toward the nose.
PUPIL_R = 0.115
PUPIL_DROP = 0.045

INK = (0x1F, 0x20, 0x1D)      # not #0D0D0D — the highlight needs headroom
WHITE = (0xF4, 0xF3, 0xEF)

CONTACT_NOTCH_U = 0.02        # tight, near-black, hard against the silhouette
CONTACT_MUL = 0.22
DROP_PEAK_U = 0.074           # the second, softer layer
DROP_MUL = 0.84

#: NORMALISED 0–1000, WHICH IS THE MODEL'S OWN CONVENTION AND WAS THE BUG.
#: The first version asked for "pixel coordinates" and got 0–1000 anyway — on a
#: 1536px render that put both marks in the top-left corner, floating off the
#: face. Asking for the space the model already speaks, and scaling here, is
#: deterministic; asking for pixels and hoping is not.
_LANDMARK_SPACE = 1000.0

_LANDMARK_PROMPT = (
    "Return ONLY compact JSON, no prose and no code fence:\n"
    '{"left_eye":[x,y],"right_eye":[x,y],"confident":true}\n'
    "`left_eye` and `right_eye` are the centres of the two eyeballs as the "
    "VIEWER sees them, left first — the centre of the visible eye opening.\n"
    "COORDINATES ARE NORMALISED TO 0-1000 in both axes, x to the right and y "
    "downward, regardless of the image's real pixel size.\n"
    "If no single clear human face is present, return "
    '{"confident":false}.'
)


@dataclass(frozen=True)
class Landmarks:
    """Where the marks go, in image pixels."""
    left_eye: tuple[float, float]
    right_eye: tuple[float, float]

    @property
    def unit(self) -> float:
        """1u — the interocular distance, which is the scale for every mark."""
        dx = self.right_eye[0] - self.left_eye[0]
        dy = self.right_eye[1] - self.left_eye[1]
        return math.hypot(dx, dy)

    @property
    def roll_deg(self) -> float:
        """How far the head is tilted, so the marks tilt with it."""
        dx = self.right_eye[0] - self.left_eye[0]
        dy = self.right_eye[1] - self.left_eye[1]
        return math.degrees(math.atan2(dy, dx))


def _plausible(lm: Landmarks, w: int, h: int) -> bool:
    """Would a face actually be here?

    "Not confident" was never the dangerous answer — CONFIDENTLY WRONG is, and
    the first version had no defence against it: a coordinate space mismatch
    put both marks in a corner and the code drew them there without complaint.
    A bust framed head-on has its eyes in a narrow band, so anything outside it
    is a misread rather than an unusual face.
    """
    u = lm.unit
    if not (0.12 * w <= u <= 0.55 * w):
        return False
    for (x, y) in (lm.left_eye, lm.right_eye):
        if not (0.10 * w <= x <= 0.90 * w and 0.10 * h <= y <= 0.75 * h):
            return False
    # The eyes must be roughly level: a bust is not photographed at 40°.
    return abs(lm.roll_deg) <= 25.0


def _gemini_ready() -> bool:
    return bool(getattr(settings, "GEMINI_API_KEY", None))


async def locate_eyes(image_b64: str) -> Landmarks | None:
    """One vision call → the two eye centres.

    Returns None when the model is unavailable or is not confident there is a
    single clear face — and the caller then ships the render unmarked rather
    than guessing where a face is. A mark in the wrong place is far worse than
    no mark: it is the one defect a rider cannot read as anything but broken.
    """
    if not _gemini_ready():
        return None
    try:
        from google import genai
        from google.genai import types

        raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        resp = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[
                _LANDMARK_PROMPT,
                types.Part.from_bytes(data=base64.b64decode(raw), mime_type="image/webp"),
            ],
        )
        text = (getattr(resp, "text", "") or "").strip()
        text = text.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        data = json.loads(text)
        if not data.get("confident") or "left_eye" not in data or "right_eye" not in data:
            return None
        w, h = Image.open(io.BytesIO(base64.b64decode(raw))).size
        sx, sy = w / _LANDMARK_SPACE, h / _LANDMARK_SPACE
        le = (float(data["left_eye"][0]) * sx, float(data["left_eye"][1]) * sy)
        re_ = (float(data["right_eye"][0]) * sx, float(data["right_eye"][1]) * sy)
        lm = Landmarks(left_eye=le, right_eye=re_)
        return lm if _plausible(lm, w, h) else None
    except Exception as exc:  # noqa: BLE001 — never let a mark break a render
        log.warning("face_marks.locate_eyes failed: %s", exc)
        return None


def _eye_mask(size: tuple[int, int], cx: float, cy: float, u: float, roll: float) -> Image.Image:
    """The white half-disc: straight top edge, rounded bottom."""
    w, h = EYE_W * u, EYE_H * u
    pad = int(max(w, h)) + 8
    tile = Image.new("L", (pad * 2, pad * 2), 0)
    d = ImageDraw.Draw(tile)
    # The flat edge sits at `top`; the disc falls from there. Drawn around
    # `top` rather than around the eye centre, which is what put the whole
    # shape below the eye before.
    top = pad - EYE_TOP_RISE * u
    d.pieslice((pad - w / 2, top - h, pad + w / 2, top + h), 0, 180, fill=255)
    tile = tile.rotate(-roll, resample=Image.BICUBIC, center=(pad, pad))
    out = Image.new("L", size, 0)
    out.paste(tile, (int(cx - pad), int(cy - pad)), tile)
    return out


def _brow_mask(size: tuple[int, int], cx: float, cy: float, u: float, roll: float,
               mirror: bool) -> Image.Image:
    """The capsule above it, angled down toward the nose."""
    w, h = BROW_W * u, BROW_H * u
    pad = int(max(w, h)) + 10
    tile = Image.new("L", (pad * 2, pad * 2), 0)
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle((pad - w / 2, pad - h / 2, pad + w / 2, pad + h / 2),
                        radius=h / 2, fill=255)
    tilt = BROW_TILT_DEG if mirror else -BROW_TILT_DEG
    tile = tile.rotate(tilt - roll, resample=Image.BICUBIC, center=(pad, pad))
    out = Image.new("L", size, 0)
    out.paste(tile, (int(cx - pad), int(cy - BROW_RISE * u - pad)), tile)
    return out


def _pupil_mask(size: tuple[int, int], cx: float, cy: float, u: float, roll: float,
                mirror: bool) -> Image.Image:
    """The solid dark shape biting into the white's upper edge, toward the nose."""
    r = PUPIL_R * u
    off = (EYE_W * 0.17) * u
    dx = -off if mirror else off
    a = math.radians(roll)
    px = cx + dx * math.cos(a)
    py = cy + dx * math.sin(a) - PUPIL_DROP * u + EYE_TOP_RISE * u * 0.15
    out = Image.new("L", size, 0)
    ImageDraw.Draw(out).ellipse((px - r, py - r, px + r, py + r), fill=255)
    return out


def _paint(base: np.ndarray, mask: np.ndarray, colour: tuple[int, int, int],
           luma: np.ndarray, specular: bool) -> np.ndarray:
    """Lay one mark down so it belongs to the lit surface underneath it.

    The mark takes the skin's own luminance field rather than a flat fill —
    that is the single cue that stops it reading as a sticker — plus a
    specular band a third of the way down and a self-darkening silhouette.
    """
    a = mask[..., None]
    col = np.array(colour, dtype=np.float32)[None, None, :]

    # Follow the skin's light — but a near-black mark has almost no headroom
    # before it reads as grey, so the dark ink takes a fraction of the swing the
    # white does. Shading them equally is what turned the brow bars to slate.
    dark = float(col.mean()) < 90.0
    gain = 0.22 if dark else 0.56
    shade = np.clip((1.0 - gain) + gain * 2.0 * luma[..., None], 0.72 if dark else 0.55, 1.18 if dark else 1.35)
    painted = col * shade

    if specular:
        # A band about a third down from the top edge, not a rim at the edge.
        ys = np.linspace(0.0, 1.0, mask.shape[0], dtype=np.float32)[:, None]
        band = np.exp(-((ys - 0.33) ** 2) / (2 * 0.055 ** 2))
        painted = painted + band[..., None] * (9.0 if dark else 26.0)

    # The silhouette self-darkens over the last pixel or two.
    edge = np.clip(mask * 3.0 - 2.0, 0.0, 1.0)[..., None]
    painted = painted * (0.86 + 0.14 * edge)

    return base * (1.0 - a) + painted * a


def _shadow(base: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Two layers, because one never looked attached.

    A tight near-black contact notch hard under the silhouette, and a separate
    soft drop peaking further below it.
    """
    m = Image.fromarray((mask * 255).astype(np.uint8))
    h = mask.shape[0]

    notch_px = max(1, int(CONTACT_NOTCH_U * h * 0.5))
    notch = np.asarray(m.filter(ImageFilter.GaussianBlur(notch_px)), dtype=np.float32) / 255.0
    notch = np.clip(notch - mask, 0.0, 1.0)

    drop_px = max(2, int(DROP_PEAK_U * h * 0.5))
    drop = np.asarray(m.filter(ImageFilter.GaussianBlur(drop_px)), dtype=np.float32) / 255.0
    drop = np.clip(drop - mask, 0.0, 1.0)

    out = base * (1.0 - notch[..., None] * (1.0 - CONTACT_MUL))
    out = out * (1.0 - drop[..., None] * (1.0 - DROP_MUL))
    return out


def composite(image_bytes: bytes, lm: Landmarks) -> bytes:
    """Draw the marks onto the render. Pure — no network, no model."""
    im = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    size = im.size
    base = np.asarray(im, dtype=np.float32)

    # The skin's luminance, blurred, is what every mark is shaded by.
    grey = np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(size[0] * 0.01)),
                      dtype=np.float32) / 255.0

    u, roll = lm.unit, lm.roll_deg
    out = base
    for (cx, cy), mirror in ((lm.left_eye, True), (lm.right_eye, False)):
        eye = np.asarray(_eye_mask(size, cx, cy, u, roll), dtype=np.float32) / 255.0
        brow = np.asarray(_brow_mask(size, cx, cy, u, roll, mirror), dtype=np.float32) / 255.0
        pupil = np.asarray(_pupil_mask(size, cx, cy, u, roll, mirror), dtype=np.float32) / 255.0
        pupil = pupil * eye  # the dark shape only bites where there is white

        out = _shadow(out, np.clip(eye + brow, 0.0, 1.0))
        out = _paint(out, eye, WHITE, grey, specular=True)
        out = _paint(out, pupil, INK, grey, specular=False)
        out = _paint(out, brow, INK, grey, specular=True)

    buf = io.BytesIO()
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(buf, "WEBP", quality=92)
    return buf.getvalue()


async def apply_marks(image_b64: str) -> tuple[str, bool]:
    """Locate the eyes and draw the marks. Returns (image, marked).

    `marked=False` means the render is returned untouched — no face found, or
    the compositor failed. The caller ships it as-is: a bare digital double is
    a worse avatar than a marked one, and both are enormously better than two
    black bars floating somewhere near an ear.
    """
    lm = await locate_eyes(image_b64)
    if lm is None:
        return image_b64, False
    try:
        raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
        out = composite(base64.b64decode(raw), lm)
        return "data:image/webp;base64," + base64.b64encode(out).decode(), True
    except Exception as exc:  # noqa: BLE001
        log.warning("face_marks.composite failed: %s", exc)
        return image_b64, False
