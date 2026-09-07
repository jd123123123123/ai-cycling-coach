"""What a crew ride was FOR THE RIDER WHO DID IT.

These tests are mostly about the cases where the answer must be NOTHING: the
value of the line on the card comes entirely from how rarely it appears.

Time is frozen at a known Sunday so the ISO-week arithmetic behind the
"Größte Woche" statement is deterministic.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.ride_context import (
    MIN_PRIOR_RIDES,
    context_for_rides,
)

NOW = datetime(2026, 6, 14, 12, 0, tzinfo=timezone.utc)  # a Sunday
SPORTS = frozenset({"cycling"})


class FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class FakeDb:
    """Stands in for the ONE query this service is allowed to make."""

    def __init__(self, rows):
        self.rows = rows
        self.calls = 0

    async def execute(self, _stmt):
        self.calls += 1
        return FakeResult(self.rows)


def row(act_id, uid, days_ago, km=30.0, elev=None, minutes=60):
    """Query-order tuple: id, user_id, started_at, distance, elevation, duration."""
    return (
        act_id,
        uid,
        NOW - timedelta(days=days_ago),
        km * 1000 if km is not None else None,
        elev,
        minutes * 60 if minutes is not None else None,
    )


async def run(rows, activity_ids, user_ids=(1,)):
    db = FakeDb(rows)
    out = await context_for_rides(
        db, user_ids=list(user_ids), activity_ids=list(activity_ids), sports=SPORTS
    )
    return out, db


def twice_weekly(uid=1, *, weeks=28, km=30.0, minutes=60, elev=None, start_id=1):
    """A plain rider: two 30 km / 1 h rides a week for ~200 days."""
    rows = []
    aid = start_id
    for w in range(1, weeks + 1):
        for offset in (0, 3):
            rows.append(row(aid, uid, w * 7 + offset, km=km, elev=elev, minutes=minutes))
            aid += 1
    return rows


# ── The statement that must appear ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_genuinely_longest_ride_in_months_says_so():
    """80 km, when the last ride that long was in February: that is the fact
    the rider wants said, and it is invisible to a feed that only knows km."""
    history = twice_weekly()
    old_big = row(900, 1, 120, km=90.0)          # the bar it clears
    today = row(99, 1, 0, km=80.0, minutes=180)
    out, _ = await run([*history, old_big, today], [99])

    ctx = out[99]
    assert ctx["kind"] == "longest_ride"
    assert ctx["text"] == "Längste Fahrt seit Februar"
    assert ctx["since_date"] == (NOW - timedelta(days=120)).date().isoformat()
    assert ctx["gap_days"] == 120
    assert ctx["value"] == 80000.0
    # The bar it cleared is the biggest ride INSIDE the span it claims, not the
    # older 90 km ride that ended the span.
    assert ctx["comparison"] == 30000.0
    assert ctx["sample_size"] >= MIN_PRIOR_RIDES


@pytest.mark.asyncio
async def test_a_ride_with_no_power_and_no_elevation_still_gets_a_statement():
    """The trap this repo has hit twice: a rider without a power meter must not
    drop out of the comparison. Nothing here reads power at all, and elevation
    is null on every row below."""
    history = twice_weekly(elev=None)
    today = row(99, 1, 0, km=95.0, elev=None, minutes=240)
    out, _ = await run([*history, today], [99])

    assert out[99]["kind"] == "longest_ride"
    assert out[99]["text"] == "Längste Fahrt in 6 Monaten"   # nothing bigger, ever
    assert out[99]["since_date"] is None


@pytest.mark.asyncio
async def test_a_long_day_that_sets_no_record_is_framed_against_their_normal():
    """30 km is not a record for this rider. Two hours, when they normally ride
    one, still is a much bigger day than their normal — and that is sayable."""
    history = twice_weekly(km=30.0, minutes=60)
    today = row(99, 1, 0, km=30.0, minutes=120)
    out, _ = await run([*history, today], [99])

    ctx = out[99]
    assert ctx["kind"] == "long_for_them"
    assert ctx["text"] == "2,0× so lang wie üblich"
    assert ctx["comparison"] == 3600.0
    assert ctx["gap_days"] is None


@pytest.mark.asyncio
async def test_elevation_earns_its_own_statement_when_the_history_has_it():
    history = twice_weekly(km=30.0, elev=200.0)
    today = row(99, 1, 0, km=30.0, elev=1400.0, minutes=90)
    out, _ = await run([*history, today], [99])

    assert out[99]["kind"] == "biggest_climb"
    assert out[99]["text"].startswith("Meiste Höhenmeter")
    assert out[99]["value"] == 1400.0


# ── The many cases that must say nothing ───────────────────────────────────


@pytest.mark.asyncio
async def test_a_rider_with_too_little_history_gets_nothing():
    """Four rides in the system is not a normal, and a superlative measured
    against four rides is noise dressed as a fact."""
    history = [row(i, 1, 40 - i * 8, km=20.0) for i in range(4)]
    today = row(99, 1, 0, km=140.0, minutes=300)
    out, _ = await run([*history, today], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_ten_rides_crammed_into_two_weeks_is_still_not_a_baseline():
    """Enough rides, not enough time: "longest since" needs a `since`."""
    history = [row(i, 1, 14 - i, km=20.0) for i in range(12)]
    today = row(99, 1, 0, km=140.0, minutes=300)
    out, _ = await run([*history, today], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_an_ordinary_ride_says_nothing():
    """The load-bearing test. Most posts must carry no line at all."""
    history = twice_weekly(km=30.0, minutes=60)
    today = row(99, 1, 0, km=32.0, minutes=65)
    out, _ = await run([*history, today], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_topping_last_week_is_not_news():
    """A record that reaches back eleven days is not a fact worth printing."""
    history = twice_weekly(km=30.0)
    recent_big = row(900, 1, 11, km=78.0, minutes=170)
    today = row(99, 1, 0, km=80.0, minutes=90)
    out, _ = await run([*history, recent_big, today], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_a_personal_best_on_a_tiny_ride_is_suppressed():
    """A rider coming back from two months off must not get "Längste Fahrt
    seit April" for a 12 km spin."""
    history = twice_weekly(km=8.0, minutes=25)
    today = row(99, 1, 0, km=12.0, minutes=35)
    out, _ = await run([*history, today], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_elevation_is_ignored_when_the_history_does_not_carry_it():
    """A watch that only recently started recording ascent must not make every
    ride a climbing record."""
    history = twice_weekly(km=30.0, elev=None)
    today = row(99, 1, 0, km=30.0, elev=1600.0, minutes=90)
    out, _ = await run([*history, today], [99])
    assert out == {}


# ── One statement per ride, and one query per page ─────────────────────────


@pytest.mark.asyncio
async def test_the_biggest_week_is_claimed_once_by_its_last_ride():
    """Saturday and Sunday of the same week must not both say "Größte Woche"."""
    history = twice_weekly(km=30.0)             # 60 km weeks
    sat = row(900, 1, 1, km=80.0, minutes=210)
    sun = row(99, 1, 0, km=62.0, minutes=180)
    out, _ = await run([*history, sat, sun], [900, 99])

    assert out[99]["kind"] == "biggest_week"
    assert out[99]["text"] == "Größte Woche in 6 Monaten"
    assert out[99]["value"] == 142000.0
    # Saturday owns the distance record instead — never the week.
    assert out[900]["kind"] == "longest_ride"


@pytest.mark.asyncio
async def test_a_ride_never_carries_more_than_one_statement():
    history = twice_weekly(km=30.0, elev=200.0)
    today = row(99, 1, 0, km=150.0, elev=2000.0, minutes=360)
    out, _ = await run([*history, today], [99])
    assert set(out[99]) == {
        "kind", "text", "value", "unit", "comparison",
        "since_date", "gap_days", "sample_size",
    }
    # Distance wins the tie against the climb over the same span.
    assert out[99]["kind"] == "longest_ride"


@pytest.mark.asyncio
async def test_a_whole_page_of_several_riders_costs_exactly_one_query():
    """Twelve posts across three riders. A loop here would be twelve history
    reads to decorate a list — see the module docstring."""
    rows = []
    page = []
    for uid in (1, 2, 3):
        rows += twice_weekly(uid=uid, start_id=uid * 1000)
        for k in range(4):
            aid = uid * 100 + k
            rows.append(row(aid, uid, k, km=70.0 + k, minutes=180))
            page.append(aid)
    out, db = await run(rows, page, user_ids=(1, 2, 3))

    assert db.calls == 1
    assert len(page) == 12
    # Two of each rider's four big days say something: the first one (a
    # distance record) and the last (which completes the biggest week). The two
    # in between are more of the same, and say nothing.
    assert len(out) == 6
    assert {c["kind"] for c in out.values()} == {"longest_ride", "biggest_week"}


@pytest.mark.asyncio
async def test_only_rides_on_the_page_are_answered_for():
    history = twice_weekly()
    today = row(99, 1, 0, km=95.0, minutes=240)
    out, _ = await run([*history, today], [12345])
    assert out == {}


@pytest.mark.asyncio
async def test_no_riders_or_no_rides_short_circuits():
    db = FakeDb([])
    assert await context_for_rides(db, user_ids=[], activity_ids=[1], sports=SPORTS) == {}
    assert await context_for_rides(db, user_ids=[1], activity_ids=[], sports=SPORTS) == {}
    assert db.calls == 0
