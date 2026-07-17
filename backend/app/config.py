from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator

# Public default secrets that MUST NOT be used to sign tokens in production.
_INSECURE_SECRET_DEFAULTS = {
    "change-me-in-production",
    "change-me-refresh-secret",
}


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
    # Fail closed: default to production posture. Local/dev must set DEBUG=True
    # explicitly (via .env) to run with the insecure default secrets below.
    DEBUG: bool = False
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

    # ------------------------------------------------------------------
    # Wahoo Cloud API (OAuth2 authorization-code flow).
    # The Wahoo integration is "configured" only when both the client id
    # and secret are present — otherwise /wahoo/connect returns 409 and the
    # app boots normally (feature simply unavailable).
    # Register an app at https://developers.wahooligan.com to obtain these.
    # ------------------------------------------------------------------
    WAHOO_CLIENT_ID: str = ""
    WAHOO_CLIENT_SECRET: str = ""
    # OAuth redirect URI (must match the one registered with Wahoo). When unset,
    # /wahoo/connect derives it from the incoming request base URL.
    WAHOO_REDIRECT_URI: str = ""
    # Wahoo token encryption key. Falls back to GARMIN_ENCRYPTION_KEY when unset
    # so a single Fernet key can protect every integration's tokens at rest.
    WAHOO_ENCRYPTION_KEY: str = ""

    @property
    def wahoo_configured(self) -> bool:
        """Wahoo is usable only when both client id and secret are set."""
        return bool(self.WAHOO_CLIENT_ID and self.WAHOO_CLIENT_SECRET)

    # ------------------------------------------------------------------
    # AI Coach (Phase 5) — Anthropic Claude integration.
    # App MUST boot when ANTHROPIC_API_KEY is unset — coach_service falls
    # back to a rule-based brief generated purely from safety_rails + the
    # feature snapshot so /coach/brief always returns a structured payload.
    # ------------------------------------------------------------------
    ANTHROPIC_API_KEY: str | None = None
    # Sonnet 4.6 — broadly available tier, ~5× cheaper than Opus, fast enough
    # for daily briefs, plenty smart for structured tool-use output. Opus 4.7
    # was overkill (and tier-gated → silent fallback to rule-based on many keys).
    COACH_MODEL: str = "claude-opus-4-8"
    COACH_CHAT_MODEL: str = "claude-sonnet-4-6"   # chat uses same model
    # Caching is refresh-on-demand: a brief regenerates ONLY on an explicit
    # refresh (force=True) or a Garmin sync (which busts the cache when new data
    # lands). Time alone never regenerates it — hence an effectively-infinite TTL.
    COACH_BRIEF_CACHE_HOURS: int = 24 * 365

    # Race Debrief uses the strongest model for the analytical verdict, independent
    # of the coach brief model. Opus 4.8: adaptive thinking, no sampling params.
    RACE_DEBRIEF_MODEL: str = "claude-opus-4-8"

    @field_validator("DATABASE_URL")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL must use 'postgresql+asyncpg://' dialect for async support. "
                f"Got: {v}"
            )
        return v

    @model_validator(mode="after")
    def _guard_production_secrets(self) -> "Settings":
        """Fail closed in production: never sign JWTs with the public default keys.

        When DEBUG is False (production posture), refuse to boot if either JWT
        signing secret is still the shipped ``change-me*`` placeholder — anyone
        could forge tokens against a public default. Local/dev (DEBUG=True) keeps
        running on defaults for zero-config setup.
        """
        if self.DEBUG:
            return self
        offenders = [
            name
            for name, value in (
                ("JWT_SECRET_KEY", self.JWT_SECRET_KEY),
                ("JWT_REFRESH_SECRET_KEY", self.JWT_REFRESH_SECRET_KEY),
            )
            if value in _INSECURE_SECRET_DEFAULTS
        ]
        if offenders:
            raise ValueError(
                "Refusing to start in production (DEBUG=False) with default secret(s): "
                f"{', '.join(offenders)}. Set strong, unique values in the environment."
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
