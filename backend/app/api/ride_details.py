"""The details a rider adds to a ride after it syncs — the Strava moment.

A ride arrives from Garmin with numbers and no story: a title the device wrote,
a distance, a track. What makes a feed worth opening is the part only the rider
can supply, so once the ride lands the app asks for a photo and a sentence.

These are the endpoints behind that ask. They are deliberately narrow: a rider
edits their OWN ride, and every route here proves ownership before it does
anything, rather than trusting RLS to have covered a path nobody tested.
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.activity import Activity
from app.models.ride_photo import RidePhoto
from app.models.user import User
from app.services import ride_photos

router = APIRouter(prefix="/activities", tags=["ride-details"])

#: Long enough for a ride story, short enough that the column is not a blog.
DESCRIPTION_MAX = 2000


class RideDetailsUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=DESCRIPTION_MAX)


class RidePhotoRead(BaseModel):
    id: int
    url: str
    width: int | None
    height: int | None


class RideDetailsRead(BaseModel):
    id: int
    title: str | None
    description: str | None
    photos: list[RidePhotoRead]


def _photo_url(p: RidePhoto) -> str:
    return f"/activities/{p.activity_id}/photos/{p.id}"


async def _own_activity(db: AsyncSession, activity_id: int, user_id: int) -> Activity:
    """The rider's own activity, or 404.

    404 rather than 403 for somebody else's ride: whether an activity id exists
    is not a fact this endpoint should confirm to a stranger.
    """
    res = await db.execute(
        select(Activity).where(Activity.id == activity_id, Activity.user_id == user_id)
    )
    act = res.scalar_one_or_none()
    if act is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Fahrt nicht gefunden")
    return act


async def _photos_for(db: AsyncSession, activity_id: int) -> list[RidePhoto]:
    res = await db.execute(
        select(RidePhoto)
        .where(RidePhoto.activity_id == activity_id)
        .order_by(RidePhoto.sort, RidePhoto.id)
    )
    return list(res.scalars().all())


@router.get("/{activity_id}/details", response_model=RideDetailsRead)
async def get_details(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RideDetailsRead:
    act = await _own_activity(db, activity_id, current_user.id)
    photos = await _photos_for(db, activity_id)
    return RideDetailsRead(
        id=act.id, title=act.title, description=act.description,
        photos=[RidePhotoRead(id=p.id, url=_photo_url(p), width=p.width, height=p.height) for p in photos],
    )


@router.patch("/{activity_id}/details", response_model=RideDetailsRead)
async def update_details(
    activity_id: int,
    payload: RideDetailsUpdate,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RideDetailsRead:
    act = await _own_activity(db, activity_id, current_user.id)

    # UNSET AND EMPTY ARE DIFFERENT. A PATCH that omits `title` must leave the
    # device's title alone; one that sends "" is the rider clearing it, and
    # both have to be possible from the same editor.
    fields = payload.model_dump(exclude_unset=True)
    if "title" in fields:
        t = (fields["title"] or "").strip()
        act.title = t or None
    if "description" in fields:
        d = (fields["description"] or "").strip()
        act.description = d or None

    await db.commit()
    await db.refresh(act)
    photos = await _photos_for(db, activity_id)
    return RideDetailsRead(
        id=act.id, title=act.title, description=act.description,
        photos=[RidePhotoRead(id=p.id, url=_photo_url(p), width=p.width, height=p.height) for p in photos],
    )


@router.post(
    "/{activity_id}/photos",
    response_model=RidePhotoRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_photo(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    file: UploadFile = File(...),
) -> RidePhotoRead:
    await _own_activity(db, activity_id, current_user.id)

    count = await db.scalar(
        select(func.count()).select_from(RidePhoto).where(RidePhoto.activity_id == activity_id)
    )
    if (count or 0) >= ride_photos.MAX_PER_RIDE:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Höchstens {ride_photos.MAX_PER_RIDE} Fotos pro Fahrt",
        )

    raw = await file.read()
    try:
        rel, w, h = ride_photos.store(raw, user_id=current_user.id, activity_id=activity_id)
    except ride_photos.PhotoRejected as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    row = RidePhoto(
        activity_id=activity_id, user_id=current_user.id,
        rel_path=rel, width=w, height=h, sort=count or 0,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return RidePhotoRead(id=row.id, url=_photo_url(row), width=row.width, height=row.height)


@router.get("/{activity_id}/photos/{photo_id}")
async def read_photo(
    activity_id: int,
    photo_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> Response:
    """The bytes.

    Served through the app rather than from a static mount, because a ride
    photo is not public: the crew feed shows it to crew-mates, and a URL that
    works for anyone who guesses an id would make it public to everybody.
    Authorisation is the point of this route existing.
    """
    res = await db.execute(
        select(RidePhoto).where(RidePhoto.id == photo_id, RidePhoto.activity_id == activity_id)
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto nicht gefunden")

    data = ride_photos.read(row.rel_path)
    if data is None:
        # The row outlived its file. A broken picture, not a broken feed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto nicht gefunden")

    return Response(
        content=data,
        media_type="image/webp",
        # Immutable: the bytes at an id never change — an edit makes a new row.
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.delete("/{activity_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    activity_id: int,
    photo_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> Response:
    await _own_activity(db, activity_id, current_user.id)
    res = await db.execute(
        select(RidePhoto).where(
            RidePhoto.id == photo_id,
            RidePhoto.activity_id == activity_id,
            RidePhoto.user_id == current_user.id,
        )
    )
    row = res.scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto nicht gefunden")

    rel = row.rel_path
    await db.execute(delete(RidePhoto).where(RidePhoto.id == row.id))
    await db.commit()
    # The row goes first: an orphaned FILE is a few kilobytes nobody sees, an
    # orphaned ROW is a broken picture in the feed.
    ride_photos.remove(rel)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Separate from the cached narrative: adaptation records may arrive after sync.
from app.schemas.training_review import TrainingReview

@router.get('/{activity_id}/training-review', response_model=TrainingReview)
async def get_training_review(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> TrainingReview:
    from app.services.training_review import load_review
    activity = await _own_activity(db, activity_id, current_user.id)
    return await load_review(db, current_user.id, activity)
