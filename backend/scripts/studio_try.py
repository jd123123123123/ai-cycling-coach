"""Try the studio on your own photos and your own GPX — end to end, no app.

Runs the REAL production services (`cyclr_studio`, `ride_place`, `ride_scene`,
`bike_build`), so what comes out here is what the app would store. Nothing is
mocked and nothing is a demo path.

    # your face -> the rider bust
    uv run python scripts/studio_try.py --rider ~/Desktop/me.jpg

    # your bike -> the isolated collectible
    uv run python scripts/studio_try.py --bike ~/Desktop/bike.jpg

    # both, then a scene from a real ride
    uv run python scripts/studio_try.py --rider me.jpg --bike bike.jpg --gpx ride.gpx

    # the bike wearing gear (needs --bike or a cached bike render)
    uv run python scripts/studio_try.py --bike bike.jpg --wear gravel_tyres mudguards

Everything lands in `--out` (default ./studio-out) and the vision descriptions
are written beside the images as .txt, because the description is the durable
part — it is what every later scene is composed from.

Descriptions are CACHED in the output folder, so a second run with the same
photo skips the vision pass and only re-renders. Delete the .txt to redo it.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.services import bike_build, cyclr_studio, ride_place, ride_scene  # noqa: E402


def _write(path: pathlib.Path, data_url: str) -> pathlib.Path:
    header, b64 = data_url.split(",", 1)
    ext = "webp" if "webp" in header else "png"
    out = path.with_suffix(f".{ext}")
    out.write_bytes(base64.b64decode(b64))
    print(f"  → {out}  ({out.stat().st_size // 1024} KB)")
    return out


def _as_data_url(path: pathlib.Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    if path.suffix.lower() == ".webp":
        mime = "image/webp"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


async def _describe(photo: pathlib.Path, kind: str, out: pathlib.Path) -> str | None:
    """Vision pass, cached to disk. The description is the durable artifact —
    every scene and every build is composed from it, long after the photo is
    gone — so it is written out and reused rather than re-derived per run."""
    cache = out / f"{kind}.txt"
    if cache.exists():
        print(f"[{kind}] description cached ({len(cache.read_text())} chars)")
        return cache.read_text()

    print(f"[{kind}] analysing {photo.name} …")
    desc = await cyclr_studio.analyze_asset(_as_data_url(photo), kind)
    if not desc:
        print(f"[{kind}] vision returned nothing")
        return None
    if kind == "bike":
        name, rest = cyclr_studio.split_name(desc)
        if name:
            print(f"[{kind}] named it: {name}")
        desc = rest or desc
    cache.write_text(desc)
    print(f"[{kind}] {len(desc)} chars → {cache}")
    return desc


def _first_fix(gpx: pathlib.Path) -> tuple[float, float] | None:
    """First lat/lon in the file. Deliberately a regex rather than an XML parse:
    every GPX dialect puts them on a trkpt attribute, and a full parse buys
    nothing for two numbers."""
    text = gpx.read_text(errors="ignore")
    lat = re.search(r'lat="(-?\d+\.?\d*)"', text)
    lon = re.search(r'lon="(-?\d+\.?\d*)"', text)
    return (float(lat.group(1)), float(lon.group(1))) if lat and lon else None


def _gpx_totals(gpx: pathlib.Path) -> tuple[float | None, float | None]:
    """Rough distance and climb, from the track's own elevation points.

    Distance is left None — deriving it properly needs haversine over every
    point, and `ride_scene` only uses it to pick a terrain bucket that the
    elevation range already dominates. Better a null than a bad number.
    """
    eles = [float(m) for m in re.findall(r"<ele>(-?\d+\.?\d*)</ele>", gpx.read_text(errors="ignore"))]
    if len(eles) < 2:
        return None, None
    climb = sum(max(0.0, b - a) for a, b in zip(eles, eles[1:]))
    return None, climb


async def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--rider", type=pathlib.Path, help="a photo of your face")
    p.add_argument("--bike", type=pathlib.Path, help="a photo of your bike")
    p.add_argument("--gpx", type=pathlib.Path, help="a .gpx file from a real ride")
    p.add_argument("--wear", nargs="*", default=[], help="gear item ids to fit to the bike")
    p.add_argument("--out", type=pathlib.Path, default=pathlib.Path("studio-out"))
    args = p.parse_args()

    if not any([args.rider, args.bike, args.gpx]):
        p.print_help()
        return 2

    if not cyclr_studio._gemini_ready():
        print("Image model unavailable — check IMAGE_PROVIDER / GEMINI_API_KEY in backend/.env")
        return 1

    out: pathlib.Path = args.out
    out.mkdir(parents=True, exist_ok=True)
    print(f"output → {out.resolve()}\n")

    rider_desc = bike_desc = None

    if args.rider:
        rider_desc = await _describe(args.rider, "rider", out)
        if rider_desc:
            img, _, status = await cyclr_studio.render_isolated(rider_desc, "rider")
            print(f"[rider] render: {status}")
            if img:
                _write(out / "rider", img)

    if args.bike:
        bike_desc = await _describe(args.bike, "bike", out)
        if bike_desc:
            img, _, status = await cyclr_studio.render_isolated(bike_desc, "bike")
            print(f"[bike] render: {status}")
            if img:
                base = _write(out / "bike", img)

                if args.wear:
                    unknown = [w for w in args.wear if w not in bike_build.VISUALS]
                    if unknown:
                        print(f"[build] no visual for: {', '.join(unknown)} (ignored)")
                    if bike_build.is_stock(args.wear):
                        print("[build] nothing worn changes the picture — skipped")
                    else:
                        print("[build] fitting:")
                        for c in bike_build.describe(args.wear):
                            print(f"    - {c}")
                        built = await cyclr_studio.edit_image(
                            _as_data_url(base), bike_build.edit_prompt(args.wear),
                            bike_build.build_key(1, "try", args.wear),
                        )
                        if built:
                            _write(out / ("build-" + "-".join(sorted(args.wear))), built)
                        else:
                            print("[build] no image returned")

    if args.gpx:
        if not (rider_desc and bike_desc):
            print("\n[scene] needs BOTH --rider and --bike (or their cached .txt) — skipped")
            return 0

        fix = _first_fix(args.gpx)
        if fix is None:
            print(f"\n[scene] no lat/lon found in {args.gpx.name}")
            return 1
        lat, lng = fix
        print(f"\n[scene] first fix {lat:.4f}, {lng:.4f}")

        place = await ride_place.resolve(lat, lng)
        print(f"[scene] place: {place or 'UNKNOWN — terrain only, no place invented'}")

        dist, climb = _gpx_totals(args.gpx)
        geo = ride_scene.RideGeo(
            distance_m=dist, elevation_gain_m=climb,
            start_lat=lat, start_lng=lng, place_name=place,
        )
        print(f"[scene] climb {climb:.0f} m → terrain '{ride_scene.terrain_key(geo)}'"
              if climb else "[scene] no elevation in file → neutral terrain")

        ctx = ride_scene.training_context("endurance", geo)
        img, _, status = await cyclr_studio.compose_scene(rider_desc, bike_desc, ctx)
        print(f"[scene] render: {status}")
        if img:
            _write(out / "scene", img)

    print("\ndone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
