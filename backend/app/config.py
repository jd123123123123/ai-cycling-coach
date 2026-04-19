from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    DATABASE_URL: str = "postgresql+asyncpg://coach:coach@localhost:5432/cycling_coach"
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_REFRESH_SECRET_KEY: str = "change-me-refresh-secret"
    CORS_ORIGINS: str = "http://localhost:5173"
    DEBUG: bool = True
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Garmin credential encryption key — generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # Must be stored in .env; never commit the actual key.
    GARMIN_ENCRYPTION_KEY: str = ""

    # Root directory for per-user Garmin OAuth token stores.
    # Container default was /data/garmin_tokens (volume-mounted) but that path is
    # read-only on bare-metal macOS dev — override via env var when running natively.
    GARMIN_TOKEN_STORE_ROOT: str = "/data/garmin_tokens"

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use 'postgresql+asyncpg://' dialect for async support. "
                f"Got: {v}"
            )
        return v

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
