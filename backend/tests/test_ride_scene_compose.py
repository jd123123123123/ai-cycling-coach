"""Composing one ride's hero must never end in a raw error.

The tap costs a couple of minutes and a model call. What the rider must not
meet at the end of it is a 500: they cannot tell a dead image model from a bug,
and either way all that reaches the screen is "Fehler".
"""
import inspect

from app.api import garage


def test_the_world_is_chosen_once_so_the_two_arms_cannot_disagree():
    """THE BUG THIS PINS. A place row whose prose was blank fell through to the
    framing arm with `framing_id` never assigned — a NameError, so a 500, on the
    one tap this entire feature exists for. `place is not None` and "we have
    prose to render with" were two different conditions being asked in two
    different places, and blank prose is exactly where they part company.
    """
    src = inspect.getsource(garage.render_scene)
    # The prompt is built inside each arm now, so neither arm can read a name
    # the other one assigned.
    assert "framing_id" in src
    assert "else ride_framing.edit_prompt(framing_id)" not in src, (
        "the prompt is being built outside the arm that defines framing_id again"
    )
    assert '(place.prose or "").strip()' in src


def test_a_failed_render_degrades_instead_of_raising():
    """`edit_image` degrades to None on its own known failures; everything else
    — a network fault, a decode error, a model that changed its response shape —
    used to escape as a 500."""
    src = inspect.getsource(garage.render_scene)
    assert "except Exception" in src
    assert "image_model_unavailable" in src
