"""The GPX place resolver's guards.

`resolve()` itself needs a model, so what is tested here is everything AROUND
the call — which is where the honesty lives. The whole reason this module
exists rather than the reference's single do-everything call is that "I cannot
identify this" has to be a real answer, and every one of these is a way the
model can fail to give a usable place name.
"""
import pytest

from app.services import ride_place as rp


@pytest.mark.parametrize("raw", [
    "UNKNOWN", "unknown", "  Unknown  ", "**UNKNOWN**",
])
def test_the_refusal_token_is_honoured_however_it_is_decorated(raw):
    """A model that admits it cannot place the ride must never yield a name."""
    assert rp._clean(raw) is None


def test_markdown_is_peeled_completely():
    """A single strip pass leaves `the Dolomites"**` — the trailing full stop
    blocks the quote strip, and removing the stop afterwards is too late. That
    string then goes straight into an image prompt."""
    assert rp._clean('**"the Dolomites"**.') == "the Dolomites"
    assert rp._clean("'Mont Ventoux',") == "Mont Ventoux"
    assert rp._clean("  the Black Forest  ") == "the Black Forest"


def test_narration_is_rejected_not_trimmed():
    """The prompt asks for a name alone. A sentence means the model ignored the
    instruction, and a model ignoring THAT instruction is not one to trust on
    the accuracy of the place either."""
    assert rp._clean(
        "The location is in the beautiful Dolomites mountain range of northern Italy"
    ) is None
    assert rp._clean("x" * (rp.MAX_PLACE_CHARS + 1)) is None


def test_real_names_survive():
    assert rp._clean("the Dolomites") == "the Dolomites"
    assert rp._clean("coastal Mallorca, Spain") == "coastal Mallorca, Spain"
    # A genuine place that merely contains the refusal word must not be eaten:
    # the check is a whole-string match, not a substring.
    assert rp._clean("Unknown Pass") == "Unknown Pass"


def test_null_island_is_a_dropout_not_a_location():
    """A 0,0 fix is a GPS dropout. Asked about it, the model confidently returns
    the Gulf of Guinea, and the rider gets an ocean for their local loop."""
    assert rp._valid_coords(0.0, 0.0) is False
    assert rp._valid_coords(0.001, -0.001) is False


@pytest.mark.parametrize("lat,lng", [
    (None, 12.0), (46.0, None), (None, None), (95.0, 12.0), (46.0, 200.0),
])
def test_absent_or_impossible_coordinates_resolve_to_nothing(lat, lng):
    assert rp._valid_coords(lat, lng) is False


def test_valid_coordinates_pass():
    assert rp._valid_coords(46.4839, 12.0556) is True
    assert rp._valid_coords(-33.86, 151.21) is True


def test_no_place_means_no_clause():
    """Every caller must survive a null place — the scene then describes terrain
    alone, exactly as it did before this module existed."""
    assert rp.place_clause(None) == ""
    assert rp.place_clause("") == ""


def test_the_clause_seasons_and_never_redecorates():
    """The framing owns the shot. The place may only change WHAT is in the
    scene, never how it is photographed — otherwise a resolved location quietly
    overrides art direction that was tuned against real renders."""
    c = rp.place_clause("the Dolomites")
    assert "the Dolomites" in c
    assert "never how it is shot" in c
    # No signage: a model given a place name will otherwise paint its name onto
    # a road sign, and text in a generated image is always mangled.
    assert "signage" in c
