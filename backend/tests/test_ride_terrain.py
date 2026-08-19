"""`terrain_key`, and the bug a real Maratona file found.

The Maratona dles Dolomites is 139 km with 6 053 m of ascent — among the most
mountainous rides anyone uploads. It came back as "flat", and the scene
rendered as a green plain with the Dolomites correctly resolved and then
overruled by the generic terrain clause.

The cause: hilliness is metres-per-km, the GPX parser handed over no distance,
and 0/0 fell through every threshold to the default. Absolute climb is now
checked FIRST, because a ride with four figures of ascent is not flat whatever
else is unknown about it.
"""
from app.services.ride_scene import RideGeo, terrain_key


def test_the_maratona_is_not_flat_even_without_a_distance():
    assert terrain_key(RideGeo(distance_m=None, elevation_gain_m=6053)) == "mountain"


def test_the_maratona_with_its_real_numbers():
    assert terrain_key(RideGeo(
        distance_m=139_000, elevation_gain_m=6053,
        min_altitude_m=1314, max_altitude_m=2243,
    )) == "mountain"


def test_a_big_climb_with_no_distance_is_at_least_hilly():
    assert terrain_key(RideGeo(distance_m=None, elevation_gain_m=900)) == "hilly"


def test_genuinely_flat_rides_are_still_flat():
    """The absolute-climb shortcut must not swallow the ratio path."""
    assert terrain_key(RideGeo(distance_m=40_000, elevation_gain_m=60)) == "flat"
    assert terrain_key(RideGeo(distance_m=120_000, elevation_gain_m=400)) == "flat"


def test_sea_level_and_flat_still_reads_as_coastal():
    assert terrain_key(RideGeo(
        distance_m=40_000, elevation_gain_m=60, min_altitude_m=2, max_altitude_m=18,
    )) == "coastal"


def test_the_ratio_path_still_works_for_middling_rides():
    # 1 200 m over 80 km = 15 m/km — the mountain threshold, by ratio alone.
    assert terrain_key(RideGeo(distance_m=80_000, elevation_gain_m=1200)) == "mountain"
    # 600 m over 80 km = 7.5 m/km — hilly.
    assert terrain_key(RideGeo(distance_m=80_000, elevation_gain_m=600)) == "hilly"


def test_an_empty_ride_does_not_crash():
    assert terrain_key(RideGeo(distance_m=None, elevation_gain_m=None)) == "flat"
