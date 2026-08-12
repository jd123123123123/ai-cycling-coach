"""/garage/* — the rider's bike, as a W3:Ride-style collectible.

`POST /garage/bike/render` takes a photo of the rider's real bike and returns
a stylised render plus the structured analysis of *their* bike. See
`services/bike_render.py` for the honest two-stage pipeline and the image-model
boundary. The render is a stylised, identity-preserving image — not an exact
3D mesh; the client copy reflects that.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.dependencies import get_current_active_user
from app.models.user import User
from app.services import bike_render

router = APIRouter(prefix="/garage", tags=["garage"])


class BikeRenderRequest(BaseModel):
    # A base64 data URI or raw base64 JPEG/PNG of the rider's bike photo.
    photo_base64: str = Field(min_length=32, max_length=12_000_000)


class BikeAnalysisOut(BaseModel):
    bike_type: str
    frame_color: str
    accent_color: str | None
    wheels: str
    groupset: str | None
    handlebar: str
    distinctive: str
    confidence: float


class BikeRenderResponse(BaseModel):
    analysis: BikeAnalysisOut
    prompt: str
    # data:image/png;base64,... when an image model is provisioned; null when
    # only the analysis stage ran (image model not yet available).
    image_base64: str | None
    status: str  # "ok" | "image_model_unavailable"


@router.post("/bike/render", response_model=BikeRenderResponse)
async def render_bike(
    body: BikeRenderRequest,
    current_user: User = Depends(get_current_active_user),
) -> BikeRenderResponse:
    try:
        out = await bike_render.render_from_photo(body.photo_base64)
    except RuntimeError as exc:
        if str(exc) == "vision_model_unavailable":
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Bike recognition isn't configured on this server yet.",
            ) from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Couldn't read the bike photo.") from exc
    return BikeRenderResponse(
        analysis=BikeAnalysisOut(**out["analysis"]),
        prompt=out["prompt"],
        image_base64=out["image_b64"],
        status=out["status"],
    )
