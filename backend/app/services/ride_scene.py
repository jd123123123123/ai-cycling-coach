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


# terrain bucket -> stylised background clause (matte toy-diorama style, matching
# the collectible character; verified against the generated look).
_TERRAIN = {
    "mountain": "a stylized cartoon mountain pass — dramatic pale-grey peaks, green switchback slopes and a winding hairpin road climbing steeply",
    "hilly": "stylized rolling green hills with gentle climbs and a curving country road",
    "flat": "a stylized flat open landscape — wide green fields and a long straight road to the horizon",
    "coastal": "a stylized sunny coastline — turquoise sea, a cliffside road and soft dunes",
}


def _terrain_key(g: RideGeo) -> str:
    """Terrain from the ride's own numbers. Offline, no external calls."""
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
    "Render the background in the SAME matte, simplified, glossy toy-collectible / "
    "clay-render style as the character — a stylized cartoon miniature diorama, NOT a "
    "photograph. Bright, sunny, clean poster-like collectible feel."
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
    "the W3 starter road — a stylized cartoon countryside road in bright morning light, "
    "soft green fields either side, a few rounded toy trees, gentle hills on the horizon "
    "and a clean ribbon of tarmac running off to the right of frame"
)


def scene_descriptor(g: RideGeo) -> str:
    """A stylised background clause for the hero prompt, from the real ride.

    Always safe to call: with no GPS/elevation it falls back to a neutral
    stylised outdoor road (never a fabricated location).
    """
    if (g.distance_m or 0) <= 0 and g.elevation_gain_m is None:
        base = "a stylized bright outdoor cartoon road scene, sunny and uplifting"
    else:
        base = _TERRAIN[_terrain_key(g)]
    # Prepend the real place only when a geocoder resolved it upstream.
    if g.place_name:
        base = f"{base}, a stylized cartoon version of {g.place_name}"
    return f"BACKGROUND: {base}. {_RENDER_STYLE}"


# Day-state → riding pose (what the scene depicts). Fed, with a backdrop, into
# cyclr_studio.compose_scene's `training_context`.
#
# These are deliberately COMIC. The hero is a collectible, not a training log:
# the day's recommendation should be readable at a glance from the rider's body
# language alone — flat out, pottering, or fast asleep. Every pose keeps both
# feet, both hands and both wheels in frame, because the scene prompt's anatomy
# and framing rules are absolute and a pose that fights them renders as a
# clipped, three-limbed mess.
#
# English on purpose: these strings are image-model prompt text, never UI copy.
_POSE = {
    # The owner's brief, literally: on a rest day the avatar is asleep on the bike.
    "rest": (
        "FAST ASLEEP on the moving bike — eyes shut in two happy curved lines, head "
        "slumped forward onto the handlebars using the bar tape as a pillow, cheek "
        "squashed, mouth slightly open, arms draped loosely over the bars, one foot "
        "still on its pedal and the other leg hanging lazily off the side, a small "
        "cartoon sleep bubble floating above the helmet. The bike rolls along perfectly "
        "upright as if nothing at all were wrong. Comically peaceful and cosy, never "
        "distressed or falling"
    ),
    # A rest day that is already underway: awake, but doing absolutely nothing.
    "lazy": (
        "doing absolutely nothing on a rolling bike — leaning way back off the saddle "
        "like it is a deckchair, both feet propped up on the handlebars with the ankles "
        "crossed, hands folded behind the helmet, eyes half closed, wearing an "
        "insufferably smug little grin. Not pedalling even slightly. Peak holiday energy"
    ),
    "endurance": (
        "cruising forever at an easy steady rhythm, sitting comfortably upright with "
        "elbows loose, chin up and a big content grin, legs turning in lazy perfect "
        "circles — the look of somebody who could keep this going all day and knows it"
    ),
    "hard": (
        "absolutely hammering — out of the saddle, body slammed low over the bars, "
        "hands in the drops, cheeks puffed out, eyes wide with comic determination, "
        "tongue poking out of the corner of the mouth, sweat droplets flying off in "
        "little cartoon arcs and speed lines trailing behind. Full gas, deeply silly"
    ),
    "recovery": (
        "spinning ludicrously gently in the easiest gear imaginable, sitting bolt "
        "upright with a blissed-out sleepy smile, legs barely turning, as if the bike "
        "were doing all of the work as a favour. Featherlight and floaty"
    ),
    # The session is already in the legs — this is the ride home.
    "trained": (
        "riding home victorious with the session done — sitting up no-handed, both arms "
        "flung wide in a triumphant cartoon celebration, chest puffed out, helmet "
        "slightly askew, grinning ear to ear at nobody in particular. Both hands clearly "
        "visible, palms open"
    ),
    "evening": (
        "winding the day down on a soft easy cruise, sitting up with one hand resting on "
        "the bars and the other stretching in a giant yawn, eyelids heavy, wearing a "
        "satisfied sleepy smile — done, fed, and heading home"
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
