"""Garmin Connect client using garmin-health-data.

Replaces python-garminconnect + garth with diegoscarabelli/garmin-health-data,
which uses a 5-strategy OAuth2 SSO fallback chain with curl_cffi TLS browser
fingerprint impersonation to bypass Cloudflare WAF bot detection.

Auth flow:
    1. If token_store_path contains garmin_tokens.json, load + refresh — no login needed.
    2. Otherwise: login(email, password) via the 5-strategy chain (~30–45 s) then
       dump tokens to token_store_path for all future syncs.

Missing endpoints vs old garminconnect library:
    get_hrv         — no dedicated endpoint; returns None (HRV syncs as null)
    get_body_battery — no dedicated endpoint; returns [] (body battery syncs as null)
"""
import asyncio
import logging
import os
from datetime import date
from typing import Protocol

logger = logging.getLogger(__name__)


class GarminAuthError(Exception):
    """Raised when Garmin Connect authentication fails."""


class GarminRateLimitError(GarminAuthError):
    """Raised when Garmin rate-limits the server IP."""


class GarminProvider(Protocol):
    """Structural typing interface for Garmin data providers."""

    async def authenticate(self) -> None: ...
    async def get_activities(self, start_date: date, end_date: date) -> list[dict]: ...
    async def get_sleep(self, for_date: date) -> dict | None: ...
    async def get_hrv(self, for_date: date) -> dict | None: ...
    async def get_body_battery(self, start_date: date, end_date: date) -> list[dict]: ...
    async def get_training_status(self, for_date: date) -> dict | None: ...
    async def get_heart_rates(self, for_date: date) -> dict | None: ...
    async def get_stress(self, for_date: date) -> dict | None: ...
    async def get_user_summary(self, for_date: date) -> dict | None: ...
    async def get_intraday_stress(self, for_date: date) -> dict | None: ...
    async def get_training_readiness(self, for_date: date) -> dict | None: ...
    async def get_activity_details(self, activity_id: int, max_chart_size: int = ...) -> dict | None: ...


class GarminHealthDataClient:
    """Async wrapper around garmin-health-data's GarminClient.

    Implements GarminProvider via structural subtyping.
    All sync library calls run in asyncio.to_thread() to avoid blocking the event loop.

    Token store:
        Tokens are persisted at {token_store_path}/garmin_tokens.json.
        On subsequent auths, tokens load and auto-refresh without requiring credentials.
        The directory must exist before authenticate() is called.

    Rate limiting:
        GarminTooManyRequestsError is surfaced as GarminRateLimitError so the API
        layer can return HTTP 429 with a user-friendly message.
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
        self._api = None

    async def authenticate(self) -> None:
        from garmin_health_data.garmin_client.client import GarminClient  # noqa: PLC0415
        from garmin_health_data.garmin_client.exceptions import (  # noqa: PLC0415
            GarminAuthenticationError,
            GarminTooManyRequestsError,
        )

        def _auth_sync():
            # Token-first: skip password auth if we have a persisted session.
            if self._token_store_path:
                token_file = os.path.join(self._token_store_path, "garmin_tokens.json")
                if os.path.exists(token_file):
                    try:
                        client = GarminClient.from_tokens(self._token_store_path)
                        logger.info("Loaded Garmin tokens from %s", self._token_store_path)
                        return client
                    except Exception as exc:
                        logger.warning("Token load failed, re-authenticating: %s", exc)

            # Fresh login — runs 5-strategy SSO chain, may take up to ~45 s.
            client = GarminClient()
            client.login(self._email, self._password)
            if self._token_store_path:
                client.dump(self._token_store_path)
                logger.info("Garmin tokens saved to %s", self._token_store_path)
            return client

        try:
            self._api = await asyncio.to_thread(_auth_sync)
            logger.info("Garmin authentication successful for %s", self._email)
        except GarminTooManyRequestsError as exc:
            logger.warning("Garmin rate limit hit for %s: %s", self._email, exc)
            raise GarminRateLimitError("Garmin is rate-limiting this server IP") from exc
        except GarminAuthenticationError as exc:
            logger.error("Garmin authentication failed for %s: %s", self._email, exc)
            raise GarminAuthError(f"Garmin auth failed: {exc}") from exc
        except Exception as exc:
            logger.error("Unexpected error during Garmin auth for %s: %s", self._email, exc)
            raise GarminAuthError(f"Garmin auth error: {exc}") from exc

    async def _ensure_auth(self) -> None:
        if self._api is None:
            await self.authenticate()

    def _wrap(self, fn, *args, **kwargs):
        """Run a sync Garmin API call, translating auth/rate-limit errors."""
        from garmin_health_data.garmin_client.exceptions import (  # noqa: PLC0415
            GarminAuthenticationError,
            GarminTooManyRequestsError,
        )
        try:
            return fn(*args, **kwargs)
        except GarminTooManyRequestsError as exc:
            raise GarminRateLimitError("Garmin rate limit hit") from exc
        except GarminAuthenticationError as exc:
            raise GarminAuthError(f"Auth error: {exc}") from exc

    async def get_activities(self, start_date: date, end_date: date) -> list[dict]:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap,
            self._api.get_activities_by_date,
            start_date.isoformat(),
            end_date.isoformat(),
        )

    async def get_sleep(self, for_date: date) -> dict | None:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap, self._api.get_sleep_data, for_date.isoformat()
        )

    async def get_hrv(self, for_date: date) -> dict | None:
        # garmin-health-data omits this endpoint but the OAuth token grants full API
        # access. Call the HRV service directly via _connectapi — same auth/retry logic.
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap,
            self._api._connectapi,
            f"/hrv-service/hrv/{for_date.isoformat()}",
        )

    async def get_body_battery(self, start_date: date, end_date: date) -> list[dict]:
        # garmin-health-data omits this endpoint but the OAuth token grants full API
        # access. Call the body battery daily reports endpoint directly via _connectapi.
        await self._ensure_auth()
        result = await asyncio.to_thread(
            self._wrap,
            self._api._connectapi,
            "/wellness-service/wellness/bodyBattery/reports/daily",
            params={"startDate": start_date.isoformat(), "endDate": end_date.isoformat()},
        )
        return result if isinstance(result, list) else []

    async def get_weigh_ins(self, start_date: date, end_date: date) -> dict | None:
        # Weight/body-composition from the free weight-service (scale or manual
        # entries in Garmin Connect). Range-native like body battery — one call
        # per sync, not per day.
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap,
            self._api._connectapi,
            f"/weight-service/weight/range/{start_date.isoformat()}/{end_date.isoformat()}",
            params={"includeAll": True},
        )

    async def get_training_status(self, for_date: date) -> dict | None:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap, self._api.get_training_status, for_date.isoformat()
        )

    async def get_heart_rates(self, for_date: date) -> dict | None:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap, self._api.get_heart_rates, for_date.isoformat()
        )

    async def get_stress(self, for_date: date) -> dict | None:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap, self._api.get_stress_data, for_date.isoformat()
        )

    async def get_user_summary(self, for_date: date) -> dict | None:
        """Adapt get_steps_data to the {totalSteps: N} shape the mapper expects."""
        await self._ensure_auth()
        steps_list = await asyncio.to_thread(
            self._wrap, self._api.get_steps_data, for_date.isoformat()
        )
        if not steps_list:
            return None
        total = sum(entry.get("steps", 0) or 0 for entry in steps_list)
        return {"totalSteps": total}

    async def get_intraday_stress(self, for_date: date) -> dict | None:
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap, self._api.get_stress_data, for_date.isoformat()
        )

    async def get_training_readiness(self, for_date: date) -> dict | None:
        """Garmin training readiness for a given date.

        Hits /metrics-service/metrics/trainingreadiness/{date} via the
        underlying _connectapi (same pattern as get_hrv / get_body_battery —
        garmin-health-data omits a typed wrapper but the OAuth token grants
        full API access). Returns the raw JSON dict; mapping is the caller's
        responsibility. Auth/rate-limit errors are translated by self._wrap.
        """
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap,
            self._api._connectapi,
            f"/metrics-service/metrics/trainingreadiness/{for_date.isoformat()}",
        )

    async def get_activity_details(
        self, activity_id: int, max_chart_size: int = 10000
    ) -> dict | None:
        """Per-second activity sample stream (power/HR/cadence/elevation/timestamp).

        Hits /activity-service/activity/{id}/details via _connectapi (same
        token-grants-full-access pattern as get_hrv / get_body_battery —
        garmin-health-data ships no typed wrapper for it). `max_chart_size`
        caps the number of returned sample rows; Garmin downsamples longer
        rides to fit, so we request a high ceiling for ~1 Hz fidelity. The raw
        payload is parsed by garmin_details_parser.garmin_details_to_records.
        """
        await self._ensure_auth()
        return await asyncio.to_thread(
            self._wrap,
            self._api._connectapi,
            f"/activity-service/activity/{activity_id}/details",
            params={"maxChartSize": max_chart_size, "maxPolylineSize": 0},
        )
