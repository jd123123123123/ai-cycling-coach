"""Render the house-style assets so a style change can be looked at, not assumed.

`render_framing_probe.py` does this for past-ride framings; this does it for the
three surfaces `cyclr_studio` owns — the rider bust, the isolated bike
collectible, and the composed rider-on-bike scene. Adopting a style from another
codebase is exactly the kind of change that reads fine as a diff and lands
wrong as a picture.

    uv run python scripts/render_studio_probe.py rider [outdir]
    uv run python scripts/render_studio_probe.py bike  [outdir]
    uv run python scripts/render_studio_probe.py scene [outdir]

Uses fixed descriptions rather than a photo so the STYLE is the only variable
between runs.
"""
from __future__ import annotations

import asyncio
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import cyclr_studio, ride_place, ride_scene  # noqa: E402

# Written the way `_ANALYSIS['rider']` now asks for one: skin tone and ethnic
# features stated explicitly, because preserving them is the thing under test.
RIDER = (
    "A man in his early thirties with warm brown skin and South Asian features. Strong jawline, "
    "dark almond-shaped brown eyes, thick dark eyebrows, and a short neatly-trimmed black beard "
    "along the jaw. Thick black hair, medium length, dense natural curls with volume on top and "
    "shorter at the sides, 3D sculpted."
)
BIKE = (
    "A modern carbon road bicycle. Matte charcoal-grey aero frame with deep teardrop tube shapes "
    "and a subtle lime-green pinstripe along the top tube. Black drop handlebar with black tape. "
    "Deep-section black carbon rims with tan-wall tyres. Black saddle, black pedals."
)
SCENE = (
    "settled into an easy sustainable rhythm — upright and relaxed on the hoods, elbows soft, "
    "shoulders low, gaze level down the road, legs turning smooth even circles"
)


async def run(kind: str, outdir: pathlib.Path) -> int:
    if not cyclr_studio._gemini_ready():
        print("image model unavailable")
        return 1

    if kind == "rider":
        img, prompt, status = await cyclr_studio.render_isolated(RIDER, "rider")
    elif kind == "bike":
        img, prompt, status = await cyclr_studio.render_isolated(BIKE, "bike")
    elif kind == "scene":
        # The place is resolved the way a real ride resolves it — from real
        # coordinates. These are Passo Giau in the Dolomites.
        place = await ride_place.resolve(46.4839, 12.0556)
        print(f"place resolved: {place!r}")
        # Built through the REAL producer, not hand-rolled — an earlier version
        # of this probe assembled its own context, skipped `_RENDER_STYLE`, and
        # produced a photoreal landscape under a toy rider that production would
        # never have generated. A probe that does not use the production path
        # tests nothing.
        geo = ride_scene.RideGeo(distance_m=48_000, elevation_gain_m=1_400,
                                 min_altitude_m=900, max_altitude_m=2_230,
                                 place_name=place)
        ctx = ride_scene.training_context("endurance", geo)
        img, prompt, status = await cyclr_studio.compose_scene(RIDER, BIKE, ctx)
    else:
        print(f"unknown kind: {kind}")
        return 2

    print(f"{kind}: status={status} prompt={len(prompt)} chars")
    if not img:
        return 1
    header, b64 = img.split(",", 1)
    ext = "webp" if "webp" in header else "png"
    path = outdir / f"studio-{kind}.{ext}"
    path.write_bytes(base64.b64decode(b64))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    kind = sys.argv[1] if len(sys.argv) > 1 else "rider"
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    outdir.mkdir(parents=True, exist_ok=True)
    raise SystemExit(asyncio.run(run(kind, outdir)))
