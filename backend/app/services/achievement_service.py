"""Server-side achievement detection + persistence (V2 · Achievements).

Replaces the localStorage-v0 AchievementBadges detection with a DB-backed
catalog detected from the athlete's OWN data only:

- ride milestones (10/50/100 rides, first century, first 1,000 kJ ride,
  longest-ride PB) from `activities` + `activity_streams.total_kj`
- CTL milestones (40/60/80) from the PMC total series
- power-curve breakthroughs + eFTP shifts via breakthrough_detector
  (REUSED, not duplicated — same conservative gates)
- first categorized climb (Cat 4+) from altitude streams via
  ride_segmentation + climbing_analysis

Unlock dates are the date of the *triggering ride/day* (not detection time),
so history replays honestly. Rows live in `achievements` (RLS-protected);
the internal `_climb_scan` bookmark row makes the altitude scan incremental —
each request only segments rides it has never seen. Bookmark keys (leading
underscore) are never exposed by the API.

HONESTY RULE: no fabricated progress. Locked achievements report numeric
progress only where a real number exists (e.g. best ride 82 of 100 km);
breakthrough-style unlocks have no meaningful "percent" and return null.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.achievement import Achievement
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.services import pmc_service
from app.services.breakthrough_detector import detect_breakthroughs
from app.services.climbing_analysis import analyze_climbs
from app.services.ride_segmentation import segment_ride

CLIMB_SCAN_KEY = "_climb_scan"
CAT4_SCORE = 800.0  # climbing_analysis Cat-4 band edge (elev_gain_m * grade_pct)
FRESH_CREATED_DAYS = 7
FRESH_EVENT_DAYS = 14


# ── Catalog ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AchievementDef:
    key: str
    icon: str          # lucide icon hint for the frontend
    title_en: str
    title_de: str
    detail_en: str
    detail_de: str
    unit: str | None = None   # unit of the progress numbers, if any


CATALOG: list[AchievementDef] = [
    AchievementDef(
        "rides_10", "bike", "10 rides", "10 Fahrten",
        "Ten logged rides — the habit is real.",
        "Zehn erfasste Fahrten — die Gewohnheit steht.",
        "rides",
    ),
    AchievementDef(
        "rides_50", "bike", "50 rides", "50 Fahrten",
        "Fifty rides in the log.",
        "Fünfzig Fahrten im Logbuch.",
        "rides",
    ),
    AchievementDef(
        "rides_100", "bike", "100 rides", "100 Fahrten",
        "One hundred rides. A season's worth of work.",
        "Hundert Fahrten. Die Arbeit einer ganzen Saison.",
        "rides",
    ),
    AchievementDef(
        "first_century", "trophy", "Century", "Century",
        "First ride at 100 km or more. A real one.",
        "Erste Fahrt über 100 km. Eine echte.",
        "km",
    ),
    AchievementDef(
        "first_1000kj", "flame", "1,000 kJ ride", "1.000-kJ-Fahrt",
        "First ride with 1,000 kJ of mechanical work.",
        "Erste Fahrt mit 1.000 kJ mechanischer Arbeit.",
        "kJ",
    ),
    AchievementDef(
        "longest_ride", "route", "Longest ride", "Längste Fahrt",
        "Your longest ride ever — a PB that keeps moving.",
        "Deine längste Fahrt aller Zeiten — ein PB, der wandert.",
        "km",
    ),
    AchievementDef(
        "first_cat_climb", "mountain", "Categorized climb", "Kategorisierter Anstieg",
        "First Cat 4+ climb, detected from your altitude data.",
        "Erster Anstieg ab Kategorie 4 — aus deinen Höhendaten erkannt.",
    ),
    AchievementDef(
        "ctl_40", "trending-up", "Fitness 40", "Fitness 40",
        "CTL crossed 40 — a solid aerobic base.",
        "CTL erstmals über 40 — eine solide aerobe Basis.",
        "CTL",
    ),
    AchievementDef(
        "ctl_60", "trending-up", "Fitness 60", "Fitness 60",
        "CTL crossed 60 — serious training volume.",
        "CTL erstmals über 60 — ernsthaftes Trainingsvolumen.",
        "CTL",
    ),
    AchievementDef(
        "ctl_80", "trending-up", "Fitness 80", "Fitness 80",
        "CTL crossed 80 — race-ready territory.",
        "CTL erstmals über 80 — Rennform-Bereich.",
        "CTL",
    ),
    AchievementDef(
        "power_pb_60", "zap", "1-min breakthrough", "1-Minuten-Durchbruch",
        "Beat your prior 90-day best 1-min power by 2%+.",
        "Deine 1-Minuten-Bestleistung der letzten 90 Tage um 2%+ geschlagen.",
        "W",
    ),
    AchievementDef(
        "power_pb_300", "zap", "5-min breakthrough", "5-Minuten-Durchbruch",
        "Beat your prior 90-day best 5-min power by 2%+.",
        "Deine 5-Minuten-Bestleistung der letzten 90 Tage um 2%+ geschlagen.",
        "W",
    ),
    AchievementDef(
        "power_pb_1200", "zap", "20-min breakthrough", "20-Minuten-Durchbruch",
        "Beat your prior 90-day best 20-min power by 2%+.",
        "Deine 20-Minuten-Bestleistung der letzten 90 Tage um 2%+ geschlagen.",
        "W",
    ),
    AchievementDef(
        "power_pb_3600", "zap", "60-min breakthrough", "60-Minuten-Durchbruch",
        "Beat your prior 90-day best 60-min power by 2%+.",
        "Deine 60-Minuten-Bestleistung der letzten 90 Tage um 2%+ geschlagen.",
        "W",
    ),
    AchievementDef(
        "eftp_up", "gauge", "Engine upgrade", "Motor-Upgrade",
        "Your modelled eFTP moved up 5 W+ — no test day, real rides.",
        "Dein modelliertes eFTP stieg um 5 W+ — kein Testtag, echte Fahrten.",
        "W",
    ),
]
CATALOG_BY_KEY = {d.key: d for d in CATALOG}

_PB_DURATION_KEYS = {60: "power_pb_60", 300: "power_pb_300",
                     1200: "power_pb_1200", 3600: "power_pb_3600"}
_CTL_TARGETS = {"ctl_40": 40.0, "ctl_60": 60.0, "ctl_80": 80.0}
_RIDE_COUNT_TARGETS = {"rides_10": 10, "rides_50": 50, "rides_100": 100}


# ── Pure detection helpers (unit-tested without a DB) ────────────────────

@dataclass(frozen=True)
class RideRow:
    id: int
    started_at: datetime
    distance_m: float | None
    duration_s: int | None
    #: Optional so every existing positional construction keeps working. Both
    #: are read only by the Erfolge screen's consistency grid and biggest day.
    elevation_m: float | None = None
    title: str | None = None


def _week_start(d: date) -> date:
    """The Monday of `d`'s week. ISO weeks, so a year is 52 or 53 of these."""
    return d - timedelta(days=d.weekday())


def _month_start(d: date) -> date:
    """The first of `d`'s month."""
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    """`d` shifted by `n` months, clamped to the 1st — only ever used on
    month starts, so there is no end-of-month arithmetic to get wrong."""
    total = (d.year * 12 + d.month - 1) + n
    return date(total // 12, total % 12 + 1, 1)


def monthly_rhythm(
    rides: Sequence[RideRow], now: datetime, months: int = 12
) -> list[dict[str, Any]]:
    """The last `months` calendar months, oldest first.

    THE GRAIN ABOVE THE WEEK. The consistency grid answers "did you show up";
    a month answers "how much", which is a different question and needs a
    different unit — so this carries km and minutes rather than a lit/unlit
    flag. Both are kept: distance is what a rider says out loud, time is what
    actually trains them, and which one the screen draws is the screen's call.

    Every month in the window is present even when empty. A gap is a fact
    about the rider's year and a chart that silently omits it draws a
    continuous season they did not have.
    """
    this_month = _month_start(now.date())
    first_month = _add_months(this_month, -(months - 1))

    buckets: dict[date, dict[str, float]] = {}
    for r in rides:
        if r.started_at is None:
            continue
        mo = _month_start(r.started_at.date())
        if mo < first_month or mo > this_month:
            continue
        b = buckets.setdefault(mo, {"rides": 0, "metres": 0.0, "seconds": 0.0})
        b["rides"] += 1
        b["metres"] += float(r.distance_m or 0)
        b["seconds"] += float(r.duration_s or 0)

    out: list[dict[str, Any]] = []
    for i in range(months):
        mo = _add_months(first_month, i)
        b = buckets.get(mo)
        out.append({
            "start": mo.isoformat(),
            "rides": int(b["rides"]) if b else 0,
            "km": round(b["metres"] / 1000, 1) if b else 0.0,
            "minutes": round(b["seconds"] / 60) if b else 0,
        })
    return out


def daily_rhythm(
    rides: Sequence[RideRow], now: datetime, days: int = 14
) -> list[dict[str, Any]]:
    """The last `days` days, oldest first — the finest grain of the card.

    Every day is present, rest days included. On this grain the gaps ARE the
    information: a week is legible as three rides and four rests, and a chart
    that drew only the days with rides would compress a fortnight of two rides
    into the same picture as a fortnight of twelve.
    """
    today = now.date()
    first = today - timedelta(days=days - 1)

    buckets: dict[date, dict[str, float]] = {}
    for r in rides:
        if r.started_at is None:
            continue
        d = r.started_at.date()
        if d < first or d > today:
            continue
        b = buckets.setdefault(d, {"rides": 0, "metres": 0.0, "seconds": 0.0})
        b["rides"] += 1
        b["metres"] += float(r.distance_m or 0)
        b["seconds"] += float(r.duration_s or 0)

    out: list[dict[str, Any]] = []
    for i in range(days):
        d = first + timedelta(days=i)
        b = buckets.get(d)
        out.append({
            "start": d.isoformat(),
            "rides": int(b["rides"]) if b else 0,
            "km": round(b["metres"] / 1000, 1) if b else 0.0,
            "minutes": round(b["seconds"] / 60) if b else 0,
        })
    return out


def season_compare(rides: Sequence[RideRow], now: datetime) -> dict[str, Any] | None:
    """This year so far against the same stretch of last year.

    A SEASON IS ONLY A NUMBER IF THERE IS SOMETHING TO COMPARE IT TO, and the
    comparison has to be fair: this is year-to-date against last year TO THE
    SAME DAY, never against last year's full twelve months. A rider looking at
    this in March would otherwise be told they had collapsed.

    Returns None when the prior window holds no rides. A first-season rider
    has nothing to compare against, and inventing a 0 to divide by would print
    a made-up percentage over a year they were not riding — house rule 9, a
    section that cannot be true is not rendered rather than polished.
    """
    today = now.date()
    this_start = date(today.year, 1, 1)
    prev_start = date(today.year - 1, 1, 1)
    # The same day-of-year last year. Feb 29 has no counterpart in a common
    # year, so step back a day rather than raising.
    try:
        prev_end = today.replace(year=today.year - 1)
    except ValueError:
        prev_end = today.replace(year=today.year - 1, day=today.day - 1)

    def _tally(lo: date, hi: date) -> dict[str, Any]:
        n = 0
        metres = seconds = 0.0
        for r in rides:
            if r.started_at is None:
                continue
            d = r.started_at.date()
            if lo <= d <= hi:
                n += 1
                metres += float(r.distance_m or 0)
                seconds += float(r.duration_s or 0)
        return {"rides": n, "km": round(metres / 1000, 1), "minutes": round(seconds / 60)}

    prev = _tally(prev_start, prev_end)
    if prev["rides"] == 0:
        return None
    cur = _tally(this_start, today)
    return {
        "year": today.year,
        "prev_year": today.year - 1,
        "through": today.isoformat(),
        "current": cur,
        "previous": prev,
    }


def weekly_consistency(
    rides: Sequence[RideRow], now: datetime, weeks: int = 52
) -> dict[str, Any]:
    """Which of the last `weeks` weeks the rider actually rode.

    The Erfolge grid is one tile per week, and its whole claim is "you showed
    up" — so the unit is a WEEK WITH A RIDE IN IT, not a distance or a score. A
    week with one easy hour counts the same as a week with three; the intensity
    of the tile carries how much, and the tile being lit at all carries the
    thing the chapter is about.

    Weeks are counted back from the CURRENT week, which is included even though
    it is incomplete: a rider who rode on Monday should see this Monday lit,
    and hiding it would show them a grid that says they stopped.

    `longest_streak` runs over consecutive lit weeks within the window only. It
    is deliberately not "of all time" — the grid is the evidence for the
    number printed beside it, and a streak the grid cannot show is a number the
    rider cannot check.
    """
    this_week = _week_start(now.date())
    first_week = this_week - timedelta(weeks=weeks - 1)

    buckets: dict[date, dict[str, float]] = {}
    for r in rides:
        started = r.started_at
        d = started.date() if started is not None else None
        if d is None:
            continue
        wk = _week_start(d)
        if wk < first_week or wk > this_week:
            continue
        b = buckets.setdefault(wk, {"rides": 0, "seconds": 0.0})
        b["rides"] += 1
        b["seconds"] += float(r.duration_s or 0)

    out: list[dict[str, Any]] = []
    streak = best_streak = 0
    for i in range(weeks):
        wk = first_week + timedelta(weeks=i)
        b = buckets.get(wk)
        n = int(b["rides"]) if b else 0
        out.append({
            "start": wk.isoformat(),
            "rides": n,
            "minutes": round(b["seconds"] / 60) if b else 0,
        })
        streak = streak + 1 if n else 0
        best_streak = max(best_streak, streak)

    return {
        "weeks": out,
        "ridden": sum(1 for w in out if w["rides"]),
        "of": weeks,
        "longest_streak": best_streak,
    }


def biggest_day(rides: Sequence[RideRow]) -> dict[str, Any] | None:
    """The rider's longest single ride, by distance.

    Distance and not duration, because "how far did you get" is the question a
    rider asks about their biggest day; a five-hour recovery spin is a longer
    ride and nobody's biggest day.

    `also_highest` is only true when that same ride ALSO holds their ascent
    record — the screen shows a second badge for it, and showing that badge on
    a ride that is merely hilly would be a claim the rider could disprove by
    scrolling their own history.
    """
    ridden = [r for r in rides if (r.distance_m or 0) > 0]
    if not ridden:
        return None
    best = max(ridden, key=lambda r: r.distance_m or 0)
    climbed = [r for r in rides if r.elevation_m is not None]
    top_climb = max(climbed, key=lambda r: r.elevation_m or 0) if climbed else None
    return {
        "activity_id": best.id,
        "date": best.started_at.date().isoformat() if best.started_at else None,
        "title": best.title,
        "km": round((best.distance_m or 0) / 1000, 1),
        "duration_s": int(best.duration_s or 0),
        "ascent_m": round(best.elevation_m) if best.elevation_m is not None else None,
        "also_highest": top_climb is not None and top_climb.id == best.id,
    }


def detect_ride_milestones(rides: Sequence[RideRow]) -> dict[str, dict[str, Any]]:
    """Ride-count / century / longest-ride unlocks from chronological rides.

    Returns {key: {"unlocked_at": datetime, "context": {...}}}. `longest_ride`
    always reflects the CURRENT record (callers update the stored row when the
    record moves).
    """
    out: dict[str, dict[str, Any]] = {}
    for key, target in _RIDE_COUNT_TARGETS.items():
        if len(rides) >= target:
            trigger = rides[target - 1]
            out[key] = {
                "unlocked_at": trigger.started_at,
                "context": {"activity_id": trigger.id, "rides": target},
            }
    century = next(
        (r for r in rides if (r.distance_m or 0) >= 100_000), None,
    )
    if century is not None:
        out["first_century"] = {
            "unlocked_at": century.started_at,
            "context": {
                "activity_id": century.id,
                "km": round((century.distance_m or 0) / 1000, 1),
            },
        }
    with_dist = [r for r in rides if (r.distance_m or 0) > 0]
    if with_dist:
        longest = max(with_dist, key=lambda r: r.distance_m or 0)
        out["longest_ride"] = {
            "unlocked_at": longest.started_at,
            "context": {
                "activity_id": longest.id,
                "km": round((longest.distance_m or 0) / 1000, 1),
            },
        }
    return out


def detect_kj_milestone(
    kj_rows: Sequence[tuple[int, datetime, float]],
) -> dict[str, dict[str, Any]]:
    """First ride with >= 1,000 kJ. kj_rows: (activity_id, started_at, kj), chronological."""
    for activity_id, started_at, kj in kj_rows:
        if kj >= 1000.0:
            return {"first_1000kj": {
                "unlocked_at": started_at,
                "context": {"activity_id": activity_id, "kj": round(kj)},
            }}
    return {}


def detect_ctl_milestones(series: Sequence[dict]) -> dict[str, dict[str, Any]]:
    """First date each CTL band was crossed. series entries: {"date": date, "ctl": float}."""
    out: dict[str, dict[str, Any]] = {}
    for key, target in _CTL_TARGETS.items():
        hit = next((e for e in series if float(e["ctl"]) >= target), None)
        if hit is not None:
            d: date = hit["date"]
            out[key] = {
                "unlocked_at": datetime(d.year, d.month, d.day, tzinfo=timezone.utc),
                "context": {"ctl": round(float(hit["ctl"]), 1), "target": target},
            }
    return out


def scan_ride_for_climbs(
    altitude: list[float | None] | None,
    distance: list[float | None] | None,
) -> tuple[float, dict[str, Any] | None]:
    """(total ascent m, best climb dict or None) for one ride's streams.

    Ascent is the positive-delta sum of the segmentation-smoothed altitude —
    the same smoothing the climb detector uses, so noise isn't counted twice.
    """
    if not altitude or not distance:
        return 0.0, None
    segments = segment_ride(altitude, distance)
    if not segments:
        return 0.0, None
    ascent = sum(s.elev_gain_m for s in segments)
    climbs = analyze_climbs(segments)
    best: dict[str, Any] | None = None
    best_score = -1.0
    for c in climbs:
        score = c.elev_gain_m * c.avg_grade_pct  # == climbing_analysis climb score
        if score > best_score:
            best_score = score
            best = {
                "score": round(score, 1),
                "elev_gain_m": round(c.elev_gain_m, 1),
                "avg_grade_pct": round(c.avg_grade_pct, 1),
                "duration_s": c.duration_s,
                "category": c.category,
            }
    return round(ascent, 1), best


def _fmt_num(v: float | int, de: bool, decimals: int = 0) -> str:
    s = f"{v:,.{decimals}f}"
    if de:
        s = s.replace(",", "§").replace(".", ",").replace("§", ".")
    return s


def build_progress(
    key: str,
    *,
    n_rides: int,
    best_km: float | None,
    best_kj: float | None,
    current_ctl: float | None,
    best_climb_score: float | None,
    de: bool,
) -> dict[str, Any] | None:
    """Locked-achievement progress: current, target, and a human label.

    Returns None when no honest numeric progress exists (breakthrough-style
    unlocks) — the frontend then renders the item without a bar.
    """
    von = "von" if de else "of"
    if key in _RIDE_COUNT_TARGETS:
        target = _RIDE_COUNT_TARGETS[key]
        unit = "Fahrten" if de else "rides"
        return {
            "current": n_rides, "target": target,
            "label": f"{_fmt_num(n_rides, de)} {von} {_fmt_num(target, de)} {unit}",
        }
    if key == "first_century":
        cur = round(best_km or 0.0, 1)
        return {
            "current": cur, "target": 100,
            "label": f"{_fmt_num(cur, de, 1)} {von} 100 km",
        }
    if key == "first_1000kj":
        cur = round(best_kj or 0.0)
        return {
            "current": cur, "target": 1000,
            "label": f"{_fmt_num(cur, de)} {von} {_fmt_num(1000, de)} kJ",
        }
    if key in _CTL_TARGETS:
        if current_ctl is None:
            return None
        target = _CTL_TARGETS[key]
        cur = round(current_ctl, 1)
        return {
            "current": cur, "target": target,
            "label": f"CTL {_fmt_num(cur, de, 1)} {von} {_fmt_num(target, de)}",
        }
    if key == "first_cat_climb":
        if best_climb_score is None:
            return None
        cur = round(best_climb_score)
        label = (
            f"Kletter-Score {_fmt_num(cur, de)} {von} {_fmt_num(CAT4_SCORE, de)}"
            if de else
            f"Climb score {_fmt_num(cur, de)} {von} {_fmt_num(CAT4_SCORE, de)}"
        )
        return {"current": cur, "target": CAT4_SCORE, "label": label}
    return None  # power_pb_* / eftp_up: no honest numeric progress


def unlocked_value_label(key: str, context: dict | None, de: bool) -> str | None:
    """Short value chip for an unlocked badge card ("133 km", "Cat 3", "412 W")."""
    if not context:
        return None
    if key in ("first_century", "longest_ride") and context.get("km") is not None:
        return f"{_fmt_num(context['km'], de, 1)} km"
    if key == "first_1000kj" and context.get("kj") is not None:
        return f"{_fmt_num(context['kj'], de)} kJ"
    if key in _RIDE_COUNT_TARGETS:
        return None
    if key in _CTL_TARGETS and context.get("ctl") is not None:
        return f"CTL {_fmt_num(context['ctl'], de, 1)}"
    if key == "first_cat_climb" and context.get("category"):
        cat = context["category"]
        return ("HC" if cat == "HC" else f"Kat. {cat}") if de else (
            "HC" if cat == "HC" else f"Cat {cat}")
    if key.startswith("power_pb_") and context.get("value_w") is not None:
        return f"{_fmt_num(context['value_w'], de)} W"
    if key == "eftp_up" and context.get("value_w") is not None:
        return f"{_fmt_num(context['value_w'], de)} W"
    return None


# ── Orchestrator ─────────────────────────────────────────────────────────

async def get_achievements(db: AsyncSession, user_id: int, lang: str = "en") -> dict:
    """Detect, persist, and return unlocked + locked-with-progress achievements."""
    de = lang == "de"
    now = datetime.now(timezone.utc)

    existing_rows = (
        (await db.execute(select(Achievement).where(Achievement.user_id == user_id)))
        .scalars().all()
    )
    by_key: dict[str, Achievement] = {r.key: r for r in existing_rows}

    # 1. Rides (chronological, cycling only)
    ride_res = await db.execute(
        select(Activity.id, Activity.started_at, Activity.distance_meters,
               Activity.duration_seconds, Activity.elevation_gain_m, Activity.title)
        .where(Activity.user_id == user_id, Activity.sport == "cycling")
        .order_by(Activity.started_at.asc())
    )
    rides = [RideRow(r[0], r[1], r[2], r[3], r[4], r[5]) for r in ride_res.all()]

    # 2. Ride work (kJ) from stream scalars
    kj_res = await db.execute(
        select(ActivityStream.activity_id, Activity.started_at, ActivityStream.total_kj)
        .join(Activity, Activity.id == ActivityStream.activity_id)
        .where(ActivityStream.user_id == user_id, Activity.sport == "cycling",
               ActivityStream.total_kj.isnot(None))
        .order_by(Activity.started_at.asc())
    )
    kj_rows: list[tuple[int, datetime, float]] = [tuple(r) for r in kj_res.all()]

    # 3. PMC total series (365d window)
    pmc = await pmc_service.compute_user_pmc(db, user_id, 365)
    total_series: list[dict] = pmc.get("total", [])
    current_ctl = float(total_series[-1]["ctl"]) if total_series else None

    # 4. Detected unlocks from pure helpers
    detected: dict[str, dict[str, Any]] = {}
    detected.update(detect_ride_milestones(rides))
    detected.update(detect_kj_milestone(kj_rows))
    detected.update(detect_ctl_milestones(total_series))

    # 5. Power breakthroughs — REUSE the conservative detector over full history
    if rides:
        events = await detect_breakthroughs(
            db, user_id, lang=lang, range_start=rides[0].started_at,
        )
        for ev in reversed(events):  # oldest first → earliest unlock wins
            if ev["kind"] == "power_pb":
                key = _PB_DURATION_KEYS.get(ev["duration_s"])
            elif ev["kind"] == "eftp_shift":
                key = "eftp_up"
            else:
                key = None
            if key is None:
                continue
            when = datetime.fromisoformat(ev["date"]).replace(tzinfo=timezone.utc)
            if key not in detected:
                detected[key] = {
                    "unlocked_at": when,
                    "context": {"activity_id": ev["activity_id"],
                                "value_w": ev["value_w"]},
                }
            elif ev["value_w"] > detected[key]["context"].get("value_w", 0):
                # keep earliest unlock date, surface the best watts since
                detected[key]["context"]["value_w"] = ev["value_w"]

    # 6. Incremental climb scan (altitude streams → Cat 4+ climb, total ascent)
    scan = by_key.get(CLIMB_SCAN_KEY)
    scan_ctx: dict[str, Any] = dict(scan.context or {}) if scan is not None else {}
    max_scanned = int(scan_ctx.get("max_activity_id", 0))
    stream_res = await db.execute(
        select(ActivityStream.activity_id, Activity.started_at, ActivityStream.streams)
        .join(Activity, Activity.id == ActivityStream.activity_id)
        .where(ActivityStream.user_id == user_id, Activity.sport == "cycling",
               ActivityStream.activity_id > max_scanned)
        .order_by(Activity.started_at.asc())
    )
    new_streams = stream_res.all()
    if new_streams:
        ascent_total = float(scan_ctx.get("ascent_m", 0.0))
        best_score = scan_ctx.get("best_score")
        best_climb = scan_ctx.get("best_climb")
        for activity_id, started_at, streams in new_streams:
            streams = streams or {}
            ascent, ride_best = scan_ride_for_climbs(
                streams.get("altitude"), streams.get("distance"),
            )
            ascent_total += ascent
            max_scanned = max(max_scanned, int(activity_id))
            if ride_best is not None and (
                best_score is None or ride_best["score"] > best_score
            ):
                best_score = ride_best["score"]
                best_climb = ride_best
            if (
                ride_best is not None
                and ride_best["category"] != "uncat"
                and "first_cat_climb" not in detected
                and "first_cat_climb" not in by_key
            ):
                detected["first_cat_climb"] = {
                    "unlocked_at": started_at,
                    "context": {"activity_id": int(activity_id), **ride_best},
                }
        scan_ctx = {
            "max_activity_id": max_scanned,
            "ascent_m": round(ascent_total, 1),
            "best_score": best_score,
            "best_climb": best_climb,
            "scanned": int(scan_ctx.get("scanned", 0)) + len(new_streams),
        }
        if scan is None:
            db.add(Achievement(user_id=user_id, key=CLIMB_SCAN_KEY,
                               unlocked_at=now, context=scan_ctx))
        else:
            scan.context = scan_ctx

    # 7. Upsert unlocks
    changed = bool(new_streams)
    for key, hit in detected.items():
        row = by_key.get(key)
        if row is None:
            row = Achievement(
                user_id=user_id, key=key,
                unlocked_at=hit["unlocked_at"], context=hit["context"],
            )
            row.created_at = now  # not yet server-defaulted; used for freshness below
            db.add(row)
            by_key[key] = row
            changed = True
        elif key == "longest_ride" and (
            (hit["context"].get("km") or 0) > ((row.context or {}).get("km") or 0)
        ):
            row.unlocked_at = hit["unlocked_at"]
            row.context = hit["context"]
            changed = True
        elif key.startswith("power_pb_") or key == "eftp_up":
            new_w = hit["context"].get("value_w") or 0
            if new_w > ((row.context or {}).get("value_w") or 0):
                row.context = {**(row.context or {}), "value_w": new_w}
                changed = True
    if changed:
        await db.commit()

    # 8. Build payload
    n_rides = len(rides)
    best_km = max((r.distance_m or 0) / 1000 for r in rides) if rides else None
    best_kj = max((k[2] for k in kj_rows), default=None)
    climb_scanned = bool(scan_ctx.get("scanned"))
    best_climb_score = scan_ctx.get("best_score") if climb_scanned else None

    unlocked: list[dict[str, Any]] = []
    in_progress: list[dict[str, Any]] = []
    for d in CATALOG:
        row = by_key.get(d.key)
        title = d.title_de if de else d.title_en
        detail = d.detail_de if de else d.detail_en
        if row is not None:
            created = row.created_at or now
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            fresh = (
                (now - created) <= timedelta(days=FRESH_CREATED_DAYS)
                and (now - row.unlocked_at) <= timedelta(days=FRESH_EVENT_DAYS)
            )
            unlocked.append({
                "key": d.key, "icon": d.icon, "title": title, "detail": detail,
                "unlocked_at": row.unlocked_at.date().isoformat(),
                "value_label": unlocked_value_label(d.key, row.context, de),
                "fresh": fresh,
            })
        else:
            progress = build_progress(
                d.key, n_rides=n_rides, best_km=best_km, best_kj=best_kj,
                current_ctl=current_ctl, best_climb_score=best_climb_score, de=de,
            )
            pct = (
                max(0.0, min(1.0, progress["current"] / progress["target"]))
                if progress and progress["target"] else None
            )
            in_progress.append({
                "key": d.key, "icon": d.icon, "title": title, "detail": detail,
                "progress": progress, "pct": pct,
            })

    unlocked.sort(key=lambda u: u["unlocked_at"], reverse=True)
    in_progress.sort(key=lambda p: (p["pct"] is None, -(p["pct"] or 0)))

    total_km = sum((r.distance_m or 0) for r in rides) / 1000
    total_hours = sum((r.duration_s or 0) for r in rides) / 3600
    total_kj = sum(k[2] for k in kj_rows) if kj_rows else None

    return {
        "unlocked": unlocked,
        "in_progress": in_progress,
        "counts": {"unlocked": len(unlocked), "total": len(CATALOG)},
        "latest": unlocked[0] if unlocked else None,
        "all_time": {
            "rides": n_rides,
            "km": round(total_km, 1) if rides else None,
            "hours": round(total_hours, 1) if rides else None,
            "kj": round(total_kj) if total_kj is not None else None,
            "ascent_m": (
                round(float(scan_ctx["ascent_m"]))
                if climb_scanned and scan_ctx.get("ascent_m") is not None else None
            ),
        },
        # Both come off the ride scan this function already did, so they are the
        # same rides the totals above are made of rather than a second source
        # that can disagree with them.
        "consistency": weekly_consistency(rides, now),
        # THREE GRAINS OF ONE FACT — when this rider actually rides. All three
        # come off the same `rides` scan as the totals above, so the year on
        # the season card and the lifetime km in the dock cannot disagree.
        # THREE GRAINS THE CARD CAN ZOOM BETWEEN, each one the next unit
        # finer: a season is drawn as months, a month as weeks, a week as
        # days. `consistency.weeks` above is the same series the week grain
        # slices, so the two cannot disagree.
        "rhythm": {
            "months": monthly_rhythm(rides, now),
            "days": daily_rhythm(rides, now),
            "season": season_compare(rides, now),
        },
        "biggest_day": biggest_day(rides),
    }
