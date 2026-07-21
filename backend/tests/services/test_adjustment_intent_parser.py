"""parse_adjustment_intent — rule-based free-text → plan-adjustment intent.

Contract:
    - DE + EN phrasing maps to the SAME intents /coach/plan/preview understands
      (shorten / easier / harder / indoor / lengthen), day- or week-scope.
    - "45 min" / "1h" / "1,5h" / "eine Stunde" parse to duration_min.
    - Non-actionable text (greetings, analytical questions, gibberish) → None.
"""
from __future__ import annotations

import pytest

from app.services.coach_tools import parse_adjustment_intent


class TestShorten:
    @pytest.mark.parametrize(
        "text,expected_min",
        [
            ("nur 45 min heute", 45),
            ("ich hab nur 45min Zeit", 45),
            ("mach es kürzer, 30 Minuten", 30),
            ("only 45 min today", 45),
            ("I only have 1h", 60),
            ("just 1,5h today", 90),
            ("eine Stunde bitte", 60),
            ("half an hour please", 30),
        ],
    )
    def test_duration_phrases_map_to_shorten(self, text, expected_min):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "shorten"
        assert intent["scope"] == "day"
        assert intent["params"]["duration_min"] == expected_min

    @pytest.mark.parametrize(
        "text",
        ["kürzer bitte", "weniger Zeit heute", "keine Zeit", "less time",
         "short on time", "cut it short"],
    )
    def test_bare_shorten_defaults_duration(self, text):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "shorten"
        # bare "shorter" with no number → sensible default duration.
        assert intent["params"]["duration_min"] == 45


class TestEasier:
    @pytest.mark.parametrize(
        "text",
        ["mach es leichter", "lockerer heute", "das ist zu hart",
         "ruhiger bitte", "make it easier", "go easy today",
         "that's too hard", "tone it down"],
    )
    def test_easier_day(self, text):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "easier"
        assert intent["scope"] == "day"


class TestEasierWeek:
    @pytest.mark.parametrize(
        "text",
        ["mach die Woche leichter", "leichtere Woche bitte",
         "ruhigere Woche", "eine lockere Woche", "make the week easier",
         "easier week please", "lighter week"],
    )
    def test_easier_week_scope(self, text):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "easier"
        assert intent["scope"] == "week"


class TestHarder:
    @pytest.mark.parametrize(
        "text",
        ["mach es härter", "härter heute", "fordere mich", "push mich",
         "make it harder", "push me today", "that was too easy", "step it up"],
    )
    def test_harder(self, text):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "harder"
        assert intent["scope"] == "day"


class TestIndoor:
    @pytest.mark.parametrize(
        "text",
        ["auf der Rolle heute", "drinnen bitte", "indoor",
         "on the trainer", "let's do it on the turbo", "Zwift heute"],
    )
    def test_indoor(self, text):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "indoor"
        assert intent["scope"] == "day"


class TestLengthen:
    @pytest.mark.parametrize(
        "text,expected_min",
        [("mach es länger, 90 min", 90), ("longer, 2 hours", 120)],
    )
    def test_lengthen_with_duration(self, text, expected_min):
        intent = parse_adjustment_intent(text)
        assert intent is not None
        assert intent["modification_type"] == "lengthen"
        assert intent["params"]["duration_min"] == expected_min

    def test_bare_lengthen_without_duration_is_non_actionable(self):
        # "länger" with no number can't be materialised → not actionable.
        assert parse_adjustment_intent("mach es länger") is None


class TestNonActionable:
    @pytest.mark.parametrize(
        "text",
        [
            "hallo coach",
            "warum bin ich müde?",
            "why am I tired?",
            "wie ist meine Form?",
            "asdfghjkl",
            "",
            "danke!",
            "was ist FTP?",
        ],
    )
    def test_gibberish_and_questions_return_none(self, text):
        assert parse_adjustment_intent(text) is None

    def test_none_and_non_string_safe(self):
        assert parse_adjustment_intent(None) is None  # type: ignore[arg-type]
        assert parse_adjustment_intent(123) is None  # type: ignore[arg-type]
