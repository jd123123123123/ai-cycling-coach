"""Der Plan liess sich neu berechnen, aber nicht umstellen.

Wer wusste, dass er Donnerstag keine Zeit hat, konnte die Einheit nicht auf
Freitag ziehen -- er konnte nur den ganzen Block neu bauen lassen und hoffen,
dass der Tag diesmal frei bleibt. Das ist der Unterschied zwischen einem Plan,
den man liest, und einem, der einem gehoert.

Der Endpunkt schreibt in Trainingsplaene, also ist jedes Tor hier eine
Zusicherung -- besonders die beiden Grenzen: Vergangenes bleibt unangetastet,
und beide Tage werden `user_modified`, damit die stuendliche Anpassung sie am
naechsten Morgen nicht wieder umraeumt.
"""
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_current_user, get_db_for_user

HEUTE = date.today()
MORGEN = HEUTE + timedelta(days=1)
UEBERMORGEN = HEUTE + timedelta(days=2)
GESTERN = HEUTE - timedelta(days=1)


def _tag(d, titel, vorlage, quelle="ai_prescribed"):
    return SimpleNamespace(
        date=d, title=titel, template_id=vorlage, blocks_source=quelle,
        duration_seconds_target=3600, description=None,
        interval_structure={"intervals": [1]}, indoor=False, sport="cycling",
    )


@pytest.fixture
def endpoint():
    def make(tage):
        user = SimpleNamespace(id=71, is_active=True)
        profile = SimpleNamespace(user_id=71, timezone="Europe/Berlin")
        db = AsyncMock()

        async def execute(stmt):
            out = MagicMock()
            if "athlete_profiles" in str(stmt):
                out.scalar_one_or_none.return_value = profile
            else:
                out.scalars.return_value.all.return_value = tage
            return out

        db.execute.side_effect = execute
        app.dependency_overrides[get_current_active_user] = lambda: user
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db_for_user] = lambda: db
        return TestClient(app), db
    yield make
    app.dependency_overrides.clear()


def test_zwei_einheiten_tauschen_den_platz(endpoint):
    a = _tag(MORGEN, "VO2max 5×4", "vo2_5x4")
    b = _tag(UEBERMORGEN, "Grundlage 60", "z2_endurance_60")
    client, db = endpoint([a, b])
    r = client.post("/plan/day/swap",
                    json={"a": MORGEN.isoformat(), "b": UEBERMORGEN.isoformat()})
    assert r.status_code == 200, r.text
    assert a.title == "Grundlage 60" and b.title == "VO2max 5×4"
    assert a.template_id == "z2_endurance_60" and b.template_id == "vo2_5x4"
    # Die Wochenlast bleibt exakt gleich -- ein Tausch erfindet nichts.
    assert {a.title, b.title} == {"VO2max 5×4", "Grundlage 60"}


def test_beide_tage_werden_geschuetzt(endpoint):
    # `user_modified` ist eine PROTECTED-Quelle. Wer seinen Plan selbst ordnet,
    # soll ihn am naechsten Morgen nicht umgeraeumt vorfinden.
    a = _tag(MORGEN, "VO2max 5×4", "vo2_5x4")
    b = _tag(UEBERMORGEN, "Grundlage 60", "z2_endurance_60")
    client, _ = endpoint([a, b])
    client.post("/plan/day/swap",
                json={"a": MORGEN.isoformat(), "b": UEBERMORGEN.isoformat()})
    assert a.blocks_source == "user_modified"
    assert b.blocks_source == "user_modified"


def test_ein_ruhetag_ohne_zeile_laesst_die_einheit_umziehen(endpoint):
    a = _tag(MORGEN, "VO2max 5×4", "vo2_5x4")
    client, _ = endpoint([a])
    r = client.post("/plan/day/swap",
                    json={"a": MORGEN.isoformat(), "b": UEBERMORGEN.isoformat()})
    assert r.status_code == 200, r.text
    assert a.date == UEBERMORGEN
    assert r.json()["b_title"] == "VO2max 5×4"
    assert r.json()["a_title"] is None


def test_vergangenes_bleibt_unangetastet(endpoint):
    # Ein Tausch in die Vergangenheit wuerde eine Trainingshistorie
    # umschreiben, die so nie stattgefunden hat.
    client, _ = endpoint([_tag(GESTERN, "Alt", "z2_endurance_60")])
    r = client.post("/plan/day/swap",
                    json={"a": GESTERN.isoformat(), "b": MORGEN.isoformat()})
    assert r.status_code == 400
    assert "ergangen" in r.json()["detail"]


def test_derselbe_tag_ist_kein_tausch(endpoint):
    client, _ = endpoint([])
    r = client.post("/plan/day/swap",
                    json={"a": MORGEN.isoformat(), "b": MORGEN.isoformat()})
    assert r.status_code == 400


def test_zwei_leere_tage_sind_nichts_zu_tauschen(endpoint):
    client, _ = endpoint([])
    r = client.post("/plan/day/swap",
                    json={"a": MORGEN.isoformat(), "b": UEBERMORGEN.isoformat()})
    assert r.status_code == 404
