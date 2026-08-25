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
    GarminAuthError, GarminError, GarminRateLimitError, GarminTransientError,
)


class Cred:
    """Just the fields the backoff maths reads."""

    def __init__(self, backoff_until=None, metrics_synced_at=None,
                 maintenance_at=None, auth_failures=0):
        self.backoff_until = backoff_until
        self.metrics_synced_at = metrics_synced_at
        self.maintenance_at = maintenance_at
        self.auth_failures = auth_failures


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


class TestTransientIsNotACredentialVerdict:
    """The second half of the same bug, one level down.

    The client wrapped `authenticate()` in a bare `except Exception` and raised
    `GarminAuthError` from it — so a dropped connection was indistinguishable
    from a wrong password, and the sync disabled the rider. Production,
    2026-08-25: two riders were switched off this way sixty seconds after those
    credentials had authenticated and pulled seven rides.
    """

    def test_a_network_failure_is_not_an_auth_failure(self):
        assert not issubclass(GarminTransientError, GarminAuthError)
        assert issubclass(GarminTransientError, GarminError)

    def test_it_earns_a_backoff_like_any_other_transient_refusal(self):
        from app.services.garmin_sync_service import _next_backoff

        assert _next_backoff(Cred(), NOW) == NOW + timedelta(minutes=15)


class TestOneAuthFailureIsNotAVerdict:
    """Drives `create_garmin_client_for_user` with a login that always refuses."""

    @staticmethod
    def _always_fails(monkeypatch, exc):
        import app.services.garmin_client as gc

        class Refuses:
            def __init__(self, **kwargs):
                pass

            async def authenticate(self):
                raise exc

        monkeypatch.setattr(gc, "GarminHealthDataClient", Refuses)

    async def _attempt(self, cred, monkeypatch, exc=None):
        from app.services.garmin_client import GarminAuthError as AE
        from app.services.garmin_sync_service import create_garmin_client_for_user

        self._always_fails(monkeypatch, exc or AE("nope"))
        with pytest.raises(Exception):
            await create_garmin_client_for_user(cred)

    async def test_the_first_two_failures_leave_the_rider_enabled(self, monkeypatch):
        from app.services.garmin_sync_service import AUTH_FAILURES_BEFORE_DISABLE

        cred = Cred()
        cred.user_id, cred.sync_enabled, cred.sync_status = 1, True, "ok"
        cred.encrypted_email = cred.encrypted_password = cred.token_store_path = "x"

        for n in range(1, AUTH_FAILURES_BEFORE_DISABLE):
            await self._attempt(cred, monkeypatch)
            assert cred.auth_failures == n
            assert cred.sync_enabled is True, (
                f"failure {n} of {AUTH_FAILURES_BEFORE_DISABLE} switched the rider off"
            )
            assert cred.backoff_until is not None

    async def test_the_third_one_disables(self, monkeypatch):
        from app.services.garmin_sync_service import AUTH_FAILURES_BEFORE_DISABLE

        cred = Cred(auth_failures=AUTH_FAILURES_BEFORE_DISABLE - 1)
        cred.user_id, cred.sync_enabled, cred.sync_status = 1, True, "ok"
        cred.encrypted_email = cred.encrypted_password = cred.token_store_path = "x"

        await self._attempt(cred, monkeypatch)

        assert cred.sync_enabled is False
        assert cred.sync_status == "auth_error"

    async def test_a_dropped_connection_never_counts_against_the_credential(self, monkeypatch):
        cred = Cred()
        cred.user_id, cred.sync_enabled, cred.sync_status = 1, True, "ok"
        cred.encrypted_email = cred.encrypted_password = cred.token_store_path = "x"

        for _ in range(5):
            await self._attempt(cred, monkeypatch, GarminTransientError("reset by peer"))

        assert cred.auth_failures == 0
        assert cred.sync_enabled is True
