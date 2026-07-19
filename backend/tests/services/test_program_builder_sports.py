"""Per-sport program storage — backward compat + run skeleton resolution.

Covers:
  - Legacy flat goals["program"] = {id, started} reads as the BIKE program.
  - Per-sport nested shape reads independently per sport.
  - set_program migrates legacy flat → nested, preserves the other sport,
    and removes the "program" key entirely when both sports are cleared.
  - Sport/ID cross-validation (a run id never resolves as a bike program).
  - run_program_day: Tue/Thu/Sat only, rotates week over week, and only
    references templates that exist in RUN_TEMPLATES.
"""
from __future__ import annotations

from datetime import date

from app.services.program_builder import (
    PROGRAM_IDS,
    RUN_PROGRAM_IDS,
    RUN_PROGRAM_META,
    _RUN_SKELETONS,
    active_program,
    run_program_day,
    set_program,
)
from app.services.run_workout_templates import RUN_TEMPLATES


# ---------------------------------------------------------------------------
# active_program — read compat
# ---------------------------------------------------------------------------

def test_legacy_flat_reads_as_bike():
    goals = {"program": {"id": "ftp_builder", "started": "2026-07-01"}}
    assert active_program(goals, "bike") == ("ftp_builder", date(2026, 7, 1))
    assert active_program(goals) == ("ftp_builder", date(2026, 7, 1))  # default sport


def test_legacy_flat_reads_none_for_run():
    goals = {"program": {"id": "ftp_builder", "started": "2026-07-01"}}
    assert active_program(goals, "run") is None


def test_nested_shape_reads_per_sport():
    goals = {"program": {
        "bike": {"id": "vo2_builder", "started": "2026-06-15"},
        "run": {"id": "run_5k_speed", "started": "2026-07-10"},
    }}
    assert active_program(goals, "bike") == ("vo2_builder", date(2026, 6, 15))
    assert active_program(goals, "run") == ("run_5k_speed", date(2026, 7, 10))


def test_nested_with_one_sport_null():
    goals = {"program": {"bike": None, "run": {"id": "run_10k_builder", "started": "2026-07-01"}}}
    assert active_program(goals, "bike") is None
    assert active_program(goals, "run") == ("run_10k_builder", date(2026, 7, 1))


def test_sport_id_cross_validation():
    # A run id stored under bike (or vice versa) never resolves.
    goals = {"program": {"bike": {"id": "run_5k_speed", "started": "2026-07-01"}}}
    assert active_program(goals, "bike") is None
    goals = {"program": {"run": {"id": "ftp_builder", "started": "2026-07-01"}}}
    assert active_program(goals, "run") is None


def test_garbage_shapes_read_none():
    for goals in (None, {}, {"program": None}, {"program": "vo2_builder"},
                  {"program": {"id": "nope", "started": "2026-07-01"}},
                  {"program": {"id": "ftp_builder", "started": "not-a-date"}}):
        assert active_program(goals, "bike") is None
        assert active_program(goals, "run") is None


# ---------------------------------------------------------------------------
# set_program — write + migration
# ---------------------------------------------------------------------------

def test_set_program_fresh_goals():
    g = set_program(None, "run", "run_5k_speed")
    assert g["program"]["bike"] is None
    assert g["program"]["run"]["id"] == "run_5k_speed"
    assert active_program(g, "run")[0] == "run_5k_speed"


def test_set_program_migrates_legacy_and_preserves_other_sport():
    legacy = {"training_model": "polarized",
              "program": {"id": "ftp_builder", "started": "2026-07-01"}}
    g = set_program(legacy, "run", "run_endurance_hm")
    # Bike selection survives the migration untouched (incl. its start date).
    assert active_program(g, "bike") == ("ftp_builder", date(2026, 7, 1))
    assert active_program(g, "run")[0] == "run_endurance_hm"
    # Unrelated goals keys are preserved; input dict is not mutated.
    assert g["training_model"] == "polarized"
    assert legacy["program"] == {"id": "ftp_builder", "started": "2026-07-01"}


def test_set_program_clear_one_sport_keeps_other():
    g = set_program(None, "bike", "vo2_builder")
    g = set_program(g, "run", "run_10k_builder")
    g = set_program(g, "bike", None)
    assert active_program(g, "bike") is None
    assert active_program(g, "run")[0] == "run_10k_builder"


def test_set_program_clearing_both_removes_key():
    g = set_program(None, "bike", "ftp_builder")
    g = set_program(g, "bike", None)
    assert "program" not in g  # absence == race plan (legacy semantics)


# ---------------------------------------------------------------------------
# Run skeletons
# ---------------------------------------------------------------------------

def test_run_program_ids_have_meta_and_skeletons():
    assert set(RUN_PROGRAM_IDS) == set(RUN_PROGRAM_META.keys())
    assert set(RUN_PROGRAM_IDS) == set(_RUN_SKELETONS.keys())
    for meta in RUN_PROGRAM_META.values():
        for key in ("name_en", "name_de", "tagline_en", "tagline_de", "weeks"):
            assert meta[key]


def test_run_program_day_tue_thu_sat_only():
    for pid in RUN_PROGRAM_IDS:
        for week in range(8):
            for dow in range(7):
                tid = run_program_day(pid, week, dow)
                if dow in (1, 3, 5):
                    assert tid is not None, (pid, week, dow)
                else:
                    assert tid is None, (pid, week, dow)


def test_run_skeletons_reference_only_known_templates():
    for pid, slots in _RUN_SKELETONS.items():
        for dow, lst in slots.items():
            for tid in lst:
                assert tid in RUN_TEMPLATES, (pid, dow, tid)


def test_run_program_day_rotates():
    # Week 0 and week 1 of the 5k Tuesday differ (rotating flavors).
    assert run_program_day("run_5k_speed", 0, 1) != run_program_day("run_5k_speed", 1, 1)
    # Unknown program → None, never a crash.
    assert run_program_day("not_a_program", 0, 1) is None


def test_bike_ids_unchanged():
    # The mesocycle hook contract: bike ids stay exactly these three.
    assert PROGRAM_IDS == ("ftp_builder", "vo2_builder", "endurance_200k")
