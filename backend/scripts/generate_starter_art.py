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
            f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.ISOLATED_BIKE_STYLE} "
            f"{cyclr_studio.NO_TEXT_AT_ALL}\n\n"
            "RENDER THE WHEELS CLEANLY: every spoke a single crisp line, both rims perfectly "
            "round, no doubled or ghosted wheel behind either one, no smeared or torn edges "
            "anywhere. Thin repeating structures are where this render fails, and a bicycle with "
            "two rear wheels is not a bicycle."
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
            # back exactly that: a soft, blurred, foggy room.
            #
            # THE SECOND VERSION WENT GREY. "Broad, even and soft-boxed" light
            # plus "the floor a touch lighter than the wall" came back as a
            # washed-out charcoal room with a bright milky floor band and a soft
            # blob in the middle of the wall — held next to the app it was the
            # brightest thing on Today, and the CSS gradient it replaced looked
            # better. The lesson: this plate is not a photograph of a studio, it
            # is the app's OWN GROUND, so it is specified in the app's own
            # values rather than in photographic language.
            #
            # `w3tokens.heroFloor` is that ground: #0B0B0C at the top through
            # #141416, #333336 and #47474B at the very bottom edge. Naming the
            # hex is the whole point — "a touch lighter" is an invitation to
            # drift and a number is not.
            "A perfectly clean, sharp, graphic studio set for a product photograph, rendered in "
            "perfect focus: one flat seamless wall meeting one flat floor at a clean horizontal "
            "line LOW in the frame — about four fifths of the way down, so the wall fills most of "
            "the picture and the floor is a shallow band along the bottom.\n\n"
            "There is NOTHING in the room — no objects, no props, no people, no text, no pattern.\n\n"
            "COLOUR — MATCH THESE VALUES EXACTLY. This image is nearly BLACK, not grey.\n"
            "· The top edge of the wall is #0B0B0C — essentially black.\n"
            "· The wall lifts almost imperceptibly toward the horizon, reaching about #141416.\n"
            "· Just below the horizon the floor is at its BRIGHTEST — about #2C2E34. This is the "
            "only light part of the picture and it is a narrow band, because it is where the "
            "subject stands.\n"
            "· From there the floor DARKENS again toward the viewer, falling back to about "
            "#0C0C0E along the very bottom edge of the frame.\n"
            "Cool blue-black throughout — never warm, never brown, never a mid grey. If any part "
            "of this picture reads as 'grey' rather than 'black', it is wrong.\n\n"
            "THE FLOOR IS BRIGHTEST UNDER THE SUBJECT AND DARKEST AT THE BOTTOM EDGE, and that "
            "order matters more than any other instruction here. A studio floor lit from above "
            "falls away toward the camera, which is what makes it read as a floor receding rather "
            "than a gradient pointing down. It is also what lets a shadow under the wheels be "
            "seen at all — a shadow needs light beside it.\n"
            "The previous version did the opposite and lifted all the way to the frame edge. That "
            "edge is where the app continues, so the picture handed the page a pale blue-grey "
            "(#32353F) to carry on in, three times lighter than the app around it: the screen "
            "ended up in three stacked tones with a bright band across the middle of it. The "
            "picture must END in the app's own black so the room and the page are one surface.\n\n"
            "LIGHT: one broad soft source from high and slightly front, falling off gently and "
            "evenly toward the left and right edges. NO bright band along the horizon, NO glowing "
            "pool on the floor, NO soft blob or halo anywhere on the wall — the wall is an even, "
            "quiet, near-black plane and the horizon is a clean edge rather than a light source.\n"
            "SURFACE: matte and perfectly smooth, with the faintest even sheen on the floor.\n\n"
            "CRITICAL: every part of this image is IN FOCUS and CRISP. No depth of field, no "
            "blur, no fog, no haze, no smoke, no atmospheric perspective, no heavy vignette, no "
            "spotlight, no visible grain, no text. Flat, clean, modern and DARK."
        ),
        # THE FIRST PICTURE IN THE APP, and it sets the expectation for every
        # screen after it — so it has to be the SAME PICTURE the app is made of.
        #
        # It was a cartoon character with googly eyes and an invented "W3" on
        # the jersey, formatfüllend and cropped at the chin, which is the exact
        # opposite of what Today shows: a photoreal bicycle standing in a dark
        # room, sharp, lit from above, one honest shadow. The rider is not the
        # hero of this app's art — the machine is, and the rider's own avatar
        # arrives later, made from their own photograph. Opening on a stranger's
        # cartoon face promised a different product than the one behind it.
        "onboard-hero.webp": (
            f"An isolated bicycle: {STARTER}.\n\n"
            f"{cyclr_studio.BIKE_CAMERA}\n\n"
            "THE BICYCLE IS SMALL AND LOW IN A TALL FRAME: it stands in the bottom third, with a "
            "great deal of empty room above it, because a headline and a button are drawn over the "
            "top half of this picture. Nothing important happens in the upper half — it is quiet "
            "wall, falling to near-black at the very top.\n\n"
            "BACKGROUND: the same studio the rest of this app is photographed in — one flat wall "
            "meeting one flat floor at a clean horizon low in the frame, deep charcoal, matte, "
            "everything in perfect focus. Along the horizon, the faintest cold edge of first light, "
            "and a single thin warm line of acid-lime dawn where the wall meets the floor. "
            "Restrained: one light source, no props, no road, no landscape, no people.\n"
            "PORTRAIT FRAME, taller than it is wide.\n\n"
            f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.NO_TEXT_AT_ALL}"
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
            f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.NO_TEXT_AT_ALL}"
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
