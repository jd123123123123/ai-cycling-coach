"""Nearest bike workshop / self-service repair station, from OpenStreetMap.

Why Overpass and not Google Places: Places' 2026 Essentials tier starts at
$275/month and gates phone + opening hours behind the pricier SKUs, while OSM
carries exactly the tags a cyclist needs — ``service:bicycle:repair``,
``service:bicycle:pump``, ``service:bicycle:diy``, ``second_hand``, and the
``amenity=bicycle_repair_station`` public tool stands that no commercial POI
database models at all. Free, no key, ODbL (attribution required — the UI
credits OpenStreetMap).

Defensive by the same contract as ``weather_client``: every failure path
returns an empty list, so the surface says "keine Werkstatt gefunden" rather
than throwing. Overpass is a donated community resource — we cache on a ~1 km
grid for six hours and rotate across mirrors instead of hammering one.
"""
from __future__ import annotations

import asyncio
import logging
import math
import re
import time
from collections.abc import Iterable
from datetime import datetime
from typing import Any

import httpx

logger = logging.getLogger(__name__)

# Tried in order; each is an independent Overpass instance with its own rate
# limiting. The reference instance goes first because it is the one that is
# actually up: probed 2026-08-20, both community mirrors answered 500/502 to
# even a trivial single-node query, so putting them first only bought two dead
# round-trips per cold fetch. They stay as fallbacks for the day de.rate-limits.
_ENDPOINTS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
)
_TIMEOUT = 25.0
_USER_AGENT = "ai-cycling-coach/1.0 (bike workshop finder; contact: support@aicyclingcoach.app)"

# One Overpass call per ~1 km grid cell per six hours, app-wide. OSM POI data
# moves on a scale of weeks; the athlete moving 300 m must not trigger a fetch.
_CACHE_TTL_S = 6 * 3600.0
_GRID_DP = 2  # ~1.1 km latitude grid
_CACHE_PAD_M = 1500  # query wider than asked so a rounded centre still covers it
_cache: dict[tuple[float, float, int], tuple[float, list[dict[str, Any]]]] = {}
_locks: dict[tuple[float, float, int], asyncio.Lock] = {}

MAX_RADIUS_M = 50_000

_COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
_DAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")


# ── geometry ──────────────────────────────────────────────────────────────


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in metres."""
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def compass(lat1: float, lng1: float, lat2: float, lng2: float) -> str:
    """Eight-point compass label for the direction from origin to target."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lng2 - lng1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    deg = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return _COMPASS[int((deg + 22.5) // 45) % 8]


# ── opening hours ─────────────────────────────────────────────────────────

_TIME_RANGE = re.compile(r"^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$")
_DAY_RANGE = re.compile(r"^([A-Za-z]{2})\s*-\s*([A-Za-z]{2})$")


def _day_index(token: str) -> int | None:
    token = token.strip().title()[:2]
    return _DAYS.index(token) if token in _DAYS else None


def _expand_days(spec: str) -> set[int] | None:
    """"Mo-Fr,Su" → {0,1,2,3,4,6}. None when the spec isn't a plain weekday
    list (month ranges, "PH", week numbers — anything we won't guess at)."""
    days: set[int] = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = _DAY_RANGE.match(part)
        if m:
            a, b = _day_index(m.group(1)), _day_index(m.group(2))
            if a is None or b is None:
                return None
            i = a
            while True:  # wraps across Sunday, as OSM allows ("Sa-Mo")
                days.add(i)
                if i == b:
                    break
                i = (i + 1) % 7
            continue
        d = _day_index(part)
        if d is None:
            return None
        days.add(d)
    return days or None


def parse_opening_hours(value: str | None, now: datetime) -> tuple[bool | None, str | None]:
    """Evaluate a pragmatic subset of the OSM opening_hours grammar.

    Returns ``(open_now, todays_hours)``. ``open_now`` is None whenever the
    value uses syntax outside the subset (month ranges, sunset offsets, "PH",
    week selectors) — an honest "unknown" beats a confident wrong "closed" that
    sends a rider with a flat tyre to a shut door. ``todays_hours`` is the
    "09:00-13:00, 14:00-18:00" string for the current weekday when known.
    """
    if not value:
        return None, None
    text = value.strip()
    if text in {"24/7", "24/7 open", "Mo-Su 00:00-24:00"}:
        return True, "24/7"

    today = now.weekday()
    minutes_now = now.hour * 60 + now.minute
    todays: list[str] = []
    matched = False  # a rule addressed today (an "off" rule counts)
    open_now = False

    for rule in text.split(";"):
        rule = rule.strip()
        if not rule:
            continue
        # "Mo-Fr 09:00-18:00" / "Su off" / "09:00-18:00" (every day)
        head, _, tail = rule.partition(" ")
        if _TIME_RANGE.match(head) or head.lower() in {"off", "closed"}:
            day_spec, time_spec = None, rule
        else:
            day_spec, time_spec = head, tail.strip()
        if not time_spec:
            return None, None

        if day_spec is None:
            days = set(range(7))
        else:
            days = _expand_days(day_spec) or set()
            if not days:
                return None, None  # unsupported selector — bail out honestly

        if today not in days:
            continue
        matched = True
        if time_spec.lower() in {"off", "closed"}:
            todays = []
            open_now = False
            continue

        spans: list[str] = []
        for span in time_spec.split(","):
            m = _TIME_RANGE.match(span.strip())
            if not m:
                return None, None
            h1, m1, h2, m2 = (int(g) for g in m.groups())
            start, end = h1 * 60 + m1, h2 * 60 + m2
            if end <= start:  # crosses midnight
                end += 24 * 60
            spans.append(f"{h1:02d}:{m1:02d}-{h2:02d}:{m2:02d}")
            if start <= minutes_now < end:
                open_now = True
        todays.extend(spans)

    if not matched:
        # Nothing addressed today and the whole value parsed → closed today.
        return False, None
    return open_now, ", ".join(todays) or None


# ── Overpass ──────────────────────────────────────────────────────────────


def build_query(lat: float, lng: float, radius_m: int) -> str:
    """Overpass QL for everything a stranded rider could use.

    Three buckets, deliberately: bike shops (``shop=bicycle``), non-shop places
    that still fix bikes (a hardware store, a station kiosk, a campsite tagged
    ``service:bicycle:repair``), and the unattended public tool stands
    (``amenity=bicycle_repair_station``) that are typically open 24/7 and are
    the only thing that helps at 21:00 on a Sunday.
    """
    around = f"(around:{radius_m},{lat:.5f},{lng:.5f})"
    return (
        "[out:json][timeout:25];("
        f'nwr["shop"="bicycle"]{around};'
        f'nwr["service:bicycle:repair"]["service:bicycle:repair"!="no"]{around};'
        f'nwr["amenity"="bicycle_repair_station"]{around};'
        ");out center tags 250;"
    )


async def _fetch(query: str, client: httpx.AsyncClient | None = None) -> list[dict[str, Any]] | None:
    """Elements from the first mirror that answers, or None when every mirror
    failed. None and [] are NOT the same thing: [] is a real answer ("nothing
    mapped out here"), and only a real answer is worth caching."""
    owns = client is None
    client = client or httpx.AsyncClient(timeout=_TIMEOUT, headers={"User-Agent": _USER_AGENT})
    try:
        for url in _ENDPOINTS:
            try:
                resp = await client.post(url, content=query.encode("utf-8"))
                resp.raise_for_status()
                body = resp.json()
            except Exception as exc:  # network, 429, 504, malformed JSON
                logger.info("overpass mirror failed (%s): %s", url, exc)
                continue
            elements = body.get("elements") if isinstance(body, dict) else None
            if isinstance(elements, list):
                return elements
        return None
    finally:
        if owns:
            await client.aclose()


# ── normalisation ─────────────────────────────────────────────────────────


def _truthy(v: str | None) -> bool:
    return v is not None and v.strip().lower() in {"yes", "only", "diy", "customers", "limited"}


def _address(tags: dict[str, str]) -> str | None:
    street = tags.get("addr:street")
    house = tags.get("addr:housenumber")
    city = tags.get("addr:city")
    line = " ".join(p for p in (street, house) if p) or None
    if line and city:
        return f"{line}, {city}"
    return line or city


def _kind(tags: dict[str, str]) -> str:
    if tags.get("amenity") == "bicycle_repair_station":
        return "station"
    if tags.get("shop") == "bicycle":
        return "shop"
    return "service"


def normalize_element(
    el: dict[str, Any], origin: tuple[float, float], now: datetime
) -> dict[str, Any] | None:
    """One Overpass element → the shape the app renders, or None if unusable."""
    tags = el.get("tags") or {}
    if not isinstance(tags, dict):
        return None
    lat = el.get("lat")
    lng = el.get("lon")
    if lat is None or lng is None:  # ways/relations carry a computed centre
        center = el.get("center") or {}
        lat, lng = center.get("lat"), center.get("lon")
    if lat is None or lng is None:
        return None
    lat, lng = float(lat), float(lng)

    kind = _kind(tags)
    hours = tags.get("opening_hours")
    open_now, todays = parse_opening_hours(hours, now)
    if kind == "station" and hours is None:
        # Unattended tool stands are 24/7 unless mapped otherwise — but only
        # claim it when the mapper said so via access/opening_hours.
        open_now, todays = (True, "24/7") if tags.get("access") in (None, "yes", "public") else (None, None)

    repair_tag = tags.get("service:bicycle:repair")
    return {
        "osm_type": el.get("type"),
        "osm_id": el.get("id"),
        "kind": kind,
        "name": tags.get("name") or tags.get("operator") or tags.get("brand"),
        "lat": lat,
        "lng": lng,
        "distance_m": round(haversine_m(origin[0], origin[1], lat, lng)),
        "direction": compass(origin[0], origin[1], lat, lng),
        "address": _address(tags),
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "opening_hours": hours,
        "todays_hours": todays,
        "open_now": open_now,
        "brands": tags.get("brand"),
        "services": {
            "repair": _truthy(repair_tag) or kind == "station",
            "repair_only": (repair_tag or "").strip().lower() == "only",
            "retail": _truthy(tags.get("service:bicycle:retail")) or (kind == "shop" and "service:bicycle:retail" not in tags),
            "rental": _truthy(tags.get("service:bicycle:rental")),
            "second_hand": _truthy(tags.get("service:bicycle:second_hand")),
            "diy": _truthy(tags.get("service:bicycle:diy")) or kind == "station",
            "pump": _truthy(tags.get("service:bicycle:pump")) or _truthy(tags.get("compressed_air")),
            "chain_tool": _truthy(tags.get("service:bicycle:chain_tool")),
            "cleaning": _truthy(tags.get("service:bicycle:cleaning")),
            "charging": _truthy(tags.get("service:bicycle:charging")),
        },
    }


def normalize(
    elements: Iterable[dict[str, Any]],
    origin: tuple[float, float],
    radius_m: int,
    now: datetime,
) -> list[dict[str, Any]]:
    """Normalise, drop anything beyond the true radius, dedupe, sort by distance.

    Dedupe matters: a shop mapped as both a node and a building way shows up
    twice in the raw response, and two identically named pins 12 m apart read
    as a data bug to the rider.
    """
    out: list[dict[str, Any]] = []
    for el in elements:
        row = normalize_element(el, origin, now)
        if row is None or row["distance_m"] > radius_m:
            continue
        out.append(row)
    out.sort(key=lambda r: r["distance_m"])

    deduped: list[dict[str, Any]] = []
    for row in out:
        twin = next(
            (
                d
                for d in deduped
                if d["kind"] == row["kind"]
                and abs(d["distance_m"] - row["distance_m"]) < 60
                and (d["name"] or "").lower() == (row["name"] or "").lower()
            ),
            None,
        )
        if twin is None:
            deduped.append(row)
            continue
        # Keep the richer record — the way usually carries the address tags.
        for key in ("phone", "website", "address", "opening_hours", "brands"):
            if not twin.get(key) and row.get(key):
                twin[key] = row[key]
    return deduped


# ── public entry point ────────────────────────────────────────────────────


async def find_workshops(
    lat: float,
    lng: float,
    radius_m: int = 15_000,
    *,
    now: datetime | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Bike shops, bike-fixing places and public repair stations near a point,
    nearest first. Empty list on any failure — never raises."""
    radius_m = max(500, min(int(radius_m), MAX_RADIUS_M))
    now = now or datetime.now()
    key = (round(lat, _GRID_DP), round(lng, _GRID_DP), radius_m)

    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:  # concurrent callers on one cell share a single fetch
        hit = _cache.get(key)
        if hit and (time.monotonic() - hit[0]) < _CACHE_TTL_S:
            elements = hit[1]
        else:
            query = build_query(key[0], key[1], radius_m + _CACHE_PAD_M)
            fetched = await _fetch(query, client)
            if fetched is not None:
                _cache[key] = (time.monotonic(), fetched)
                elements = fetched
            else:
                # Every mirror is down. Stale data beats an empty page; an
                # outage must not be cached as "your area has no shops".
                elements = hit[1] if hit else []

    # Distances are always measured from the caller's TRUE position, never the
    # rounded cache centre — the grid is a fetch optimisation, not the answer.
    return normalize(elements, (lat, lng), radius_m, now)
