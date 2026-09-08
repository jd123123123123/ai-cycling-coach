"""The coach voices, and the guarantees they must not break.

A voice changes the REGISTER of the brief and nothing else. These tests pin
the three properties that make that safe:

1. The default voice appends nothing, so the prompt is byte-identical to what
   shipped before voices existed.
2. Every other voice appends a SUFFIX only — the cached prefix (knowledge base
   + base prompt) is untouched, so prompt caching stays warm.
3. An unrecognised stored value degrades to silence rather than raising: the
   preference is free text in a JSON column and may outlive this catalogue.

Plus a drift check against the frontend mirror, the same guard the shop
catalogue uses: the picker must never offer a voice the prompt does not know.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services.coach_prompt import (
    COACH_VOICES,
    DEFAULT_COACH_VOICE,
    system_prompt_for_language,
    voice_suffix,
)

MIRROR = (
    Path(__file__).resolve().parents[2]
    / "frontend/src/editorial/w3/w3coachVoices.ts"
)


class TestVoiceSuffix:
    def test_default_voice_changes_nothing(self):
        assert voice_suffix(DEFAULT_COACH_VOICE) == ""
        assert voice_suffix(None) == ""

    def test_unknown_voice_degrades_to_silence(self):
        assert voice_suffix("a-voice-from-a-later-build") == ""
        assert voice_suffix("") == ""

    @pytest.mark.parametrize("voice", [v for v in COACH_VOICES if v != DEFAULT_COACH_VOICE])
    def test_other_voices_only_append(self, voice):
        base = system_prompt_for_language("simple", locale="de")
        with_voice = system_prompt_for_language("simple", locale="de", voice=voice)
        assert with_voice != base
        # The cached prefix must be untouched — a voice may not cost a cold
        # prompt cache on every request.
        assert with_voice.startswith(base[:2000])
        assert len(with_voice) > len(base)

    def test_default_is_byte_identical_to_no_voice(self):
        assert (
            system_prompt_for_language("simple", locale="de", voice=DEFAULT_COACH_VOICE)
            == system_prompt_for_language("simple", locale="de")
        )

    def test_every_voice_has_a_label_and_a_note(self):
        for vid, (label, note, _instruction) in COACH_VOICES.items():
            assert label.strip(), vid
            assert note.strip(), vid


class TestFrontendMirror:
    """The picker's list and the prompt's list are one catalogue."""

    def test_mirror_offers_exactly_the_voices_the_prompt_knows(self):
        if not MIRROR.exists():          # frontend worktree not checked out
            pytest.skip("frontend mirror not present")
        src = MIRROR.read_text()
        ids = set(re.findall(r"id:\s*'([a-z]+)'", src))
        assert ids == set(COACH_VOICES), (
            "w3coachVoices.ts and COACH_VOICES have drifted — the picker would "
            "offer a register the prompt cannot write in."
        )

    def test_mirror_default_matches(self):
        if not MIRROR.exists():
            pytest.skip("frontend mirror not present")
        src = MIRROR.read_text()
        m = re.search(r"DEFAULT_COACH_VOICE = '([a-z]+)'", src)
        assert m and m.group(1) == DEFAULT_COACH_VOICE
