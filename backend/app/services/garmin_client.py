"""Garmin Connect client abstraction layer.

Defines the GarminProvider Protocol (structural typing interface) and
GarminConnectClient (concrete implementation wrapping the unofficial
python-garminconnect library).

ALL sync library calls are wrapped in asyncio.to_thread() to avoid
blocking the FastAPI event loop. The garminconnect library uses the
requests library internally (synchronous HTTP).

Usage:
    client = GarminConnectClient(email="me@example.com", password="secret")
    await client.authenticate()
    activities = await client.get_activities(start_date, end_date)

Architecture:
    Business logic (garmin_sync_service.py) imports GarminProvider (Protocol),
    not GarminConnectClient directly. This allows swapping the unofficial library
    for the official Garmin Connect API later without changing business logic.
"""
import asyncio
import logging
from datetime import date
from typing import Protocol

logger = logging.getLogger(__name__)


class GarminAuthError(Exception):
    """Raised when Garmin Connect authentication fails.

    Caught by the sync service to disable sync and update sync_status
    to "auth_error" on the GarminCredential record.
    """


class GarminProvider(Protocol):
    """Structural typing interface for Garmin data providers.

    Concrete implementations must provide all listed async methods.
    Business logic imports this Protocol rather than GarminConnectClient,
    enabling future swap to the official Garmin API without touching
    sync service code.
    """

    async def authenticate(self) -> None: ...

    async def get_activities(self, start_date: date, end_date: date) -> list[dict]: ...

    async def get_sleep(self, for_date: date) -> dict | None: ...

    async def get_hrv(self, for_date: date) -> dict | None: ...

    async def get_body_battery(self, start_date: date, end_date: date) -> list[dict]: ...

    async def get_training_status(self, for_date: date) -> dict | None: ...

    async def get_heart_rates(self, for_date: date) -> dict | None: ...

    async def get_stress(self, for_date: date) -> dict | None: ...

    async def get_user_summary(self, for_date: date) -> dict | None: ...


class GarminConnectClient:
    """Async wrapper around the unofficial python-garminconnect library.

    Implements GarminProvider via structural subtyping (no explicit
    `implements GarminProvider` — duck typing is sufficient for Protocol).

    All sync library calls are wrapped in asyncio.to_thread() to prevent
    blocking the FastAPI event loop. The garminconnect library uses the
    requests library which is synchronous.

    Token store:
        Garmin OAuth tokens are persisted at token_store_path (a directory).
        On subsequent logins, the library reuses stored tokens without
        requiring re-entry of credentials. Recommended path:
        /data/garmin_tokens/{user_id}/

    Auth error handling:
        GarminConnectAuthenticationError is caught and re-raised as
        GarminAuthError so the sync service can set sync_enabled=False
        and update sync_status="auth_error" on the credential record.
    """

    def __init__(
        self,
        email: str,
        password: str,
        token_store_path: str | None = None,
    ) -> None:
        self._email = email
        self._password = password
        self._token_store_path = token_store_path
        self._api = None  # Set after authenticate()

    async def authenticate(self) -> None:
        """Authenticate with Garmin Connect and store the API client.

        Uses stored OAuth tokens if token_store_path exists; falls back to
        password login. Raises GarminAuthError on any auth failure.
        """
        from garminconnect import Garmin, GarminConnectAuthenticationError  # noqa: PLC0415

        def _login_sync():
            api = Garmin(self._email, self._password)
            api.login(tokenstore=self._token_store_path)
            return api

        try:
            self._api = await asyncio.to_thread(_login_sync)
            logger.info("Garmin authentication successful for %s", self._email)
        except GarminConnectAuthenticationError as exc:
            logger.error("Garmin authentication failed for %s: %s", self._email, exc)
            raise GarminAuthError(f"Garmin auth failed: {exc}") from exc
        except Exception as exc:
            logger.error("Unexpected error during Garmin auth for %s: %s", self._email, exc)
            raise GarminAuthError(f"Garmin auth error: {exc}") from exc

    async def _ensure_auth(self) -> None:
        """Ensure the API client is authenticated before use."""
        if self._api is None:
            await self.authenticate()

    async def get_activities(self, start_date: date, end_date: date) -> list[dict]:
        """Fetch activities for the date range (inclusive).

        Returns a list of activity dicts from get_activities_by_date.
        Each dict contains activityId, activityType, duration, distance, etc.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_activities_by_date,
                start_date.isoformat(),
                end_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_activities: %s", exc)
            raise GarminAuthError(f"Auth error during get_activities: {exc}") from exc

    async def get_sleep(self, for_date: date) -> dict | None:
        """Fetch sleep data for a single date.

        Returns dict with dailySleepDTO key, or None if no data available.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_sleep_data,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_sleep: %s", exc)
            raise GarminAuthError(f"Auth error during get_sleep: {exc}") from exc

    async def get_hrv(self, for_date: date) -> dict | None:
        """Fetch HRV data for a single date.

        Returns None if the device does not support HRV or data unavailable.
        Callers must guard against None before accessing keys.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_hrv_data,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_hrv: %s", exc)
            raise GarminAuthError(f"Auth error during get_hrv: {exc}") from exc

    async def get_body_battery(
        self, start_date: date, end_date: date
    ) -> list[dict]:
        """Fetch body battery data for the date range.

        Returns a list of daily objects; use [0] when fetching a single day.
        Each object has a `charged` field with the peak body battery value.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_body_battery,
                start_date.isoformat(),
                end_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_body_battery: %s", exc)
            raise GarminAuthError(f"Auth error during get_body_battery: {exc}") from exc

    async def get_training_status(self, for_date: date) -> dict | None:
        """Fetch training status for a single date.

        Returns dict with trainingStatus sub-key (e.g., "PRODUCTIVE", "RECOVERY").
        Store in raw_data on DailyMetric — no dedicated column in current schema.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_training_status,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_training_status: %s", exc)
            raise GarminAuthError(f"Auth error during get_training_status: {exc}") from exc

    async def get_heart_rates(self, for_date: date) -> dict | None:
        """Fetch heart rate data including resting HR for a single date."""
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_heart_rates,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_heart_rates: %s", exc)
            raise GarminAuthError(f"Auth error during get_heart_rates: {exc}") from exc

    async def get_stress(self, for_date: date) -> dict | None:
        """Fetch all-day stress data for a single date.

        Returns dict with avgStressLevel field.
        """
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_all_day_stress,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_stress: %s", exc)
            raise GarminAuthError(f"Auth error during get_stress: {exc}") from exc

    async def get_user_summary(self, for_date: date) -> dict | None:
        """Fetch user daily summary including steps for a single date."""
        from garminconnect import GarminConnectAuthenticationError  # noqa: PLC0415
        await self._ensure_auth()
        try:
            return await asyncio.to_thread(
                self._api.get_user_summary,
                for_date.isoformat(),
            )
        except GarminConnectAuthenticationError as exc:
            logger.error("Auth error in get_user_summary: %s", exc)
            raise GarminAuthError(f"Auth error during get_user_summary: {exc}") from exc
