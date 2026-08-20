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
import math
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from typing import Annotated, Literal, get_args

from fastapi import APIRouter, Depends, HTTPException
from fastapi import status as http_status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
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
    cyclr_studio,
    gear,
    places,
    rewards,
    ride_facts,
    ride_framing,
    ride_place,
    rider_wear,
    service_proof,
    stages,
    workshop,
)
from app.services import earn_modifiers as em
from app.services.ride_scene import DAY_POSES, RideGeo, day_context

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
    bike = await _get_asset(db, current_user.id, "bike")
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
    if bike is not None and bike.image_url:
        cached = await _cached_render(db, _bike_key(bike, equipped, stage_id))
        if cached:
            bike_image = cached

    return TodayStageOut(
        rider_image=rider_image,
        bike_image=bike_image,
        bike_name=bike.name if bike else None,
        changes=changes,
        stage=stage_id,
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
    stamp = (bike.updated_at or bike.created_at).isoformat()
    return bike_build.build_key(bike.id, stamp, equipped, stage_id)


async def _cached_render(db: AsyncSession, key: str) -> str | None:
    row = (await db.execute(
        select(BikeRender).where(BikeRender.build_key == key)
    )).scalar_one_or_none()
    return row.image if row is not None and row.image else None


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
        if needs and not await _cached_render(db, key):
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
    dormant: bool = False
    optional: bool = False
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
    return _workshop_out(view, balance)


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

    The whole history, not a window: a stage is earned once and kept, and a pass
    climbed last spring should not close again because time passed.
    """
    rows = (await db.execute(
        select(
            Activity.id, Activity.distance_meters, Activity.elevation_gain_m,
            Activity.duration_seconds, Activity.started_at, Activity.tss, Activity.raw_data,
        ).where(Activity.user_id == user_id)
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
    live = set(backdrops.unlocked_ids(await _cheap_history_facts(db, user_id)))
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
@router.get("/backdrops", response_model=BackdropsOut,
            summary="The stages, which ones this rider has opened, and which is in use")
async def get_backdrops(
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
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

    return await get_today_stage(current_user, db)


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
    place = await _place_of_activity(db, current_user.id, activity)
    if place is not None:
        world, ctx, key = place.prose, place.name, f"ride:{activity_id}:{place.slug}"
    else:
        framing_id = ride_framing.default_framing_for(geo)
        f = ride_framing.get(framing_id)
        world, ctx, key = None, f.name_de, f"ride:{activity_id}:{framing_id}"

    # EDIT, never redraw. The rider's own bike render goes back in as the input
    # image so the frame, the decals and the components stay pixel-identical
    # between two worlds — the measurement in `docs/w3-bike-customisation.md`.
    # `bike_build.edit_prompt` with a `world` is the SAME path that puts a bike
    # in the Dolomites and stands it on the road rather than floating it there.
    prompt = (
        bike_build.edit_prompt([], world=world) if world
        else ride_framing.edit_prompt(framing_id)
    )
    image = await cyclr_studio.edit_image(bike.image_url, prompt, key)
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
