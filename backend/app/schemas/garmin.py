"""Pydantic schemas for Garmin Connect API endpoints.

These schemas define the request/response shapes for:
- POST /garmin/connect (GarminConnectRequest → GarminSyncResponse)
- DELETE /garmin/disconnect (→ GarminDisconnectResponse)
- GET /garmin/status (→ GarminStatusResponse)
- POST /garmin/sync (→ GarminSyncResponse)
"""
from datetime import date, datetime

from pydantic import BaseModel, Field


class GarminConnectRequest(BaseModel):
    """Request body for POST /garmin/connect."""

    email: str
    password: str


class GarminStatusResponse(BaseModel):
    """Response for GET /garmin/status.

    When connected=False, all other fields will be None (account not linked).
    sync_status values: "ok" | "auth_error" | "syncing" | "error" | None
    """

    connected: bool
    sync_enabled: bool | None = None
    last_sync_at: datetime | None = None
    sync_status: str | None = None


class GarminSyncResponse(BaseModel):
    """Response for POST /garmin/connect and POST /garmin/sync.

    `dates_touched` enumerates every athlete-day the sync may have changed
    (activity date through today, inclusive). Frontends use it for targeted
    React Query invalidation. Defaults to `[]` so older clients don't break.
    """

    activities_synced: int
    metrics_days: int
    message: str
    dates_touched: list[date] = Field(default_factory=list)


class GarminDisconnectResponse(BaseModel):
    """Response for DELETE /garmin/disconnect."""

    message: str
