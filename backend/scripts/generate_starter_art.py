"""Re-render the shipped starter art in the house style.

WHY THIS EXISTS. The onboarding journey and every preview harness show
`frontend/src/editorial/w3/starterBike.ts` — a cut-out product PHOTOGRAPH of a
stock road bike on a white ground, inlined as 112 KB of base64. It is the first
picture a new rider ever sees, and it belongs to a different app: the house
style is a near-black studio, a pool of light under the wheels, and the machine
as the only colour in frame (`services/backdrops.studio_black`). A white
product card in the middle of that reads as a placeholder, because it is one.

It also costs every single page load 112 KB of base64 in the JavaScript bundle,
for an image that could be a cached file.

WHAT IT WRITES. `frontend/public/w3/starter-bike.webp` — one bike, house style,
black studio, on the same locked drive-side camera the garage uses, so the
starter sits in the same set as every bike a rider will ever own.

    uv run python scripts/generate_starter_art.py

Idempotent by default: an existing file is left alone unless --force is passed,
because this is shipped art and re-rolling it silently on a deploy would change
the app's first impression without anybody choosing to.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import backdrops, cyclr_studio  # noqa: E402

PUBLIC = pathlib.Path(__file__).resolve().parents[2] / "frontend/public/w3"

#: The starter machine, described rather than photographed. Deliberately a plain,
#: honest bike: `w3bikes` calls the starter a Rostlaube, and a first bike a rider
#: wants to replace is a better hook than a superbike they cannot improve on.
STARTER = (
    "a simple, honest steel road bicycle — a slim round-tube frame in matte charcoal with no "
    "decals, drop handlebars wrapped in plain black tape, a black saddle, silver rims with black "
    "tyres, and a visible chain and rear cassette. Well used and well kept: this is a starter "
    "bike, not a superbike"
)


def _prompts() -> dict[str, str]:
    """Every shipped placeholder, in the house style, keyed by filename.

    ALL THREE ARE EMPTY STATES, and that is why they are generated rather than
    drawn: a rider meets them BEFORE they have anything of their own, so they
    are the app's promise of what their bike and their face will look like. A
    stock photograph on white promises the wrong thing.
    """
    stage = backdrops.CATALOGUE[backdrops.DEFAULT_ID]
    return {
        # The bike a rider is given before they photograph their own.
        "starter-bike.webp": (
            f"An isolated bicycle: {STARTER}.\n\n"
            f"{cyclr_studio.BIKE_CAMERA}\n\n"
            f"BACKGROUND: {stage.prose}.\n\n"
            f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.ISOLATED_BIKE_STYLE}"
        ),
        # The bike-shaped absence on the "add a photo" step. Drawn knocked back
        # in the UI, so it is rendered plainly here and dimmed there.
        "example-bike.webp": (
            "An isolated bicycle: a clean modern road bicycle with a plain unbranded frame, drop "
            "handlebars, deep black rims and no decals of any kind — a generic shape, not a "
            "specific machine, because it stands for a bike the rider has not photographed yet.\n\n"
            f"{cyclr_studio.BIKE_CAMERA}\n\n"
            f"BACKGROUND: {stage.prose}.\n\n"
            f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.ISOLATED_BIKE_STYLE}"
        ),
        # THE STAGE ITSELF. Today and the garage drew their floor as a CSS
        # gradient — four stops of near-black, which is flat by construction:
        # no falloff in the corners, no grain, no light with a direction. A
        # rendered studio has all three, and a cut-out standing on it reads as
        # an object in a room rather than a sticker on a gradient.
        #
        # It is also the one asset every rider sees on every screen, so it is
        # worth 2K and worth being beautiful.
        "stage-studio.webp": (
            # THE HOUSE STYLE IS GRAPHIC, NOT ATMOSPHERIC. The first version of
            # this plate asked for haze, falloff and a pool of light, and got
            # back exactly that: a soft, blurred, foggy room. Held next to the
            # W3 renders it was obviously wrong — every one of those is a SHARP
            # graphic set, a flat wall meeting a flat floor at a clean horizon,
            # everything in focus, one honest shadow under the wheels. The look
            # is a product photograph of a toy, not a mood.
            "A clean, sharp, graphic studio set, rendered in perfect focus: one flat seamless wall "
            "meeting one flat floor at a clean horizontal line LOW in the frame — about four fifths "
            "of the way down, so the wall fills most of the picture and the floor is a shallow "
            "band along the bottom, exactly as a product set is shot.\n\n"
            "There is NOTHING in the room — no objects, no props, no people, no text, no pattern.\n"
            "COLOUR: deep charcoal, near-black at the top of the wall and lifting very slightly "
            "toward the horizon; the floor a touch lighter than the wall so the two planes read "
            "apart at a glance. One flat colour family only.\n"
            "LIGHT: broad, even and soft-boxed, filling the whole set. The horizon line is crisp "
            "and unmistakable. Light falls off gently toward the left and right edges and never "
            "reaches black at the frame edge — the set continues past the picture.\n"
            "SURFACE: matte and perfectly smooth, with a faint even sheen on the floor.\n\n"
            "CRITICAL: every part of this image is IN FOCUS and CRISP. No depth of field, no "
            "blur, no fog, no haze, no smoke, no atmospheric perspective, no heavy vignette, no "
            "spotlight pool, no visible grain. Flat, clean and modern — a graphic 3D set."
        ),
        # THE FIRST PICTURE IN THE APP. The welcome screen ran a stock
        # PHOTOGRAPH of a road cyclist, inlined as base64 — a different app's
        # art on the one screen that sets the expectation for everything after
        # it. This is the house's own character on the house's own ground.
        "onboard-hero.webp": (
            "A premium 3D designer art-toy collectible character riding a bicycle, seen in a flat "
            "side view from the bike's drive side, facing right, riding along at an easy relaxed "
            "pace with both hands on the bar tops and a calm, open, happy expression.\n\n"
            f"{cyclr_studio.CHARACTER_STYLE}\n\n{cyclr_studio.DEFAULT_KIT}\n\n"
            "THE FIGURE IS SMALL IN A BIG FRAME: it sits low and slightly right of centre with a "
            "great deal of open space above it, because a headline and a button are drawn over the "
            "top half of this picture. Nothing important happens in the upper half.\n\n"
            "BACKGROUND: an empty road at dawn running left to right, deep near-black surroundings "
            "falling away into shadow, a low horizon with the faintest cold light on it and a thin "
            "acid-lime edge of first sun catching the road. Atmospheric and restrained.\n"
            "PORTRAIT FRAME, taller than it is wide.\n\n"
            f"{cyclr_studio.GENERAL_STYLE}"
        ),
        # The face-shaped absence on the avatar step, which until now was a
        # lucide BICYCLE icon — the wrong object entirely on a screen asking for
        # a photograph of a person.
        "example-rider.webp": (
            "A tight front-facing PORTRAIT of a 3D collectible character with a completely "
            "featureless face: the head is one smooth matte surface with no eyes, no nose and no "
            "mouth at all, and no hair — a blank mannequin head, because this stands for a rider "
            "who has not been photographed yet.\n\n"
            "CAMERA FRAMING — a close portrait crop from just above the head to the middle of the "
            "chest, shot dead-on, the head filling most of the frame.\n\n"
            f"{cyclr_studio.DEFAULT_KIT}\n\n"
            f"BACKGROUND: {stage.prose}.\n\n"
            f"{cyclr_studio.GENERAL_STYLE}"
        ),
    }


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-render even if the file exists")
    ap.add_argument("--only", help="render just this filename")
    args = ap.parse_args()

    if not cyclr_studio._gemini_ready():
        print("Image model unavailable — check IMAGE_PROVIDER / GEMINI_API_KEY in backend/.env")
        return 1

    PUBLIC.mkdir(parents=True, exist_ok=True)
    for name, prompt in _prompts().items():
        if args.only and args.only != name:
            continue
        out = PUBLIC / name
        if out.exists() and not args.force:
            print(f"{name} already exists — pass --force to re-render")
            continue
        # Seeded on the filename, not the prompt: this is shipped art, and it
        # should come back the same picture if regenerated from the same brief.
        # The welcome hero fills a phone screen; everything else is a square
        # collectible on the garage's own camera.
        aspect = "3:4" if name == "onboard-hero.webp" else "1:1"
        img = await cyclr_studio._generate(prompt, f"w3:{name}", aspect=aspect)
        if not img:
            print(f"{name}: no image returned (check the logs — model or quota)")
            continue
        out.write_bytes(base64.b64decode(img.split(",", 1)[1]))
        print(f"→ {out.name}  ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
