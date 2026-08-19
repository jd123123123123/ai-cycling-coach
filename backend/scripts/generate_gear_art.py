"""Render the equipment catalogue as shop art.

One square render per item, on a rarity-tinted ground, shot on ONE locked
camera so the whole grid reads as a set rather than 29 unrelated pictures —
the same argument `cyclr_studio.BIKE_CAMERA` makes for the bikes.

WHY THE GROUND IS TINTED BY RARITY. The reference shop grid puts product
renders on soft pastel grounds, and the colour is doing real work: it separates
one tile from the next at a glance and it encodes rarity without a text label.
A legendary item and a common one should be distinguishable across the room.

Generated ONCE and shipped static to `frontend/public/w3/gear/`, exactly as the
bikes and parts were. Per-rider renders would be absurd here: an item looks the
same for everybody.

    uv run python scripts/generate_gear_art.py            # everything missing
    uv run python scripts/generate_gear_art.py regel_neun # one item
    uv run python scripts/generate_gear_art.py --force    # re-render all

Existing files are skipped unless --force, so an interrupted run resumes and a
single bad render can be redone alone.
"""
from __future__ import annotations

import asyncio
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import cyclr_studio  # noqa: E402
from app.services import earn_modifiers as em  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parents[2] / "frontend/public/w3/gear"

#: Rarity → the ground it sits on. Soft, desaturated and light, so a dark
#: product reads against it — the reference's own choice, and the reason its
#: grid looks expensive rather than like a sticker sheet.
GROUND = {
    "common": "a soft, even, desaturated sage-green studio ground",
    "rare": "a soft, even, desaturated periwinkle-blue studio ground",
    "legendary": "a soft, even, warm desaturated amber studio ground",
}

#: The locked camera for every tile. Square, centred, generous padding — the
#: grid crops to a square and anything near the edge loses its head.
CAMERA = (
    "LOCKED CAMERA: a single object photographed dead centre of a square frame, at eye level, "
    "three-quarter view, filling about 70% of the frame with clean even padding on all four "
    "sides. Nothing is cropped and nothing touches an edge. Identical framing, scale and lens "
    "for every object in the set."
)

STYLE = (
    "Premium 3D product render in a designer-toy aesthetic: smooth matte materials, chunky "
    "premium proportions, soft even studio lighting with a gentle contact shadow directly "
    "beneath the object. Bold clean colour. High-quality octane render. A single object only — "
    "no hands, no people, no bicycle, no scenery, no text, no logos, no packaging."
)

#: What each item IS, physically. The catalogue's `flavour_de` is voice, not a
#: modelling instruction, so the objects are described here in English for the
#: model — the same split `ride_scene` makes between prompt text and UI copy.
SUBJECT: dict[str, str] = {
    "gravel_tyres": "a single chunky gravel bicycle tyre with aggressive knobbly tread and a tan sidewall, standing upright",
    "slicks": "a single sleek slick road bicycle tyre with no tread, glossy black, standing upright",
    "winter_tyres": "a single studded winter bicycle tyre with metal spikes in the tread, frost on the rubber, standing upright",
    "tubulars": "a pair of lightweight tubular racing tyres coiled and folded into a neat circle",
    "balloon_tyres": "a single very fat balloon bicycle tyre, cream-coloured, plump and soft-looking, standing upright",
    "climbing_wheels": "a single shallow lightweight bicycle wheel with thin spokes and a low-profile rim",
    "aero_wheels": "a single deep-section aerodynamic carbon bicycle wheel with a bladed rim",
    "disc_wheel": "a single solid disc bicycle wheel with no spokes, a smooth carbon face",
    "steel_rims": "a single vintage polished steel bicycle wheel with chrome spokes and a classic box-section rim",
    "deep_carbon": "a single very deep-section glossy carbon bicycle wheel, high profile, bladed spokes",
    "mudguards": "a pair of curved bicycle mudguards, matte black with a subtle metallic edge",
    "dynamo_light": "a small polished bicycle dynamo hub light with a round lens and a chrome body",
    "bikepacking_bags": "a set of three canvas bikepacking bags, olive green with straps and buckles",
    "second_cage": "a single bicycle bottle cage holding a water bottle",
    "frame_pump": "a slim classic bicycle frame pump, silver with a black head",
    "rack": "a tubular metal bicycle rear luggage rack",
    "power_meter": "a bicycle crank arm with a power meter pod attached, matte black",
    "aero_bars": "a pair of clip-on time trial aero bar extensions with arm pads",
    "climbing_bars": "a flared drop handlebar with bar tape, viewed at an angle",
    "bell": "a small polished brass bicycle bell with a domed top and a thumb lever",
    "bar_bag": "a small waxed-canvas handlebar bag with leather straps",
    "regel_neun": "a round weatherproof sticker with a bold number 9 on it, water beading on its surface",
    "lanterne_rouge": "a small vintage red bicycle lantern with a glass lens and a brass body, glowing faintly",
    "espresso_token": "a small brass espresso token coin with a coffee cup embossed on it",
    "banana": "a banana peel, draped as if hanging",
    "goat_charm": "a small brass mountain-goat charm on a short chain",
    "club_socks": "a pair of tall folded cycling socks with a bold stripe at the cuff",
    "rain_cape": "a tightly rolled packable rain jacket, bright and glossy",
    "night_owl": "a coiled reflective slap band, silver-grey, catching the light",
}


def prompt_for(item: em.Modifier) -> str:
    subject = SUBJECT.get(item.id)
    if subject is None:
        raise KeyError(f"no subject described for {item.id}")
    return (
        f"{subject}. BACKGROUND: {GROUND[item.rarity]}. {CAMERA} {STYLE}"
    )


async def render_one(item: em.Modifier, force: bool) -> str:
    path = OUT / f"{item.id}.webp"
    if path.exists() and not force:
        return "skip"
    img = await cyclr_studio._generate(prompt_for(item), f"gear:{item.id}")
    if not img:
        return "FAIL"
    path.write_bytes(base64.b64decode(img.split(",", 1)[1]))
    return f"{path.stat().st_size // 1024} KB"


async def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv

    if not cyclr_studio._gemini_ready():
        print("image model unavailable")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    items = [em.MODIFIERS[a] for a in args] if args else em.catalogue()

    failures = 0
    for item in items:
        result = await render_one(item, force)
        print(f"{item.id:20s} {item.rarity:10s} {result}")
        if result == "FAIL":
            failures += 1
    print(f"\n{len(items) - failures}/{len(items)} written to {OUT}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
