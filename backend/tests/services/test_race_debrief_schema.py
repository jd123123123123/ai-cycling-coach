"""The RaceDebrief schema validates minimal and rich payloads."""
from __future__ import annotations

from app.schemas.race_debrief import RaceDebrief


def test_minimal_payload_validates():
    rd = RaceDebrief(
        activity_id=1,
        header={"title": "Race", "date": "2026-07-01T09:00:00Z", "sport": "cycling",
                "distance_km": 100.0, "elevation_m": 1500.0, "moving_time_s": 12000,
                "np_watts": 230.0, "if_": 0.85, "tss": 250.0, "total_kj": 2500.0,
                "avg_speed_kmh": 30.0},
        verdict={"grade_letter": "B", "grade_score": 82.0, "ai_verdict": "Solid ride.",
                 "ai_model": "rule-based-fallback", "went_well": ["Strong finish"],
                 "watch_out": ["Faded mid-race"]},
    )
    assert rd.activity_id == 1
    assert rd.verdict.grade_letter == "B"
    # optional blocks default None / []
    assert rd.pacing is None
    assert rd.segments == []
    assert rd.plan == []


def test_rich_blocks_validate():
    rd = RaceDebrief(
        activity_id=2,
        header={"title": "R", "date": "2026-07-01T09:00:00Z", "sport": "cycling",
                "distance_km": 1.0, "elevation_m": 0.0, "moving_time_s": 60,
                "np_watts": 1.0, "if_": None, "tss": 0.0, "total_kj": 0.0,
                "avg_speed_kmh": 0.0},
        verdict={"grade_letter": "A", "grade_score": 95.0, "ai_verdict": "x",
                 "ai_model": "m", "went_well": [], "watch_out": []},
        pacing={"first_half_np": 200.0, "second_half_np": 190.0, "split_pct": -5.0,
                "variability_index": 1.1, "surge_count": 3, "phase_np": [200.0, 195.0, 190.0],
                "final_30min_np": 188.0, "zone_time_pct": {"zone2": 50.0}},
        segments=[{"kind": "climb", "start_s": 0, "end_s": 60, "duration_s": 60,
                   "distance_m": 600.0, "elev_gain_m": 40.0, "elev_loss_m": 0.0,
                   "avg_grade_pct": 6.6, "avg_power": 250.0, "avg_speed_ms": 10.0}],
        plan=[{"priority": 1, "headline": "Pace the opener", "race_tactic": "20W lower",
               "training_fix": "VO2 intervals", "tone": "caution"}],
    )
    assert rd.pacing.surge_count == 3
    assert rd.segments[0].kind == "climb"
    assert rd.plan[0].priority == 1
