"""The composed photograph of a rider's build — their bike, wearing their parts.

THE PROBLEM THIS SOLVES. The catalogue is 26 bikes and 24 parts, all rendered
by an image model as separate objects. A part photographed on its own has
nowhere to land on a bike photographed on its own, so for a while equipping
something changed nothing at all, and the first fix drew the bike as vectors so
parts could be composited. That was accurate but it was not the same product:
one hand-drawn bike sitting next to 26 rendered ones reads as a downgrade the
instant a rider equips anything.

So a build is made the way the bikes were made. The base bike's real photograph
goes back to the image model with "keep this exact bicycle, change only these
components", through the same locked drive-side camera and the same studio
ground. The result is a photograph of one coherent bicycle — the parts sit in
the real dropouts and on the real steerer, because the model redrew the whole
machine rather than pasting a layer on top of it.

WHY IT IS AFFORDABLE. A build's picture does not depend on who owns it: every
rider with a lime Rostlaube on gold rims gets the same image. The cache is keyed
by the BUILD, so each distinct combination costs one render for the entire user
base and nothing thereafter. Popular builds pay for themselves immediately, and
the long tail is never rendered at all.

WHY IT IS NEVER ON A CRITICAL PATH. A stock build — a bike with no bought parts
— is the static catalogue art that already ships with the app, so the common
case costs nothing and renders instantly. Anything else degrades honestly: the
rider sees their plain bike until the composed one exists, and if the image
model is unavailable they simply keep seeing it. Nothing here ever blocks a
page, and nothing here ever invents a bike.
"""
from __future__ import annotations

import base64
import io
import logging

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.shop import BikeRender, GarageLoadout
from app.services import w3catalog

log = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_OK = "ok"
STATUS_FAILED = "failed"

# A slot wearing nothing, or wearing the bike's own stock part, contributes
# nothing to the picture — both collapse to this so that "no parts" is one key.
_BARE = "-"


def slots_of(loadout: GarageLoadout | None) -> dict[str, str | None]:
    """The four cosmetic slots as a plain dict, in catalogue slot order."""
    return {
        slot: getattr(loadout, f"{slot}_id", None) if loadout else None
        for slot in w3catalog.PART_SLOTS
    }


def _worn(slot: str, item_id: str | None) -> str:
    """A slot's contribution to the key. Stock and empty are the same thing."""
    if not item_id or item_id == w3catalog.STOCK_PARTS.get(slot):
        return _BARE
    return item_id


def build_key(bike_id: str | None, slots: dict[str, str | None]) -> str | None:
    """The cache key for a build, or None when there is no bike to render.

    Stock slots collapse to "-", so `rustbucket|-|-|-|-` is the plain bike and
    is never rendered: that picture already ships as static art.
    """
    if not bike_id or not w3catalog.get(bike_id):
        return None
    return "|".join([bike_id] + [_worn(s, slots.get(s)) for s in w3catalog.PART_SLOTS])


def is_stock(key: str | None) -> bool:
    """True when the build wears nothing bought — the free, instant case."""
    if not key:
        return True
    return all(part == _BARE for part in key.split("|")[1:])


def describe(key: str) -> list[str]:
    """The changes to ask the model for — one line per non-stock slot.

    Reads the SAME prompt the part's own art was generated from, so the part on
    the bike and the part in the shop are describing one object.
    """
    bike_id, *worn = key.split("|")
    lines: list[str] = []
    for slot, item_id in zip(w3catalog.PART_SLOTS, worn):
        if item_id == _BARE:
            continue
        item = w3catalog.get(item_id)
        if not item or not item.prompt:
            continue
        if slot == "wheels":
            lines.append(
                f"The WHEELS are replaced, BOTH of them identical: {item.prompt}."
            )
        elif slot == "frame":
            lines.append(f"The FRAMESET is repainted: {item.prompt}.")
        elif slot == "bars":
            lines.append(f"The HANDLEBAR is replaced: {item.prompt}.")
        else:
            lines.append(f"The SADDLE is replaced: {item.prompt}.")
    return lines


def compose_prompt(key: str) -> str:
    """The full instruction: this exact bicycle, with these components changed."""
    from app.services.cyclr_studio import (
        BIKE_CAMERA,
        GENERAL_STYLE,
        ISOLATED_BIKE_STYLE,
    )

    ground = (
        "Set the bicycle on a clean, soft, neutral light-grey studio backdrop with a subtle "
        "contact shadow directly beneath the wheels. The background must be plain — no props, "
        "no scenery, no text, no watermark."
    )
    return (
        "Edit the bicycle in the supplied photograph. Keep the SAME bicycle: the same frame "
        "geometry, the same camera, the same position in frame, the same scale, the same "
        "background, and every accessory it already carries. Change ONLY the components "
        "listed below, and leave every other part of the bike exactly as it is.\n\n"
        + "\n".join(f"- {line}" for line in describe(key))
        + "\n\nEACH LISTED COMPONENT IS BRAND NEW AND MUST BE FITTED COMPLETELY: clean, "
        "uniform and pristine over its whole surface, with none of the old part's rust, "
        "flaking paint, dirt or wear left showing through it. A rider paid for these parts, "
        "so a half-applied or patchy result is wrong. Everything NOT listed keeps its "
        "existing condition and character.\n\n"
        "The result must be a photograph of one coherent, physically correct bicycle: the "
        "new wheels sit in the existing dropouts, the new handlebar on the existing steerer. "
        f"{BIKE_CAMERA} {ground} {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )


def base_art_path(bike_id: str):
    """The catalogue photograph a build is composed FROM — the shipped WebP."""
    from pathlib import Path

    root = Path(__file__).resolve().parents[3]
    return root / "frontend/public/w3/bikes" / f"{bike_id}.webp"


async def get_cached(db: AsyncSession, key: str) -> BikeRender | None:
    return (
        await db.execute(select(BikeRender).where(BikeRender.build_key == key))
    ).scalar_one_or_none()


async def claim(db: AsyncSession, key: str) -> bool:
    """Reserve a key for rendering. True when THIS caller won the race.

    Two riders equipping the same part at the same moment must not both pay for
    the same picture, so the pending row is the lock: whoever inserts it renders,
    everyone else waits for it.
    """
    stmt = (
        pg_insert(BikeRender)
        .values(build_key=key, status=STATUS_PENDING)
        .on_conflict_do_nothing(index_elements=[BikeRender.build_key])
        .returning(BikeRender.build_key)
    )
    won = (await db.execute(stmt)).scalar_one_or_none() is not None
    await db.commit()
    return won


async def _finish(db: AsyncSession, key: str, status: str, image: str | None, detail: str | None) -> None:
    row = await get_cached(db, key)
    if row is None:
        return
    row.status = status
    row.image = image
    row.detail = detail
    await db.commit()


async def render(db: AsyncSession, key: str) -> None:
    """Compose the build and store it. Never raises — a failed render is a
    recorded state, not an exception on somebody's request."""
    from app.config import settings

    try:
        art = base_art_path(key.split("|")[0])
        if not art.exists():
            await _finish(db, key, STATUS_FAILED, None, "base art missing")
            return
        if not getattr(settings, "GEMINI_API_KEY", None):
            await _finish(db, key, STATUS_FAILED, None, "image_model_unavailable")
            return

        from google import genai
        from google.genai import types
        from PIL import Image

        from app.services.cyclr_studio import DEFAULT_IMAGE_MODEL, _seed

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
        resp = client.models.generate_content(
            model=model,
            contents=[
                compose_prompt(key),
                types.Part.from_bytes(data=art.read_bytes(), mime_type="image/webp"),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                # Keyed on the build, so a re-render reproduces the same bike.
                seed=_seed(key),
                image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
            ),
        )
        raw = None
        for part in resp.candidates[0].content.parts:
            data = getattr(part, "inline_data", None)
            if data and data.data:
                raw = data.data
                break
        if raw is None:
            await _finish(db, key, STATUS_FAILED, None, "no image returned")
            return

        # WebP at the same weight as the shipped catalogue art — a 1K PNG is
        # ~450 KB and would be served on every garage open.
        buf = io.BytesIO()
        Image.open(io.BytesIO(raw)).convert("RGB").save(buf, "WEBP", quality=88, method=6)
        url = "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
        await _finish(db, key, STATUS_OK, url, None)
    except Exception as exc:  # noqa: BLE001 — a bad render must never 500 a page
        log.warning("bike render failed for %s: %s", key, exc)
        try:
            await _finish(db, key, STATUS_FAILED, None, str(exc)[:200])
        except Exception:  # noqa: BLE001
            pass


async def render_in_background(key: str) -> None:
    """Render on a session of its own.

    The request's session belongs to the request and is gone by the time the
    model answers, and this table is not RLS-scoped (a build's picture belongs
    to the build, not to a rider), so a plain session is both correct and the
    only thing that would still be open.
    """
    from app.database import async_session_maker

    async with async_session_maker() as db:
        await render(db, key)
