"""The past-ride framing catalogue and its two prompt builders.

The rules under test are the ones that would silently rot: a framing that stops
being free when it was earned, a camera that drifts between framings, and the
lime accent leaking back in from the Today register and pulling every ride scene
away from the photoreal reference.
"""
from app.services import ride_framing as rf
from app.services.ride_scene import RideGeo

MOUNTAIN = RideGeo(distance_m=42_000, elevation_gain_m=1_200,
                   min_altitude_m=400, max_altitude_m=1_900)
SEASIDE = RideGeo(distance_m=40_000, elevation_gain_m=60,
                  min_altitude_m=2, max_altitude_m=18)
ROLLING = RideGeo(distance_m=50_000, elevation_gain_m=400)
NOTHING = RideGeo(distance_m=None, elevation_gain_m=None)


def test_terrain_earns_its_framing_for_free():
    """A ride is shot in the world it actually covered, at no cost."""
    assert rf.default_framing_for(MOUNTAIN) == "alpine"
    assert rf.default_framing_for(SEASIDE) == "coast"
    assert rf.FRAMINGS["alpine"].price_rc > 0   # bought by anyone else
    assert rf.FRAMINGS["studio"].price_rc == 0


def test_no_gps_earns_no_landscape():
    """With nothing to read, the ride falls back to the studio rather than
    being awarded scenery it cannot stand behind."""
    assert rf.default_framing_for(NOTHING) == "studio"
    assert rf.default_framing_for(ROLLING) == "studio"


def test_unknown_framing_degrades_to_a_real_picture():
    """An id from an old cached row must never raise — it must render."""
    assert rf.get("retired-framing-id").id == "studio"
    assert rf.get(None).id == "studio"
    assert rf.scene_prompt("a brass fixie", "retired-framing-id")


def test_every_framing_is_complete():
    """A framing missing a layer renders a hole in the picture."""
    for fid, f in rf.FRAMINGS.items():
        assert f.id == fid, f"{fid} disagrees with its own key"
        assert f.name_de
        assert f.price_rc >= 0
        for layer in (f.foreground, f.ground, f.backdrop, f.palette):
            assert len(layer) > 40, f"{fid} has a stub layer"


def test_camera_and_render_are_invariant_across_framings():
    """Two rides in two framings must read as one set. The framing owns the
    world; it never owns the camera or the render style."""
    prompts = [rf.scene_prompt("a brass fixie", fid) for fid in rf.FRAMINGS]
    for p in prompts:
        assert rf.SCENE_CAMERA in p
        assert rf.SCENE_RENDER in p
        assert rf.SCENE_LIGHT in p


def test_photoreal_register_never_inherits_the_today_style():
    """The reference is photoreal with no lime in it. `ride_scene._RENDER_STYLE`
    mandates the opposite on both counts, and leaking it back in here is exactly
    how ride scenes stopped looking like the reference."""
    for fid in rf.FRAMINGS:
        for p in (rf.scene_prompt("a brass fixie", fid), rf.edit_prompt(fid)):
            assert "C8FF00" not in p, f"{fid}: lime leaked into a photoreal scene"
            assert "stylised rather than photoreal" not in p
            assert "NOT stylised" in p


def test_scene_prompt_carries_the_bike_and_the_no_human_rule():
    p = rf.scene_prompt("a brass fixed-gear with deep green tyres", "garden")
    assert "a brass fixed-gear with deep green tyres" in p
    assert "no people" in p and "no hands" in p


def test_edit_prompt_preserves_the_bike_and_never_restates_it():
    """The edit path hands the bike in as an IMAGE, so re-describing it invites
    the model to redraw the thing that must stay pixel-identical."""
    p = rf.edit_prompt("garden")
    assert "supplied photograph" in p
    assert "Keep the SAME bicycle" in p
    assert "Change ONLY the world around it" in p


def test_garden_is_the_reference_layer_for_layer():
    """The framing transcribed from the reference frame keeps its four
    distinguishing features: a defocused near band, crimson in that band only,
    a sharp mown lawn, and hedging that dissolves to black."""
    g = rf.FRAMINGS["garden"]
    assert "defocused" in g.foreground and "crimson" in g.foreground
    assert "never be in focus" in g.foreground
    assert "mown" in g.ground
    assert "dissolves completely into black" in g.backdrop
    assert "three colour families only" in g.palette
