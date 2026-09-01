"""The rider's garage — their digitalised rider figure and bike, and the
rider-on-bike scenes composed for individual rides.

Until now the `cyclr_studio` pipeline rendered a collectible and then forgot it:
`/garage/asset/render` returned an image and nothing persisted, so nothing
downstream could ask "does this rider have a bike?". Every surface that wanted
one (the Today hero, the ride hero) had to fall back to a hard-coded stock
photo. These two tables are what make the garage real state.

``GarageAsset`` — at most ONE row per rider per kind ('rider' | 'bike'), holding
the vision `description` (the literal analysis text, which is the *input* to
every later render, so it must survive) alongside the rendered image itself as a
data URL. Re-rendering replaces the row; the rider always has one current bike.

``RideScene`` — the composed hero for one activity, cached. Composition is a
slow, paid image-model call and the result is deterministic for a given
(rider, bike, ride), so it is generated once and read back forever. Cached rows
carry the `prompt` and the `training_context` that produced them, so a scene can
always be explained and invalidated when the recipe changes.

Both are RLS-protected via ``user_id`` — the same policy shape as wallets and
referrals. Images are stored inline as Text (the same choice `users.avatar_url`
already makes) rather than in object storage. That is only affordable because
`cyclr_studio._to_data_url` transcodes each render to WebP first: ~43 KB rather
than the ~525 KB PNG the model returns, which matters because these rows are
serialised into JSON on Today's critical path, where base64 adds another third.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

# The two things a rider digitalises. 'rider' also backs `users.avatar_url`
# (the bust that shows up in the header); the row here additionally keeps the
# description, which the avatar column alone cannot carry.
ASSET_KINDS = ("rider", "bike")


class GarageAsset(Base):
    """One digitalised collectible — the rider figure or their bike.

    ``description`` is the vision pass's literal read of the photo and is the
    durable part: it is what `cyclr_studio.compose_scene` needs to put this
    rider on this bike in a new scene later, long after the original photo is
    gone. ``image_url`` is the rendered collectible as a ``data:image/…;base64`` (WebP)
    URL. ``name`` is the collectible's short display name (e.g. "Specialized
    Allez"), extracted by the same vision pass — null when the model could not
    name it, never guessed here.
    """

    #: The rider's own photograph, kept so a re-render can still be THEM.
    #:
    #: WHAT BREAKS WITHOUT IT. Until this column existed the only thing that
    #: survived onboarding was ``description`` — roughly 120 words of prose. Every
    #: later render went through that bottleneck: `/garage/asset/{kind}/restyle`
    #: re-renders from prose, and every scene composition (`RideScene`,
    #: `DayScene`) describes the rider to the image model in words. A hundred and
    #: twenty words is on the order of forty bits once you account for how little
    #: of English prose is actually free choice, and a face is not a forty-bit
    #: object. So the second render was never the same person as the first: same
    #: hair colour, same skin tone, same glasses — a different face. The rider
    #: read that, correctly, as the app losing them. The fix upstream is to hand
    #: the image model the actual photograph instead of a paragraph about it, and
    #: that fix is worth nothing on a RE-render if the photograph is gone. It was:
    #: `render_asset` passed the upload through the studio and dropped it on the
    #: floor, so identity was destroyed permanently the moment onboarding
    #: finished. This column is the photograph surviving that moment.
    #:
    #: IT IS A CROP, NOT THE PHOTOGRAPH. What goes in is a head crop — about
    #: 512 px on the long edge, WebP q82, well under 60 KB as a
    #: ``data:image/webp;base64`` URL — produced the same way `crew_avatars`
    #: makes its thumbnails. Three reasons it is not the original upload. The
    #: renders that need it are portraits, so the shoulders down are pixels no
    #: consumer ever looks at. This row is read on many requests and is already
    #: carrying a rendered collectible; the upload itself is multi-megabyte and
    #: base64 adds another third on top. And keeping the least of someone's photo
    #: that still does the job is the right default for a picture of their face:
    #: what is not stored cannot leak.
    #:
    #: NULLABLE, AND STAYS THAT WAY. Every row that predates this column has
    #: none, and no backfill is possible — the originals were never kept. A rider
    #: from before simply keeps re-rendering from prose exactly as they do today;
    #: nothing reads this column expecting it to be there. Only the rider slot
    #: fills it: a bicycle is not an identity and `render_bike_from_photo`
    #: already renders bikes from the photo directly.
    #:
    #: IT BELONGS TO THE RENDER PATH AND NOWHERE ELSE. It is never returned by
    #: `/garage` or by any other response schema — see the field-by-field
    #: `AssetOut` in `api/garage.py`, and the test that pins its absence.

    __tablename__ = "garage_assets"
    #: Uniqueness is (user_id, kind, bike_id) NULLS NOT DISTINCT now, so a rider
    #: keeps exactly one portrait (bike_id NULL) while owning a bike asset per
    #: bicycle. The index lives in the migration — see `bikes.py`.
    __table_args__ = ()

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Set on 'bike' assets, NULL on the rider portrait — a face is not about a
    #: bicycle, and giving it one would make two portraits look like two bikes'.
    bike_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("bikes.id", ondelete="CASCADE"), nullable=True, index=True,
    )
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_photo: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now(), nullable=True,
    )


class RideScene(Base):
    """The composed rider-on-bike hero for one ride, cached.

    One row per activity. ``training_context`` is the pose + GPX-derived scene
    clause (see `services/ride_scene.training_context`) and ``prompt`` the full
    text sent to the image model — both stored so the cached image can be
    explained, and so a recipe change can be detected and the row refreshed
    rather than silently serving a stale look.

    ``activity_id`` carries NO foreign key, matching `RideFeedback`. `activities`
    is a Timescale hypertable whose primary key must include the partition
    column, so it is composite ``(id, started_at)`` — `activities.id` alone has
    no unique constraint and Postgres refuses to reference it
    (``InvalidForeignKey: there is no unique constraint matching given keys``).
    The sequence still makes the id unique in practice. The cost is no
    DB-level cascade when an activity is deleted; a scene orphaned that way is
    inert (it is only ever read while opening that activity), and the row still
    disappears with its rider via ``user_id``.
    """

    __tablename__ = "ride_scenes"
    __table_args__ = (
        UniqueConstraint("activity_id", name="uq_ride_scene_activity"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    training_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class DayScene(Base):
    """The composed rider-on-bike hero for one DAY-STATE, cached per pose.

    Today's hero is not about a ride that happened — it is about what the day is
    asking of the rider, so it is keyed on the POSE (`services/ride_scene`'s
    `DAY_POSES`: rest / lazy / endurance / hard / recovery / trained / evening),
    not on a date and not on an activity. A rider therefore accumulates at most
    seven of these for their whole membership: the first rest day composes the
    dozing scene, and every rest day after that reads it back for free.

    That key is the entire point. Composing is a slow paid image-model call, and
    a per-DATE cache would bill a fresh render every single morning for a picture
    that is identical to yesterday's. The pose is also what makes the cache
    self-invalidating in the way that matters: re-rendering the rider or the bike
    drops these rows (see `api/garage.render_asset`), because the scenes were
    composed FROM those descriptions.

    Same RLS + inline-WebP storage reasoning as ``RideScene`` above.
    """

    __tablename__ = "day_scenes"
    __table_args__ = (
        UniqueConstraint("user_id", "pose", "backdrop", name="uq_day_scene_user_pose_backdrop"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    pose: Mapped[str] = mapped_column(String(16), nullable=False)
    #: Which stage this pose was composed on — `services.backdrops`.
    #:
    #: PART OF THE KEY, added 2026-08-20 with the backdrop picker. A rider who
    #: switches from the starter road to the pass and back must not be billed a
    #: fresh render for a picture they already have, so the pair is the cache
    #: entry rather than the pose alone. The ceiling rises with it — seven poses
    #: across nine backdrops rather than seven rows — but only for combinations
    #: the rider actually asked to see, and each one stays free forever after.
    #:
    #: NOT NULLABLE, and defaulted at the column so existing rows adopt the
    #: starter road rather than becoming a NULL that the unique constraint would
    #: stop deduplicating (Postgres treats NULLs as distinct).
    backdrop: Mapped[str] = mapped_column(
        String(32), nullable=False, server_default="starter_road",
    )
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    training_context: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )


class RiderStage(Base):
    """Which backdrop this rider has chosen for Today's hero. One row per rider.

    A single-column preference does not obviously deserve a table, and the
    alternatives were both worse. Hanging it on ``users`` puts a garage concern
    in the auth model, and inferring it from the newest ``DayScene`` row would
    make the rider's CHOICE a side effect of what happened to render last — so a
    failed render, or a pose they have not reached yet, would silently move them
    back to a stage they did not pick.

    Absent means the starter road: a rider who has never opened the picker still
    has a hero, and `backdrops.resolve` turns both the missing row and a stale id
    into the same default rather than an error.
    """

    __tablename__ = "rider_stages"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_rider_stage_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    #: A `services.backdrops` id. Not an enum column: the catalogue is code, and
    #: a database enum would make adding a stage a migration.
    backdrop: Mapped[str] = mapped_column(String(32), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False,
    )


class RiderBackdrop(Base):
    """A stage this rider has EARNED. One row per rider per backdrop.

    Why this is stored rather than computed on read. Two of the unlock rules ask
    about weather — was it wet, how cold — and weather is not a column on
    `activities`: it is resolved per ride by `services.ride_facts`, one lookup
    each. Recomputing the whole catalogue over a rider's entire history every
    time they open the picker would mean a lookup per ride per open, for an
    answer that cannot change for any ride already in the past.

    So the expensive half is captured once, at ingestion, where
    `ride_economy._ride_facts` has already paid for the full fact set in order to
    settle the ride's earn. The cheap half — climbing, distance, start hour,
    intensity, surface — is still evaluated live over history in
    `api/garage`, so a rider who earned a stage before this table existed sees it
    immediately rather than having to ride again.

    An unlock is permanent: rows are only ever inserted.
    """

    __tablename__ = "rider_backdrops"
    __table_args__ = (
        UniqueConstraint("user_id", "backdrop", name="uq_rider_backdrop"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    backdrop: Mapped[str] = mapped_column(String(32), nullable=False)
    #: The ride that earned it, so the picker can one day say "am Gardasee, 4. Mai".
    #: Nullable because a stage may be granted by a backfill with no single ride.
    #: NO FOREIGN KEY, matching `RideScene` above and `RideFeedback`.
    #: `activities` is a Timescale hypertable whose primary key must include
    #: the partition column, so it is composite ``(id, started_at)`` and
    #: `activities.id` alone cannot be referenced.
    activity_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    unlocked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
