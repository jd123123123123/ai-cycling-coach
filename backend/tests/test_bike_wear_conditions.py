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
