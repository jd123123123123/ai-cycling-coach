"""Reasoning layer — the rule-based brief must explain like a coach, not
report like a system.

User requirement (July 2026 review): "Reasoning should be in a good, very
nice, explainable way — not just numbers." Reviewer evidence this guards
against regressing to:
  - debug fragments in athlete copy ("Phase: offseason. TSB 0, CTL 0.")
  - raw phase codes ("base2", "offseason") instead of humanized labels
  - fabricated signal claims on day-1 accounts (no data → no claims)
  - estimated (self-assessed) fitness framed as measured
  - EN template prose leaking into DE briefs

Matrix: register (guide|numbers|pro) × locale (en|de) × data (full|day-1)
× fitness (measured|estimated).
"""
from __future__ import annotations

import re

import pytest

from app.services.coach_service import (
    _daily_reasoning,
    _detail_register,
    _phase_human,
    _rule_based_brief,
    _signal_state,
)


# ---------------------------------------------------------------------------
# Snapshot fixture with knobs
# ---------------------------------------------------------------------------

def _snapshot(
    *,
    detail_level: str | None = None,
    language: str = "simple",
    locale: str = "en",
    with_data: bool = True,
    ftp: int = 250,
    phase: str = "build2",
    days_to_goal: int | None = 42,
    event_type: str | None = "race",
    ceiling: str = "push",
    picked: str = "vo2_5x4",
    session_type: str = "vo2",
) -> dict:
    if with_data:
        pmc = {"ctl": 60.0, "atl": 55.0, "tsb": 5.0, "ctl_7d_delta": 2.0}
        hrv = {"delta_pct": 1.5, "samples_n": 7, "direction": "stable"}
        acts = {"count": 8, "total_tss": 600.0}
        readiness = {"score": 78, "ceiling": ceiling, "flags": []}
    else:
        pmc = {"ctl": 0.0, "atl": 0.0, "tsb": 0.0, "ctl_7d_delta": 0.0}
        hrv = {"delta_pct": None, "samples_n": 0, "direction": None}
        acts = {"count": 0, "total_tss": 0.0}
        readiness = {"score": None, "ceiling": ceiling, "flags": []}
    return {
        "language": language,
        "ui_locale": locale,
        "athlete": {
            "ftp": ftp,
            "goal_phase": phase,
            "days_to_goal": days_to_goal,
            "goal_event_type": event_type,
            "detail_level": detail_level,
            "injury_flag": False,
        },
        "pmc": pmc,
        "readiness": readiness,
        "biometrics": {
            "hrv": hrv,
            "rhr": {},
            "sleep": {"total_debt_hours": 1.0, "samples_n": 7 if with_data else 0},
        },
        "distribution": {"grey_zone_flag": False},
        "activities_14d": acts,
        "weekly_progress": {},
        "today_session_type": session_type,
        "picked_template_id": picked,
        "rails_context": {
            "ctl": pmc["ctl"], "atl": pmc["atl"], "tsb": pmc["tsb"],
            "hrv_delta_pct": hrv["delta_pct"] or 0.0,
            "injury_flag": False, "days_since_rest": 2,
            "intensity_ceiling": ceiling,
        },
    }


ACRONYMS = ["TSS", "TSB", "CTL", "ATL", "FTP", "HRV", "RPE", "VO2"]
RAW_PHASE_CODES = ["base1", "base2", "build1", "build2", "offseason"]
DEBUG_FRAGMENTS = ["Phase:", "TSB 0, CTL 0", "Ceiling:", "Obergrenze:"]


def _prose(brief: dict) -> tuple[str, str]:
    return brief["rationale"], brief["prescribed_workout"]["why_this_workout"]


# ---------------------------------------------------------------------------
# Register resolution
# ---------------------------------------------------------------------------

class TestRegisterResolution:
    def test_profile_detail_level_wins(self):
        assert _detail_register(_snapshot(detail_level="pro", language="simple")) == "pro"
        assert _detail_register(_snapshot(detail_level="guide", language="technical")) == "guide"

    def test_fallback_maps_language(self):
        assert _detail_register(_snapshot(detail_level=None, language="simple")) == "guide"
        assert _detail_register(_snapshot(detail_level=None, language="technical")) == "pro"

    def test_garbage_detail_level_falls_back(self):
        assert _detail_register(_snapshot(detail_level="expert")) == "guide"


# ---------------------------------------------------------------------------
# Phase humanization — never raw codes
# ---------------------------------------------------------------------------

class TestPhaseHuman:
    def test_mirrors_frontend_phase_label(self):
        assert _phase_human("base2", de=True) == "Grundlage 2"
        assert _phase_human("base2", de=False) == "Base 2"
        assert _phase_human("build1", de=True) == "Aufbau 1"
        assert _phase_human("offseason", de=True) == "Nebensaison"
        assert _phase_human("offseason", de=False) == "Off-season"
        assert _phase_human("maintenance", de=True) == "Erhaltung"

    def test_none_and_unknown(self):
        assert _phase_human(None) is None
        assert _phase_human("") is None
        assert _phase_human("weirdphase") == "Weirdphase"


# ---------------------------------------------------------------------------
# Guide register — plain language, zero acronyms, humanized phases
# ---------------------------------------------------------------------------

class TestGuideRegister:
    @pytest.mark.parametrize("locale", ["en", "de"])
    def test_no_acronyms_or_debug(self, locale):
        brief = _rule_based_brief(_snapshot(detail_level="guide", locale=locale))
        for text in _prose(brief):
            for token in ACRONYMS + DEBUG_FRAGMENTS + RAW_PHASE_CODES:
                assert token not in text, f"guide/{locale} leaked {token!r}: {text!r}"
            assert not re.search(r"\d+\s*%", text), f"guide has raw percents: {text!r}"

    def test_narrative_has_multiple_sentences(self):
        brief = _rule_based_brief(_snapshot(detail_level="guide"))
        rationale, why = _prose(brief)
        assert rationale.count(".") >= 2, rationale
        assert why.count(".") >= 2, why

    def test_de_why_consumes_template_purpose_de(self):
        from app.services.workout_templates import TEMPLATES
        brief = _rule_based_brief(_snapshot(detail_level="guide", locale="de"))
        _, why = _prose(brief)
        assert TEMPLATES["vo2_5x4"].purpose_de in why
        # And never the raw EN purpose
        assert TEMPLATES["vo2_5x4"].purpose not in why

    def test_goal_countdown_in_weeks(self):
        brief = _rule_based_brief(_snapshot(detail_level="guide", locale="de", days_to_goal=42))
        rationale, why = _prose(brief)
        assert "6 Wochen" in rationale and "Rennen" in rationale
        assert "Aufbau 2" in rationale  # humanized, not "build2"


# ---------------------------------------------------------------------------
# Numbers register — numbers embedded in prose, never fragments
# ---------------------------------------------------------------------------

class TestNumbersRegister:
    def test_numbers_woven_into_prose_de(self):
        brief = _rule_based_brief(_snapshot(detail_level="numbers", locale="de"))
        rationale, why = _prose(brief)
        assert "HRV" in rationale and "TSS" in rationale, rationale
        # Numbers appear inside sentences, not as "TSB 0, CTL 0." dumps
        for frag in DEBUG_FRAGMENTS:
            assert frag not in rationale and frag not in why
        # planned TSS is spoken ("rund 97 TSS"), taken from the template
        assert re.search(r"rund \d+ TSS", rationale), rationale

    def test_numbers_woven_into_prose_en(self):
        brief = _rule_based_brief(_snapshot(detail_level="numbers", locale="en"))
        rationale, _ = _prose(brief)
        assert re.search(r"about \d+ TSS", rationale), rationale
        assert "HRV" in rationale


# ---------------------------------------------------------------------------
# Pro register — full evidence chain as flowing prose
# ---------------------------------------------------------------------------

class TestProRegister:
    @pytest.mark.parametrize("locale", ["en", "de"])
    def test_evidence_chain_present(self, locale):
        brief = _rule_based_brief(_snapshot(detail_level="pro", locale=locale))
        rationale, why = _prose(brief)
        assert "Readiness" in rationale
        assert "TSB" in rationale and "CTL" in rationale
        assert "Banister" in rationale  # framework cited in prose
        # Goal countdown + humanized phase (Friel positioning)
        expected_phase = "Aufbau 2" if locale == "de" else "Build 2"
        assert expected_phase in rationale
        for frag in DEBUG_FRAGMENTS + RAW_PHASE_CODES:
            assert frag not in rationale and frag not in why, (
                f"pro/{locale} leaked {frag!r}"
            )

    def test_pro_prose_not_fragment_dump(self):
        """Sentences must carry verbs/clauses — the old 'Phase: offseason.
        TSB 0, CTL 0.' style had none. Heuristic: every sentence longer than
        a fragment, and the text never starts with a bare metric."""
        brief = _rule_based_brief(_snapshot(detail_level="pro", locale="de"))
        rationale, _ = _prose(brief)
        assert not rationale.startswith("Phase")
        assert "—" in rationale  # evidence connected to a conclusion


# ---------------------------------------------------------------------------
# Honesty — day-1 accounts and estimated fitness
# ---------------------------------------------------------------------------

class TestHonestyRules:
    @pytest.mark.parametrize("register", ["guide", "numbers", "pro"])
    def test_day_one_de_no_signal_claims(self, register):
        brief = _rule_based_brief(_snapshot(
            detail_level=register, locale="de", with_data=False,
            phase="base1", days_to_goal=None, event_type=None,
        ))
        rationale, why = _prose(brief)
        combined = f"{rationale} {why}"
        assert "keine Signale" in combined or "Noch keine Datenbasis" in combined, combined
        # No fabricated signal claims
        for lie in ("Erholungswerte liegen", "HRV liegt", "stabil seit gestern",
                    "gut erholt", "Readiness 0"):
            assert lie not in combined, f"day-1 fabrication: {lie!r} in {combined!r}"

    @pytest.mark.parametrize("register", ["guide", "numbers", "pro"])
    def test_day_one_en_no_signal_claims(self, register):
        brief = _rule_based_brief(_snapshot(
            detail_level=register, locale="en", with_data=False,
            phase="base1", days_to_goal=None, event_type=None,
        ))
        rationale, why = _prose(brief)
        combined = f"{rationale} {why}"
        assert "No training signals" in combined or "No data baseline" in combined, combined
        for lie in ("recovery readings", "well rested", "your HRV sits"):
            assert lie not in combined

    def test_estimated_fitness_framed_as_estimated(self):
        brief = _rule_based_brief(_snapshot(
            detail_level="guide", locale="de", with_data=False, ftp=200,
        ))
        combined = " ".join(_prose(brief))
        assert "Selbsteinschätzung geschätzt" in combined
        assert "kalibrieren" in combined

    def test_estimated_fitness_en(self):
        brief = _rule_based_brief(_snapshot(
            detail_level="numbers", locale="en", with_data=False, ftp=200,
        ))
        combined = " ".join(_prose(brief))
        assert "estimated from your self-assessment" in combined

    def test_measured_fitness_not_framed_as_estimated(self):
        brief = _rule_based_brief(_snapshot(detail_level="guide", locale="de", with_data=True))
        combined = " ".join(_prose(brief))
        assert "Selbsteinschätzung" not in combined

    def test_signal_state_flags(self):
        st = _signal_state(_snapshot(with_data=False, ftp=200))
        assert st["day_one"] and st["fitness_estimated"]
        st2 = _signal_state(_snapshot(with_data=True))
        assert not st2["day_one"] and not st2["fitness_estimated"]

    def test_day_one_without_ftp_not_estimated(self):
        st = _signal_state(_snapshot(with_data=False, ftp=0))
        assert st["day_one"] and not st["fitness_estimated"]


# ---------------------------------------------------------------------------
# Injury override still humane, register-aware
# ---------------------------------------------------------------------------

class TestInjuryReasoning:
    def test_injury_copy_de(self):
        snap = _snapshot(detail_level="guide", locale="de", ceiling="rest")
        snap["rails_context"]["injury_flag"] = True
        snap["athlete"]["injury_flag"] = True
        brief = _rule_based_brief(snap)
        assert "Verletzung" in brief["rationale"]
        assert "Pause" in brief["prescribed_workout"]["why_this_workout"]

    def test_injury_pro_mentions_rails(self):
        from app.services.workout_templates import TEMPLATES
        snap = _snapshot(detail_level="pro", locale="en", ceiling="rest")
        rationale, why = _daily_reasoning(
            snap | {"rails_context": {**snap["rails_context"], "injury_flag": True}},
            TEMPLATES["rest_day"], "rest", "pro", de=False,
        )
        assert "Safety rails" in rationale


# ---------------------------------------------------------------------------
# Rest-day narrative — no phantom TSS on a rest prescription
# ---------------------------------------------------------------------------

class TestRestDay:
    def test_rest_day_has_no_planned_tss_claim(self):
        brief = _rule_based_brief(_snapshot(
            detail_level="numbers", locale="de", ceiling="rest",
            picked="rest_day", session_type="rest",
        ))
        rationale, why = _prose(brief)
        assert not re.search(r"rund \d+ TSS", rationale), rationale
        assert not re.search(r"~\d+ TSS", why), why


# ---------------------------------------------------------------------------
# Weekly rationale (DE preface) — humanized, no raw Issurin labels
# ---------------------------------------------------------------------------

class TestWeeklyRationaleDe:
    def test_de_preface_is_prose_not_fragment(self):
        from app.services.weekly_rationale import build_weekly_rationale
        text = build_weekly_rationale(
            phase="base2", block_position="accumulation", block_index_in_meso=1,
            weekly_tss_target=300, ctl_now=45.0, ctl_delta_7d=1.5,
            days_to_event=60, target_event_type="race",
            seiler_z3_pct=0.1, language="simple", locale="de",
        )
        assert "Grundlage 2" in text
        assert "Akkumulation" not in text
        assert "·" not in text  # no chip-style fragments in prose
        assert text.startswith("Du bist in")

    def test_de_preface_offseason_humanized(self):
        from app.services.weekly_rationale import build_weekly_rationale
        text = build_weekly_rationale(
            phase="offseason", block_position="recovery", block_index_in_meso=0,
            weekly_tss_target=120, ctl_now=20.0, ctl_delta_7d=-0.2,
            days_to_event=None, target_event_type=None,
            seiler_z3_pct=0.05, language="simple", locale="de",
        )
        assert "Nebensaison" in text
        assert "offseason" not in text.lower().replace("nebensaison", "")
