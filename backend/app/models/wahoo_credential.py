from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.encryption import EncryptedString


class WahooCredential(Base):
    """ORM model for storing encrypted Wahoo Cloud API OAuth tokens.

    The Wahoo integration uses the OAuth2 authorization-code flow: on connect
    we exchange an authorization code for an access_token + refresh_token, and
    thereafter refresh the access_token (via the refresh_token grant) whenever
    it expires. Both tokens are encrypted at rest using Fernet via the
    EncryptedString TypeDecorator (shares GARMIN_ENCRYPTION_KEY).

    One row per user (user_id is UNIQUE). Cascade deletes with the user.
    """

    __tablename__ = "wahoo_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Encrypted at rest via EncryptedString TypeDecorator (Fernet)
    access_token: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    refresh_token: Mapped[str] = mapped_column(EncryptedString(), nullable=False)

    # When the current access_token expires (from OAuth `expires_in`).
    token_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Wahoo's numeric user id (from GET /v1/user), stored for reference/webhook match.
    wahoo_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Last successful sync — surfaced by GET /wahoo/status.
    last_sync_at: Mapped[datetime | None] = mapped_column(
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
        "User", back_populates="wahoo_credential"
    )
