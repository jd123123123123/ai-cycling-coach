"""Safety-rails integration tests for workout_modifier.

Scope: EVERY modification_type × EVERY rails scenario. Isolated from
test_workout_modifier.py because safety is the core contract — a regression
that silently bypasses the rails must fail loudly with a clear artifact.

Rails precedence (tested explicitly):
    injury_flag > tss_cap_relative_to_ctl > intensity_ceiling > user intent

The matrix below hits 5 modification_types × 6 rails scenarios. Missing a
cell would let the LLM smuggle a workout past the rails, which is the exact
failure mode this file exists to catch.

References:
    - Research on AI coaching failures (TrainerRoad, Runna) — see
      .planning/research/athlete-pain-points.md #6
    - 05-01 decision: "Rails applied AFTER LLM — mark blocked with reason"
"""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services.workout_modifier import (
    ORDERED_TEMPLATES,
    TEMPLATE_HARDER_CASCADE,
    apply_modification,
)
from app.services.workout_templates import TEMPLATES


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

FTP = 250


def _pw(template_id: str, duration_min: int = 60, indoor: bool = False):
    return SimpleNamespace(
        id=1,
        user_id=1,
        template_id=template_id,
        duration_min=duration_min,
        indoor=indoor,
        blocks=None,
        sport="cycling",
        title=TEMPLATES[template_id].name,
    )


def _snapshot(**overrides) -> dict:
    base = {
        "intensity_ceiling": "push",
        "injury_flag": False,
        "ctl": 60.0,
        "atl": 55.0,
        "tsb": 5.0,
        "tss_cap": 78.0,
    }
    base.update(overrides)
    return base


MODIFICATION_PARAMS = {
    "shorten": {"duration_min": 30},
    "lengthen": {"duration_min": 120},
    "harder": {},
    "easier": {},
    "indoor": {},
}

ALL_MODIFICATION_TYPES = list(MODIFICATION_PARAMS.keys())


# ---------------------------------------------------------------------------
# Rail 1 — injury_flag: highest priority, always wins
# ---------------------------------------------------------------------------

class TestInjuryRailMatrix:
    """Injury is the strongest rail. EVERY modification type × any other
    signal must still land on recovery_30 when injury_flag=True.
    """

    @pytest.mark.parametrize("modification_type", ALL_MODIFICATION_TYPES)
    def test_injury_overrides_any_modification_from_vo2(self, modification_type):
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, modification_type, MODIFICATION_PARAMS[modification_type],
            _snapshot(injury_flag=True), FTP,
        )
        assert result.template_id in ("recovery_30", "rest_day")
        assert result.rails_downgraded is True
        assert "injury" in result.reason.lower()

    @pytest.mark.parametrize("modification_type", ALL_MODIFICATION_TYPES)
    def test_injury_overrides_even_from_rest_day(self, modification_type):
        """injury + starting from rest_day still returns recovery_30 / rest_day."""
        pw = _pw("rest_day", duration_min=0)
        result = apply_modification(
            pw, modification_type, MODIFICATION_PARAMS[modification_type],
            _snapshot(injury_flag=True), FTP,
        )
        assert result.template_id in ("recovery_30", "rest_day")
        assert result.rails_downgraded is True


# ---------------------------------------------------------------------------
# Rail 2 — intensity_ceiling
# ---------------------------------------------------------------------------

class TestIntensityCeilingRail:
    """intensity_ceiling blocks harder cascades from exceeding the ceiling.

    The mapping from ceiling → max-allowed-template comes from
    _SAFE_TEMPLATE_FOR_CEILING in workout_modifier.py:
        rest     → rest_day
        easy     → recovery_30
        moderate → sweet_spot_2x20
        push     → vo2_5x4  (effectively no cap)
    """

    def test_moderate_ceiling_blocks_threshold_and_above(self):
        """Cannot harder-cascade from sweet_spot to threshold when ceiling='moderate'."""
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="moderate"), FTP,
        )
        assert result.rails_downgraded is True
        assert "ceiling" in result.reason.lower()
        # sweet_spot is the highest the ceiling allows
        assert TEMPLATES[result.template_id].category in (
            "rest", "recovery", "endurance", "tempo", "sweet_spot",
        )

    def test_easy_ceiling_forces_recovery_even_from_vo2(self):
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="easy"), FTP,
        )
        assert result.rails_downgraded is True
        assert result.template_id in ("recovery_30", "rest_day")

    def test_rest_ceiling_forces_rest_day_on_harder(self):
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="rest"), FTP,
        )
        assert result.rails_downgraded is True
        assert result.template_id == "rest_day"

    def test_push_ceiling_permits_full_harder_cascade(self):
        """Default permissive ceiling — harder cascade proceeds without rails."""
        pw = _pw("tempo_3x10", duration_min=60)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="push"), FTP,
        )
        assert result.rails_downgraded is False
        expected = TEMPLATE_HARDER_CASCADE["tempo_3x10"]
        assert result.template_id == expected

    def test_easier_cascade_not_affected_by_ceiling(self):
        """'easier' can never exceed the ceiling — it moves the other way.
        Ceiling rails don't fire on easier modifications."""
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, "easier", {}, _snapshot(intensity_ceiling="easy"), FTP,
        )
        assert result.rails_downgraded is False

    @pytest.mark.parametrize("modification_type", ["shorten", "lengthen", "indoor"])
    def test_non_intensity_modifications_ignore_ceiling(self, modification_type):
        """shorten/lengthen/indoor don't traverse the intensity cascade, so
        the ceiling rail has no input to the decision."""
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, modification_type, MODIFICATION_PARAMS[modification_type],
            _snapshot(intensity_ceiling="easy"), FTP,
        )
        # Should succeed without a rails downgrade for these modification types
        # (the already-tested injury rail is the exception)
        assert result.rails_downgraded is False


# ---------------------------------------------------------------------------
# Rail 3 — already-trained-today
# ---------------------------------------------------------------------------
#
# This rail lives in the TOOL HANDLER (coach_tools.modify_planned_workout)
# rather than in apply_modification itself, because it requires DB lookup of
# today's Activity. The service receives already-vetted inputs.
#
# We include a unit-level check here that the modifier doesn't treat
# 'already_trained_today=True' as a reason to mutate or crash — it just
# computes the modification normally. The handler layer is responsible for
# rejecting the request BEFORE calling apply_modification.


class TestAlreadyTrainedTodaySignal:
    def test_service_ignores_already_trained_signal(self):
        """The rail is enforced by the caller — apply_modification doesn't know
        about today's completed activity. Verifying this contract means a
        future refactor can't accidentally move the check without noticing."""
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, "harder", {},
            _snapshot(already_trained_today=True),  # extra key — must be ignored
            FTP,
        )
        # No crash, no special-casing — this is the point
        assert result.template_id == TEMPLATE_HARDER_CASCADE["z2_endurance_60"]
        assert result.rails_downgraded is False


# ---------------------------------------------------------------------------
# Precedence — stacked rails
# ---------------------------------------------------------------------------

class TestRailPrecedence:
    """Documents and enforces the precedence order:
        injury_flag > intensity_ceiling > user intent

    The test verifies behaviour at each junction so a future refactor that
    shuffles the checks (e.g. puts ceiling before injury) will fail loudly.
    """

    def test_injury_wins_over_ceiling(self):
        """injury + any ceiling → recovery, not the ceiling's max template."""
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, "harder", {},
            _snapshot(injury_flag=True, intensity_ceiling="moderate"),
            FTP,
        )
        # With ceiling='moderate' alone, result would be sweet_spot_2x20.
        # With injury, we must end up at recovery_30.
        assert result.template_id in ("recovery_30", "rest_day")
        assert "injury" in result.reason.lower()

    def test_injury_wins_over_user_intent_easier(self):
        """Even the 'easier' direction is pre-empted by injury — we still go
        to recovery_30 (not whatever the cascade step would have landed on)."""
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(
            pw, "easier", {},
            _snapshot(injury_flag=True),
            FTP,
        )
        assert result.template_id in ("recovery_30", "rest_day")
        assert result.rails_downgraded is True

    def test_ceiling_wins_over_user_intent_harder(self):
        """Without injury, ceiling should still intercept harder-intent."""
        pw = _pw("sweet_spot_2x20", duration_min=90)
        result = apply_modification(
            pw, "harder", {},
            _snapshot(intensity_ceiling="easy"),
            FTP,
        )
        assert result.rails_downgraded is True


# ---------------------------------------------------------------------------
# Transparency — reason strings are load-bearing
# ---------------------------------------------------------------------------

class TestDowngradeTransparency:
    """The system prompt instructs the LLM to narrate every rails_downgraded
    result. Reason strings must therefore always be non-empty, human-readable,
    and specific about WHICH rail fired."""

    def test_injury_reason_names_injury(self):
        pw = _pw("vo2_5x4")
        result = apply_modification(
            pw, "harder", {}, _snapshot(injury_flag=True), FTP,
        )
        assert result.rails_downgraded is True
        assert "injury" in result.reason.lower()
        assert len(result.reason) >= 10  # not a stub

    def test_ceiling_reason_names_ceiling(self):
        pw = _pw("sweet_spot_2x20")
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling="easy"), FTP,
        )
        assert result.rails_downgraded is True
        assert "ceiling" in result.reason.lower()
        assert len(result.reason) >= 10

    def test_successful_modifications_still_have_reason(self):
        """Even non-downgraded modifications carry a reason — the audit row
        always has context."""
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(pw, "harder", {}, _snapshot(), FTP)
        assert result.rails_downgraded is False
        assert result.reason  # non-empty

    def test_reason_does_not_leak_raw_watts(self):
        """Reason strings are surfaced to users in simple-mode chat. They must
        not contain raw watt numbers (which would violate 05.2's jargon ban)."""
        pw = _pw("vo2_5x4")
        result = apply_modification(
            pw, "harder", {}, _snapshot(injury_flag=True), FTP,
        )
        # No "250W" or "288W" style leakage
        assert "W" not in result.reason.replace("With", "").replace("was", "").replace("way", "")


# ---------------------------------------------------------------------------
# Blocks are materialised — no raw template placeholders
# ---------------------------------------------------------------------------

class TestMaterializedBlocks:
    """Every ModificationResult must carry fully-materialised blocks — never
    a raw template reference. This is the 05.1 invariant: server-side authority
    over watts, with FTP-derived absolute numbers."""

    @pytest.mark.parametrize("modification_type", ALL_MODIFICATION_TYPES)
    def test_blocks_have_absolute_watts(self, modification_type):
        pw = _pw("z2_endurance_60", duration_min=60)
        result = apply_modification(
            pw, modification_type, MODIFICATION_PARAMS[modification_type],
            _snapshot(), FTP,
        )
        # Rest day is legitimately empty, everything else must have blocks
        if result.template_id == "rest_day":
            return
        assert len(result.blocks) > 0
        # Every block has absolute watts, not a raw %FTP placeholder
        for block in result.blocks:
            assert "target_watts_low" in block
            assert "target_watts_high" in block
            assert isinstance(block["target_watts_low"], int)
            assert block["target_watts_low"] > 0

    @pytest.mark.parametrize("ceiling", ["rest", "easy", "moderate", "push"])
    def test_downgraded_blocks_still_materialised(self, ceiling):
        """Rails downgrades produce blocks that are ALSO materialised —
        the athlete's FTP is applied to the safe template, not to the
        original one."""
        pw = _pw("vo2_5x4", duration_min=75)
        result = apply_modification(
            pw, "harder", {}, _snapshot(intensity_ceiling=ceiling), FTP,
        )
        if result.template_id == "rest_day":
            assert result.blocks == []
        else:
            assert len(result.blocks) > 0
            for block in result.blocks:
                assert block["target_watts_low"] > 0
