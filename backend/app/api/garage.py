"""/garage/* — the rider's collectible avatar, bike, and scene.

The generation pipeline is `services/cyclr_studio.py` (the cycl_r-studio
prompts + deterministic seed), with the ride's GPX feeding the scene's
`training_context` via `services/ride_scene.py`. Every render is honestly gated:
with no image model provisioned the endpoints return the prompt they *would*
send and `status="image_model_unavailable"`, never a fake image. Outputs are
stylised, identity-preserving renders — not exact 3D meshes.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies import get_current_active_user
from app.models.user import User
from app.services import cyclr_studio
from app.services.ride_scene import RideGeo, training_context

router = APIRouter(prefix="/garage", tags=["garage"])


class AssetRenderRequest(BaseModel):
    # base64 data URI or raw base64 of the rider's selfie (kind=rider) or bike (kind=bike).
    photo_base64: str = Field(min_length=32, max_length=12_000_000)
    kind: Literal["rider", "bike"]


class AssetRenderResponse(BaseModel):
    description: str | None      # the 1:1 analysis (reused when composing scenes)
    prompt: str
    image_base64: str | None     # data:image/png;base64,... or null when no image model
    status: str                  # "ok" | "image_model_unavailable"


@router.post("/asset/render", response_model=AssetRenderResponse)
async def render_asset(
    body: AssetRenderRequest,
    current_user: User = Depends(get_current_active_user),
) -> AssetRenderResponse:
    """Analyse a rider selfie or bike photo and render the isolated collectible."""
    out = await cyclr_studio.render_from_photo(body.photo_base64, body.kind)
    return AssetRenderResponse(description=out["description"], prompt=out["prompt"],
                               image_base64=out["image"], status=out["status"])


class SceneRequest(BaseModel):
    rider_description: str
    bike_description: str
    # Day-state key ('rest'|'endurance'|'hard'|'recovery'|'evening') → riding pose.
    pose: Literal["rest", "endurance", "hard", "recovery", "evening"] = "endurance"
    # Optional ride geometry (for the GPX-generated background). All nullable.
    distance_m: float | None = None
    elevation_gain_m: float | None = None
    min_altitude_m: float | None = None
    max_altitude_m: float | None = None
    place_name: str | None = None


class SceneResponse(BaseModel):
    prompt: str
    training_context: str
    image_base64: str | None
    status: str


@router.post("/scene/render", response_model=SceneResponse)
async def render_scene(
    body: SceneRequest,
    current_user: User = Depends(get_current_active_user),
) -> SceneResponse:
    """Compose the rider-on-bike hero for a training context. The background is
    built from the ride's real GPS (`training_context`) — the session-detail
    GPX-generated-scene idea, fed into cyclr_studio's scene composer."""
    geo = RideGeo(
        distance_m=body.distance_m, elevation_gain_m=body.elevation_gain_m,
        min_altitude_m=body.min_altitude_m, max_altitude_m=body.max_altitude_m,
        place_name=body.place_name,
    )
    ctx = training_context(body.pose, geo)
    img, prompt, status = await cyclr_studio.compose_scene(body.rider_description, body.bike_description, ctx)
    return SceneResponse(prompt=prompt, training_context=ctx, image_base64=img, status=status)
