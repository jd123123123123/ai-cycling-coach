"""A kilometre costs what the kilometre cost.

Every maintenance interval in the industry is quoted for DRY ROAD, and almost
every app on the market counts raw distance because distance is all it has.
This one is a training app: it already resolved wetness, surface, temperature,
intensity and climbing to settle the ride's earn, and those are exactly the
facts that decide wear. These tests pin that the weighting is applied, that it
stays believable, and that a fact we do not have never moves the number.
"""
from app.services import bike_wear as w
from app.services.earn_modifiers import RideFacts

FLAT_DRY = RideFacts(distance_m=50_000, elevation_gain_m=200, surface="road", was_wet=False)


def test_a_dry_road_ride_is_the_baseline():
    """The published intervals assume this ride, so it must weigh exactly 1."""
    for cid in w.COMPONENTS:
        assert w.wear_factor(cid, FLAT_DRY) == 1.0


def test_nothing_we_do_not_know_moves_the_number():
    """RULE 4, inherited from the modifier catalogue: an unknown surface is dry
    road, never 'probably gravel'. A wear model that guesses upward invents
    services the rider does not need."""
    empty = RideFacts()
    for cid in w.COMPONENTS:
        assert w.wear_factor(cid, empty) == 1.0


def test_water_costs_the_chain_and_the_pads_and_not_the_tyres():
    """The physical truth this model exists to encode: rain carries grit into a
    chain and destroys braking surfaces, and does almost nothing to rubber."""
    wet = RideFacts(distance_m=50_000, elevation_gain_m=200, surface="road", was_wet=True)
    assert w.wear_factor("chain", wet) > 2
    assert w.wear_factor("brakes", wet) > 2
    assert w.wear_factor("tyres", wet) == 1.0


def test_gravel_costs_the_tyres_most():
    grit = RideFacts(distance_m=50_000, elevation_gain_m=200, surface="gravel")
    assert w.wear_factor("tyres", grit) == 2.0
    assert w.wear_factor("chain", grit) > 1


def test_conditions_compound_rather_than_add():
    """A wet gravel ride is genuinely worse than either alone. Adding the two
    would understate it, which is the failure mode of every additive model."""
    wet = RideFacts(distance_m=50_000, surface="road", was_wet=True)
    grit = RideFacts(distance_m=50_000, surface="gravel", was_wet=False)
    both = RideFacts(distance_m=50_000, surface="gravel", was_wet=True)
    assert w.wear_factor("chain", both) > w.wear_factor("chain", wet)
    assert w.wear_factor("chain", both) > w.wear_factor("chain", grit)


def test_one_filthy_afternoon_cannot_finish_a_component():
    """Capped on purpose. Three hard conditions stacking is real; a single ride
    costing several intervals is not — and a number a rider cannot recognise is
    a number they stop believing, which costs more than the model gains."""
    worst = RideFacts(
        distance_m=50_000, elevation_gain_m=1_500, surface="gravel",
        was_wet=True, temp_c=-2, intensity_factor=0.98,
    )
    for cid in w.COMPONENTS:
        assert w.wear_factor(cid, worst) <= w.MAX_WEAR_FACTOR


def test_climbing_stands_in_for_descending_on_the_brakes():
    """You brake on the way down, and the climb is the only half of it the data
    records. Flat rides must not trigger it."""
    hilly = RideFacts(distance_m=50_000, elevation_gain_m=900, surface="road")
    assert w.wear_factor("brakes", hilly) > w.wear_factor("brakes", FLAT_DRY)
    assert w.wear_factor("brakes", FLAT_DRY) == 1.0


def test_an_unknown_component_is_never_weighted():
    """A component added to the catalogue without a wear profile must accrue
    plainly rather than pick up another part's multipliers by accident."""
    wet = RideFacts(distance_m=50_000, was_wet=True, surface="gravel")
    assert w.wear_factor("bottom_bracket", wet) == 1.0


# ── what actually wears each part ───────────────────────────────────────────

def test_the_chain_is_worn_by_work_not_by_distance():
    """Chain elongation comes from the pin/bush interface sliding under tension,
    and the tension is the torque the rider puts through it. Two riders over the
    same 100 km at 120 W and 250 W do not have the same chain — which is why
    professional mechanics retire chains on kilojoules."""
    easy = w.RideLoad(distance_km=100, kj=1500, descent_m=300)
    hard = w.RideLoad(distance_km=100, kj=3000, descent_m=300)
    assert w.equivalent_km("chain", hard) == 2 * w.equivalent_km("chain", easy)


def test_the_pads_are_worn_by_descent_not_by_distance():
    """A bicycle descending turns potential energy into heat, and whatever drag
    does not take, the brakes do. A flat century does not wear pads however far
    it is — the one component where distance is actively misleading."""
    alpine = w.RideLoad(distance_km=100, kj=3000, descent_m=2500)
    pancake = w.RideLoad(distance_km=100, kj=3000, descent_m=50)
    assert w.equivalent_km("brakes", alpine) > 10 * w.equivalent_km("brakes", pancake)


def test_the_tyres_are_worn_by_ground_covered():
    """Abrasion really is distance against a surface, so distance stays the
    driver here — the model must not 'improve' the one case it already had
    right."""
    a = w.RideLoad(distance_km=100, kj=1500, descent_m=2500)
    b = w.RideLoad(distance_km=100, kj=3000, descent_m=50)
    assert w.equivalent_km("tyres", a) == w.equivalent_km("tyres", b) == 100


def test_a_missing_sensor_falls_back_to_distance():
    """A ride with no power meter has no work term and a ride with no barometer
    has no descent. Both fall back to distance rather than to an estimate: a
    model that guesses where it cannot measure is worse than a plain odometer,
    because it is wrong with authority."""
    blind = w.RideLoad(distance_km=100)
    assert w.equivalent_km("chain", blind) == 100
    assert w.equivalent_km("brakes", blind) == 100


def test_the_reference_kilometre_is_the_one_the_intervals_assume():
    """Every published interval is quoted for dry road at endurance pace. A ride
    that IS that must advance the clock by its own distance, or the whole
    catalogue silently re-scales."""
    ref = w.RideLoad(
        distance_km=100,
        kj=100 * w.REF_KJ_PER_KM,
        descent_m=100 * w.REF_DESCENT_M_PER_KM,
    )
    for cid in ("chain", "brakes", "tyres"):
        assert abs(w.equivalent_km(cid, ref) - 100) < 0.01


def test_descent_sums_every_drop_rather_than_the_range():
    """A ride over the same pass twice dissipates twice the energy, and
    `max - min` would report it once."""
    from app.services.ride_economy import _descent_m

    one = list(range(0, 501, 10)) + list(range(500, -1, -10))
    assert _descent_m({"altitude": one + one}) == 2 * _descent_m({"altitude": one})


def test_sensor_drift_is_not_descent():
    """Barometric altimeters wander a metre or two at rest, and summing that
    noise over three hours invents hundreds of metres that never happened."""
    from app.services.ride_economy import _descent_m

    noise = [100.0, 101.1, 99.2, 100.8, 99.5, 100.3] * 400
    assert _descent_m({"altitude": noise}) == 0.0
    assert _descent_m({}) is None
