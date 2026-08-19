"""The build composer: what changes the picture, and what must not.

The rules here come from `docs/w3-bike-customisation.md`, which measured them
against the real model rather than reasoning about them. Losing one is not a
style regression — it is the bike drifting between two builds the rider expects
to be the same machine.
"""
from app.services import bike_build as bb
from app.services import earn_modifiers as em


def test_only_items_that_change_the_machine_have_a_visual():
    """A charm in a jersey pocket does not alter the photograph, and inventing a
    change for it would put objects on the bike that are not on the bike."""
    assert set(bb.VISUALS).issubset(set(em.MODIFIERS)), "a visual for an item that does not exist"
    assert len(bb.VISUALS) < len(em.MODIFIERS), "every item changing the picture is suspicious"
    # Two that deliberately have none: worn, not fitted.
    assert "club_socks" not in bb.VISUALS
    assert "rain_cape" not in bb.VISUALS


def test_a_pocket_only_loadout_is_stock_and_costs_nothing():
    """The common case must stay free: no visual change means no render call."""
    assert bb.is_stock([]) is True
    assert bb.is_stock(["club_socks", "rain_cape", "espresso_token"]) is True
    assert bb.is_stock(["gravel_tyres"]) is False


def test_equip_order_does_not_change_the_build():
    """Two riders wearing the same things must share a prompt and a key. If the
    order leaked in, the cache would miss on every permutation and a rider would
    pay for a picture they already had."""
    a = ["gravel_tyres", "mudguards", "bell"]
    b = ["bell", "gravel_tyres", "mudguards"]
    assert bb.describe(a) == bb.describe(b)
    assert bb.build_key(1, "s", a) == bb.build_key(1, "s", b)
    assert bb.edit_prompt(a) == bb.edit_prompt(b)


def test_unknown_and_visual_free_items_are_ignored_in_the_key():
    """Equipping a charm must not invalidate a build that looks identical."""
    base = bb.build_key(1, "s", ["gravel_tyres"])
    assert bb.build_key(1, "s", ["gravel_tyres", "club_socks"]) == base
    assert bb.build_key(1, "s", ["gravel_tyres", "not_an_item"]) == base


def test_a_new_bike_invalidates_every_build_of_the_old_one():
    """The key carries the asset's own render stamp, so re-uploading a bike can
    never serve a build of a bicycle that no longer exists."""
    worn = ["aero_wheels"]
    assert bb.build_key(1, "stamp-a", worn) != bb.build_key(1, "stamp-b", worn)
    assert bb.build_key(1, "s", worn) != bb.build_key(2, "s", worn)


def test_the_prompt_edits_and_never_redescribes_the_bike():
    """The bike arrives as an IMAGE. Re-describing it invites the model to redraw
    the one thing that must stay pixel-identical."""
    p = bb.edit_prompt(["gravel_tyres", "mudguards"])
    assert "supplied photograph" in p
    assert "Keep the SAME bicycle" in p
    assert "Change ONLY the components listed below" in p


def test_one_call_carries_every_change():
    """Measured: three changes cost no more than one. A prompt that dropped a
    part would quietly need a second call, and stacking calls drifts."""
    p = bb.edit_prompt(["gravel_tyres", "mudguards", "bell", "aero_bars"])
    for expected in ("gravel tyres", "mudguards", "brass bell", "aero bar extensions"):
        assert expected in p


def test_the_integration_mandate_survives():
    """Without it, parts arrive floating in roughly the right place — the exact
    failure the studio's own prompt calls out."""
    p = bb.edit_prompt(["rack"])
    assert "structurally integrated" in p
    assert "must not" in p.lower() or "wrong" in p


def test_every_visual_names_a_concrete_change():
    for item_id, text in bb.VISUALS.items():
        assert len(text) > 30, f"{item_id} has a stub visual"
        assert text[0].isupper(), f"{item_id} does not read as an instruction"
