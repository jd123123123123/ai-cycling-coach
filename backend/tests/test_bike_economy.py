"""The bike economy's three pure layers: wear, modifiers, Eddington.

The rules under test are the ones that would rot silently, and most of them are
about what the system must NEVER do. An economy whose only tests are "the number
goes up" is one refactor away from punishing the rider it was built to keep.
"""
import pytest

from app.services import bike_wear as w
from app.services import earn_modifiers as em
from app.services import eddington as ed


# ── wear: the harvest inversion ─────────────────────────────────────────────

def test_riding_banks_bonus_and_nothing_ever_takes_it_away():
    """The whole design in one assertion: more km is always more banked, never
    less. The moment this fails, neglect has started costing money and the
    system has become the punitive loop it was built to replace."""
    prev = -1
    for km in range(0, 800, 25):
        rc = w.accrued_rc(km, w.COMPONENTS["chain"])
        assert rc >= prev, f"bonus went DOWN at {km} km"
        prev = rc


def test_accrual_stops_but_never_reverses():
    """Past the overrun ceiling the pile stops growing — a nudge. It must not
    shrink, which would be a punishment for having been away."""
    spec = w.COMPONENTS["chain"]
    ceiling = spec.interval_km * w.OVERRUN_FACTOR
    at_ceiling = w.accrued_rc(ceiling, spec)
    assert w.accrued_rc(ceiling * 3, spec) == at_ceiling
    assert w.accrued_rc(ceiling * 20, spec) == at_ceiling


def test_a_month_away_leaves_more_waiting_not_less():
    """The behavioural claim the design rests on: a rider returning after a long
    break must find a BIGGER reason to open the workshop."""
    before = w.state_of("chain", km_since=120, km_total=120)
    after = w.state_of("chain", km_since=240, km_total=240)
    assert after.bonus_rc > before.bonus_rc


def test_status_is_never_a_failure_state():
    """Three states, and none of them stops the rider riding."""
    spec = w.COMPONENTS["chain"]
    assert w.status_of(0, spec.interval_km) == "fresh"
    assert w.status_of(spec.interval_km, spec.interval_km) == "due"
    assert w.status_of(spec.interval_km * 5, spec.interval_km) == "overdue"
    for km in (0, 100, 250, 5000, 99_999):
        assert w.status_of(km, spec.interval_km) in ("fresh", "due", "overdue")


def test_lifetime_km_survives_a_service():
    """`km_total` is what cyclists brag about. A service resets `km_since` only."""
    s = w.state_of("chain", km_since=0, km_total=4820)
    assert s.km_total == 4820
    assert s.km_since == 0


def test_one_interval_always_pays_that_component_in_full():
    """The pricing rule: a full service is worth `rc_at_interval`, whichever
    component it is and however long its interval happens to be."""
    for spec in w.COMPONENTS.values():
        assert w.accrued_rc(spec.interval_km, spec) == spec.rc_at_interval


def test_timing_is_neutral_so_waiting_cannot_be_farmed():
    """Two services at one interval must pay exactly what one service at two
    intervals pays. Otherwise the optimal play is to neglect the bike, and the
    economy quietly teaches the opposite of what it intends."""
    spec = w.COMPONENTS["chain"]
    twice_prompt = 2 * w.accrued_rc(spec.interval_km, spec)
    once_late = w.accrued_rc(spec.interval_km * 2, spec)
    assert twice_prompt == once_late


def test_the_frequent_job_is_the_satisfying_one():
    """The chain is serviced dozens of times a year and the cassette about once.
    An earlier model derived the payout from kilometres, which made the yearly
    job pay six times the weekly one — the exact inverse of what engagement
    needs. The frequent action must pay like a real payday."""
    chain = w.COMPONENTS["chain"]
    assert chain.interval_km == min(c.interval_km for c in w.COMPONENTS.values())
    # Worth more than a typical single ride's base earn (40-150 RC).
    assert chain.rc_at_interval >= 150


def test_the_watts_figure_is_only_claimed_when_it_is_true():
    """A fresh chain has no drag to report, so the app says nothing rather than
    reporting a zero that implies a measurement."""
    spec = w.COMPONENTS["chain"]
    assert w.efficiency_watts(0) is None
    assert w.efficiency_watts(spec.interval_km - 1) is None
    # Past the interval it lands inside the real 3-5 W band, never outside it.
    for km in (spec.interval_km, spec.interval_km * 1.5, spec.interval_km * 9):
        watts = w.efficiency_watts(km)
        assert watts is not None and 3.0 <= watts <= 5.0


# ── modifiers: conditional, capped, and always a bonus ──────────────────────

def _facts(**kw) -> em.RideFacts:
    return em.RideFacts(**kw)


def test_a_modifier_never_fires_on_a_fact_we_do_not_have():
    """No weather data must never become a rain bonus. Guessing in the rider's
    favour is still guessing, and it makes every real bonus untrustworthy."""
    blank = _facts()
    for m in em.MODIFIERS.values():
        assert m.applies(blank) is False, f"{m.id} fired on no data"
    assert em.CONDITION.applies(blank) is False


def test_modifiers_only_fire_when_the_ride_actually_matched():
    dry_road = _facts(surface="road", was_wet=False, distance_m=40_000,
                      elevation_gain_m=200, avg_speed_kmh=24)
    assert em.MODIFIERS["gravel_tyres"].applies(dry_road) is False
    assert em.MODIFIERS["mudguards"].applies(dry_road) is False

    wet_gravel = _facts(surface="gravel", was_wet=True)
    assert em.MODIFIERS["gravel_tyres"].applies(wet_gravel) is True
    assert em.MODIFIERS["mudguards"].applies(wet_gravel) is True


def test_nothing_in_the_catalogue_is_free():
    """Items are BOUGHT. There is no starter item, no free tier and no grant —
    a zero price would be a silent free unlock, and `gear.buy` is the only
    writer of ownership rows precisely so this stays true."""
    for m in em.catalogue():
        assert m.price_rc > 0, f"{m.id} is free"
        assert m.rarity in em.RARITIES
    assert all(p > 0 for p in em.PRICE_BY_RARITY.values())


def test_rarity_prices_rise():
    p = em.PRICE_BY_RARITY
    assert p["common"] < p["rare"] < p["legendary"]


def test_every_item_has_a_real_slot_and_a_reason():
    """A slotless item would dodge the one-per-slot rule and stack for free."""
    for m in em.catalogue():
        assert m.slot in em.SLOTS, f"{m.id} has no slot"
        assert m.why and m.flavour_de, f"{m.id} has no copy"
        assert 0 < m.pct <= em.MAX_BONUS_PCT


def test_the_catalogue_is_worth_collecting():
    """Enough breadth that every slot is a genuine choice, and enough total
    value that the currency has somewhere to go for a long time. A currency
    with nothing left to buy stops being worth earning."""
    by_slot: dict[str, int] = {}
    for m in em.catalogue():
        by_slot[m.slot] = by_slot.get(m.slot, 0) + 1
    assert len(by_slot) == len(em.SLOTS)
    assert min(by_slot.values()) >= 4, "a slot with fewer than 4 items is not a choice"


def test_one_item_per_slot_is_enforced_on_equip():
    two_tyres = ["gravel_tyres", "slicks"]
    with pytest.raises(em.SlotConflictError):
        em.validate_loadout(two_tyres)
    # One per slot, five slots — the maximum legal loadout.
    em.validate_loadout(["gravel_tyres", "aero_wheels", "mudguards", "bell", "banana"])


def test_a_stale_loadout_never_costs_a_rider_their_earn():
    """`resolve` runs on the award path for a ride that ALREADY happened. A
    loadout that has since become illegal must resolve, not raise — and when two
    items share a slot the better one wins, so the rider is never quietly given
    the worse of two things they own."""
    facts = _facts(surface="gravel", was_wet=False)
    b = em.resolve(["gravel_tyres", "slicks", "retired_item"], facts)
    fired = [h for h in b.hits if h.fired]
    assert any(h.id == "gravel_tyres" for h in fired)
    assert b.total_pct == em.MODIFIERS["gravel_tyres"].pct


def test_set_bonuses_need_the_whole_set_and_the_right_day():
    """A set that paid on every ride would be the flat multiplier rule 1
    forbids, so sets are conditional too."""
    gravel_day = _facts(surface="gravel")
    road_day = _facts(surface="road")

    partial = em.resolve(["gravel_tyres"], gravel_day)
    assert not any(s.id == "set_gravel" for s in partial.sets)

    complete = em.resolve(["gravel_tyres", "climbing_bars"], gravel_day)
    assert any(s.id == "set_gravel" and s.fired for s in complete.sets)

    wrong_day = em.resolve(["gravel_tyres", "climbing_bars"], road_day)
    assert any(s.id == "set_gravel" and not s.fired for s in wrong_day.sets)


def test_the_charm_slot_rewards_things_a_coach_wants():
    """`lanterne_rouge` pays for taking the easy day easy — the hardest thing to
    get an enthusiastic athlete to do and the one a training plan most needs.
    If this ever stops firing, the economy has stopped serving the coaching."""
    lr = em.MODIFIERS["lanterne_rouge"]
    assert lr.slot == "charm"
    assert lr.applies(_facts(honoured_easy_day=True)) is True
    assert lr.applies(_facts(honoured_easy_day=False)) is False
    assert lr.applies(_facts()) is False


def test_the_cap_is_reachable_with_a_legal_loadout():
    """Uncapped additive multipliers are how game economies die. But the cap
    must also be REACHABLE, or it is decoration — a ceiling nobody can touch
    does not constrain anything.

    A legal maximum: one item per slot, on the worst day of the year. Cold, wet,
    dark, mountainous, off-road and long — the ride that earns every one of
    them at once."""
    epic = _facts(
        surface="gravel", was_wet=True, temp_c=1, in_dark=True,
        distance_m=140_000, elevation_gain_m=2400, avg_speed_kmh=19,
        duration_s=7 * 3600, drivetrain_fresh=True,
    )
    loadout = ["winter_tyres", "climbing_wheels", "dynamo_light", "climbing_bars", "regel_neun"]
    em.validate_loadout(loadout)          # it really is legal
    b = em.resolve(loadout, epic)
    assert b.total_pct == em.MAX_BONUS_PCT
    assert b.capped is True


def test_wearing_everything_is_not_possible_so_owning_everything_is_not_a_win():
    """Passing the whole catalogue must NOT stack it. Owning more widens the
    choice; it must never raise the floor, or the loadout stops being a
    decision and the collection becomes a checklist."""
    day = _facts(surface="gravel", was_wet=True, in_dark=True, drivetrain_fresh=True,
                 distance_m=150_000, elevation_gain_m=2000, avg_speed_kmh=30)
    everything = em.resolve(list(em.MODIFIERS), day)
    # At most one hit per slot, plus the slotless condition bonus.
    slots = [h.slot for h in everything.hits if h.slot]
    assert len(slots) == len(set(slots)), "two items from one slot were counted"
    assert len(everything.hits) <= len(em.SLOTS) + 1


def test_the_cap_is_reported_not_swallowed():
    """A rider who bought a bonus that got clamped is told so."""
    modest = em.resolve(["gravel_tyres"], _facts(surface="gravel"))
    assert modest.capped is False
    assert modest.total_pct == em.MODIFIERS["gravel_tyres"].pct


def test_misses_are_returned_so_the_loadout_is_learnable():
    """The near-miss is the useful part: 'Schutzbleche — zählt, wenn es geregnet
    hat' on a dry day teaches the system. Hiding misses makes it feel random."""
    b = em.resolve(["mudguards", "gravel_tyres"], _facts(surface="gravel", was_wet=False))
    fired = {h.id: h.fired for h in b.hits}
    assert fired["gravel_tyres"] is True
    assert fired["mudguards"] is False
    assert all(h.why for h in b.hits)


def test_maintenance_is_a_bonus_that_switches_on_never_a_penalty():
    """The single most important assertion in this file. A neglected drivetrain
    must earn the SAME base as a fresh one — the fresh one earns MORE. Same
    arithmetic as a penalty; entirely different product."""
    dirty = em.resolve([], _facts(drivetrain_fresh=False))
    fresh = em.resolve([], _facts(drivetrain_fresh=True))
    assert dirty.total_pct == 0
    assert dirty.multiplier == 1.0        # base earn is untouched
    assert fresh.total_pct == em.CONDITION_BONUS_PCT
    assert em.bonus_rc(100, dirty) == 0   # nothing taken
    assert em.bonus_rc(100, fresh) > 0    # something gained


def test_the_equipment_layer_can_only_ever_add():
    for pct in (0, 12, 60):
        b = em.EarnBreakdown(total_pct=pct, capped=False, hits=[], sets=[])
        assert em.bonus_rc(200, b) >= 0
    assert em.bonus_rc(0, em.resolve(["gravel_tyres"], _facts(surface="gravel"))) == 0


def test_unknown_equipment_is_ignored_not_fatal():
    """A retired item in an old loadout must not break the award path for a ride
    that already happened."""
    b = em.resolve(["retired_item", "gravel_tyres"], _facts(surface="gravel"))
    assert b.total_pct == em.MODIFIERS["gravel_tyres"].pct


# ── Eddington ───────────────────────────────────────────────────────────────

def test_eddington_matches_the_definition():
    assert ed.compute([]) == 0
    assert ed.compute([1]) == 1
    # Five rides of 5 km -> E5. A sixth of 5 km cannot make E6.
    assert ed.compute([5, 5, 5, 5, 5]) == 5
    assert ed.compute([5, 5, 5, 5, 5, 5]) == 5
    assert ed.compute([100, 90, 80, 70, 60]) == 5
    assert ed.compute([10] * 10) == 10


def test_it_cannot_be_farmed_with_short_rides():
    """Two hundred commutes move it not at all past 5. This is the property that
    makes it worth showing in a coaching app."""
    assert ed.compute([5] * 200) == 5


def test_it_never_decays():
    """Adding rides can only ever raise it — including junk ones."""
    base = [80, 75, 70, 65, 60, 55, 50]
    before = ed.compute(base)
    assert ed.compute(base + [1, 2, 3]) >= before
    assert ed.compute(base + [200]) >= before


def test_zero_and_negative_distances_are_ignored():
    assert ed.compute([0, 0, -5, 10, 10]) == 2


def test_the_next_step_is_costed_honestly():
    """`rides_needed` must be a true statement of remaining work."""
    rides = [60, 55, 52, 51, 50, 49]
    p = ed.progress(rides)
    assert p.value == ed.compute(rides)
    assert p.next_value == p.value + 1
    assert p.rides_have == sum(1 for d in rides if d >= p.next_value)
    assert p.rides_needed == max(0, p.next_value - p.rides_have)
    # Riding exactly what it asks for must actually deliver the next number.
    topped = rides + [p.next_value] * p.rides_needed
    assert ed.compute(topped) == p.next_value


def test_milestones_are_superlinear_because_the_work_is():
    assert ed.is_milestone(5) and ed.is_milestone(100)
    assert not ed.is_milestone(0) and not ed.is_milestone(7)
    assert ed.milestone_rc(7) == 0
    steps = [ed.milestone_rc(v) for v in (5, 10, 20, 50, 100)]
    assert steps == sorted(steps)
    # Each milestone is worth more than the last by a widening margin, so a
    # harder E never lands feeling cheaper than an easier one.
    gaps = [b - a for a, b in zip(steps, steps[1:])]
    assert gaps == sorted(gaps)
