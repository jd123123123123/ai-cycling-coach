"""The background clause: what a place is allowed to override, and what it is not."""
from app.services.places import _STALE_PROSE, prose_for
from app.services.ride_scene import RideGeo, scene_descriptor, terrain_key


def geo(**kw) -> RideGeo:
    base = dict(distance_m=54_000, elevation_gain_m=277)
    base.update(kw)
    return RideGeo(**base)


class TestPlaceLeads:
    def test_a_city_ride_is_not_described_as_farmland(self):
        # A 54 km ride through Berlin classifies as flat, and the flat sentence
        # describes fields, poplars and a straight road. The rider got exactly
        # that picture and recognised nothing in it.
        out = scene_descriptor(geo(place_name="Berlin"))
        assert "Berlin" in out
        assert "rich fields" not in out
        assert "poplars" not in out

    def test_it_asks_for_what_a_place_actually_has(self):
        # The old clause asked for "rock, vegetation and landforms" — words that
        # only fit a mountain — whatever the place was.
        out = scene_descriptor(geo(place_name="Berlin"))
        assert "buildings" in out
        assert "rock, vegetation and landforms" not in out

    def test_the_terrain_still_says_how_hilly_it_was(self):
        flat = scene_descriptor(geo(place_name="Berlin"))
        climb = scene_descriptor(geo(place_name="Passo Giau", elevation_gain_m=2400))
        assert "level" in flat
        assert "gradient" in climb

    def test_without_a_place_a_landscape_is_still_described(self):
        # Something has to be drawn, and inventing a landscape is correct when
        # there is genuinely nowhere to put the bike.
        out = scene_descriptor(geo())
        assert "wide open country" in out

    def test_no_location_is_ever_invented(self):
        out = scene_descriptor(geo())
        assert "the real roads of" not in out


class TestStaleProse:
    def test_the_old_clause_is_recognised_as_stale(self):
        # Places discovered before the fix carry the mountain vocabulary; they
        # must be rewritten on the next read rather than left in the table.
        old = (
            "BACKGROUND: the real roads of Berlin, rendered so the specific rock, "
            "vegetation and landforms that place is actually known for are unmistakable"
        )
        assert any(marker in old for marker in _STALE_PROSE)

    def test_freshly_written_prose_is_not_stale(self):
        fresh = prose_for("Berlin", geo(place_name="Berlin"))
        assert not any(marker in fresh for marker in _STALE_PROSE)


class TestTerrainUnchanged:
    def test_the_classifier_itself_did_not_move(self):
        assert terrain_key(geo()) == "flat"
        assert terrain_key(geo(elevation_gain_m=2400)) == "mountain"
