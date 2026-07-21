"""Weather location plausibility — a corrupt Garmin GPS fix must never put the
forecast on the other side of the planet from where the athlete actually is."""
from app.api.weather import _plausible, _expected_longitude


class TestExpectedLongitude:
    def test_berlin_is_a_positive_lowish_longitude(self):
        lng = _expected_longitude("Europe/Berlin")
        assert lng is not None
        # UTC+1/+2 → ~15–30°; the point is it's nowhere near the Pacific.
        assert 0 < lng < 45

    def test_unknown_tz_returns_none(self):
        assert _expected_longitude("Not/AZone") is None


class TestPlausible:
    def test_rejects_the_solomon_islands_gps_for_a_berlin_athlete(self):
        # The real bug: user 5's two newest rides reported (-11.6, 166.9).
        berlin_lng = _expected_longitude("Europe/Berlin")
        assert _plausible(-11.639, 166.948, berlin_lng) is False

    def test_accepts_a_real_german_ride_for_a_berlin_athlete(self):
        berlin_lng = _expected_longitude("Europe/Berlin")
        assert _plausible(52.52, 13.33, berlin_lng) is True

    def test_accepts_nearby_travel_for_a_berlin_athlete(self):
        # The Dolomites (Maratona) — travel within ±60° is fine.
        berlin_lng = _expected_longitude("Europe/Berlin")
        assert _plausible(46.55, 11.97, berlin_lng) is True

    def test_rejects_null_island(self):
        assert _plausible(0.0, 0.0, None) is False

    def test_rejects_out_of_range(self):
        assert _plausible(200.0, 500.0, None) is False

    def test_no_tz_hint_accepts_any_in_range_point(self):
        # Without a timezone we can't judge consistency — accept in-range.
        assert _plausible(-11.639, 166.948, None) is True
