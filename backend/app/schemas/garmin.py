"""Pydantic schemas for Garmin Connect API endpoints.

These schemas define the request/response shapes for:
- POST /garmin/connect (GarminConnectRequest → GarminSyncResponse)
- DELETE /garmin/disconnect (→ GarminDisconnectResponse)
- GET /garmin/status (→ GarminStatusResponse)
- POST /garmin/sync (→ GarminSyncResponse)
"""
from datetime import datetime

from pydantic import BaseModel


class GarminConnectRequest(BaseModel):
    """Request body for POST /garmin/connect.

    Credentials are stored encrypted at rest in the garmin_credentials table.
    The password must be a valid Garmin Connect password; it will be used for
    re-authentication when OAuth tokens expire.
    """

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

    Reports the outcome of a sync operation including counts of new data.
    """

    activities_synced: int
    metrics_days: int
    message: str


class GarminDisconnectResponse(BaseModel):
    """Response for DELETE /garmin/disconnect."""

    message: str
