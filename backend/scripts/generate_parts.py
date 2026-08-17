"""Render the W3 part catalogue ONCE into transparent, composable layers.

Parts must STACK onto a bike (frame + wheels + bars + saddle), so unlike the
bike ladder they cannot ship on a studio ground — they need alpha. Image models
do not return an alpha channel, so each part is rendered on a saturated chroma
background that appears nowhere on a bicycle, and the background is then keyed
out here into a real transparent WebP.

Chroma over "just ask for a white background": a frameset has chrome, white
paint and specular highlights, so keying white would eat the part. Pure magenta
cannot be confused with any bicycle surface.

    backend/.venv/bin/python backend/scripts/generate_parts.py             # missing only
    backend/.venv/bin/python backend/scripts/generate_parts.py --force
    backend/.venv/bin/python backend/scripts/generate_parts.py --only frame-chrome

Build-time only. The app must never call an image model to show a catalogue
part: the art is identical for every rider, and a cosmetic swap has to be free.
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
from app.services.cyclr_studio import GENERAL_STYLE, _seed  # noqa: E402

SRC = ROOT / "frontend/src/editorial/w3/w3parts.ts"
OUT = ROOT / "frontend/public/w3/parts"
MODEL = "gemini-3.1-flash-lite-image"

# The key colour. Pure magenta exists on no bicycle component, so nothing real
# is at risk of being keyed away.
CHROMA = (255, 0, 255)
CHROMA_PROMPT = (
    "CRITICAL BACKGROUND: place the object on a completely flat, uniform, pure magenta "
    "(#FF00FF) background — the exact same solid colour edge to edge, no gradient, no "
    "vignette, no shadow, no reflection, no floor, no surface, nothing else in the frame. "
    "The object must not be magenta anywhere."
)
TOLERANCE = 70  # per-channel distance from CHROMA still treated as background


def parse_parts() -> list[tuple[str, str, str]]:
    """(id, slot, prompt) from the TS source — one source of truth."""
    src = SRC.read_text()
    cams = dict(re.findall(r"(\w+):\s*\n?\s*'((?:[^'\\]|\\.)*)',", src.split("SLOT_CAMERA")[1].split("}")[0]))
    parts = re.findall(
        r"\{\s*id:\s*'([^']+)',\s*name:\s*'[^']*',\s*slot:\s*'([^']+)',[\s\S]*?prompt:\s*'((?:[^'\\]|\\.)*)'\s*\}",
        src.split("export const PARTS")[1],
    )
    if not parts:
        raise SystemExit("no parts parsed")
    return [(pid, cams.get(slot, ""), prompt) for pid, slot, prompt in parts]


def key_out(png: bytes):
    """Chroma → alpha. Returns an RGBA image cropped to the part's own bounds.

    Cropping matters: every part then carries its true extent, so the compositor
    can place it by anchor instead of guessing where inside a 1024px square the
    object actually sits.
    """
    from PIL import Image

    im = Image.open(io.BytesIO(png)).convert("RGBA")
    px = im.load()
    w, h = im.size
    cr, cg, cb = CHROMA
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            if abs(r - cr) < TOLERANCE and abs(g - cg) < TOLERANCE and abs(b - cb) < TOLERANCE:
                px[x, y] = (0, 0, 0, 0)
            elif r > 180 and b > 180 and g < 110:
                # Magenta fringe on antialiased edges — keep the pixel but pull
                # the spill out, otherwise every part gets a pink halo.
                px[x, y] = (r, g, b, 150)
    box = im.getbbox()
    return im.crop(box) if box else im


def render(client, part_id: str, camera: str, description: str) -> bytes | None:
    from google.genai import types

    prompt = (
        f"A single isolated bicycle component: {description}. "
        f"{camera} {CHROMA_PROMPT} {GENERAL_STYLE}"
    )
    resp = client.models.generate_content(
        model=MODEL,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(part_id),
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
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()

    if not settings.GEMINI_API_KEY:
        print("GEMINI_API_KEY missing", file=sys.stderr)
        return 1

    from google import genai

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    OUT.mkdir(parents=True, exist_ok=True)

    parts = parse_parts()
    if args.only:
        parts = [p for p in parts if p[0] == args.only]
    done = failed = skipped = 0

    for part_id, camera, description in parts:
        dest = OUT / f"{part_id}.webp"
        if dest.exists() and not args.force:
            skipped += 1
            continue
        try:
            raw = render(client, part_id, camera, description)
            if not raw:
                print(f"  {part_id}: no image", file=sys.stderr)
                failed += 1
                continue
            img = key_out(raw)
            img.save(dest, "WEBP", quality=88, method=6, lossless=False)
            print(f"  {part_id}: {img.size[0]}x{img.size[1]}  {dest.stat().st_size // 1024} KB")
            done += 1
        except Exception as e:  # noqa: BLE001
            print(f"  {part_id}: FAILED {type(e).__name__}: {str(e)[:120]}", file=sys.stderr)
            failed += 1

    print(f"\nrendered {done}, skipped {skipped}, failed {failed} → {OUT}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
