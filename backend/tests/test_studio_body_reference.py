"""A scene must be shown a body, not asked to imagine one.

Every reference this module had was a bust: the face reference is a face, the
build reference is a bust, and the rider's own collectible is a portrait crop.
So `compose_scene` handed the model a picture of a head and prose for
everything below it — and prose loses to the model's prior for "cyclist",
which is the same lesson the build and the bike each learned already. Measured
across four prompt rounds on 2026-08-20: the isolated bust improved every
round while the identical wording sent the scene's body back and forth between
a chunky collectible and a lean adult with anatomical legs.

The fix is a shipped full-body figure, and these tests pin the two ways it
silently stops working: the file going missing, and the roles in the mandate
drifting out of step with the images actually handed over.
"""
import pathlib

from app.services import cyclr_studio as c


def test_the_body_reference_ships():
    """It is a repository asset, not something generated per render. If this
    fails, every scene quietly falls back to inventing the body from words."""
    assert c._BODY_REF.exists(), f"missing style asset: {c._BODY_REF}"
    assert c._BODY_REF.stat().st_size > 1024


def test_the_body_reference_loads_as_a_data_url():
    ref = c._style_reference(c._BODY_REF)
    assert ref is not None
    assert ref.startswith("data:image/webp;base64,")


def test_a_missing_reference_is_not_an_error():
    """Degrading to the text-only render is the contract everywhere in this
    module: a deploy that ships no style assets still makes an avatar."""
    assert c._style_reference(pathlib.Path("/nonexistent/character_body.webp")) is None


def test_the_build_role_describes_the_third_image():
    """The mandate names images by POSITION, so the prose and the list handed
    to the model have to agree. `_BUILD_ROLE` is only ever appended when a
    third image goes with it — see `compose_scene`."""
    assert "THIRD IMAGE" in c._BUILD_ROLE


def test_the_scene_prompt_no_longer_demands_correct_anatomy():
    """THE BUG, pinned. This clause opened with 'CRITICAL ANATOMY: ... complete,
    correct human anatomy' — an all-caps realism absolute in the one path that
    drifts realistic. It exists for limb COUNT and visibility, and must ask for
    that without asking for an anatomically correct human."""
    prompt = c._scene_prompt("a rider", "a bike", "riding hard")
    assert "correct human anatomy" not in prompt
    for limb in ("Both arms", "both hands", "both legs", "both feet"):
        assert limb in prompt


def test_the_scene_prompt_states_the_build_positively():
    """The build is stated positively and specifically.

    THE PINNED VALUE CHANGED, and it is worth saying why rather than quietly
    editing a string. This used to assert "three and a half heads tall" and "two
    thirds as wide as the shoulders" — a designer-toy ratio. Measuring the
    render the art direction actually points at showed a head at close to
    natural adult scale on a real athletic build; the toy ratio was one of the
    three things dragging every rider toward a vinyl figure, along with the
    "short wide head" mandate and the beard rendered as moulded volume.

    What the test is FOR survives unchanged: the build must be described in
    positive, concrete terms. Written as a negation ("if the figure reads five
    or more heads tall...") the render got worse, because a negation has to name
    the thing it forbids — the rule this module documents at the top of the
    file. So this still pins prose, not a particular ratio."""
    prompt = c._scene_prompt("a rider", "a bike", "riding hard")
    assert "athletic adult build" in prompt
    assert "close to natural scale" in prompt
    # The toy ratio is gone and must not creep back in.
    assert "heads tall" not in prompt
