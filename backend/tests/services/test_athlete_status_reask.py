"""Wer sich krank meldet, wird wieder gefragt.

GEMESSEN IN DER PRODUKTION: ein Fahrer stand seit dem 17.09. auf "krank",
waehrend seine Bereitschaft laengst wieder bei 72 lag. `illness_interlock`
unterdrueckte sein Training taeglich weiter -- der Plan wartete auf eine
Entwarnung, die niemand je erbeten hatte. Der Status wurde einmal gesetzt und
nie wieder angefasst.
"""
from datetime import date

import pytest

from app.services.athlete_status import lage, satz

HEUTE = date(2026, 9, 21)


def _goals(**over):
    st = {"state": "sick", "since": "2026-09-17"}
    st.update(over)
    return {"athlete_status": st}


def test_ein_gesunder_fahrer_wird_nicht_gefragt():
    for g in ({}, {"athlete_status": {"state": "healthy"}}, None, "muell"):
        assert lage(g, heute=HEUTE).nachfragen is False


def test_heute_noch_nicht_bestaetigt_heisst_nachfragen():
    l = lage(_goals(confirmed_on="2026-09-20"), heute=HEUTE)
    assert l.nachfragen is True
    assert l.tage_pausiert == 4


def test_heute_schon_bestaetigt_heisst_ruhe():
    # Eine zweite Frage am selben Tag ist Draengeln.
    assert lage(_goals(confirmed_on=HEUTE.isoformat()), heute=HEUTE).nachfragen is False


def test_eine_alte_zeile_ohne_bestaetigung_wird_sofort_gefragt():
    # Genau der Fall, der das ausgeloest hat: gesetzt am 17.09., seitdem nichts.
    l = lage(_goals(), heute=HEUTE)
    assert l.nachfragen is True
    assert l.confirmed_on == date(2026, 9, 17)


def test_der_status_springt_NIEMALS_von_selbst_auf_gesund():
    # Es waere bequem, nach drei Tagen automatisch zurueckzusetzen -- und
    # falsch: dann liefe das volle Programm wieder an, weil eine Frist abgelaufen
    # ist, nicht weil es dem Fahrer besser geht.
    for tage in (1, 3, 7, 30, 365):
        heute = date(2026, 9, 17) + __import__("datetime").timedelta(days=tage)
        assert lage(_goals(), heute=heute).state == "sick"


@pytest.mark.parametrize("zustand", ["sick", "injured", "break"])
def test_jeder_pausierende_zustand_wird_nachgefragt(zustand):
    assert lage(_goals(state=zustand), heute=HEUTE).nachfragen is True


def test_der_satz_nennt_den_preis_nicht_nur_die_einstellung():
    # "krank gemeldet" ist eine Einstellung; "seit 4 Tagen ruht dein Plan" ist
    # eine Tatsache mit Folgen.
    s = satz(lage(_goals(confirmed_on="2026-09-20"), heute=HEUTE))
    assert s is not None and "4 Tagen" in s and "ruht" in s


def test_am_ersten_tag_kein_tageszaehler():
    s = satz(lage(_goals(since=HEUTE.isoformat()), heute=HEUTE))
    # Am selben Tag gemeldet UND bestaetigt -> keine Frage.
    assert s is None
    s2 = satz(lage(_goals(since="2026-09-20", confirmed_on="2026-09-20"), heute=HEUTE))
    assert s2 is not None and "gestern" in s2


def test_ohne_frage_kein_satz():
    assert satz(lage(_goals(confirmed_on=HEUTE.isoformat()), heute=HEUTE)) is None


def test_ein_kaputtes_datum_kippt_nichts():
    l = lage(_goals(since="irgendwann", confirmed_on="gestern"), heute=HEUTE)
    assert l.state == "sick"
    assert l.tage_pausiert is None
    assert l.nachfragen is True   # ohne belastbare Bestaetigung wird gefragt
