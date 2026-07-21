"""Pydantic schemas for COROS Open API endpoints.

Request/response shapes for:
- GET  /coros/connect  (→ CorosConnectResponse: the authorize URL)
- GET  /coros/status   (→ CorosStatusResponse)
- POST /coros/sync     (→ CorosSyncResponse)
- DELETE /coros        (→ CorosDisconnectResponse)
"""
from datetime import datetime

from pydantic import BaseModel


class CorosConnectResponse(BaseModel):
    """Response for GET /coros/connect — the COROS OAuth authorize URL to open."""

    authorize_url: str


class CorosStatusResponse(BaseModel):
    """Response for GET /coros/status.

    ``configured`` reflects whether the server has COROS partner credentials
    (client id + secret) at all. When the server is not configured the UI shows
    an honest "Bald verfügbar / Coming soon" state instead of a broken Connect
    button. When connected=False the account simply isn't linked yet.
    """

    connected: bool
    configured: bool
    coros_user_id: str | None = None
    last_sync: datetime | None = None


class CorosSyncResponse(BaseModel):
    """Response for POST /coros/sync."""

    workouts_imported: int
    message: str = "Sync complete"


class CorosDisconnectResponse(BaseModel):
    """Response for DELETE /coros."""

    message: str
