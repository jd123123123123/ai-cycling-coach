"""Tests for the weekly-plan LLM layer + plan-change explainer.

The LLM path itself can't be exercised without an API key — that's fine. What
MUST hold with or without a key:
  1. `enforce_week_rails` re-imposes every safety invariant server-side
     (rest days stay rest, template whitelist, duration clamp, weekly TSS cap).
  2. `personalize_week` returns None (→ deterministic fallback) with no key.
  3. `detect_plan_changes` / `explain_plan_changes` correctly flag + narrate
     skipped / under / over training.
"""
from __future__ import annotations

import asyncio
from datetime import date

from app.config import settings
from app.services.plan_change_explainer import (
    detect_plan_changes,
    explain_plan_changes,
)
from app.services.weekly_plan_llm import enforce_week_rails, personalize_week
from app.services.workout_templates import TEMPLATES


FTP = 250

# The fixture dates below live in the week of Mon 2026-07-13. Detection tests
# pin `week_start` to that Monday so the stale-week guard (audit P0-2: drop
# deviations from before the current athlete-local week) doesn't discard them
# as the real calendar moves on.
WEEK_START = date(2026, 7, 13)


def _skeleton() -> list[dict]:
    """A representative deterministic week: 2 rest days + 5 training days."""
    return [
        {"dow": 0, "date": "2026-07-13", "is_rest": True, "session_type": "rest",
         "category": "rest", "template_id": "rest_day", "title": "Rest day",
         "rationale": "Rest.", "target_tss": 0, "duration_minutes": 0,
         "available_templates": ["rest_day"]},
        {"dow": 1, "date": "2026-07-14", "is_rest": False, "session_type": "endurance",
         "category": "endurance", "template_id": "z2_endurance_90", "title": "Endurance",
         "rationale": "Base.", "target_tss": 68, "duration_minutes": 90,
         "available_templates": ["z2_endurance_90", "z2_endurance_60", "z2_progressive_90"]},
        {"dow": 2, "date": "2026-07-15", "is_rest": False, "session_type": "threshold",
         "category": "threshold", "template_id": "threshold_2x15", "title": "Threshold",
         "rationale": "Quality.", "target_tss": 78, "duration_minutes": 70,
         "available_templates": ["threshold_2x15", "threshold_seiler_4x8", "over_under_3x5"]},
        {"dow": 3, "date": "2026-07-16", "is_rest": True, "session_type": "rest",
         "category": "rest", "template_id": "rest_day", "title": "Rest day",
         "rationale": "Rest.", "target_tss": 0, "duration_minutes": 0,
         "available_templates": ["rest_day"]},
        {"dow": 4, "date": "2026-07-17", "is_rest": False, "session_type": "endurance",
         "category": "endurance", "template_id": "z2_endurance_60", "title": "Endurance",
         "rationale": "Base.", "target_tss": 45, "duration_minutes": 60,
         "available_templates": ["z2_endurance_90", "z2_endurance_60"]},
        {"dow": 5, "date": "2026-07-18", "is_rest": False, "session_type": "endurance",
         "category": "endurance", "template_id": "z2_endurance_90", "title": "Endurance",
         "rationale": "Base.", "target_tss": 68, "duration_minutes": 90,
         "available_templates": ["z2_endurance_90", "z2_endurance_60"]},
        {"dow": 6, "date": "2026-07-19", "is_rest": False, "session_type": "endurance",
         "category": "endurance", "template_id": "z2_long_120", "title": "Long ride",
         "rationale": "Long.", "target_tss": 90, "duration_minutes": 120,
         "available_templates": ["z2_long_120", "z2_long_180"]},
    ]


# ── Rail: rest days stay rest ────────────────────────────────────────────────

def test_rest_days_stay_rest_even_if_llm_prescribes_a_workout():
    sk = _skeleton()
    # LLM tries to turn BOTH rest days into hard workouts.
    llm = {
        "weekly_narrative": "Let's crush it.",
        "days": [
            {"dow": 0, "is_rest": False, "template_id": "vo2_5x4", "title": "VO2",
             "rationale": "go hard", "duration_minutes": 60},
            {"dow": 3, "is_rest": False, "template_id": "threshold_2x15", "title": "Th",
             "rationale": "go hard", "duration_minutes": 70},
        ],
    }
    out = enforce_week_rails(sk, llm, ftp=FTP, weekly_tss_target=350)
    rest_days = [d for d in out["days"] if d["dow"] in (0, 3)]
    assert len(rest_days) == 2
    for d in rest_days:
        assert d["is_rest"] is True
        assert d["template_id"] == "rest_day"
        assert d["target_tss"] == 0


# ── Rail: template whitelist ─────────────────────────────────────────────────

def test_invalid_template_id_falls_back_to_skeleton_pick():
    sk = _skeleton()
    llm = {
        "weekly_narrative": "n",
        "days": [
            # Invented id + an id not offered on this day → both must fall back.
            {"dow": 1, "is_rest": False, "template_id": "totally_made_up",
             "title": "x", "rationale": "y", "duration_minutes": 90},
            {"dow": 2, "is_rest": False, "template_id": "vo2_5x4",  # not in day 2 list
             "title": "x", "rationale": "y", "duration_minutes": 70},
        ],
    }
    out = enforce_week_rails(sk, llm, ftp=FTP, weekly_tss_target=350)
    by_dow = {d["dow"]: d for d in out["days"]}
    assert by_dow[1]["template_id"] == "z2_endurance_90"   # skeleton pick
    assert by_dow[2]["template_id"] == "threshold_2x15"    # skeleton pick


def test_valid_alternate_template_is_honoured():
    sk = _skeleton()
    llm = {
        "weekly_narrative": "n",
        "days": [
            {"dow": 2, "is_rest": False, "template_id": "threshold_seiler_4x8",
             "title": "Norwegian 4x8", "rationale": "you're fresh", "duration_minutes": 70},
        ],
    }
    out = enforce_week_rails(sk, llm, ftp=FTP, weekly_tss_target=350)
    by_dow = {d["dow"]: d for d in out["days"]}
    assert by_dow[2]["template_id"] == "threshold_seiler_4x8"
    assert by_dow[2]["title"] == "Norwegian 4x8"


# ── Rail: weekly TSS cap ─────────────────────────────────────────────────────

def test_weekly_tss_clamped_to_110pct_of_target():
    sk = _skeleton()
    # The deterministic skeleton's own natural TSS (empty LLM payload) — the
    # generator keeps this within the target, so use it as a realistic target.
    natural = sum(
        int(d["target_tss"] or 0)
        for d in enforce_week_rails(sk, {"days": []}, ftp=FTP, weekly_tss_target=10_000)["days"]
    )
    target = natural  # cap = 110% of the skeleton's own load

    # LLM inflates every training day's duration massively.
    llm = {
        "weekly_narrative": "big week",
        "days": [
            {"dow": d["dow"], "is_rest": d["is_rest"],
             "template_id": d["template_id"], "title": "x", "rationale": "y",
             "duration_minutes": (d["duration_minutes"] or 0) * 3}
            for d in sk
        ],
    }
    uncapped = sum(
        int(d["target_tss"] or 0)
        for d in enforce_week_rails(sk, llm, ftp=FTP, weekly_tss_target=10_000)["days"]
    )
    out = enforce_week_rails(sk, llm, ftp=FTP, weekly_tss_target=target)
    total = sum(int(d["target_tss"] or 0) for d in out["days"])
    assert total <= target * 1.10 + 2      # ≤110% of target (+rounding slack)
    assert total < uncapped                 # the cap actually trimmed the week


def test_rest_days_present_after_enforcement():
    """The deterministic-fallback sim: a week built WITHOUT the LLM path still
    yields real rest days and a capped TSS. Pass an empty LLM payload → every
    field falls back to the skeleton."""
    sk = _skeleton()
    out = enforce_week_rails(sk, {"days": []}, ftp=FTP, weekly_tss_target=350)
    rest = [d for d in out["days"] if d["is_rest"]]
    assert len(rest) == 2
    assert all(d["template_id"] == "rest_day" for d in rest)
    total = sum(int(d["target_tss"] or 0) for d in out["days"])
    assert total <= 350 * 1.10 + 1


# ── personalize_week gated on API key ────────────────────────────────────────

def test_personalize_week_returns_none_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "")
    result = asyncio.run(
        personalize_week(_skeleton(), {"athlete": {"ftp": FTP}}, weekly_tss_target=350)
    )
    assert result is None


# ── Change detection ─────────────────────────────────────────────────────────

def test_detect_skipped_training_day():
    planned = [
        {"date": "2026-07-14", "dow": 1, "category": "threshold", "planned_tss": 78.0},
        {"date": "2026-07-15", "dow": 2, "category": "endurance", "planned_tss": 68.0},
    ]
    actual = {"2026-07-15": 70.0}  # Tuesday threshold skipped
    det = detect_plan_changes(planned, actual, week_start=WEEK_START)
    types = {c["type"] for c in det["changes"]}
    assert "skipped" in types
    skip = next(c for c in det["changes"] if c["type"] == "skipped")
    assert skip["dow"] == 1


def test_detect_overtrained_via_acwr_and_volume():
    planned = [{"date": "2026-07-14", "dow": 1, "category": "endurance", "planned_tss": 100.0}]
    actual = {"2026-07-14": 200.0}
    det = detect_plan_changes(planned, actual, acwr=1.6, week_start=WEEK_START)
    assert any(c["type"] == "overtrained" for c in det["changes"])


def test_detect_undertrained():
    planned = [
        {"date": "2026-07-14", "dow": 1, "category": "endurance", "planned_tss": 100.0},
        {"date": "2026-07-15", "dow": 2, "category": "endurance", "planned_tss": 100.0},
    ]
    actual = {"2026-07-14": 40.0}  # 40 of 200 planned = 20%
    det = detect_plan_changes(planned, actual, week_start=WEEK_START)
    assert any(c["type"] == "undertrained" for c in det["changes"])


def test_explain_skipped_is_localized_and_names_the_day():
    planned = [{"date": "2026-07-14", "dow": 1, "category": "threshold", "planned_tss": 78.0}]
    det = detect_plan_changes(planned, {}, week_start=WEEK_START)
    en = explain_plan_changes(det, current_skeleton=_skeleton(), weekly_tss_target=350)
    assert en is not None and en["status"] == "skipped"
    assert "Tuesday" in en["message"]
    de = explain_plan_changes(det, current_skeleton=_skeleton(), weekly_tss_target=350, de=True)
    assert "Dienstag" in de["message"]


def test_explain_returns_none_when_on_track():
    planned = [{"date": "2026-07-14", "dow": 1, "category": "endurance", "planned_tss": 68.0}]
    det = detect_plan_changes(planned, {"2026-07-14": 66.0}, week_start=WEEK_START)
    assert explain_plan_changes(det) is None


def test_last_weeks_skip_dropped_on_fresh_monday():
    """Stale-week guard (audit P0-2): a skipped Tuesday from LAST week must
    not render as a deviation once the athlete-local week has rolled over —
    a fresh Monday starts clean even if the caller's window leaks old days."""
    planned = [
        # Last week's skipped threshold day.
        {"date": "2026-07-14", "dow": 1, "category": "threshold", "planned_tss": 78.0},
        # This week's Monday, trained as planned.
        {"date": "2026-07-20", "dow": 0, "category": "endurance", "planned_tss": 68.0},
    ]
    actual = {"2026-07-20": 66.0}
    det = detect_plan_changes(planned, actual, week_start=date(2026, 7, 20))
    assert det["changes"] == []
    # The stale day must not pollute the week totals either.
    assert det["planned_week_tss"] == 68.0
    assert det["actual_week_tss"] == 66.0
    assert explain_plan_changes(det) is None
