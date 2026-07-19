"""Run template library — shape invariants for the pace-zone run sessions."""
from __future__ import annotations

from app.services.run_workout_templates import (
    RUN_TEMPLATES,
    get_run_template,
    run_interval_structure,
)

VALID_CATEGORIES = {"recovery", "endurance", "tempo", "threshold", "vo2"}


def test_library_size_and_ids():
    assert len(RUN_TEMPLATES) >= 10
    for tid, t in RUN_TEMPLATES.items():
        assert t.id == tid
        assert len(tid) <= 50  # fits PlannedWorkout.template_id String(50)


def test_template_shapes():
    for t in RUN_TEMPLATES.values():
        assert t.name
        assert t.purpose
        assert t.category in VALID_CATEGORIES
        assert t.blocks, t.id
        for b in t.blocks:
            assert b.duration_s > 0, t.id
            assert 1 <= b.zone <= 5, (t.id, b.zone)   # Friel run zones
            assert 1 <= b.rpe <= 10, (t.id, b.rpe)
            assert b.description, (t.id, b.name)
        # Total durations stay in a sane run range (20min .. 2h).
        assert 20 * 60 <= t.duration_s <= 120 * 60, (t.id, t.duration_s)


def test_category_intensity_honesty():
    # VO₂ templates actually contain Z5 work; recovery/endurance never do
    # more than brief strides; tempo/threshold peak at Z3/Z4.
    for t in RUN_TEMPLATES.values():
        zones = [b.zone for b in t.blocks]
        if t.category == "vo2":
            assert 5 in zones, t.id
        if t.category == "recovery":
            assert max(zones) == 1, t.id
        if t.category in ("tempo", "threshold"):
            assert max(zones) in (3, 4), t.id


def test_interval_structure_contract():
    for t in RUN_TEMPLATES.values():
        st = run_interval_structure(t)
        intervals = st["intervals"]
        assert len(intervals) == len(t.blocks)
        for iv in intervals:
            # Run-program contract keys…
            for key in ("duration_s", "zone", "rpe", "description"):
                assert key in iv, (t.id, key)
            # …plus duration_seconds so existing week/day readers render runs.
            assert iv["duration_seconds"] == iv["duration_s"]
        assert sum(iv["duration_s"] for iv in intervals) == t.duration_s


def test_get_run_template():
    assert get_run_template("run_vo2_400s") is RUN_TEMPLATES["run_vo2_400s"]
    assert get_run_template("nope") is None


def test_signature_sessions_exist():
    # The task's named session types are all present.
    for tid in ("run_easy_45", "run_strides_8x20", "run_vo2_400s", "run_vo2_800s",
                "run_tempo_20", "run_progression_45", "run_long_ladder_100"):
        assert tid in RUN_TEMPLATES
