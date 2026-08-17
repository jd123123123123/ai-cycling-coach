"""Adaptation-explainer summary honesty (5-reviewer gate, Jul 2026).

Day-1 honesty (Jonas S-2): "Signale stabil seit gestern" rendered for athletes
with ZERO history — a stability claim needs at least one real signal read.
"""
from __future__ import annotations

from app.services.adaptation_explainer import explain_adaptations


class TestDay1Honesty:
    def test_no_signals_at_all_never_claims_stability(self):
        out = explain_adaptations({}, de=True)
        assert out["changes"] == []
        assert "seit gestern" not in out["summary"]
        assert "Noch keine Vergleichsdaten" in out["summary"]

    def test_no_signals_english(self):
        out = explain_adaptations(None, de=False)
        assert "since yesterday" not in out["summary"]
        assert "No history to compare yet" in out["summary"]

    def test_steady_signals_still_say_steady(self):
        # A real, in-band signal (HRV Δ within ±7%) → no changes, but the
        # steady-since-yesterday summary is now honest.
        ev = {"biometrics": {"hrv": {"delta_pct": 1.5}}}
        out = explain_adaptations(ev, de=True)
        assert out["changes"] == []
        assert "Signale stabil seit gestern" in out["summary"]

    def test_moved_signal_keeps_directional_summary(self):
        ev = {"biometrics": {"hrv": {"delta_pct": -9.0}}}
        out = explain_adaptations(ev, de=False)
        assert len(out["changes"]) == 1
        assert "holding back" in out["summary"]


class TestRealEvidenceShape:
    """Four of the six rules read key paths that build_snapshot never writes
    (`load.acwr`, `pmc.ctl_ramp_per_week`, `recovery.sleep_score`,
    `recent.yesterday_intensity`) — they were dead against every real brief.
    These lock the rules onto the shape coach_service.build_snapshot actually
    persists into CoachBrief.evidence.
    """

    def test_acwr_read_from_top_level(self):
        out = explain_adaptations({"acwr": 1.62}, de=True)
        signals = [c["signal"] for c in out["changes"]]
        assert "Lastverhältnis (ACWR)" in signals
        # German decimal comma, per the copy glossary.
        assert "1,62" in out["changes"][0]["detail"]

    def test_ctl_ramp_read_from_ctl_7d_delta(self):
        out = explain_adaptations({"pmc": {"ctl_7d_delta": 9.0}}, de=True)
        assert [c["signal"] for c in out["changes"]] == ["Fitness-Aufbau"]
        assert out["changes"][0]["severity"] == "hold"

    def test_flat_ctl_ramp_is_a_reading_not_an_absence(self):
        # 0.0 must not fall through to the next alias (the `or` bug) nor be
        # mistaken for "no history" in the summary.
        out = explain_adaptations({"pmc": {"ctl_7d_delta": 0.0}}, de=True)
        assert out["changes"] == []
        assert "Signale stabil seit gestern" in out["summary"]

    def test_sleep_read_from_readiness_component(self):
        ev = {"readiness": {"components": [
            {"name": "hrv", "score": 71.0, "weight": 0.22, "note": ""},
            {"name": "sleep", "score": 41.0, "weight": 0.25, "note": "last night 41"},
        ]}}
        out = explain_adaptations(ev, de=True)
        assert [c["signal"] for c in out["changes"]] == ["Schlaf"]
        assert out["changes"][0]["kind"] == "recovery"

    def test_yesterday_hard_from_recent_trend_vs_ctl(self):
        ev = {
            "generated_at": "2026-08-13T06:12:00+00:00",
            "recent_trend": [
                {"date": "2026-08-11", "tss": 44.0},
                {"date": "2026-08-12", "tss": 120.0},
            ],
            "pmc": {"ctl": 60.0},
        }
        out = explain_adaptations(ev, de=True)
        change = next(c for c in out["changes"] if c["signal"] == "Gestern")
        assert "120 TSS" in change["detail"]
        assert "2,0-Fache" in change["detail"]
        assert "CTL 60" in change["detail"]
        assert change["severity"] == "ease"

    def test_yesterday_within_routine_does_not_fire(self):
        ev = {
            "generated_at": "2026-08-13T06:12:00+00:00",
            "recent_trend": [{"date": "2026-08-12", "tss": 60.0}],
            "pmc": {"ctl": 60.0},
        }
        out = explain_adaptations(ev, de=True)
        assert [c["signal"] for c in out["changes"]] == []

    def test_missing_yesterday_entry_is_not_a_zero(self):
        # A day absent from recent_trend can mean "rest" OR "nothing synced" —
        # never claim either.
        ev = {
            "generated_at": "2026-08-13T06:12:00+00:00",
            "recent_trend": [{"date": "2026-08-10", "tss": 90.0}],
            "pmc": {"ctl": 20.0},
        }
        out = explain_adaptations(ev, de=True)
        assert [c["signal"] for c in out["changes"]] == []
