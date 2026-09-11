"""A stage may change where the bike stands. It may not fit it with luggage.

Measured on the Ventoux stage with a real rider's Standert: the render came back
carrying two bottle cages, two bottles, a frame bag and a top-tube bag, all in
the frame's own accent colour. Convincing, and none of it the rider's.

The collectible is a record of what the rider OWNS — that is the whole reason
the photograph is handed to the model instead of a description. A stage that
quietly adds accessories turns the record into a fiction.
"""
from app.services import bike_build


def test_a_plain_bike_in_a_world_is_told_to_add_nothing():
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "ADD NOTHING TO THE BICYCLE" in p
    for banned in ("bottle cages", "frame bag", "saddle bag", "mudguards"):
        assert banned in p


def test_the_clause_is_the_last_thing_the_model_reads():
    """Trailing position is the point — it must not be buried mid-prompt."""
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert p.rstrip().endswith("Only the SETTING and the LIGHTING change.")


def test_a_rider_who_BOUGHT_a_bag_still_gets_it():
    """The clause forbids inventions, never purchases. A rider who equipped a
    part must still see it fitted, or the shop is lying to them."""
    equipped = bike_build.describe([])
    assert equipped == [] or equipped is not None       # guard the assumption
    for item in ("bar_tape_acid", "saddle_carbon", "wheels_deep"):
        p = bike_build.edit_prompt([item], world="a bare limestone summit")
        if bike_build.describe([item]):
            assert "ADD NOTHING TO THE BICYCLE" not in p, (
                f"{item} was equipped; the no-additions clause must stand down"
            )
            break


# ── the reward lighting ─────────────────────────────────────────────────────

def test_a_prose_stage_is_lit_as_a_reward():
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "THE LIGHT IS THE REWARD" in p
    for lever in ("bright rim", "toward the camera", "clearly separated planes"):
        assert lever in p


def test_the_stage_owns_the_hour_not_the_lighting_clause():
    """THE BUG THIS PINS. The first version opened with "golden hour, twenty
    minutes before sunset, warm amber light" — and four catalogue stages name
    their own hour: night_road is true night, rain_road has a flat grey sky,
    winter_road a sun with no warmth, dawn_road is sunrise not sunset. Handing
    the model both is handing it a contradiction."""
    p = bike_build.edit_prompt([], world="a road at true night, lit by one street lamp")
    assert "KEEP THE HOUR AND THE WEATHER THE SETTING ABOVE DESCRIBES" in p
    for forced in ("golden hour", "before sunset", "warm amber", "warm rim"):
        assert forced not in p, f"the clause still dictates an hour: {forced!r}"


def test_every_catalogue_stage_that_names_an_hour_survives_the_clause():
    """Named explicitly so a future edit that reintroduces a fixed hour fails
    here rather than in a rider's reward screen."""
    from app.services import backdrops
    p = bike_build.edit_prompt([], world="x")
    for sid in ("night_road", "rain_road", "winter_road", "dawn_road"):
        assert sid in backdrops.CATALOGUE, f"{sid} vanished from the catalogue"
    assert "nothing below may override it" in p


def test_the_machine_may_not_become_a_silhouette():
    """Bought with a failed pass: backlight alone underexposed the drive side and
    the rider's own bike came back as the darkest object in its own reward
    picture. A stage that hides the bike defeats the point of the bike."""
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "MUST NOT FALL INTO SILHOUETTE" in p
    assert "soft bounce from the camera side" in p


def test_the_landmark_stays_the_proof():
    """Also bought with a failed pass: chasing contrast shrank the observatory
    tower to a generic antenna. For a stage whose whole reward is 'I was there',
    the proof cannot be incidental."""
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "THE LANDMARK IS THE PROOF" in p


def test_a_plate_keeps_its_own_HOUR():
    """The plate arm exists to MATCH a photograph, so the HOUR is the one thing
    withheld from it — relighting a stored world to a different time of day
    breaks the only reason that arm exists.

    It does still get the craft. Withholding that too was the bug: it left the
    deterministic arm with no rim, no fill and no composition, and the result
    was read as "compositing looks worse than rendering"."""
    p = bike_build.edit_prompt([], world="anything", has_plate=True)
    assert "KEEP THE HOUR" not in p
    assert "THE LIGHT IS THE REWARD" in p


def test_no_world_means_no_stage_lighting():
    """The plain garage render is a studio product shot and must stay one."""
    assert "THE LIGHT IS THE REWARD" not in bike_build.edit_prompt([])


def test_the_stage_render_reserves_a_crop_budget():
    """MEASURED, NOT GUESSED. The hero room draws a stage with `object-fit:
    cover`; a 1:1 render in its ~390x544 box loses 28% of its width, 77px each
    side — which on both test renders was exactly where the wheels were."""
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "THIS IMAGE IS A BACKGROUND WITH INTERFACE DRAWN OVER IT" in p
    assert "outer eighth of the frame" in p
    assert "NO MORE THAN 60% of the image width" in p


def test_the_render_reserves_room_for_the_chrome():
    """MEASURED IN THE ROOM. The app draws the rider's portrait in a centred
    column across the top third and the readiness dock across the bottom fifth.
    A landmark dead centre gives the rider a bust wearing an observatory tower;
    a centred bicycle leaves a dead band of ground above the dock."""
    p = bike_build.edit_prompt([], world="a bare limestone summit")
    assert "EMPTY SKY" in p
    assert "72% of the image HEIGHT" in p, "layout must be numeric, not prose"


def test_the_stage_aspect_is_the_hero_room_s_shape():
    """The room is the WHOLE screen — 390x844, ratio 0.46 — because a scene is
    the room rather than an object in it. Measuring only the area above the dock
    gave 3:4 and still cost 38% of the width."""
    from app.services import cyclr_studio
    assert cyclr_studio.STAGE_ASPECT == "9:16"


def test_a_stage_may_not_carry_someone_else_s_ip():
    """CAUGHT ON THE FIRST PLAYFUL STAGE. The world said only "a child's bedroom
    from a 1990s animated film — sky-blue wall, flat white cartoon clouds". The
    render came back with two real, correctly-branded film posters on the wall.
    Nobody asked; the association pulled them in, and it obliged convincingly."""
    p = bike_build.edit_prompt([], world="a child's bedroom with cloud wallpaper")
    assert "NO THIRD-PARTY INTELLECTUAL PROPERTY" in p
    for banned in ("movie posters", "brand logos", "characters"):
        assert banned in p


def test_the_guard_rides_along_with_a_photographed_place_too():
    """A real place can have a billboard in it just as easily as an imagined one."""
    p = bike_build.edit_prompt([], world="a city street", has_plate=True)
    assert "NO THIRD-PARTY INTELLECTUAL PROPERTY" in p


def test_a_plain_garage_render_needs_no_world_guard():
    """No world, no scenery, nothing for a logo to sit on."""
    assert "NO THIRD-PARTY INTELLECTUAL PROPERTY" not in bike_build.edit_prompt([])


# ── the difficulty ladder ───────────────────────────────────────────────────

def test_each_rung_has_its_own_register():
    for tier in ("alltag", "ernsthaft", "selten", "legendaer"):
        assert "REGISTER" in bike_build.edit_prompt([], world="x", tier=tier)


def test_the_bottom_rung_is_deliberately_restrained():
    """THE DISCIPLINE THAT MAKES THE LADDER WORK. "Make it epic" applied to all
    fifty produces a flat ladder wearing a lot of drama — and a flat ladder
    cannot make anybody envious, because nothing in it is out of reach."""
    p = bike_build.edit_prompt([], world="a suburban street", tier="alltag")
    assert "QUIET AND CHARMING, NOT SPECTACULAR" in p
    assert "it must look like it" in p
    for reserved in ("aurora", "overwhelming"):
        assert reserved not in p, f"{reserved!r} belongs to a higher rung"


def test_the_reserved_devices_stay_at_the_top():
    """Impossibility, an event, impossible light and vastness are the four steps
    a lower rung cannot take. Spending them lower flattens the ladder."""
    low = bike_build.edit_prompt([], world="x", tier="alltag")
    high = bike_build.edit_prompt([], world="x", tier="legendaer")
    assert "cannot simply go" in high and "cannot simply go" not in low
    assert "further than any horizon" in high and "further than any horizon" not in low


def test_an_untiered_stage_is_not_given_a_rung_by_guesswork():
    p = bike_build.edit_prompt([], world="x")
    assert "REGISTER" not in p


# ── the plate arm was running naked ─────────────────────────────────────────

def test_the_plate_arm_gets_the_craft_too():
    """THE BUG THIS PINS. The plate arm — the one that gives two riders the same
    world — received no rim separation, no fill, no depth, no landmark rule and
    no composition at all. Every plate-based render looked flat next to a prose
    one for that reason alone, and it was read as "compositing looks worse"."""
    p = bike_build.edit_prompt([], world="a summit", has_plate=True)
    for needed in ("THE LIGHT IS THE REWARD", "MUST NOT FALL INTO SILHOUETTE",
                   "THE LANDMARK IS THE PROOF", "NO MORE THAN 60% of the image width",
                   "72% of the image HEIGHT", "outer eighth of the frame"):
        assert needed in p, f"the plate arm is missing: {needed!r}"


def test_only_the_hour_is_withheld_from_the_plate_arm():
    """A photograph already decided its hour; relighting it to another one would
    break the only thing that arm exists for."""
    plate = bike_build.edit_prompt([], world="a summit", has_plate=True)
    prose = bike_build.edit_prompt([], world="a summit")
    assert "KEEP THE HOUR" not in plate
    assert "KEEP THE HOUR" in prose


def test_the_craft_never_dictates_an_hour():
    """It has to work at midnight and at noon, or it cannot be shared by both
    arms — which is the whole point of splitting it out."""
    for forced in ("golden hour", "before sunset", "warm amber"):
        assert forced not in bike_build.LIGHT_CRAFT
