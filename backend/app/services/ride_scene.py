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
    return (
        f"BACKGROUND: {base}. Render the background in the SAME matte, simplified, glossy "
        "toy-collectible / clay-render style as the character — a stylized cartoon miniature "
        "diorama, NOT a photograph. Bright, sunny, clean poster-like collectible feel."
    )


# Day-state → riding pose (the effort the scene depicts). Fed, with the GPX
# scene, into cyclr_studio.compose_scene's `training_context`.
_POSE = {
    "rest": "riding relaxed and easy, sitting up, calm and content",
    "endurance": "riding steady and comfortable, cruising happily",
    "hard": "riding super fast and low, out of the saddle, driving hard up a climb in a funny determined effort",
    "recovery": "spinning very gently, soft and easy",
    "evening": "riding an easy relaxed cruise, satisfied at the end of the day",
}


def training_context(pose_key: str, g: RideGeo) -> str:
    """Compose the `training_context` for `cyclr_studio.compose_scene`: the
    riding pose (from the day-state / ride intensity) + the GPX-derived scene.
    This is the session-detail 'background generated from the GPX' idea."""
    pose = _POSE.get(pose_key, _POSE["endurance"])
    return f"{pose}. {scene_descriptor(g)}"
