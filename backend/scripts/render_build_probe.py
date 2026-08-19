"""Render the rider's bike wearing a loadout, so the edit can be LOOKED at.

    uv run python scripts/render_build_probe.py <base.webp> <outdir> item [item...]

The base image is the rider's own stored bike render. Always the ORIGINAL —
`docs/w3-bike-customisation.md` measured stacking drifting, so a build is never
composed from an already-edited picture.
"""
from __future__ import annotations

import asyncio
import base64
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import bike_build, cyclr_studio  # noqa: E402


async def main() -> int:
    base_path = pathlib.Path(sys.argv[1])
    outdir = pathlib.Path(sys.argv[2])
    equipped = sys.argv[3:]
    outdir.mkdir(parents=True, exist_ok=True)

    if bike_build.is_stock(equipped):
        print("stock build — nothing changes the picture, no call made")
        return 0

    b64 = "data:image/webp;base64," + base64.b64encode(base_path.read_bytes()).decode()
    prompt = bike_build.edit_prompt(equipped)
    print("changes:")
    for c in bike_build.describe(equipped):
        print("  -", c)

    img = await cyclr_studio.edit_image(b64, prompt, bike_build.build_key(1, "probe", equipped))
    if not img:
        print("no image returned")
        return 1
    name = "build-" + "-".join(sorted(i for i in equipped if i in bike_build.VISUALS))
    path = outdir / f"{name}.webp"
    path.write_bytes(base64.b64decode(img.split(",", 1)[1]))
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
