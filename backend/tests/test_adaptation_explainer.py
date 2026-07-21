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
