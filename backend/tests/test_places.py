"""Places: the shared catalogue, the stamp that cannot be bought, and the price.

The database half of this feature is exercised by the API tests; what is here is
the logic that decides what a place IS — its id, its price, its prose and the
prompt that renders it — plus the seam that lets one picker draw two different
kinds of stage.
"""
from app.services import backdrops, places, stages
from app.services.ride_scene import RideGeo


# ── identity ────────────────────────────────────────────────────────────────

def test_the_same_mountains_are_one_place():
    """Two riders whose resolvers answered with different casing or accents must
    not put the same range on the map twice — the catalogue is global, so a
    duplicate is visible to everybody."""
    assert places.slug_for("Dolomiten") == places.slug_for("dolomiten")
    assert places.slug_for("Dolomiten") == places.slug_for("DOLOMITEN")


def test_accents_fold_but_the_place_survives():
    assert places.slug_for("Côte d'Azur") == "place:cote-d-azur"
    assert places.slug_for("Schwäbische Alb") == "place:schwabische-alb"


def test_every_place_id_is_namespaced():
    """The one thing standing between a place and a hand-written stage in
    `DayScene.backdrop`. A collision would serve a rider the wrong picture out
    of the cache."""
    assert places.slug_for("Dolomiten").startswith(places.PREFIX)
    assert places.is_place("place:dolomiten")
    assert not places.is_place("starter_road")
    assert not places.is_place(None)


def test_a_nameless_place_still_gets_a_usable_id():
    """Defensive: the resolver is not supposed to hand back punctuation, but an
    id of "place:" would collide with every other empty one."""
    assert places.slug_for("!!!") == "place:unbekannt"


def test_the_id_stays_inside_the_column():
    """`DayScene.backdrop`, `RiderStage.backdrop` and `RiderBackdrop.backdrop`
    are all String(64)."""
    assert len(places.slug_for("A" * 200)) <= 64


# ── price ───────────────────────────────────────────────────────────────────

def test_a_mountain_costs_more_than_a_flat_road():
    mountain = places.price_for(RideGeo(distance_m=80_000, elevation_gain_m=2400))
    flat = places.price_for(RideGeo(distance_m=80_000, elevation_gain_m=120))
    assert mountain > flat


def test_a_place_sits_between_the_gear_tiers():
    """Above rare because equipment is consumed and a place is kept; below
    legendary because a place already costs something money cannot buy — having
    been there. Pinned because it is the kind of balance that gets nudged by
    accident, and the whole sink stops making sense outside these bounds."""
    from app.services.earn_modifiers import PRICE_BY_RARITY
    assert min(places.PRICE_BY_TERRAIN.values()) > PRICE_BY_RARITY["rare"]
    assert max(places.PRICE_BY_TERRAIN.values()) < PRICE_BY_RARITY["legendary"]


# ── prose and plate ─────────────────────────────────────────────────────────

def test_the_place_leads_and_the_terrain_qualifies():
    """The rule `scene_descriptor` already implements: a generic mountain
    sentence otherwise beats the specific limestone the Dolomites are known
    for. Reused here rather than restated, so the two cannot drift."""
    prose = places.prose_for("Dolomiten", RideGeo(distance_m=90_000, elevation_gain_m=3000))
    assert "Dolomiten" in prose
    assert prose.index("Dolomiten") < len(prose) // 2


def test_the_plate_has_no_rider_and_no_bike_in_it():
    """The entire economics of the feature: one render serves everybody
    precisely because there is nobody in it."""
    from app.models.place import Place
    p = Place(slug="place:test", name="Test", prose="BACKGROUND: a road.", price_rc=1200)
    prompt = places.plate_prompt(p)
    assert "without anybody in it" in prompt or "nothing in the middle" in prompt
    assert "waiting" in prompt


def test_the_plate_leaves_room_for_a_rider():
    """A plate whose interest is all in the centre has nowhere to stand."""
    prompt = places.plate_prompt(
        __import__("app.models.place", fromlist=["Place"]).Place(
            slug="place:test", name="Test", prose="BACKGROUND: a road.", price_rc=1200,
        )
    )
    assert "clear and uncluttered" in prompt
    assert "defocused near layer" in prompt


# ── the seam ────────────────────────────────────────────────────────────────

async def test_a_hand_written_stage_needs_no_database(anyio_backend=None):
    """`stage_for` routes on the id alone, so the static half never touches the
    places table. Passing None as the session proves it."""
    stage = await stages.stage_for(None, "starter_road")  # type: ignore[arg-type]
    assert stage.id == "starter_road"
    assert stage.plate_url is None
    assert not stage.is_place


async def test_an_unknown_stage_falls_back_rather_than_failing(anyio_backend=None):
    """A stage removed in a deploy must not cost a rider their hero."""
    stage = await stages.stage_for(None, "no_such_stage")  # type: ignore[arg-type]
    assert stage.id == backdrops.DEFAULT_ID
