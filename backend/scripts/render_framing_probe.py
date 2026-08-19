"""Render one framing against a bike description and write a PNG to disk.

A prompt-composition test can only prove the words are assembled correctly. It
cannot tell you whether the picture looks like the reference, and that is the
only question `ride_framing` actually exists to answer. This script closes that
loop: generate, look, revise the framing, generate again.

    uv run python scripts/render_framing_probe.py garden [outdir]

Writes `<outdir>/framing-<id>.png`. Requires IMAGE_PROVIDER=gemini and a
GEMINI_API_KEY; without them it prints the prompt and exits non-zero rather than
pretending, matching `cyclr_studio`'s own honest gating.
"""
from __future__ import annotations

import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import cyclr_studio, ride_framing  # noqa: E402

# The reference frame's own bike, described the way the vision pass describes a
# rider's: brand-free, literal, component by component. Using the reference's
# bike is deliberate — it isolates the FRAMING as the only variable when
# comparing the output against the reference photograph.
REFERENCE_BIKE = (
    "A single-speed city bicycle with a polished brushed-brass diamond frame — semi-gloss, "
    "warm golden metal with visible fine brushing, not chrome and not matte. Deep green matte "
    "tyres with tan gum sidewalls on black deep-section rims. Matte black leather saddle, matte "
    "black flat-top handlebar, brass chain and brass crankset. A weathered natural-wood crate on "
    "a rear rack and a small wire basket on the front rack."
)


def main() -> int:
    framing_id = sys.argv[1] if len(sys.argv) > 1 else "garden"
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else ".")
    outdir.mkdir(parents=True, exist_ok=True)

    prompt = ride_framing.scene_prompt(REFERENCE_BIKE, framing_id)
    print(f"framing = {framing_id}  ({len(prompt)} chars)")

    if not cyclr_studio._gemini_ready():
        print("image model unavailable — prompt only:\n")
        print(prompt)
        return 1

    import asyncio

    data_url = asyncio.run(cyclr_studio._generate(prompt, f"framing:{framing_id}"))
    if not data_url:
        print("the model returned no image")
        return 1

    # `_generate` hands back a WebP data URL; write the raw bytes under whatever
    # extension the payload actually declares rather than assuming PNG.
    header, b64 = data_url.split(",", 1)
    ext = "webp" if "webp" in header else "png"
    path = outdir / f"framing-{framing_id}.{ext}"
    path.write_bytes(base64.b64decode(b64))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
