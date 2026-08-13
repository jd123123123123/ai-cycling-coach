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
    DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func,
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

    __tablename__ = "garage_assets"
    __table_args__ = (
        UniqueConstraint("user_id", "kind", name="uq_garage_asset_user_kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
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
