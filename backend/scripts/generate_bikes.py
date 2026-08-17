"""Render the W3 bike ladder ONCE into static art.

Every bike in `frontend/src/editorial/w3/w3bikes.ts` gets one WebP under
`frontend/public/w3/bikes/<id>.webp`, rendered through the SAME locked
drive-side camera the garage studio uses (`cyclr_studio.BIKE_CAMERA`) so the
whole ladder is comparable side by side and the layered scene composer can pin
a rider to the same anchors on any of them.

Run it from the repo root:

    backend/.venv/bin/python backend/scripts/generate_bikes.py            # missing only
    backend/.venv/bin/python backend/scripts/generate_bikes.py --force    # all

This is a BUILD-TIME tool, not a runtime path. The app must never call an image
model to show a catalogue bike: the art is identical for every rider, so paying
per rider (and making the garage depend on a live image model) would be waste.
The seed is derived from the bike id, so a re-run reproduces the same bike.
"""
from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.config import settings  # noqa: E402
from app.services.cyclr_studio import (  # noqa: E402
    BIKE_CAMERA,
    GENERAL_STYLE,
    ISOLATED_BIKE_STYLE,
    _seed,
)

LADDER = ROOT / "frontend/src/editorial/w3/w3bikes.ts"
OUT = ROOT / "frontend/public/w3/bikes"
MODEL = "gemini-3.1-flash-lite-image"  # Nano Banana 2 Lite; 1K only

# One shared ground for the whole ladder, so 25 bikes photographed on 25
# different surfaces don't read as 25 different products.
LADDER_GROUND = (
    "Set the bicycle on a clean, soft, neutral light-grey studio backdrop with a subtle "
    "contact shadow directly beneath the wheels. The background must be plain and identical "
    "for every bike — no props, no scenery, no text, no watermark."
)


def parse_ladder() -> list[tuple[str, str]]:
    """(id, prompt) straight out of the TS source — one source of truth."""
    src = LADDER.read_text()
    ids = re.findall(r"\{\s*id:\s*'([^']+)'", src)
    prompts = re.findall(r"prompt:\s*'((?:[^'\\]|\\.)*)'", src)
    if len(ids) != len(prompts):
        raise SystemExit(f"ladder parse mismatch: {len(ids)} ids vs {len(prompts)} prompts")
    return list(zip(ids, prompts))


def render(client, bike_id: str, description: str) -> bytes | None:
    from google.genai import types

    prompt = (
        f"An isolated 3D bicycle inspired by this description: [{description}]. "
        f"{BIKE_CAMERA} {LADDER_GROUND} {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(bike_id),  # deterministic per bike — re-runs reproduce it
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return data.data
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="re-render bikes that already exist")
    ap.add_argument("--only", help="render just this bike id")
    args = ap.parse_args()

    if not settings.GEMINI_API_KEY:
        print("GEMINI_API_KEY missing — nothing to do", file=sys.stderr)
        return 1

    from google import genai
    from PIL import Image

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    OUT.mkdir(parents=True, exist_ok=True)

    bikes = parse_ladder()
    if args.only:
        bikes = [b for b in bikes if b[0] == args.only]
    done = failed = skipped = 0

    for bike_id, description in bikes:
        dest = OUT / f"{bike_id}.webp"
        if dest.exists() and not args.force:
            skipped += 1
            continue
        try:
            raw = render(client, bike_id, description)
            if not raw:
                print(f"  {bike_id}: no image returned", file=sys.stderr)
                failed += 1
                continue
            # WebP, same reasoning as the garage renders: these ship to every
            # rider, and a 25-bike PNG catalogue would be ~13 MB of assets.
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            img.save(dest, "WEBP", quality=86, method=6)
            print(f"  {bike_id}: {dest.stat().st_size // 1024} KB")
            done += 1
        except Exception as e:  # noqa: BLE001 — one bad bike must not stop the ladder
            print(f"  {bike_id}: FAILED {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
            failed += 1

    print(f"\nrendered {done}, skipped {skipped}, failed {failed} → {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
