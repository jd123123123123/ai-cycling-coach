"""The image prompt and the thing the rider reads are not the same string.

The bike analysis returns a dense English paragraph, and that is correct — it is
an IMAGE PROMPT, scaffolded by English instructions, and mixing languages inside
one prompt costs render quality. But the app printed that same paragraph to the
rider as a spec sheet, in a German interface, which is the most obvious
"unfinished" signal a product can give.

One stored description now carries both halves, split by a marker rather than by
a new column — so there is no migration and no backfill.
"""
from app.services.cyclr_studio import DESC_SPLIT, split_description


def test_the_two_halves_come_apart():
    prompt, human = split_description(f"a black aero frame {DESC_SPLIT} Rahmen: Schwarz, aero")
    assert prompt == "a black aero frame"
    assert human == "Rahmen: Schwarz, aero"


def test_an_older_asset_reads_exactly_as_it_did_before():
    """Everything stored before the pass wrote a German half has no marker. It
    must keep working, showing what it always showed — not an empty spec sheet."""
    prompt, human = split_description("a black aero frame")
    assert prompt == "a black aero frame"
    assert human == "a black aero frame"


def test_nothing_in_never_becomes_something_out():
    assert split_description(None) == ("", "")
    assert split_description("") == ("", "")


def test_an_empty_german_half_falls_back_rather_than_showing_a_blank():
    _, human = split_description(f"a black aero frame {DESC_SPLIT}   ")
    assert human == "a black aero frame"


def test_the_renderer_is_only_ever_handed_the_prompt_half():
    import inspect

    from app.services import cyclr_studio

    src = inspect.getsource(cyclr_studio.render_from_photo)
    assert "split_description(description)" in src
    assert "render_isolated(prompt_text" in src
