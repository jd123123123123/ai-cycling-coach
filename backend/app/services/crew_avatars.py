"""Crew members' rider avatars, small enough to send a whole standings table.

WHY A THUMBNAIL AND NOT THE AVATAR. A rendered rider is a `data:image/webp`
URL of 50-200 KB. A crew of eight in one standings response is over a megabyte
of base64 for eight 40 px circles — a page that is already waiting on the
standings themselves. Rendered once at 96 px, the same face is 3-5 KB.

WHY IT IS SCOPED TO THE CREW. A rider's avatar is made from their own
photograph, and it is theirs. This only ever answers for people the caller
actually shares a crew with, and it returns a stylised collectible rather than
the photo it came from. Someone who has not made an avatar simply has none —
never a placeholder wearing their name.
"""
from __future__ import annotations

import base64
import io
import logging

log = logging.getLogger(__name__)

#: The circle is 40 px at 2x. 96 keeps it crisp on a 3x screen and still costs
#: a few kilobytes.
THUMB_PX = 96


def thumbnail(image_url: str | None) -> str | None:
    """A small square WebP data URL, or None. Never raises.

    An avatar that will not decode is an avatar the crew list does without —
    the standings are the point of that screen and must not fail for a face.
    """
    if not image_url or not image_url.startswith("data:"):
        return None
    try:
        from PIL import Image

        raw = base64.b64decode(image_url.split(",", 1)[1])
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        # Square from the TOP of the frame rather than the middle: these renders
        # are full figures, and a centre crop of a standing rider is their chest.
        side = min(im.size)
        im = im.crop((max(0, (im.width - side) // 2), 0, max(0, (im.width - side) // 2) + side, side))
        im = im.resize((THUMB_PX, THUMB_PX), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="WEBP", quality=82, method=4)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        log.info("avatar thumbnail failed", exc_info=True)
        return None
