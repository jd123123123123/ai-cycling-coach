from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.encryption import EncryptedString


class GarminCredential(Base):
    """ORM model for storing encrypted Garmin Connect credentials.

    Garmin credentials are required for the unofficial python-garminconnect library
    to re-authenticate after OAuth tokens expire. Credentials are encrypted at rest
    using Fernet (AES-128-CBC + HMAC-SHA256) via the EncryptedString TypeDecorator.

    One row per user (user_id is UNIQUE). Cascade deletes with the user.
    """

    __tablename__ = "garmin_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Encrypted at rest via EncryptedString TypeDecorator (Fernet)
    encrypted_email: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    encrypted_password: Mapped[str] = mapped_column(EncryptedString(), nullable=False)

    # Path to Garmin OAuth token store file (e.g., /data/garmin_tokens/{user_id}/)
    token_store_path: Mapped[str | None] = mapped_column(String, nullable=True)

    # Sync metadata
    last_sync_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: Only a PERMANENT failure clears this — a wrong password, a locked
    #: account. It is not the switch for "Garmin is busy": being throttled is a
    #: fact about the next few minutes, and it used to turn riders off for good.
    #: See `backoff_until`.
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Sync status: "ok" | "auth_error" | "rate_limited" | "syncing" | None (never synced)
    sync_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    #: Set when Garmin rate-limits us. The scheduled sweep skips this rider
    #: until it passes; the rider stays enabled throughout, so the sync resumes
    #: on its own instead of needing the account reconnected.
    backoff_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    #: Auth failures IN A ROW. Reset by any success. One failure is not
    #: evidence about a password — Garmin's login sits behind bot detection
    #: that refuses intermittently — so the sync only disables a rider once
    #: this reaches `AUTH_FAILURES_BEFORE_DISABLE`.
    auth_failures: Mapped[int] = mapped_column(
        Integer, default=0, server_default="0", nullable=False
    )

    #: When the eight biometric endpoints were last asked about today. They are
    #: the bulk of a sync's upstream cost and they answer the same thing all
    #: day; the every-minute run is for catching a ride, not for re-reading
    #: last night's sleep sixty times an hour.
    metrics_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    #: When the once-in-a-while work last ran — the TSS and elevation backfills
    #: and the weigh-in fetch. None of it is why a sync runs every minute.
    maintenance_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), onupdate=func.now()
    )

    # Relationships
    user: Mapped["User"] = relationship(  # noqa: F821
        "User", back_populates="garmin_credential"
    )
