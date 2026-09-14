"""When a ride opens a new stage, get the picture ready before the rider asks.

THE BUG THIS FIXES FIRST. `ride_economy` already called `_open_backdrops` on
every settled ride and THREW THE RETURN VALUE AWAY. The rows were written, the
stage really was earned, and nothing anywhere announced it — the rider found out
by opening the picker later and noticing an extra swatch. That is this
repository's recurring shape: correct machinery wired to nothing.

WHY THE RENDER IS WARMED HERE AND NOT ON FIRST VIEW. The unlock screen's whole
job is to hand the rider a picture of THEIR bike in the place they just earned,
and that render takes the better part of a minute. Rendered on first view, the
reward screen opens on a spinner — the one moment in the app that must not.
Rendered at unlock, the picture is usually waiting by the time the rider looks
at their phone.

WHY IT CAN NEVER BLOCK THE SYNC. A ride's RideCoin, its PMC and its plan
adaptation must not wait on an image model, and must certainly not fail with it.
`warm` is fire-and-forget, guarded end to end, and returns None on every failure
path. A stage whose picture is missing still unlocks; the gallery falls back to
the stage's own plate and renders on demand later.

NO SCHEMA CHANGE. An unlock is already `(user_id, backdrop, activity_id,
unlocked_at)` and a render is already `BikeRender(build_key)` — and `build_key`
has included the backdrop since 2026-08-20, so the picture for "this bike on
Ventoux" is addressable today. Announcing an unlock is therefore a QUESTION —
"what did this ride open?" — rather than a new `seen` column, which matters here:
another worktree has an unapplied migration in flight, and a second head on this
line takes the API down on boot.
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import async_session_maker
from app.models.garage import GarageAsset, RiderBackdrop
from app.models.shop import BikeRender
from app.services import backdrops

logger = logging.getLogger(__name__)


async def unlocked_by(db: AsyncSession, user_id: int, activity_id: int) -> list[str]:
    """Every stage this ride opened, oldest first. The unlock screen's question.

    Reads the rows `_open_backdrops` writes, so a re-synced ride answers the
    same thing forever — the announcement is derived from the permanent record
    rather than from a one-shot flag that a second sync would clear.
    """
    rows = (await db.execute(
        select(RiderBackdrop.backdrop)
        .where(
            RiderBackdrop.user_id == user_id,
            RiderBackdrop.activity_id == activity_id,
        )
        .order_by(RiderBackdrop.unlocked_at)
    )).scalars().all()
    # Filter through the catalogue: a row for a stage that has since been
    # retired must not reach the client as an unlock it cannot render.
    return [b for b in rows if b in backdrops.CATALOGUE]


def warm(user_id: int, stage_ids: list[str]) -> None:
    """Start rendering each newly opened stage. Returns immediately.

    Fire-and-forget on purpose: see the module docstring. Never awaited by the
    ingestion path, never able to raise into it.
    """
    if not stage_ids:
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:                                   # pragma: no cover
        logger.info("stage warm skipped: no running loop")
        return
    for sid in stage_ids:
        task = loop.create_task(_render_one(user_id, sid))
        # Without a callback a task that raises logs nothing until GC, and a
        # fire-and-forget render is exactly the kind of failure that then goes
        # unnoticed for weeks.
        task.add_done_callback(_report)


def _report(task: "asyncio.Task") -> None:
    if task.cancelled():
        return
    exc = task.exception()
    if exc is not None:
        logger.info("stage warm failed (non-fatal)", exc_info=exc)


async def _render_one(user_id: int, stage_id: str) -> None:
    """Render this rider's bike into one stage, and store it under its build key.

    Opens its OWN session. The caller's session belongs to the ingestion
    transaction, which will have been committed and closed long before an image
    model answers.
    """
    from app.services import scene_render
    if stage_id in scene_render.READY:
        await scene_render.render(user_id, stage_id)
        return
    stage = backdrops.CATALOGUE.get(stage_id)
    if stage is None or stage.is_starter or stage_id in backdrops.scene_catalogue.RELEASED:
        return

    # Imported here rather than at module scope: `cyclr_studio` pulls in the
    # image SDK, and ingestion must not pay for that import on every ride.
    from app.services import bike_build, cyclr_studio, gear, stage_frame

    async with async_session_maker() as db:
        asset = (await db.execute(
            select(GarageAsset).where(
                GarageAsset.user_id == user_id, GarageAsset.kind == "bike",
            )
        )).scalar_one_or_none()
        if asset is None or not asset.image_url:
            logger.info("stage warm skipped for %s: rider has no bike yet", stage_id)
            return

        equipped = await gear.equipped_ids(db, user_id)
        key = bike_build.build_key(
            asset.id, _stamp(asset), equipped, backdrop=stage_id,
        )
        existing = (await db.execute(
            select(BikeRender).where(BikeRender.build_key == key)
        )).scalar_one_or_none()
        if existing is not None and existing.image:
            return                                          # already have it

        prompt = bike_build.edit_prompt(equipped, world=stage.prose)
        image = await cyclr_studio.edit_image(
            asset.image_url, prompt, key, aspect=cyclr_studio.STAGE_ASPECT,
            frame_ratio=stage_frame.geometry_from_cutout(asset.image_url)
            or stage_frame.RATIO_DEFAULT,
        )
        if not image:
            logger.info("stage warm produced no image for %s", stage_id)
            return

        row = existing or BikeRender(build_key=key)
        row.image = image
        row.status = "ok"
        if existing is None:
            db.add(row)
        await db.commit()
        logger.info("stage %s warmed for user %s", stage_id, user_id)


def _stamp(asset: GarageAsset) -> str:
    """The asset's render identity, matching what `api/garage` keys on."""
    return (asset.updated_at or asset.created_at).isoformat()
