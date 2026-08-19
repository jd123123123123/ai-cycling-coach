"""Turn a ride's real GPS + elevation into a stylised scene descriptor.

Feeds the living-hero compositor (see `bike_render.py` / the living-hero spec):
after a ride, the hero's background reflects *where and what* the rider actually
rode — a mountain ride becomes a stylised alpine diorama, a flat coastal spin
becomes a stylised coast.

HONEST SCOPE: this produces a stylised *impression* of the ride's region and
terrain, not a satellite-accurate reconstruction of the exact road. Terrain is
derived offline from the ride's own numbers (elevation gain per km, altitude
range, latitude). A human-readable place name is an OPTIONAL enrichment: if a
reverse-geocoder is wired (`GEOCODER` configured) we prepend the real region;
otherwise we describe the terrain alone — never invent a place name.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RideGeo:
    distance_m: float | None
    elevation_gain_m: float | None
    # Optional GPS-derived signals (from the activity stream), all nullable.
    min_altitude_m: float | None = None
    max_altitude_m: float | None = None
    start_lat: float | None = None
    start_lng: float | None = None
    # Optional, only when a geocoder resolved it. Never fabricated.
    place_name: str | None = None


# terrain bucket -> background clause. Same restrained, cinematic register as
# the character and the bike art — atmospheric places, not toy dioramas.
_TERRAIN = {
    "mountain": "a high mountain pass at first light — dark rock faces, deep shadowed valleys below, cold mist between the switchbacks and a hairpin road climbing steeply",
    "hilly": "rolling hills under low, heavy cloud — muted greens, long shadows and a curving country road",
    "flat": "a wide open plain in flat overcast light — muted fields, a low horizon and a long straight road running to it",
    "coastal": "a windswept coastline — dark water, a cliffside road and cold light breaking over the sea",
}


def terrain_key(g: RideGeo) -> str:
    """Terrain from the ride's own numbers. Offline, no external calls.

    Public because `ride_framing` reads it to decide which framing a ride
    EARNED. One terrain classifier, so the backdrop a Today scene describes and
    the world a past ride is shot in can never disagree about the same ride.
    """
    dist_km = (g.distance_m or 0) / 1000
    gain = g.elevation_gain_m or 0
    # metres climbed per km — the standard "how hilly" ratio.
    ratio = gain / dist_km if dist_km > 0 else 0
    alt_range = (
        (g.max_altitude_m - g.min_altitude_m)
        if g.max_altitude_m is not None and g.min_altitude_m is not None
        else None
    )
    # Big sustained altitude range OR steep average → mountain.
    if ratio >= 15 or (alt_range is not None and alt_range >= 600):
        return "mountain"
    if ratio >= 6:
        return "hilly"
    # Near sea level and near-flat → coastal reads nicely; else flat.
    if g.max_altitude_m is not None and g.max_altitude_m <= 40 and ratio < 3:
        return "coastal"
    return "flat"


# How the background must be RENDERED — appended to every backdrop, ride-derived
# or starter, so a scene never drifts into photorealism away from the character.
_RENDER_STYLE = (
    "Render the background in the SAME restrained, cinematic style as the character: "
    "matte surfaces, atmospheric depth, controlled directional light and deep shadow, "
    "muted palette with one lime-green (#C8FF00) accent in the light. Simplified and "
    "stylised rather than photoreal, but never a cartoon, never a toy diorama, never "
    "bright and sunny."
)

# The SHARED starter backdrop: the one scene every rider begins in.
#
# Today's hero is not tied to a ride, so there is no GPX to derive terrain from —
# and inventing one per rider would make the same pose look like a different
# place for everyone, which is exactly the consistency the locked camera exists
# to protect. So the day-state scenes all play out on ONE road, identical for
# every rider, the way the starter kit is identical for every rider. Personal
# terrain stays where it is earned: the ride scenes, built from real GPS.
STARTER_BACKDROP = (
    "the W3 starter road — a dark, moody stretch of empty tarmac at dawn, deep near-black "
    "surroundings falling away into shadow, a low horizon with the faintest cold light on it, "
    "and a thin lime-green edge of first sun catching the road as it runs off to the right of "
    "frame. Atmospheric and restrained — no cartoon scenery, no toy trees, no bright blue sky"
)


def scene_descriptor(g: RideGeo) -> str:
    """A stylised background clause for the hero prompt, from the real ride.

    Always safe to call: with no GPS/elevation it falls back to a neutral
    stylised outdoor road (never a fabricated location).
    """
    if (g.distance_m or 0) <= 0 and g.elevation_gain_m is None:
        base = "an empty stretch of road in soft directional light, quiet and atmospheric"
    else:
        base = _TERRAIN[terrain_key(g)]
    # Prepend the real place only when a geocoder resolved it upstream.
    if g.place_name:
        base = f"{base}, a stylised interpretation of {g.place_name}"
    return f"BACKGROUND: {base}. {_RENDER_STYLE}"


# Day-state → riding pose (what the scene depicts). Fed, with a backdrop, into
# cyclr_studio.compose_scene's `training_context`.
#
# The day's recommendation must be readable at a glance from the rider's body
# language alone — flat out, pottering, or done for the day. Every pose keeps both
# feet, both hands and both wheels in frame, because the scene prompt's anatomy
# and framing rules are absolute and a pose that fights them renders as a
# clipped, three-limbed mess.
#
# English on purpose: these strings are image-model prompt text, never UI copy.
# Character comes from POSTURE, not cartoon devices. The first version of these poses
# leaned on sleep bubbles, puffed cheeks, speed lines and comic tongues; against
# W3's near-black, single-accent ground that read as childish and clashed with
# the bike art, which is premium product photography. Every pose below says the
# same thing with body language a real cyclist would recognise — a rest day is
# still unmistakably a rest day, it just isn't a cartoon about one.
_POSE = {
    # A rest day: the rider is draped over the bike, not riding it.
    "rest": (
        "completely switched off and slumped over the stationary bike — forearms folded on "
        "the bars with the head resting down on them, eyes closed, shoulders dropped, one "
        "foot on the ground. Utterly still. The picture of a body being allowed to do "
        "nothing at all"
    ),
    # A rest day already under way: awake, deliberately idle.
    "lazy": (
        "sitting up off the saddle at a standstill, one foot down, both hands resting on the "
        "bars, head tipped back with eyes half closed and a faint satisfied half-smile — "
        "unhurried, in no rush to clip in, entirely content to be off the gas"
    ),
    "endurance": (
        "settled into an easy sustainable rhythm — upright and relaxed on the hoods, elbows "
        "soft, shoulders low, gaze level down the road, legs turning smooth even circles. "
        "Calm and economical, the posture of someone who could hold this for hours"
    ),
    "hard": (
        "at full effort — out of the saddle, hands in the drops, torso low and driving, back "
        "flat, jaw set and eyes locked hard on the road ahead, every tendon and the tension "
        "in the kit visible. Explosive and controlled, sweat on the skin. Serious, never comic"
    ),
    "recovery": (
        "spinning gently in an easy gear, sitting tall and loose with hands resting on the "
        "tops, shoulders dropped, face calm and unbothered, legs light. Deliberately, almost "
        "lazily easy"
    ),
    # The session is already in the legs — this is the ride home.
    "trained": (
        "riding home with the work done — sitting up off the bars, one hand loosely on the "
        "tops, chin lifted, a quiet closed-mouth smile of genuine satisfaction, kit marked "
        "with the effort. Spent and pleased, not showboating"
    ),
    "evening": (
        "winding down in low golden light on a soft easy cruise, sitting upright with hands "
        "resting on the tops, shoulders loose, eyes soft and heavy-lidded, wearing a quiet "
        "tired smile — the last kilometres home"
    ),
}

# The poses Today's hero may ask for — the day-states the app can actually be in,
# plus the three effort reads a training day resolves to. The endpoint validates
# against this list, and the cached scene is keyed on the pose, so a rider ends
# up with at most one composed image per pose no matter how many days pass.
DAY_POSES = ("rest", "lazy", "endurance", "hard", "recovery", "trained", "evening")


def training_context(pose_key: str, g: RideGeo) -> str:
    """Compose the `training_context` for `cyclr_studio.compose_scene`: the
    riding pose (from the day-state / ride intensity) + the GPX-derived scene.
    This is the session-detail 'background generated from the GPX' idea."""
    pose = _POSE.get(pose_key, _POSE["endurance"])
    return f"{pose}. {scene_descriptor(g)}"


def day_context(pose_key: str) -> str:
    """The `training_context` for TODAY's hero: the day-state's pose on the
    shared starter backdrop.

    No ride, no GPX, no invented location — the same road for every rider, so
    the only thing that changes between two riders' Today heroes is the rider,
    the bike and what the day is asking of them.
    """
    pose = _POSE.get(pose_key, _POSE["endurance"])
    return f"{pose}. BACKGROUND: {STARTER_BACKDROP}. {_RENDER_STYLE}"
