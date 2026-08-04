"""The saying bank's invariants.

These are content tests, and content tests earn their keep here: a bank whose
whole value is "you will not see the same line twice this season" fails
silently. A duplicate, a short bank or an unreachable tail costs nothing at
import time and everything in the product, so each of those is pinned.
"""
from datetime import date, timedelta

import pytest

from app.services.execution_sayings import EXECUTION_SAYINGS_DE, saying_for
from app.services.ride_compliance import Grade
from typing import get_args


GRADES = list(get_args(Grade))


class TestBankShape:
    def test_every_grade_has_a_bank(self):
        """A grade with no bank silently falls back to one repeated headline."""
        assert set(EXECUTION_SAYINGS_DE) == set(GRADES)

    @pytest.mark.parametrize("grade", GRADES)
    def test_each_bank_has_at_least_a_hundred_lines(self, grade):
        assert len(EXECUTION_SAYINGS_DE[grade]) >= 100

    @pytest.mark.parametrize("grade", GRADES)
    def test_no_duplicates_within_a_bank(self, grade):
        bank = EXECUTION_SAYINGS_DE[grade]
        assert len(set(bank)) == len(bank)

    def test_no_line_is_shared_between_grades(self):
        """A line that fits both 'perfect' and 'overcooked' is telling the
        athlete nothing about how the ride actually went."""
        seen: dict[str, str] = {}
        for grade, bank in EXECUTION_SAYINGS_DE.items():
            for line in bank:
                assert line not in seen, f"{line!r} in both {seen.get(line)} and {grade}"
                seen[line] = grade

    @pytest.mark.parametrize("grade", GRADES)
    def test_lines_are_headlines_not_paragraphs(self, grade):
        """These render as a card headline. A sentence that wraps to three
        lines breaks the layout it lives in."""
        for line in EXECUTION_SAYINGS_DE[grade]:
            assert line.strip() == line
            assert 0 < len(line) <= 70, line
            assert not line.endswith("."), line


class TestSelection:
    @pytest.mark.parametrize("grade", GRADES)
    def test_every_line_is_reachable_within_a_year(self, grade):
        """The regression this exists for: the previous picker indexed by day
        of MONTH, so against a 100-line bank it could only ever reach the first
        31 and 69 lines would never once be shown."""
        bank = EXECUTION_SAYINGS_DE[grade]
        start = date(2026, 1, 1)
        seen = {saying_for(bank, start + timedelta(days=i), grade) for i in range(366)}
        assert len(seen) == len(bank)

    def test_the_same_day_always_gives_the_same_line(self):
        """Stability within a day: the headline must not reshuffle when the
        card re-renders or the athlete reopens the app."""
        day = date(2026, 5, 17)
        for grade in GRADES:
            bank = EXECUTION_SAYINGS_DE[grade]
            assert saying_for(bank, day, grade) == saying_for(bank, day, grade)

    def test_different_grades_do_not_collide_on_the_same_day(self):
        """Without the grade salt, every bank would hand back the same index,
        so two rides graded differently on one day would draw parallel lines."""
        day = date(2026, 5, 17)
        indexes = {
            grade: EXECUTION_SAYINGS_DE[grade].index(
                saying_for(EXECUTION_SAYINGS_DE[grade], day, grade)
            )
            for grade in GRADES
        }
        assert len(set(indexes.values())) > 1

    def test_an_empty_bank_returns_empty_rather_than_raising(self):
        """The caller falls back to its single headline on empty — it must not
        get an IndexError on a grade nobody wrote a bank for."""
        assert saying_for([], date(2026, 1, 1), "whatever") == ""
