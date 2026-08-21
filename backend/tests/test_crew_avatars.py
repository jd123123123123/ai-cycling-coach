"""The riders' faces on the standings table.

The first cut of this shipped broken in a way no error could reveal: it wrote
the avatars onto a key the payload does not have, so the whole block was a
silent no-op and every rider — including the caller, looking at their OWN
avatar — fell through to the placeholder dot.
"""
import base64
import inspect
import io

from app.api import crews
from app.schemas.crew import StandingsResponse
from app.services.crew_avatars import THUMB_PX, thumbnail


def _data_url(fmt: str = "WEBP", size: tuple[int, int] = (512, 768)) -> str:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", size, (40, 60, 30)).save(buf, format=fmt)
    mime = "webp" if fmt == "WEBP" else fmt.lower()
    return f"data:image/{mime};base64," + base64.b64encode(buf.getvalue()).decode()


def test_the_avatars_go_onto_the_key_the_payload_actually_has():
    """THE BUG. `payload.get("rows", [])` returns an empty list on a payload
    whose members live under `standings`, so the loop never ran and nothing
    ever failed. The response model names the field, and that is the name the
    endpoint has to use."""
    assert "standings" in StandingsResponse.model_fields
    assert "rows" not in StandingsResponse.model_fields

    src = inspect.getsource(crews.my_standings)
    assert 'payload.get("standings")' in src
    assert 'payload.get("rows"' not in src
    assert 'payload["rows"]' not in src


def test_a_row_can_carry_a_face():
    assert "avatar" in StandingsResponse.model_fields["standings"].annotation.__args__[0].model_fields


def test_thumbnails_are_small_enough_to_send_a_whole_crew():
    """A rendered rider is 50-200 KB; eight of them would be a megabyte of
    base64 in front of the numbers the screen exists for."""
    out = thumbnail(_data_url())
    assert out is not None and out.startswith("data:image/webp;base64,")
    raw = base64.b64decode(out.split(",", 1)[1])
    assert len(raw) < 12_000, len(raw)


def test_it_crops_from_the_top_because_these_are_full_figures():
    """A centre crop of a standing rider is their chest. The result is square
    whatever the source shape."""
    from PIL import Image

    out = thumbnail(_data_url(size=(400, 1200)))
    assert out is not None
    im = Image.open(io.BytesIO(base64.b64decode(out.split(",", 1)[1])))
    assert im.size == (THUMB_PX, THUMB_PX)


def test_an_unreadable_avatar_costs_the_crew_nothing():
    """The standings are the point of that screen and must not fail for a face."""
    assert thumbnail(None) is None
    assert thumbnail("") is None
    assert thumbnail("https://example.com/not-a-data-url.png") is None
    assert thumbnail("data:image/webp;base64,not-actually-base64") is None


def test_png_renders_still_work():
    """Older collectibles were PNG; the format is not the app's to assume."""
    assert thumbnail(_data_url("PNG")) is not None
