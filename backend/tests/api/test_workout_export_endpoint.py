"""GET /coach/workout/export — the head-unit export endpoint (backlog 02·I1).

Mirrors the mocked-`db.execute` dependency-override harness used by
test_custom_workouts.py (no real Postgres). The endpoint reads the latest
CoachBrief's prescribed_workout + the athlete's FTP, serializes it via
app.services.workout_export, and returns the file with the right MIME +
Content-Disposition. User-scoping is enforced by get_db_for_user / RLS
(verified separately); here we assert format, content-type, filename, and the
honest 404 (no workout) / 400 (no FTP) failure modes.
"""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user


def _user(uid=8):
    u = MagicMock()
    u.id = uid
    u.is_active = True
    return u


def _override(db, uid=8):
    async def _u():
        return _user(uid)

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


class _Result:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


_PRESCRIBED = {
    "title": "VO2 4x4",
    "why_this_workout": "Lift your ceiling.",
    "category": "vo2max",
    "blocks": [
        {"type": "warmup", "duration_s": 600, "from_pct": 0.50, "to_pct": 0.75},
        {"type": "interval", "reps": 4, "on_s": 240, "off_s": 240, "on_pct": 1.10, "off_pct": 0.50},
        {"type": "cooldown", "duration_s": 300, "from_pct": 0.60, "to_pct": 0.40},
    ],
}


def _brief(prescribed=_PRESCRIBED):
    return SimpleNamespace(
        id=1,
        user_id=8,
        prescribed_workout=prescribed,
        generated_at=datetime(2026, 7, 22, tzinfo=timezone.utc),
    )


def _profile(ftp=260):
    return SimpleNamespace(user_id=8, ftp_watts=ftp)


def _make_db(brief_row, profile_row):
    """Dispatch db.execute by target table: brief query first, profile second."""
    db = AsyncMock()

    async def _execute(stmt, *a, **k):
        sql = str(stmt).lower()
        if "athlete_profile" in sql:
            return _Result(profile_row)
        return _Result(brief_row)

    db.execute = _execute
    return db


@pytest.mark.parametrize(
    "fmt,content_type,ext",
    [
        ("zwo", "application/xml", ".zwo"),
        ("erg", "text/plain", ".erg"),
        ("mrc", "text/plain", ".mrc"),
        ("fit", "application/vnd.ant.fit", ".fit"),
    ],
)
def test_export_returns_file_per_format(client, fmt, content_type, ext):
    _override(_make_db(_brief(), _profile()))
    resp = client.get("/coach/workout/export", params={"format": fmt})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(content_type)
    cd = resp.headers["content-disposition"]
    assert "attachment" in cd
    assert ext in cd  # sanitized "VO2_4x4.<ext>"
    assert resp.content  # non-empty body


def test_export_defaults_to_zwo(client):
    _override(_make_db(_brief(), _profile()))
    resp = client.get("/coach/workout/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/xml")
    assert ".zwo" in resp.headers["content-disposition"]


def test_export_404_when_no_prescribed_workout(client):
    _override(_make_db(_brief(prescribed=None), _profile()))
    resp = client.get("/coach/workout/export", params={"format": "zwo"})
    assert resp.status_code == 404


def test_export_404_when_no_brief(client):
    _override(_make_db(None, _profile()))
    resp = client.get("/coach/workout/export", params={"format": "zwo"})
    assert resp.status_code == 404


def test_export_400_when_no_ftp(client):
    _override(_make_db(_brief(), _profile(ftp=None)))
    resp = client.get("/coach/workout/export", params={"format": "zwo"})
    assert resp.status_code == 400


def test_export_rejects_unknown_format(client):
    _override(_make_db(_brief(), _profile()))
    resp = client.get("/coach/workout/export", params={"format": "tcx"})
    assert resp.status_code == 422  # Literal query validation
