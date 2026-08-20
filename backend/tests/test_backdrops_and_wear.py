"""The stage Today plays on, and what the rider is wearing on it.

Two features that meet in one prompt: `backdrops` decides where the hero
happens and what it costs to open it, `rider_wear` decides what is on the
rider's head once it does. Both are pure functions over a catalogue, so both
are testable without a database or an image model — which is the point of
keeping them out of the endpoint.
"""
import inspect

from app.services import backdrops, rider_wear
from app.services import earn_modifiers as em
from app.services.ride_scene import day_context


# ── the catalogue ───────────────────────────────────────────────────────────

def test_the_starters_need_nothing():
    """A rider on day one has never ridden, and must still be able to choose."""
    assert len(backdrops.STARTERS) >= 2
    for bid in backdrops.STARTERS:
        b = backdrops.CATALOGUE[bid]
        assert b.unlocked_by is None
        assert b.unlock_de == ""


def test_every_earned_stage_says_what_it_costs():
    """An unlock rule the rider cannot read is a lottery — the same rule the
    modifier catalogue holds itself to with `why`."""
    for b in backdrops.CATALOGUE.values():
        if not b.is_starter:
            assert b.unlock_de, f"{b.id} has no rider-facing unlock rule"
            assert b.unlocked_by is not None


def test_no_rule_fires_on_a_fact_we_do_not_have():
    """RULE 4, inherited from `earn_modifiers`: an empty ride unlocks nothing.

    A rule that reads a None fact and treats it as zero would hand a rider the
    winter road for a ride whose temperature we never learned.
    """
    nothing = em.RideFacts()
    assert backdrops.earned_by(nothing) == []


def test_the_default_survives_an_unknown_id():
    """A stage removed in a deploy must not 500 every hero request until the
    rider picks again."""
    assert backdrops.resolve("no_such_stage").id == backdrops.DEFAULT_ID
    assert backdrops.resolve(None).id == backdrops.DEFAULT_ID


def test_unlocks_are_judged_per_ride_not_per_season():
    """'1 000 hm an einem Tag' is one day's climbing. Summed over a season it
    would pay out for a reward nobody earned."""
    ten_small_days = [em.RideFacts(elevation_gain_m=200) for _ in range(10)]
    assert "mountain_pass" not in backdrops.unlocked_ids(ten_small_days)
    assert "mountain_pass" in backdrops.unlocked_ids([em.RideFacts(elevation_gain_m=1200)])


def test_the_weather_gated_set_is_exactly_what_it_claims():
    """`NEEDS_WEATHER` drives a real split — those rules are earned at
    ingestion, the rest evaluate live over history. If a new rule starts reading
    a weather fact without joining the set, it silently never unlocks."""
    wet = em.RideFacts(was_wet=True, temp_c=-5)
    dry = em.RideFacts(was_wet=False, temp_c=20)
    reads_weather = {
        b.id for b in backdrops.CATALOGUE.values()
        if not b.is_starter and b.unlocked_by(wet) != b.unlocked_by(dry)  # type: ignore[misc]
    }
    assert reads_weather == backdrops.NEEDS_WEATHER


def test_the_cheap_rules_do_not_need_weather():
    """The other half must unlock from columns alone, or a rider who earned a
    stage before the unlock table existed would never see it."""
    facts = em.RideFacts(
        elevation_gain_m=1500, distance_m=140_000, start_hour=5,
        intensity_factor=0.97, surface="gravel",
    )
    earned = set(backdrops.earned_by(facts))
    assert {"mountain_pass", "coast_road", "dawn_road", "velodrome", "gravel_track"} <= earned
    assert not (earned & backdrops.NEEDS_WEATHER)


# ── worn gear ───────────────────────────────────────────────────────────────

def test_the_worn_slots_are_real_catalogue_slots():
    for slot in rider_wear.WORN_SLOTS:
        assert slot in em.SLOTS


def test_every_worn_item_has_a_look():
    """A helmet the rider bought and cannot see is the feature failing."""
    for m in em.MODIFIERS.values():
        if m.slot in rider_wear.WORN_SLOTS:
            assert m.id in rider_wear.WORN, f"{m.id} is worn but has no visual"


def test_a_bare_head_says_nothing_at_all():
    """THE RULE THIS CODEBASE KEEPS EVERYWHERE: describe what IS. A sentence
    that mentions a helmet in order to deny it puts a helmet in the prompt."""
    assert rider_wear.clause([]) == ""
    assert rider_wear.clause(["gravel_tyres", "banana"]) == ""


def test_bike_parts_never_reach_the_rider_s_head():
    """`WORN` is deliberately smaller than the catalogue, the same way
    `bike_build.VISUALS` is."""
    assert rider_wear.worn_ids(["power_meter", "mudguards", "lanterne_rouge"]) == []


def test_a_helmet_and_glasses_both_render():
    text = rider_wear.clause(["aero_helm", "sonnenbrille", "gravel_tyres"])
    assert "aerodynamic time-trial helmet" in text
    assert "mirrored acid-lime" in text


def test_the_loadout_reads_in_slot_order_whatever_the_caller_says():
    """The clause is part of the scene cache key, so two orderings of the same
    loadout must not produce two different renders."""
    a = rider_wear.clause(["sonnenbrille", "aero_helm"])
    b = rider_wear.clause(["aero_helm", "sonnenbrille"])
    assert a == b
    assert rider_wear.key(["sonnenbrille", "aero_helm"]) == "aero_helm-sonnenbrille"
    assert rider_wear.key([]) == "bare"


def test_worn_gear_never_swallows_the_face():
    """Even in profile the expression has to survive: the day's effort is read
    off the brow, the mouth and the jaw, and eyewear that blanks them out would
    cost the hero the thing it exists to say."""
    text = rider_wear.clause(["gletscherbrille"])
    assert "never swallows the face" in text
    assert "profile" in text


# ── the scene prompt ────────────────────────────────────────────────────────

def test_the_day_context_carries_the_chosen_stage():
    ctx = day_context("hard", backdrops.CATALOGUE["mountain_pass"].prose)
    assert "mountain pass" in ctx
    assert "at full effort" in ctx


def test_an_unchosen_stage_still_produces_a_hero():
    """No selection is not an error state — it is the starter road."""
    assert "starter road" in day_context("rest")


def test_the_effort_is_played_in_the_silhouette():
    """The half of the feature that is not the backdrop. The camera stays flat
    side-on, so the day's intensity has to be legible from the line of the back
    and the angle of the head rather than from a face turned to the lens."""
    assert "PLAY THE EFFORT IN THE SILHOUETTE" in day_context("hard")


def test_the_scene_camera_stays_a_flat_drive_side_profile():
    """PINNED, because it was changed and changed back on 2026-08-20. The flat
    profile is what shows the whole machine and lets the world around it read as
    a place; it is also the camera `BIKE_CAMERA` and `ride_framing` both lock,
    so all three surfaces stay one set. Worn gear rides along on it — a helmet
    is a silhouette and reads better in profile than head-on."""
    from app.services.cyclr_studio import _scene_prompt
    prompt = _scene_prompt("a rider", "a bike", "riding hard", rider_wear.clause(["kletterhelm"]))
    assert "SIDE-ON PROFILE" in prompt
    assert "DRIVE SIDE" in prompt
    assert "three-quarter" not in prompt.replace("Do not use a three-quarter", "")
    assert "matte white road helmet" in prompt


def test_compose_scene_accepts_worn_gear():
    """One keyword argument, easy to lose in a refactor, and the helmet silently
    stops rendering if it goes."""
    from app.services.cyclr_studio import compose_scene
    assert "wear" in inspect.signature(compose_scene).parameters
