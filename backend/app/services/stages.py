"""One stage list, out of two very different sources.

Today's hero plays on a STAGE, and a stage is either:

  · a hand-written one from `backdrops.CATALOGUE` — the starter road, the
    velodrome — unlocked by what a rider DID, and rendered from prose; or
  · a real place from the `places` table — the Dolomites — unlocked by where a
    rider WENT, bought with RideCoin, and rendered from a shared plate image.

Everything downstream should be able to ignore that difference: the picker draws
one list, `DayScene.backdrop` stores one id, and the composer asks for one
background. This module is the seam that makes that true, and it is the only
place that knows there are two systems.

The id namespace is what keeps them apart: place ids carry `places.PREFIX`, so
`stage_for` can route on the id alone and no hand-written stage can ever shadow
a real mountain range.
"""
from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import backdrops, places


@dataclass(frozen=True)
class Stage:
    """A stage as the composer needs it, whichever half it came from."""

    id: str
    name_de: str
    #: The BACKGROUND clause. Always present — a place's own prose is written
    #: when it is discovered, so a place whose plate has not rendered yet still
    #: produces an honest picture from words alone.
    prose: str
    #: The shared plate, for a place that has one. None for every hand-written
    #: stage, and for a place discovered so recently it has not been rendered.
    plate_url: str | None = None
    #: True when this stage is a real place someone rode.
    is_place: bool = False


async def stage_for(db: AsyncSession, stage_id: str | None) -> Stage:
    """Resolve a stored stage id to something renderable.

    Degrades rather than fails, in both directions: an id that is neither a
    known place nor a known stage falls back to the starter road, because a
    stage deleted or renamed in a deploy must not cost a rider their hero.
    """
    if places.is_place(stage_id):
        place = await places.by_slug(db, stage_id)  # type: ignore[arg-type]
        if place is not None:
            return Stage(
                id=place.slug, name_de=place.name, prose=place.prose,
                plate_url=place.plate_url, is_place=True,
            )
        # A place id we no longer have a row for — same treatment as a removed
        # hand-written stage rather than a 500 on every hero request.
        b = backdrops.resolve(None)
        return Stage(id=b.id, name_de=b.name_de, prose=b.prose)

    b = backdrops.resolve(stage_id)
    return Stage(id=b.id, name_de=b.name_de, prose=b.prose)
