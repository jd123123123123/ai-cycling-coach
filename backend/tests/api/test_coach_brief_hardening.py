"""Review-gate hardening tests (2026-07-21) for GET /coach/brief.

1. BLOCKER — a cached brief whose outlook_7d was persisted as a raw unparsed
   tool-call fragment (a STRING like '\\n<parameter name="day_offset">6')
   500'd the endpoint (OutlookEntry(**'c') over the string's characters).
   The endpoint must serve the brief's core decision with 200 and simply
   drop the broken outlook. Live repro: users 9/12, coach_briefs 331/333.

2. MAJOR — the divergence guard only compared rest-vs-active shape, letting
   a brief that invented a *different active session* (FTP test @88 TSS)
   through while plan + daily_decision said Sweet Spot @108 TSS. The plan is
   the single source of truth: the guard must coerce the brief to the plan's
   session.

3. Defensive sweep — when the stored brief is unusable outright, the
   endpoint regenerates once and serves that with 200 (never a 500 that the
   frontend dresses up as a fake rest day).
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.coach import (
    _brief_diverges_from_plan,
    _parse_outlook_7d,
)
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user
from app.main import app
from app.schemas.coach import (
    DailyDecision,
    DailyDecisionPlanned,
    DailyDecisionReadiness,
)

GARBAGE_FRAGMENT = '\n<parameter name="day_offset">6'


# ---------------------------------------------------------------------------
# Unit — tolerant outlook parser
# ---------------------------------------------------------------------------


class TestParseOutlook7d:
    def test_poisoned_string_returns_none(self):
        assert _parse_outlook_7d(GARBAGE_FRAGMENT) is None

    def test_none_and_empty(self):
        assert _parse_outlook_7d(None) is None
        assert _parse_outlook_7d([]) is None

    def test_valid_entries_parse(self):
        out = _parse_outlook_7d(
            [{"day_offset": 0, "suggested_tss": 55, "note": "easy"}]
        )
        assert out is not None and len(out) == 1
        assert out[0].day_offset == 0

    def test_garbage_entries_skipped_valid_kept(self):
        out = _parse_outlook_7d(
            [
                "garbage",
                {"day_offset": 99, "suggested_tss": 1, "note": ""},  # out of range
                {"day_offset": 1, "suggested_tss": 60, "note": "ok"},
            ]
        )
        assert out is not None and len(out) == 1
        assert out[0].day_offset == 1

    def test_all_garbage_returns_none(self):
        assert _parse_outlook_7d(["a", 1, None]) is None


# ---------------------------------------------------------------------------
# Unit — divergence predicate
# ---------------------------------------------------------------------------


def _planned(template_id="sweet_spot_2x20", target_tss=108.0, title="Sweet spot — 3×20min"):
    return DailyDecisionPlanned(
        title=title, template_id=template_id, target_tss=target_tss, duration_minutes=100,
    )


class TestBriefDivergesFromPlan:
    def test_same_template_no_divergence(self):
        pw = {"template_id": "sweet_spot_2x20", "predicted_tss": 105}
        assert _brief_diverges_from_plan(pw, _planned()) is False

    def test_live_case_invented_ftp_test_diverges(self):
        # LLM invented "FTP test — 20-min max effort" @88 TSS against a
        # planned Sweet Spot @108 TSS.
        pw = {"template_id": "ftp_test_20min", "predicted_tss": 88}
        assert _brief_diverges_from_plan(pw, _planned()) is True

    def test_no_identity_material_tss_divergence(self):
        pw = {"predicted_tss": 88.0}
        assert _brief_diverges_from_plan(pw, _planned(template_id=None)) is True

    def test_no_identity_small_tss_drift_ok(self):
        pw = {"predicted_tss": 100.0}
        assert _brief_diverges_from_plan(pw, _planned(template_id=None)) is False

    def test_missing_everything_no_divergence(self):
        assert _brief_diverges_from_plan({}, _planned(template_id=None, target_tss=None)) is False


# ---------------------------------------------------------------------------
# Endpoint — mocked auth/db, patched service layer
# ---------------------------------------------------------------------------


def _real_pw(template_id: str, **overrides) -> dict:
    """A schema-valid prescribed_workout dict for a real template."""
    from app.services.coach_service import _rewrite_prescribed_workout

    pw = _rewrite_prescribed_workout(template_id, 250, None, None)
    pw.update(overrides)
    return pw


def _make_brief(
    outlook_7d=None,
    prescribed_workout=None,
    verdict="Sweet spot today — build fitness",
):
    return SimpleNamespace(
        id=333,
        generated_at=datetime.now(timezone.utc),
        verdict=verdict,
        rationale="test rationale",
        evidence={},
        prescribed_workout=prescribed_workout or _real_pw("z2_endurance_60"),
        alternates=[],
        options=None,
        outlook_7d=outlook_7d,
        frameworks_cited=[],
        model_used="claude-opus-4-8",
    )


def _decision(state="quality", planned=None):
    return DailyDecision(
        date="2026-07-21",
        state=state,
        verdict="Sweet spot today",
        reason="You're fresh — quality window.",
        planned=planned,
        readiness=DailyDecisionReadiness(),
        tss_target=108.0,
    )


def _make_db(scalar_results: list):
    """AsyncMock session: each execute() pops the next scalar_one_or_none value."""
    db = AsyncMock()
    queue = list(scalar_results)

    async def _execute(query, *args, **kwargs):  # noqa: ANN001
        result = MagicMock()
        result.scalar_one_or_none.return_value = queue.pop(0) if queue else None
        result.scalars.return_value.all.return_value = []
        return result

    db.execute = _execute
    db.commit = AsyncMock()
    db.rollback = AsyncMock()
    db.refresh = AsyncMock()
    return db


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


class _Harness:
    """Installs dep overrides + service patches around one GET /coach/brief."""

    def __init__(self, brief, decision, db=None, regenerated=None):
        self.brief = brief
        self.decision = decision
        self.db = db or _make_db([None, brief])  # _load_profile → None, cache → brief
        self.regenerated = regenerated

    def get(self, client: TestClient):
        user = MagicMock()
        user.id = 12
        user.is_active = True

        async def _override_user():
            return user

        async def _override_db():
            yield self.db

        app.dependency_overrides[get_current_active_user] = _override_user
        app.dependency_overrides[get_current_user] = _override_user
        app.dependency_overrides[get_db_for_user] = _override_db

        side = [self.brief] + ([self.regenerated] if self.regenerated else [self.brief])
        gen_mock = AsyncMock(side_effect=side)
        try:
            with (
                patch("app.services.coach_service.get_or_generate_brief", gen_mock),
                patch(
                    "app.api.coach.compute_daily_decision",
                    new=AsyncMock(return_value=self.decision),
                ),
            ):
                resp = client.get("/coach/brief")
        finally:
            app.dependency_overrides.clear()
        self.gen_mock = gen_mock
        return resp


class TestPoisonedOutlookNever500s:
    def test_string_fragment_outlook_serves_200(self, client):
        # THE blocker repro: outlook_7d persisted as one garbage string.
        brief = _make_brief(outlook_7d=GARBAGE_FRAGMENT)
        decision = _decision(
            planned=_planned(template_id="z2_endurance_60", target_tss=55.0)
        )
        resp = _Harness(brief, decision).get(client)
        assert resp.status_code == 200
        data = resp.json()
        assert data["outlook_7d"] is None
        # The core decision still serves.
        assert data["prescribed_workout"]["template_id"] == "z2_endurance_60"
        assert data["daily_decision"]["state"] == "quality"

    def test_partially_poisoned_outlook_keeps_valid_entries(self, client):
        brief = _make_brief(
            outlook_7d=[
                GARBAGE_FRAGMENT,
                {"day_offset": 2, "suggested_tss": 60, "note": "steady"},
            ]
        )
        decision = _decision(
            planned=_planned(template_id="z2_endurance_60", target_tss=55.0)
        )
        resp = _Harness(brief, decision).get(client)
        assert resp.status_code == 200
        outlook = resp.json()["outlook_7d"]
        assert outlook == [{"day_offset": 2, "suggested_tss": 60.0, "note": "steady"}]


class TestDivergenceGuardCoercesToPlan:
    def test_invented_ftp_test_is_coerced_to_planned_session(self, client):
        # Live case: plan + daily_decision = Sweet Spot 3×20 @108 TSS; the
        # cached brief invented an FTP test @88 TSS. The response must carry
        # the PLAN's session — the One Daily Decision law.
        brief = _make_brief(
            prescribed_workout=_real_pw(
                "ftp_test_20min",
                title="FTP test — 20-min max effort",
                predicted_tss=88,
            ),
            verdict="FTP test today — anchor the block",
        )
        decision = _decision(planned=_planned())
        harness = _Harness(brief, decision)
        resp = harness.get(client)
        assert resp.status_code == 200
        data = resp.json()
        assert data["prescribed_workout"]["template_id"] == "sweet_spot_2x20"
        # Verdict realigned away from the invented session.
        assert "FTP test" not in data["verdict"]
        # Coercion persisted onto the row so exports/other reads agree.
        assert brief.prescribed_workout["template_id"] == "sweet_spot_2x20"

    def test_matching_brief_left_untouched(self, client):
        brief = _make_brief(prescribed_workout=_real_pw("sweet_spot_2x20"))
        decision = _decision(planned=_planned())
        resp = _Harness(brief, decision).get(client)
        assert resp.status_code == 200
        assert resp.json()["prescribed_workout"]["template_id"] == "sweet_spot_2x20"

    def test_rest_decision_skips_identity_guard(self, client):
        # trained_already keeps planned=None → identity guard must not fire.
        brief = _make_brief(prescribed_workout=_real_pw("rest_day"))
        decision = _decision(state="trained_already", planned=None)
        resp = _Harness(brief, decision).get(client)
        assert resp.status_code == 200


class TestDefensiveSweep:
    def test_unusable_stored_brief_regenerates_with_200(self, client):
        # evidence=None violates BriefRead(evidence: dict) — serialization of
        # the stored row fails outright. The endpoint must burn the row with
        # one forced regeneration and still serve 200.
        bad = _make_brief(outlook_7d=GARBAGE_FRAGMENT)
        bad.evidence = None
        good = _make_brief()
        decision = _decision(
            planned=_planned(template_id="z2_endurance_60", target_tss=55.0)
        )
        harness = _Harness(bad, decision, regenerated=good)
        resp = harness.get(client)
        assert resp.status_code == 200
        data = resp.json()
        assert data["from_cache"] is False
        assert data["prescribed_workout"]["template_id"] == "z2_endurance_60"
        # Second call was the forced regeneration.
        assert harness.gen_mock.await_count == 2
        assert harness.gen_mock.await_args_list[1].kwargs.get("force") is True
