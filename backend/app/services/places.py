"""The place layer: put a place on the map, stamp the rider, price the backdrop.

Reads top to bottom as the life of one place:

  1. A ride is ingested. Its first GPS fix resolves to a region name through
     `ride_place.resolve` — which answers None rather than inventing one.
  2. `ensure(...)` finds or creates the global `Place`, writing the BACKGROUND
     prose from the terrain the ride actually had.
  3. `stamp(...)` records that this rider was there. Earned, never sold.
  4. The plate — one shared render of the place, no rider, no bike — is
     generated once, by `plate_prompt`, and belongs to everybody afterwards.
  5. Riders holding the stamp may buy the backdrop with RideCoin, and then
     choose it as the stage Today's hero plays on.

WHY THE PROSE IS WRITTEN FROM THE DISCOVERING RIDE. The alternative is asking a
model to describe the Dolomites, which produces a postcard: sunlit meadows and
blue skies for a place a rider crossed in freezing cloud. `ride_scene` already
solved this — the resolved place LEADS and the terrain bucket qualifies it, so
what gets rendered is a real region seen through the kind of riding that happens
there. This module reuses that function rather than restating it.

NOTHING HERE FABRICATES A PLACE. No resolver answer, no place. That is the
honesty rule the whole scene pipeline is built on, and it is cheaper to keep
here than anywhere else: a rider whose GPS is missing simply collects no stamp.
"""
from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.place import Place, RiderPlaceStamp
from app.services.ride_scene import RideGeo, scene_descriptor, terrain_key

#: The namespace every place id carries. A stage id is either a hand-written one
#: from `backdrops.CATALOGUE` or one of these, and the prefix is what keeps the
#: two from ever colliding — including in `DayScene.backdrop`, where a collision
#: would serve a rider the wrong picture out of the cache.
PREFIX = "place:"

#: What a place backdrop costs, by how hard the riding that opens it tends to be.
#:
#: PITCHED AGAINST THE GEAR LADDER on purpose, and sitting deliberately between
#: its tiers: a place costs more than a rare part (1 800) and less than a
#: legendary one (4 500). Both halves of that matter. Above rare, because
#: equipment is consumed by the loadout — one item per slot, swapped every ride
#: — while a place is kept and looked at every morning. Below legendary, because
#: a place already carries a gate money cannot open: you have to have been
#: there. Charging top-of-ladder as well would mean a rider who climbed the
#: Dolomites in May is still saving up for the picture in September, and the
#: reward would stop reading as a reward.
PRICE_BY_TERRAIN: dict[str, int] = {
    "mountain": 3600,
    "hilly": 2400,
    "coastal": 2800,
    "flat": 2000,
}
DEFAULT_PRICE = 2000


def slug_for(name: str) -> str:
    """A stable id for a resolved place name.

    Accent-folded and lowercased so "Dolomiten" and "dolomiten" are one place,
    and so two riders whose resolvers answered with different casing do not put
    the same mountains on the map twice.
    """
    folded = unicodedata.normalize("NFKD", name)
    ascii_only = "".join(c for c in folded if not unicodedata.combining(c))
    cleaned = re.sub(r"[^a-z0-9]+", "-", ascii_only.lower()).strip("-")
    return PREFIX + (cleaned or "unbekannt")[:56]


def is_place(stage_id: str | None) -> bool:
    return bool(stage_id) and stage_id.startswith(PREFIX)  # type: ignore[union-attr]


def price_for(geo: RideGeo) -> int:
    return PRICE_BY_TERRAIN.get(terrain_key(geo), DEFAULT_PRICE)


#: Phrases that only ever appeared in the weather-prescribing terrain strings.
#: Their presence dates a row to before that was fixed. See `ensure`.
_STALE_PROSE = (
    "low, heavy cloud",
    "flat overcast light",
    "cold mist between",
    "cold light breaking over the sea",
    "quiet and atmospheric",
    "at first light — dark rock faces",
    # Written 2026-08-24. Every place discovered before this carries a clause
    # asking for "the specific rock, vegetation and landforms" of wherever it
    # is — mountain vocabulary, handed to cities as readily as to passes — with
    # a full landscape sentence trailing behind it. A flat city ride therefore
    # rendered as farmland. Recognisable by its own words, so the next read
    # rewrites it; no migration, no backfill.
    "rock, vegetation and landforms",
)


def prose_for(name: str, geo: RideGeo) -> str:
    """The BACKGROUND clause for this place, from the ride that found it.

    `scene_descriptor` already implements the rule that matters — the resolved
    place leads and the terrain bucket demotes to a qualifier, because a generic
    mountain sentence otherwise wins over the specific limestone the Dolomites
    are actually known for. Reused rather than reimplemented so the two paths
    cannot drift.
    """
    return scene_descriptor(RideGeo(
        distance_m=geo.distance_m,
        elevation_gain_m=geo.elevation_gain_m,
        min_altitude_m=geo.min_altitude_m,
        max_altitude_m=geo.max_altitude_m,
        start_lat=geo.start_lat,
        start_lng=geo.start_lng,
        place_name=name,
    ))


def plate_prompt(place: Place) -> str:
    """The shared render: this place, empty, waiting for a rider.

    A PLATE, NOT A SCENE. There is no rider and no bicycle in it — those are
    composed on top per rider, with the plate handed in as an image reference,
    which is the whole reason one render can serve everybody.

    The composition is left deliberately open in the middle. A plate whose
    interest is all in the centre leaves nowhere for a rider to stand, so the
    prompt asks for the drama at the edges and depth through the frame: the
    defocused near layer that makes the reference look expensive, a clean
    middle ground, and the view falling away behind.
    """
    return (
        "A photorealistic landscape plate: a stretch of road in the setting described below, "
        "photographed at eye level with nothing in the middle of the frame — an empty road, "
        "waiting.\n\n"
        f"{place.prose}\n\n"
        "COMPOSITION: the road runs across the middle of the frame, left to right, and the middle "
        "of the picture is deliberately clear and uncluttered. All of the interest sits at the "
        "edges and in the depth: a heavily defocused near layer of real foliage, grasses or rock "
        "close to the lens along the bottom and sides of the frame, framing the empty middle; the "
        "ground sharp where the road runs; and the landscape behind falling away into atmospheric "
        "haze and darkness toward the top of the frame.\n"
        "LIGHT: cinematic and directional, with a clear key, real shadows across the terrain and a "
        "rich falloff into near-black at the frame edges.\n"
        "RENDER: ray-traced global illumination, physically-based materials, real optical depth of "
        "field, every plant and rock modelled as genuine geometry. Square 1:1 frame."
    )


async def ensure(
    db: AsyncSession,
    name: str,
    geo: RideGeo,
    *,
    user_id: int | None = None,
    activity_id: int | None = None,
) -> Place:
    """Find this place, or put it on the map. Never raises on a duplicate.

    Two riders finishing the same climb within a second of each other is exactly
    the kind of race a global table invites, so the insert is re-read on
    conflict rather than guarded by a lock: whoever lost the race gets the row
    the winner created, which is the correct answer either way.
    """
    slug = slug_for(name)
    existing = (await db.execute(
        select(Place).where(Place.slug == slug)
    )).scalar_one_or_none()
    if existing is not None:
        # ── LAZY REFRESH, NO MIGRATION ──────────────────────────────────────
        # A place's prose is written once, when the place is discovered, and
        # then it is what every future picture of that place is built from. The
        # terrain sentences used to prescribe the weather ("under low, heavy
        # cloud"), so every row written before that was fixed carries a sky we
        # have no business declaring — and no amount of real recorded weather
        # can argue with prose that already said it was overcast.
        #
        # Rewriting them needs no schema change and no backfill job: a stale row
        # is recognisable BY ITS OWN WORDS, and the next time anyone asks for it
        # we hand back the corrected version. A row that fails to update is
        # still returned — a stale sentence is worth far less than a 500.
        if any(marker in (existing.prose or "") for marker in _STALE_PROSE):
            existing.prose = prose_for(existing.name, geo)
            try:
                await db.commit()
            except Exception:
                await db.rollback()
        return existing

    place = Place(
        slug=slug,
        name=name,
        prose=prose_for(name, geo),
        price_rc=price_for(geo),
        lat=geo.start_lat,
        lng=geo.start_lng,
        discovered_by_user_id=user_id,
        discovered_by_activity_id=activity_id,
    )
    db.add(place)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        return (await db.execute(
            select(Place).where(Place.slug == slug)
        )).scalar_one()
    await db.refresh(place)
    return place


async def stamp(db: AsyncSession, user_id: int, place: Place) -> RiderPlaceStamp:
    """Record that this rider was there, or count another visit.

    Idempotent per ride only in the sense that matters: re-syncing the same
    activity increments `rides`, which is why the caller is the ingestion path
    that already guards against re-processing a ride it has settled.
    """
    row = (await db.execute(
        select(RiderPlaceStamp).where(
            RiderPlaceStamp.user_id == user_id,
            RiderPlaceStamp.place_id == place.id,
        )
    )).scalar_one_or_none()
    if row is None:
        row = RiderPlaceStamp(user_id=user_id, place_id=place.id, rides=1)
        db.add(row)
    else:
        row.rides += 1
    await db.commit()
    return row


async def stamped_place_ids(db: AsyncSession, user_id: int) -> set[int]:
    return set((await db.execute(
        select(RiderPlaceStamp.place_id).where(RiderPlaceStamp.user_id == user_id)
    )).scalars().all())


async def by_slug(db: AsyncSession, slug: str) -> Place | None:
    return (await db.execute(select(Place).where(Place.slug == slug))).scalar_one_or_none()


# ── the sink ────────────────────────────────────────────────────────────────

class NotStampedError(Exception):
    """Refused: this rider has not ridden there.

    The gate that makes the whole thing mean something. Money cannot open it,
    which is exactly why owning a place says something owning a part does not.
    """

    def __init__(self, slug: str) -> None:
        super().__init__(slug)
        self.slug = slug


class AlreadyOwnedError(Exception):
    def __init__(self, slug: str) -> None:
        super().__init__(slug)
        self.slug = slug


async def buy(db: AsyncSession, user_id: int, slug: str) -> tuple[Place, int]:
    """Buy a place backdrop at the SERVER's price. Returns (place, new balance).

    Order and failure modes deliberately mirror `gear.buy`, which is the app's
    reference implementation of a purchase: ownership row first, then the money,
    both inside the caller's transaction so they land or fail together. In every
    refusal not one RideCoin has moved and no row exists.

    The bought place is NOT auto-selected as the rider's stage, for the same
    reason a bought part is not auto-equipped: silently replacing what the rider
    is looking at every morning is worse than making them choose.
    """
    from app.models.garage import RiderBackdrop
    from app.models.rewards import REASON_PLACE_PURCHASE
    from app.services import rewards

    place = await by_slug(db, slug)
    if place is None:
        raise KeyError(slug)

    if place.id not in await stamped_place_ids(db, user_id):
        raise NotStampedError(slug)

    owned = set((await db.execute(
        select(RiderBackdrop.backdrop).where(RiderBackdrop.user_id == user_id)
    )).scalars().all())
    if slug in owned:
        raise AlreadyOwnedError(slug)

    db.add(RiderBackdrop(user_id=user_id, backdrop=slug))
    try:
        await db.flush()
    except Exception:
        await db.rollback()
        raise AlreadyOwnedError(slug) from None

    balance = await rewards.spend(
        db, user_id, place.price_rc, REASON_PLACE_PURCHASE,
        context={"place": slug, "name": place.name},
    )
    await db.commit()
    return place, balance


# ── the shared render ───────────────────────────────────────────────────────

async def ensure_plate(db: AsyncSession, place: Place) -> str | None:
    """Render this place's plate if it has none yet. Returns the plate URL.

    RENDERED ONCE, FOR EVERYBODY. This is the whole economics of the place
    system: a per-rider picture of the Dolomites would bill every rider who
    climbed them and give no two of them the same mountains, while one plate
    costs one render and makes "we both rode there" visible.

    Safe to call on every read of a place. It returns the stored plate without
    touching the model when there is one, so the caller does not have to know
    whether this place is new.

    Never raises. A gallery that 500s because an image model is down is worse
    than a gallery with one entry still waiting for its picture — and the entry
    is honest either way, because `plate_url` being null is exactly what "not
    rendered yet" looks like to the frontend.
    """
    if place.plate_url:
        return place.plate_url

    from app.services import cyclr_studio

    try:
        # Seeded on the SLUG, not the prose: two riders discovering the same
        # place from different rides must not produce two different mountains.
        image = await cyclr_studio._generate(plate_prompt(place), place.slug)
    except Exception:
        return None
    if not image:
        return None

    place.plate_url = image
    await db.commit()
    return image
