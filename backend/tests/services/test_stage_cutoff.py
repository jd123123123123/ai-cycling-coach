"""Stages are earned from new rides only, on BOTH paths.

A rider with three seasons in the app must not open the feature and be handed
forty stages at once. That is not forty rewards — it is one undifferentiated
dump that teaches them the stages mean nothing.

TWO PATHS, and gating one is worse than gating neither, because it looks like it
worked: `ride_economy._open_backdrops` fires at ingestion, and
`api/garage._cheap_history_facts` re-evaluates a rider's whole history every
time they open the picker.
"""
import inspect
from datetime import datetime, timedelta, timezone

from app.api import garage
from app.services import backdrops, ride_economy


def test_a_ride_from_before_the_launch_never_counts():
    assert backdrops.counts_for_stages(backdrops.STAGES_LIVE_FROM - timedelta(seconds=1)) is False


def test_a_ride_from_the_launch_onward_counts():
    assert backdrops.counts_for_stages(backdrops.STAGES_LIVE_FROM) is True
    assert backdrops.counts_for_stages(backdrops.STAGES_LIVE_FROM + timedelta(days=400)) is True


def test_a_naive_timestamp_is_read_as_utc_rather_than_rejected():
    """Ingestion has handed naive datetimes before; a rider syncing across
    midnight must not lose an unlock to a tzinfo mismatch."""
    naive = (backdrops.STAGES_LIVE_FROM + timedelta(days=1)).replace(tzinfo=None)
    assert backdrops.counts_for_stages(naive) is True


def test_a_ride_with_no_date_never_counts():
    """An unlock has to be attributable to a real day — `unlocked_by` promises
    the rider one."""
    assert backdrops.counts_for_stages(None) is False


def test_the_ingestion_path_is_gated():
    src = inspect.getsource(ride_economy._open_backdrops)
    assert "counts_for_stages(activity.started_at)" in src


def test_the_live_history_path_is_gated_too():
    """The one that would silently undo the whole thing."""
    src = inspect.getsource(garage._cheap_history_facts)
    assert "Activity.started_at >= backdrops.STAGES_LIVE_FROM" in src
