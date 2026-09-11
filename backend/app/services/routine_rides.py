"""Which rides are ROUTINE — and why, in a sentence the rider can argue with.

── THE PROBLEM, AND WHY THE OBVIOUS FIX IS THE WRONG ONE ───────────────────

A crew-mate commutes by bike twice a day and the feed becomes his calendar:

    2026-08-25 02:58   13.1 km  31 min   Nachtradfahrt MdRzA
    2026-08-25 14:11   17.7 km  41 min   Diepholz Radfahren
    2026-08-26 02:57   13.2 km  32 min   Steinfeld (Oldenburg) Radfahren
    2026-08-26 14:07   17.7 km  41 min   Diepholz Radfahren
    ...

The tempting fix is a distance threshold, and it was measured against his real
last-40 rides: hiding everything under 15 km removes 18 of the 40 — including
ROUVY interval sessions and a 12.1 km mountain effort — and still only catches
ONE of his two commute legs, because the other is 17.7 km. Under 20 km removes
26 of 40. A threshold does not know the difference between short and repeated.

**The signal is repetition, not length.** Two legs, each at its own distance,
each at its own hour, on weekdays, over and over. That is what this module
looks for.

── WHAT THIS MODULE DOES NOT DO ────────────────────────────────────────────

It never removes a ride from anything. It returns a MARK and a REASON per
activity id, and every function here returns a verdict for every ride it was
given — `detect_routine` returning fewer verdicts than it got rides would be a
bug, and `test_routine_rides.py` asserts it does not happen. A commute is real
training: it must keep counting toward TSS, CTL/ATL, weekly totals, streaks and
Eddington, all of which read `activities` directly and know nothing about this
module. "Routine" means *not newsworthy in a social feed*. It never means
*deleted*, and there is deliberately no query in this file that filters rides
out at the source — the only place a ride is dropped is the feed endpoint, one
call site, under the VIEWER's own preference.

── THE PARAMETERS, AND WHY EACH ────────────────────────────────────────────

Every number below was chosen against the production evidence above, not by
taste. `DEFAULT_PARAMS` documents each in place.

── THE HONEST LIMIT ────────────────────────────────────────────────────────

A rider who does the same 40 km trainer route three Tuesdays at 19:00 will be
called routine by this detector, and that may not be what they meant. There is
no signal in distance, time and weekday that separates "commute" from
"disciplined repetition" — so rather than guess, this returns the reason it
saw ("5 fast gleiche Fahrten in 60 Tagen: 13,1 km, Start gegen 04:55 Uhr,
werktags") and the rider can overrule any single ride forever, in either
direction, via `ride_routine_overrides`. A detector that cannot be argued with
is a detector that is wrong in silence.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Collection, Iterable, Sequence
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.models.athlete_profile import AthleteProfile
from app.models.routine_override import RideRoutineOverride
from app.services.athlete_time import DEFAULT_ATHLETE_TZ

# Sports counted as "a ride". Passed in by callers that have their own list
# (the crew feed does — see `app/api/crew_chat.py`), mirroring how
# `services/ride_context.context_for_rides` takes its `sports` argument rather
# than reaching into the API layer for it.
CYCLING_SPORTS: frozenset[str] = frozenset(
    {
        "cycling",
        "ride",
        "bike",
        "biking",
        "virtual_ride",
        "virtualride",
        "indoor_cycling",
        "gravel_cycling",
        "mountain_biking",
        "road_cycling",
    }
)


# ──────────────────────────────────────────────────────────────────────
# Parameters
# ──────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoutineParams:
    """Every threshold the detector uses, in one place, each with its reason."""

    #: How far back to look. Eight to nine working weeks: long enough that a
    #: leg ridden twice a week clears the 3-occurrence bar, short enough that a
    #: new job or a move stops looking like routine within two months rather
    #: than haunting the feed for a year.
    window_days: int = 60

    #: Distance match, RELATIVE. 10 % of 13 km is 1.3 km; 10 % of 130 km is
    #: 13 km — an absolute tolerance is meaningless across that range. At 12 %
    #: the evidence's 13.1/13.2 km pair (0.8 % apart) clusters, while 13.1 and
    #: 17.7 km (35 % apart) stay two separate legs, which is what they are.
    distance_rel_tol: float = 0.12

    #: …with an absolute floor, so a 2 km loop is not held to a ±240 m window
    #: that GPS noise alone can break.
    distance_abs_floor_m: float = 300.0

    #: Start-of-day match, in minutes of the RIDER's local clock. His evening
    #: leg starts anywhere from 13:11 to 14:31 UTC — an 80-minute spread, from
    #: meetings and traffic. Anything under ~60 minutes splits one real commute
    #: into a cluster of 3 and a cluster of 2 and finds neither.
    start_tol_minutes: int = 75

    #: Three is a pattern. Two is a coincidence, and hiding a coincidence is
    #: how a detector loses the rider's trust on its first day.
    min_occurrences: int = 3

    #: …unless the rider TITLED them. Two rides both carrying "MdRzA" are not a
    #: coincidence, they are a statement. Still never a marker alone: there must
    #: be a cluster of at least two matching rides, because a single tagged ride
    #: proves only that the rider names things.
    min_occurrences_marked: int = 2
    marked_members_required: int = 2

    #: A weekday 30 km at 17:00 and a Saturday 30 km at 17:00 are not the same
    #: thing, and merging them invents a pattern out of two different habits.
    split_weekend: bool = True

    #: A ride below this is a move between buildings, not something to reason
    #: about; and one without a recorded distance cannot be clustered at all.
    min_distance_m: float = 500.0

    #: THE GUARD AGAINST HIDING THE BEST RIDES. A cluster whose distance is more
    #: than this multiple of the rider's own median ride in the window is never
    #: routine, however often it repeats: three 200 km days in two months is a
    #: remarkable two months, not a habit to suppress. Measured against the
    #: rider's own median, so it means "far bigger than what YOU usually do".
    max_median_multiple: float = 2.0


DEFAULT_PARAMS = RoutineParams()


# ──────────────────────────────────────────────────────────────────────
# Title markers
# ──────────────────────────────────────────────────────────────────────

#: German cyclists' shorthand and the plain phrases riders actually type.
#: A STRONG signal, never the ONLY one (see `min_occurrences_marked`), because
#: most riders never tag anything and a detector that only catches the tidy
#: ones catches nobody.
_MARKER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bmdrza\b"),                 # mit dem Rad zur Arbeit
    re.compile(r"\bmdrnh\b"),                 # mit dem Rad nach Hause
    re.compile(r"mit dem (rad|fahrrad) zur arbeit"),
    re.compile(r"mit dem (rad|fahrrad) nach hause"),
    re.compile(r"arbeitsweg"),
    re.compile(r"heimweg"),
    re.compile(r"pendel"),                    # pendeln, Pendelfahrt, Pendler
    re.compile(r"\bzur arbeit\b"),
    re.compile(r"\bnach hause\b"),
    re.compile(r"\bins? b(ü|ue)ro\b"),
    re.compile(r"\bcommute\b|\bcommuting\b"),
    re.compile(r"\bto work\b|\bfrom work\b"),
)


def commute_marker(title: str | None) -> str | None:
    """The commute marker in a ride title, or None.

    Returns the matched text so the reason line can quote it back — "der Titel
    nennt den Arbeitsweg (MdRzA)" is arguable; "wir haben ein Muster erkannt"
    is not.
    """
    if not title:
        return None
    low = title.lower()
    for pat in _MARKER_PATTERNS:
        m = pat.search(low)
        if m:
            # Quote the rider's own casing, not the lowercased haystack.
            return title[m.start(): m.end()]
    return None


# ──────────────────────────────────────────────────────────────────────
# Values
# ──────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class RideFacts:
    """The only facts the detector needs. Deliberately not an ORM row, so the
    core is testable without a database and cannot accidentally read anything
    else off an activity."""

    activity_id: int
    started_at: datetime          # UTC; naive is treated as UTC (storage rule)
    distance_m: float | None
    duration_s: int | None = None
    title: str | None = None


@dataclass(frozen=True)
class RoutineCluster:
    """A repeated shape in one rider's riding."""

    key: str
    occurrences: int
    #: Centroid distance in metres and centroid start, in minutes past local
    #: midnight in the RIDER's timezone.
    distance_m: float
    start_minute_local: int
    #: "werktags" | "wochenende" | "alle" (the last only when weekend splitting
    #: is switched off).
    weekday_class: str
    #: How many members carry a commute marker in the title.
    marked: int
    #: The marker text to quote, if any member carried one.
    marker_text: str | None
    is_routine: bool
    activity_ids: tuple[int, ...]
    first_at: datetime
    last_at: datetime


@dataclass(frozen=True)
class RoutineVerdict:
    """What we say about ONE ride, and why."""

    activity_id: int
    is_routine: bool
    cluster_key: str | None
    occurrences: int
    #: Plain German, built from the resolved numbers — so a rider disagrees
    #: with a specific claim, not with a black box.
    reason: str
    #: "detector" | "rider". `rider` means an override in
    #: `ride_routine_overrides` decided this, and the detector's opinion was
    #: not consulted.
    decided_by: str = "detector"


@dataclass(frozen=True)
class RoutineResult:
    verdicts: dict[int, RoutineVerdict]
    clusters: dict[str, RoutineCluster]
    #: The rider's median ride distance in the window — the yardstick behind
    #: `max_median_multiple`, carried out so the preview screen can show it.
    median_distance_m: float | None = None
    considered: int = 0


# ──────────────────────────────────────────────────────────────────────
# German phrasing
# ──────────────────────────────────────────────────────────────────────


def _km(metres: float) -> str:
    return f"{metres / 1000:.1f}".replace(".", ",") + " km"


def _clock(minute_of_day: int) -> str:
    m = minute_of_day % (24 * 60)
    return f"{m // 60:02d}:{m % 60:02d} Uhr"


def _weekday_word(weekday_class: str) -> str:
    return {
        "werktags": "werktags",
        "wochenende": "am Wochenende",
    }.get(weekday_class, "an allen Wochentagen")


# ──────────────────────────────────────────────────────────────────────
# Clustering
# ──────────────────────────────────────────────────────────────────────


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _local_minute(dt: datetime, tz: ZoneInfo) -> int:
    local = _as_utc(dt).astimezone(tz)
    return local.hour * 60 + local.minute


def _local_weekday(dt: datetime, tz: ZoneInfo) -> int:
    return _as_utc(dt).astimezone(tz).weekday()


def _minute_delta(a: int, b: int) -> int:
    """Distance between two times of day, in minutes, wrapping at midnight —
    03:58 and 23:58 are four hours apart, not twenty."""
    raw = abs(a - b) % (24 * 60)
    return min(raw, 24 * 60 - raw)


@dataclass
class _Bucket:
    """Mutable accumulator; frozen into a RoutineCluster at the end."""

    distances: list[float] = field(default_factory=list)
    #: Start minutes, UNWRAPPED relative to the first member, so the mean of
    #: 23:50 and 00:10 is midnight rather than noon.
    minute_offsets: list[int] = field(default_factory=list)
    base_minute: int = 0
    weekday_class: str = "werktags"
    ids: list[int] = field(default_factory=list)
    times: list[datetime] = field(default_factory=list)
    markers: list[str] = field(default_factory=list)

    @property
    def centroid_distance(self) -> float:
        return sum(self.distances) / len(self.distances)

    @property
    def centroid_minute(self) -> int:
        mean_offset = sum(self.minute_offsets) / len(self.minute_offsets)
        return int(round(self.base_minute + mean_offset)) % (24 * 60)


def _weekday_class(weekday: int, params: RoutineParams) -> str:
    if not params.split_weekend:
        return "alle"
    return "wochenende" if weekday >= 5 else "werktags"


def detect_routine(
    rides: Sequence[RideFacts],
    *,
    tz: ZoneInfo = DEFAULT_ATHLETE_TZ,
    now: datetime | None = None,
    params: RoutineParams = DEFAULT_PARAMS,
) -> RoutineResult:
    """Cluster ONE rider's rides and mark the repeated ones.

    Pure: no database, no clock beyond `now`, deterministic for a given input
    order-independently (rides are sorted by start time first).

    Returns a verdict for EVERY ride passed in, routine or not — this function
    marks, it never filters. See the module docstring.
    """
    now = _as_utc(now or datetime.now(timezone.utc))
    window_start = now - timedelta(days=params.window_days)

    in_window = [
        r for r in rides
        if _as_utc(r.started_at) >= window_start
        and _as_utc(r.started_at) <= now + timedelta(hours=6)
    ]
    # Sorted so the clustering is a deterministic function of the SET of rides,
    # not of the order the database happened to return them in.
    in_window.sort(key=lambda r: (_as_utc(r.started_at), r.activity_id))

    clusterable = [
        r for r in in_window
        if r.distance_m is not None and r.distance_m >= params.min_distance_m
    ]

    distances = [r.distance_m for r in clusterable if r.distance_m is not None]
    median_distance = median(distances) if distances else None

    buckets: list[_Bucket] = []
    assignment: dict[int, int] = {}  # activity_id → bucket index

    for ride in clusterable:
        assert ride.distance_m is not None
        minute = _local_minute(ride.started_at, tz)
        wclass = _weekday_class(_local_weekday(ride.started_at, tz), params)

        best_idx: int | None = None
        best_score = float("inf")
        for idx, b in enumerate(buckets):
            if b.weekday_class != wclass:
                continue
            c_dist = b.centroid_distance
            tol = max(
                params.distance_rel_tol * max(c_dist, ride.distance_m),
                params.distance_abs_floor_m,
            )
            d_diff = abs(c_dist - ride.distance_m)
            if d_diff > tol:
                continue
            t_diff = _minute_delta(b.centroid_minute, minute)
            if t_diff > params.start_tol_minutes:
                continue
            score = d_diff / tol + t_diff / params.start_tol_minutes
            if score < best_score:
                best_score, best_idx = score, idx

        if best_idx is None:
            b = _Bucket(base_minute=minute, weekday_class=wclass)
            buckets.append(b)
            best_idx = len(buckets) - 1
        else:
            b = buckets[best_idx]

        offset = minute - b.base_minute
        # Fold into (-720, 720] so a midnight crossing does not drag the mean
        # halfway around the clock.
        offset = (offset + 720) % 1440 - 720
        b.distances.append(ride.distance_m)
        b.minute_offsets.append(offset)
        b.ids.append(ride.activity_id)
        b.times.append(_as_utc(ride.started_at))
        marker = commute_marker(ride.title)
        if marker:
            b.markers.append(marker)
        assignment[ride.activity_id] = best_idx

    clusters: dict[str, RoutineCluster] = {}
    keys_by_idx: dict[int, str] = {}
    for idx, b in enumerate(buckets):
        c_dist = b.centroid_distance
        c_min = b.centroid_minute
        key = f"{int(round(c_dist))}m-{c_min:04d}-{b.weekday_class}"
        n = len(b.ids)
        marked = len(b.markers)

        enough = n >= params.min_occurrences or (
            marked >= params.marked_members_required
            and n >= params.min_occurrences_marked
        )
        too_big = (
            median_distance is not None
            and median_distance > 0
            and c_dist > params.max_median_multiple * median_distance
        )
        is_routine = enough and not too_big

        clusters[key] = RoutineCluster(
            key=key,
            occurrences=n,
            distance_m=c_dist,
            start_minute_local=c_min,
            weekday_class=b.weekday_class,
            marked=marked,
            marker_text=b.markers[0] if b.markers else None,
            is_routine=is_routine,
            activity_ids=tuple(b.ids),
            first_at=min(b.times),
            last_at=max(b.times),
        )
        keys_by_idx[idx] = key

    verdicts: dict[int, RoutineVerdict] = {}
    for ride in rides:
        idx = assignment.get(ride.activity_id)
        if idx is None:
            verdicts[ride.activity_id] = RoutineVerdict(
                activity_id=ride.activity_id,
                is_routine=False,
                cluster_key=None,
                occurrences=0,
                reason=_reason_unclusterable(ride, params, window_start, now),
            )
            continue
        cluster = clusters[keys_by_idx[idx]]
        verdicts[ride.activity_id] = RoutineVerdict(
            activity_id=ride.activity_id,
            is_routine=cluster.is_routine,
            cluster_key=cluster.key,
            occurrences=cluster.occurrences,
            reason=_reason_for_cluster(cluster, params, median_distance),
        )

    return RoutineResult(
        verdicts=verdicts,
        clusters=clusters,
        median_distance_m=median_distance,
        considered=len(clusterable),
    )


def _reason_unclusterable(
    ride: RideFacts,
    params: RoutineParams,
    window_start: datetime,
    now: datetime,
) -> str:
    if ride.distance_m is None:
        return "Ohne aufgezeichnete Distanz lässt sich keine Wiederholung erkennen."
    if ride.distance_m < params.min_distance_m:
        return f"Zu kurz zum Vergleichen ({_km(ride.distance_m)})."
    if _as_utc(ride.started_at) < window_start:
        return (
            f"Älter als {params.window_days} Tage — außerhalb des Fensters, "
            "in dem nach Wiederholungen gesucht wird."
        )
    return "Keine vergleichbare Fahrt im Fenster."


def _reason_for_cluster(
    cluster: RoutineCluster,
    params: RoutineParams,
    median_distance_m: float | None,
) -> str:
    shape = (
        f"{_km(cluster.distance_m)}, Start gegen "
        f"{_clock(cluster.start_minute_local)}, {_weekday_word(cluster.weekday_class)}"
    )
    if cluster.is_routine:
        if (
            cluster.occurrences < params.min_occurrences
            and cluster.marked >= params.marked_members_required
        ):
            return (
                f"{cluster.occurrences} fast gleiche Fahrten in den letzten "
                f"{params.window_days} Tagen ({shape}) — und du hast sie selbst "
                f"als Arbeitsweg betitelt ({cluster.marker_text})."
            )
        line = (
            f"{cluster.occurrences} fast gleiche Fahrten in den letzten "
            f"{params.window_days} Tagen: {shape}."
        )
        if cluster.marker_text:
            line += f" Der Titel nennt den Arbeitsweg ({cluster.marker_text})."
        return line

    if (
        median_distance_m
        and cluster.distance_m > params.max_median_multiple * median_distance_m
    ):
        return (
            f"Wiederholt sich {cluster.occurrences}× ({shape}), ist mit "
            f"{_km(cluster.distance_m)} aber mehr als das "
            f"{params.max_median_multiple:.0f}-Fache deiner üblichen "
            f"{_km(median_distance_m)} — bleibt sichtbar."
        )
    if cluster.occurrences <= 1:
        return f"Keine vergleichbare Fahrt in den letzten {params.window_days} Tagen."
    return (
        f"Nur {cluster.occurrences} ähnliche Fahrten ({shape}). "
        f"Ab {params.min_occurrences} gilt das als Routine."
    )


# ──────────────────────────────────────────────────────────────────────
# The rider's own word beats the detector, in both directions
# ──────────────────────────────────────────────────────────────────────


def apply_override(verdict: RoutineVerdict, override: bool | None) -> RoutineVerdict:
    """`None` → the detector decides. `True` → the rider called it routine.
    `False` → the rider said this one WAS worth posting.

    An override outranks the detector permanently and in both directions; that
    is the whole point of storing it. Note the cluster key and occurrence count
    survive, so the preview can still show WHAT the detector thought while
    obeying the rider.
    """
    if override is None:
        return verdict
    return RoutineVerdict(
        activity_id=verdict.activity_id,
        is_routine=override,
        cluster_key=verdict.cluster_key,
        occurrences=verdict.occurrences,
        reason=(
            "Von dir als Routine markiert."
            if override
            else "Von dir als sehenswert markiert."
        ),
        decided_by="rider",
    )


# ──────────────────────────────────────────────────────────────────────
# Database layer
# ──────────────────────────────────────────────────────────────────────


async def _tz_by_user(db: AsyncSession, user_ids: Collection[int]) -> dict[int, ZoneInfo]:
    """Each rider's OWN timezone. A crew feed spans people, and "start time of
    day" only means anything in the clock the rider actually reads — the
    request-scoped `athlete_tz()` ContextVar is the VIEWER's, which is the
    wrong one for everybody else on the page."""
    out: dict[int, ZoneInfo] = {uid: DEFAULT_ATHLETE_TZ for uid in user_ids}
    if not user_ids:
        return out
    rows = (
        await db.execute(
            select(AthleteProfile.user_id, AthleteProfile.timezone).where(
                AthleteProfile.user_id.in_(list(user_ids))
            )
        )
    ).all()
    for uid, raw in rows:
        if not raw:
            continue
        try:
            out[uid] = ZoneInfo(raw)
        except Exception:
            pass  # a typo in the column must never break a feed
    return out


async def _overrides_for(
    db: AsyncSession, activity_ids: Collection[int]
) -> dict[int, bool]:
    if not activity_ids:
        return {}
    rows = (
        await db.execute(
            select(
                RideRoutineOverride.activity_id, RideRoutineOverride.is_routine
            ).where(RideRoutineOverride.activity_id.in_(list(activity_ids)))
        )
    ).all()
    return {aid: bool(flag) for aid, flag in rows}


async def _window_rides(
    db: AsyncSession,
    *,
    user_ids: Collection[int],
    sports: Collection[str],
    since: datetime,
) -> dict[int, list[RideFacts]]:
    """One query for every rider on the page — the same batching discipline as
    `crew_records.records_for_rides`, not a history read per post.

    Selects only the columns the detector needs. Nothing here filters by
    routineness: this reads the raw history, exactly as the training-load
    queries do.
    """
    if not user_ids:
        return {}
    from sqlalchemy import func as sa_func

    stmt = (
        select(
            Activity.id,
            Activity.user_id,
            Activity.started_at,
            Activity.distance_meters,
            Activity.duration_seconds,
            Activity.title,
        )
        .where(
            Activity.user_id.in_(list(user_ids)),
            Activity.started_at >= since,
            sa_func.lower(Activity.sport).in_(list(sports)),
        )
        .order_by(Activity.started_at.desc())
    )
    by_user: dict[int, list[RideFacts]] = {uid: [] for uid in user_ids}
    for aid, uid, started, dist, dur, title in (await db.execute(stmt)).all():
        by_user.setdefault(uid, []).append(
            RideFacts(
                activity_id=aid,
                started_at=started,
                distance_m=float(dist) if dist is not None else None,
                duration_s=int(dur) if dur is not None else None,
                title=title,
            )
        )
    return by_user


async def verdicts_for_rides(
    db: AsyncSession,
    *,
    user_ids: Collection[int],
    activity_ids: Collection[int],
    sports: Collection[str] = CYCLING_SPORTS,
    now: datetime | None = None,
    params: RoutineParams = DEFAULT_PARAMS,
) -> dict[int, RoutineVerdict]:
    """Verdicts for the rides on ONE page of a feed, batched.

    Two queries for the whole page plus one for the overrides, regardless of
    how many riders are on it. Rides whose id is not in `activity_ids` are
    still read — they are the evidence — but only the requested ids come back.
    """
    if not activity_ids:
        return {}
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    since = now_utc - timedelta(days=params.window_days)

    by_user = await _window_rides(db, user_ids=user_ids, sports=sports, since=since)
    tzs = await _tz_by_user(db, user_ids)
    overrides = await _overrides_for(db, activity_ids)

    wanted = set(activity_ids)
    out: dict[int, RoutineVerdict] = {}
    for uid, rides in by_user.items():
        if not rides:
            continue
        result = detect_routine(
            rides, tz=tzs.get(uid, DEFAULT_ATHLETE_TZ), now=now_utc, params=params
        )
        for aid, verdict in result.verdicts.items():
            if aid in wanted:
                out[aid] = apply_override(verdict, overrides.get(aid))
    return out


async def preview_for_user(
    db: AsyncSession,
    *,
    user_id: int,
    sports: Collection[str] = CYCLING_SPORTS,
    now: datetime | None = None,
    params: RoutineParams = DEFAULT_PARAMS,
) -> tuple[RoutineResult, dict[int, RoutineVerdict], dict[int, RideFacts]]:
    """Everything the profile screen needs to show what the switch would do.

    Returns the raw detector result, the verdicts AFTER overrides, and the ride
    facts by id so the caller can print a sample. Nothing is filtered away —
    the caller decides what to show.
    """
    now_utc = _as_utc(now or datetime.now(timezone.utc))
    since = now_utc - timedelta(days=params.window_days)
    rides = (
        await _window_rides(db, user_ids=[user_id], sports=sports, since=since)
    ).get(user_id, [])
    tz = (await _tz_by_user(db, [user_id])).get(user_id, DEFAULT_ATHLETE_TZ)
    result = detect_routine(rides, tz=tz, now=now_utc, params=params)
    overrides = await _overrides_for(db, [r.activity_id for r in rides])
    decided = {
        aid: apply_override(v, overrides.get(aid))
        for aid, v in result.verdicts.items()
    }
    return result, decided, {r.activity_id: r for r in rides}


async def get_override(
    db: AsyncSession, *, activity_id: int
) -> RideRoutineOverride | None:
    return (
        await db.execute(
            select(RideRoutineOverride).where(
                RideRoutineOverride.activity_id == activity_id
            )
        )
    ).scalar_one_or_none()


async def set_override(
    db: AsyncSession, *, user_id: int, activity_id: int, is_routine: bool | None
) -> None:
    """Store (or clear) the rider's own word on one ride.

    `None` deletes the row and hands the ride back to the detector — an
    override the rider cannot undo is a worse trap than the detector was.
    """
    row = await get_override(db, activity_id=activity_id)
    if is_routine is None:
        if row is not None:
            await db.delete(row)
        return
    if row is None:
        db.add(
            RideRoutineOverride(
                activity_id=activity_id, user_id=user_id, is_routine=is_routine
            )
        )
    else:
        row.is_routine = is_routine


def hidden_ids(verdicts: Iterable[RoutineVerdict]) -> set[int]:
    """Convenience for the ONE call site allowed to drop anything."""
    return {v.activity_id for v in verdicts if v.is_routine}
