from app.schemas.race_debrief import (
    RaceDebrief, DebriefHeader, DebriefVerdict, ClimbOut, EffortMatchOut,
    PacingOut, MatchbookOut,
)
from app.services.ride_compare import build_duel


def _hdr(np):
    return DebriefHeader(title="R", date="2026-07-05", sport="ride",
        distance_km=100.0, elevation_m=2000.0, moving_time_s=3600, np_watts=np,
        if_=0.7, tss=200.0, total_kj=3000.0, avg_speed_kmh=25.0)


def _dbr(np, climb_time, climb_wkg, effort_20m, split, surges, wbal_min):
    return RaceDebrief(
        activity_id=1, header=_hdr(np),
        verdict=DebriefVerdict(grade_letter="B", grade_score=80, ai_verdict="", ai_model=""),
        climbs=[ClimbOut(start_s=0, duration_s=climb_time, distance_m=3000.0,
            elev_gain_m=200.0, avg_grade_pct=6.5, vam_m_per_h=1000.0,
            w_per_kg=climb_wkg, avg_power=300.0, category="cat3")],
        efforts=[EffortMatchOut(duration_s=1200, ride_watts=effort_20m, best_watts=None,
            pct_of_best=None, is_pr=False)],
        pacing=PacingOut(first_half_np=np, second_half_np=np, split_pct=split,
            variability_index=1.05, surge_count=surges),
        matchbook=MatchbookOut(matches=[], match_count=0, time_above_cp_s=0,
            min_bal_j=wbal_min, fully_depleted=False),
    )


def test_self_wins_climb_and_power_and_overall():
    me = _dbr(np=250, climb_time=600, climb_wkg=4.2, effort_20m=300, split=-2.0, surges=5, wbal_min=500.0)
    rival = _dbr(np=240, climb_time=650, climb_wkg=3.9, effort_20m=280, split=-8.0, surges=5, wbal_min=1500.0)
    duel = build_duel("Me", "Rival", me, rival)
    assert duel.climb_duels[0].winner == "self"          # faster time
    assert duel.power_duels[0].winner == "self"          # higher watts
    split = next(p for p in duel.pacing_duels if p.metric == "split")
    assert split.winner == "self"                        # |split| smaller
    assert duel.overall_winner == "self"
    assert duel.self_points > duel.rival_points


def test_ties_when_identical():
    me = _dbr(250, 600, 4.0, 300, -3.0, 5, 800.0)
    rival = _dbr(250, 600, 4.0, 300, -3.0, 5, 800.0)
    duel = build_duel("Me", "Rival", me, rival)
    assert duel.overall_winner == "tie"
    assert duel.self_points == duel.rival_points
