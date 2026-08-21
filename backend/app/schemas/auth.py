from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    #: The invite that brought this rider, if one did. Optional and never
    #: trusted: a code that maps to nobody, to a user who does not exist, or to
    #: this very rider simply links nothing (`services.referral.link_referral`).
    #: Signing up must never fail because an invite was wrong — the rider did
    #: not choose the code they were handed.
    referral_code: str | None = None

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    avatar_url: str | None = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# Max size of the stored base64 data: URL. ~300 KB of base64 ≈ ~225 KB of image.
MAX_AVATAR_CHARS = 300 * 1024


class ProfileUpdateRequest(BaseModel):
    """Partial update of the current user's account-level profile.

    Only ``display_name`` and ``avatar_url`` are user-editable here; athlete stats
    live on /athletes/me. ``avatar_url`` must be a base64 ``data:image/...`` URI —
    arbitrary URLs are rejected (SSRF-safe: we never fetch remote content).
    """

    display_name: str | None = None
    avatar_url: str | None = None

    @field_validator("display_name")
    @classmethod
    def display_name_length(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if len(v) > 80:
            raise ValueError("display_name must be 80 characters or fewer")
        return v or None

    @field_validator("avatar_url")
    @classmethod
    def avatar_is_small_data_uri(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not v.startswith("data:image/"):
            raise ValueError("avatar_url must be a data:image/...;base64 URI")
        if ";base64," not in v:
            raise ValueError("avatar_url must be base64-encoded")
        if len(v) > MAX_AVATAR_CHARS:
            raise ValueError("avatar_url is too large (max ~300 KB)")
        return v
