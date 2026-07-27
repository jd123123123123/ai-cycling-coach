from app.services.adaptive_readiness import assess_adaptation


def _base(**kw):
    d = dict(hrv_recent=4.0, hrv_baseline=4.0, hrv_sd=0.2, hrv_below_days=0,
             tsb=-5.0, decoupling_delta=0.0, sleep_score=80.0, load_ramp=1.0)
    d.update(kw)
    return assess_adaptation(**d)


def test_escalates_when_in_band_and_durability_improving():
    d = _base(hrv_recent=4.05, decoupling_delta=-2.0)  # in band, decoupling down
    assert d.directive == "escalate"
    assert d.intensity_ceiling == "push"
    assert d.volume_modifier > 1.0
    assert any(s.evidence == "RCT" for s in d.signals)


def test_deloads_when_hrv_below_band_multiple_days():
    d = _base(hrv_recent=3.5, hrv_below_days=2)  # well below band, 2 days
    assert d.directive == "deload"
    assert d.intensity_ceiling == "easy"
    assert d.volume_modifier < 0.7


def test_holds_when_hrv_below_band_single_day():
    d = _base(hrv_recent=3.5, hrv_below_days=1)
    assert d.directive == "hold"
    assert d.intensity_ceiling == "easy"


def test_ramp_guardrail_downgrades_escalate_to_push():
    d = _base(hrv_recent=4.05, decoupling_delta=-2.0, load_ramp=1.7)
    assert d.directive == "push"  # escalate downgraded, not blocked
    assert any(s.evidence == "guardrail" for s in d.signals)


def test_no_hrv_falls_back_to_tsb():
    d = _base(hrv_recent=None, hrv_baseline=None, hrv_sd=None, tsb=-30.0)
    assert d.hrv_state == "unknown"
    assert d.directive == "hold"


# ─── Athlete-status override (roadmap P0.2) ─────────────────────────────────
# Self-reported sick/injured forces rest; break forces deload — before any
# physiological signal is read.

import pytest as _pytest
from unittest.mock import AsyncMock as _AsyncMock, MagicMock as _MagicMock

from app.services.adaptive_readiness import build_adaptive_directive as _badir


def _status_db(goals):
    db = _MagicMock()

    async def execute(stmt):  # noqa: ANN001
        result = _MagicMock()
        result.scalar_one_or_none.return_value = goals
        return result

    db.execute = _AsyncMock(side_effect=execute)
    return db


@_pytest.mark.asyncio
@_pytest.mark.parametrize("state,expected", [("sick", "rest"), ("injured", "rest"), ("break", "deload")])
async def test_status_overrides_directive(state, expected):
    db = _status_db({"athlete_status": {"state": state, "since": "2026-07-15"}})
    d = await _badir(db, 1)
    assert d.directive == expected
    assert db.execute.await_count == 1  # short-circuits before HRV queries


# ─── Day gates (usability audit P0-3) ───────────────────────────────────────
# On a planned rest day — or once today's session is already done — the
# directive must never headline 'Grünes Licht — belaste hart.' / 'Voll
# draufhalten'. Rest day → 'Grünes Licht für morgen' (directive 'hold');
# already trained → recovery-oriented headline.

from app.services.adaptive_readiness import Directive as _Directive, _apply_day_gates
from app.services.daily_decision import TodayContext as _TodayContext


def _gate_db():
    db = _MagicMock()

    async def execute(stmt):  # noqa: ANN001
        result = _MagicMock()
        result.scalar_one_or_none.return_value = None
        return result

    db.execute = _AsyncMock(side_effect=execute)
    return db


def _push_directive(lang="de"):
    return _Directive(
        directive="push", intensity_ceiling="hard", volume_modifier=1.0,
        hrv_state="in",
        headline="Grünes Licht — belaste hart." if lang == "de" else "Green light — load hard.",
    )


@_pytest.mark.asyncio
async def test_planned_rest_day_rewrites_push_headline(monkeypatch):
    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext(planned_is_rest=True)

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)
    d = await _apply_day_gates(_gate_db(), 1, _push_directive("de"), "de")
    assert d.headline == "Grünes Licht für morgen"
    assert d.directive == "hold"
    assert "belaste hart" not in d.headline.lower()


@_pytest.mark.asyncio
async def test_planned_rest_day_english_headline(monkeypatch):
    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext(planned_is_rest=True)

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)
    d = await _apply_day_gates(_gate_db(), 1, _push_directive("en"), "en")
    assert d.headline == "Green light for tomorrow"
    assert d.directive == "hold"


@_pytest.mark.asyncio
async def test_already_trained_rewrites_to_recovery(monkeypatch):
    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext(
            planned={"sport": "cycling", "title": "Z2", "template_id": "z2_endurance_60",
                     "target_tss": 45.0, "duration_minutes": 60, "category": "endurance"},
            activities=[{"sport": "cycling", "duration_minutes": 62, "tss": 48}],
        )

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)
    d = await _apply_day_gates(_gate_db(), 1, _push_directive("de"), "de")
    assert d.directive == "hold"
    assert d.intensity_ceiling == "easy"
    assert "Erholung" in d.headline
    assert "belaste hart" not in d.headline.lower()


@_pytest.mark.asyncio
async def test_training_day_keeps_push_headline(monkeypatch):
    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext(
            planned={"sport": "cycling", "title": "SS", "template_id": "sweet_spot_2x20",
                     "target_tss": 68.0, "duration_minutes": 75, "category": "sweet_spot"},
            activities=[],
        )

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)
    d = await _apply_day_gates(_gate_db(), 1, _push_directive("de"), "de")
    assert d.directive == "push"
    assert d.headline == "Grünes Licht — belaste hart."


@_pytest.mark.asyncio
async def test_gym_on_bike_day_does_not_mute_directive(monkeypatch):
    """A 58-min gym log with the bike session still open keeps the push."""
    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext(
            planned={"sport": "cycling", "title": "SS", "template_id": "sweet_spot_2x20",
                     "target_tss": 68.0, "duration_minutes": 75, "category": "sweet_spot"},
            activities=[{"sport": "gym", "duration_minutes": 58, "tss": 25}],
        )

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)
    d = await _apply_day_gates(_gate_db(), 1, _push_directive("de"), "de")
    assert d.directive == "push"


# ─── Wearable recency gate (stale-data fix, Jul 2026) ───────────────────────
# The directive is a present-tense claim AND it moves plan rows, so its inputs
# must actually be from today. Before this gate an athlete whose watch stopped
# syncing nine days ago got "HRV im Band — bereit für Qualität" built from nine
# nine-day-old mornings, "HRV 3 Tage unter deiner Basislinie" counted off three
# readings spread over a month, and a `poor_sleep` flag latched to whatever the
# newest sleep row happened to be, however old.

from datetime import datetime as _datetime, timedelta as _timedelta

import app.services.adaptive_readiness as _ar
from app.services.athlete_time import today_local as _today_local


class _FakeResult:
    def __init__(self, rows=None, scalar=None):
        self._rows = rows or []
        self._scalar = scalar

    def all(self):
        return self._rows

    def scalar_one_or_none(self):
        return self._scalar


def _hrv_row(day, hrv):
    """(recorded_at, hrv_status, date) — the tuple shape `_hrv_rows` selects."""
    return (_datetime.combine(day, _datetime.min.time()), float(hrv), day)


def _adaptive_db(*, hrv_rows, sleep_score=None, seen=None):
    """Fake session routing each SELECT by the table/column it touches."""
    db = _MagicMock()

    async def execute(stmt):  # noqa: ANN001
        s = str(stmt)
        if seen is not None:
            seen.append(s)
        if "athlete_profiles" in s:
            return _FakeResult(scalar={})
        if "daily_metrics.hrv_status" in s:
            return _FakeResult(rows=hrv_rows)
        if "daily_metrics.sleep_score" in s:
            return _FakeResult(scalar=sleep_score)
        return _FakeResult(rows=[])

    db.execute = _AsyncMock(side_effect=execute)
    return db


def _oscillating(newest_offset_days, n=28, base=60.0, swing=3.0):
    """n daily readings ending `newest_offset_days` ago, alternating around
    `base` so the 28-day SD is non-zero (a flat series yields sd=0, which the
    band logic treats as no usable HRV)."""
    today = _today_local()
    rows = []
    for i in range(n):
        day = today - _timedelta(days=newest_offset_days + (n - 1 - i))
        rows.append(_hrv_row(day, base + (swing if i % 2 else -swing)))
    return rows


@_pytest.fixture
def _quiet_engine(monkeypatch):
    """Stub the non-HRV inputs so each test isolates the recency gate."""
    async def _pmc(db, user_id, days=90):  # noqa: ANN001
        return {"total": [{"tsb": 0.0, "tss": 50.0} for _ in range(30)]}

    monkeypatch.setattr(_ar, "compute_user_pmc", _pmc)

    import app.services.daily_decision as _dd

    async def _fake_ctx(db, user_id):  # noqa: ANN001
        return _TodayContext()

    monkeypatch.setattr(_dd, "load_today_context", _fake_ctx)


@_pytest.mark.asyncio
async def test_fresh_hrv_still_reads_the_band(_quiet_engine):
    """Control: today's reading present → unchanged in-band behaviour."""
    d = await _badir(_adaptive_db(hrv_rows=_oscillating(0)), 1)
    assert d.hrv_state == "in"
    assert d.directive in ("push", "escalate")


@_pytest.mark.asyncio
async def test_stale_hrv_falls_back_to_unknown(_quiet_engine):
    """Same series, nine days older → no green light off week-old mornings."""
    d = await _badir(_adaptive_db(hrv_rows=_oscillating(9)), 1)
    assert d.hrv_state == "unknown"
    # 'unknown' must be inert downstream: _rule_sleep_hrv only fires on
    # 'below' and _rule_green_upgrade needs a 3-day-fresh green streak.
    assert d.directive not in ("escalate", "deload")
    assert any("9 days ago" in s.text for s in d.signals)


@_pytest.mark.asyncio
async def test_stale_hrv_note_is_localised(_quiet_engine):
    d = await _badir(_adaptive_db(hrv_rows=_oscillating(9)), 1, "de")
    assert any("vor 9 Tagen" in s.text for s in d.signals)


@_pytest.mark.asyncio
async def test_yesterdays_reading_is_still_current(_quiet_engine):
    """One missing morning is the normal pre-sync window, not a stale watch."""
    d = await _badir(_adaptive_db(hrv_rows=_oscillating(1)), 1)
    assert d.hrv_state == "in"


@_pytest.mark.asyncio
async def test_below_days_counts_calendar_days_not_rows(_quiet_engine):
    """A sparse tail — below-band readings 6, 3 and 0 days ago — sliced as
    `ln[-3:]` into 'HRV 3 Tage unter deiner Basislinie' and deloaded the
    athlete off a streak that spans a week, not three days."""
    today = _today_local()
    dense = _oscillating(10, n=25)          # in-band history, ends 10 days ago
    sparse = [
        _hrv_row(today - _timedelta(days=6), 48.0),
        _hrv_row(today - _timedelta(days=3), 48.0),
        _hrv_row(today, 48.0),
    ]
    d = await _badir(_adaptive_db(hrv_rows=dense + sparse), 1)
    assert d.hrv_state == "below"
    assert d.directive == "hold"  # one below-band CALENDAR day → no deload


@_pytest.mark.asyncio
async def test_sleep_query_is_date_bounded(_quiet_engine):
    """The sleep lookup had no date filter at all — a month-old bad night kept
    `poor_sleep` latched. Assert the recency bound is actually in the SQL."""
    seen: list[str] = []
    await _badir(_adaptive_db(hrv_rows=_oscillating(0), seen=seen), 1)
    sleep_sql = next(s for s in seen if "daily_metrics.sleep_score" in s)
    assert "recorded_at >=" in sleep_sql


def test_assess_adaptation_distinguishes_no_watch_from_stale_watch():
    no_watch = assess_adaptation(
        hrv_recent=None, hrv_baseline=None, hrv_sd=None, hrv_below_days=0,
        tsb=0.0, decoupling_delta=None, sleep_score=None, load_ramp=None,
        hrv_age_days=None,
    )
    assert any("No HRV data" in s.text for s in no_watch.signals)
    stale = assess_adaptation(
        hrv_recent=None, hrv_baseline=None, hrv_sd=None, hrv_below_days=0,
        tsb=0.0, decoupling_delta=None, sleep_score=None, load_ramp=None,
        hrv_age_days=5,
    )
    assert any("5 days ago" in s.text for s in stale.signals)


def test_stale_note_survives_the_deep_fatigue_branch():
    """The TSB-fallback branch appends its own signal; the staleness note must
    not be lost behind it, or the athlete never learns why HRV went quiet."""
    d = assess_adaptation(
        hrv_recent=None, hrv_baseline=None, hrv_sd=None, hrv_below_days=0,
        tsb=-30.0, decoupling_delta=None, sleep_score=None, load_ramp=None,
        hrv_age_days=4,
    )
    assert d.directive == "hold"
    assert any("4 days ago" in s.text for s in d.signals)


@_pytest.mark.asyncio
async def test_fewer_than_three_readings_this_week_is_unknown(_quiet_engine):
    """The band rule is a 7-DAY rolling mean vs a 28-day baseline. Two
    readings in the week is not a 7-day mean, however fresh the newest one is,
    so the directive says 'unknown' and leans on TSB instead of inventing a
    trend out of two mornings."""
    today = _today_local()
    dense = _oscillating(10, n=25)
    sparse = [_hrv_row(today - _timedelta(days=4), 60.0), _hrv_row(today, 60.0)]
    d = await _badir(_adaptive_db(hrv_rows=dense + sparse), 1)
    assert d.hrv_state == "unknown"
