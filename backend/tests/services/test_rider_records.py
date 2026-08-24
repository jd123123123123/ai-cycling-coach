"""The record floors and the shape of what a record returns."""
from app.services.rider_records import _FIELDS, Record


class TestFloors:
    def test_every_record_has_a_floor(self):
        # Without one, a rider's first ten-minute test ride is enshrined as
        # their "longest" and the profile opens on a number they are not proud
        # of — the opposite of what the screen is for.
        for key, _col, _unit, floor in _FIELDS:
            assert floor > 0, key

    def test_the_floors_are_plausible_rides(self):
        by = {k: f for k, _c, _u, f in _FIELDS}
        assert by['longest_ride_km'] >= 5_000      # metres — 5 km
        assert by['longest_time_s'] >= 900         # 15 minutes
        assert by['highest_climb_m'] >= 100

    def test_keys_are_unique(self):
        keys = [k for k, *_ in _FIELDS]
        assert len(keys) == len(set(keys))

    def test_no_power_record_is_offered_here(self):
        # `effort_matching` owns power, keyed by duration. A second answer to
        # "your best watts" computed another way is how two screens end up
        # disagreeing about the same rider.
        keys = ' '.join(k for k, *_ in _FIELDS)
        assert 'watt' not in keys and 'power' not in keys


class TestRecordShape:
    def test_a_record_names_the_ride_it_came_from(self):
        # "212 km" is a number; "212 km, Harzrunde, 4. Mai" is a memory.
        r = Record(key='longest_ride_km', value=212.4, unit='km',
                   activity_id=7, title='Harzrunde', at=None)
        assert r.activity_id == 7
        assert r.title == 'Harzrunde'
