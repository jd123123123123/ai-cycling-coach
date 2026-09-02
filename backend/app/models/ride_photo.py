"""Photos a rider attaches to their own ride.

── WHY A TABLE AND A VOLUME, NOT A COLUMN ──────────────────────────────────

The garage stores its collectibles as `image_base64` on the row, which is right
for those: there is exactly one per rider per kind, they are small, and they are
generated rather than uploaded. A ride photo is none of those things — it comes
off a phone camera at two to five megabytes, a rider attaches several, and they
would sit in every row of every feed query that selects the activity.

So the bytes live on the Railway volume beside the Garmin tokens and the crew
tours (`RIDE_PHOTO_ROOT`), and this table holds only where they are. The feed
sends URLs; nothing large crosses the wire unless a screen actually asks for a
picture.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RidePhoto(Base):
    __tablename__ = "ride_photos"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    activity_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("activities.id", ondelete="CASCADE"), nullable=False
    )
    #: Denormalised so ownership can be checked without joining activities —
    #: every read of a photo is an authorisation check first.
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    #: Path RELATIVE to the configured root. Storing an absolute path would
    #: break the day the volume moves, which is exactly the kind of thing that
    #: moves.
    rel_path: Mapped[str] = mapped_column(String(512), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: The rider's own order, so the first one is the one the feed shows.
    sort: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        Index("ix_ride_photos_activity", "activity_id", "sort"),
        Index("ix_ride_photos_user", "user_id"),
    )
