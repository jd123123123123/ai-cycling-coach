"""A rate limit is not a bad password.

Production, 2026-08-25: every Garmin credential had `sync_enabled = false` and
two of the three still read `sync_status = 'ok'`. The cause was one line —
`GarminRateLimitError` subclassed `GarminAuthError` — so the throttle handler
was the disable-this-rider handler, and the manual sync button kept resetting
the status on its way past so nothing looked broken.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.garmin_client import (
    GarminAuthError, GarminError, GarminRateLimitError,
)


class Cred:
    """Just the fields the backoff maths reads."""

    def __init__(self, backoff_until=None, metrics_synced_at=None, maintenance_at=None):
        self.backoff_until = backoff_until
        self.metrics_synced_at = metrics_synced_at
        self.maintenance_at = maintenance_at


NOW = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


class TestTheHierarchy:
    def test_a_rate_limit_is_not_an_auth_failure(self):
        assert not issubclass(GarminRateLimitError, GarminAuthError)

    def test_but_both_are_still_one_thing_a_fetch_can_abort_on(self):
        assert issubclass(GarminRateLimitError, GarminError)
        assert issubclass(GarminAuthError, GarminError)

    def test_catching_auth_errors_no_longer_catches_throttling(self):
        with pytest.raises(GarminRateLimitError):
            try:
                raise GarminRateLimitError("slow down")
            except GarminAuthError:                      # the disable branch
                pytest.fail("throttling was handled as a credential failure")


class TestBackoff:
    def test_a_first_refusal_buys_a_quarter_of_an_hour(self):
        from app.services.garmin_sync_service import _next_backoff

        assert _next_backoff(Cred(), NOW) == NOW + timedelta(minutes=15)

    def test_refusing_again_while_still_backed_off_doubles_it(self):
        from app.services.garmin_sync_service import _next_backoff

        c = Cred(backoff_until=NOW + timedelta(minutes=15))
        assert _next_backoff(c, NOW) == NOW + timedelta(minutes=30)

    def test_it_stops_doubling_at_four_hours(self):
        from app.services.garmin_sync_service import _next_backoff

        c = Cred(backoff_until=NOW + timedelta(hours=6))
        assert _next_backoff(c, NOW) == NOW + timedelta(minutes=240)

    def test_an_expired_backoff_starts_over_rather_than_compounding(self):
        from app.services.garmin_sync_service import _next_backoff

        c = Cred(backoff_until=NOW - timedelta(hours=6))
        assert _next_backoff(c, NOW) == NOW + timedelta(minutes=15)


class TestTheGates:
    def test_never_having_run_is_due(self):
        from app.services.garmin_sync_service import _due

        assert _due(None, NOW, 20) is True

    def test_the_biometrics_are_not_refetched_every_minute(self):
        from app.services.garmin_sync_service import _due

        assert _due(NOW - timedelta(minutes=1), NOW, 20) is False
        assert _due(NOW - timedelta(minutes=19), NOW, 20) is False

    def test_but_they_are_refetched(self):
        from app.services.garmin_sync_service import _due

        assert _due(NOW - timedelta(minutes=20), NOW, 20) is True

    def test_the_backfills_wait_hours_not_minutes(self):
        from app.services.garmin_sync_service import (
            MAINTENANCE_MIN_INTERVAL_MINUTES as M, _due,
        )

        assert M >= 60
        assert _due(NOW - timedelta(minutes=59), NOW, M) is False
        assert _due(NOW - timedelta(minutes=M), NOW, M) is True
