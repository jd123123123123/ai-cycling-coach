"""Storing and reading the photos a rider attaches to their own ride.

── THE BYTES NEVER GO IN THE DATABASE ──────────────────────────────────────

`ride_photos` holds a relative path and nothing else; the file sits under
`settings.RIDE_PHOTO_ROOT`, the same Railway volume as the Garmin tokens and
the crew tours. A phone photo is two to five megabytes and riders attach
several — on the activity row they would be dragged into every feed query that
touches the ride.

── EVERY UPLOAD IS RE-ENCODED, AND THAT IS THE SECURITY BOUNDARY ───────────

The file that lands on disk is one Pillow wrote, never the bytes the client
sent. That is deliberate and it is doing three jobs at once:

  · a file that is not really an image cannot survive a decode, so a polyglot
    (a valid JPEG that is also a valid script) never reaches the volume;
  · EXIF goes with it — and ride photos carry GPS, which on a feed that already
    shows where somebody rode is the one piece of metadata most worth dropping;
  · a 12 MP camera original becomes a bounded WebP, so the volume holds
    kilobytes per photo instead of megabytes and the feed loads.

── AND THE PATH IS BUILT, NEVER ACCEPTED ───────────────────────────────────

The stored name is a uuid this module generates. Nothing a client sends is ever
part of a path, which is what makes traversal impossible rather than merely
filtered — and `_resolve` still checks containment before opening, because a
defence that exists once is a defence that gets refactored away.
"""
from __future__ import annotations

import io
import uuid
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.config import settings

#: Long edge. Big enough to fill a phone screen at 3x, small enough that a feed
#: of them is not a download.
MAX_EDGE = 1600
#: A rider is not building a gallery here; this is the ride's own handful.
MAX_PER_RIDE = 6
#: Refused before decoding, so a hostile upload cannot cost us the memory.
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


class PhotoRejected(Exception):
    """The upload is not a usable image. Carries a reason worth showing."""


def root() -> Path:
    return Path(settings.RIDE_PHOTO_ROOT)


def _resolve(rel_path: str) -> Path:
    """The absolute path for a stored photo, or a refusal.

    Belt and braces: `rel_path` is only ever something `store` generated, but a
    containment check costs nothing and survives the refactor that one day
    starts passing something else in.
    """
    base = root().resolve()
    p = (base / rel_path).resolve()
    if not p.is_relative_to(base):
        raise PhotoRejected("path outside the photo root")
    return p


def store(raw: bytes, *, user_id: int, activity_id: int) -> tuple[str, int, int]:
    """Re-encode `raw` onto the volume. Returns (rel_path, width, height)."""
    if not raw:
        raise PhotoRejected("empty upload")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise PhotoRejected("file too large")

    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise PhotoRejected("not a readable image") from exc

    # `convert` also drops the EXIF block, GPS included, because the new image
    # is constructed rather than copied.
    img = img.convert("RGB")
    img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

    rel = f"{user_id}/{activity_id}/{uuid.uuid4().hex}.webp"
    dest = _resolve(rel)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, "WEBP", quality=82, method=4)
    return rel, img.width, img.height


def read(rel_path: str) -> bytes | None:
    """The stored bytes, or None when the row outlived its file.

    None rather than an exception: a volume that lost a file is a broken
    picture, not a broken feed, and the caller turns it into a 404.
    """
    try:
        p = _resolve(rel_path)
    except PhotoRejected:
        return None
    if not p.is_file():
        return None
    return p.read_bytes()


def remove(rel_path: str) -> None:
    """Delete the file. Missing is success — the row is going either way."""
    try:
        p = _resolve(rel_path)
    except PhotoRejected:
        return
    p.unlink(missing_ok=True)
