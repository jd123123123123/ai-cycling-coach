"""Review-gate hardening tests (2026-07-21) for coach_service.

Covers:
  1. sanitize_outlook_7d — the LLM occasionally emits outlook_7d as a raw
     unparsed tool-call fragment (a STRING). Persisting it verbatim poisoned
     the cache and 500'd every /coach/brief read (same bug class as the
     bare-string prescribed_workout fixed in 6adb040).
  2. resolve_and_prescribe never lets garbage outlook_7d through to the
     persistence payload.
  3. _ftp_is_fresh — the block-opener FTP-test override must be skipped when
     the athlete's FTP anchor is fresh (live case: an all-out 20-min test was
     prescribed 3 minutes after the athlete manually entered their FTP).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

from app.services.coach_service import (
    _ftp_is_fresh,
    resolve_and_prescribe,
    sanitize_outlook_7d,
)

GARBAGE_FRAGMENT = '\n<parameter name="day_offset">6'

VALID_OUTLOOK = [
    {"day_offset": i, "suggested_tss": 50.0 + i, "note": f"day {i}"}
    for i in range(7)
]


class TestSanitizeOutlook7d:
    def test_raw_string_fragment_returns_none(self):
        # Live-observed poison: the whole field is one unparsed fragment.
        assert sanitize_outlook_7d(GARBAGE_FRAGMENT) is None

    def test_none_returns_none(self):
        assert sanitize_outlook_7d(None) is None

    def test_dict_returns_none(self):
        assert sanitize_outlook_7d({"day_offset": 0}) is None

    def test_valid_list_passes_through(self):
        out = sanitize_outlook_7d(VALID_OUTLOOK)
        assert out == VALID_OUTLOOK

    def test_mixed_garbage_entries_are_dropped(self):
        mixed = [
            VALID_OUTLOOK[0],
            GARBAGE_FRAGMENT,                      # string entry
            {"day_offset": "x", "suggested_tss": 1},  # non-int offset
            {"day_offset": 9, "suggested_tss": 1},    # out-of-range offset
            {"day_offset": 2, "suggested_tss": "n/a"},  # non-numeric tss
            {"day_offset": 3, "suggested_tss": 61, "note": None},  # note coerced
        ]
        out = sanitize_outlook_7d(mixed)
        assert out == [
            VALID_OUTLOOK[0],
            {"day_offset": 3, "suggested_tss": 61.0, "note": ""},
        ]

    def test_all_garbage_returns_none_not_empty_list(self):
        assert sanitize_outlook_7d([GARBAGE_FRAGMENT, 42, None]) is None

    def test_numeric_string_fields_are_coerced(self):
        out = sanitize_outlook_7d([{"day_offset": "2", "suggested_tss": "55.5"}])
        assert out == [{"day_offset": 2, "suggested_tss": 55.5, "note": ""}]


class TestResolveAndPrescribeOutlookSanitation:
    def _snapshot(self) -> dict:
        return {
            "athlete": {"ftp": 250},
            "rails_context": {"intensity_ceiling": "push"},
            "picked_template_id": "z2_endurance_60",
        }

    def test_garbage_string_outlook_is_stripped(self):
        payload = {
            "verdict": "Ride easy",
            "rationale": "test",
            "prescribed_workout": {"template_id": "z2_endurance_60"},
            "outlook_7d": GARBAGE_FRAGMENT,
        }
        out = resolve_and_prescribe(self._snapshot(), payload)
        assert out["outlook_7d"] is None

    def test_valid_outlook_survives(self):
        payload = {
            "verdict": "Ride easy",
            "rationale": "test",
            "prescribed_workout": {"template_id": "z2_endurance_60"},
            "outlook_7d": list(VALID_OUTLOOK),
        }
        out = resolve_and_prescribe(self._snapshot(), payload)
        assert out["outlook_7d"] == VALID_OUTLOOK

    def test_missing_outlook_becomes_none(self):
        payload = {
            "verdict": "Ride easy",
            "rationale": "test",
            "prescribed_workout": {"template_id": "z2_endurance_60"},
        }
        out = resolve_and_prescribe(self._snapshot(), payload)
        assert out["outlook_7d"] is None


def _profile_with_history(history) -> MagicMock:
    profile = MagicMock()
    profile.ftp_history = history
    return profile


class TestFtpIsFresh:
    today = date(2026, 7, 21)

    def _entry(self, days_ago: int, source: str | None = "manual") -> dict:
        e = {
            "ftp_watts": 250,
            "measured_at": (
                datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)
                - timedelta(days=days_ago)
            ).isoformat(),
        }
        if source:
            e["source"] = source
        return e

    def test_manual_entry_today_is_fresh(self):
        # The live bug: FTP entered manually 3 minutes before the brief.
        profile = _profile_with_history([self._entry(0)])
        assert _ftp_is_fresh(profile, self.today) is True

    def test_entry_20_days_ago_is_fresh(self):
        profile = _profile_with_history([self._entry(20)])
        assert _ftp_is_fresh(profile, self.today) is True

    def test_entry_30_days_ago_is_stale(self):
        profile = _profile_with_history([self._entry(30)])
        assert _ftp_is_fresh(profile, self.today) is False

    def test_latest_entry_wins(self):
        profile = _profile_with_history([self._entry(90), self._entry(1)])
        assert _ftp_is_fresh(profile, self.today) is True

    def test_no_history_not_fresh(self):
        assert _ftp_is_fresh(_profile_with_history([]), self.today) is False
        assert _ftp_is_fresh(_profile_with_history(None), self.today) is False
        assert _ftp_is_fresh(None, self.today) is False

    def test_malformed_entries_skipped(self):
        profile = _profile_with_history(
            ["garbage", {"measured_at": "not-a-date"}, {"ftp_watts": 250}]
        )
        assert _ftp_is_fresh(profile, self.today) is False

    def test_legacy_entry_without_source_counts(self):
        # athlete_service PATCH path writes entries without a 'source' key.
        profile = _profile_with_history([self._entry(2, source=None)])
        assert _ftp_is_fresh(profile, self.today) is True

    def test_zulu_suffix_parses(self):
        profile = _profile_with_history(
            [{"ftp_watts": 250, "measured_at": "2026-07-20T10:00:00Z"}]
        )
        assert _ftp_is_fresh(profile, self.today) is True
