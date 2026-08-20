"""The same photo must always yield the same asset.

The module has promised this since it was written — "a DETERMINISTIC seed so
the same photo always yields the same asset" — and the promise was false. The
seed came from the vision pass's DESCRIPTION, and that pass returns different
prose on every run even at temperature 0. Measured on one selfie: two runs, two
descriptions of different lengths, two unrelated faces.

That is not a cosmetic bug. A rider who re-renders their avatar, or whose asset
is regenerated after a recipe change, would be handed a different person.
"""
import base64

from app.services import cyclr_studio as c


def test_the_seed_is_stable_for_the_same_photo():
    photo = base64.b64encode(b"pretend-jpeg-bytes" * 100).decode()
    assert c._seed(photo) == c._seed(photo)


def test_different_photos_seed_differently():
    """Two riders must not collide onto one avatar."""
    a = base64.b64encode(b"rider-one" * 100).decode()
    b = base64.b64encode(b"rider-two" * 100).decode()
    assert c._seed(a) != c._seed(b)


def test_the_description_no_longer_decides_the_seed():
    """THE BUG, pinned. The vision pass is not stable run to run, so anything
    seeded on its output is not stable either — and the render is what the
    rider sees."""
    photo = base64.b64encode(b"one-and-the-same-photo" * 50).decode()
    desc_run_one = "He has warm brown curly hair and a neat moustache."
    desc_run_two = (
        "This avatar features soft wavy light-brown hair with volume, and a "
        "distinct moustache above a faint jaw shadow."
    )
    assert c._seed(desc_run_one) != c._seed(desc_run_two), "premise: descriptions vary"
    # But both renders of that one photo seed identically, because the photo is
    # what is passed as `seed_src`.
    assert c._seed(photo) == c._seed(photo)


def test_render_isolated_accepts_a_seed_source():
    """The parameter exists and defaults to the description, so a caller that
    has no photo (an asset re-render from a stored description) still works."""
    import inspect

    sig = inspect.signature(c.render_isolated)
    assert "seed_src" in sig.parameters
    assert sig.parameters["seed_src"].default is None


def test_the_photo_pipeline_seeds_on_the_photo():
    """`render_from_photo` holds the photo, so it must be what gets passed —
    this is the whole fix, and it is one keyword argument easy to lose."""
    import inspect

    src = inspect.getsource(c.render_from_photo)
    assert "seed_src=photo_b64" in src


# ── squaring the input ───────────────────────────────────────────────────────

def test_padding_squares_without_cropping():
    """The fix for the bike's camera. A landscape photo rendered at 1:1 makes
    the model recompose, and recomposing is when it rotates the bicycle a few
    degrees toward the viewer — four rounds of blunter camera wording moved
    that angle but never removed it. Squaring the INPUT removed it."""
    import io

    from PIL import Image

    im = Image.new("RGB", (1600, 1280), (240, 238, 236))
    buf = io.BytesIO()
    im.save(buf, "WEBP")
    src = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()

    out = c.pad_to_square(src)
    padded = Image.open(io.BytesIO(base64.b64decode(out.split(",", 1)[1])))
    assert padded.size == (1600, 1600), "must pad to the long edge"


def test_padding_leaves_a_square_photo_alone():
    """No re-encode, no quality loss, no work, when there is nothing to do."""
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (800, 800), (10, 10, 10)).save(buf, "WEBP")
    src = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    assert c.pad_to_square(src) is src


def test_padding_never_breaks_the_pipeline():
    """It improves fidelity; it is not a dependency. Anything unreadable comes
    back untouched so the render still happens."""
    assert c.pad_to_square("not-an-image") == "not-an-image"
    assert c.pad_to_square("data:image/webp;base64,####") == "data:image/webp;base64,####"


def test_the_bike_path_squares_before_editing():
    """One call, easy to lose in a refactor, and the camera silently rotates
    again if it goes."""
    import inspect

    src = inspect.getsource(c.render_bike_from_photo)
    assert "pad_to_square(photo_b64)" in src


# ── the render never raises ─────────────────────────────────────────────────

class _Boom:
    """A client whose every call fails the way the real one did in production."""

    def __init__(self, message: str, calls: list) -> None:
        self._message, self._calls = message, calls
        self.models = self

    def generate_content(self, **kw):
        self._calls.append(kw["config"].image_config.image_size)
        raise RuntimeError(self._message)


def _patched(monkeypatch, message: str) -> list:
    """Point `_render` at a client that always fails, and record the sizes it
    was asked for."""
    calls: list = []
    import google.genai as genai
    monkeypatch.setattr(genai, "Client", lambda **kw: _Boom(message, calls))
    return calls


def test_a_provider_failure_degrades_instead_of_raising(monkeypatch):
    """THE BUG, PINNED. `RENDER_SIZE` moved to 2K while the deployed model was
    the lite tier, which renders 1K only, so every call raised `400 Image size
    2K is not supported` — and with nothing catching it `POST
    /garage/asset/render` answered 500 and onboarding died. A picture that
    cannot be made is the same class of event as a missing API key, and this
    module's contract has always been to degrade rather than crash.
    """
    import asyncio
    from app.services import cyclr_studio as c

    _patched(monkeypatch, "429 RESOURCE_EXHAUSTED: prepayment credits depleted")
    assert asyncio.run(c._render(["hi"], "seed", "2K")) is None


def test_a_size_refusal_is_retried_once_smaller(monkeypatch):
    """A size the model will not render is a preference meeting a fact, so it
    falls back rather than failing: a smaller picture beats no picture, and it
    makes raising `RENDER_SIZE` safe before every deployment has caught up."""
    import asyncio
    from app.services import cyclr_studio as c

    calls = _patched(monkeypatch, "400 INVALID_ARGUMENT: Image size 2K is not supported for this model")
    assert asyncio.run(c._render(["hi"], "seed", "2K")) is None
    assert calls == ["2K", c.FALLBACK_SIZE], "should try the asked size, then fall back once"


def test_any_other_failure_is_not_retried(monkeypatch):
    """Retrying a quota error at a smaller size just spends the same refusal
    twice and doubles the latency of a failure the rider is already waiting on."""
    import asyncio
    from app.services import cyclr_studio as c

    calls = _patched(monkeypatch, "429 RESOURCE_EXHAUSTED")
    assert asyncio.run(c._render(["hi"], "seed", "2K")) is None
    assert calls == ["2K"]


def test_the_size_refusal_matcher_reads_the_real_message():
    from app.services import cyclr_studio as c

    real = "400 INVALID_ARGUMENT. {'error': {'message': 'Image size 2K is not supported for this model'}}"
    assert c._is_size_refusal(RuntimeError(real))
    assert not c._is_size_refusal(RuntimeError("429 RESOURCE_EXHAUSTED"))
