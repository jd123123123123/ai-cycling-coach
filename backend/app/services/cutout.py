"""Cut the bike out of its background, once, at render time.

WHAT THIS REPLACES. Every render arrives as a square photograph with a ground
baked into it, and every surface that wanted to show the machine somewhere else
had to fight that ground:

  · Today screen-blended the art and masked it with a radial gradient, purely to
    stop a pale rectangle reading as a lit card on a near-black screen — and the
    blend lifted every dark part of the bike toward grey.
  · Standing the bike in a place meant asking an image model to composite, which
    it does by anchoring to the source framing: three attempts produced a
    beautifully lit bicycle hovering in mid-air above a Dolomites switchback.
  · The share card drew the bike as a rectangle floating over a landscape.

A cut-out ends all three. A bicycle on transparency can be placed anywhere, at
any size, by code that knows exactly where the ground is — no blending, no
model, no drift. Measured on a real Standert render: 1.0s per cut-out, 82% of
the frame removed, spokes cut through cleanly and the frame decals intact.

WHAT IT COSTS, so nobody discovers it in a deploy. `isnet-general-use` is a
179 MB ONNX model, downloaded once and baked into the image at build time
(never at runtime, or the first rider after a deploy waits for it). Inference is
CPU-only and holds a few hundred MB of RSS while it runs.

NEVER FATAL. A cut-out that fails costs the transparency and nothing else: the
caller keeps the original photograph, which is exactly what the app showed
before this module existed. The same contract every other optional step in the
render pipeline keeps.
"""
from __future__ import annotations

import base64
import io
import logging
import threading

log = logging.getLogger(__name__)

#: `isnet-general-use` over the default `u2net`: measured side by side on the
#: bike renders, isnet keeps the spokes and the gap inside the frame triangle,
#: which u2net fills in. A bicycle is mostly holes, so that difference is the
#: whole job.
MODEL = "isnet-general-use"

#: The widest surface that ever shows a cut-out is the share card at 1080 px
#: (`cyclr_studio.STORE_MAX_PX` is 1536 and predates the cut-out: it sized a
#: SQUARE render, and cutting one down to the machine already drops most of
#: those pixels). Measured on a real Standert cut at 1369x807: capping at 1080
#: takes the stored WebP from 270 KB to 206 KB, and the Today hero paints it at
#: 252 px either way.
MAX_PX = 1080

#: The ONNX session is expensive to build (~4s) and thread-safe to reuse, so it
#: is created once per process behind a lock rather than per call.
_session = None
_lock = threading.Lock()


def _get_session():
    global _session
    if _session is None:
        with _lock:
            if _session is None:
                from rembg import new_session

                _session = new_session(MODEL)
    return _session


def available() -> bool:
    """Whether the cut-out step can run at all.

    Import-checked rather than assumed, exactly like `cyclr_studio._gemini_ready`
    checks for its SDK: a deploy that ships without the dependency must degrade
    to the uncut photograph instead of 500-ing on the first render.
    """
    import importlib.util

    return importlib.util.find_spec("rembg") is not None


def cut_out(data_url: str) -> str | None:
    """Return the same picture with its background removed, as a data URL.

    WEBP WITH ALPHA, not PNG, and the earlier note here had the reasoning half
    right. What must never happen is a trip through `cyclr_studio._to_data_url`,
    which calls `.convert("RGB")` and flattens the transparency onto black.
    Saving RGBA straight to WebP does not: Pillow keeps the alpha channel, and a
    round-trip comes back mode RGBA with its transparent pixels intact.

    THAT MATTERS BECAUSE THE PAYLOAD IS THE COST, not the inference. Measured on
    a real Standert render: the cut is 1.0s, but the PNG it used to produce is
    889 KB — 1,183 KB once base64 puts it inside Today's JSON, on the critical
    path of the first screen. The same cut as WebP q88, capped at `MAX_PX`, is
    206 KB (274 KB base64). A rider on mobile data waits on those megabytes, not
    on the model.

    PNG remains the fallback, so an encoder that cannot write RGBA WebP costs
    size rather than the cut-out.

    Returns None when the cut-out could not be made, and the caller keeps what
    it had.
    """
    if not available():
        return None
    try:
        from PIL import Image
        from rembg import remove

        raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
        src = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
        out = remove(src, session=_get_session())

        # TRIM TO THE MACHINE. The model renders a bicycle inside a square with a
        # lot of studio around it, and cutting the ground away leaves that
        # emptiness behind as transparent margin — so the bike still draws at
        # about 70% of the frame and still looks small, which is precisely the
        # complaint the cut-out was supposed to answer. Cropping to the alpha
        # bounding box makes the picture BE the bicycle, and every surface that
        # places it then gets to decide its size instead of inheriting the
        # model's framing.
        # THRESHOLD BEFORE MEASURING. `getbbox()` counts any pixel with alpha
        # above ZERO, and a cut-out's edges are anti-aliased — so the box picks
        # up a fringe of near-invisible pixels below the tyres and the picture
        # ends a few rows lower than the bicycle does. On a screen that stands
        # the bike on a measured floor line, those rows are the difference
        # between "on the ground" and "hovering", which is exactly the fault
        # this whole pipeline has been chasing. Measuring at alpha > 24 finds
        # the machine instead of its halo.
        alpha = out.getchannel("A")
        box = alpha.point(lambda v: 255 if v > 24 else 0).getbbox()
        if box:
            out = out.crop(box)

        # Cap AFTER the crop: the crop is what removes most of the pixels, and
        # measuring the cap against the machine rather than the original square
        # keeps the bicycle at the size the share card actually needs.
        if max(out.size) > MAX_PX:
            out.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)

        buf = io.BytesIO()
        try:
            out.save(buf, "WEBP", quality=88, method=4)
            return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            log.warning("RGBA WebP encode failed; falling back to PNG", exc_info=True)
            buf = io.BytesIO()
            out.save(buf, "PNG", optimize=True)
            return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # A failed cut-out is a missing nicety, never a failed render.
        log.warning("background cut-out failed; keeping the original", exc_info=True)
        return None


def warm() -> None:
    """Build the ONNX session before a rider needs it.

    Measured cold: 0.7s to import `rembg` and 2.6s to build the session, on top
    of the 1.0s cut itself — so the first rider after a deploy waited ~4.3s for
    work that takes 1.0s warm. The model is already on disk (baked into the
    image at build time, see the Dockerfile), so this is CPU and nothing else.

    Called off the startup path in a thread: a warm-up that fails, or is slow,
    must never delay or break the boot. `cut_out` builds the session itself if
    this never ran.
    """
    if not available():
        return
    try:
        _get_session()
    except Exception:
        log.warning("cut-out warm-up failed; the first cut will pay for it", exc_info=True)


def is_cut_out(data_url: str) -> bool:
    """Whether this image has already been freed from its ground.

    ASKS THE IMAGE, rather than trusting its container format. The first version
    of this test read the data URL's mime type — cut-outs were PNG, renders were
    WebP, so "is it a PNG" stood in for "is it cut out". Then the cut-out moved
    to WebP for the payload (see `cut_out`) and that proxy silently answered
    "no" for every already-cut bike, which is the kind of check that re-does
    expensive work forever without ever failing loudly.

    An alpha channel is the real property, and it is cheap to read: `Image.open`
    parses the header lazily, so this never decodes the pixels.
    """
    try:
        from PIL import Image

        raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
        return "A" in Image.open(io.BytesIO(base64.b64decode(raw))).mode
    except Exception:
        # Unreadable is not "already done": let the caller try the cut.
        return False


def repack(data_url: str) -> str | None:
    """Re-encode an ALREADY-CUT image to the size and format `cut_out` uses now.

    The cut-out shipped writing PNG, so riders cut before this change carry an
    889 KB PNG (1,183 KB base64) where 206 KB of WebP says the same thing. There
    is no model call here and no second cut — the transparency already exists,
    this only stops the app shipping four times the bytes for it forever.

    Returns None when there is nothing to gain or the re-encode fails, and the
    caller keeps what it had.
    """
    try:
        from PIL import Image

        raw = data_url.split(",", 1)[1] if data_url.startswith("data:") else data_url
        source = base64.b64decode(raw)
        im = Image.open(io.BytesIO(source))
        if "A" not in im.mode:
            return None
        # ALREADY IN THE TARGET SHAPE — STOP. Without this the guard below is
        # not enough: re-encoding a WebP as WebP shrinks it slightly every time,
        # so "did it get smaller" stays true forever and every read would
        # re-encode the picture, losing a little of it on each pass. The test is
        # whether the stored image is what `cut_out` writes today, not whether
        # another pass could squeeze it.
        if (im.format or "").upper() == "WEBP" and max(im.size) <= MAX_PX:
            return None
        im = im.convert("RGBA")
        if max(im.size) > MAX_PX:
            im.thumbnail((MAX_PX, MAX_PX), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=88, method=4)
        packed = buf.getvalue()
        # Only if it actually wins: a small cut-out re-encoded can come out
        # bigger, and rewriting a row to make it worse is not an optimisation.
        if len(packed) >= len(source):
            return None
        return "data:image/webp;base64," + base64.b64encode(packed).decode()
    except Exception:
        log.warning("cut-out repack failed; keeping the stored image", exc_info=True)
        return None
