"""Der Fahrer darf aufhoeren -- und der Plan merkt es sich.

`status` wird gerechnet, nicht gespeichert, und bis eben ausschliesslich so:
`ended = target_event_date < heute`. Ein Plan konnte NUR dadurch enden, dass
sein Renntag vergeht. Diese Datei haelt den zweiten Weg fest.
"""
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user


@pytest.fixture
def endpoint():
    def make(plan=None, target=None, goals=None):
        user = SimpleNamespace(id=71, is_active=True)
        profile = SimpleNamespace(user_id=71, timezone='Europe/Berlin',
                                  target_event_date=target, weekly_hours_available=6,
                                  goals=goals if goals is not None else {})
        db = AsyncMock()

        async def execute(stmt):
            out = MagicMock()
            out.scalar_one_or_none.return_value = profile if 'athlete_profiles' in str(stmt) else plan
            return out

        db.execute.side_effect = execute
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app), db, profile

    with patch("app.services.plan_history.finish_journey", new_callable=AsyncMock):
        yield make
    app.dependency_overrides.clear()


def saved():
    return SimpleNamespace(plan_start_date=date(2026, 9, 7), plan_end_date=date(2099, 10, 4),
                           phase='build1', weekly_tss_targets=[200, 240, 270, 160])


def test_ein_laufender_plan_ist_aktiv(endpoint):
    client, _, _ = endpoint(saved())
    assert client.get('/plan/current').json()['status'] == 'active'


def test_abbrechen_beendet_den_plan(endpoint):
    client, db, profile = endpoint(saved())
    response = client.post('/plan/cancel')
    assert response.status_code == 200
    assert response.json()['status'] == 'ended'
    # Gespeichert wird durch ERSETZEN des dicts -- eine JSON-Spalte an Ort und
    # Stelle zu aendern meldet SQLAlchemy nicht als dirty.
    assert profile.goals['plan_cancelled_at'] == response.json()['cancelled_on']
    db.commit.assert_awaited()


def test_ein_abgebrochener_plan_liest_sich_als_beendet(endpoint):
    client, _, _ = endpoint(saved(), goals={'plan_cancelled_at': '2026-09-16'})
    body = client.get('/plan/current').json()
    assert body['status'] == 'ended'
    # Er endet an dem Tag, an dem er beendet wurde -- nicht an dem, an dem er
    # geendet haette (2099).
    assert body['plan_end_date'] == '2026-09-16'


def test_zweimal_abbrechen_verschiebt_das_ende_nicht(endpoint):
    client, db, profile = endpoint(saved(), goals={'plan_cancelled_at': '2026-09-10'})
    body = client.post('/plan/cancel').json()
    assert body['cancelled_on'] == '2026-09-10'
    assert profile.goals['plan_cancelled_at'] == '2026-09-10'
    db.commit.assert_not_awaited()


def test_ein_kaputtes_datum_beendet_keinen_plan(endpoint):
    # Lieber einen Plan weiterlaufen lassen als ihn wegen eines unlesbaren
    # Strings zu beenden.
    for muell in ('', 'gestern', '2026-13-45', None, 42):
        client, _, _ = endpoint(saved(), goals={'plan_cancelled_at': muell})
        assert client.get('/plan/current').json()['status'] == 'active', muell


def test_der_abbruch_ueberlebt_keinen_neubau():
    """`rebuild_plan` loescht den Schluessel -- sonst waere "neu starten" ein
    Knopf, der nichts tut, und `api/plan.py` duerfte einen gefundenen Wert
    nicht mehr dem aktuellen Plan zuordnen."""
    import inspect
    from app.services import plan_interview

    src = inspect.getsource(plan_interview.rebuild_plan)
    assert 'PLAN_CANCELLED_KEY' in src
    assert plan_interview.PLAN_CANCELLED_KEY == 'plan_cancelled_at'
