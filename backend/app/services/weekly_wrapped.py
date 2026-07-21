"""Weekly Wrapped — the Spotify-Wrapped-style weekly highlights story.

A once-a-week, high-dopamine recap of the LAST COMPLETED week (Mon–Sun),
rendered by the client as seven full-screen WebGL "story" cards. This service
produces the real aggregates behind those cards; it reuses
``build_weekly_recap`` for the shared week aggregation (totals, plan-vs-actual,
breakthroughs, best ride, streak) and adds the wrapped-specific pieces:

- a 7-day effort bar series (per athlete-local day),
- a "ride of the week" score (percentile of the standout ride's TSS within the
  athlete's own last-90-day history — self-referential, never a leaderboard),
- peak power + a playful comparison scale (only when true peak power exists),
- climbing metres for the elevation card.

The honesty contract (repo-wide) holds: any metric the data can't back is
returned as ``None`` and the client SKIPS that card rather than faking a number
(no power meter → no Peak Power card; no elevation streams → no Elevation card).
"""
from __future__ import annotations

import json
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.services.athlete_time import (
    local_date_of,
    set_athlete_tz_from_profile,
    today_local,
)
from app.services.weekly_recap import _dt, _week_bounds, build_weekly_recap

logger = logging.getLogger(__name__)

# A fixed, self-contained "what could your watts run" scale (household draw in
# watts). Purely illustrative flavour for the Peak Power card — never presented
# as measured data. Ordered high→low so the athlete's bar leads the chart.
POWER_APPLIANCES: list[tuple[str, str, int]] = [
    ("microwave", "Mikrowelle", 1200),
    ("toaster", "Toaster", 900),
    ("gaming_pc", "Gaming-PC", 500),
    ("phone_charger", "Handy-Ladegerät", 20),
]

WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _peak_power_of(a: Activity) -> float | None:
    """Best available *peak* power for one ride, in watts.

    True peak (max 1s/5s) needs stream data we may not have. We look, in order,
    at explicit peak fields on the raw payload, and refuse to substitute
    normalized/average power (that would mislabel a sustained number as a
    sprint peak). ``None`` when no honest peak exists.
    """
    raw = a.raw_data or {}
    for key in ("peak_power", "peak_power_w", "max_power", "maxPower", "max_watts"):
        val = raw.get(key) if isinstance(raw, dict) else None
        if isinstance(val, (int, float)) and val > 0:
            return float(val)
    return None


def daily_effort(week: list[Activity], start: date) -> list[dict[str, Any]]:
    """Seven Mon–Sun buckets of the week's real effort.

    Each bucket carries the day's summed TSS, distance and session count, keyed
    by athlete-local day. The heaviest day (max TSS, >0) is flagged ``peak`` so
    the client can spotlight it. Empty days stay in the series with zeros — the
    shape of the week is part of the story.
    """
    buckets: list[dict[str, Any]] = [
        {
            "key": WEEKDAY_KEYS[i],
            "date": (start + timedelta(days=i)).isoformat(),
            "tss": 0.0,
            "km": 0.0,
            "sessions": 0,
            "peak": False,
        }
        for i in range(7)
    ]
    for a in week:
        d = local_date_of(a.started_at) if a.started_at else None
        if d is None:
            continue
        idx = (d - start).days
        if 0 <= idx < 7:
            b = buckets[idx]
            b["tss"] += float(a.tss or 0)
            b["km"] += float(a.distance_meters or 0) / 1000
            b["sessions"] += 1
    for b in buckets:
        b["tss"] = round(b["tss"])
        b["km"] = round(b["km"], 1)
    peak_tss = max((b["tss"] for b in buckets), default=0)
    if peak_tss > 0:
        for b in buckets:
            if b["tss"] == peak_tss:
                b["peak"] = True
                break
    return buckets


def ride_score(best_tss: float | None, history_tss: list[float]) -> int | None:
    """Self-referential 0–100 score for the standout ride.

    The percentile rank of the ride's TSS within the athlete's own recent
    history (higher = a bigger day than most of their rides). Needs a minimum
    history to be honest; ``None`` below that or with no ride.
    """
    if best_tss is None or best_tss <= 0:
        return None
    others = [t for t in history_tss if t > 0]
    if len(others) < 5:
        return None
    at_or_below = sum(1 for t in others if t <= best_tss)
    pct = 100.0 * at_or_below / len(others)
    # Compress to a satisfying 60–100 band: even a modest standout ride reads as
    # an achievement, and the top ride tops out near (not at) 100.
    return max(1, min(99, round(40 + 0.59 * pct)))


def power_comparison(watts: float, de: bool) -> list[dict[str, Any]]:
    """The athlete's watts leading the fixed household-appliance scale."""
    label = "Du" if de else "You"
    rows = [{"key": "you", "label": label, "watts": round(watts), "you": True}]
    for key, de_label, w in POWER_APPLIANCES:
        rows.append(
            {
                "key": key,
                "label": de_label if de else key.replace("_", " ").title(),
                "watts": w,
                "you": False,
            }
        )
    return rows


def _fmt_hm(hours: float) -> str:
    total_min = round(hours * 60)
    return f"{total_min // 60}h {total_min % 60:02d}m"


# ── Animated route projection ────────────────────────────────────────────────
#
# The most notable GPS ride of the week, projected from raw lat/lng into the
# card's SVG viewbox. Pure + aspect-correct (never stretched), downsampled to a
# bounded point count so the payload stays small and the client's stroke-draw
# animation stays smooth. Mirrors RouteMap.tsx's projection maths.

ROUTE_VIEW_W = 342
ROUTE_VIEW_H = 300
ROUTE_PAD = 26
ROUTE_MAX_POINTS = 260


def project_route(
    lats: list[Any],
    lngs: list[Any],
    view_w: int = ROUTE_VIEW_W,
    view_h: int = ROUTE_VIEW_H,
    pad: int = ROUTE_PAD,
    max_points: int = ROUTE_MAX_POINTS,
) -> dict[str, Any] | None:
    """Project a lat/lng track into ``[x, y]`` points inside a ``view_w×view_h``
    box, keeping the geographic aspect ratio (no stretch) and centering the
    shape. Non-finite/misaligned samples are dropped pairwise; the track is
    stride-downsampled to ``max_points`` (the last point is always kept so the
    finish marker lands on the real end). Returns ``None`` when fewer than two
    usable points exist — the client then SKIPS the route card (honesty: no
    fabricated route)."""
    pts_ll: list[tuple[float, float]] = []
    n = min(len(lats), len(lngs))
    for i in range(n):
        la, ln = lats[i], lngs[i]
        if isinstance(la, (int, float)) and isinstance(ln, (int, float)):
            fla, fln = float(la), float(ln)
            if fla == fla and fln == fln and abs(fla) <= 90 and abs(fln) <= 180:
                # Drop null-island (0,0) noise samples.
                if fla != 0.0 or fln != 0.0:
                    pts_ll.append((fla, fln))
    if len(pts_ll) < 2:
        return None

    lats_f = [p[0] for p in pts_ll]
    lngs_f = [p[1] for p in pts_ll]
    min_lat, max_lat = min(lats_f), max(lats_f)
    min_lng, max_lng = min(lngs_f), max(lngs_f)
    lat_span = (max_lat - min_lat) or 1e-6
    lng_span = (max_lng - min_lng) or 1e-6
    scale = min((view_w - pad * 2) / lng_span, (view_h - pad * 2) / lat_span)
    off_x = (view_w - lng_span * scale) / 2
    off_y = (view_h - lat_span * scale) / 2

    projected = [
        [
            round(off_x + (ln - min_lng) * scale, 1),
            round(off_y + (max_lat - la) * scale, 1),
        ]
        for la, ln in pts_ll
    ]

    # Stride-downsample, always keeping first + last.
    if len(projected) > max_points:
        step = len(projected) / max_points
        sampled = [projected[int(i * step)] for i in range(max_points)]
        if sampled[-1] != projected[-1]:
            sampled[-1] = projected[-1]
        projected = sampled

    return {
        "points": projected,
        "view": {"w": view_w, "h": view_h},
        "n_points": len(projected),
    }


async def _notable_route(
    db: AsyncSession, user_id: int, week: list[Activity]
) -> dict[str, Any] | None:
    """The week's most notable GPS ride, as a projected route. "Notable" = a
    cycling ride first, then the richest raw track (most GPS samples). Ranking
    uses the RAW sample count (not the downsampled count, which caps at
    ``ROUTE_MAX_POINTS`` and would tie every long ride). Returns ``None`` when no
    ride that week carries a usable lat/lng track."""
    ids = [a.id for a in week]
    if not ids:
        return None
    by_id = {a.id: a for a in week}
    rows = await db.execute(
        select(ActivityStream.activity_id, ActivityStream.streams).where(
            ActivityStream.user_id == user_id,
            ActivityStream.activity_id.in_(ids),
        )
    )
    best: dict[str, Any] | None = None
    best_rank: tuple[int, int] = (-1, -1)
    for activity_id, streams in rows.all():
        if not isinstance(streams, dict):
            continue
        lats = streams.get("latitude")
        lngs = streams.get("longitude")
        if not isinstance(lats, list) or not isinstance(lngs, list):
            continue
        act = by_id.get(activity_id)
        is_cycling = 1 if getattr(act, "sport", None) == "cycling" else 0
        raw_n = min(len(lats), len(lngs))
        rank = (is_cycling, raw_n)
        if rank <= best_rank:
            continue
        route = project_route(lats, lngs)
        if route is None:
            continue
        route["activity_id"] = activity_id
        route["title"] = getattr(act, "title", None)
        route["km"] = round((getattr(act, "distance_meters", 0) or 0) / 1000, 1)
        best, best_rank = route, rank
    return best


# ── AI flavour: distance→cities + saddle-time→witty one-liner ─────────────────
#
# Two short, warm German strings generated together in ONE Sonnet call, seeded
# with the ISO week + the week's real numbers so each week reads differently.
# Falls back to deterministic, still-nice copy when the API key is unset or the
# call fails — the screens ALWAYS render. Cached per (user, ISO week, locale) so
# a week is generated at most once per process.

# Curated, roughly-correct real city-pair road distances (km) spanning the range
# a week of riding covers. The fallback picks the closest pair to the athlete's
# total — factually plausible without an LLM.
CITY_PAIRS: list[tuple[str, str, int]] = [
    ("Berlin", "Potsdam", 35),
    ("Köln", "Düsseldorf", 47),
    ("München", "Augsburg", 68),
    ("Hamburg", "Bremen", 120),
    ("Frankfurt", "Stuttgart", 205),
    ("Berlin", "Hamburg", 290),
    ("München", "Nürnberg", 170),
    ("Köln", "Frankfurt", 190),
    ("Berlin", "Dresden", 200),
    ("Stuttgart", "München", 235),
    ("Hamburg", "Berlin", 290),
    ("Frankfurt", "München", 400),
    ("Berlin", "Köln", 575),
    ("München", "Berlin", 585),
    ("Hamburg", "München", 775),
]

# Deterministic witty-and-kind saddle-time lines. Each takes the hours and
# returns one warm German sentence; the week's ISO number selects one so the
# copy rotates. English mirror below.
_SADDLE_LINES_DE = [
    lambda h: f"{h:.1f} Stunden im Sattel — so lange, dass dein Sitzpolster jetzt Familienmitglied ist.",
    lambda h: (lambda n: f"{h:.1f} Stunden auf dem Rad — genug für {n} volle{'n' if n == 1 else ''} Spielfilm{'' if n == 1 else 'e'}, nur mit besserer Aussicht.")(max(1, round(h * 60 / 210))),
    lambda h: f"{h:.1f} Stunden getreten — deine Beine haben mehr gearbeitet als so mancher Montag im Büro.",
    lambda h: f"{h:.1f} Stunden Sattelzeit — das sind rund {round(h * 60)} Minuten reines Ich-Zeit-mit-Rückenwind.",
    lambda h: f"{h:.1f} Stunden im Sattel — lang genug, um jeden Podcast-Stau abzubauen. Chapeau.",
    lambda h: f"{h:.1f} Stunden gefahren — deine Wasserflasche hat diese Woche echte Überstunden gemacht.",
    lambda h: f"{h:.1f} Stunden auf zwei Rädern — dein Sofa hat dich vermisst, dein Herz dankt dir trotzdem.",
]
_SADDLE_LINES_EN = [
    lambda h: f"{h:.1f} hours in the saddle — long enough that your chamois is basically family now.",
    lambda h: (lambda n: f"{h:.1f} hours riding — enough for {n} feature film{'' if n == 1 else 's'}, just with a better view.")(max(1, round(h * 60 / 210))),
    lambda h: f"{h:.1f} hours turning the pedals — your legs did more than most Monday mornings.",
    lambda h: f"{h:.1f} hours of saddle time — about {round(h * 60)} minutes of pure me-time-with-a-tailwind.",
    lambda h: f"{h:.1f} hours in the saddle — long enough to clear the whole podcast backlog. Chapeau.",
    lambda h: f"{h:.1f} hours ridden — your bottle pulled some serious overtime this week.",
    lambda h: f"{h:.1f} hours on two wheels — your sofa missed you, your heart thanks you anyway.",
]


def fallback_city_comparison(distance_km: float, de: bool) -> str:
    """Deterministic distance→landmark line: the real city pair whose road
    distance is closest to the week's total."""
    km = round(distance_km)
    if km <= 0:
        return (
            "Noch keine Kilometer diese Woche — nächste Ausfahrt wartet."
            if de
            else "No kilometres logged yet this week — your next ride is waiting."
        )
    a, b, pair_km = min(CITY_PAIRS, key=lambda p: abs(p[2] - distance_km))
    if de:
        return f"Deine {km} km — ungefähr die Strecke von {a} nach {b} (~{pair_km} km)."
    return f"Your {km} km — about the ride from {a} to {b} (~{pair_km} km)."


def fallback_saddle_line(saddle_hours: float, iso_week: int, de: bool) -> str:
    """Deterministic witty-and-kind saddle-time line; the ISO week rotates it."""
    h = max(0.0, float(saddle_hours))
    if h <= 0:
        return (
            "Diese Woche ruhte der Sattel — auch das gehört zum Plan."
            if de
            else "The saddle rested this week — that's part of the plan too."
        )
    lines = _SADDLE_LINES_DE if de else _SADDLE_LINES_EN
    return lines[iso_week % len(lines)](h)


_FLAVOR_SYSTEM_DE = (
    "Du bist ein origineller, warmherziger Radsport-Coach mit trockenem Humor. "
    "Du bekommst die Wochenwerte eines Radfahrers und schreibst ZWEI kurze deutsche "
    "Texte. Antworte AUSSCHLIESSLICH mit gültigem JSON, exakt in dieser Form: "
    '{"cities": "...", "saddle": "..."}. '
    "cities: Vergleiche die gefahrene Gesamtdistanz mit einer realen, geografisch "
    "plausiblen Strecke zwischen zwei bekannten Orten oder zu einem Wahrzeichen. Die "
    "Distanz muss ungefähr stimmen (±15%). Ein Satz, motivierend, beginne mit der "
    "Zahl. saddle: Vergleiche die Gesamtzeit im Sattel mit etwas Alltäglichem — "
    "witzig, liebevoll, nie plump, nie gemein, ein Satz. Keine Emojis, keine "
    "Anführungszeichen im Text, kein Text außerhalb des JSON. Sei jede Woche anders."
)
_FLAVOR_SYSTEM_EN = (
    "You are an original, warm cycling coach with dry humour. You get a rider's "
    "weekly numbers and write TWO short English texts. Reply ONLY with valid JSON, "
    'exactly: {"cities": "...", "saddle": "..."}. '
    "cities: compare the total distance ridden to a real, geographically plausible "
    "route between two well-known places or to a landmark. The distance must be "
    "roughly right (±15%). One sentence, motivating, start with the number. saddle: "
    "compare total time in the saddle to something everyday — witty, kind, never "
    "crude, one sentence. No emoji, no quotes inside the text, no text outside the "
    "JSON. Be different every week."
)

# Per-process cache: (user_id, iso_week_key, lang) → {"cities","saddle"}.
_FLAVOR_CACHE: dict[tuple[int, str, str], dict[str, str]] = {}
_FLAVOR_CACHE_MAX = 512


def _parse_flavor_json(text: str) -> dict[str, str] | None:
    """Defensively pull the {cities, saddle} object out of a model reply."""
    if not text:
        return None
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        obj = json.loads(text[start : end + 1])
    except (json.JSONDecodeError, ValueError):
        return None
    if not isinstance(obj, dict):
        return None
    cities = obj.get("cities")
    saddle = obj.get("saddle")
    out: dict[str, str] = {}
    if isinstance(cities, str) and cities.strip():
        out["cities"] = cities.strip()
    if isinstance(saddle, str) and saddle.strip():
        out["saddle"] = saddle.strip()
    return out or None


async def generate_wrapped_flavor(
    user_id: int,
    distance_km: float,
    saddle_hours: float,
    iso_week: int,
    iso_week_key: str,
    lang: str = "en",
) -> dict[str, str]:
    """Return ``{"cities": str, "saddle": str}`` — AI-generated when a key is
    set, deterministic fallback otherwise. Cached per (user, ISO week, locale).

    The fallback is always computed first so a missing field in the LLM reply
    (or a total failure) still yields a complete, nice pair of strings."""
    de = lang == "de"
    fallback = {
        "cities": fallback_city_comparison(distance_km, de),
        "saddle": fallback_saddle_line(saddle_hours, iso_week, de),
    }

    cache_key = (user_id, iso_week_key, lang)
    cached = _FLAVOR_CACHE.get(cache_key)
    if cached is not None:
        return cached

    if not settings.ANTHROPIC_API_KEY:
        return fallback

    user_msg = (
        f"Kalenderwoche: {iso_week_key}\n"
        f"Gesamtdistanz: {round(distance_km)} km\n"
        f"Zeit im Sattel: {saddle_hours:.1f} Stunden\n"
        "Schreibe beide Texte frisch und anders als in anderen Wochen."
    )
    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            # Sonnet tier: good wit at low cost. NO temperature (the Sonnet
            # right-sizing tier 400s on sampling params here) — variety comes
            # from seeding the prompt with the ISO week + the week's numbers.
            model=settings.COACH_MODEL,
            max_tokens=400,
            system=[
                {
                    "type": "text",
                    "text": _FLAVOR_SYSTEM_DE if de else _FLAVOR_SYSTEM_EN,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_msg}],
        )
        text = ""
        for block in getattr(response, "content", None) or []:
            block_text = getattr(block, "text", None)
            if block_text:
                text += block_text
        parsed = _parse_flavor_json(text.strip())
        result = {**fallback, **(parsed or {})}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Weekly-wrapped flavour generation failed: %s", exc)
        result = fallback

    if len(_FLAVOR_CACHE) >= _FLAVOR_CACHE_MAX:
        _FLAVOR_CACHE.clear()
    _FLAVOR_CACHE[cache_key] = result
    return result


async def build_weekly_wrapped(
    db: AsyncSession, user_id: int, lang: str = "en", anchor: date | None = None
) -> dict[str, Any]:
    de = lang == "de"
    profile = (
        await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == user_id)
        )
    ).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)

    anchor = anchor or today_local()
    start, end = _week_bounds(anchor)

    # Shared aggregation — the ONE producer for totals/plan/breakthroughs/best.
    recap = await build_weekly_recap(db, user_id, lang=lang, anchor=anchor)

    # The week's activities (for the day series + peak power) and 90 days of
    # history (for the self-referential ride score percentile).
    week_rows = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.started_at >= _dt(start),
            Activity.started_at <= _dt(end, end=True),
        )
    )
    week = list(week_rows.scalars().all())

    hist_start = start - timedelta(days=90)
    hist_rows = await db.execute(
        select(Activity.tss).where(
            Activity.user_id == user_id,
            Activity.started_at >= _dt(hist_start),
            Activity.started_at < _dt(start),
        )
    )
    history_tss = [float(t) for (t,) in hist_rows.all() if t]

    daily = daily_effort(week, start)

    # Elevation — honest only when a ride carries an ascent figure.
    ascents = []
    for a in week:
        raw = a.raw_data if isinstance(a.raw_data, dict) else {}
        for key in ("total_ascent", "elevation_gain", "elev_gain_m", "ascent_m"):
            v = raw.get(key)
            if isinstance(v, (int, float)) and v > 0:
                ascents.append(float(v))
                break
    elevation_m = round(sum(ascents)) if ascents else None

    # Peak power — true peak only; degrades to None (client skips the card).
    peaks = [p for p in (_peak_power_of(a) for a in week) if p is not None]
    peak_power: dict[str, Any] | None = None
    if peaks:
        watts = max(peaks)
        wkg = (
            round(watts / profile.weight_kg, 1)
            if profile is not None and getattr(profile, "weight_kg", None)
            else None
        )
        peak_power = {
            "watts": round(watts),
            "wkg": wkg,
            "comparison": power_comparison(watts, de),
        }

    # Best ride, scored against the athlete's own recent history.
    best = recap.get("best_ride")
    best_ride = None
    if best is not None:
        score = ride_score(best.get("tss"), history_tss)
        best_ride = {
            **best,
            "score": score,
            "moving": _fmt_hm(best.get("hours") or 0),
        }

    totals = recap["totals"]

    # Animated route — the week's most notable GPS ride, projected to the card's
    # viewbox. None when no ride that week carries a track (client skips it).
    route = await _notable_route(db, user_id, week)

    # AI flavour (distance→cities, saddle→witty), seeded with the ISO week for
    # week-to-week variety; deterministic fallback when no API key / on failure.
    iso_year, iso_week, _ = start.isocalendar()
    iso_week_key = f"{iso_year}-W{iso_week:02d}"
    flavor = await generate_wrapped_flavor(
        user_id,
        distance_km=float(totals["km"]),
        saddle_hours=float(totals["hours"]),
        iso_week=iso_week,
        iso_week_key=iso_week_key,
        lang=lang,
    )

    planned = recap.get("planned_tss")
    done_sessions = int(totals["sessions"])
    # "Zero missed" — every planned session has a matching completed ride. We
    # approximate planned session count from planned TSS presence when explicit
    # counts aren't surfaced; conservatively, zero_missed is true only when we
    # rode at least as much as planned and had at least one ride.
    zero_missed = done_sessions > 0 and (planned is None or totals["tss"] >= planned * 0.85)

    return {
        "week_start": recap["week_start"],
        "week_end": recap["week_end"],
        "has_rides": done_sessions > 0,
        "totals": {
            **totals,
            "saddle_hm": _fmt_hm(totals["hours"]),
        },
        "prev_totals": recap["prev_totals"],
        "planned_tss": planned,
        "ctl_delta": recap.get("ctl_delta"),
        "route": route,
        "distance_comparison": flavor["cities"],
        "saddle_line": flavor["saddle"],
        "daily_effort": daily,
        "elevation_m": elevation_m,
        "peak_power": peak_power,
        "best_ride": best_ride,
        "rides": done_sessions,
        "zero_missed": zero_missed,
        "streak": recap.get("streak"),
    }
