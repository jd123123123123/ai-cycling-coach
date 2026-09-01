"""The three grains behind the Fahrten dock's SAISON / MONAT / WOCHE switch.

Each grain has one way of quietly lying, and each has a test for it here:

- a chart that omits its empty buckets draws a season the rider did not have
- a boundary off by one hour moves a ride into the wrong month, week or day
- a ride whose device recorded no distance still happened, and dropping it
  makes the ride count disagree with the ride list on the same screen
- a headline that is scanned separately from the bars can drift away from them
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.achievement_service import RideRow
from app.services.ride_rhythm import MONTH_DAYS, WEEK_DAYS, build_rhythm

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)  # a Tuesday
TODAY = NOW.date()
GRAINS = ("season", "month", "week")

_next_id = iter(range(1, 10_000))


def ride(
    when: datetime,
    km: float | None = 40.0,
    minutes: int | None = 90,
    ascent: float | None = 300.0,
) -> RideRow:
    return RideRow(
        id=next(_next_id),
        started_at=when,
        distance_m=None if km is None else km * 1000,
        duration_s=None if minutes is None else minutes * 60,
        elevation_m=ascent,
    )


def day(offset: int, hour: int = 12) -> datetime:
    """`offset` days before today, at `hour` UTC."""
    d = TODAY - timedelta(days=offset)
    return datetime(d.year, d.month, d.day, hour, tzinfo=timezone.utc)


# ── the shape the frontend is built against ─────────────────────────────────

def test_the_payload_is_three_grains_with_identical_shape():
    out = build_rhythm([], NOW)
    assert set(out) == set(GRAINS)
    for g in GRAINS:
        assert set(out[g]) == {"label", "km", "rides", "hours", "elevation_m", "buckets"}
        for b in out[g]["buckets"]:
            assert set(b) == {"start", "km", "rides", "hours", "elevation_m"}


def test_the_grains_are_the_windows_they_claim_to_be():
    out = build_rhythm([], NOW)

    season = out["season"]
    assert season["label"] == "2026"
    assert [b["start"] for b in season["buckets"]] == [
        f"2026-{m:02d}-01" for m in range(1, 13)
    ]

    month = out["month"]
    assert month["label"] == "Letzte 30 Tage"
    starts = [b["start"] for b in month["buckets"]]
    assert starts == ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]

    week = out["week"]
    assert week["label"] == "Letzte 7 Tage"
    assert [b["start"] for b in week["buckets"]] == [
        (TODAY - timedelta(days=6 - i)).isoformat() for i in range(7)
    ]


def test_month_buckets_are_mondays_even_when_the_window_starts_midweek():
    """The last 30 days rarely begin on a Monday; the first bar is then the
    tail of its week and must still be a real Monday-started bucket."""
    saturday = datetime(2026, 9, 5, 9, 0, tzinfo=timezone.utc)
    starts = [b["start"] for b in build_rhythm([], saturday)["month"]["buckets"]]
    assert starts[0] == "2026-08-03"  # the Monday of the week the window opens in
    assert starts[-1] == "2026-08-31"
    for a, b in zip(starts, starts[1:]):
        assert (datetime.fromisoformat(b) - datetime.fromisoformat(a)).days == 7


# ── the empty-bucket rule ───────────────────────────────────────────────────

def test_a_rider_with_no_rides_still_gets_every_bucket():
    out = build_rhythm([], NOW)
    assert len(out["season"]["buckets"]) == 12
    assert len(out["week"]["buckets"]) == 7
    for g in GRAINS:
        assert out[g]["km"] == 0.0 and out[g]["rides"] == 0
        assert out[g]["hours"] == 0.0 and out[g]["elevation_m"] == 0
        assert all(b["rides"] == 0 and b["km"] == 0.0 for b in out[g]["buckets"])


def test_one_ride_does_not_collapse_the_chart_to_one_bar():
    """A chart that drops its empty buckets draws a continuous season nobody
    rode — and on the week grain the rest days ARE the information."""
    out = build_rhythm([ride(day(1))], NOW)
    assert [b["rides"] for b in out["week"]["buckets"]] == [0, 0, 0, 0, 0, 1, 0]
    assert len(out["season"]["buckets"]) == 12
    assert sum(1 for b in out["season"]["buckets"] if b["rides"] == 0) == 11


def test_the_months_after_today_are_present_and_empty():
    """A year chart that stopped at September would read as a season that
    ended, so the rest of the year is drawn as the empty months it is."""
    out = build_rhythm([ride(day(0))], NOW)
    tail = [b for b in out["season"]["buckets"] if b["start"] > "2026-09-01"]
    assert len(tail) == 3
    assert all(b == {"start": b["start"], "km": 0.0, "rides": 0, "hours": 0.0,
                     "elevation_m": 0} for b in tail)


# ── boundaries ──────────────────────────────────────────────────────────────

def test_midnight_on_the_first_belongs_to_the_new_month():
    rides = [
        ride(datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc), km=10),
        ride(datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc), km=20),
    ]
    by = {b["start"]: b for b in build_rhythm(rides, NOW)["season"]["buckets"]}
    assert by["2026-08-01"]["rides"] == 1 and by["2026-08-01"]["km"] == 10.0
    assert by["2026-07-01"]["rides"] == 1 and by["2026-07-01"]["km"] == 20.0


def test_midnight_on_the_first_of_january_is_in_the_season():
    """The season opens at 00:00 on 1 January, not at some point during it."""
    rides = [
        ride(datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc), km=15),
        ride(datetime(2025, 12, 31, 23, 59, tzinfo=timezone.utc), km=99),
    ]
    season = build_rhythm(rides, NOW)["season"]
    assert season["rides"] == 1 and season["km"] == 15.0


def test_seven_days_ago_is_outside_the_week_and_six_is_inside():
    """The week is the last SEVEN days including today, so the seventh day back
    is the eighth day of the window and does not belong to it."""
    out = build_rhythm([ride(day(WEEK_DAYS), km=11), ride(day(WEEK_DAYS - 1), km=22)], NOW)
    assert out["week"]["rides"] == 1
    assert out["week"]["km"] == 22.0
    assert out["week"]["buckets"][0]["km"] == 22.0


def test_thirty_days_ago_is_outside_the_month_and_twenty_nine_is_inside():
    """Same rule one grain up: the ride from exactly 30 days back must not leak
    into the first weekly bar, whose Monday can predate the window."""
    out = build_rhythm(
        [ride(day(MONTH_DAYS), km=11), ride(day(MONTH_DAYS - 1), km=22)], NOW
    )
    assert out["month"]["rides"] == 1
    assert out["month"]["km"] == 22.0
    assert out["month"]["buckets"][0]["km"] == 22.0


def test_a_ride_before_the_window_cannot_leak_into_a_partial_first_week():
    """On a mid-week window start the first bucket's Monday is older than the
    window. Only the days inside the window may count."""
    saturday = datetime(2026, 9, 5, 9, 0, tzinfo=timezone.utc)  # window opens 07 Aug
    rides = [
        ride(datetime(2026, 8, 4, 12, tzinfo=timezone.utc), km=50),   # before the window
        ride(datetime(2026, 8, 7, 12, tzinfo=timezone.utc), km=30),   # first day in it
    ]
    month = build_rhythm(rides, saturday)["month"]
    assert month["rides"] == 1
    assert month["buckets"][0]["km"] == 30.0


def test_last_years_riding_is_not_this_season():
    out = build_rhythm([ride(datetime(2025, 9, 1, 12, tzinfo=timezone.utc), km=80)], NOW)
    assert out["season"]["rides"] == 0
    assert all(b["rides"] == 0 for b in out["season"]["buckets"])


def test_two_rides_on_one_day_are_one_bucket():
    rides = [ride(day(2, hour=7), km=30, minutes=60), ride(day(2, hour=18), km=20, minutes=30)]
    b = build_rhythm(rides, NOW)["week"]["buckets"][4]
    assert b["rides"] == 2 and b["km"] == 50.0 and b["hours"] == 1.5


# ── missing fields ──────────────────────────────────────────────────────────

def test_a_ride_with_no_distance_time_or_ascent_is_still_a_ride():
    """The device failed, not the rider. Counting it as zero rides would put
    this dock's ride count at odds with the ride list beside it."""
    out = build_rhythm([ride(day(1), km=None, minutes=None, ascent=None)], NOW)
    for g in GRAINS:
        assert out[g]["rides"] == 1
        assert out[g]["km"] == 0.0 and out[g]["hours"] == 0.0
        assert out[g]["elevation_m"] == 0


def test_null_elevation_does_not_poison_the_sum():
    rides = [ride(day(1), ascent=None), ride(day(2), ascent=420.0)]
    out = build_rhythm(rides, NOW)
    assert out["week"]["elevation_m"] == 420
    assert isinstance(out["week"]["elevation_m"], int)


def test_elevation_is_whole_metres():
    out = build_rhythm([ride(day(1), ascent=412.7)], NOW)
    assert out["week"]["elevation_m"] == 413
    assert all(isinstance(b["elevation_m"], int) for b in out["week"]["buckets"])


def test_km_and_hours_are_one_decimal():
    out = build_rhythm([ride(day(1), km=42.4242, minutes=97)], NOW)
    assert out["week"]["km"] == 42.4
    assert out["week"]["hours"] == 1.6
    assert out["week"]["buckets"][5]["km"] == 42.4


def test_a_ride_without_a_start_is_not_a_day():
    out = build_rhythm([RideRow(id=99, started_at=None, distance_m=1000, duration_s=60)], NOW)
    assert all(out[g]["rides"] == 0 for g in GRAINS)


# ── the invariant: the headline IS the bars ─────────────────────────────────

def _messy_rides() -> list[RideRow]:
    """A season with gaps, doubles, missing fields and odd rounding — the shape
    that breaks a total scanned separately from its own bars."""
    rides = [
        ride(datetime(2026, 2, 14, 8, tzinfo=timezone.utc), km=63.35, minutes=137, ascent=812.4),
        ride(datetime(2026, 2, 14, 17, tzinfo=timezone.utc), km=21.05, minutes=44, ascent=None),
        ride(datetime(2026, 4, 30, 23, 59, tzinfo=timezone.utc), km=None, minutes=61, ascent=15.5),
        ride(datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc), km=118.7, minutes=None, ascent=1601.6),
        ride(datetime(2026, 6, 9, 6, tzinfo=timezone.utc), km=0.0, minutes=0, ascent=0.0),
    ]
    for off in (0, 1, 3, 3, 6, 7, 12, 19, 25, 29, 30, 44):
        rides.append(ride(day(off), km=17.77 + off, minutes=33 + off, ascent=11.1 * off))
    return rides


@pytest.mark.parametrize("grain", GRAINS)
def test_a_grains_totals_are_the_sum_of_its_own_buckets(grain):
    """THE RULE. The headline and the bars are the same arithmetic, so a rider
    adding the bars up with a finger lands on the number printed above them."""
    g = build_rhythm(_messy_rides(), NOW)[grain]
    assert g["rides"] == sum(b["rides"] for b in g["buckets"])
    assert g["km"] == pytest.approx(sum(b["km"] for b in g["buckets"]))
    assert g["hours"] == pytest.approx(sum(b["hours"] for b in g["buckets"]))
    assert g["elevation_m"] == sum(b["elevation_m"] for b in g["buckets"])


def test_the_finer_grain_is_contained_in_the_coarser_one():
    """A week inside the last 30 days cannot total more than the month, and the
    month cannot total more than the season it sits in."""
    out = build_rhythm(_messy_rides(), NOW)
    assert out["week"]["rides"] <= out["month"]["rides"] <= out["season"]["rides"]
    assert out["week"]["km"] <= out["month"]["km"] <= out["season"]["km"]


def test_the_totals_are_the_real_totals_and_not_only_self_consistent():
    """Agreeing with its own bars is not enough — the arithmetic has to be
    right. Three rides, hand-summed."""
    rides = [
        ride(day(0), km=20.0, minutes=60, ascent=100.0),
        ride(day(3), km=30.0, minutes=90, ascent=250.0),
        ride(day(5), km=50.5, minutes=30, ascent=None),
    ]
    week = build_rhythm(rides, NOW)["week"]
    assert week["rides"] == 3
    assert week["km"] == 100.5
    assert week["hours"] == 3.0
    assert week["elevation_m"] == 350
