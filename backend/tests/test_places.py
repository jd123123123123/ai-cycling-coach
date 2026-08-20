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


# ── how a bike is put in a place ────────────────────────────────────────────

def test_a_world_swap_does_not_pin_the_bike_s_scale():
    """THE FLOATING BIKE, PINNED.

    `edit_prompt`'s preamble holds the camera, the position, the scale and the
    background still — which is the whole reason an edit beats a redraw for a
    PARTS swap, and a flat contradiction for a WORLD swap. Asked to keep its
    frame-filling scale AND stand on a road in a landscape, the bike kept the
    scale and floated above the road.
    """
    from app.services import bike_build

    world = bike_build.edit_prompt(["gravel_tyres"], world="BACKGROUND: a mountain road.")
    assert "same position in frame" not in world
    assert "SIZE AND PLACEMENT IN THE FRAME ARE NEW" in world

    # A parts swap still pins all four, because that is what makes it exact.
    parts = bike_build.edit_prompt(["gravel_tyres"])
    assert "same position in frame" in parts
    assert "same scale" in parts


def test_the_bike_is_stood_on_the_ground_it_is_given():
    from app.services import bike_build

    world = bike_build.edit_prompt([], world="BACKGROUND: a gravel track.")
    assert "closes over the bottom of both tyres" in world
    assert "nobody in the picture" in world


# ── the cut-out ─────────────────────────────────────────────────────────────

def test_a_missing_cut_out_keeps_the_photograph(monkeypatch):
    """NEVER FATAL. A cut-out that cannot be made costs the transparency and
    nothing else — the rider keeps the render, which is exactly what the app
    showed before the step existed."""
    from app.services import cutout, cyclr_studio

    monkeypatch.setattr(cutout, "cut_out", lambda _img: None)
    original = "data:image/webp;base64,AAAA"
    assert cyclr_studio._cut_out(original) == original


def test_the_cut_out_is_used_when_it_works(monkeypatch):
    from app.services import cutout, cyclr_studio

    monkeypatch.setattr(cutout, "cut_out", lambda _img: "data:image/png;base64,BBBB")
    assert cyclr_studio._cut_out("data:image/webp;base64,AAAA").startswith("data:image/png")


def test_an_unavailable_dependency_degrades(monkeypatch):
    """A deploy that ships without rembg must return None, not raise."""
    from app.services import cutout

    monkeypatch.setattr(cutout, "available", lambda: False)
    assert cutout.cut_out("data:image/webp;base64,AAAA") is None
