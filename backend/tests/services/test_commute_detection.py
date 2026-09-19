"""Den Arbeitsweg LESEN, statt danach zu fragen.

Wer viermal die Woche um 7:40 eine halbe Stunde locker faehrt und abends
dieselbe halbe Stunde zurueck, hat es dem Plan laengst erzaehlt. Diese Tore
halten fest, wann daraus ein Befund wird -- und vor allem, wann NICHT: ein
vorausgefuelltes Formular mit falschen Werten ist schlechter als ein leeres,
weil niemand es nachprueft.
"""
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.commute_detection import (
    MIN_FAHRTEN_GESAMT, detect_commute_pattern,
)

HEUTE = date(2026, 9, 20)   # ein Sonntag


def _fahrt(tag: date, stunde: int, minuten: int = 28, np_: int = 140):
    return SimpleNamespace(
        sport="cycling",
        duration_seconds=minuten * 60,
        normalized_power=np_, average_power=np_,
        started_at=datetime(tag.year, tag.month, tag.day, stunde, 0, tzinfo=timezone.utc),
        tss=25.0,
    )


class _DB:
    def __init__(self, acts): self._a = acts
    async def execute(self, _q):
        a = self._a
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: a))


def _pendelwochen(wochen=3, tage=(0, 1, 2, 3), paare=True):
    """Ein sauberes Pendelmuster: feste Wochentage, morgens und abends."""
    acts = []
    for w in range(1, wochen + 1):
        montag = HEUTE - timedelta(days=HEUTE.weekday() + 7 * w)
        for wt in tage:
            tag = montag + timedelta(days=wt)
            acts.append(_fahrt(tag, 7))
            if paare:
                acts.append(_fahrt(tag, 17))
    return acts


@pytest.mark.asyncio
async def test_erkennt_das_muster_mit_tagen_und_dauer():
    b = await detect_commute_pattern(_DB(_pendelwochen()), 5, 250, heute=HEUTE)
    assert b is not None
    assert b.wochentage == [0, 1, 2, 3]
    assert b.wochentage_kuerzel == ["mon", "tue", "wed", "thu"]
    assert b.minuten_je_richtung == 28
    assert b.sicherheit == "hoch"


@pytest.mark.asyncio
async def test_hin_und_rueckweg_heben_die_sicherheit():
    mit = await detect_commute_pattern(_DB(_pendelwochen(paare=True)), 5, 250, heute=HEUTE)
    ohne = await detect_commute_pattern(_DB(_pendelwochen(wochen=3, paare=False)), 5, 250, heute=HEUTE)
    assert mit.paar_anteil == 1.0
    assert ohne.paar_anteil == 0.0
    assert mit.sicherheit == "hoch" and ohne.sicherheit == "mittel"


@pytest.mark.asyncio
async def test_zu_wenige_fahrten_ergeben_KEINEN_befund():
    # Lieber ein leeres Formular als ein falsch vorausgefuelltes.
    wenige = _pendelwochen(wochen=1, tage=(0,))   # 2 Fahrten
    assert len(wenige) < MIN_FAHRTEN_GESAMT
    assert await detect_commute_pattern(_DB(wenige), 5, 250, heute=HEUTE) is None


@pytest.mark.asyncio
async def test_ein_wochentag_der_sich_nicht_wiederholt_faellt_raus():
    """Nur wiederholte Wochentage werden zu Pendeltagen.

    Der Freitag taucht hier GENAU EINMAL auf -- eine einzelne lockere
    Feierabendrunde ist kein Arbeitsweg. Montag bis Donnerstag wiederholen
    sich und bleiben.

    (Ein Befund ganz ohne Wochentage ist uebrigens nicht herstellbar: bei
    fuenf moeglichen Werktagen und mindestens sechs Fahrten wiederholt sich
    nach dem Schubfachprinzip immer einer. Der Leerlauf-Zweig im Detektor ist
    also defensiv, nicht erreichbar.)
    """
    acts = _pendelwochen(wochen=2, tage=(0, 1, 2, 3), paare=False)
    einmalig = HEUTE - timedelta(days=HEUTE.weekday() + 7) + timedelta(days=4)
    acts.append(_fahrt(einmalig, 7))
    b = await detect_commute_pattern(_DB(acts), 5, 250, heute=HEUTE)
    assert b is not None
    assert b.wochentage == [0, 1, 2, 3]
    assert 4 not in b.wochentage


@pytest.mark.asyncio
async def test_lange_ausfahrten_sind_kein_arbeitsweg():
    lang = [_fahrt(HEUTE - timedelta(days=d), 10, minuten=150) for d in range(7, 40, 7)]
    assert await detect_commute_pattern(_DB(lang), 5, 250, heute=HEUTE) is None


@pytest.mark.asyncio
async def test_harte_kurze_fahrten_sind_kein_arbeitsweg():
    # Wer den Weg sprintet, hat seine Intensitaet verbraucht -- ihn als
    # Grundlage zu fuehren wuerde den Pendlerfehler umkehren.
    hart = _pendelwochen()
    for a in hart:
        a.normalized_power = a.average_power = 245     # IF 0,98
    assert await detect_commute_pattern(_DB(hart), 5, 250, heute=HEUTE) is None


@pytest.mark.asyncio
async def test_ohne_ftp_gibt_es_keine_einordnung_und_keinen_befund():
    assert await detect_commute_pattern(_DB(_pendelwochen()), 5, None, heute=HEUTE) is None


@pytest.mark.asyncio
async def test_wochenendfahrten_werden_nicht_mitgezaehlt():
    b = await detect_commute_pattern(
        _DB(_pendelwochen(tage=(0, 1, 2, 3, 5, 6))), 5, 250, heute=HEUTE)
    assert b is not None
    assert 5 not in b.wochentage and 6 not in b.wochentage
