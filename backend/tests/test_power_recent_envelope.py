"""The 90-day envelope behind Erfolge's "compared to your overall best".

The main envelope has no date filter, which makes it a record book — and a
record book alone cannot answer "how close am I right now". This is the same
computation over recent rides only, and the invariant that makes it drawable
is that it can never exceed the all-time one.
"""
from datetime import date, timedelta

from app.services.power_profile_view import hero_curve, recent_envelope

TODAY = date(2026, 9, 1)


ALLTIME = {5: 1400.0, 15: 1000.0, 60: 600.0, 300: 420.0, 1200: 330.0, 3600: 280.0}


def test_only_rides_inside_the_window_count():
    rides = [
        (TODAY - timedelta(days=10), {5: 1200.0, 1200: 300.0}),
        (TODAY - timedelta(days=200), {5: 1400.0, 1200: 330.0}),
    ]
    out = recent_envelope(rides, TODAY, ALLTIME)
    assert out == {5: 1200.0, 1200: 300.0}


def test_the_window_edge_is_included():
    rides = [(TODAY - timedelta(days=90), {5: 900.0})]
    assert recent_envelope(rides, TODAY, ALLTIME) == {5: 900.0}
    assert recent_envelope([(TODAY - timedelta(days=91), {5: 900.0})], TODAY, ALLTIME) == {}


def test_the_best_CORROBORATED_ride_wins_per_duration():
    """Not simply the max — the same corroboration rule the record book uses.

    Two rides within 5 % of each other back each other up, so the higher one
    stands. A lone outlier does not: see the test below, which is the whole
    reason this function stopped taking a raw maximum.
    """
    rides = [
        (TODAY - timedelta(days=5), {5: 1000.0, 60: 500.0}),
        (TODAY - timedelta(days=6), {5: 1040.0, 60: 490.0}),
    ]
    assert recent_envelope(rides, TODAY, ALLTIME) == {5: 1040.0, 60: 500.0}


def test_a_lone_outlier_does_not_become_the_recent_best():
    """One ride 30 % above the other is a spike, not a breakthrough."""
    rides = [
        (TODAY - timedelta(days=5), {5: 1000.0}),
        (TODAY - timedelta(days=6), {5: 1300.0}),
    ]
    assert recent_envelope(rides, TODAY, ALLTIME)[5] == 1000.0


def test_no_recent_riding_is_empty_not_zero():
    """Empty means "no bar drawn"; a 0 would draw as a real, terrible effort."""
    assert recent_envelope([(TODAY - timedelta(days=400), {5: 900.0})], TODAY, ALLTIME) == {}
    assert recent_envelope([], TODAY, ALLTIME) == {}


def test_a_spike_the_record_book_rejected_cannot_come_back_here():
    """THE BUG THIS FUNCTION SHIPPED WITH.

    Built from raw curves, a single uncorroborated peak survived here even
    though `build_sanitized_envelope` had thrown it out of the all-time
    envelope. On a real account that printed a 5-second "recent best" of
    718 W against an all-time 505 W — a rider being told they had just beaten
    a record the same screen said they had not.
    """
    rides = [(TODAY - timedelta(days=3), {5: 9000.0})]
    out = recent_envelope(rides, TODAY, {5: 505.0})
    assert out[5] <= 505.0


def test_recent_never_exceeds_all_time():
    """THE INVARIANT THE UI RELIES ON: the fill can never overflow its track."""
    rides = [
        (TODAY - timedelta(days=3), {5: 9999.0, 60: 480.0}),
        (TODAY - timedelta(days=9), {5: 1200.0, 60: 470.0}),
    ]
    curve = hero_curve(ALLTIME, 72.0, set(), recent_envelope(rides, TODAY, ALLTIME))
    for row in curve:
        if row["watts"] is not None and row["recent_watts"] is not None:
            assert row["recent_watts"] <= row["watts"], row


def test_every_hero_duration_is_emitted_even_with_no_recent_data():
    curve = hero_curve({5: 1400.0}, None, set(), {})
    assert [c["seconds"] for c in curve] == [5, 15, 60, 300, 1200, 3600]
    assert all(c["recent_watts"] is None for c in curve)
    # And the one real value still comes through.
    assert curve[0]["watts"] == 1400


def test_recent_equal_to_all_time_means_at_the_record():
    rides = [(TODAY - timedelta(days=2), {1200: 300.0})]
    curve = hero_curve({1200: 300.0}, None, set(), recent_envelope(rides, TODAY, {1200: 300.0}))
    row = next(c for c in curve if c["seconds"] == 1200)
    assert row["recent_watts"] == row["watts"] == 300
