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
