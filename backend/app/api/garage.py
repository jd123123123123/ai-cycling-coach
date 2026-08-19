"""/garage/* — the rider's collectible rider figure, bike, and ride scenes.

The generation pipeline is `services/cyclr_studio.py` (the cycl_r-studio prompts
+ a deterministic seed), with the ride's own distance/elevation feeding the
scene's `training_context` via `services/ride_scene.py`. Every render is
honestly gated: with no image model provisioned the endpoints return the prompt
they *would* send and `status="image_model_unavailable"`, never a fake image.
Outputs are stylised, identity-preserving renders — not exact 3D meshes.

Renders PERSIST (models/garage.py). A rendered bike becomes the rider's garage
bike, which is what lets the Today hero show *their* bike instead of a stock
photo — and what lets a ride hero put them on it. Composing a scene is a slow
paid call, so it is cached and only ever generated on demand:

  · `/scene/{activity_id}` — one ride's hero, keyed on the activity, background
    derived from that ride's real distance and elevation.
  · `/scene/today`         — the day-state hero, keyed on the POSE, on the
    shared starter backdrop. Two rest days are the same picture, so they are the
    same cached row; a rider ever only pays for each pose once.
"""
from __future__ import annotations

import math
from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, HTTPException, status as http_status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.garage import DayScene, GarageAsset, RideScene
from app.models.user import User
from app.services import cyclr_studio, rewards, workshop
from app.services.ride_scene import DAY_POSES, RideGeo, day_context, training_context

router = APIRouter(prefix="/garage", tags=["garage"])

AssetKind = Literal["rider", "bike"]


# ── shapes ──────────────────────────────────────────────────────────────────
class AssetOut(BaseModel):
    kind: str
    name: str | None
    description: str | None
    image_base64: str | None  # data:image/…;base64,… (WebP) — the stored collectible


class GarageOut(BaseModel):
    """The whole garage in one read. Either slot is null when the rider hasn't
    digitalised that thing yet — which is the signal every "add your bike"
    empty state keys off."""

    rider: AssetOut | None
    bike: AssetOut | None


class AssetRenderRequest(BaseModel):
    # base64 data URI or raw base64 of the rider's selfie (kind=rider) or bike (kind=bike).
    photo_base64: str = Field(min_length=32, max_length=12_000_000)
    kind: AssetKind


class AssetRenderResponse(BaseModel):
    name: str | None              # the collectible's short name (bikes only)
    description: str | None       # the 1:1 analysis (reused when composing scenes)
    prompt: str
    image_base64: str | None      # data:image/…;base64,… or null when no image model
    status: str                   # "ok" | "image_model_unavailable"
    saved: bool                   # whether this render is now the rider's garage asset


class SceneOut(BaseModel):
    activity_id: int
    image_base64: str | None
    training_context: str | None
    prompt: str | None
    # "ok" | "not_generated" | "needs_rider" | "needs_bike" | "image_model_unavailable"
    status: str


# The poses Today's hero may ask for. Declared as a Literal so FastAPI rejects
# anything else at the edge (422) rather than letting an unknown key fall
# through to the endurance default and cache a scene under a name that means
# nothing. Kept in step with `ride_scene.DAY_POSES` by the assertion below —
# these are two spellings of one list and must never drift.
DayPose = Literal["rest", "lazy", "endurance", "hard", "recovery", "trained", "evening"]
assert set(get_args(DayPose)) == set(DAY_POSES), "DayPose and ride_scene.DAY_POSES drifted"


class DaySceneOut(BaseModel):
    """Today's hero: the rider on their bike, posed for what the day asks."""

    pose: str
    image_base64: str | None
    training_context: str | None
    prompt: str | None
    # Same vocabulary as SceneOut, so one frontend type covers both.
    status: str


def _to_out(asset: GarageAsset | None) -> AssetOut | None:
    if asset is None:
        return None
    return AssetOut(
        kind=asset.kind, name=asset.name,
        description=asset.description, image_base64=asset.image_url,
    )


async def _get_asset(db: AsyncSession, user_id: int, kind: str) -> GarageAsset | None:
    result = await db.execute(
        select(GarageAsset).where(
            GarageAsset.user_id == user_id, GarageAsset.kind == kind,
        )
    )
    return result.scalar_one_or_none()


# ── the garage ──────────────────────────────────────────────────────────────
@router.get("", response_model=GarageOut, summary="The rider's digitalised rider figure and bike")
async def get_garage(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GarageOut:
    result = await db.execute(
        select(GarageAsset).where(GarageAsset.user_id == current_user.id)
    )
    assets = {a.kind: a for a in result.scalars().all()}
    return GarageOut(rider=_to_out(assets.get("rider")), bike=_to_out(assets.get("bike")))


# ── the workshop ────────────────────────────────────────────────────────────
class ComponentOut(BaseModel):
    id: str
    name_de: str
    action_de: str
    km_since: float
    interval_km: float
    km_total: float
    #: Unharvested Service Bonus sitting on this component right now.
    bonus_rc: int
    #: "fresh" | "due" | "overdue" — never a failure state, and never blocking.
    status: str
    progress: float
    #: True once the pile has stopped growing. It has NOT shrunk.
    accrual_stopped: bool


class WorkshopOut(BaseModel):
    components: list[ComponentOut]
    total_bonus_rc: int
    #: Whether the +12 % fresh-drivetrain earn bonus is currently live.
    drivetrain_fresh: bool
    #: The genuine drag of a dirty chain, in watts. Null while fresh — the app
    #: states a measured fact or says nothing, never a zero implying a reading.
    drivetrain_watts: float | None
    chain_km_total: float
    chain_record_km: float
    balance: int


class ServiceOut(BaseModel):
    component_id: str
    name_de: str
    paid_rc: int
    balance: int
    km_serviced: float
    new_record: bool
    record_km: float
    #: The refreshed workshop, so the screen redraws without a second round trip.
    workshop: WorkshopOut


def _workshop_out(view: workshop.WorkshopView, balance: int) -> WorkshopOut:
    return WorkshopOut(
        components=[ComponentOut(**vars(c)) for c in view.components],
        total_bonus_rc=view.total_bonus_rc,
        drivetrain_fresh=view.drivetrain_fresh,
        drivetrain_watts=view.drivetrain_watts,
        chain_km_total=round(view.chain_km_total, 1),
        chain_record_km=round(view.chain_record_km, 1),
        balance=balance,
    )


@router.get("/workshop", response_model=WorkshopOut, summary="The bike's condition and its unharvested Service Bonus")
async def get_workshop(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WorkshopOut:
    """Every component's wear, and what servicing it would pay right now.

    A writer, like `GET /shop` before it: component rows are created lazily on
    first read so a new component never needs a backfill. Hence the commit.
    """
    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    return _workshop_out(view, balance)


@router.post("/workshop/service/{component_id}", response_model=ServiceOut, summary="Service a component and harvest its Service Bonus")
async def service_component(
    component_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> ServiceOut:
    """Reset one component's interval and CREDIT the bonus it banked.

    There is no failure mode here worth a non-200 except an unknown component.
    Servicing something you cleaned yesterday pays 0 RC and says so — it is a
    fair trade the rider is allowed to make, not an error. Nothing in this path
    can ever debit; see `services/workshop`.
    """
    try:
        result = await workshop.service(db, current_user.id, component_id)
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND, f"No such component: {component_id}"
        ) from None

    view = await workshop.read(db, current_user.id)
    await db.commit()
    return ServiceOut(
        component_id=result.component_id,
        name_de=result.name_de,
        paid_rc=result.paid_rc,
        balance=result.balance,
        km_serviced=result.km_serviced,
        new_record=result.new_record,
        record_km=result.record_km,
        workshop=_workshop_out(view, result.balance),
    )


@router.post("/asset/render", response_model=AssetRenderResponse)
async def render_asset(
    body: AssetRenderRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> AssetRenderResponse:
    """Analyse a rider selfie or bike photo, render the isolated collectible, and
    keep it. A successful render replaces whatever was in that garage slot — the
    rider always has exactly one current bike and one current rider figure.

    Nothing is saved when the studio couldn't produce a real image: a failed
    render must not wipe the bike the rider already has.

    Replacing an asset also drops the rider's cached ride AND day scenes. Those
    scenes were composed FROM the old rider/bike descriptions, so keeping them
    would leave every past ride — and tomorrow's Today hero — showing a bike the
    rider no longer owns; the cache would quietly outlive the thing it was
    caching. Dropped, they simply recompose on the next explicit tap.
    """
    out = await cyclr_studio.render_from_photo(body.photo_base64, body.kind)

    saved = False
    if out["status"] == "ok" and out["image"]:
        asset = await _get_asset(db, current_user.id, body.kind)
        replaced = asset is not None and asset.description != out["description"]
        if asset is None:
            asset = GarageAsset(user_id=current_user.id, kind=body.kind)
            db.add(asset)
        asset.name = out["name"]
        asset.description = out["description"]
        asset.image_url = out["image"]
        if replaced:
            await db.execute(delete(RideScene).where(RideScene.user_id == current_user.id))
            await db.execute(delete(DayScene).where(DayScene.user_id == current_user.id))
        await db.commit()
        saved = True

    return AssetRenderResponse(
        name=out["name"], description=out["description"], prompt=out["prompt"],
        image_base64=out["image"], status=out["status"], saved=saved,
    )


@router.delete("/asset/{kind}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_asset(
    kind: AssetKind,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> None:
    """Empty a garage slot, so the rider can start over. Idempotent."""
    asset = await _get_asset(db, current_user.id, kind)
    if asset is not None:
        await db.delete(asset)
        await db.commit()


class RiderComposeRequest(BaseModel):
    # base64 data URIs (or raw base64) of the three real photos.
    self_base64: str = Field(min_length=32, max_length=12_000_000)
    bike_base64: str = Field(min_length=32, max_length=12_000_000)
    helmet_base64: str = Field(min_length=32, max_length=12_000_000)


class RiderComposeResponse(BaseModel):
    prompt: str
    image_base64: str | None
    status: str


@router.post("/rider/compose", response_model=RiderComposeResponse)
async def compose_rider(
    body: RiderComposeRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> RiderComposeResponse:
    """The onboarding hero: from the rider's own photo + their bike + their
    helmet, compose ONE stylised W3 collectible rider (them, on their bike,
    wearing their helmet). Honestly gated when no image model is provisioned."""
    out = await cyclr_studio.compose_rider(
        body.self_base64, body.bike_base64, body.helmet_base64,
    )
    return RiderComposeResponse(
        prompt=out["prompt"], image_base64=out["image"], status=out["status"],
    )


# ── ride scenes ─────────────────────────────────────────────────────────────
def _pose_for(activity: Activity) -> str:
    """The riding pose the scene depicts, from how hard the ride actually was.

    Intensity factor is recovered the same way the ride screens do it — from the
    ride's own TSS over its duration (TSS = hours × IF² × 100). With no TSS
    there is nothing to claim, so the scene shows a steady endurance ride rather
    than inventing an effort.
    """
    hours = (activity.duration_seconds or 0) / 3600
    if not activity.tss or hours <= 0:
        return "endurance"
    iff = math.sqrt(activity.tss / (hours * 100))
    if iff >= 0.92:
        return "hard"
    if iff < 0.6:
        return "recovery"
    return "endurance"


async def _load_activity(db: AsyncSession, user_id: int, activity_id: int) -> Activity:
    result = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.user_id == user_id)
    )
    activity = result.scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


async def _missing_asset(db: AsyncSession, user_id: int) -> str | None:
    """Which half of the composition the rider hasn't digitalised yet, if any.

    A scene needs BOTH descriptions; without one there is nothing to compose and
    the screen must send them to the studio rather than spin on a call that can
    only fail.
    """
    rider = await _get_asset(db, user_id, "rider")
    if not (rider and rider.description):
        return "needs_rider"
    bike = await _get_asset(db, user_id, "bike")
    if not (bike and bike.description):
        return "needs_bike"
    return None


async def _cached_day_scene(db: AsyncSession, user_id: int, pose: str) -> DayScene | None:
    return (await db.execute(
        select(DayScene).where(DayScene.user_id == user_id, DayScene.pose == pose)
    )).scalar_one_or_none()


# ── today's hero ────────────────────────────────────────────────────────────
# Keyed on the POSE, not the date: the scene depicts what the day is asking of
# the rider, and two rest days are the same picture. See models/garage.DayScene.
@router.get("/scene/today", response_model=DaySceneOut)
async def get_day_scene(
    pose: DayPose,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> DaySceneOut:
    """Read today's cached hero for a pose. NEVER generates.

    This is what Today calls on open, so it has to be cheap and silent: it says
    whether a composed scene exists and, when it doesn't, why — `not_generated`
    (a tap away), or `needs_rider` / `needs_bike` (the studio first). Composing
    costs money and minutes and only ever happens on an explicit POST.
    """
    scene = await _cached_day_scene(db, current_user.id, pose)
    if scene is not None and scene.image_url:
        return DaySceneOut(pose=pose, image_base64=scene.image_url,
                           training_context=scene.training_context,
                           prompt=scene.prompt, status="ok")
    missing = await _missing_asset(db, current_user.id)
    return DaySceneOut(pose=pose, image_base64=None, training_context=None,
                       prompt=None, status=missing or "not_generated")


@router.post("/scene/today", response_model=DaySceneOut)
async def render_day_scene(
    pose: DayPose,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> DaySceneOut:
    """Compose (and cache) today's hero for one pose — the rider, on their own
    bike, doing what the day asks (see `ride_scene._POSE`).

    The rider and bike come from their garage; the backdrop is the SHARED
    starter road, identical for every rider, because there is no ride here to
    derive terrain from and a per-rider invention would be exactly the kind of
    fabricated place `ride_scene` refuses to produce. An already-composed pose
    returns its cached image without re-rendering — this endpoint is safe to hit
    twice, it just isn't safe to hit automatically.
    """
    cached = await _cached_day_scene(db, current_user.id, pose)
    if cached is not None and cached.image_url:
        return DaySceneOut(pose=pose, image_base64=cached.image_url,
                           training_context=cached.training_context,
                           prompt=cached.prompt, status="ok")

    missing = await _missing_asset(db, current_user.id)
    if missing:
        return DaySceneOut(pose=pose, image_base64=None, training_context=None,
                           prompt=None, status=missing)

    rider = await _get_asset(db, current_user.id, "rider")
    bike = await _get_asset(db, current_user.id, "bike")
    assert rider is not None and bike is not None  # _missing_asset just proved it
    ctx = day_context(pose)
    image, prompt, render_status = await cyclr_studio.compose_scene(
        rider.description or "", bike.description or "", ctx,
    )
    if image:
        if cached is None:
            cached = DayScene(user_id=current_user.id, pose=pose)
            db.add(cached)
        cached.image_url = image
        cached.training_context = ctx
        cached.prompt = prompt
        await db.commit()

    return DaySceneOut(pose=pose, image_base64=image, training_context=ctx,
                       prompt=prompt, status=render_status)


@router.get("/scene/{activity_id}", response_model=SceneOut)
async def get_scene(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> SceneOut:
    """Read a ride's cached hero. Never generates — this is the cheap read the
    ride screen makes on open, so it can show the scene instantly when there is
    one and decide what to offer when there isn't.

    `status` tells the caller why there's no image: `not_generated` (ready to
    compose), or `needs_rider` / `needs_bike` (the rider hasn't digitalised that
    yet, so the screen should send them to the studio instead of spinning).
    """
    scene = (await db.execute(
        select(RideScene).where(
            RideScene.activity_id == activity_id, RideScene.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if scene is not None and scene.image_url:
        return SceneOut(activity_id=activity_id, image_base64=scene.image_url,
                        training_context=scene.training_context, prompt=scene.prompt, status="ok")

    rider = await _get_asset(db, current_user.id, "rider")
    bike = await _get_asset(db, current_user.id, "bike")
    missing = ("needs_rider" if not (rider and rider.description)
               else "needs_bike" if not (bike and bike.description) else "not_generated")
    return SceneOut(activity_id=activity_id, image_base64=None,
                    training_context=None, prompt=None, status=missing)


@router.post("/scene/{activity_id}", response_model=SceneOut)
async def render_scene(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> SceneOut:
    """Compose (and cache) the rider-on-bike hero for one ride.

    The rider and bike come from their garage; the background comes from the
    ride's own distance and elevation via `ride_scene.training_context` — a
    stylised impression of the terrain they actually rode, never a fabricated
    place. Already-cached rides return the cached image without re-rendering.
    """
    cached = (await db.execute(
        select(RideScene).where(
            RideScene.activity_id == activity_id, RideScene.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if cached is not None and cached.image_url:
        return SceneOut(activity_id=activity_id, image_base64=cached.image_url,
                        training_context=cached.training_context, prompt=cached.prompt, status="ok")

    activity = await _load_activity(db, current_user.id, activity_id)
    rider = await _get_asset(db, current_user.id, "rider")
    bike = await _get_asset(db, current_user.id, "bike")
    if not (rider and rider.description):
        return SceneOut(activity_id=activity_id, image_base64=None, training_context=None,
                        prompt=None, status="needs_rider")
    if not (bike and bike.description):
        return SceneOut(activity_id=activity_id, image_base64=None, training_context=None,
                        prompt=None, status="needs_bike")

    ctx = training_context(_pose_for(activity), RideGeo(
        distance_m=activity.distance_meters,
        elevation_gain_m=activity.elevation_gain_m,
    ))
    image, prompt, render_status = await cyclr_studio.compose_scene(
        rider.description, bike.description, ctx,
    )
    if image:
        if cached is None:
            cached = RideScene(user_id=current_user.id, activity_id=activity_id)
            db.add(cached)
        cached.image_url = image
        cached.training_context = ctx
        cached.prompt = prompt
        await db.commit()

    return SceneOut(activity_id=activity_id, image_base64=image,
                    training_context=ctx, prompt=prompt, status=render_status)
