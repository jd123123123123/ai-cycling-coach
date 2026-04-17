"""Fernet-based encrypted column TypeDecorator for SQLAlchemy.

Used to transparently encrypt/decrypt sensitive values (e.g., Garmin credentials)
at the ORM layer. The encryption key is read lazily from settings.GARMIN_ENCRYPTION_KEY
so that the module can be imported without the key being set at import time.
"""
from cryptography.fernet import Fernet
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator


class EncryptedString(TypeDecorator):
    """SQLAlchemy TypeDecorator that transparently encrypts/decrypts string values.

    Encryption uses Fernet symmetric authenticated encryption (AES-128-CBC + HMAC-SHA256).
    The key is read from settings.GARMIN_ENCRYPTION_KEY on first use (lazy load).

    Usage:
        class MyModel(Base):
            secret: Mapped[str] = mapped_column(EncryptedString(), nullable=False)
    """

    impl = String
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Encrypt value before writing to DB."""
        if value is None:
            return None
        from app.config import settings
        key = settings.GARMIN_ENCRYPTION_KEY.encode()
        return Fernet(key).encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        """Decrypt value after reading from DB."""
        if value is None:
            return None
        from app.config import settings
        key = settings.GARMIN_ENCRYPTION_KEY.encode()
        return Fernet(key).decrypt(value.encode()).decode()
