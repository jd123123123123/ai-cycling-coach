"""detail_level — the persisted UI depth register (onboarding ↔ Settings).

Covers the review finding: the depth choice was localStorage-only, so
Settings on another device silently showed the default. The field now lives
on athlete_profiles and must round-trip through the update/read schemas.
"""
import pytest
from pydantic import ValidationError

from app.models.athlete_profile import AthleteProfile
from app.schemas.athlete import AthleteProfileRead, AthleteProfileUpdate


class TestDetailLevelSchema:
    def test_update_accepts_all_three_levels(self):
        for level in ("guide", "numbers", "pro"):
            update = AthleteProfileUpdate(detail_level=level)
            assert update.detail_level == level

    def test_update_rejects_unknown_level(self):
        with pytest.raises(ValidationError):
            AthleteProfileUpdate(detail_level="expert")

    def test_update_omitted_stays_unset(self):
        update = AthleteProfileUpdate(ftp_watts=250)
        assert "detail_level" not in update.model_dump(exclude_unset=True)

    def test_read_includes_detail_level_from_model(self):
        from datetime import datetime, timezone

        profile = AthleteProfile(
            id=1,
            user_id=1,
            detail_level="pro",
            quiet_on_rest_days=True,
            created_at=datetime.now(timezone.utc),
        )
        read = AthleteProfileRead.model_validate(profile)
        assert read.detail_level == "pro"

    def test_read_defaults_to_none_for_legacy_profiles(self):
        from datetime import datetime, timezone

        profile = AthleteProfile(
            id=1,
            user_id=1,
            quiet_on_rest_days=True,
            created_at=datetime.now(timezone.utc),
        )
        read = AthleteProfileRead.model_validate(profile)
        assert read.detail_level is None
