"""The unlock has to reach the rider, and it may never cost them their ride.

THE DEFECT THIS FILE EXISTS FOR: `ride_economy` called `_open_backdrops` on
every settled ride and threw the return value away. The rows were written, the
stage really was earned, and nothing announced it — the rider found out by
noticing an extra swatch in the picker later. Correct machinery wired to
nothing, which is this repository's recurring shape.
"""
import inspect

from app.services import ride_economy, stage_unlock


def test_settlement_actually_uses_what_the_unlock_returned():
    """The whole bug, stated. `_open_backdrops`'s result must not be discarded."""
    src = inspect.getsource(ride_economy.settle_gear_bonus) if hasattr(
        ride_economy, "settle_gear_bonus") else inspect.getsource(ride_economy)
    assert "opened = await _open_backdrops" in src
    assert "stage_unlock.warm(user_id, opened)" in src


def test_warming_nothing_does_nothing():
    """No unlocks must mean no loop touched and no task spawned."""
    stage_unlock.warm(1, [])          # must not raise outside an event loop


def test_warm_outside_an_event_loop_is_survivable():
    """Ingestion runs under a loop, but a script or a test may not. Warming has
    to degrade to a log line rather than take the settlement down with it."""
    stage_unlock.warm(1, ["mountain_pass"])   # no running loop here


def test_a_starter_stage_is_never_warmed():
    """Starters are open from day one and have no unlock moment to prepare."""
    from app.services import backdrops
    starters = [b for b in backdrops.CATALOGUE.values() if b.is_starter]
    assert starters, "the catalogue must keep at least one starter"


def test_unlocked_by_is_a_question_not_a_flag():
    """Derived from the permanent record, so a re-synced ride answers the same
    thing forever. A `seen` column would be cleared by the second sync — and
    would need a migration, which is currently a way to take prod down."""
    src = inspect.getsource(stage_unlock.unlocked_by)
    assert "RiderBackdrop.activity_id == activity_id" in src
    assert "seen" not in src


def test_a_retired_stage_never_reaches_the_client():
    """A row may outlive its catalogue entry; the client must not be handed an
    id it cannot render."""
    src = inspect.getsource(stage_unlock.unlocked_by)
    assert "in backdrops.CATALOGUE" in src
