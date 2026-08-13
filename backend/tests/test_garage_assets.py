"""Garage collectibles — the pure logic behind naming a bike and posing a scene.

Both helpers decide what the rider is *shown*, from model output and ride data
we don't control, so the interesting cases are the malformed ones: a vision pass
that ignores the NAME instruction, and a ride with no TSS to judge.
"""
from app.api.garage import _pose_for
from app.models.activity import Activity
from app.services.cyclr_studio import split_name


class TestSplitName:
    def test_extracts_the_name_and_strips_it_from_the_description(self):
        name, desc = split_name("NAME: Specialized Allez\nFrame: gloss blue aluminium, sloping top tube.")
        assert name == "Specialized Allez"
        assert desc == "Frame: gloss blue aluminium, sloping top tube."

    def test_description_without_a_name_line_is_returned_untouched(self):
        # The model ignored the instruction — the bike still renders, it just
        # has no name. Nothing may be invented to fill the gap.
        raw = "Frame: matte black steel, horizontal top tube."
        assert split_name(raw) == (None, raw)

    def test_tolerates_decoration_around_the_name(self):
        name, _ = split_name('NAME: **"Steel Fixie"**\nFrame: raw steel.')
        assert name == "Steel Fixie"

    def test_name_only_response_yields_no_description(self):
        # Nothing to render from — the endpoint must not persist this.
        assert split_name("NAME: Cannondale CAAD") == ("Cannondale CAAD", None)

    def test_absent_description_stays_absent(self):
        assert split_name(None) == (None, None)

    def test_overlong_name_is_truncated_to_the_column_width(self):
        name, _ = split_name(f"NAME: {'x' * 200}\nFrame: red.")
        assert name is not None and len(name) <= 80


class TestPoseForRide:
    def _ride(self, *, tss: float | None, hours: float) -> Activity:
        return Activity(tss=tss, duration_seconds=int(hours * 3600))

    def test_hard_ride_gets_the_hard_pose(self):
        # 1 h at IF 1.0 → TSS 100.
        assert _pose_for(self._ride(tss=100, hours=1)) == "hard"

    def test_steady_ride_gets_the_endurance_pose(self):
        # 2 h at IF 0.75 → TSS ≈ 112.
        assert _pose_for(self._ride(tss=112, hours=2)) == "endurance"

    def test_very_easy_ride_gets_the_recovery_pose(self):
        # 1 h at IF 0.5 → TSS 25.
        assert _pose_for(self._ride(tss=25, hours=1)) == "recovery"

    def test_ride_without_tss_claims_nothing(self):
        # No TSS means no verdict on the effort — the scene shows a steady ride
        # rather than inventing one.
        assert _pose_for(self._ride(tss=None, hours=2)) == "endurance"

    def test_zero_duration_does_not_divide_by_zero(self):
        assert _pose_for(self._ride(tss=80, hours=0)) == "endurance"
