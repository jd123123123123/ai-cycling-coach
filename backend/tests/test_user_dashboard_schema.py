"""Validation tests for the rich ChartSpec fields (multi-measure, ref lines)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.user_dashboard import ChartSpec

BASE = {
    "mark": "line",
    "query": {
        "dataset": "activities",
        "dimensions": [{"column": "started_at", "time_grain": "week", "alias": "date"}],
        "measures": [
            {"column": "tss", "aggregation": "sum", "alias": "sum_tss"},
            {"column": "average_hr", "aggregation": "avg", "alias": "avg_average_hr"},
        ],
    },
    "encoding": {"x": "date", "y": "sum_tss"},
}


def test_accepts_measure_styles_and_axes():
    spec = ChartSpec(**{**BASE, "encoding": {
        "x": "date", "y": "sum_tss",
        "measures": [
            {"key": "sum_tss", "mark": "bar", "axis": "left"},
            {"key": "avg_average_hr", "mark": "line", "axis": "right"},
        ],
    }})
    assert spec.encoding.measures[1].axis == "right"
    assert spec.encoding.measures[0].mark == "bar"


def test_rejects_bad_axis():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": "sum_tss", "axis": "middle"}],
        }})


def test_rejects_bad_measure_mark():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": "sum_tss", "mark": "pie"}],
        }})


def test_caps_measures_at_four():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "encoding": {
            "x": "date", "y": "sum_tss",
            "measures": [{"key": f"m{i}"} for i in range(5)],
        }})


def test_accepts_all_reference_line_kinds():
    spec = ChartSpec(**{**BASE, "reference_lines": [
        {"kind": "value", "value": 250, "label": "FTP"},
        {"kind": "average"},
        {"kind": "profile", "source": "ftp"},
        {"kind": "band", "value": -10, "valueMax": 5, "label": "optimal"},
    ]})
    assert len(spec.reference_lines) == 4
    assert spec.reference_lines[3].valueMax == 5


def test_rejects_bad_reference_kind():
    with pytest.raises(ValidationError):
        ChartSpec(**{**BASE, "reference_lines": [{"kind": "diagonal"}]})


def test_legacy_spec_without_new_fields_still_valid():
    spec = ChartSpec(**BASE)
    assert spec.encoding.measures is None
    assert spec.reference_lines == []
