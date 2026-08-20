"""The calendar clock, dormancy, seeding from history, and photo proof.

These four are one feature: a maintenance surface that starts from the truth
about a specific bicycle instead of from zero and a guess about kilometres.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.services import bike_wear as w
from app.services import service_proof as sp
from app.services import workshop


# ── the calendar clock ──────────────────────────────────────────────────────

def test_a_part_that_ages_in_a_cellar_ages_in_a_cellar():
    """Sealant dries out by evaporation and DOT fluid absorbs water from the
    air. Neither cares whether the wheel turned, so zero kilometres must not
    read as fresh forever — the whole reason these two exist in the catalogue.
    """
    spec = w.COMPONENTS["sealant"]
    assert w.status_of(0, spec.interval_km, spec.interval_days - 1, spec.interval_days) == "fresh"
    assert w.status_of(0, spec.interval_km, spec.interval_days + 1, spec.interval_days) == "due"


def test_kilometres_cannot_make_a_calendar_part_due():
    """And the converse, which is the subtler half: a rider who does 8 000 km in
    four months has sealant exactly as old as one who did 800."""
    a = w.state_of("sealant", km_since=8000, km_total=8000, days_since=30, owned=True)
    b = w.state_of("sealant", km_since=800, km_total=800, days_since=30, owned=True)
    assert a.status == b.status == "fresh"
    assert a.bonus_rc == b.bonus_rc


def test_whichever_comes_first_is_what_the_industry_says():
    """A part with both clocks comes due on the one that arrives first — the
    literal reading of "every 5 000 km or every 6 months"."""
    both = w.ComponentSpec(
        id="x", name_de="X", interval_km=5000, rc_at_interval=100,
        action_de="", interval_days=180,
    )
    assert w.elapsed(both, km_since=5000, days_since=1) == 1.0     # km got there
    assert w.elapsed(both, km_since=10, days_since=180) == 1.0     # the calendar did
    assert w.which_clock(both, km_since=10, days_since=180) == "days"
    assert w.which_clock(both, km_since=5000, days_since=1) == "km"


def test_the_meter_is_labelled_with_the_clock_that_is_running():
    """Showing a sealant top-up as "1 200 / — km" is the exact confusion this
    release exists to remove, so the state carries which unit to print."""
    assert w.state_of("sealant", 1200, 1200, days_since=60, owned=True).clock == "days"
    assert w.state_of("chain", 120, 4000).clock == "km"


# ── dormancy: never nag about a part the bicycle does not have ──────────────

def test_an_unasked_optional_part_is_a_question_not_a_job():
    s = w.state_of("brakefluid", 0, 0, days_since=None, owned=None)
    assert s.dormant is True
    assert s.status == "unknown"       # not "fresh", which would be a claim
    assert s.bonus_rc == 0


def test_a_rim_brake_rider_is_never_asked_again():
    """`owned=False` is permanent until changed, and it is the whole reason the
    column is a tri-state: a boolean cannot tell "no" from "not yet asked", so
    the app would ask forever or decide for them."""
    s = w.state_of("brakefluid", 0, 0, days_since=900, owned=False)
    assert s.dormant is True
    assert s.status == "unknown"


def test_confirming_a_part_starts_its_clock():
    s = w.state_of("brakefluid", 0, 0, days_since=400, owned=True)
    assert s.dormant is False
    assert s.status == "due"           # a year old, which is the real interval
    assert s.bonus_rc > 0


def test_the_parts_every_bicycle_has_are_never_dormant():
    """Only the optional ones are gated. A chain needs no confirmation."""
    for cid in ("chain", "tyres", "brakes", "bartape", "cassette"):
        assert w.state_of(cid, 0, 0).dormant is False
        assert w.COMPONENTS[cid].optional is False


# ── proof pays on top and can never take anything away ──────────────────────

def test_proof_adds_and_never_gates():
    """THE INVARIANT. `bike_wear` exists because a maintenance loop that
    punishes is a burnout loop, and a photo requirement would be exactly that —
    a flat phone or a dark garage would withhold RideCoin the rider earned by
    riding. So the base is never touched and the photo only ever adds."""
    base = 150
    confirmed = sp.ProofVerdict(True, True, True, "sieht gut aus")
    assert sp.bonus_rc(base, confirmed) > 0
    for bad in (
        sp.ProofVerdict(False, False, False, "nichts erkannt"),
        sp.ProofVerdict(False, True, False, "noch schwarz"),
        sp._unavailable("no model"),
    ):
        assert sp.bonus_rc(base, bad) == 0        # zero, never negative


def test_an_unreadable_photo_blames_the_app_and_not_the_rider():
    v = sp._unavailable("no key")
    assert v.unavailable is True
    assert v.confirmed is False
    # The message must not imply the rider did anything wrong, and it must say
    # the money is safe — that reassurance is the whole point of the wording.
    assert "trotzdem" in v.note_de


def test_a_dirty_chain_photographed_honestly_is_not_a_confirmed_service():
    """`confirmed` is the CONJUNCTION on purpose. A photo can show the right
    component and show that it has not been touched."""
    assert sp.ProofVerdict(False, True, False, "").confirmed is False


@pytest.mark.asyncio
async def test_the_proof_check_never_raises_whatever_it_is_given():
    """It runs inside a reward transaction. An exception would roll back a
    service the rider genuinely performed."""
    for photo, cid in (("", "chain"), ("not-base64", "chain"), ("x", "nonsense")):
        v = await sp.check(photo, cid)
        assert v.confirmed is False


def test_every_component_tells_the_rider_where_to_point_the_camera():
    """"Photograph your service" produces a picture of a whole bicycle from
    three metres away, in which nothing is legible."""
    for cid in w.COMPONENTS:
        assert cid in sp.FRAMING_DE and len(sp.FRAMING_DE[cid]) > 15


# ── seeding: the clock starts from truth, not from zero ─────────────────────

def test_days_since_is_none_when_we_were_never_told():
    """None rather than zero, and the difference is the feature: defaulting an
    unknown age to "serviced today" would mark every rider's four-year-old brake
    fluid fresh forever."""
    now = datetime.now(timezone.utc)
    assert workshop._days_since(None, now) is None
    assert workshop._days_since(now - timedelta(days=3, hours=1), now) == 3


def test_a_naive_timestamp_does_not_crash_the_clock():
    """Rows written before the column was timezone-aware come back naive, and an
    aware-minus-naive subtraction raises TypeError — in the middle of the
    workshop read, which is on the garage's critical path."""
    now = datetime.now(timezone.utc)
    naive = (now - timedelta(days=10)).replace(tzinfo=None)
    assert workshop._days_since(naive, now) == 10


def test_a_confirmed_part_with_no_date_is_unknown_and_never_fresh():
    """THE BUG THIS PINS, found by clicking through the real screen. Answering
    "ja, hab ich" to the brake-fluid question set `owned=True` and left the date
    empty, so `elapsed` was zero and the row rendered FRISCH — the app telling a
    rider their four-year-old fluid was fine, which is precisely the claim the
    seeding question exists to stop it making.

    Zero on a calendar part is not a reading. It is a missing reading.
    """
    s = w.state_of("brakefluid", 0, 0, days_since=None, owned=True)
    assert s.dormant is False          # they confirmed they have it
    assert s.undated is True           # but we still do not know its age
    assert s.status == "unknown"       # so we claim nothing
    assert s.bonus_rc == 0


def test_a_kilometre_part_is_never_undated():
    """Kilometres are measured rather than remembered, so a chain always has a
    reading even when nobody has told us when it was last oiled."""
    s = w.state_of("chain", 300, 300, days_since=None)
    assert s.undated is False
    assert s.status == "due"
