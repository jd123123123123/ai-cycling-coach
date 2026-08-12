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

    # Web-push (morning brief, roadmap P1.5). Unset → push endpoints 503 and
    # the scheduler job no-ops; the app must boot without them.
    VAPID_PRIVATE_KEY: str = ""
    VAPID_PUBLIC_KEY: str = ""
    VAPID_CLAIMS_EMAIL: str = "mailto:coach@example.com"

    # Root directory for per-user Garmin OAuth token stores.
    # Container default was /data/garmin_tokens (volume-mounted) but that path is
    # read-only on bare-metal macOS dev — override via env var when running natively.
    GARMIN_TOKEN_STORE_ROOT: str = "/data/garmin_tokens"

    # Root directory for uploaded crew-event GPX tours (one {event_id}.gpx per
    # event). Container default is /data/crew_tours (Railway volume-mounted);
    # override to a local writable path in dev (backend/.env) since /data is
    # read-only on bare-metal macOS. The API os.makedirs(..., exist_ok=True)s
    # this before writing.
    CREW_TOURS_ROOT: str = "/data/crew_tours"

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
    # COROS Open API (OAuth2 authorization-code flow).
    # COROS's official API is a PARTNER program (not self-serve). The COROS
    # integration is "configured" only when both the client id and secret are
    # present — otherwise /coros/connect returns 409, /coros/status reports
    # configured=false (UI shows "Bald verfügbar"), and the app boots normally.
    # Partner access is requested via the COROS Open API program (approval
    # required) — see https://open.coros.com / coros.com developer contact.
    # ------------------------------------------------------------------
    COROS_CLIENT_ID: str = ""
    COROS_CLIENT_SECRET: str = ""
    # OAuth redirect URI (must match the one registered with COROS). When unset,
    # /coros/connect derives it from the incoming request base URL.
    COROS_REDIRECT_URI: str = ""
    # COROS token encryption key. Falls back to GARMIN_ENCRYPTION_KEY when unset
    # so a single Fernet key can protect every integration's tokens at rest.
    COROS_ENCRYPTION_KEY: str = ""

    @property
    def coros_configured(self) -> bool:
        """COROS is usable only when both client id and secret are set."""
        return bool(self.COROS_CLIENT_ID and self.COROS_CLIENT_SECRET)

    # ------------------------------------------------------------------
    # AI Coach (Phase 5) — Anthropic Claude integration.
    # App MUST boot when ANTHROPIC_API_KEY is unset — coach_service falls
    # back to a rule-based brief generated purely from safety_rails + the
    # feature snapshot so /coach/brief always returns a structured payload.
    # ------------------------------------------------------------------
    ANTHROPIC_API_KEY: str | None = None
    # Model tiers — pick the smallest model each job actually needs, never more.
    #   LIGHT  (Haiku 4.5): trivial one-liners / short extraction — the chart
    #          summarise blurb (≤200 tok). Cheapest, fastest.
    #   COACH  (Sonnet 4.6): the workhorse — daily brief, weekly plan, chart &
    #          period-report narratives, plan-text parsing. The rules engine has
    #          already made the training decision; the LLM narrates / rubber-
    #          stamps / extracts, so Sonnet is plenty smart and ~5× cheaper than
    #          Opus. (Sonnet also accepts temperature, which the Opus tier 400s —
    #          e.g. chart_interpreter's temperature=0.)
    #   CHAT   (Sonnet 4.6): interactive Q&A + tool use.
    #   HEAVY  (Opus 4.8, see RACE_DEBRIEF_MODEL): only the deepest analytical
    #          verdict, where the extra reasoning is worth the cost.
    COACH_LIGHT_MODEL: str = "claude-haiku-4-5"
    COACH_MODEL: str = "claude-sonnet-4-6"
    COACH_CHAT_MODEL: str = "claude-sonnet-4-6"
    # Caching is trigger-based, not time-based (hence an effectively-infinite
    # TTL). A brief regenerates ONLY on these events:
    #   1. Morning   — hourly scheduler sweep, once in the athlete's LOCAL
    #                  morning (coach_service.refresh_brief_scheduled_triggers).
    #   2. Workout   — a Garmin sync that lands a NEW activity busts the cache
    #                  so the next read flips to the post-ride review. A
    #                  metrics-only sync (sleep/HRV/RHR) does NOT regenerate.
    #   3. Missed    — same scheduler sweep: a planned session whose window
    #                  passed unridden triggers one regeneration.
    #   4. Evening   — scheduler sweep, once in the athlete's LOCAL evening.
    #   + force=True — the manual /coach/brief/refresh always regenerates.
    # Each scheduler trigger is deduped per athlete-local day via a marker in
    # AthleteProfile.goals["brief_refresh"]; time alone never regenerates it.
    COACH_BRIEF_CACHE_HOURS: int = 24 * 365

    # Race Debrief uses the strongest model for the analytical verdict, independent
    # of the coach brief model. Opus 4.8: adaptive thinking, no sampling params.
    RACE_DEBRIEF_MODEL: str = "claude-opus-4-8"

    # ------------------------------------------------------------------
    # OpenAI FALLBACK provider. Claude stays PRIMARY always; OpenAI is only
    # tried when a Claude call fails on a credit / quota / billing / auth /
    # rate-limit / 5xx error (see services/llm_client.py). The app MUST boot and
    # every text surface MUST work with OPENAI_API_KEY unset — the fallback
    # simply skips OpenAI and each caller's deterministic rule-based path runs.
    # OPENAI_MODEL default is a cheap, capable model sized for these short
    # narration/extraction jobs.
    # ------------------------------------------------------------------
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    # Image-generation model for the Garage bike render (e.g. "gpt-image-1").
    # Unset by default: the bike-render pipeline runs the vision ANALYSIS but
    # returns no image until an image model is provisioned. See
    # services/bike_render.py.
    IMAGE_MODEL: str = ""

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
