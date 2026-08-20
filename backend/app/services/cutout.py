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
    """Return the same picture with its background removed, as a PNG data URL.

    PNG, not WebP, and that is not a preference: this is the one image in the
    pipeline that carries an alpha channel, and `_to_data_url`'s WebP path
    converts to RGB — which would silently flatten the transparency back onto
    black and undo the whole thing.

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
        box = out.getbbox()
        if box:
            out = out.crop(box)

        buf = io.BytesIO()
        out.save(buf, "PNG", optimize=True)
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # A failed cut-out is a missing nicety, never a failed render.
        log.warning("background cut-out failed; keeping the original", exc_info=True)
        return None
