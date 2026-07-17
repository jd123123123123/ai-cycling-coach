"""Pydantic schemas for Wahoo Cloud API endpoints.

Request/response shapes for:
- GET  /wahoo/connect  (→ WahooConnectResponse: the authorize URL)
- GET  /wahoo/status   (→ WahooStatusResponse)
- POST /wahoo/sync     (→ WahooSyncResponse)
- DELETE /wahoo        (→ WahooDisconnectResponse)
"""
from datetime import datetime

from pydantic import BaseModel


class WahooConnectResponse(BaseModel):
    """Response for GET /wahoo/connect — the Wahoo OAuth authorize URL to open."""

    authorize_url: str


class WahooStatusResponse(BaseModel):
    """Response for GET /wahoo/status.

    When connected=False, all other fields will be None (account not linked).
    """

    connected: bool
    wahoo_user_id: str | None = None
    last_sync: datetime | None = None


class WahooSyncResponse(BaseModel):
    """Response for POST /wahoo/sync and the webhook ingest."""

    workouts_imported: int
    message: str = "Sync complete"


class WahooDisconnectResponse(BaseModel):
    """Response for DELETE /wahoo."""

    message: str
