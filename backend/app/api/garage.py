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

import hashlib
import json
import logging
import math
from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Annotated, Literal, get_args

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi import status as http_status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.garage import (
    DayScene,
    GarageAsset,
    RiderBackdrop,
    RiderStage,
    RideScene,
)
from app.models.place import Place, RiderPlaceStamp
from app.models.shop import BikeRender
from app.models.user import User
from app.services import (
    backdrops,
    bike_build,
    bike_wear,
    maintenance_forecast,
    cutout,
    stage_unlock,
    cyclr_studio,
    gear,
    places,
    rewards,
    ride_facts,
    ride_framing,
    ride_place,
    ride_weather,
    weather_client,
    rider_wear,
    service_proof,
    stage_frame,
    stages,
    workshop,
)
from app.services import earn_modifiers as em
from app.services.ride_scene import DAY_POSES, RideGeo, day_context

logger = logging.getLogger(__name__)

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
    #: The stage it was composed on — `services.backdrops`. Echoed back so the
    #: picker can show which one the picture the rider is looking at belongs to,
    #: even while a switch is still rendering.
    backdrop: str
    image_base64: str | None
    training_context: str | None
    prompt: str | None
    # Same vocabulary as SceneOut, so one frontend type covers both.
    status: str


class BackdropOut(BaseModel):
    """One stage in the picker."""

    id: str
    name_de: str
    #: What it takes, in the rider's language. "" for the two starters.
    unlock_de: str
    #: Whether this rider has opened it. Locked stages are still returned: the
    #: point of the picker is partly to show what riding somewhere would earn.
    unlocked: bool
    #: True for the one currently in use.
    selected: bool


class BackdropsOut(BaseModel):
    backdrops: list[BackdropOut]
    #: The places half of the same picker — real locations riders have been.
    places: list[PlaceOut]
    selected: str
    balance_rc: int


class PlaceOut(BaseModel):
    """One real place in the gallery.

    Every place the app knows is listed, whoever found it. That is the point of
    a shared catalogue: the gallery grows as the app's riders go places, and a
    rider scrolling past the Stelvio they have not ridden is being told what is
    out there rather than being sold something.
    """

    slug: str
    name: str
    #: The shared plate, once it exists. Null while a place is on the map but
    #: not yet rendered — the gallery shows it as pending rather than hiding it.
    plate_url: str | None
    price_rc: int
    #: Has this rider actually ridden there. The gate money cannot open.
    stamped: bool
    #: How many times they have been.
    rides: int
    owned: bool
    selected: bool


def _to_out(asset: GarageAsset | None) -> AssetOut | None:
    if asset is None:
        return None
    # THE RIDER-FACING HALF, never the image prompt. One stored description
    # carries both (see `cyclr_studio.split_description`); the English half is
    # scaffolding for the renderer and was being printed to a German audience as
    # a spec sheet.
    _, human = cyclr_studio.split_description(asset.description)
    return AssetOut(
        kind=asset.kind, name=asset.name,
        description=human or None, image_base64=asset.image_url,
    )


async def _source_crop(photo_b64: str) -> str | None:
    """The rider's photo, cropped to the head and shrunk, or None. Never raises.

    Sized the way `crew_avatars.thumbnail` sizes its faces and for the same
    reason — this lands on a row that is read on many requests and already
    carries a rendered collectible, and a raw upload is megabytes before base64
    adds a third on top. 512px on the long edge at WebP q82 comes in comfortably
    under 60KB, and the consumers are portrait renders that never look below the
    collar anyway.

    A photo that will not crop or will not encode simply has no stored source,
    exactly as `crew_avatars` treats a face that will not decode: the rider
    keeps the prose path they had before this existed, and onboarding does not
    fail over a picture the model found difficult.
    """
    try:
        import base64 as _b64
        import io as _io

        from PIL import Image

        crop = await cyclr_studio.face_crop(photo_b64)
        raw = crop.split(",", 1)[1] if crop.startswith("data:") else crop
        im = Image.open(_io.BytesIO(_b64.b64decode(raw))).convert("RGB")
        if max(im.size) > 512:
            im.thumbnail((512, 512), Image.LANCZOS)
        buf = _io.BytesIO()
        im.save(buf, format="WEBP", quality=82, method=6)
        return "data:image/webp;base64," + _b64.b64encode(buf.getvalue()).decode()
    except Exception:
        logger.info("source photo crop failed; rider keeps the prose path", exc_info=True)
        return None


async def _get_asset(db: AsyncSession, user_id: int, kind: str) -> GarageAsset | None:
    result = await db.execute(
        select(GarageAsset).where(
            GarageAsset.user_id == user_id, GarageAsset.kind == kind,
        )
    )
    return result.scalar_one_or_none()


async def _ensure_cut_out(db: AsyncSession, bike: GarageAsset | None) -> GarageAsset | None:
    """Free a bike rendered BEFORE the cut-out existed, once, on first read.

    `cyclr_studio` cuts every bike out at render time now, but the renders made
    before that shipped are still sitting in `garage_assets` as square
    photographs with a studio ground baked into them. Every surface downstream
    was rewritten to trust the cut-out — the Today room stands the machine on
    its own floor line at 94% width — so an uncut render draws there as a
    rectangle laid over the room, edges, baked floor, baked shadow and all.
    That is what a rider with an older bike actually sees.

    Re-rendering is a paid model call and would return a DIFFERENT bicycle. The
    cut is the same picture with its ground removed, so it is done here instead:
    once, on the next read, and persisted.

    THE MARKER IS THE ALPHA CHANNEL, not a flag column and not the container
    format — `cutout.is_cut_out` reads the image's own mode from its header. A
    cut bike carries transparency and an uncut render does not, so there is
    nothing to keep in sync and nothing to migrate.

    NEVER FATAL, like every other step in the render pipeline: a cut that fails
    leaves the original exactly where it was.
    """
    if bike is None or not bike.image_url:
        return bike
    if cutout.is_cut_out(bike.image_url):
        # Already free of its ground — but a rider cut before the cut-out moved
        # to WebP carries a PNG four times the size of the same picture, on the
        # first screen's critical path. Re-encoding costs no model call.
        packed = await run_in_threadpool(cutout.repack, bike.image_url)
        if packed:
            bike.image_url = packed
            await db.commit()
            logger.info("repacked a PNG cut-out as WebP for user %s", bike.user_id)
        return bike
    cut = await run_in_threadpool(cutout.cut_out, bike.image_url)
    if not cut:
        return bike
    bike.image_url = cut
    await db.commit()
    logger.info("cut out a pre-cutout bike render for user %s", bike.user_id)
    return bike


class AssetNameRequest(BaseModel):
    """What the rider decided to call their machine."""

    name: str


@router.post("/asset/{kind}/restyle", response_model=AssetRenderResponse,
             summary="Re-render an existing asset in the current art direction")
async def restyle_asset(
    kind: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> AssetRenderResponse:
    """Draw the rider's existing figure or bike again, in today's style.

    THE ART DIRECTION MOVES AND THE PICTURES DO NOT. A render is made once and
    then it is the rider's, so a rider who joined before a change keeps seeing
    the old look on every screen — and the only way back was to find the
    original photograph and shoot it again, which most people cannot do.

    Nothing needs the photo: the vision pass's DESCRIPTION is what the renderer
    was ever given, and it is stored. So this re-renders from that, which also
    means the figure stays recognisably the same person and the bike stays the
    same bicycle — only the treatment changes.

    NEVER DESTRUCTIVE. A failed re-render leaves the existing picture exactly
    where it was: the rider must not be able to lose the bike they have by
    asking for a nicer photograph of it.
    """
    if kind not in ("bike", "rider"):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="unknown_kind")
    asset = await _get_asset(db, current_user.id, kind)
    if asset is None or not asset.description:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="no_asset")

    prompt_text, _ = cyclr_studio.split_description(asset.description)
    image, prompt, status = await cyclr_studio.render_isolated(prompt_text, kind)

    saved = False
    if status == "ok" and image:
        asset.image_url = image
        await db.commit()
        saved = True
        # The composed scenes were built from the OLD picture, so they would
        # keep showing it. Same reasoning as a fresh render — see `render_asset`.
        await db.execute(delete(RideScene).where(RideScene.user_id == current_user.id))
        await db.execute(delete(DayScene).where(DayScene.user_id == current_user.id))
        await db.commit()

    _, human = cyclr_studio.split_description(asset.description)
    return AssetRenderResponse(
        name=asset.name, description=human or None, prompt=prompt,
        image_base64=image, status=status, saved=saved,
    )


@router.patch("/asset/{kind}/name", response_model=AssetOut,
              summary="Rename the rider's own bike or rider figure")
async def rename_asset(
    kind: str,
    body: AssetNameRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> AssetOut:
    """Name the thing the rider owns.

    The vision pass reads a name off the frame ("Specialized Allez") and that is
    a good default, but it is a GUESS about somebody's bicycle — and a bike is
    the one object in this app that belongs to a person rather than to a
    catalogue. They get to say what it is called.

    Trimmed and capped rather than validated into a corner: a name is a name,
    and refusing "Rocinante" because of a rule would be the app having an
    opinion about something that is none of its business. Empty clears it back
    to the detected name being absent, which the UI renders as the model's
    guess or nothing at all.
    """
    if kind not in ("bike", "rider"):
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="unknown_kind")
    asset = await _get_asset(db, current_user.id, kind)
    if asset is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="no_asset")
    asset.name = (body.name or "").strip()[:60] or None
    await db.commit()
    await db.refresh(asset)
    out = _to_out(asset)
    assert out is not None
    return out



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
    bike = await _ensure_cut_out(db, assets.get("bike"))
    return GarageOut(rider=_to_out(assets.get("rider")), bike=_to_out(bike))


# ── the built bike ──────────────────────────────────────────────────────────
class BikeBuildOut(BaseModel):
    """The rider's bike wearing what they equipped."""

    #: The composed build, the plain bike when nothing worn changes the picture,
    #: or null when neither exists yet.
    image_base64: str | None
    #: "stock" — nothing equipped alters the machine, this is the base render
    #: "ok" — a composed build, from cache or freshly rendered
    #: "needs_bike" — the rider has not digitalised a bike yet
    #: "image_model_unavailable" — honest gating; the base render is returned
    status: str
    #: What was asked of the model, so a build can always be explained.
    changes: list[str]


@router.get("/bike/build", response_model=BikeBuildOut, summary="The rider's bike, wearing their equipped gear")
async def get_bike_build(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> BikeBuildOut:
    """The bike as currently built. Cached; renders on demand, once per build.

    A loadout whose items are all pocket charms is `stock` and costs nothing —
    the rider's own base render is returned with no model call at all. Only a
    combination that actually changes the machine is ever composed, and only the
    first time anyone in this garage wears it.
    """
    bike = await _get_asset(db, current_user.id, "bike")
    if bike is None or not bike.image_url:
        return BikeBuildOut(image_base64=None, status="needs_bike", changes=[])

    equipped = await gear.equipped_ids(db, current_user.id)
    if bike_build.is_stock(equipped):
        return BikeBuildOut(image_base64=bike.image_url, status="stock", changes=[])

    stamp = (bike.updated_at or bike.created_at).isoformat()
    key = bike_build.build_key(bike.id, stamp, equipped)
    changes = bike_build.describe(equipped)

    cached = (await db.execute(
        select(BikeRender).where(BikeRender.build_key == key)
    )).scalar_one_or_none()
    if cached is not None and cached.image:
        return BikeBuildOut(image_base64=cached.image, status="ok", changes=changes)

    # ALWAYS from the rider's ORIGINAL render, never from a previous build:
    # `docs/w3-bike-customisation.md` measured stacked edits drifting, which is
    # how a bike slowly stops being the bike.
    image = await cyclr_studio.edit_image(
        bike.image_url, bike_build.edit_prompt(equipped), key,
    )
    if not image:
        # Honest degradation: the rider keeps seeing their real bike rather than
        # an error or a placeholder. Nothing is cached, so it retries later.
        return BikeBuildOut(
            image_base64=bike.image_url, status="image_model_unavailable", changes=changes,
        )

    if cached is None:
        cached = BikeRender(build_key=key)
        db.add(cached)
    cached.image = image
    cached.status = "ok"
    await db.commit()
    return BikeBuildOut(image_base64=image, status="ok", changes=changes)


# ── what Today draws ────────────────────────────────────────────────────────
class StageOut(BaseModel):
    """One backdrop in the rider's own switchable set."""

    id: str
    name: str
    #: Only ever backdrops this rider owns, so this list IS the swipe order.
    is_place: bool


class TodayStageOut(BaseModel):
    """Everything the Today screen shows, in one read.

    ONE CALL ON PURPOSE. Today draws the avatar and the bike as two pictures,
    and both depend on things the rider changes elsewhere — a helmet bought in
    the shop, tyres equipped in the garage, a stage picked from the gallery.
    Three round trips to assemble one screen means three chances to draw a
    half-updated rider, so the screen asks one question and gets a consistent
    answer.
    """

    #: The bust, wearing whatever is in the two worn slots.
    rider_image: str | None
    #: The bike, wearing its equipped parts, standing in the chosen stage.
    bike_image: str | None
    bike_name: str | None
    #: What the model was asked to change about the machine, so a build can be
    #: explained rather than just appearing.
    changes: list[str]
    #: The stage in use, and every stage the rider can swipe to.
    stage: str
    bike_scene: bool = False
    scene_pending: bool = False
    stages: list[StageOut]
    status: str


@router.get("/today", response_model=TodayStageOut,
            summary="The avatar and the bike, exactly as the rider has them configured")
async def get_today_stage(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TodayStageOut:
    """The two renders Today is built from, plus the stages to swipe through.

    NO RIDER ON THE BIKE. Today is the bike, with the avatar above it — the
    composed rider-on-bike scene is not what this screen is for, and composing
    one here would put the app's slowest, most failure-prone call on its most
    visited surface. `compose_scene` still exists for the surfaces that want it.

    CACHED, NEVER RENDERED ON OPEN. Both pictures come back from the render
    cache or come back plain: a rider whose build has never been composed sees
    their base bike on the base ground, which is honest and instant. Composing
    is `POST /garage/today/render`, an explicit act.
    """
    rider = await _get_asset(db, current_user.id, "rider")
    # Whichever of the two reads a rider hits first frees a pre-cut-out render;
    # the other then sees the PNG. See `_ensure_cut_out`.
    bike = await _ensure_cut_out(db, await _get_asset(db, current_user.id, "bike"))
    stage_id = await _selected_backdrop(db, current_user.id)
    owned = await _owned_stages(db, current_user.id)

    equipped = await gear.equipped_ids(db, current_user.id)
    changes = bike_build.describe(equipped)

    rider_image = rider.image_url if rider else None
    if rider is not None and rider.description:
        worn = rider_wear.key(equipped)
        cached = await _cached_render(db, _rider_key(rider, worn))
        if cached:
            rider_image = cached

    bike_image = bike.image_url if bike else None
    bike_scene = False
    scene_pending = False
    if bike is not None and bike.image_url:
        cached = await _cached_render(db, _bike_key(bike, equipped, stage_id))
        if cached:
            bike_image = cached
            from app.services import scene_render
            bike_scene = stage_id in scene_render.READY
            if bike_scene:
                bike_image = await run_in_threadpool(scene_render.display_image, cached, 900)

    from app.services import scene_render
    if bike is not None and stage_id in scene_render.READY and not bike_scene:
        render_row = (await db.execute(select(BikeRender).where(BikeRender.build_key == _bike_key(bike, equipped, stage_id)))).scalar_one_or_none()
        scene_pending = render_row is not None and render_row.status == 'pending'
    return TodayStageOut(
        rider_image=rider_image,
        bike_image=bike_image,
        bike_name=bike.name if bike else None,
        changes=changes,
        stage=stage_id,
        bike_scene=bike_scene,
        scene_pending=scene_pending,
        stages=owned,
        status="ok" if (rider_image and bike_image) else "needs_assets",
    )


def _rider_key(rider: GarageAsset, worn: str) -> str:
    """Cache key for the bust wearing one loadout.

    Namespaced away from the bike builds that share the table, and stamped with
    the asset's own render time so re-photographing a face invalidates every
    bust of the old one.
    """
    stamp = (rider.updated_at or rider.created_at).isoformat()
    return hashlib.sha256(
        f"rider:{rider.id}:{stamp}:{worn}".encode()
    ).hexdigest()[:32]


def _bike_key(bike: GarageAsset, equipped: list[str], stage_id: str) -> str:
    from app.services import scene_render
    if stage_id in scene_render.READY:
        return scene_render.cache_key(bike, stage_id)
    stamp = (bike.updated_at or bike.created_at).isoformat()
    return bike_build.build_key(bike.id, stamp, equipped, stage_id)


async def _cached_render(db: AsyncSession, key: str) -> str | None:
    row = (await db.execute(
        select(BikeRender).where(BikeRender.build_key == key)
    )).scalar_one_or_none()
    return row.image if row is not None and row.status == "ok" and row.image else None


async def _store_render(db: AsyncSession, key: str, image: str) -> None:
    row = (await db.execute(
        select(BikeRender).where(BikeRender.build_key == key)
    )).scalar_one_or_none()
    if row is None:
        row = BikeRender(build_key=key)
        db.add(row)
    row.image = image
    row.status = "ok"
    await db.commit()


async def _owned_stages(db: AsyncSession, user_id: int) -> list[StageOut]:
    """Every stage this rider may switch to, in swipe order.

    The hand-written ones they have unlocked, then the places they have bought,
    newest place last so a stage someone just paid for is at the end of the
    swipe rather than buried in the middle.
    """
    out = [
        StageOut(id=b.id, name=backdrops.CATALOGUE[b.id].name_de, is_place=False)
        for b in [backdrops.CATALOGUE[i] for i in await _unlocked_backdrops(db, user_id)]
    ]
    owned = set((await db.execute(
        select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == user_id)
    )).scalars().all())
    place_rows = (await db.execute(
        select(Place).where(Place.slug.in_(owned)).order_by(Place.created_at)
    )).scalars().all() if owned else []
    out += [StageOut(id=p.slug, name=p.name, is_place=True) for p in place_rows]
    return out


@router.post("/today/render", response_model=TodayStageOut,
             summary="Compose the avatar and the bike as currently configured")
async def render_today_stage(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TodayStageOut:
    """Render whichever of the two pictures is missing for this configuration.

    Slow and paid, so it is a POST and never happens on open. It is also
    idempotent and cheap to repeat: anything already composed for this exact
    (bike, parts, stage) or (face, worn) combination comes straight back out of
    the cache, so a rider swiping back to a stage they used last week pays
    nothing.
    """
    rider = await _get_asset(db, current_user.id, "rider")
    bike = await _get_asset(db, current_user.id, "bike")
    equipped = await gear.equipped_ids(db, current_user.id)
    stage_id = await _selected_backdrop(db, current_user.id)
    stage = await stages.stage_for(db, stage_id)

    from app.services import scene_render, stage_unlock
    if stage_id in scene_render.READY:
        stage_unlock.warm(current_user.id, [stage_id])

    # THE BUST, wearing what the rider owns. Re-rendered rather than edited:
    # a helmet changes the silhouette of the head, which is more than an edit
    # pass holds onto, and the bust is cheap to redraw from its description.
    if rider is not None and rider.description:
        worn = rider_wear.key(equipped)
        key = _rider_key(rider, worn)
        if worn != "bare" and not await _cached_render(db, key):
            image, _, _ = await cyclr_studio.render_isolated(
                rider.description, "rider", seed_src=f"{rider.id}:{worn}",
                wear=rider_wear.clause(equipped),
            )
            if image:
                await _store_render(db, key, image)

    # THE BIKE, wearing its parts and standing in the chosen place. One edit
    # from the ORIGINAL render — never from a previous build — so the frame,
    # the decals and the components stay the rider's own.
    if bike is not None and bike.image_url:
        key = _bike_key(bike, equipped, stage_id)
        needs = not bike_build.is_stock(equipped) or stage.id != backdrops.DEFAULT_ID
        if needs and stage_id not in backdrops.scene_catalogue.RELEASED and not await _cached_render(db, key):
            # PROSE, NOT THE PLATE, and this was settled on the evidence rather
            # than by preference. Handing the model the bike AND the place plate
            # asks an image-conditioned EDIT to do a compositing job — rescale a
            # frame-filling subject and stand it on a surface in a second
            # photograph — and it anchors to the source framing regardless of
            # what the words say. Three different wordings all produced the same
            # picture: a beautifully lit bicycle hovering in mid-air above the
            # road. Given the same place as PROSE and no second image, the model
            # composes the whole frame coherently and the bike stands on real
            # ground, with a contact shadow and gravel against the tyres.
            #
            # WHAT THIS COSTS. Two riders in the Dolomites no longer get a
            # pixel-identical background. What they do get is the same PLACE —
            # `Place.prose` is written once, when the place is discovered, and
            # shared by everyone — so the terrain, the light and the character
            # match while the photograph is their own. The shared plate is still
            # rendered once and still earns its keep: it is the place's portrait
            # in the gallery, which is where riders actually compare places.
            image = await cyclr_studio.edit_image(
                bike.image_url,
                bike_build.edit_prompt(equipped, world=stage.prose),
                key,
                # PORTRAIT, because the hero room crops a square by 28% of its
                # width — see `cyclr_studio.STAGE_ASPECT`.
                aspect=cyclr_studio.STAGE_ASPECT,
                # AND FRAMED, so the machine does not move between stages. The
                # ratio is read from this rider's own cut-out rather than
                # assumed: see `services.stage_frame`, where three production
                # bikes measured 2.885, 2.891 and 3.007.
                frame_ratio=stage_frame.geometry_from_cutout(bike.image_url)
                or stage_frame.RATIO_DEFAULT,
            )
            if image:
                await _store_render(db, key, image)

    return await get_today_stage(current_user, db)


# ── the gear shop ───────────────────────────────────────────────────────────
class GearItemOut(BaseModel):
    id: str
    name_de: str
    slot: str
    slot_label: str
    rarity: str
    pct: int
    price_rc: int
    why: str
    flavour_de: str
    owned: bool
    equipped: bool
    affordable: bool


class GearOut(BaseModel):
    items: list[GearItemOut]
    balance: int
    #: slot id → German label, so the client never hard-codes the slot names.
    slots: dict[str, str]


@router.get("/gear", response_model=GearOut, summary="The equipment catalogue, marked up with what the rider owns")
async def get_gear(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GearOut:
    """Every item, owned or not.

    Unaffordable items are RETURNED, not hidden: an item you cannot yet buy is a
    goal, and a catalogue that hides its goals stops being something to work
    toward. `affordable` lets the client draw the difference.
    """
    view = await gear.read(db, current_user.id)
    return GearOut(
        items=[GearItemOut(**vars(i)) for i in view.items],
        balance=view.balance,
        slots=view.slots,
    )


@router.post("/gear/buy/{item_id}", response_model=GearOut, summary="Buy one item at the server's price")
async def buy_gear(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GearOut:
    """Spend RideCoin on equipment.

    The price is NEVER in the request — it comes from the catalogue, so there is
    no body to tamper with. 404 unknown item, 409 already owned, 402 too poor,
    and in every refusal case not one RideCoin has moved and no row exists.

    Returns the refreshed catalogue so the shop redraws without a follow-up GET,
    which would otherwise flash a stale balance on the one screen that just took
    the rider's coins.
    """
    try:
        await gear.buy(db, current_user.id, item_id)
    except gear.UnknownItemError:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, f"No such item: {item_id}") from None
    except gear.AlreadyOwnedError:
        raise HTTPException(http_status.HTTP_409_CONFLICT, f"Already owned: {item_id}") from None
    except rewards.InsufficientBalanceError as e:
        raise HTTPException(
            http_status.HTTP_402_PAYMENT_REQUIRED,
            f"Costs {e.needed} RC — balance is {e.balance} RC",
        ) from None

    view = await gear.read(db, current_user.id)
    await db.commit()
    return GearOut(
        items=[GearItemOut(**vars(i)) for i in view.items],
        balance=view.balance, slots=view.slots,
    )


@router.post("/gear/equip/{item_id}", response_model=GearOut, summary="Wear an owned item")
async def equip_gear(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GearOut:
    """Move an item into its slot, displacing whatever was there.

    Displacement is silent and automatic because the slot holds exactly one
    thing — asking "remove your gravel tyres first?" is a dialogue about a rule
    the rider can already see.
    """
    try:
        await gear.equip(db, current_user.id, item_id)
    except gear.UnknownItemError:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, f"No such item: {item_id}") from None
    except gear.NotOwnedError:
        raise HTTPException(http_status.HTTP_409_CONFLICT, f"Not owned: {item_id}") from None

    view = await gear.read(db, current_user.id)
    await db.commit()
    return GearOut(
        items=[GearItemOut(**vars(i)) for i in view.items],
        balance=view.balance, slots=view.slots,
    )


@router.post("/gear/unequip/{item_id}", response_model=GearOut, summary="Take an owned item off")
async def unequip_gear(
    item_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GearOut:
    try:
        await gear.unequip(db, current_user.id, item_id)
    except gear.NotOwnedError:
        raise HTTPException(http_status.HTTP_409_CONFLICT, f"Not owned: {item_id}") from None

    view = await gear.read(db, current_user.id)
    await db.commit()
    return GearOut(
        items=[GearItemOut(**vars(i)) for i in view.items],
        balance=view.balance, slots=view.slots,
    )


# ── the workshop ────────────────────────────────────────────────────────────
class ComponentOut(BaseModel):
    id: str
    name_de: str
    action_de: str
    km_since: float
    #: Null for a part kilometres do not wear — sealant dries out in a cellar.
    interval_km: float | None
    km_total: float
    #: The CALENDAR clock, for parts that age on one. Null when we have never
    #: been told when it was last done.
    days_since: int | None = None
    interval_days: int | None = None
    #: "km" | "days" — which clock is currently driving `status`, and therefore
    #: which unit the meter must be labelled with. Labelling a sealant top-up in
    #: kilometres is the exact misunderstanding this release fixes.
    clock: str = "km"
    #: True while this is an optional part we have not asked about. The screen
    #: shows a QUESTION, never a job — see `bike_wear.is_dormant`.
    #: How the rider maintains it, where that changes the job — today only the
    #: chain ("oil" | "wax" | "dripwax"). Null means the default.
    method: str | None = None
    dormant: bool = False
    #: True when the part is confirmed but its age was never given, and it has
    #: no kilometre clock to fall back on. The screen ASKS instead of reporting.
    undated: bool = False
    optional: bool = False
    #: Unharvested Service Bonus sitting on this component right now.
    bonus_rc: int
    #: "fresh" | "due" | "overdue" — never a failure state, and never blocking.
    status: str
    progress: float
    #: True once the pile has stopped growing. It has NOT shrunk.
    accrual_stopped: bool


class ChainLifeOut(BaseModel):
    """The chain's SECOND clock — how much of the part itself is left.

    Separate from the component's service state on purpose: "needs cleaning"
    and "is worn out" are different questions with different answers, and only
    one of them costs a cassette when it is missed.
    """

    #: Weighted kilometres since this chain was fitted. A service does not
    #: touch it; only a replacement does.
    life_km: float
    #: Where 0,5 % elongation falls for THIS rider — the industry prior until
    #: they measure, their own number afterwards.
    limit_km: float
    #: Projected elongation in percent.
    pct: float
    #: Kilometres to the 0,5 % line. Negative once past it.
    km_left: float
    #: "fresh" | "due" | "ruinous". The third means the cassette is being cut.
    status: str
    progress: float
    measurements: int
    confidence: float
    #: False while this is still an industry average rather than this rider's
    #: own number. The screen must SAY "geschätzt" until it flips.
    calibrated: bool


class WorkshopOut(BaseModel):
    components: list[ComponentOut]
    total_bonus_rc: int
    #: "Wax tonight, rain tomorrow" — the one sentence no competitor can build
    #: (plan + forecast + wear state in one place). Null on most days; see
    #: services/maintenance_forecast for the rule.
    weather_ahead: str | None = None
    #: Whether the +12 % fresh-drivetrain earn bonus is currently live.
    drivetrain_fresh: bool
    #: The genuine drag of a dirty chain, in watts. Null while fresh — the app
    #: states a measured fact or says nothing, never a zero implying a reading.
    drivetrain_watts: float | None
    chain_km_total: float
    chain_record_km: float
    chain_life: ChainLifeOut
    balance: int
    #: The next part we still have to ask the rider about, or null. ONE at a
    #: time and only when the workshop is already open: six questions up front
    #: is a form, and forms get abandoned.
    open_question: ComponentOut | None = None


class ServiceRequest(BaseModel):
    """Optionally, a photo of the job.

    OPTIONAL IS LOAD-BEARING. The Service Bonus is paid in full without one; a
    confirmed photo adds on top. See `services/service_proof` for why proof can
    never be allowed to gate the reward.
    """

    #: A data URL or bare base64 JPEG. Absent, and the service just pays.
    proof_image: str | None = None


class ServiceOut(BaseModel):
    component_id: str
    name_de: str
    #: TOTAL credited, proof bonus included. One number, so the balance the
    #: screen shows can never disagree with the arithmetic beside it.
    paid_rc: int
    balance: int
    km_serviced: float
    new_record: bool
    record_km: float
    #: Of `paid_rc`, how much the photo added. Zero without a photo.
    proof_rc: int = 0
    #: What the check saw, in one German sentence. Never accusatory, and null
    #: when no photo was sent.
    proof_note: str | None = None
    proof_confirmed: bool = False
    #: The refreshed workshop, so the screen redraws without a second round trip.
    workshop: WorkshopOut


def _workshop_out(view: workshop.WorkshopView, balance: int) -> WorkshopOut:
    questions = workshop.open_questions(view)
    return WorkshopOut(
        components=[ComponentOut(**vars(c)) for c in view.components],
        open_question=ComponentOut(**vars(questions[0])) if questions else None,
        total_bonus_rc=view.total_bonus_rc,
        drivetrain_fresh=view.drivetrain_fresh,
        drivetrain_watts=view.drivetrain_watts,
        chain_km_total=round(view.chain_km_total, 1),
        chain_record_km=round(view.chain_record_km, 1),
        chain_life=ChainLifeOut(**vars(view.chain_life)),
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
    out = _workshop_out(view, balance)
    # Best-effort, after the commit: the nudge must never break or slow the
    # condition read it decorates (the forecast is 3h-cached per location).
    try:
        chain = next((c for c in view.components if c.id == "chain"), None)
        out.weather_ahead = await maintenance_forecast.weather_ahead(
            db, current_user.id,
            chain_progress=chain.progress if chain else 0.0,
            drivetrain_fresh=view.drivetrain_fresh,
        )
    except Exception:  # noqa: BLE001 — decorative, never fatal
        out.weather_ahead = None
    return out


@router.post("/workshop/service/{component_id}", response_model=ServiceOut, summary="Service a component and harvest its Service Bonus")
async def service_component(
    component_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    body: ServiceRequest | None = None,
) -> ServiceOut:
    """Reset one component's interval and CREDIT the bonus it banked.

    There is no failure mode here worth a non-200 except an unknown component.
    Servicing something you cleaned yesterday pays 0 RC and says so — it is a
    fair trade the rider is allowed to make, not an error. Nothing in this path
    can ever debit; see `services/workshop`.
    """
    # The photo is checked BEFORE the transaction does anything, and its every
    # failure mode returns "unavailable" rather than raising — see
    # `services/service_proof`. An exception here would roll back a service the
    # rider genuinely performed, which is the one outcome this loop must never
    # produce.
    verdict = (
        await service_proof.check(body.proof_image, component_id)
        if body and body.proof_image else None
    )
    try:
        result = await workshop.service(db, current_user.id, component_id, verdict)
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
        proof_rc=result.proof_rc,
        proof_note=result.proof_note,
        proof_confirmed=result.proof_confirmed,
        workshop=_workshop_out(view, result.balance),
    )


class SeedRequest(BaseModel):
    """When the rider last did this job, as a plain date."""

    #: ISO date. The future is clamped to now rather than rejected — a rider
    #: whose phone clock is a day ahead should not meet a validation error.
    last_service_on: date


class SeedOut(BaseModel):
    component_id: str
    name_de: str
    km_since: float
    #: How many real rides were replayed to reach that number. This is what
    #: makes the answer believable on screen — "aus 34 Fahrten berechnet" is a
    #: claim the rider can check against their own feed.
    rides: int
    days_since: int
    workshop: WorkshopOut


class HaveRequest(BaseModel):
    #: False is a first-class answer: a rim-brake rider is never asked again.
    owned: bool


@router.post("/workshop/seed/{component_id}", response_model=SeedOut, summary="Start a component's clock from the date the rider gives")
async def seed_component(
    component_id: str,
    body: SeedRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> SeedOut:
    """Answer "wann zuletzt?" and rebuild the odometer from the ride history.

    NOT an estimate from the date. Every ride since it is already stored with
    its distance, its measured work and its elevation, so the same physics that
    scores a ride at ingestion scores the backlog — the rider lands on the
    number they would have had if the app had been installed all along. See
    `workshop.seed` for the one approximation this makes and why it is stated.
    """
    try:
        result = await workshop.seed(
            db, current_user.id, component_id,
            datetime.combine(body.last_service_on, time.min, tzinfo=UTC),
        )
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND, f"No such component: {component_id}"
        ) from None

    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    return SeedOut(
        component_id=result.component_id,
        name_de=result.name_de,
        km_since=result.km_since,
        rides=result.rides,
        days_since=result.days_since,
        workshop=_workshop_out(view, balance),
    )


@router.post("/workshop/have/{component_id}", response_model=WorkshopOut, summary="Say whether the bike has an optional part")
async def declare_component(
    component_id: str,
    body: HaveRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WorkshopOut:
    """Record that the bicycle has — or does not have — this part.

    "Nein" is permanent until changed. Rim brakes have no fluid and inner tubes
    have no sealant, and an app that keeps asking teaches the rider that the
    whole maintenance surface guesses.
    """
    try:
        await workshop.declare(db, current_user.id, component_id, body.owned)
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND, f"No such component: {component_id}"
        ) from None

    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    out = _workshop_out(view, balance)
    # Best-effort, after the commit: the nudge must never break or slow the
    # condition read it decorates (the forecast is 3h-cached per location).
    try:
        chain = next((c for c in view.components if c.id == "chain"), None)
        out.weather_ahead = await maintenance_forecast.weather_ahead(
            db, current_user.id,
            chain_progress=chain.progress if chain else 0.0,
            drivetrain_fresh=view.drivetrain_fresh,
        )
    except Exception:  # noqa: BLE001 — decorative, never fatal
        out.weather_ahead = None
    return out


class MethodRequest(BaseModel):
    #: A key of `bike_wear.CHAIN_METHODS` for the chain.
    method: str


class MethodOption(BaseModel):
    id: str
    name_de: str
    interval_km: float
    action_de: str


@router.get("/workshop/methods/{component_id}", response_model=list[MethodOption], summary="How this component can be maintained")
async def component_methods(
    component_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
) -> list[MethodOption]:
    """The maintenance regimes this component supports, with the interval each
    one actually carries. Empty for every component but the chain.

    Served rather than hardcoded in the client so the intervals on screen are
    the ones the server will grade against — the client stating "alle 300 km"
    beside a server that thinks 250 is precisely the drift `spec_of` exists to
    prevent.
    """
    if component_id != bike_wear.DRIVETRAIN:
        return []
    return [
        MethodOption(id=m.id, name_de=m.name_de, interval_km=m.interval_km,
                     action_de=m.action_de)
        for m in bike_wear.CHAIN_METHODS.values()
    ]


@router.post("/workshop/method/{component_id}", response_model=WorkshopOut, summary="Set how a component is maintained")
async def set_component_method(
    component_id: str,
    body: MethodRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WorkshopOut:
    """Switch between oiling and waxing. The kilometres on the chain do NOT
    reset — switching lube does not clean a chain, it only changes the interval
    those kilometres are measured against."""
    try:
        await workshop.set_method(db, current_user.id, component_id, body.method)
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND,
            f"No such component or method: {component_id}/{body.method}",
        ) from None

    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    out = _workshop_out(view, balance)
    # Best-effort, after the commit: the nudge must never break or slow the
    # condition read it decorates (the forecast is 3h-cached per location).
    try:
        chain = next((c for c in view.components if c.id == "chain"), None)
        out.weather_ahead = await maintenance_forecast.weather_ahead(
            db, current_user.id,
            chain_progress=chain.progress if chain else 0.0,
            drivetrain_fresh=view.drivetrain_fresh,
        )
    except Exception:  # noqa: BLE001 — decorative, never fatal
        out.weather_ahead = None
    return out


class MeasureRequest(BaseModel):
    """A chain-checker reading, in percent. 0,25 / 0,5 / 0,75 on a typical gauge."""

    measured_pct: float = Field(ge=0, le=3)


class MeasureOut(BaseModel):
    component_id: str
    measured_pct: float
    life_km_at: float
    #: True when the reading actually moved this rider's estimate — the payoff
    #: for owning a €10 gauge, and the only thing worth celebrating here.
    moved_estimate: bool
    workshop: WorkshopOut


class ReplaceRequest(BaseModel):
    """When the new part went on. Absent means now."""

    fitted_at: datetime | None = None


class ReplaceOut(BaseModel):
    component_id: str
    name_de: str
    #: What the retired part managed, weighted and in real road kilometres.
    retired_life_km: float
    retired_km_total: float
    #: Rides replayed when the rider dated the fitting in the past.
    rides_replayed: int
    workshop: WorkshopOut


@router.post("/workshop/measure/{component_id}", response_model=MeasureOut,
             summary="Record a chain-checker reading and recalibrate the chain's life")
async def measure_component(
    component_id: str,
    body: MeasureRequest,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> MeasureOut:
    """Two readings and the app stops quoting an industry average at the rider
    and starts quoting their own drivetrain back to them.

    Deliberately pays nothing. The moment a measurement earns RideCoin there is
    a reason to lie to the gauge, and the whole point of this number is that it
    is the one thing in the workshop that comes from outside the model.
    """
    try:
        result = await workshop.measure(db, current_user.id, component_id, body.measured_pct)
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND, f"No such component: {component_id}",
        ) from None
    except ValueError:
        raise HTTPException(
            http_status.HTTP_422_UNPROCESSABLE_CONTENT, "measured_pct out of range",
        ) from None

    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    return MeasureOut(
        component_id=result.component_id,
        measured_pct=result.measured_pct,
        life_km_at=result.life_km_at,
        moved_estimate=result.moved_estimate,
        workshop=_workshop_out(view, balance),
    )


@router.post("/workshop/replace/{component_id}", response_model=ReplaceOut,
             summary="Fit a new part — every clock on it starts again")
async def replace_component(
    component_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    body: ReplaceRequest | None = None,
) -> ReplaceOut:
    """Replacing is not servicing. A service cleans what is there and pays its
    banked bonus; this throws the part away, so it is the one operation allowed
    to reset the lifetime odometers — and it pays nothing, because no
    kilometres were ridden to earn it.

    Dating the fitting in the past replays the rides since, so a chain fitted
    three weeks ago lands on the kilometres it has really covered.
    """
    try:
        result = await workshop.replace(
            db, current_user.id, component_id, body.fitted_at if body else None,
        )
    except workshop.UnknownComponentError:
        raise HTTPException(
            http_status.HTTP_404_NOT_FOUND, f"No such component: {component_id}",
        ) from None

    view = await workshop.read(db, current_user.id)
    balance = await rewards.balance_of(db, current_user.id)
    await db.commit()
    return ReplaceOut(
        component_id=result.component_id,
        name_de=result.name_de,
        retired_life_km=result.retired_life_km,
        retired_km_total=result.retired_km_total,
        rides_replayed=result.rides_replayed,
        workshop=_workshop_out(view, balance),
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
        # KEEP THE RIDER'S OWN PHOTOGRAPH, because every later render needs it
        # and this endpoint used to drop it on the floor. `restyle` re-renders
        # from `description` alone, and so does every scene composition — a
        # hundred and twenty words of prose standing in for a face, which is why
        # the second render was never quite the same person as the first. Stored
        # as a head crop rather than the upload: the renders that read it are
        # portraits, the row is read on hot paths, and the least of somebody's
        # photograph that still does the job is the right amount of it to keep.
        #
        # RIDERS ONLY. A bicycle has no identity to lose, and `render_bike_from_photo`
        # already hands the machine's photograph straight to the model.
        if body.kind == "rider":
            asset.source_photo = await _source_crop(body.photo_base64)
        if replaced:
            await db.execute(delete(RideScene).where(RideScene.user_id == current_user.id))
            await db.execute(delete(DayScene).where(DayScene.user_id == current_user.id))
        await db.commit()
        saved = True

    return AssetRenderResponse(
        # Same split as `_to_out`: the response the studio screen reads its spec
        # sheet from must carry the German half, not the image prompt.
        name=out["name"], description=cyclr_studio.split_description(out["description"])[1] or None,
        prompt=out["prompt"],
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


async def _cached_day_scene(
    db: AsyncSession, user_id: int, pose: str, backdrop: str,
) -> DayScene | None:
    return (await db.execute(
        select(DayScene).where(
            DayScene.user_id == user_id,
            DayScene.pose == pose,
            DayScene.backdrop == backdrop,
        )
    )).scalar_one_or_none()


async def _selected_backdrop(db: AsyncSession, user_id: int) -> str:
    """The stage this rider picked, or the starter road.

    Resolved through `backdrops.resolve` rather than returned raw, so a stored
    id that a deploy has since removed from the catalogue degrades to the
    default instead of 500-ing every hero request until the rider picks again.
    """
    row = (await db.execute(
        select(RiderStage).where(RiderStage.user_id == user_id)
    )).scalar_one_or_none()
    return (await stages.stage_for(db, row.backdrop if row else None)).id


async def _cheap_history_facts(db: AsyncSession, user_id: int) -> list[em.RideFacts]:
    """Every ride, as far as the WEATHERLESS unlock rules can see it.

    Deliberately partial. Climbing, distance, start hour, intensity and surface
    all come off the activity itself, so evaluating them across a rider's whole
    history costs one query. Wetness and temperature do not — each is a lookup
    per ride (`services.ride_facts.weather_of`) — so they are left None here and
    the rules that need them (`backdrops.NEEDS_WEATHER`) simply do not fire.
    Those two are earned going forward instead, captured at ingestion where the
    facts are already paid for. Rule 4 of the modifier catalogue, applied to
    unlocks: a fact we do not have never fires.

    The whole history SINCE THE LAUNCH, not a window: a stage is earned once and
    kept, so a pass climbed the week after launch must not close again because
    time passed — but a pass climbed the year before it never opens at all.
    """
    rows = (await db.execute(
        select(
            Activity.id, Activity.distance_meters, Activity.elevation_gain_m,
            Activity.duration_seconds, Activity.started_at, Activity.tss, Activity.raw_data,
        ).where(
            Activity.user_id == user_id,
            # THE SAME CUTOFF THE INGESTION PATH KEEPS. Without it this arm
            # quietly re-opens everything a rider's history proves the moment
            # they tap the picker, and the launch gate would only look like it
            # worked. See `backdrops.STAGES_LIVE_FROM`.
            Activity.started_at >= backdrops.STAGES_LIVE_FROM,
        )
    )).all()

    out: list[em.RideFacts] = []
    for r in rows:
        dist, dur = r.distance_meters, r.duration_seconds
        # The same two derivations `ride_economy._ride_facts` makes, kept
        # identical on purpose: a rider must not unlock the velodrome here at an
        # IF the earn engine would have computed differently.
        avg_kmh = (dist / 1000) / (dur / 3600) if dist and dur else None
        iff = (r.tss / ((dur / 3600) * 100)) ** 0.5 if r.tss and dur and dur > 0 else None
        try:
            surface = ride_facts.surface_of(SimpleNamespace(raw_data=r.raw_data))
        except Exception:
            surface = None
        out.append(em.RideFacts(
            distance_m=dist,
            elevation_gain_m=r.elevation_gain_m,
            duration_s=dur,
            avg_speed_kmh=avg_kmh,
            start_hour=r.started_at.hour if r.started_at else None,
            intensity_factor=iff,
            surface=surface,
        ))
    return out


async def _unlocked_backdrops(db: AsyncSession, user_id: int) -> list[str]:
    """Every stage this rider may choose: starters, what they earned at
    ingestion, and what their history proves without a weather lookup."""
    earned = set((await db.execute(
        select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == user_id)
    )).scalars().all())
    live = set(backdrops.unlocked_ids(await _cheap_history_facts(db, user_id))) - backdrops.scene_catalogue.RELEASED
    have = earned | live | set(backdrops.STARTERS)
    return [b for b in backdrops.CATALOGUE if b in have]


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
    backdrop = await _selected_backdrop(db, current_user.id)
    scene = await _cached_day_scene(db, current_user.id, pose, backdrop)
    if scene is not None and scene.image_url:
        return DaySceneOut(pose=pose, backdrop=backdrop, image_base64=scene.image_url,
                           training_context=scene.training_context,
                           prompt=scene.prompt, status="ok")
    missing = await _missing_asset(db, current_user.id)
    return DaySceneOut(pose=pose, backdrop=backdrop, image_base64=None, training_context=None,
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
    return await _compose_day_scene(db, current_user.id, pose)


async def _compose_day_scene(db: AsyncSession, user_id: int, pose: str) -> DaySceneOut:
    """Compose (or read back) one pose on the rider's currently chosen stage.

    Shared by `POST /scene/today` and by a stage switch, because they are the
    same operation seen from two directions: "render today's pose" and "render
    today's pose somewhere else" differ only in which backdrop is selected when
    they run.
    """
    backdrop = await _selected_backdrop(db, user_id)
    cached = await _cached_day_scene(db, user_id, pose, backdrop)
    if cached is not None and cached.image_url:
        return DaySceneOut(pose=pose, backdrop=backdrop, image_base64=cached.image_url,
                           training_context=cached.training_context,
                           prompt=cached.prompt, status="ok")

    missing = await _missing_asset(db, user_id)
    if missing:
        return DaySceneOut(pose=pose, backdrop=backdrop, image_base64=None,
                           training_context=None, prompt=None, status=missing)

    rider = await _get_asset(db, user_id, "rider")
    bike = await _get_asset(db, user_id, "bike")
    assert rider is not None and bike is not None  # _missing_asset just proved it
    # What the rider has on their own head — the two worn slots. Composed into
    # the scene rather than edited onto a stored figure, because unlike the bike
    # the rider is drawn fresh every time. See `services.rider_wear`.
    equipped = await gear.equipped_ids(db, user_id)
    stage = await stages.stage_for(db, backdrop)
    ctx = day_context(pose, stage.prose)
    # The rider's own renders ride along as image references, so the figure on
    # the day-state hero is recognisably the one in their garage rather than a
    # fresh interpretation of the same words.
    image, prompt, render_status = await cyclr_studio.compose_scene(
        rider.description or "", bike.description or "", ctx,
        rider_img=rider.image_url, bike_img=bike.image_url,
        wear=rider_wear.clause(equipped),
        # A real place hands its shared plate over as the background, so every
        # rider who owns the Dolomites is standing in the SAME Dolomites — the
        # one render the app paid for. A hand-written stage has no plate and is
        # built from prose, exactly as before.
        plate_img=stage.plate_url,
    )
    if image:
        if cached is None:
            cached = DayScene(user_id=user_id, pose=pose, backdrop=backdrop)
            db.add(cached)
        cached.image_url = image
        cached.training_context = ctx
        cached.prompt = prompt
        await db.commit()

    return DaySceneOut(pose=pose, backdrop=backdrop, image_base64=image,
                       training_context=ctx, prompt=prompt, status=render_status)


# ── the stage Today's hero plays on ─────────────────────────────────────────
# Earned by riding, never bought. The garage already has a shop; a picture you
# paid for says nothing about you, and a picture you opened by climbing a
# thousand metres says exactly one thing. See `services.backdrops`.
async def _render_plate_later(user_id: int, slug: str) -> None:
    """Render one place's shared plate, on its own session. Never raises.

    Its own session because the request's is closed by the time this runs, and
    holding one open across a model render would tie up a connection for
    minutes. `places.ensure_plate` is already idempotent and already silent on
    failure, so a second request that races this one costs nothing.
    """
    from app.database import async_session_maker

    try:
        async with async_session_maker() as db:
            await db.execute(text("SELECT set_config('app.current_user_id', :uid, true)"),
                             {"uid": str(user_id)})
            row = (await db.execute(select(Place).where(Place.slug == slug))).scalar_one_or_none()
            if row is None:
                return
            url = await places.ensure_plate(db, row)
            logger.info("plate for %s: %s", slug, "rendered" if url else "not available")
    except Exception:
        logger.info("plate render failed for %s", slug, exc_info=True)


@router.get("/backdrops", response_model=BackdropsOut,
            summary="The stages, which ones this rider has opened, and which is in use")
async def get_backdrops(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    background: BackgroundTasks = None,  # noqa: RUF013 — FastAPI injects it
) -> BackdropsOut:
    """Every stage in the catalogue, locked ones included.

    Locked stages are returned deliberately. Half the value of this screen is
    telling a rider what a ride would earn them — a picker that hid everything
    unearned would show a new rider two entries and no reason to ride.
    """
    unlocked = set(await _unlocked_backdrops(db, current_user.id))
    selected = await _selected_backdrop(db, current_user.id)

    all_places = (await db.execute(
        select(Place).order_by(Place.created_at.desc())
    )).scalars().all()
    stamps = {
        s.place_id: s.rides for s in (await db.execute(
            select(RiderPlaceStamp).where(RiderPlaceStamp.user_id == current_user.id)
        )).scalars().all()
    }
    owned = set((await db.execute(
        select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == current_user.id)
    )).scalars().all())

    # ── THE PLACES HAD NO PICTURES, AND NOTHING WAS EVER GOING TO MAKE THEM ──
    # `places.ensure_plate` is complete, documented, and says of itself "safe to
    # call on every read of a place" — and it was called from nowhere at all.
    # So every entry in this gallery has been showing NOCH KEIN BILD since the
    # feature shipped: a rider is asked to spend 2 000 RC on a place they cannot
    # see. The view was right; the picture was simply never made.
    #
    # In the BACKGROUND, never inline: a plate is a model render of a couple of
    # minutes, and this response is a gallery someone is looking at right now.
    # One place per request, oldest first, so opening the screen a few times
    # fills it in rather than firing every render at once.
    if background is not None:
        pending = [p for p in all_places if not p.plate_url]
        # THE RIDER'S OWN PLACES ARE RENDERED FIRST. Oldest-first was a fair
        # queue and the wrong one: the gallery leads with DEINE ORTE — the
        # places this rider has actually stood their bike in — and those are
        # the cards they look at, so those are the cards that must stop being
        # a black square. A place nobody here has ridden can wait for its
        # picture; the one with "6 x gefahren" under it cannot.
        pending.sort(key=lambda p: (p.id not in stamps, p.created_at))
        if pending:
            background.add_task(_render_plate_later, current_user.id, pending[0].slug)

    return BackdropsOut(
        selected=selected,
        balance_rc=await rewards.balance_of(db, current_user.id),
        backdrops=[
            BackdropOut(
                id=b.id, name_de=b.name_de, unlock_de=b.unlock_de,
                unlocked=b.id in unlocked, selected=b.id == selected,
            )
            for b in backdrops.CATALOGUE.values()
        ],
        places=[
            PlaceOut(
                slug=p.slug, name=p.name, plate_url=p.plate_url, price_rc=p.price_rc,
                stamped=p.id in stamps, rides=stamps.get(p.id, 0),
                owned=p.slug in owned, selected=p.slug == selected,
            )
            for p in all_places
        ],
    )


@router.post("/places/{slug}/buy", response_model=BackdropsOut,
             summary="Buy a place you have ridden")
async def buy_place(
    slug: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> BackdropsOut:
    """Spend RideCoin on a place this rider has a stamp for.

    TWO GATES, AND THEY REFUSE DIFFERENTLY. No stamp is a 403 and always will
    be — no amount of money opens it, because the stamp is the part that means
    something. No coins is a 402: come back after a few more rides.
    """
    full_slug = slug if slug.startswith(places.PREFIX) else places.PREFIX + slug
    try:
        await places.buy(db, current_user.id, full_slug)
    except KeyError:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND,
                            "Diesen Ort gibt es noch nicht.") from None
    except places.NotStampedError:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN,
                            "Da bist du noch nicht gefahren.") from None
    except places.AlreadyOwnedError:
        raise HTTPException(http_status.HTTP_409_CONFLICT,
                            "Gehört dir schon.") from None
    except rewards.InsufficientBalanceError:
        raise HTTPException(http_status.HTTP_402_PAYMENT_REQUIRED,
                            "Dafür reichen deine RideCoins noch nicht.") from None

    return await get_backdrops(current_user, db)


@router.post("/backdrops/{backdrop_id}", response_model=TodayStageOut,
             summary="Stand the bike somewhere else")
async def select_backdrop(
    backdrop_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TodayStageOut:
    """Switch the stage Today's bike stands in.

    THE SWITCH ITSELF IS FREE AND INSTANT. It stores a choice and returns the
    screen; it does not render. A stage the rider has stood in before comes
    straight back out of the cache with its picture, and a new one comes back
    with the plain bike until `POST /garage/today/render` composes it. That is
    what makes swiping through a set of backdrops feel like flicking through
    photographs rather than like queuing up image-model calls.

    A locked stage is refused rather than quietly ignored: the picker knows what
    is open, so a request for a closed one is a client that has drifted from the
    server, and honouring it would hand out a reward nobody earned.
    """
    # A stage is either hand-written or a real place, and they are gated
    # differently: a hand-written one is EARNED by what the rider did, a place is
    # earned by going there AND bought. `stages` is the seam that lets the rest
    # of this endpoint stop caring which kind it is holding.
    if places.is_place(backdrop_id):
        if await places.by_slug(db, backdrop_id) is None:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND,
                                detail="Diesen Ort gibt es noch nicht.")
        owned = set((await db.execute(
            select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == current_user.id)
        )).scalars().all())
        if backdrop_id not in owned:
            raise HTTPException(status_code=http_status.HTTP_402_PAYMENT_REQUIRED,
                                detail="Diesen Ort hast du noch nicht gekauft.")
    else:
        if backdrop_id not in backdrops.CATALOGUE:
            raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND,
                                detail="Diesen Hintergrund gibt es nicht.")
        if backdrop_id not in await _unlocked_backdrops(db, current_user.id):
            raise HTTPException(status_code=http_status.HTTP_403_FORBIDDEN,
                                detail="Diesen Hintergrund hast du noch nicht freigefahren.")

    row = (await db.execute(
        select(RiderStage).where(RiderStage.user_id == current_user.id)
    )).scalar_one_or_none()
    if row is None:
        row = RiderStage(user_id=current_user.id, backdrop=backdrop_id)
        db.add(row)
    else:
        row.backdrop = backdrop_id
    await db.commit()

    from app.services import stage_unlock, scene_render
    if backdrop_id in scene_render.READY:
        stage_unlock.warm(current_user.id, [backdrop_id])
    result = await get_today_stage(current_user, db)
    if backdrop_id in scene_render.READY and not result.bike_scene:
        result.scene_pending = True
    return result


def _route_points(data: dict) -> list[tuple[float, float]]:
    """Six points spread evenly along the track.

    Evenly along the WHOLE ride, not the first six samples: a route's character
    is where it went, and the opening kilometre is usually the rider's own
    street. Six is enough for a resolver to see a lake circuit or a pass and
    few enough to stay a cheap prompt.
    """
    lats = [v for v in (data.get("latitude") or []) if v]
    lngs = [v for v in (data.get("longitude") or []) if v]
    n = min(len(lats), len(lngs))
    if n == 0:
        return []
    step = max(1, n // 6)
    return [(float(lats[i]), float(lngs[i])) for i in range(0, n, step)][:6]


async def _place_of_activity(db: AsyncSession, user_id: int, activity: Activity) -> Place | None:
    """The place this ride was in, from the row ingestion already wrote.

    Falls back to resolving the GPS here, because a ride synced before places
    existed — or one whose reverse-geocode failed the first time — should still
    be able to earn its world the moment a rider asks for the picture.
    """
    row = (await db.execute(
        select(Place)
        .join(RiderPlaceStamp, RiderPlaceStamp.place_id == Place.id)
        .where(
            RiderPlaceStamp.user_id == user_id,
            Place.discovered_by_activity_id == activity.id,
        )
    )).scalars().first()
    if row is not None:
        return row

    stream = (await db.execute(
        select(ActivityStream).where(ActivityStream.activity_id == activity.id)
    )).scalar_one_or_none()
    data = stream.streams if stream is not None else None
    if not isinstance(data, dict):
        return None
    lats = [v for v in (data.get("latitude") or []) if v]
    lngs = [v for v in (data.get("longitude") or []) if v]
    if not lats or not lngs:
        return None

    name = await ride_place.resolve(
        float(lats[0]), float(lngs[0]), points=_route_points(data),
    )
    if not name:
        return None
    geo = RideGeo(
        distance_m=activity.distance_meters,
        elevation_gain_m=activity.elevation_gain_m,
        start_lat=float(lats[0]), start_lng=float(lngs[0]), place_name=name,
    )
    place = await places.ensure(db, name, geo, user_id=user_id, activity_id=activity.id)
    await places.stamp(db, user_id, place)
    return place


async def _refetch_ride_weather(db: AsyncSession, activity: Activity) -> ride_weather.RideWeather | None:
    """Fetch the weather this ride was missing, cache it, and return it.

    Returns None — silently — whenever it cannot: no GPS to ask about, no start
    time, the archive unreachable. The picture is then composed exactly as it
    would have been, which is the whole contract: this can only ever add.
    """
    try:
        if activity.started_at is None:
            return None
        row = (await db.execute(
            select(ActivityStream).where(ActivityStream.activity_id == activity.id)
        )).scalar_one_or_none()
        if row is None:
            return None
        s = row.streams if isinstance(row.streams, dict) else json.loads(row.streams or "{}")
        lats = [v for v in (s.get("latitude") or []) if v is not None]
        lngs = [v for v in (s.get("longitude") or []) if v is not None]
        if not lats or not lngs:
            return None
        end = activity.started_at + timedelta(seconds=int(activity.duration_seconds or 3600))
        blob = await weather_client.fetch_ride_weather(
            float(lats[0]), float(lngs[0]), activity.started_at, end,
        )
        if not isinstance(blob, dict):
            return None
        row.weather = blob
        await db.commit()
        return ride_weather.summarise(blob, activity.started_at)
    except Exception:
        logger.info("weather refetch failed for activity %s", activity.id, exc_info=True)
        return None


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
    bike = await _get_asset(db, current_user.id, "bike")
    if not (bike and bike.description and bike.image_url):
        return SceneOut(activity_id=activity_id, image_base64=None, training_context=None,
                        prompt=None, status="needs_bike")

    # ── THE MACHINE, ALONE ──────────────────────────────────────────────────
    # A past ride is shot in the PHOTOREAL register (`services.ride_framing`),
    # not the stylised Today one, and it has no rider in it. That module's own
    # header argues the case better than a comment here can: the human figure is
    # where these models fail, the reference this app is chasing has no human in
    # it at all, and a finished ride is about the machine and where it went.
    #
    # It was built and tuned against the real model (commits 3634ad9, 5690736,
    # `docs/framing-garden-r3.webp`) and then never wired to anything — this
    # endpoint kept composing the Today register. `needs_rider` is gone from
    # this path as a result: a rider who has photographed their bike but not
    # themselves can now have every one of their rides shot.
    geo = RideGeo(
        distance_m=activity.distance_meters,
        elevation_gain_m=activity.elevation_gain_m,
    )
    # ── WHERE THE RIDE ACTUALLY WAS ─────────────────────────────────────────
    # THE GPX DECIDES THE WORLD, not a terrain lookup. This endpoint used to
    # pick a hand-written framing from a table keyed on how hilly the ride was,
    # which meant a 40 km ride through Berlin resolved to "flat" and was
    # photographed against an EMPTY BLACK STUDIO — the rider had just ridden
    # somewhere real and the app showed them a void.
    #
    # The place is already known: ingestion resolves every ride's first GPS fix
    # and stores it (`services.places`), together with prose written from THAT
    # ride's own terrain — the resolved place leading, the terrain qualifying it
    # (`ride_scene.scene_descriptor`). So the world is read from the row rather
    # than guessed, and Berlin is rendered as Berlin.
    #
    # The framing catalogue stays as the fallback for a ride with no usable GPS,
    # which is the one case where there is genuinely nowhere to put the bike.
    #
    # THE FALLBACK IS CHOSEN ONCE, AND IT IS CHOSEN ON EMPTINESS. A place row
    # whose prose is blank used to reach the prompt builder through the `else`
    # arm below with `framing_id` never assigned — a NameError, i.e. a 500, on
    # the one tap this whole feature exists for. Deciding the world here, in one
    # place, means "we have a place" and "we have prose to render it with" can
    # never disagree again.
    place = await _place_of_activity(db, current_user.id, activity)
    world = (place.prose or "").strip() if place is not None else ""

    # ── THE WEATHER THAT DAY ────────────────────────────────────────────────
    # Already stored for 168 of 183 rides and never once looked at by the hero,
    # so a ride done in the rain and a ride done in August sun were photographed
    # in identical light — the moment a rider stops believing the picture is
    # about THEIR ride. Only what is actually recorded is said (temperature,
    # precipitation, wind); a ride with no weather row gets no weather clause
    # rather than invented sunshine. The cache key carries it, because two
    # different days on the same road are two different pictures.
    wx_row = (await db.execute(
        select(ActivityStream.weather).where(ActivityStream.activity_id == activity_id)
    )).scalar_one_or_none()
    blob = json.loads(wx_row) if isinstance(wx_row, str) else wx_row
    wx = ride_weather.summarise(blob, activity.started_at)
    if wx is None:
        # ── A FAILED FETCH IS NOT AN ANSWER ─────────────────────────────────
        # 62 of 183 stored streams hold a literal JSON `null` here: the weather
        # call failed once at ingestion and the failure was persisted as though
        # it were the result. Those rides then get no weather clause forever,
        # which is exactly the case the rider notices — a bright summer ride
        # rendered under a sky nobody measured.
        #
        # Open-Meteo's archive still has that day, so a compose (already a
        # minutes-long, model-backed operation) can afford one HTTP call to go
        # and get it, and writes it back so it is fetched once and not again.
        # Never fatal: a second failure leaves the picture exactly as it would
        # have been.
        wx = await _refetch_ride_weather(db, activity)
    weather = ride_weather.clause(wx)
    wet = "wet" if (wx and wx.wet) else "dry"

    if world:
        ctx, key = place.name, f"ride:{activity_id}:{place.slug}:{wet}"
        prompt = bike_build.edit_prompt([], world=world, weather=weather)
    else:
        framing_id = ride_framing.default_framing_for(geo)
        f = ride_framing.get(framing_id)
        ctx, key = f.name_de, f"ride:{activity_id}:{framing_id}:{wet}"
        prompt = ride_framing.edit_prompt(framing_id, weather=weather)

    # EDIT, never redraw. The rider's own bike render goes back in as the input
    # image so the frame, the decals and the components stay pixel-identical
    # between two worlds — the measurement in `docs/w3-bike-customisation.md`.
    # `bike_build.edit_prompt` with a `world` is the SAME path that puts a bike
    # in the Dolomites and stands it on the road rather than floating it there.
    # NEVER A 500. Composing takes a couple of minutes and costs a model call,
    # so the one thing the rider must not meet at the end of it is a raw error
    # page: they cannot tell a dead image model from a bug, and either way the
    # only thing on screen is "Fehler". `edit_image` already degrades to None on
    # its own known failures; this catches everything else and says the same
    # honest thing the missing-model case says.
    try:
        image = await cyclr_studio.edit_image(
            bike.image_url, prompt, key,
            # Framed on the same canonical box as every other stage, so a
            # rider's rides and their stages read as one collection rather than
            # as a set of differently-cropped photographs.
            frame_ratio=stage_frame.geometry_from_cutout(bike.image_url)
            or stage_frame.RATIO_DEFAULT,
        )
    except Exception:
        logger.exception("ride scene compose failed for activity_id=%s", activity_id)
        image = None
    render_status = "ok" if image else "image_model_unavailable"
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

# ── the stage gallery, and what a ride opened ───────────────────────────────

class GalleryStageOut(BaseModel):
    """One stage in the rider's collection."""

    id: str
    name_de: str
    #: What it took, in the rider's own language. "" for the starters.
    unlock_de: str
    owned: bool
    #: The rider's own bike standing in it, when that render exists yet. Null
    #: while it is still warming, or for a stage they have not earned — never a
    #: stand-in from someone else's garage.
    image: str | None
    #: When they earned it, and the ride that did it. Null for a starter and for
    #: anything granted by the live history check rather than at ingestion.
    unlocked_at: datetime | None
    activity_id: int | None
    plate_url: str | None = None
    tier: str = "alltag"
    starter: bool = False
    selected: bool = False
    progress: dict | None = None
    render_status: str = "missing"


class GalleryOut(BaseModel):
    stages: list[GalleryStageOut]
    owned_count: int
    total_count: int


@router.get("/gallery", response_model=GalleryOut, summary="Every stage, earned and not")
async def get_gallery(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> GalleryOut:
    """The rider's stage collection — owned ones with their own picture in them.

    LOCKED STAGES ARE LISTED, and that is deliberate: a collection you cannot
    see the shape of is not a collection, and the unlock sentence is the whole
    invitation ("1 000 hm an einem Tag"). What a locked row never carries is a
    PICTURE, because the only honest picture of an unearned stage would be
    somebody else's bike standing in it.
    """
    owned_ids = set(await _unlocked_backdrops(db, current_user.id))
    selected = await _selected_backdrop(db, current_user.id)
    history = await _cheap_history_facts(db, current_user.id)

    rows = (await db.execute(
        select(RiderBackdrop).where(RiderBackdrop.user_id == current_user.id)
    )).scalars().all()
    meta = {r.backdrop: r for r in rows}

    asset = (await db.execute(
        select(GarageAsset).where(
            GarageAsset.user_id == current_user.id, GarageAsset.kind == "bike",
        )
    )).scalar_one_or_none()
    equipped = await gear.equipped_ids(db, current_user.id)

    keys: dict[str, str] = {}
    if asset is not None and asset.image_url:
        stamp = (asset.updated_at or asset.created_at).isoformat()
        for sid in owned_ids:
            keys[sid] = _bike_key(asset, equipped, sid)

    images: dict[str, str] = {}
    statuses: dict[str, str] = {}
    if keys:
        found = (await db.execute(
            select(BikeRender).where(BikeRender.build_key.in_(list(keys.values())))
        )).scalars().all()
        by_key = {r.build_key: r for r in found}
        for sid, k in keys.items():
            row = by_key.get(k)
            if row is not None:
                statuses[sid] = row.status
                if row.status == "ok" and row.image:
                    if sid in backdrops.scene_catalogue.RELEASED:
                        from app.services import scene_render
                        images[sid] = await run_in_threadpool(scene_render.display_image, row.image)
                    else:
                        images[sid] = row.image

    stages = [
        GalleryStageOut(
            id=b.id,
            name_de=b.name_de,
            unlock_de=b.unlock_de,
            owned=b.id in owned_ids,
            image=images.get(b.id),
            render_status=statuses.get(b.id, "missing"),
            plate_url=backdrops.scene_catalogue.plate_url(b.id),
            tier=backdrops.scene_catalogue.CATALOGUE[b.id].tier if b.id in backdrops.scene_catalogue.CATALOGUE else "alltag",
            starter=b.is_starter,
            selected=b.id == selected,
            progress=backdrops.scene_catalogue.progress(backdrops.scene_catalogue.CATALOGUE[b.id], history) if b.id in backdrops.scene_catalogue.CATALOGUE else None,
            unlocked_at=getattr(meta.get(b.id), "unlocked_at", None),
            activity_id=getattr(meta.get(b.id), "activity_id", None),
        )
        for b in backdrops.CATALOGUE.values()
    ]
    return GalleryOut(
        stages=stages,
        owned_count=sum(1 for s in stages if s.owned),
        total_count=len(stages),
    )


class RideUnlockOut(BaseModel):
    stages: list[GalleryStageOut]


@router.get(
    "/gallery/unlocked-by/{activity_id}",
    response_model=RideUnlockOut,
    summary="What this ride opened",
)
async def get_unlocked_by(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RideUnlockOut:
    """The unlock screen's question, asked of the permanent record.

    Derived rather than flagged: a `seen` column would be cleared by a re-sync
    and would need a migration, and another worktree currently has one in
    flight — a second alembic head on this line takes the API down on boot.
    Asking "what did ride 4711 open" answers the same thing forever, and the
    client decides once whether it has already celebrated it.
    """
    ids = await stage_unlock.unlocked_by(db, current_user.id, activity_id)
    if not ids:
        return RideUnlockOut(stages=[])
    gallery = await get_gallery(current_user, db)
    by_id = {s.id: s for s in gallery.stages}
    return RideUnlockOut(stages=[by_id[i] for i in ids if i in by_id])


@router.get("/gallery/{stage_id}/image", summary="The rider's original checked scene for sharing")
async def get_gallery_image(
    stage_id: str,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> dict:
    if stage_id not in await _unlocked_backdrops(db, current_user.id):
        raise HTTPException(status_code=403, detail="Diese Kulisse ist noch nicht freigeschaltet.")
    bike = await _get_asset(db, current_user.id, "bike")
    if bike is None:
        raise HTTPException(status_code=404, detail="Dein Fahrrad fehlt noch.")
    equipped = await gear.equipped_ids(db, current_user.id)
    image = await _cached_render(db, _bike_key(bike, equipped, stage_id))
    if image is None:
        raise HTTPException(status_code=404, detail="Dein Bild ist noch nicht bereit.")
    return {"image": image}
