"""POST /crews/nudge — coach-safety interlock on the recipient.

When the recipient's adaptive directive is rest/deload, the trash-talk line is
swapped for encouragement and the response is flagged `coach_intercepted` so
the sender UI can say so honestly. On any directive-engine failure the social
path must survive with plain trash talk (never 500 on a physiology check).

Mirrors the mocked-`db.execute`-dependency-override harness used by the other
tests/api modules (no real-Postgres fixture in this repo).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api.crews import COACH_NUDGE_LINES, NUDGE_LINES
from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user


SENDER = SimpleNamespace(id=5, email="you@example.com", is_active=True)


def _fake_db(sent_count: int = 0):
    """db.execute dispatcher: crew memberships (same crew) + sent-count."""
    db = MagicMock()

    async def execute(stmt):  # noqa: ANN001 — SQLAlchemy Select
        text = str(stmt).lower()
        result = MagicMock()
        if "crew_memberships" in text:
            result.scalar_one_or_none.return_value = SimpleNamespace(crew_id=1)
        elif "count" in text:
            result.scalar_one.return_value = sent_count
        else:  # pragma: no cover — no other queries expected
            result.scalar_one_or_none.return_value = None
        return result

    db.execute = AsyncMock(side_effect=execute)
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.fixture()
def client():
    db = _fake_db()
    app.dependency_overrides[get_current_user] = lambda: SENDER
    app.dependency_overrides[get_current_active_user] = lambda: SENDER
    app.dependency_overrides[get_db_for_user] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _directive(kind: str):
    return SimpleNamespace(directive=kind)


def test_nudge_intercepted_when_recipient_resting(client):
    with patch(
        "app.services.adaptive_readiness.build_adaptive_directive",
        new=AsyncMock(return_value=_directive("rest")),
    ):
        res = client.post("/crews/nudge", json={"to_user_id": 6})
    assert res.status_code == 201
    body = res.json()
    assert body["coach_intercepted"] is True
    assert body["text"] in COACH_NUDGE_LINES


def test_nudge_intercepted_on_deload(client):
    with patch(
        "app.services.adaptive_readiness.build_adaptive_directive",
        new=AsyncMock(return_value=_directive("deload")),
    ):
        res = client.post("/crews/nudge", json={"to_user_id": 6})
    assert res.json()["coach_intercepted"] is True


@pytest.mark.parametrize("kind", ["hold", "push", "escalate"])
def test_nudge_normal_when_recipient_training(client, kind):
    with patch(
        "app.services.adaptive_readiness.build_adaptive_directive",
        new=AsyncMock(return_value=_directive(kind)),
    ):
        res = client.post("/crews/nudge", json={"to_user_id": 6})
    body = res.json()
    assert body["coach_intercepted"] is False
    assert body["text"] in NUDGE_LINES


def test_nudge_survives_directive_engine_failure(client):
    with patch(
        "app.services.adaptive_readiness.build_adaptive_directive",
        new=AsyncMock(side_effect=RuntimeError("no HRV data")),
    ):
        res = client.post("/crews/nudge", json={"to_user_id": 6})
    assert res.status_code == 201
    body = res.json()
    assert body["coach_intercepted"] is False
    assert body["text"] in NUDGE_LINES
