"""Tests for workout_modifier — the pure modification service called by the
`modify_planned_workout` LLM tool.

Safety contract (non-negotiable):
    1. Every modification routes through parametrize_template — the service
       never hand-authors interval blocks.
    2. Rails downgrades surface as ``rails_downgraded=True`` + a human-readable
       ``reason`` string; callers narrate the downgrade to the user.
    3. ``injury_flag=True`` is the strongest rail — every modification is
       coerced to ``recovery_30`` or ``rest_day``.
    4. Cascades are bounded: harder cannot exceed the athlete's
       ``intensity_ceiling``; easier floors at ``rest_day``/``recovery_30``.

These tests exercise each modification type through its happy path AND the
rails-downgrade path, so a regression that silently strips the downgrade
reason will fail CI.
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.workout_modifier import (
    ModificationResult,
    ORDERED_TEMPLATES,
    TEMPLATE_EASIER_CASCADE,
    TEMPLATE_HARDER_CASCADE,
    apply_modification,
)
from app.services.workout_templates import TEMPLATES


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _pw(template_id: str, duration_min: int = 60, indoor: bool = False):
    """Build a minimal PlannedWorkout stub that the modifier understands.

    We use SimpleNamespace instead of the ORM class so tests stay pure-Python
    (no SQLAlchemy metadata / DB connection required).
    """
    return SimpleNamespace(
        id=1,
        user_id=1,
        template_id=template_id,
        duration_min=duration_min,
        indoor=indoor,
        blocks=None,
        sport="cycling",
        title=TEMPLATES[template_id].name if template_id in TEMPLATES else template_id,
    )


def _snapshot(**overrides) -> dict:
    """Default permissive snapshot: high CTL, push ceiling, no injury.

    Overrides let individual tests model fatigue / injury / low ceiling.
    """
    return {
        "intensity_ceiling": "push",
        "injury_flag": False,
        "ctl": 60.0,
        "atl": 55.0,
        "tsb": 5.0,
        "tss_cap": 78.0,  # 1.3 × 60
        **overrides,
    }


FTP = 250


# ---------------------------------------------------------------------------
# Cascade validation
# ---------------------------------------------------------------------------

class TestCascadeMappings:
    """Verify the cascade tables are internally consistent."""

    def test_every_ordered_template_exists_in_library(self):
        for tid in ORDERED_TEMPLATES:
            assert tid in TEMPLATES, f"{tid} missing from TEMPLATES"

    def test_harder_cascade_covers_every_template(self):
        for tid in ORDERED_TEMPLATES:
            assert tid in TEMPLATE_HARDER_CASCADE

    def test_easier_cascade_covers_every_template(self):
        for tid in ORDERED_TEMPLATES:
            assert tid in TEMPLATE_EASIER_CASCADE

    def test_harder_cascade_monotonic_intensity(self):
        """Walking the harder cascade never DROPS in intensity-category rank.

        TSS monotonicity doesn't hold (a 3h Z2 has higher TSS than a 60min
        VO2), so the cascade is keyed on physiological intensity category
        (rest → recovery → endurance → tempo → sweet_spot → threshold → vo2),
        not raw TSS.
        """
        _CATEGORY_RANK = {
            "rest": 0, "recovery": 1, "endurance": 2, "tempo": 3,
            "sweet_spot": 4, "threshold": 5, "vo2": 6, "anaerobic": 7,
        }
        for tid in ORDERED_TEMPLATES:
            next_id = TEMPLATE_HARDER_CASCADE[tid]
            cur_rank = _CATEGORY_RANK[TEMPLATES[tid].category]
            next_rank = _CATEGORY_RANK[TEMPLATES[next_id].category]
            assert next_rank >= cur_rank, (
                f"{tid}({TEMPLATES[tid].category})→"
                f"{next_id}({TEMPLATES[next_id].category}): intensity dropped"
            )

    def test_easier_cascade_monotonic_intensity(self):
        _CATEGORY_RANK = {
            "rest": 0, "recovery": 1, "endurance": 2, "tempo": 3,
            "sweet_spot": 4, "threshold": 5, "vo2": 6, "anaerobic": 7,
        }
        for tid in ORDERED_TEMPLATES:
            prev_id = TEMPLATE_EASIER_CASCADE[tid]
            cur_rank = _CATEGORY_RANK[TEMPLATES[tid].category]
            prev_rank = _CATEGORY_RANK[TEMPLATES[prev_id].category]
            assert prev_rank <= cur_rank, (
                f"{tid}({TEMPLATES[tid].category})→"
                f"{prev_id}({TEMPLATES[prev_id].category}): intensity increased"
            )

    def test_top_of_harder_cascade_self_loops(self):
        """The last (hardest) template maps to itself — signals 'at ceiling'."""
        hardest = ORDERED_TEMPLATES[-1]
        assert TEMPLATE_HARDER_CASCADE[hardest] == hardest

    def test_bottom_of_easier_cascade_is_rest(self):
        """The easiest template is rest_day and maps to itself."""
        easiest = ORDERED_TEMPLATES[0]
        assert easiest == "rest_day"
        assert TEMPLATE_EASIER_CASCADE[easiest] == "rest_day"


# ---------------------------------------------------------------------------
# apply_modification — result-shape contract
# ---------------------------------------------------------------------------

class TestResultShape:
    def test_result_is_dataclass_with_expected_fields(self):
        result = apply_modification(
            _pw("z2_endurance_60"), "indoor", {}, _snapshot(), FTP,
        )
        assert isinstance(result, ModificationResult)
        # Field existence
        for field in ("template_id", "duration_min", "blocks", "indoor",
                      "rails_downgraded", "reason", "before"):
            assert hasattr(result, field), f"missing field: {field}"

    def test_before_snapshot_captures_original(self):
        result = apply_modification(
            _pw("z2_endurance_60", duration_min=60), "harder", {}, _snapshot(), FTP,
        )
        assert result.before == {"template_id": "z2_endurance_60", "duration_min": 60}


# ---------------------------------------------------------------------------
# shorten / lengthen — duration modifications
# ---------------------------------------------------------------------------

class TestShorten:
    def test_within_tolerance_keeps_template(self):
        """60min → 55min is within ±15% → same template, adjusted duration."""
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, "shorten", {"duration_min": 55}, _snapshot(), FTP,
        )
        assert result.template_id == "z2_endurance_60"
        # Duration clamped by parametrize_template's ±15% scale — 55 min is valid
        assert 51 <= result.duration_min <= 60
        assert result.rails_downgraded is False
        assert "duration" in result.reason.lower()

    def test_below_floor_substitutes_lighter_template(self):
        """90min workout shortened to 30min → below 15% floor (76.5 min) →
        substitutes down the easier cascade."""
        pw = _pw("z2_endurance_90", duration_min=90)
        result = apply_modification(
            pw, "shorten", {"duration_min": 30}, _snapshot(), FTP,
        )
        # Must switch to a shorter template — not stay at z2_endurance_90
        assert result.template_id != "z2_endurance_90"
        # Substituted template should be in the easier cascade chain
        assert result.template_id in ORDERED_TEMPLATES
        assert "substituted" in result.reason.lower() or "shorter" in result.reason.lower()

    def test_missing_duration_param_raises(self):
        pw = _pw("z2_endurance_60")
        with pytest.raises(ValueError):
            apply_modification(pw, "shorten", {}, _snapshot(), FTP)


class TestLengthen:
    def test_within_tolerance_keeps_template(self):
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, "lengthen", {"duration_min": 65}, _snapshot(), FTP,
        )
        assert result.template_id == "z2_endurance_60"
        # +15% ceiling = 69 min
        assert 60 <= result.duration_min <= 69
        assert result.rails_downgraded is False

    def test_above_ceiling_substitutes_longer_template(self):
        """60min workout lengthened to 120min → above 15% ceiling (69 min) →
        substitutes up the cascade to a longer template."""
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, "lengthen", {"duration_min": 120}, _snapshot(), FTP,
        )
        assert result.template_id != "z2_endurance_60"
        assert "substituted" in result.reason.lower() or "longer" in result.reason.lower()


# ---------------------------------------------------------------------------
# harder / easier — template cascade modifications
# ---------------------------------------------------------------------------

class TestHarder:
    def test_steps_one_template_up(self):
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(pw, "harder", {}, _snapshot(), FTP)
        # Next in cascade after z2_endurance_60
        expected = TEMPLATE_HARDER_CASCADE["z2_endurance_60"]
        assert result.template_id == expected
        assert result.rails_downgraded is False

    def test_capped_at_intensity_ceiling(self):
        """'harder' when ceiling='moderate' must NEVER jump to threshold/vo2."""
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="moderate"), FTP,
        )
        # Moderate ceiling = sweet_spot_2x20 is the ceiling; next step
        # (threshold_2x15) would exceed it → downgraded
        assert result.rails_downgraded is True
        assert "ceiling" in result.reason.lower()
        # Must stay at or below sweet_spot
        assert result.template_id in (
            "sweet_spot_2x20", "tempo_3x10",
            "z2_long_180", "z2_endurance_90", "z2_endurance_60",
            "recovery_30",
        )

    def test_easy_ceiling_blocks_hard_workouts(self):
        """Low recovery = 'easy' ceiling → no VO2/threshold allowed even if
        the user explicitly asked for harder."""
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="easy"), FTP,
        )
        assert result.rails_downgraded is True
        # Should drop to recovery_30 per _safe_template_for_ceiling
        assert result.template_id in ("recovery_30", "rest_day")

    def test_already_at_top_stays_put(self):
        """Hardest template with push ceiling → cascade self-loops."""
        hardest = ORDERED_TEMPLATES[-1]
        pw = _pw(hardest, duration_min=60)
        result = apply_modification(pw, "harder", {}, _snapshot(), FTP)
        assert result.template_id == hardest


class TestEasier:
    def test_steps_one_template_down(self):
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(pw, "easier", {}, _snapshot(), FTP)
        expected = TEMPLATE_EASIER_CASCADE["sweet_spot_2x20"]
        assert result.template_id == expected
        assert result.rails_downgraded is False

    def test_floor_at_rest_day(self):
        pw = _pw("rest_day", duration_min=0)
        result = apply_modification(pw, "easier", {}, _snapshot(), FTP)
        # Rest day stays rest day — can't go easier than nothing
        assert result.template_id == "rest_day"


# ---------------------------------------------------------------------------
# indoor — non-structural flag flip
# ---------------------------------------------------------------------------

class TestIndoor:
    def test_flag_set_template_unchanged(self):
        pw = _pw("sweet_spot_2x20", duration_min=90, indoor=False)
        result = apply_modification(pw, "indoor", {}, _snapshot(), FTP)
        assert result.template_id == "sweet_spot_2x20"
        assert result.indoor is True
        assert result.rails_downgraded is False
        assert "indoor" in result.reason.lower()

    def test_watts_preserved(self):
        """Going indoor must not change the watts materialisation."""
        pw = _pw("sweet_spot_2x20", duration_min=90, indoor=False)
        result = apply_modification(pw, "indoor", {}, _snapshot(), FTP)
        assert result.blocks is not None
        assert len(result.blocks) > 0


# ---------------------------------------------------------------------------
# Injury override — highest-priority rail
# ---------------------------------------------------------------------------

class TestInjuryOverride:
    @pytest.mark.parametrize(
        "modification_type,params",
        [
            ("harder", {}),
            ("easier", {}),
            ("shorten", {"duration_min": 30}),
            ("lengthen", {"duration_min": 120}),
            ("indoor", {}),
        ],
    )
    def test_injury_flag_forces_recovery(self, modification_type, params):
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, modification_type, params,
            _snapshot(injury_flag=True), FTP,
        )
        assert result.template_id in ("recovery_30", "rest_day")
        assert result.rails_downgraded is True
        assert "injury" in result.reason.lower()


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    def test_unknown_modification_type_raises(self):
        pw = _pw("z2_endurance_60")
        with pytest.raises(ValueError) as exc:
            apply_modification(pw, "explode", {}, _snapshot(), FTP)
        msg = str(exc.value)
        assert "explode" in msg
        # Should list allowed types
        assert "harder" in msg or "shorten" in msg

    def test_unknown_current_template_falls_back_safely(self):
        """PW with garbage template_id doesn't crash — modifier picks a
        sane default before applying the modification."""
        pw = _pw("z2_endurance_60")
        pw.template_id = "nonexistent_template"
        result = apply_modification(pw, "indoor", {}, _snapshot(), FTP)
        # Should not raise; should land on some valid template
        assert result.template_id in TEMPLATES

    def test_zero_ftp_raises(self):
        """parametrize_template requires ftp>0 — we surface that cleanly."""
        pw = _pw("z2_endurance_60")
        with pytest.raises(ValueError):
            apply_modification(pw, "harder", {}, _snapshot(), ftp_w=0)


# ---------------------------------------------------------------------------
# Library-wide harder/easier (July 2026 fix): the cascade spine covers 12
# templates but plans prescribe from the 50+ library — easier/harder must map
# via nearest_anchor instead of silently returning the same session (live bug:
# "Leichter" on sweet_spot_3x20 no-opped).
# ---------------------------------------------------------------------------

class TestLibraryWideCascade:
    def _pw(self, template_id, duration_min=95, indoor=False):
        from types import SimpleNamespace
        return SimpleNamespace(template_id=template_id, duration_min=duration_min, indoor=indoor)

    def test_easier_on_non_spine_template_actually_eases(self):
        from app.services.workout_modifier import apply_modification
        res = apply_modification(
            self._pw("sweet_spot_3x20"), "easier", {},
            {"intensity_ceiling": "push", "injury_flag": False}, ftp_w=250,
        )
        assert res.template_id != "sweet_spot_3x20"
        assert res.template_id == "tempo_3x10"  # anchor sweet_spot_2x20 → one down

    def test_harder_on_non_spine_template_actually_hardens(self):
        from app.services.workout_modifier import apply_modification
        res = apply_modification(
            self._pw("sweet_spot_3x20"), "harder", {},
            {"intensity_ceiling": "push", "injury_flag": False}, ftp_w=250,
        )
        assert res.template_id == "threshold_2x15"  # anchor → one up

    def test_spine_templates_keep_their_exact_cascade(self):
        from app.services.workout_modifier import apply_modification
        res = apply_modification(
            self._pw("z2_endurance_90", duration_min=90), "easier", {},
            {"intensity_ceiling": "push", "injury_flag": False}, ftp_w=250,
        )
        assert res.template_id == "z2_endurance_60"
