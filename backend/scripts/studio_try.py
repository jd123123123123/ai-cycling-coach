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


def _gpx_totals(gpx: pathlib.Path) -> dict:
    """Distance, climb and altitude range from the track itself.

    Distance was originally left None on the reasoning that the elevation
    already dominates the terrain bucket. It does not: run on a real Maratona
    file, 6 053 m of ascent came back as terrain "flat", because the ratio
    `ride_scene` uses is metres-per-km and 0/0 falls through to the default.
    `terrain_key` is hardened against that now, but the honest fix is also to
    hand it the numbers it asks for — haversine over the track is twenty lines.
    """
    import math

    text = gpx.read_text(errors="ignore")
    pts = [
        (float(a), float(b))
        for a, b in re.findall(r'lat="(-?\d+\.?\d*)"\s+lon="(-?\d+\.?\d*)"', text)
    ]
    eles = [float(m) for m in re.findall(r"<ele>(-?\d+\.?\d*)</ele>", text)]

    dist_m = None
    if len(pts) >= 2:
        total = 0.0
        for (la1, lo1), (la2, lo2) in zip(pts, pts[1:]):
            p1, p2 = math.radians(la1), math.radians(la2)
            dp, dl = p2 - p1, math.radians(lo2 - lo1)
            a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            total += 6_371_000 * 2 * math.asin(min(1.0, math.sqrt(a)))
        dist_m = total

    climb = lo = hi = None
    if len(eles) >= 2:
        climb = sum(max(0.0, b - a) for a, b in zip(eles, eles[1:]))
        lo, hi = min(eles), max(eles)
    return {"distance_m": dist_m, "climb_m": climb, "min_alt": lo, "max_alt": hi}


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
            # FROM THE PHOTO, not from the description. A description is lossy
            # however dense, and the rider recognises their bike by exactly the
            # details it loses — decal placement, rim depth, the real brand.
            img, _, status = await cyclr_studio.render_bike_from_photo(
                _as_data_url(args.bike), bike_desc,
            )
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

        t = _gpx_totals(args.gpx)
        geo = ride_scene.RideGeo(
            distance_m=t["distance_m"], elevation_gain_m=t["climb_m"],
            min_altitude_m=t["min_alt"], max_altitude_m=t["max_alt"],
            start_lat=lat, start_lng=lng, place_name=place,
        )
        km = (t["distance_m"] or 0) / 1000
        print(f"[scene] {km:.0f} km, {t['climb_m'] or 0:.0f} m climb, "
              f"{t['min_alt'] or 0:.0f}–{t['max_alt'] or 0:.0f} m "
              f"→ terrain '{ride_scene.terrain_key(geo)}'")

        ctx = ride_scene.training_context("endurance", geo)
        img, _, status = await cyclr_studio.compose_scene(rider_desc, bike_desc, ctx)
        print(f"[scene] render: {status}")
        if img:
            _write(out / "scene", img)

    print("\ndone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
