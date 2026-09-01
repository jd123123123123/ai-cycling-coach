"""The month and season grains behind the Erfolge rhythm card.

The week grid was already tested. These two are the grains above it, and each
has one way of quietly lying that is worth a test of its own: a month chart
that omits empty months draws a season the rider did not have, and a season
comparison against last year's FULL year tells a rider in March that they have
collapsed.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services.achievement_service import (
    RideRow,
    monthly_rhythm,
    season_compare,
)

NOW = datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc)


def ride(when: datetime, km: float = 40.0, minutes: int = 90, rid: int = 1) -> RideRow:
    return RideRow(id=rid, started_at=when, distance_m=km * 1000, duration_s=minutes * 60)


# ── months ──────────────────────────────────────────────────────────────────

def test_twelve_months_oldest_first_ending_this_month():
    out = monthly_rhythm([], NOW)
    assert len(out) == 12
    assert out[0]["start"] == "2025-10-01"
    assert out[-1]["start"] == "2026-09-01"


def test_an_empty_month_is_still_a_month():
    """A chart that omits the gap draws a continuous season nobody rode."""
    out = monthly_rhythm([ride(datetime(2026, 8, 12, tzinfo=timezone.utc))], NOW)
    assert [m["rides"] for m in out] == [0] * 10 + [1, 0]
    assert all("km" in m and "minutes" in m for m in out)


def test_rides_land_in_their_own_month():
    rides = [
        ride(datetime(2026, 7, 3, tzinfo=timezone.utc), km=30, minutes=60),
        ride(datetime(2026, 7, 28, tzinfo=timezone.utc), km=50, minutes=120),
        ride(datetime(2026, 8, 1, tzinfo=timezone.utc), km=20, minutes=45),
    ]
    by = {m["start"]: m for m in monthly_rhythm(rides, NOW)}
    assert by["2026-07-01"] == {"start": "2026-07-01", "rides": 2, "km": 80.0, "minutes": 180}
    assert by["2026-08-01"]["rides"] == 1 and by["2026-08-01"]["km"] == 20.0


def test_rides_outside_the_window_are_dropped():
    old = ride(datetime(2024, 5, 5, tzinfo=timezone.utc))
    assert sum(m["rides"] for m in monthly_rhythm([old], NOW)) == 0


def test_a_month_boundary_is_not_off_by_one():
    """Midnight on the 1st belongs to the new month, 23:59 on the last to the old."""
    rides = [
        ride(datetime(2026, 8, 1, 0, 0, tzinfo=timezone.utc)),
        ride(datetime(2026, 7, 31, 23, 59, tzinfo=timezone.utc)),
    ]
    by = {m["start"]: m["rides"] for m in monthly_rhythm(rides, NOW)}
    assert by["2026-08-01"] == 1 and by["2026-07-01"] == 1


# ── season ──────────────────────────────────────────────────────────────────

def test_no_prior_riding_means_no_comparison():
    """A first-season rider has nothing to compare against, and a 0 denominator
    would print an invented percentage over a year they were not riding."""
    assert season_compare([ride(datetime(2026, 4, 2, tzinfo=timezone.utc))], NOW) is None
    assert season_compare([], NOW) is None


def test_last_year_is_counted_only_to_the_same_day():
    """THE FAIRNESS RULE. Last year's autumn must not count against this year's
    September, or every rider looks like they are collapsing."""
    rides = [
        ride(datetime(2025, 3, 1, tzinfo=timezone.utc), km=100),   # in window
        ride(datetime(2025, 11, 1, tzinfo=timezone.utc), km=900),  # AFTER 1 Sep
        ride(datetime(2026, 3, 1, tzinfo=timezone.utc), km=150),
    ]
    out = season_compare(rides, NOW)
    assert out is not None
    assert out["previous"]["km"] == 100.0, "last year's post-September riding leaked in"
    assert out["current"]["km"] == 150.0
    assert out["year"] == 2026 and out["prev_year"] == 2025


def test_the_day_itself_is_included_on_both_sides():
    rides = [
        ride(datetime(2025, 9, 1, tzinfo=timezone.utc), km=10),
        ride(datetime(2026, 9, 1, tzinfo=timezone.utc), km=20),
    ]
    out = season_compare(rides, NOW)
    assert out["previous"]["rides"] == 1 and out["current"]["rides"] == 1


def test_leap_day_does_not_raise():
    """29 Feb has no counterpart in a common year."""
    leap = datetime(2028, 2, 29, 12, 0, tzinfo=timezone.utc)
    rides = [ride(datetime(2027, 1, 5, tzinfo=timezone.utc))]
    out = season_compare(rides, leap)
    assert out is not None and out["prev_year"] == 2027


def test_rides_before_last_year_are_not_counted():
    rides = [
        ride(datetime(2024, 5, 5, tzinfo=timezone.utc), km=500),
        ride(datetime(2025, 5, 5, tzinfo=timezone.utc), km=60),
    ]
    out = season_compare(rides, NOW)
    assert out["previous"]["km"] == 60.0


def test_totals_agree_with_a_plain_sum():
    """The card and the dock are made of the same rides; they must not drift."""
    rides = [ride(datetime(2026, 5, i + 1, tzinfo=timezone.utc), km=25, minutes=50, rid=i)
             for i in range(6)]
    rides.append(ride(datetime(2025, 5, 1, tzinfo=timezone.utc)))
    out = season_compare(rides, NOW)
    assert out["current"]["km"] == pytest.approx(150.0)
    assert out["current"]["minutes"] == 300
    assert out["current"]["rides"] == 6


# ── days ────────────────────────────────────────────────────────────────────

def test_fourteen_days_oldest_first_ending_today():
    from app.services.achievement_service import daily_rhythm
    out = daily_rhythm([], NOW)
    assert len(out) == 14
    assert out[0]["start"] == "2026-08-19"
    assert out[-1]["start"] == "2026-09-01"


def test_rest_days_are_days():
    """On this grain the gaps ARE the information — a fortnight with two rides
    must not draw like a fortnight with twelve."""
    from app.services.achievement_service import daily_rhythm
    out = daily_rhythm([ride(datetime(2026, 8, 30, tzinfo=timezone.utc))], NOW)
    assert sum(1 for d in out if d["rides"] == 0) == 13
    assert next(d for d in out if d["start"] == "2026-08-30")["rides"] == 1


def test_two_rides_on_one_day_are_one_day():
    from app.services.achievement_service import daily_rhythm
    rides = [
        ride(datetime(2026, 8, 30, 7, 0, tzinfo=timezone.utc), km=30, minutes=60),
        ride(datetime(2026, 8, 30, 18, 0, tzinfo=timezone.utc), km=20, minutes=40),
    ]
    day = next(d for d in daily_rhythm(rides, NOW) if d["start"] == "2026-08-30")
    assert day == {"start": "2026-08-30", "rides": 2, "km": 50.0, "minutes": 100}
