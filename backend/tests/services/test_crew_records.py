"""Which rides in a crew feed earn the record chip.

The badge borrows `breakthrough_detector`'s thresholds ON PURPOSE — a crew chip
and the rider's own breakthrough card must never disagree about the same ride.
These tests are mostly about the cases where the answer must be NO.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.breakthrough_detector import MIN_PRIOR_RIDES, PB_MIN_GAIN_PCT
from app.services.crew_records import records_for_rides

NOW = datetime.now(timezone.utc)


class FakeResult:
    def __init__(self, rows): self._rows = rows
    def all(self): return self._rows


class FakeDb:
    """Stands in for the one query this service makes."""
    def __init__(self, rows): self.rows = rows
    async def execute(self, _stmt): return FakeResult(self.rows)


def row(act_id, uid, days_ago, watts_20m, watts_1m=None):
    curve = {"1200": watts_20m}
    if watts_1m is not None:
        curve["60"] = watts_1m
    return (act_id, uid, NOW - timedelta(days=days_ago), curve)


async def run(rows, activity_ids, user_ids=(1,)):
    return await records_for_rides(
        FakeDb(rows), user_ids=list(user_ids), activity_ids=list(activity_ids)
    )


@pytest.mark.asyncio
async def test_a_clear_new_best_earns_the_chip():
    """A gain over the 2 % floor but under the 5 % suspect line: believed on
    sight, no corroboration required."""
    history = [row(i, 1, 40 - i, 260) for i in range(MIN_PRIOR_RIDES + 1)]
    today = row(99, 1, 0, 270)          # +3.8 %
    out = await run([*history, today], [99])
    assert out[99]["value_w"] == 270
    assert out[99]["prior_best_w"] == 260
    assert out[99]["duration_s"] == 1200


@pytest.mark.asyncio
async def test_a_big_gain_IS_celebrated_once_a_second_ride_backs_it_up():
    """The other half of the corroboration rule: a genuine breakthrough is not
    suppressed forever, it is held until a ride near it confirms it."""
    history = [row(i, 1, 40 - i, 250) for i in range(MIN_PRIOR_RIDES)]
    confirming = row(90, 1, 3, 340)     # within 5 % of the new value
    today = row(99, 1, 0, 350)
    out = await run([*history, confirming, today], [99])
    assert out[99]["value_w"] == 350


@pytest.mark.asyncio
async def test_A_RIDER_WITH_NO_HISTORY_IS_NOT_A_RECORD_HOLDER():
    """Their first hard ride is not a breakthrough; it is their first ride."""
    out = await run([row(1, 1, 2, 250), row(99, 1, 0, 400)], [99])
    assert out == {}


@pytest.mark.asyncio
async def test_a_gain_under_the_threshold_is_not_news():
    history = [row(i, 1, 40 - i, 300) for i in range(MIN_PRIOR_RIDES + 1)]
    barely = row(99, 1, 0, 300 * (1 + (PB_MIN_GAIN_PCT - 0.5) / 100))
    assert await run([*history, barely], [99]) == {}


@pytest.mark.asyncio
async def test_A_CORRUPT_SPIKE_DOES_NOT_CELEBRATE():
    """A wildly-out-of-range jump needs a second ride near it before the app
    says anything — the corrupt-power-file case."""
    history = [row(i, 1, 40 - i, 250) for i in range(MIN_PRIOR_RIDES + 1)]
    absurd = row(99, 1, 0, 900)
    assert await run([*history, absurd], [99]) == {}


@pytest.mark.asyncio
async def test_only_rides_on_the_page_are_answered_for():
    """A record set three weeks ago is true and is not news."""
    history = [row(i, 1, 40 - i, 260) for i in range(MIN_PRIOR_RIDES + 1)]
    old_pb = row(50, 1, 20, 320)
    out = await run([*history, old_pb], [99])   # 99 is not in the rows at all
    assert out == {}


@pytest.mark.asyncio
async def test_THE_LONGEST_DURATION_WINS():
    """A card carries one chip, and a 20-minute best is the harder thing."""
    history = [row(i, 1, 40 - i, 260, watts_1m=400) for i in range(MIN_PRIOR_RIDES + 1)]
    both = row(99, 1, 0, 270, watts_1m=415)   # both inside the believable band
    out = await run([*history, both], [99])
    assert out[99]["duration_s"] == 1200


@pytest.mark.asyncio
async def test_riders_are_scored_against_their_own_history_only():
    """One rider's big numbers must not raise another's bar."""
    strong = [row(100 + i, 2, 40 - i, 400) for i in range(MIN_PRIOR_RIDES + 1)]
    mine = [row(i, 1, 40 - i, 200) for i in range(MIN_PRIOR_RIDES + 1)]
    today = row(99, 1, 0, 207)
    out = await run([*strong, *mine, today], [99], user_ids=(1, 2))
    assert out[99]["prior_best_w"] == 200


@pytest.mark.asyncio
async def test_nothing_asked_nothing_read():
    assert await records_for_rides(FakeDb([]), user_ids=[], activity_ids=[1]) == {}
    assert await records_for_rides(FakeDb([]), user_ids=[1], activity_ids=[]) == {}
