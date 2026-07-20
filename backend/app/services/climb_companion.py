"""Climb Companion — detect, group, and pace the athlete's own climbs.

Everything is computed from the athlete's stored activity streams (altitude /
distance / power / GPS). No external climb database: a "climb" is whatever the
athlete has actually ridden.

Pipeline (pure parts are plain functions, DB glue lives in
``load_athlete_climbs``):

1. ``detect_ride_climbs``   — segment one ride (ride_segmentation), merge climbs
   interrupted by short flats/dips, keep significant ones, attach metrics
   (climbing_analysis) + a binned gradient profile.
2. ``group_climbs``         — the same climb ridden on different days is matched
   by GPS start proximity + similar length. Without GPS a climb instance stands
   alone (we never guess that two climbs are the same road).
3. ``summarize_group``      — PR time / VAM / W/kg, attempt history with deltas,
   and a gradient-weighted pacing plan anchored on the athlete's CP.
"""
from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.services.athlete_power_profile import compute_athlete_power_profile
from app.services.climbing_analysis import analyze_climbs
from app.services.ride_segmentation import Segment, segment_ride

# ── thresholds ────────────────────────────────────────────────────────────────
MIN_CLIMB_GAIN_M = 30.0        # ignore rollers below this total gain
MIN_CLIMB_DISTANCE_M = 500.0   # ignore stabs shorter than this
MAX_INTERRUPTION_S = 180       # a flat/dip shorter than this stays in the climb
MAX_INTERRUPTION_LOSS_M = 20.0
GROUP_RADIUS_M = 300.0         # same climb = starts within this radius …
GROUP_LENGTH_TOLERANCE = 0.25  # … and lengths within 25 %
MAX_CLIMBS = 12
MAX_HISTORY = 8
MAX_RIDES_SCANNED = 300


# ── small helpers (pure) ─────────────────────────────────────────────────────

def _fill(series: list[float | None] | None, n: int) -> list[float] | None:
    """Forward/back-fill a carry-filled series to a full float array, or None."""
    if not series:
        return None
    out: list[float | None] = list(series[:n]) + [None] * max(0, n - len(series))
    last: float | None = None
    for i, v in enumerate(out):
        if v is not None:
            last = float(v)
        out[i] = last
    if last is None:
        return None
    first = next(v for v in out if v is not None)
    return [first if v is None else float(v) for v in out]


def _smooth(values: list[float], window_s: int) -> list[float]:
    if window_s <= 1 or len(values) < 3:
        return values
    half = window_s // 2
    n = len(values)
    out = []
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        out.append(sum(values[lo:hi]) / (hi - lo))
    return out


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial great-circle bearing from point 1 to point 2, 0–360°."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return round((math.degrees(math.atan2(y, x)) + 360.0) % 360.0, 1)


# ── gradient zones & pacing (pure) ───────────────────────────────────────────

def zone_for_gradient(gradient_pct: float) -> int:
    """Gradient → display zone: <3 % z1, 3–6 z2, 6–9 z3, 9–12 z4, >12 z5."""
    if gradient_pct < 3.0:
        return 1
    if gradient_pct < 6.0:
        return 2
    if gradient_pct < 9.0:
        return 3
    if gradient_pct < 12.0:
        return 4
    return 5


def pace_factor(gradient_pct: float) -> float:
    """Fraction of CP to target: steeper → closer to CP, descents → easy."""
    if gradient_pct < 0.0:
        return 0.55
    if gradient_pct < 3.0:
        return 0.78
    if gradient_pct < 6.0:
        return 0.85
    if gradient_pct < 9.0:
        return 0.90
    if gradient_pct < 12.0:
        return 0.94
    return 0.97


def duration_scale(climb_time_s: int | None) -> float:
    """Long climbs can't all be ridden near CP — scale the whole plan down."""
    if climb_time_s is None:
        return 1.0
    if climb_time_s > 2400:
        return 0.94
    if climb_time_s > 1200:
        return 0.97
    return 1.0


def _effort_key(gradient_pct: float) -> str:
    if gradient_pct < -1.0:
        return "recover"
    return {1: "settle", 2: "steady", 3: "tempo", 4: "hard", 5: "max"}[
        zone_for_gradient(gradient_pct)
    ]


def profile_bins(
    altitude: list[float],
    distance: list[float],
    start_s: int,
    end_s: int,
    *,
    target_bin_m: float = 350.0,
) -> list[dict]:
    """Equal-distance gradient bins over [start_s, end_s) of cleaned streams.

    Returns [{"km": start-of-bin km within the climb, "gradient_pct", "alt_m"}].
    """
    end_s = min(end_s, len(altitude), len(distance))
    if end_s - start_s < 2:
        return []
    alt = _smooth(altitude[start_s:end_s], 15)
    dist = distance[start_s:end_s]
    total_m = dist[-1] - dist[0]
    if total_m < 100.0:
        return []
    n_bins = max(8, min(40, round(total_m / target_bin_m)))
    edges = [dist[0] + total_m * i / n_bins for i in range(n_bins + 1)]
    idx: list[int] = []
    j = 0
    for edge in edges:
        while j < len(dist) - 1 and dist[j] < edge:
            j += 1
        idx.append(j)
    bins: list[dict] = []
    for i in range(n_bins):
        a, b = idx[i], idx[i + 1]
        seg_m = dist[b] - dist[a]
        grad = ((alt[b] - alt[a]) / seg_m * 100.0) if seg_m > 1.0 else 0.0
        bins.append({
            "km": round((dist[a] - dist[0]) / 1000.0, 2),
            "gradient_pct": round(grad, 1),
            "alt_m": round(alt[b], 1),
        })
    return bins


def build_pacing_plan(
    bins: list[dict],
    cp_watts: float | None,
    length_km: float,
    climb_time_s: int | None = None,
    *,
    max_sections: int = 6,
) -> list[dict]:
    """Gradient-weighted pacing sections with threshold-anchored target watts.

    `cp_watts` is the athlete's CANONICAL threshold (manual FTP when set, else
    the sanitized model eFTP) — see audit P0-1. The parameter keeps its legacy
    name for call-site compatibility.

    Adjacent bins are grouped while their gradient stays near the running
    section mean, so sections follow the shape of the road; the plan is capped
    at ``max_sections`` rows.
    """
    if not bins or cp_watts is None or cp_watts <= 0:
        return []
    sections: list[list[dict]] = []
    cur = [bins[0]]
    for b in bins[1:]:
        mean = sum(x["gradient_pct"] for x in cur) / len(cur)
        if abs(b["gradient_pct"] - mean) > 2.0 and len(cur) >= 2:
            sections.append(cur)
            cur = [b]
        else:
            cur.append(b)
    sections.append(cur)
    while len(sections) > max_sections:
        k = min(
            range(len(sections) - 1),
            key=lambda i: len(sections[i]) + len(sections[i + 1]),
        )
        sections[k:k + 2] = [sections[k] + sections[k + 1]]

    scale = duration_scale(climb_time_s)
    plan: list[dict] = []
    for i, sec in enumerate(sections):
        grad = sum(x["gradient_pct"] for x in sec) / len(sec)
        from_km = sec[0]["km"]
        to_km = sections[i + 1][0]["km"] if i + 1 < len(sections) else round(length_km, 2)
        plan.append({
            "from_km": from_km,
            "to_km": to_km,
            "gradient_pct": round(grad, 1),
            "zone": zone_for_gradient(grad),
            "effort": _effort_key(grad),
            "target_watts": round(cp_watts * pace_factor(grad) * scale),
        })
    return plan


# ── climb detection in one ride (pure) ───────────────────────────────────────

def merge_climb_segments(segments: list[Segment]) -> list[Segment]:
    """Merge climbs separated by short, mostly-flat interruptions.

    A real col often has a brief false-flat or dip mid-way; ride_segmentation
    splits there, so this stitches climb – (short flat/dip) – climb back into
    one climb. Non-climb segments pass through untouched.
    """
    out: list[Segment] = []
    i, n = 0, len(segments)
    while i < n:
        seg = segments[i]
        if seg.kind != "climb":
            out.append(seg)
            i += 1
            continue
        group = [seg]
        j = i + 1
        while j < n:
            nxt = segments[j]
            if nxt.kind == "climb":
                group.append(nxt)
                j += 1
                continue
            if (
                nxt.duration_s <= MAX_INTERRUPTION_S
                and nxt.elev_loss_m <= MAX_INTERRUPTION_LOSS_M
                and j + 1 < n
                and segments[j + 1].kind == "climb"
            ):
                group.append(nxt)
                group.append(segments[j + 1])
                j += 2
                continue
            break
        out.append(_combine(group) if len(group) > 1 else seg)
        i = j
    return out


def _combine(group: list[Segment]) -> Segment:
    start, end = group[0].start_s, group[-1].end_s
    dist = sum(g.distance_m for g in group)
    gain = sum(g.elev_gain_m for g in group)
    loss = sum(g.elev_loss_m for g in group)
    grade = ((gain - loss) / dist * 100.0) if dist > 0.1 else 0.0
    powered = [(g.avg_power, g.duration_s) for g in group if g.avg_power is not None]
    avg_power = (
        round(sum(p * d for p, d in powered) / sum(d for _, d in powered), 1)
        if powered else None
    )
    speeds = [(g.avg_speed_ms, g.duration_s) for g in group if g.avg_speed_ms is not None]
    avg_speed = (
        round(sum(s * d for s, d in speeds) / sum(d for _, d in speeds), 2)
        if speeds else None
    )
    return Segment(
        kind="climb", start_s=start, end_s=end, duration_s=end - start,
        distance_m=round(dist, 1), elev_gain_m=round(gain, 1),
        elev_loss_m=round(loss, 1), avg_grade_pct=round(grade, 2),
        avg_power=avg_power, avg_speed_ms=avg_speed,
    )


def detect_ride_climbs(
    streams: dict,
    *,
    mass_kg: float | None = None,
    title: str | None = None,
    date: str | None = None,
    activity_id: int | None = None,
) -> list[dict]:
    """Significant climbs in one ride's streams as instance dicts; [] if none.

    Needs altitude + distance channels; GPS enriches (start/end coords for
    cross-ride matching), power enriches (W, W/kg).
    """
    altitude = streams.get("altitude") or []
    distance = streams.get("distance") or []
    n = len(altitude)
    alt = _fill(altitude, n)
    dist = _fill(distance, n)
    if alt is None or dist is None:
        return []
    power = streams.get("power") or None
    speed = streams.get("speed") or None
    segments = segment_ride(altitude, distance, power, speed)
    merged = merge_climb_segments(segments)
    significant = [
        s for s in merged
        if s.kind == "climb"
        and s.elev_gain_m >= MIN_CLIMB_GAIN_M
        and s.distance_m >= MIN_CLIMB_DISTANCE_M
    ]
    climbs = analyze_climbs(significant, mass_kg)

    lat = _fill(streams.get("latitude"), n)
    lng = _fill(streams.get("longitude"), n)

    instances: list[dict] = []
    for c in climbs:
        end_s = min(c.start_s + c.duration_s, n)
        bins = profile_bins(alt, dist, c.start_s, end_s)
        if not bins:
            continue
        last = end_s - 1
        instances.append({
            "activity_id": activity_id,
            "title": title,
            "date": date,
            "start_s": c.start_s,
            "duration_s": c.duration_s,
            "distance_m": c.distance_m,
            "elev_gain_m": c.elev_gain_m,
            "avg_grade_pct": c.avg_grade_pct,
            "max_grade_pct": max(b["gradient_pct"] for b in bins),
            "vam_m_per_h": c.vam_m_per_h,
            "w_per_kg": c.w_per_kg,
            "avg_power": c.avg_power,
            "category": c.category,
            "start_km": round(dist[c.start_s] / 1000.0, 1),
            "summit_m": round(max(alt[c.start_s:end_s]), 1),
            "start_lat": lat[c.start_s] if lat else None,
            "start_lng": lng[c.start_s] if lng else None,
            "end_lat": lat[last] if lat else None,
            "end_lng": lng[last] if lng else None,
            "profile": bins,
        })
    return instances


# ── cross-ride grouping + summary (pure) ─────────────────────────────────────

_VIRTUAL_MARKERS = ("zwift", "rouvy", "mywhoosh", "trainerroad", "indoor", "virtual")


def _is_virtual(title: str | None) -> bool:
    """Virtual-platform rides carry fantasy GPS (e.g. Watopia) — flag them so
    the UI never shows real-world weather/location for a virtual climb."""
    return bool(title) and any(m in title.lower() for m in _VIRTUAL_MARKERS)


def _same_climb(a: dict, b: dict) -> bool:
    if a["start_lat"] is None or b["start_lat"] is None:
        return False  # never guess without GPS
    if (
        haversine_m(a["start_lat"], a["start_lng"], b["start_lat"], b["start_lng"])
        > GROUP_RADIUS_M
    ):
        return False
    la, lb = a["distance_m"], b["distance_m"]
    return abs(la - lb) <= GROUP_LENGTH_TOLERANCE * max(la, lb)


def group_climbs(instances: list[dict]) -> list[list[dict]]:
    """Group instances of the same climb (GPS start proximity + similar length)."""
    groups: list[list[dict]] = []
    for inst in instances:
        for g in groups:
            if _same_climb(g[0], inst):
                g.append(inst)
                break
        else:
            groups.append([inst])
    return groups


def summarize_group(group: list[dict], cp_watts: float | None) -> dict:
    """One climb card: PR + deltas, profile of the fastest attempt, pacing plan."""
    best = min(group, key=lambda x: x["duration_s"])
    vams = [x["vam_m_per_h"] for x in group if x["vam_m_per_h"] is not None]
    wkgs = [x["w_per_kg"] for x in group if x["w_per_kg"] is not None]
    dates = [x["date"] for x in group if x["date"]]
    length_km = round(best["distance_m"] / 1000.0, 1)
    history = sorted(
        group, key=lambda x: (x["date"] or "", -x["duration_s"]), reverse=True
    )[:MAX_HISTORY]
    pacing = build_pacing_plan(
        best["profile"], cp_watts, length_km, best["duration_s"]
    )

    vam_target = None
    if pacing and best["avg_power"] and best["avg_power"] > 0 and best["vam_m_per_h"]:
        widths = [max(0.01, p["to_km"] - p["from_km"]) for p in pacing]
        target_avg = sum(p["target_watts"] * w for p, w in zip(pacing, widths)) / sum(widths)
        ratio = min(1.2, max(0.75, target_avg / best["avg_power"]))
        vam_target = round(best["vam_m_per_h"] * ratio)

    return {
        "name": f"{best['title']} · km {best['start_km']:.0f}" if best["title"] else None,
        "category": best["category"],
        "length_km": length_km,
        "avg_gradient_pct": round(best["avg_grade_pct"], 1),
        "max_gradient_pct": round(best["max_grade_pct"], 1),
        "elevation_m": round(best["elev_gain_m"]),
        "summit_m": round(best["summit_m"]),
        "start_km": best["start_km"],
        "best_time_s": best["duration_s"],
        "best_date": best["date"],
        "best_avg_power": best["avg_power"],
        "best_vam": round(max(vams)) if vams else None,
        "best_wkg": max(wkgs) if wkgs else None,
        "attempts": len(group),
        "last_date": max(dates) if dates else None,
        "is_virtual": _is_virtual(best["title"]),
        "lat": best["start_lat"],
        "lng": best["start_lng"],
        "bearing_deg": (
            bearing_deg(best["start_lat"], best["start_lng"], best["end_lat"], best["end_lng"])
            if best["start_lat"] is not None and best["end_lat"] is not None
            else None
        ),
        "profile": best["profile"],
        "pacing": pacing,
        "vam_target": vam_target,
        "history": [
            {
                "date": h["date"],
                "time_s": h["duration_s"],
                "delta_s": h["duration_s"] - best["duration_s"],
                "avg_power": h["avg_power"],
                "vam": round(h["vam_m_per_h"]) if h["vam_m_per_h"] is not None else None,
            }
            for h in history
        ],
    }


# ── DB glue ──────────────────────────────────────────────────────────────────

async def load_athlete_climbs(db: AsyncSession, user_id: int) -> dict:
    """All detected climbs for the athlete, grouped and summarized.

    ``{"available": False, "climbs": []}`` when nothing is detectable (no rides
    with altitude+distance, or no significant climbs in them).
    """
    res = await db.execute(
        select(
            ActivityStream.activity_id,
            ActivityStream.streams,
            Activity.title,
            Activity.started_at,
        )
        .join(Activity, Activity.id == ActivityStream.activity_id)
        .where(
            ActivityStream.user_id == user_id,
            Activity.user_id == user_id,
            Activity.sport == "cycling",
        )
        .order_by(Activity.started_at.desc())
        .limit(MAX_RIDES_SCANNED)
    )
    rows = res.all()

    prof_res = await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id)
    )
    athlete_profile = prof_res.scalar_one_or_none()
    weight = athlete_profile.weight_kg if athlete_profile else None
    mass_kg = float(weight) if weight else None

    # Pacing anchor: the CANONICAL threshold (audit P0-1) — manual FTP when
    # set, else the sanitized cross-ride model eFTP. Never a raw envelope CP
    # that can disagree with the FTP shown everywhere else. Fall back to the
    # stored FTP, then the latest per-ride CP, only when the model can't fit.
    profile = await compute_athlete_power_profile(db, user_id, profile=athlete_profile)
    threshold_watts: float | None = (
        profile.get("threshold_watts") if profile else None
    )
    threshold_source: str | None = (
        profile.get("threshold_source") if profile else None
    )
    if threshold_watts is None and athlete_profile and athlete_profile.ftp_watts:
        threshold_watts = float(athlete_profile.ftp_watts)
        threshold_source = "manual"
    if threshold_watts is None:
        cp_res = await db.execute(
            select(ActivityStream.cp_watts)
            .where(ActivityStream.user_id == user_id, ActivityStream.cp_watts.isnot(None))
            .order_by(ActivityStream.created_at.desc())
            .limit(1)
        )
        threshold_watts = cp_res.scalar_one_or_none()
        threshold_source = "model" if threshold_watts is not None else None

    instances: list[dict] = []
    for r in rows:
        instances.extend(detect_ride_climbs(
            r.streams or {},
            mass_kg=mass_kg,
            title=r.title,
            date=r.started_at.date().isoformat() if r.started_at else None,
            activity_id=r.activity_id,
        ))

    groups = group_climbs(instances)
    summaries = [summarize_group(g, threshold_watts) for g in groups]
    summaries.sort(key=lambda s: (s["attempts"], s["elevation_m"]), reverse=True)
    summaries = summaries[:MAX_CLIMBS]

    return {
        "available": len(summaries) > 0,
        # `cp_watts` kept for backward compatibility but now sourced from the
        # canonical threshold; frontends should migrate to `threshold_watts`.
        "cp_watts": round(threshold_watts) if threshold_watts else None,
        "threshold_watts": round(threshold_watts) if threshold_watts else None,
        "threshold_source": threshold_source,
        "climbs": summaries,
    }
