"""The ride-photo store.

Every upload is re-encoded rather than saved, and that re-encode is the
security boundary — these tests are mostly about what must NOT survive it.
"""
import io

import pytest
from PIL import Image

from app.services import ride_photos


@pytest.fixture(autouse=True)
def volume(tmp_path, monkeypatch):
    monkeypatch.setattr(ride_photos.settings, "RIDE_PHOTO_ROOT", str(tmp_path))
    return tmp_path


def jpeg(w=2400, h=1600, exif=None) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (w, h), (90, 120, 60))
    img.save(buf, "JPEG", exif=exif) if exif else img.save(buf, "JPEG")
    return buf.getvalue()


def test_a_camera_original_is_bounded():
    """A 12 MP photo must not land on the volume at 12 MP."""
    rel, w, h = ride_photos.store(jpeg(4032, 3024), user_id=5, activity_id=9)
    assert max(w, h) == ride_photos.MAX_EDGE
    assert (ride_photos.root() / rel).stat().st_size < 400_000


def test_the_stored_file_is_webp_whatever_arrived():
    rel, _, _ = ride_photos.store(jpeg(), user_id=5, activity_id=9)
    assert rel.endswith(".webp")
    assert Image.open(ride_photos.root() / rel).format == "WEBP"


def test_NO_EXIF_SURVIVES_THE_RE_ENCODE():
    """Asserted on the WHOLE block rather than on the GPS tag alone.

    GPS is the tag worth caring about — a feed already shows where somebody
    rode, and their photos should not also carry the coordinates of their
    house. But it is dropped because the saved image is CONSTRUCTED rather than
    copied, and that mechanism takes every tag with it. Testing the block is
    testing the actual guarantee; testing one tag would still pass the day
    somebody re-enabled EXIF passthrough with a GPS filter.
    """
    exif = Image.Exif()
    exif[0x010F] = "Ridr Test Camera"     # Make
    exif[0x0110] = "Model X"              # Model
    src = jpeg(800, 600, exif=exif.tobytes())
    assert Image.open(io.BytesIO(src)).getexif().get(0x010F) == "Ridr Test Camera"

    rel, _, _ = ride_photos.store(src, user_id=5, activity_id=9)
    assert dict(Image.open(ride_photos.root() / rel).getexif()) == {}


def test_a_file_that_is_not_an_image_is_refused():
    """A polyglot never reaches the volume, because it cannot survive a decode."""
    with pytest.raises(ride_photos.PhotoRejected):
        ride_photos.store(b"#!/bin/sh\necho hi\n", user_id=5, activity_id=9)


def test_an_empty_or_oversized_upload_is_refused_before_decoding():
    with pytest.raises(ride_photos.PhotoRejected):
        ride_photos.store(b"", user_id=5, activity_id=9)
    with pytest.raises(ride_photos.PhotoRejected):
        ride_photos.store(b"\xff" * (ride_photos.MAX_UPLOAD_BYTES + 1), user_id=5, activity_id=9)


def test_the_path_is_built_from_ids_never_from_input():
    rel, _, _ = ride_photos.store(jpeg(400, 300), user_id=7, activity_id=42)
    assert rel.startswith("7/42/")
    assert rel.count("/") == 2


def test_traversal_cannot_escape_the_root():
    with pytest.raises(ride_photos.PhotoRejected):
        ride_photos._resolve("../../etc/passwd")
    assert ride_photos.read("../../etc/passwd") is None


def test_reading_a_row_whose_file_is_gone_is_none_not_a_crash():
    """A volume that lost a file is a broken picture, not a broken feed."""
    rel, _, _ = ride_photos.store(jpeg(400, 300), user_id=5, activity_id=9)
    (ride_photos.root() / rel).unlink()
    assert ride_photos.read(rel) is None


def test_remove_is_idempotent():
    rel, _, _ = ride_photos.store(jpeg(400, 300), user_id=5, activity_id=9)
    ride_photos.remove(rel)
    ride_photos.remove(rel)          # the row is going either way
    assert ride_photos.read(rel) is None


def test_a_small_photo_is_not_upscaled():
    rel, w, h = ride_photos.store(jpeg(320, 240), user_id=5, activity_id=9)
    assert (w, h) == (320, 240)
