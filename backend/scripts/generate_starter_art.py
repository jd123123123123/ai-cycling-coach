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

OUT = pathlib.Path(__file__).resolve().parents[2] / "frontend/public/w3/starter-bike.webp"

#: The starter machine, described rather than photographed. Deliberately a plain,
#: honest bike: `w3bikes` calls the starter a Rostlaube, and a first bike a rider
#: wants to replace is a better hook than a superbike they cannot improve on.
STARTER = (
    "a simple, honest steel road bicycle — a slim round-tube frame in matte charcoal with no "
    "decals, drop handlebars wrapped in plain black tape, a black saddle, silver rims with black "
    "tyres, and a visible chain and rear cassette. Well used and well kept: this is a starter "
    "bike, not a superbike"
)


async def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="re-render even if the file exists")
    args = ap.parse_args()

    if OUT.exists() and not args.force:
        print(f"{OUT.name} already exists — pass --force to re-render")
        return 0

    if not cyclr_studio._gemini_ready():
        print("Image model unavailable — check IMAGE_PROVIDER / GEMINI_API_KEY in backend/.env")
        return 1

    stage = backdrops.CATALOGUE[backdrops.DEFAULT_ID]
    prompt = (
        f"An isolated bicycle: {STARTER}.\n\n"
        f"{cyclr_studio.BIKE_CAMERA}\n\n"
        f"BACKGROUND: {stage.prose}.\n\n"
        f"{cyclr_studio.GENERAL_STYLE} {cyclr_studio.ISOLATED_BIKE_STYLE}"
    )
    # Seeded on a constant, not on the prompt: this is shipped art, and it should
    # come back the same picture if it is ever regenerated from the same brief.
    img = await cyclr_studio._generate(prompt, "w3:starter-bike")
    if not img:
        print("no image returned (see the logs — the model may be unavailable or out of quota)")
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(base64.b64decode(img.split(",", 1)[1]))
    print(f"→ {OUT}  ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
