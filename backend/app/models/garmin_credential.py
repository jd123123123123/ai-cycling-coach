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
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Sync status: "ok" | "auth_error" | "syncing" | None (never synced)
    sync_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

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
