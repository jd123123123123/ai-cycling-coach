"""Tests for the plan-import service (extract → sanitize → adapt → apply).

The LLM path is mocked — what MUST hold without a key:
  1. `sanitize_extracted_plan` never trusts the extraction: durations clamped
     to 10–480 min, at most 16 weeks, invalid days/weeks dropped, one entry
     per weekday.
  2. `map_intensity_to_zone` regex heuristics land the documented keywords on
     the right zones (threshold/FTP/sweet spot/VO2/tempo/easy/recovery/long).
  3. `adapt_plan` is deterministic: proportional squeeze into
     weekly_hours_available, age>=50 masters cap of 2 hard days/week, watts
     from FTP for bike zones / pace bands for runs, honest None without data.
  4. `sanitize_adapted_plan` + `build_interval_structure` re-derive every
     number server-side — client watts are ignored.
  5. `extract_plan_from_file` returns None without a key and parses a mocked
     Claude tool_use response with one.
"""
from __future__ import annotations

from datetime import date
from types import SimpleNamespace

import pytest

from app.config import settings
from app.services import plan_import
from app.services.plan_import import (
    MAX_DURATION_MIN,
    MAX_WEEKS,
    MIN_DURATION_MIN,
    ZONES,
    adapt_plan,
    apply_plan,
    build_interval_structure,
    extract_plan_from_file,
    map_intensity_to_zone,
    sanitize_adapted_plan,
    sanitize_extracted_plan,
)


# ── Fixture: a realistic (and partly junky) raw extraction ───────────────────

def _raw_extraction() -> dict:
    return {
        "plan_name": "12-Week Gran Fondo Builder",
        "weeks": [
            {
                "week_number": 1,
                "days": [
                    {"dow": 0, "title": "Rest day", "intensity": "Ruhetag"},
                    {"dow": 1, "sport": "bike", "title": "Threshold intervals",
                     "duration_min": 75, "intensity": "2x20min @ FTP",
                     "structure": "2x20min at threshold, 10min recovery"},
                    {"dow": 2, "sport": "run", "title": "Easy run",
                     "duration_min": 45, "intensity": "easy aerobic"},
                    {"dow": 3, "title": "Sweet spot", "duration_min": 60,
                     "intensity": "3x15 sweet spot"},
                    {"dow": 5, "title": "VO2 blocks", "duration_min": 60,
                     "intensity": "5x4min VO2max"},
                    {"dow": 6, "title": "Long ride", "duration_min": 240,
                     "intensity": "long endurance"},
                ],
            },
        ],
    }


# ── sanitize_extracted_plan ──────────────────────────────────────────────────

def test_sanitize_keeps_valid_days_and_orders_by_dow():
    out = sanitize_extracted_plan(_raw_extraction())
    assert out["plan_name"] == "12-Week Gran Fondo Builder"
    assert len(out["weeks"]) == 1
    days = out["weeks"][0]["days"]
    assert [d["dow"] for d in days] == [0, 1, 2, 3, 5, 6]
    assert days[1]["sport"] == "cycling"   # "bike" normalized
    assert days[2]["sport"] == "running"   # "run" normalized


def test_sanitize_clamps_durations_and_drops_garbage():
    raw = {
        "weeks": [
            {"days": [
                {"dow": 0, "title": "Mega ride", "intensity": "endurance", "duration_min": 9999},
                {"dow": 1, "title": "Micro", "intensity": "easy", "duration_min": 2},
                {"dow": 2, "title": "Bad duration", "intensity": "easy", "duration_min": "not a number"},
                {"dow": 99, "title": "Bad dow", "intensity": "easy"},
                {"dow": 0, "title": "Duplicate dow", "intensity": "easy"},
                "not a dict",
                {"dow": 3},  # no title, no intensity → dropped
            ]},
            "not a week",
            {"days": "not a list"},
        ],
    }
    out = sanitize_extracted_plan(raw)
    assert len(out["weeks"]) == 1
    days = out["weeks"][0]["days"]
    assert [d["dow"] for d in days] == [0, 1, 2]
    assert days[0]["duration_min"] == MAX_DURATION_MIN
    assert days[1]["duration_min"] == MIN_DURATION_MIN
    assert days[2]["duration_min"] is None  # unparseable → honest None


def test_sanitize_caps_at_16_weeks():
    week = {"days": [{"dow": 0, "title": "Ride", "intensity": "endurance"}]}
    out = sanitize_extracted_plan({"weeks": [week] * 30})
    assert len(out["weeks"]) == MAX_WEEKS


def test_sanitize_non_dict_input_is_empty():
    assert sanitize_extracted_plan(None) == {"plan_name": None, "weeks": []}
    assert sanitize_extracted_plan([1, 2, 3])["weeks"] == []
    assert sanitize_extracted_plan({"weeks": "nope"})["weeks"] == []


# ── map_intensity_to_zone ────────────────────────────────────────────────────

@pytest.mark.parametrize("text,zone", [
    ("Ruhetag", 0),
    ("rest", 0),
    ("active recovery spin", 1),
    ("recovery", 1),
    ("easy aerobic", 2),
    ("long endurance", 2),
    ("Grundlagenausdauer GA1", 2),
    ("steady base miles", 2),
    ("tempo effort", 3),
    ("3x15 sweet spot", 3),
    ("SST", 3),
    ("2x20min @ FTP", 4),
    ("threshold intervals", 4),
    ("Schwellentraining", 4),
    ("over-under 3x9", 4),
    ("5x4min VO2max", 5),
    ("HIIT session", 5),
    ("sprint work", 6),
    ("anaerobic capacity", 6),
    ("mystery session", 2),  # unknown → safest default
])
def test_map_intensity_to_zone(text: str, zone: int):
    assert map_intensity_to_zone(text) == zone


def test_zone_mapping_uses_title_and_structure_context():
    assert map_intensity_to_zone("", title="FTP builder") == 4
    assert map_intensity_to_zone("", structure="4x8min VO2") == 5


# ── adapt_plan: targets from FTP / pace ──────────────────────────────────────

def test_adapt_attaches_watts_from_ftp_for_bike_zones():
    out = adapt_plan(sanitize_extracted_plan(_raw_extraction()), ftp_watts=250)
    days = {d["dow"]: d for d in out["weeks"][0]["days"]}
    threshold = days[1]
    assert threshold["zone"] == 4
    assert threshold["target_watts_low"] == round(250 * ZONES[4]["low_pct"])
    assert threshold["target_watts_high"] == round(250 * ZONES[4]["high_pct"])
    # rest day gets no targets
    assert days[0]["is_rest"] is True
    assert days[0]["target_watts_low"] is None


def test_adapt_without_ftp_is_honest_none():
    out = adapt_plan(sanitize_extracted_plan(_raw_extraction()), ftp_watts=None)
    for day in out["weeks"][0]["days"]:
        assert day["target_watts_low"] is None
        assert day["target_watts_high"] is None
    assert out["athlete"]["ftp_watts"] is None


def test_adapt_attaches_pace_band_for_runs():
    out = adapt_plan(
        sanitize_extracted_plan(_raw_extraction()),
        ftp_watts=250,
        running_threshold_pace_ms=3.33,  # ≈ 5:00 /km threshold
    )
    run = next(d for d in out["weeks"][0]["days"] if d["sport"] == "running")
    assert run["zone"] == 2
    assert run["target_pace"] is not None
    assert "/km" in run["target_pace"]
    assert run["target_watts_low"] is None  # runs never get watts


def test_adapt_without_threshold_pace_run_target_is_none():
    out = adapt_plan(sanitize_extracted_plan(_raw_extraction()))
    run = next(d for d in out["weeks"][0]["days"] if d["sport"] == "running")
    assert run["target_pace"] is None


# ── adapt_plan: proportional squeeze into weekly availability ────────────────

def test_adapt_squeezes_week_that_exceeds_availability():
    # 75 + 45 + 60 + 60 + 240 = 480 planned minutes = 8h; athlete has 6h.
    out = adapt_plan(sanitize_extracted_plan(_raw_extraction()), weekly_hours_available=6.0)
    week = out["weeks"][0]
    assert week["planned_minutes"] <= 6 * 60 + len(week["days"])  # rounding slack
    assert week["scale_pct"] == 75
    long_ride = next(d for d in week["days"] if d["dow"] == 6)
    assert long_ride["duration_min"] == 180  # 240 × 0.75
    assert any(a["type"] == "squeezed_to_availability" for a in long_ride["adjustments"])
    assert any(a.get("from_min") == 240 for a in long_ride["adjustments"])


def test_adapt_leaves_week_alone_when_it_fits():
    out = adapt_plan(sanitize_extracted_plan(_raw_extraction()), weekly_hours_available=12.0)
    week = out["weeks"][0]
    assert week["scale_pct"] == 100
    assert all(not d["adjustments"] for d in week["days"])


def test_adapt_squeeze_never_goes_below_min_duration():
    raw = {"weeks": [{"days": [
        {"dow": 0, "title": "Short", "intensity": "endurance", "duration_min": 12},
        {"dow": 1, "title": "Huge", "intensity": "endurance", "duration_min": 480},
    ]}]}
    out = adapt_plan(sanitize_extracted_plan(raw), weekly_hours_available=1.0)
    days = out["weeks"][0]["days"]
    assert all(d["duration_min"] >= MIN_DURATION_MIN for d in days)


# ── adapt_plan: masters (age >= 50) hard-day cap ─────────────────────────────

def _three_hard_days_raw() -> dict:
    return {"weeks": [{"days": [
        {"dow": 1, "title": "Threshold", "intensity": "2x20 FTP", "duration_min": 60},
        {"dow": 3, "title": "VO2", "intensity": "5x4 VO2max", "duration_min": 60},
        {"dow": 5, "title": "More threshold", "intensity": "threshold", "duration_min": 60},
        {"dow": 6, "title": "Long", "intensity": "long endurance", "duration_min": 180},
    ]}]}


def test_masters_athlete_capped_at_two_hard_days():
    out = adapt_plan(
        sanitize_extracted_plan(_three_hard_days_raw()),
        ftp_watts=250,
        date_of_birth="1970-01-01",  # 50+ regardless of run date
    )
    days = out["weeks"][0]["days"]
    hard = [d for d in days if d["zone"] >= 4]
    assert len(hard) == 2
    demoted = next(d for d in days if d["dow"] == 5)
    assert demoted["zone"] == 2
    assert any(a["type"] == "masters_hard_day_eased" for a in demoted["adjustments"])
    # demoted day's watts follow the NEW zone
    assert demoted["target_watts_high"] == round(250 * ZONES[2]["high_pct"])
    assert out["athlete"]["masters_rule_applied"] is True


def test_young_athlete_keeps_all_hard_days():
    out = adapt_plan(
        sanitize_extracted_plan(_three_hard_days_raw()),
        date_of_birth="2000-06-15",
    )
    days = out["weeks"][0]["days"]
    assert len([d for d in days if d["zone"] >= 4]) == 3
    assert out["athlete"]["masters_rule_applied"] is False


def test_unknown_dob_never_applies_masters_rule():
    out = adapt_plan(sanitize_extracted_plan(_three_hard_days_raw()), date_of_birth="garbage")
    assert out["athlete"]["masters_rule_applied"] is False
    assert len([d for d in out["weeks"][0]["days"] if d["zone"] >= 4]) == 3


# ── sanitize_adapted_plan + build_interval_structure (the /apply rails) ──────

def test_sanitize_adapted_plan_ignores_client_watts_and_clamps():
    client_plan = {"weeks": [{"days": [
        {"dow": 1, "sport": "cycling", "title": "Threshold", "zone": 4,
         "duration_min": 10_000, "intensity_raw": "2x20 FTP",
         "target_watts_low": 9999, "target_watts_high": 9999},
        {"dow": 2, "sport": "cycling", "title": "Weird zone", "zone": 42,
         "duration_min": 60, "intensity_raw": "x"},
        {"dow": 0, "zone": 0, "title": "", "intensity_raw": ""},  # rest survives
    ]}]}
    out = sanitize_adapted_plan(client_plan)
    days = {d["dow"]: d for d in out["weeks"][0]["days"]}
    assert days[1]["duration_min"] == MAX_DURATION_MIN
    assert "target_watts_low" not in days[1]  # client watts never survive
    assert days[2]["zone"] == 6               # clamped into 0..6
    assert days[0]["zone"] == 0


def test_build_interval_structure_derives_pct_from_zone_midband():
    st = build_interval_structure(4, 60, "cycling")
    assert st is not None
    block = st["intervals"][0]
    assert block["duration_seconds"] == 3600
    assert block["zone"] == 4
    expected_mid = round((ZONES[4]["low_pct"] + ZONES[4]["high_pct"]) / 2, 3)
    assert block["power_target_pct_ftp"] == expected_mid


def test_build_interval_structure_none_for_rest_or_missing_duration():
    assert build_interval_structure(0, 60, "cycling") is None
    assert build_interval_structure(2, None, "cycling") is None


def test_build_interval_structure_run_has_no_power_target():
    st = build_interval_structure(2, 45, "running")
    assert st is not None
    assert st["intervals"][0]["power_target_pct_ftp"] is None


# ── apply_plan: replaces only FUTURE rows on covered dates ───────────────────

class _FakeResult:
    def __init__(self, rows: list):
        self._rows = rows

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._rows))


class _FakeSession:
    """Just enough AsyncSession surface for apply_plan (execute/delete/add/flush)."""

    def __init__(self, existing_by_date: dict[date, list]):
        self.existing_by_date = existing_by_date
        self.added: list = []
        self.deleted: list = []

    async def execute(self, stmt):
        target = None
        for crit in stmt._where_criteria:  # find the date literal in the WHERE
            val = getattr(getattr(crit, "right", None), "value", None)
            if isinstance(val, date):
                target = val
        return _FakeResult(self.existing_by_date.get(target, []))

    async def delete(self, obj):
        self.deleted.append(obj)

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass


async def test_apply_plan_replaces_only_future_rows():
    start_monday = date(2026, 7, 20)          # a Monday
    today = date(2026, 7, 22)                 # Wednesday — Mon/Tue are the past
    plan = {"weeks": [{"days": [
        {"dow": 0, "sport": "cycling", "title": "Past ride", "zone": 2,
         "duration_min": 60, "intensity_raw": "endurance"},          # Mon 20th — past
        {"dow": 3, "sport": "cycling", "title": "Threshold", "zone": 4,
         "duration_min": 60, "intensity_raw": "2x20 FTP"},           # Thu 23rd — future
        {"dow": 4, "sport": "cycling", "title": "Rest", "zone": 0,
         "duration_min": None, "intensity_raw": "Ruhetag"},          # Fri 24th — rest
    ]}]}
    past_row = SimpleNamespace(id=1)
    future_row = SimpleNamespace(id=2)
    rest_day_row = SimpleNamespace(id=3)
    db = _FakeSession({
        date(2026, 7, 20): [past_row],
        date(2026, 7, 23): [future_row],
        date(2026, 7, 24): [rest_day_row],
    })

    result = await apply_plan(db, user_id=5, plan=plan, start_monday=start_monday, today=today)

    # Past Monday untouched; future Thursday replaced; rest Friday cleared.
    assert past_row not in db.deleted
    assert future_row in db.deleted
    assert rest_day_row in db.deleted
    assert result["replaced"] == 2
    # Only the future non-rest day produced a row.
    assert result["created"] == 1
    pw = db.added[0]
    assert pw.date == date(2026, 7, 23)
    assert pw.blocks_source == "user_plan"
    assert pw.duration_seconds_target == 3600
    assert pw.interval_structure["intervals"][0]["zone"] == 4
    # power pct is the server-side zone mid-band — never a client number
    expected_mid = round((ZONES[4]["low_pct"] + ZONES[4]["high_pct"]) / 2, 3)
    assert pw.interval_structure["intervals"][0]["power_target_pct_ftp"] == expected_mid


# ── extract_plan_from_file (LLM mocked) ──────────────────────────────────────

async def test_extract_returns_none_without_api_key(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", None)
    assert await extract_plan_from_file(b"%PDF-1.4 fake", "application/pdf") is None


async def test_extract_parses_mocked_tool_use_response(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    captured: dict = {}

    class FakeMessages:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(content=[
                SimpleNamespace(type="text", text="ignored"),
                SimpleNamespace(
                    type="tool_use",
                    name="record_extracted_plan",
                    input=_raw_extraction(),
                ),
            ])

    monkeypatch.setattr(
        plan_import, "_get_anthropic_client",
        lambda: SimpleNamespace(messages=FakeMessages()),
    )

    raw = await extract_plan_from_file(b"%PDF-1.4 fake", "application/pdf")
    assert raw is not None
    assert raw["plan_name"] == "12-Week Gran Fondo Builder"
    # PDF goes through the document content block; forced tool choice
    block = captured["messages"][0]["content"][0]
    assert block["type"] == "document"
    assert block["source"]["media_type"] == "application/pdf"
    assert captured["tool_choice"] == {"type": "tool", "name": "record_extracted_plan"}


async def test_extract_uses_image_block_for_png(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")
    captured: dict = {}

    class FakeMessages:
        async def create(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(content=[SimpleNamespace(
                type="tool_use", name="record_extracted_plan", input={"weeks": []},
            )])

    monkeypatch.setattr(
        plan_import, "_get_anthropic_client",
        lambda: SimpleNamespace(messages=FakeMessages()),
    )

    raw = await extract_plan_from_file(b"\x89PNG fake", "image/png")
    assert raw == {"weeks": []}
    block = captured["messages"][0]["content"][0]
    assert block["type"] == "image"
    assert block["source"]["media_type"] == "image/png"


async def test_extract_swallows_llm_failure(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")

    class ExplodingMessages:
        async def create(self, **kwargs):
            raise RuntimeError("boom")

    monkeypatch.setattr(
        plan_import, "_get_anthropic_client",
        lambda: SimpleNamespace(messages=ExplodingMessages()),
    )
    assert await extract_plan_from_file(b"data", "image/jpeg") is None


# ── end-to-end pure pipeline (mocked extraction → sanitize → adapt) ──────────

async def test_full_pipeline_with_mocked_llm(monkeypatch):
    monkeypatch.setattr(settings, "ANTHROPIC_API_KEY", "test-key")

    class FakeMessages:
        async def create(self, **kwargs):
            return SimpleNamespace(content=[SimpleNamespace(
                type="tool_use", name="record_extracted_plan", input=_raw_extraction(),
            )])

    monkeypatch.setattr(
        plan_import, "_get_anthropic_client",
        lambda: SimpleNamespace(messages=FakeMessages()),
    )

    raw = await extract_plan_from_file(b"%PDF", "application/pdf")
    adapted = adapt_plan(
        sanitize_extracted_plan(raw),
        ftp_watts=280,
        weekly_hours_available=6.0,
        date_of_birth="1968-03-02",
    )
    week = adapted["weeks"][0]
    # masters cap held: FTP day + sweet-spot(3, not hard) + VO2 day are the
    # hard candidates → only 2 of {threshold(4), vo2(5)} exist, both survive
    assert len([d for d in week["days"] if d["zone"] >= 4]) <= 2
    # squeeze applied (480 min plan into 360 min budget)
    assert week["scale_pct"] < 100
    # every non-rest bike day carries FTP-derived watts
    for d in week["days"]:
        if not d["is_rest"] and d["sport"] == "cycling":
            assert d["target_watts_low"] is not None
