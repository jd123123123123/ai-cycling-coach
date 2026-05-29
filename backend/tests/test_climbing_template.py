"""Tests for the climbing-emphasis Saturday template + pick_template
preferred_template_id override."""
from app.services.training_periodization import pick_template
from app.services.workout_templates import TEMPLATES, parametrize_template


class TestClimbingTemplate:
    def test_template_exists(self):
        assert "z2_climbing_long" in TEMPLATES
        t = TEMPLATES["z2_climbing_long"]
        assert t.category == "endurance"
        # Two low-cadence climbing blocks
        climb_blocks = [b for b in t.blocks if "climb" in b.name.lower()]
        assert len(climb_blocks) == 2
        for b in climb_blocks:
            assert b.cadence_low == 60
            assert b.cadence_high == 70
            assert 0.80 <= b.target_pct_ftp <= 0.86

    def test_resolved_blocks_carry_cadence(self):
        t = TEMPLATES["z2_climbing_long"]
        pw = parametrize_template(t, ftp=240, duration_scale=1.0)
        # All blocks carry cadence — climbing blocks at 60-70, others at
        # zone-defaulted ranges.
        cadences = [(b.name, b.cadence_low, b.cadence_high) for b in pw.blocks]
        climb = [c for c in cadences if "climb" in c[0].lower()]
        assert len(climb) == 2
        for name, low, high in climb:
            assert low == 60 and high == 70, name


class TestPreferredOverride:
    def test_preferred_id_honoured_when_fits(self):
        # Athlete with adequate FTP + time → preferred template should win.
        t = pick_template(
            session_type="endurance",
            athlete_ftp=240,
            available_minutes=180,
            preferred_template_id="z2_climbing_long",
        )
        assert t.id == "z2_climbing_long"

    def test_preferred_id_ignored_when_ftp_too_low(self):
        # FTP 150 < 180 min_ftp_required → fall back to default endurance pick.
        t = pick_template(
            session_type="endurance",
            athlete_ftp=150,
            available_minutes=180,
            preferred_template_id="z2_climbing_long",
        )
        assert t.id != "z2_climbing_long"
        assert t.category == "endurance"

    def test_preferred_id_ignored_when_no_time(self):
        # Available minutes 60 < 180 (template duration) → fall back
        t = pick_template(
            session_type="endurance",
            athlete_ftp=240,
            available_minutes=60,
            preferred_template_id="z2_climbing_long",
        )
        assert t.id != "z2_climbing_long"

    def test_no_preference_uses_default_logic(self):
        """Explicit None preserves the pre-change behaviour."""
        t = pick_template(
            session_type="endurance",
            athlete_ftp=240,
            available_minutes=180,
            preferred_template_id=None,
        )
        assert t.category == "endurance"
        # Default ranking puts the longest endurance template first
        assert t.id == "z2_long_180"


class TestCadenceDefaults:
    def test_zone_defaults_applied_when_block_omits(self):
        """Blocks that don't specify cadence pick up zone-based defaults
        in the parametrized resolved blocks."""
        # tempo_3x10's blocks don't specify cadence
        t = TEMPLATES["tempo_3x10"]
        pw = parametrize_template(t, ftp=240, duration_scale=1.0)
        # Find the tempo blocks (zone 3)
        tempo_blocks = [b for b in pw.blocks if b.zone == 3 and "tempo" in b.name.lower()]
        assert len(tempo_blocks) >= 1
        for b in tempo_blocks:
            # Zone-3 default is 85-95
            assert b.cadence_low == 85
            assert b.cadence_high == 95
