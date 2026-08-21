"""The chain's second clock: life to 0,5 % elongation, and its calibration.

The service clock says when the chain is DIRTY. This one says when it is
FINISHED — and only the second one costs a cassette when it is missed. These
tests pin down the three things a rider's money depends on: that the estimate
starts from a defensible prior, that a chain-checker reading moves it onto their
own drivetrain, and that no path here ever punishes.
"""
import pytest

from app.services import bike_wear as bw


class TestPrior:
    def test_a_fresh_chain_is_fresh(self):
        life = bw.chain_life(0.0, "oil")
        assert life.status == "fresh"
        assert life.pct == 0.0
        assert life.km_left == pytest.approx(2500.0)

    def test_wax_lasts_materially_longer_than_oil(self):
        # The one drivetrain claim every controlled longevity test agrees on.
        assert bw.chain_life(0, "wax").limit_km > bw.chain_life(0, "oil").limit_km * 1.5
        assert bw.chain_life(0, "dripwax").limit_km > bw.chain_life(0, "oil").limit_km

    def test_an_unknown_method_falls_back_to_oil_not_to_optimism(self):
        assert bw.chain_life(0, None).limit_km == bw.chain_life(0, "oil").limit_km
        assert bw.chain_life(0, "sorcery").limit_km == bw.chain_life(0, "oil").limit_km

    def test_the_estimate_is_flagged_as_an_estimate_until_measured(self):
        life = bw.chain_life(1200, "oil")
        assert life.calibrated is False
        assert life.measurements == 0
        assert life.confidence == 0.0

    def test_status_crosses_at_the_replacement_line(self):
        assert bw.chain_life(2_499, "oil").status == "fresh"
        assert bw.chain_life(2_501, "oil").status == "due"

    def test_ruinous_is_where_the_cassette_starts_paying(self):
        # 0,75 % on a 2 500 km-per-0,5 % chain is 3 750 km.
        assert bw.chain_life(3_800, "oil").status == "ruinous"

    def test_progress_is_clamped_but_km_left_goes_negative(self):
        life = bw.chain_life(5_000, "oil")
        assert life.progress == 1.0
        assert life.km_left < 0

    def test_negative_odometers_cannot_happen(self):
        assert bw.chain_life(-100, "oil").pct == 0.0


class TestCalibration:
    def test_no_readings_leaves_the_prior_exactly_where_it_was(self):
        k, n, conf = bw.calibrate_life(5_000.0, [])
        assert (k, n, conf) == (5_000.0, 0, 0.0)

    def test_a_fast_wearing_drivetrain_pulls_the_limit_down(self):
        # 0,35 % after 1 300 km implies ~3 700 km per percent, well under the
        # 5 000 the prior assumes for oil.
        life = bw.chain_life(1_300, "oil", [(1_300.0, 0.35)])
        assert life.limit_km < 2_500.0
        assert life.calibrated is True
        assert life.measurements == 1

    def test_a_slow_wearing_drivetrain_pushes_it_up(self):
        life = bw.chain_life(2_000, "oil", [(2_000.0, 0.2)])
        assert life.limit_km > 2_500.0

    def test_two_agreeing_readings_beat_one(self):
        one = bw.chain_life(1_300, "oil", [(1_300.0, 0.35)])
        two = bw.chain_life(1_300, "oil", [(650.0, 0.175), (1_300.0, 0.35)])
        assert two.confidence > one.confidence
        assert two.limit_km < one.limit_km  # consistent evidence keeps pulling

    def test_the_posterior_never_takes_a_single_reading_at_face_value(self):
        # A gauge is blunt; one reading moves the estimate, it does not replace it.
        implied = 1_300.0 / 0.35 * bw.CHAIN_REPLACE_PCT
        life = bw.chain_life(1_300, "oil", [(1_300.0, 0.35)])
        assert implied < life.limit_km < 2_500.0

    def test_a_brand_new_chain_reading_zero_teaches_nothing(self):
        life = bw.chain_life(40, "oil", [(40.0, 0.0)])
        assert life.measurements == 0
        assert life.limit_km == pytest.approx(2_500.0)

    def test_readings_survive_the_chain_they_were_taken_on(self):
        # After a replacement the odometer is 0 but the rider is the same, so
        # the old readings still describe how fast THEY wear a chain.
        fresh_chain = bw.chain_life(0.0, "oil", [(1_300.0, 0.35)])
        assert fresh_chain.calibrated is True
        assert fresh_chain.limit_km < 2_500.0
        assert fresh_chain.status == "fresh"

    def test_measurement_calibrates_the_method_the_rider_actually_uses(self):
        # Same reading, different method: the prior differs, so the posterior
        # does too — a waxer measuring 0,35 % at 1 300 km is still doing better
        # than an oiler with the identical reading.
        oil = bw.chain_life(1_300, "oil", [(1_300.0, 0.35)])
        wax = bw.chain_life(1_300, "wax", [(1_300.0, 0.35)])
        assert wax.limit_km > oil.limit_km


class TestNoPunishment:
    def test_a_ruined_chain_still_reports_a_number_and_nothing_else(self):
        life = bw.chain_life(9_000, "oil")
        assert life.status == "ruinous"
        # No blocking flag, no cost, no negative anything the rider "owes".
        assert life.pct > bw.CHAIN_RUIN_PCT
        assert life.life_km == 9_000

    def test_the_life_clock_is_independent_of_the_service_clock(self):
        # Cleaning the chain does not make it younger: the two numbers come
        # from different odometers and only replacement resets this one.
        assert bw.chain_life(2_600, "oil").status == "due"
        assert bw.status_of(0.0, bw.spec_of("chain", "oil").interval_km) == "fresh"
