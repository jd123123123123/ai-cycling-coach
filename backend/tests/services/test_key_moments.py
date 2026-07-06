"""Tests for narrative key-moment detection."""
from __future__ import annotations

from app.services.key_moments import KeyMoment, detect_key_moments


class TestDetectKeyMoments:
    def test_empty_returns_empty(self):
        assert detect_key_moments([]) == []

    def test_best_effort_located(self):
        # A clear 60 s spike in the middle should be the best effort.
        power = [150.0] * 300 + [450.0] * 60 + [150.0] * 300
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "best_effort" in moments
        assert 300 <= moments["best_effort"].at_s <= 360

    def test_biggest_match_from_wbal(self):
        power = [200.0] * 600
        wbal = [20000.0] * 200 + [500.0] + [20000.0] * 399  # global min at idx 200
        moments = {m.kind: m for m in detect_key_moments(power, wbal_series=wbal)}
        assert moments["biggest_match"].at_s == 200
        assert moments["biggest_match"].tone == "bad"

    def test_strongest_finish_when_ending_hard(self):
        power = [150.0] * 600 + [300.0] * 300  # last 5 min well above ride avg
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "strongest_finish" in moments
        assert moments["strongest_finish"].tone == "good"

    def test_no_strongest_finish_when_fading(self):
        power = [300.0] * 600 + [150.0] * 300  # finishes below average
        moments = {m.kind: m for m in detect_key_moments(power)}
        assert "strongest_finish" not in moments
