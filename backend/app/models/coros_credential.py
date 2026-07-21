from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.utils.encryption import EncryptedString


class CorosCredential(Base):
    """ORM model for storing encrypted COROS Open API OAuth tokens.

    Mirrors WahooCredential. The COROS Open API (partner program) uses the
    OAuth2 authorization-code flow: on connect we exchange an authorization
    code for an access_token + refresh_token (+ the COROS ``openId`` user id),
    and thereafter refresh the access_token via the refresh_token grant when it
    expires. Both tokens are encrypted at rest using Fernet via the
    EncryptedString TypeDecorator (shares GARMIN_ENCRYPTION_KEY).

    One row per user (user_id is UNIQUE). Cascade deletes with the user.
    """

    __tablename__ = "coros_credentials"

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

    # COROS's user identifier (the ``openId`` returned with the token). Stored
    # for reference and to match webhook/push payloads back to the user.
    coros_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Granted OAuth scope (COROS returns/echoes it on some flows).
    scope: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Last successful sync — surfaced by GET /coros/status.
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
        "User", back_populates="coros_credential"
    )
