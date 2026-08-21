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
# ── LANDFORM ONLY. THE SKY IS NOT OURS TO DECIDE. ──────────────────────────
# Every one of these used to prescribe the weather as well as the terrain:
# "under low, heavy cloud", "in flat overcast light", "cold mist between the
# switchbacks", "cold light breaking over the sea". The model does exactly what
# it is told, so a bright 133 km summer ride through rolling farmland was
# rendered grey and rained-on — and then the real recorded weather, added later,
# had to argue with prose that had already declared the sky.
#
# So these describe the SHAPE OF THE GROUND and nothing else. What the light was
# doing comes from `ride_weather.clause`, which reads the temperature, the rain
# and the wind that were actually measured that hour. Terrain we infer; weather
# we know — and the one we know should win.
#
# They are also written to be ABUNDANT rather than austere. "Muted" and "empty"
# are not neutral words: a scene told to be muted comes back drained, and the
# picture a rider wants of their own ride is not a bleak one.
_TERRAIN = {
    "mountain": "a high mountain pass — layered rock faces with visible strata, deep valleys falling away below, dense alpine vegetation clinging to the slopes and a hairpin road climbing steeply through it",
    "hilly": "rolling farmland hills — deep green fields in bands, hedgerows and stands of broadleaf trees, a curving country road cutting through the middle of it",
    "flat": "wide open country — rich fields running to a low horizon, lines of poplars along the verges and a long road drawn straight through them",
    "coastal": "a coastline — open water to one side, salt grass and low scrub on the headland, and a road running along the top of the cliff",
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

    # ABSOLUTE CLIMB, before any ratio. Measured on a real Maratona dles
    # Dolomites file: 6 053 m of ascent came back as "flat", because the ratio
    # needs a distance, the distance was missing, and 0/0 fell through every
    # test to the default. A ride with four figures of climbing is not flat
    # whatever else is unknown about it — and the generic "wide open plain"
    # clause then beat the resolved place, so the Dolomites rendered as a field.
    if gain >= 2000:
        return "mountain"
    if gain >= 800 and dist_km <= 0:
        return "hilly"

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
# or starter.
#
# THE RULE IS "MATCH THE CHARACTER", and what the character IS changed on
# 2026-08-19 when `cyclr_studio` adopted the studio's designer-toy house style.
# This constant used to enforce the opposite ("never a toy diorama") and would
# have torn every scene in half: a chunky vinyl rider on a restrained cinematic
# landscape. Measured on a Dolomites render, a background left to its own
# devices comes back photoreal while the rider stays toy, and the seam between
# them is the first thing the eye finds. So the background follows the figure.
_RENDER_STYLE = (
    "CRITICAL STYLE RULE: the environment is modelled with the SAME care and the same level of "
    "detail as the character — one coherent, high-fidelity 3D scene, never a figure standing in "
    "front of a backdrop.\n"
    "DETAIL: build the world out of real geometry. Individual plants, distinct blades of grass, "
    "separate leaves, layered foliage, real rock formations with visible strata, road surface with "
    "actual texture and a painted edge line. Foreground elements sit BETWEEN the camera and the "
    "rider — leaves, grasses or rocks close to the lens, thrown out of focus — so the scene has "
    "genuine depth rather than a flat plane behind the subject.\n"
    "LIGHT: cinematic and directional, with a clear key, real shadows that fall across the terrain, "
    "atmospheric haze in the distance and a rich falloff into darkness at the frame edges. "
    "Ray-traced global illumination and soft ambient occlusion where forms meet.\n"
    "MATERIALS: smooth matte surfaces with subtle texture, saturated but controlled colour. "
    "Stylised and sculpted rather than photographic — but DENSE and expensive-looking, never a "
    "sparse toy diorama, never simple grey lumps, never an empty gradient sky."
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
        base = "a stretch of open road with real verges — grass, scrub and trees close to its edge"
    else:
        base = _TERRAIN[terrain_key(g)]

    # THE PLACE LEADS. It used to be appended — "<generic mountain text>, a
    # stylised interpretation of the Dolomites" — and the generic clause won
    # every time: measured on real Dolomites coordinates, the render came back
    # as anonymous dark-grey crags with none of the pale limestone the range is
    # known for, because `_TERRAIN["mountain"]` had already spent five adjectives
    # describing a different mountain.
    #
    # So a resolved place becomes the subject and the terrain bucket demotes to
    # a qualifier. Without a place nothing changes — the terrain sentence stands
    # alone exactly as before, and no location is ever invented.
    if g.place_name:
        base = (
            f"the real roads of {g.place_name}, rendered so the specific rock, vegetation and "
            f"landforms that place is actually known for are unmistakable — {base}"
        )
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


#: How hard the day's effort is PLAYED, read from a flat side profile.
#:
#: The pose prose says what the body is doing; this says how much to sell it.
#: The camera stays side-on (`cyclr_studio._scene_prompt` records why turning it
#: was tried and reversed), so the performance has to survive in silhouette:
#: the line of the back, where the hands are, how the head is carried, and a
#: profile's worth of face.
#:
#: THE ONE LINE THIS MUST NOT CROSS is already drawn above, in `_POSE`: character
#: comes from posture and expression, never from cartoon devices. The first pass
#: at these poses used sleep bubbles, puffed cheeks and speed lines, and against
#: W3's near-black ground that read childish and fought the bike art. So the
#: performance is broad and the vocabulary is not: a real cyclist's face at that
#: effort, pushed one notch past what a photograph would catch.
_PERFORMANCE = (
    "PLAY THE EFFORT IN THE SILHOUETTE. How hard the day is must be legible from across a room, "
    "before anything else in the picture registers, and it has to survive being seen from the "
    "side: it lives in the line of the back, the angle of the head, where the hands are, how much "
    "weight is on them, and the profile of the face. Push it one notch past life — a hard day is "
    "gritted and driving, an easy day is unbothered to the point of smug, a rest day is comically, "
    "luxuriously done with cycling — and keep every bit of it in a real cyclist's vocabulary of "
    "postures and expressions. It is funny because it is recognisable, never because something "
    "cartoonish has been added to the frame."
)


def day_context(pose_key: str, backdrop_prose: str | None = None) -> str:
    """The `training_context` for TODAY's hero: the day-state's pose, played to
    camera, on the rider's chosen stage.

    No ride, no GPX, no invented location. `backdrop_prose` comes from
    `services.backdrops` — a stage the rider unlocked by riding, defaulting to
    the starter road when they have not chosen one. A backdrop is deliberately
    NOT a place we claim they rode: real places enter through
    `scene_descriptor`, from real GPS, and only for real rides.
    """
    pose = _POSE.get(pose_key, _POSE["endurance"])
    return (
        f"{pose}. {_PERFORMANCE} "
        f"BACKGROUND: {backdrop_prose or STARTER_BACKDROP}. {_RENDER_STYLE}"
    )
