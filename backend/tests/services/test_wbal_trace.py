"""Tests for W′-balance trace downsampling (for the anaerobic-battery chart)."""
from __future__ import annotations

from app.services.wbal_trace import downsample


class TestDownsample:
    def test_short_series_returned_as_is(self):
        s = [1.0, 2.0, 3.0]
        assert downsample(s, 10) == [(0, 1.0), (1, 2.0), (2, 3.0)]

    def test_caps_at_max_points(self):
        s = [float(i) for i in range(1000)]
        out = downsample(s, 100)
        assert len(out) <= 100 + 2  # +endpoints/min, but bounded

    def test_always_includes_endpoints(self):
        s = [float(i) for i in range(500)]
        out = downsample(s, 50)
        idxs = [i for i, _ in out]
        assert idxs[0] == 0
        assert idxs[-1] == 499

    def test_always_includes_global_min(self):
        s = [10.0] * 200 + [-5.0] + [10.0] * 200  # min at index 200
        out = downsample(s, 20)
        assert any(i == 200 and v == -5.0 for i, v in out)

    def test_empty_returns_empty(self):
        assert downsample([], 50) == []
