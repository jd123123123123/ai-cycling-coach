from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Valid consent types
ConsentType = Literal["health_data", "garmin_sync", "coaching_ai", "data_analytics"]


class ConsentRequest(BaseModel):
    consent_type: ConsentType
    consent_version: str
    granted: bool
    consent_text: str


class ConsentResponse(BaseModel):
    id: int
    consent_type: str
    consent_version: str
    granted: bool
    granted_at: datetime | None = None
    withdrawn_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
