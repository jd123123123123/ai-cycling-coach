"""How big was this ride — for the rider who did it?

── WHY THIS EXISTS ─────────────────────────────────────────────────────────

A crew post that reads `50,8 km · 132 hm · 2:24 h · 21,3 km/h` is Strava's
post with three friends instead of three thousand. Those four numbers are the
ride measured against the metric system. They are not the ride measured
against the person, and the person is the only frame that makes 50 km mean
anything: it is a warm-up for one rider in the crew and the biggest thing
another has done since spring.

Strava cannot say which, because it ranks a ride against other people. This
app holds each rider's own history, so it can rank the ride against the rider.
That is the whole idea here, and everything below is in service of saying it
only when it is true.

── AT MOST ONE STATEMENT, OFTEN NONE ───────────────────────────────────────

A feed where every post carries a superlative is a feed where none of them
mean anything. So each ride gets at most one line — the most significant one —
and the bar is deliberately high: the ride has to top at least two months of
that rider's own riding, measured against at least ten of their own prior
rides. Ordinary rides get `None` and the card prints the four numbers alone,
which is the correct thing for an ordinary ride.

── AND IT NEVER COMPARES ON A FIELD THE RIDER DOES NOT HAVE ────────────────

Most rides in this app carry no power at all, and many carry no elevation:
a power-based "relative effort" would be null for the majority of the feed and
would quietly exclude every rider without a power meter from ever being seen.
So the ranked statements are built on distance and duration first — which
every ride has — and elevation only participates when the ride AND enough of
the rider's own history actually carry it.

── BATCHED, LIKE `crew_records` ────────────────────────────────────────────

One query reads the trailing history of every rider on the page, grouped by
rider in Python. A feed page is twelve rides across several riders; a loop
here would be twelve history reads to decorate a list.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from statistics import median
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity

# ── How far back "their own normal" reaches ────────────────────────────────
#: Under a year ON PURPOSE: the statements name a month ("seit Mai"), and a
#: full 365-day window could name the same month twice.
WINDOW_DAYS = 330

# ── When a rider has a "normal" at all ─────────────────────────────────────
#: A rider with four rides in the system has no normal, and a superlative
#: against four rides is noise dressed as a fact.
MIN_PRIOR_RIDES = 10
#: Ten rides inside one fortnight is still not a baseline — the history has to
#: span real time before "longest since" can mean anything.
MIN_HISTORY_DAYS = 60
#: A week statement compares whole weeks, so it needs more weeks behind it.
MIN_WEEK_HISTORY_DAYS = 84

# ── When the fact is worth printing ────────────────────────────────────────
#: Topping last Tuesday is not news. Two months is the floor for every
#: "seit"-shaped statement.
MIN_GAP_DAYS = 60
#: BY HOW MUCH it has to beat what the rider has been doing lately. Without
#: this, a metronomic rider who always rides 30 km gets "Längste Fahrt in 6
#: Monaten" the day they ride 32 — technically a maximum, and worth nothing.
#: It also stops four consecutive big days each claiming the same record by a
#: kilometre: only the first one clears the margin.
MIN_MARGIN_PCT = 10.0

#: Below these, a personal maximum is an artefact of a short ride rather than
#: an achievement: nobody wants "Längste Fahrt seit Mai" on an 8 km spin
#: because the rider was ill for two months.
MIN_DISTANCE_M = 25_000.0
MIN_CLIMB_M = 400.0
MIN_WEEK_DISTANCE_M = 100_000.0

# ── The relative statement, for rides that set no record at all ────────────
RECENT_DAYS = 90
MIN_RECENT_RIDES = 8
#: 1.6× is roughly "an hour turned into an hour and forty" — visible to the
#: rider without being a record. Below that it is inside normal variation.
RELATIVE_MIN_RATIO = 1.6
RELATIVE_MIN_DURATION_S = 45 * 60
#: A rider whose usual ride is fifteen minutes has a median too small to
#: multiply meaningfully — 1.6× of nothing is nothing.
RELATIVE_MIN_MEDIAN_S = 20 * 60
#: The ratio only means something if this ride stands out of its own fortnight.
RELATIVE_STANDOUT_DAYS = 14

MONTHS_DE = (
    "",
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)

#: Statement kinds, ranked for the tie-break when two are equally old. A
#: distance record is the one a rider recognises fastest.
_KIND_RANK = {
    "longest_ride": 3,
    "biggest_climb": 2,
    "biggest_week": 1,
    "long_for_them": 0,
}


def _de_ratio(x: float) -> str:
    """1.75 → "1,8" — German decimal comma, one place."""
    return f"{x:.1f}".replace(".", ",")


def _months(days: int) -> int:
    return max(1, days // 30)


def _since_phrase(noun: str, since: date | None, gap_days: int) -> str | None:
    """"Längste Fahrt seit Mai" — or, when nothing in the window was bigger,
    "… in 7 Monaten", which claims only the history we actually hold."""
    if since is not None:
        return f"{noun} seit {MONTHS_DE[since.month]}"
    n = _months(gap_days)
    if n < 3:
        return None
    return f"{noun} in {n} Monaten"


def _last_at_least(
    prior: list[dict[str, Any]], field: str, value: float
) -> datetime | None:
    """When this rider last did at least this much. None → never, in window."""
    for p in reversed(prior):
        v = p[field]
        if v is not None and v >= value:
            return p["started_at"]
    return None


def _bigger_statement(
    ride: dict[str, Any],
    prior: list[dict[str, Any]],
    *,
    field: str,
    noun: str,
    kind: str,
    floor: float,
    unit: str,
) -> dict[str, Any] | None:
    """"Längste Fahrt seit Mai" / "Meiste Höhenmeter seit März".

    Only rides that carry `field` count as history: a rider whose watch stopped
    recording elevation for a month must not appear to have climbed nothing.
    """
    value = ride[field]
    if value is None or value < floor:
        return None
    with_field = [p for p in prior if p[field] is not None]
    if len(with_field) < MIN_PRIOR_RIDES:
        return None
    span = (ride["started_at"] - with_field[0]["started_at"]).days
    if span < MIN_HISTORY_DAYS:
        return None

    last = _last_at_least(with_field, field, value)
    gap_days = (ride["started_at"] - last).days if last else span
    if gap_days < MIN_GAP_DAYS:
        return None

    # THE BAR THAT MATTERS is not the all-time best — it is the biggest thing
    # the rider has done inside the span the statement claims. Beating it by a
    # rounding error is not the news the sentence promises.
    in_gap = [p[field] for p in with_field if last is None or p["started_at"] > last]
    if in_gap and value < max(in_gap) * (1 + MIN_MARGIN_PCT / 100):
        return None

    since = last.date() if last else None
    text = _since_phrase(noun, since, gap_days)
    if text is None:
        return None

    prior_best = max(in_gap) if in_gap else max(p[field] for p in with_field)
    return {
        "kind": kind,
        "text": text,
        "value": round(value, 1),
        "unit": unit,
        # The bar it cleared: the biggest thing in the window before it. Equal
        # to `value` only when the ride ties its own window best.
        "comparison": round(prior_best, 1),
        "since_date": since.isoformat() if since else None,
        "gap_days": gap_days,
        "sample_size": len(with_field),
    }


def _iso_week(d: datetime) -> tuple[int, int]:
    iso = d.isocalendar()
    return (iso[0], iso[1])


def _week_statement(
    ride: dict[str, Any], prior: list[dict[str, Any]], all_rides: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """"Größte Woche seit April" — the ride that made it the biggest week.

    Awarded to the rider's LAST ride of that week only, so a rider who rides
    Saturday and Sunday does not get the same sentence twice. `all_rides` is
    the rider's full window, not just the page: the Sunday ride owns the line
    even when only Saturday's post is on screen.
    """
    week = _iso_week(ride["started_at"])
    later_same_week = [
        r
        for r in all_rides
        if _iso_week(r["started_at"]) == week and r["started_at"] > ride["started_at"]
    ]
    if later_same_week:
        return None

    with_dist = [p for p in prior if p["distance_m"] is not None]
    if len(with_dist) < MIN_PRIOR_RIDES:
        return None
    span = (ride["started_at"] - with_dist[0]["started_at"]).days
    if span < MIN_WEEK_HISTORY_DAYS:
        return None

    totals: dict[tuple[int, int], float] = {}
    first_day: dict[tuple[int, int], datetime] = {}
    for r in all_rides:
        if r["distance_m"] is None or r["started_at"] > ride["started_at"]:
            continue
        w = _iso_week(r["started_at"])
        totals[w] = totals.get(w, 0.0) + r["distance_m"]
        if w not in first_day or r["started_at"] < first_day[w]:
            first_day[w] = r["started_at"]

    this_total = totals.get(week, 0.0)
    if this_total < MIN_WEEK_DISTANCE_M:
        return None

    prior_weeks = sorted(w for w in totals if w < week)
    if len(prior_weeks) < 8:
        return None
    beaten_by = [w for w in prior_weeks if totals[w] >= this_total]
    if beaten_by:
        last_w = beaten_by[-1]
        since_dt = first_day[last_w]
        gap_days = (ride["started_at"] - since_dt).days
        since = since_dt.date()
        in_gap = [totals[w] for w in prior_weeks if w > last_w]
    else:
        gap_days = span
        since = None
        in_gap = [totals[w] for w in prior_weeks]
    if gap_days < MIN_GAP_DAYS:
        return None
    if in_gap and this_total < max(in_gap) * (1 + MIN_MARGIN_PCT / 100):
        return None

    text = _since_phrase("Größte Woche", since, gap_days)
    if text is None:
        return None
    return {
        "kind": "biggest_week",
        "text": text,
        "value": round(this_total, 1),
        "unit": "m",
        "comparison": round(max(in_gap) if in_gap else max(
            totals[w] for w in prior_weeks
        ), 1),
        "since_date": since.isoformat() if since else None,
        "gap_days": gap_days,
        "sample_size": len(prior_weeks),
    }


def _relative_statement(
    ride: dict[str, Any], prior: list[dict[str, Any]]
) -> dict[str, Any] | None:
    """"1,8× so lang wie üblich" — for the ride that set no record but was
    still, for this rider, a much bigger day than a normal one.

    Duration, not TSS and not power: duration is the one number every ride in
    this database has, and a rider without a power meter must not be silently
    excluded from being seen.
    """
    dur = ride["duration_s"]
    if dur is None or dur < RELATIVE_MIN_DURATION_S:
        return None
    cutoff = ride["started_at"] - timedelta(days=RECENT_DAYS)
    recent = [
        p["duration_s"]
        for p in prior
        if p["duration_s"] is not None and p["started_at"] >= cutoff
    ]
    if len(recent) < MIN_RECENT_RIDES:
        return None
    # NOT ONE OF A RUN OF LONG DAYS. A rider on a training camp does not want
    # the same sentence on four consecutive posts; the fourth 3 h day is their
    # normal that week, whatever the 90-day median still says.
    fortnight = ride["started_at"] - timedelta(days=RELATIVE_STANDOUT_DAYS)
    if any(
        p["duration_s"] is not None
        and p["started_at"] >= fortnight
        and p["duration_s"] >= dur
        for p in prior
    ):
        return None
    med = median(recent)
    if med < RELATIVE_MIN_MEDIAN_S:
        return None
    ratio = dur / med
    if ratio < RELATIVE_MIN_RATIO:
        return None
    return {
        "kind": "long_for_them",
        "text": f"{_de_ratio(ratio)}× so lang wie üblich",
        "value": float(dur),
        "unit": "s",
        "comparison": round(med, 1),
        "since_date": None,
        "gap_days": None,
        "sample_size": len(recent),
    }


def _best(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The most significant statement: the one reaching furthest back. Kind
    breaks ties, so a ride that is both a distance record and a climbing
    record over the same span says the distance."""
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda c: (c["gap_days"] is not None, c["gap_days"] or 0, _KIND_RANK[c["kind"]]),
    )


async def context_for_rides(
    db: AsyncSession,
    *,
    user_ids: list[int],
    activity_ids: list[int],
    sports: frozenset[str],
) -> dict[int, dict[str, Any]]:
    """{activity_id → one context statement}, for the rides on a feed page.

    `sports` is passed in rather than restated here: the feed decides what
    counts as a ride, and a second copy of that set would eventually disagree
    with the first about a gravel ride.
    """
    if not user_ids or not activity_ids:
        return {}

    since = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    rows = (
        await db.execute(
            select(
                Activity.id,
                Activity.user_id,
                Activity.started_at,
                Activity.distance_meters,
                Activity.elevation_gain_m,
                Activity.duration_seconds,
            )
            .where(
                Activity.user_id.in_(user_ids),
                func.lower(Activity.sport).in_(sports),
                Activity.started_at >= since,
            )
            .order_by(Activity.user_id, Activity.started_at)
        )
    ).all()

    by_rider: dict[int, list[dict[str, Any]]] = {}
    for act_id, uid, started, dist, elev, dur in rows:
        if started is None:
            continue
        by_rider.setdefault(uid, []).append(
            {
                "id": act_id,
                "started_at": started,
                "distance_m": float(dist) if dist is not None else None,
                "elevation_m": float(elev) if elev is not None else None,
                "duration_s": int(dur) if dur is not None else None,
            }
        )

    wanted = set(activity_ids)
    out: dict[int, dict[str, Any]] = {}

    for rides in by_rider.values():
        # Chronological, so "prior" really is prior. The query orders by
        # started_at already; this is the guarantee written down.
        rides.sort(key=lambda r: r["started_at"])
        for i, ride in enumerate(rides):
            if ride["id"] not in wanted:
                continue
            prior = rides[:i]
            if len(prior) < MIN_PRIOR_RIDES:
                continue
            # Ten rides inside a fortnight is not a normal either — every
            # statement below, the ratio included, needs real time behind it.
            if (ride["started_at"] - prior[0]["started_at"]).days < MIN_HISTORY_DAYS:
                continue

            candidates = [
                c
                for c in (
                    _bigger_statement(
                        ride, prior,
                        field="distance_m", noun="Längste Fahrt",
                        kind="longest_ride", floor=MIN_DISTANCE_M, unit="m",
                    ),
                    _bigger_statement(
                        ride, prior,
                        field="elevation_m", noun="Meiste Höhenmeter",
                        kind="biggest_climb", floor=MIN_CLIMB_M, unit="m",
                    ),
                    _week_statement(ride, prior, rides),
                    _relative_statement(ride, prior),
                )
                if c is not None
            ]
            best = _best(candidates)
            if best is not None:
                out[ride["id"]] = best

    return out
