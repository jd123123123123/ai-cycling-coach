"""The 90-day envelope behind Erfolge's "compared to your overall best".

The main envelope has no date filter, which makes it a record book — and a
record book alone cannot answer "how close am I right now". This is the same
computation over recent rides only, and the invariant that makes it drawable
is that it can never exceed the all-time one.
"""
from datetime import date, timedelta

from app.services.power_profile_view import hero_curve, recent_envelope

TODAY = date(2026, 9, 1)


def test_only_rides_inside_the_window_count():
    rides = [
        (TODAY - timedelta(days=10), {5: 1200.0, 1200: 300.0}),
        (TODAY - timedelta(days=200), {5: 1500.0, 1200: 400.0}),
    ]
    out = recent_envelope(rides, TODAY)
    assert out == {5: 1200.0, 1200: 300.0}


def test_the_window_edge_is_included():
    rides = [(TODAY - timedelta(days=90), {5: 900.0})]
    assert recent_envelope(rides, TODAY) == {5: 900.0}
    assert recent_envelope([(TODAY - timedelta(days=91), {5: 900.0})], TODAY) == {}


def test_the_best_recent_ride_wins_per_duration():
    rides = [
        (TODAY - timedelta(days=5), {5: 1000.0, 60: 500.0}),
        (TODAY - timedelta(days=6), {5: 1100.0, 60: 400.0}),
    ]
    assert recent_envelope(rides, TODAY) == {5: 1100.0, 60: 500.0}


def test_no_recent_riding_is_empty_not_zero():
    """Empty means "no bar drawn"; a 0 would draw as a real, terrible effort."""
    assert recent_envelope([(TODAY - timedelta(days=400), {5: 900.0})], TODAY) == {}
    assert recent_envelope([], TODAY) == {}


def test_recent_never_exceeds_all_time():
    """THE INVARIANT THE UI RELIES ON. The all-time envelope contains the
    recent one, so a fill can never overflow its own track."""
    rides = [(TODAY - timedelta(days=3), {5: 1200.0, 60: 480.0})]
    envelope = {5: 1400.0, 60: 480.0, 1200: 300.0}
    curve = hero_curve(envelope, 72.0, set(), recent_envelope(rides, TODAY))
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
    curve = hero_curve({1200: 300.0}, None, set(), recent_envelope(rides, TODAY))
    row = next(c for c in curve if c["seconds"] == 1200)
    assert row["recent_watts"] == row["watts"] == 300
