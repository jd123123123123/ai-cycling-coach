"""A shared finished scene, the original bicycle, and a checked, fixed frame.

Only the result of the swap guard enters the cache. A failed generation keeps
its unlock but never replaces the rider's original bike with an unchecked image.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from PIL import Image
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert
from app.database import async_session_maker
from app.models.garage import GarageAsset, RiderBackdrop
from app.models.shop import BikeRender
from app.services import scene_catalogue, stage_frame, stage_swap

log = logging.getLogger(__name__)
ASSETS = Path(__file__).resolve().parents[1] / 'assets' / 'stages'
# Reviewed compositions only. A catalogue entry is not a released image.
READY = frozenset({'waschanlage', 'mond', 'startrampe'})
REVISION = 'swap-locked-v2'
LIMIT = asyncio.Semaphore(2)


@lru_cache(maxsize=50)
def template(stage_id: str) -> bytes:
    if stage_id not in READY:
        raise ValueError('Scene has no approved composition')
    return (ASSETS / f'{stage_id}.webp').read_bytes()


def cache_key(asset, stage_id: str) -> str:
    stamp = (asset.updated_at or asset.created_at).isoformat()
    identity = f'{REVISION}:{asset.user_id}:{asset.id}:{stamp}:{stage_id}:'
    return 'scene:' + hashlib.sha256(identity.encode() + template(stage_id) + (ASSETS / f'{stage_id}-clean.webp').read_bytes()).hexdigest()


def decode(data: str):
    return Image.open(io.BytesIO(base64.b64decode(data.split(',', 1)[-1])))


def checked_image(base_bytes: bytes, candidate: str, bike: str, clean_bytes: bytes | None = None) -> tuple[str | None, str]:
    ratio = stage_frame.geometry_from_cutout(bike)
    if not ratio:
        return None, 'bike_geometry_unavailable'
    cutout = decode(bike)
    if cutout.mode != 'RGBA' or cutout.getchannel('A').getextrema()[0] == 255:
        return None, 'transparent_original_required'
    image, report = stage_swap.merge(
        Image.open(io.BytesIO(base_bytes)).convert('RGB'), decode(candidate).convert('RGB'),
        cutout, ratio, locked_frame=True,
        clean_world=Image.open(io.BytesIO(clean_bytes)) if clean_bytes else None,
    )
    if image is None or report is None:
        return None, 'scene_geometry_rejected'
    if report.env_identical != 1 or report.bike_fidelity < .90 or not .03 < report.mask_coverage < .55:
        return None, 'identity_guard_rejected'
    data = io.BytesIO()
    image.save(data, format='WEBP', lossless=True)
    return 'data:image/webp;base64,' + base64.b64encode(data.getvalue()).decode(), json.dumps(report.__dict__)


async def render(user_id: int, stage_id: str) -> None:
    if stage_id not in READY:
        return
    async with LIMIT:
        async with async_session_maker() as db:
            owned = (await db.execute(select(RiderBackdrop.backdrop).where(
                RiderBackdrop.user_id == user_id, RiderBackdrop.backdrop == stage_id,
            ))).scalar_one_or_none()
            if owned is None:
                return
            asset = (await db.execute(select(GarageAsset).where(
                GarageAsset.user_id == user_id, GarageAsset.kind == 'bike',
            ))).scalar_one_or_none()
            if asset is None or not asset.image_url:
                return
            key, original = cache_key(asset, stage_id), asset.image_url
            now = datetime.now(timezone.utc)
            # Atomic lease across workers: a repeated sync cannot buy two renders.
            claim = insert(BikeRender).values(build_key=key, status='pending', image=None, updated_at=now)
            claim = claim.on_conflict_do_update(
                index_elements=['build_key'], set_={'status': 'pending', 'image': None, 'updated_at': now, 'detail': None},
                where=or_(
                    (BikeRender.status == 'pending') & (BikeRender.updated_at < now - timedelta(minutes=10)),
                    (BikeRender.status == 'failed') & (BikeRender.updated_at < now - timedelta(minutes=5)),
                ),
            ).returning(BikeRender.build_key)
            claimed = (await db.execute(claim)).scalar_one_or_none()
            await db.commit()
        if not claimed:
            return
        try:
            # The existing provider call is synchronous internally. Run it off the
            # API event loop, with no database connection held during generation.
            from app.services import cyclr_studio
            base = template(stage_id)
            base_url = 'data:image/webp;base64,' + base64.b64encode(base).decode()
            candidate = await asyncio.to_thread(lambda: asyncio.run(cyclr_studio.edit_image(
                base_url, stage_swap.SWAP_PROMPT, key, extra_b64=original,
                aspect='9:16', sampling=stage_swap.SWAP_SAMPLING,
            )))
            image, detail = await asyncio.to_thread(checked_image, base, candidate, original, (ASSETS / f'{stage_id}-clean.webp').read_bytes()) if candidate else (None, 'provider_unavailable')
        except Exception:
            log.warning('Scene render failed for %s', stage_id, exc_info=True)
            image, detail = None, 'render_failed'
        async with async_session_maker() as db:
            row = (await db.execute(select(BikeRender).where(BikeRender.build_key == key))).scalar_one()
            # A newer lease, e.g. after a hung provider, owns the result now.
            if row.status != 'pending' or row.updated_at != now:
                return
            row.image, row.status, row.detail = image, 'ok' if image else 'failed', detail[:255]
            await db.commit()


@lru_cache(maxsize=8)
def display_image(image: str, width: int = 540) -> str:
    """Light display derivative; retain the checked lossless master for sharing."""
    im = decode(image).convert('RGB')
    im.thumbnail((width, round(width * 16 / 9)), Image.Resampling.LANCZOS)
    out = io.BytesIO(); im.save(out, format='WEBP', quality=88)
    return 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode()
