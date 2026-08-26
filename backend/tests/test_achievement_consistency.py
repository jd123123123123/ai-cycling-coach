"""The Erfolge screen's two new aggregates: the 52-week grid and the biggest day.

Both are pure functions over the ride scan `get_achievements` already does, so
they are testable without a database — and they must be, because the grid is the
evidence for the number printed beside it. A streak the grid cannot show is a
number the rider cannot check.
"""
from datetime import datetime, timedelta, timezone

from app.services.achievement_service import RideRow, biggest_day, weekly_consistency

NOW = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)  # a Wednesday


def ride(days_ago: int, km: float = 30, secs: int = 3600, hm: float | None = None,
         rid: int = 1, title: str | None = None) -> RideRow:
    return RideRow(rid, NOW - timedelta(days=days_ago), km * 1000, secs, hm, title)


# ── the grid ────────────────────────────────────────────────────────────────

def test_the_grid_is_always_the_full_window():
    """One tile per week, every week, whether it was ridden or not. A grid that
    only listed ridden weeks would silently redraw itself shorter for a rider
    who rode less, which is the opposite of what it is for."""
    c = weekly_consistency([], NOW)
    assert len(c["weeks"]) == 52
    assert c["ridden"] == 0
    assert c["longest_streak"] == 0
    assert c["of"] == 52


def test_the_current_week_counts_even_though_it_is_not_over():
    """A rider who rode on Monday must see this Monday lit. Excluding the
    incomplete week would show them a grid that says they stopped."""
    c = weekly_consistency([ride(1)], NOW)
    assert c["weeks"][-1]["rides"] == 1
    assert c["ridden"] == 1


def test_a_week_is_lit_by_showing_up_not_by_volume():
    """Three rides in a week is still ONE lit week — the chapter's claim is
    attendance. The count rides along for the tile's intensity."""
    # NOW is a Wednesday, so 0/1/2 days back is Wed/Tue/Mon — one ISO week.
    c = weekly_consistency([ride(0), ride(1), ride(2)], NOW)
    assert c["ridden"] == 1
    assert c["weeks"][-1]["rides"] == 3


def test_the_streak_runs_over_consecutive_weeks():
    rides = [ride(7 * w + 1) for w in range(5)]      # this week + 4 back
    c = weekly_consistency(rides, NOW)
    assert c["longest_streak"] == 5


def test_a_gap_breaks_the_streak_and_the_longest_run_wins():
    weeks = [0, 1, 2, 4, 5, 6, 7]                     # 3 then a gap then 4
    c = weekly_consistency([ride(7 * w + 1) for w in weeks], NOW)
    assert c["longest_streak"] == 4
    assert c["ridden"] == 7


def test_rides_older_than_the_window_are_not_counted():
    """They are real rides and they belong to the lifetime totals — but this
    grid is 52 tiles, and a ride it cannot draw must not move its numbers."""
    c = weekly_consistency([ride(7 * 80)], NOW)
    assert c["ridden"] == 0
    assert all(w["rides"] == 0 for w in c["weeks"])


def test_the_weeks_come_back_in_order_oldest_first():
    c = weekly_consistency([], NOW)
    starts = [w["start"] for w in c["weeks"]]
    assert starts == sorted(starts)


# ── the biggest day ─────────────────────────────────────────────────────────

def test_no_rides_means_no_biggest_day():
    """None, not a zero-kilometre ride. "Never ridden" and "rode nothing" are
    different sentences and the screen says different things about them."""
    assert biggest_day([]) is None


def test_the_biggest_day_is_the_longest_by_distance():
    """Distance, not duration — a five-hour recovery spin is a longer ride and
    nobody's biggest day."""
    b = biggest_day([
        ride(10, km=60, secs=7200, rid=1),
        ride(20, km=142, secs=18760, rid=2),
        ride(30, km=40, secs=20000, rid=3),   # longest in TIME, not the answer
    ])
    assert b is not None
    assert b["activity_id"] == 2
    assert b["km"] == 142.0
    assert b["duration_s"] == 18760


def test_the_second_badge_only_shows_when_that_ride_also_climbed_the_most():
    """The screen prints "HÖCHSTER TAG" beside "LÄNGSTE FAHRT". On a ride that
    is merely hilly that is a claim the rider could disprove by scrolling their
    own history."""
    same = biggest_day([ride(10, km=142, hm=2180, rid=1), ride(20, km=60, hm=900, rid=2)])
    assert same is not None and same["also_highest"] is True

    other = biggest_day([ride(10, km=142, hm=800, rid=1), ride(20, km=60, hm=2400, rid=2)])
    assert other is not None and other["also_highest"] is False


def test_a_ride_with_no_elevation_reports_none_rather_than_zero():
    """Zero metres of ascent and "the file carried no elevation" are different
    facts; the sticker shows a dash for the second."""
    b = biggest_day([ride(10, km=142, hm=None)])
    assert b is not None and b["ascent_m"] is None


def test_zero_distance_rides_are_not_a_biggest_day():
    """A trainer session with no distance recorded is a real ride and a
    meaningless "longest"."""
    assert biggest_day([RideRow(1, NOW, 0, 3600), RideRow(2, NOW, None, 3600)]) is None
