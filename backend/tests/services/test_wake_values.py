"""Die Aufwachwerte kommen aus den Proben, nicht aus einer leeren Spalte.

In der Produktion gemessen (18.09.2026, Konto 5): `body_battery_wake` und
`stress_wake` sind in 183 von 183 Zeilen NULL, waehrend die Proben-Tabelle
4 134 Body-Battery- und 119 013 Stress-Messungen haelt. Beide Treiber der
Bereitschafts-Erklaerung lasen die leeren Spalten und fielen still aus.

Die naheliegende Abkuerzung waere `charged` aus Garmins Tagesantwort gewesen.
Am 16.09. stand dort 51, der tatsaechliche Aufwachwert war 70: `charged` ist
die ueber den Tag gesammelte Ladung, kein Pegel. Der Test haelt fest, dass
der Wert aus der Messreihe zur Aufwachzeit stammt.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.biometrics_snapshot import wake_values_for_days


def _probe(tag: date, stunde: int, typ: str, wert: int):
    return SimpleNamespace(
        recorded_at=datetime(tag.year, tag.month, tag.day, stunde, 0, tzinfo=timezone.utc),
        metric_type=typ,
        value=wert,
    )


class _FakeDB:
    def __init__(self, proben):
        self._proben = proben

    async def execute(self, _q):
        proben = self._proben
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: proben))


@pytest.mark.asyncio
async def test_nimmt_die_erste_messung_nach_dem_aufwachen():
    tag = date(2026, 9, 16)
    # 03:00 ist eine naechtliche Synchronisation, 06:00 ist die Aufwach-Grenze.
    proben = [
        _probe(tag, 3, "body_battery", 91),
        _probe(tag, 7, "body_battery", 70),
        _probe(tag, 20, "body_battery", 9),
        _probe(tag, 7, "stress", 30),
    ]
    out = await wake_values_for_days(_FakeDB(proben), 5, [tag])
    assert out[tag]["body_battery_wake"] == 70
    assert out[tag]["stress_wake"] == 30


@pytest.mark.asyncio
async def test_ein_tag_ohne_proben_bleibt_leer_statt_geraten():
    tag = date(2026, 9, 16)
    out = await wake_values_for_days(_FakeDB([]), 5, [tag])
    assert tag not in out


@pytest.mark.asyncio
async def test_ohne_tage_keine_abfrage():
    class _Explodiert:
        async def execute(self, _q):  # pragma: no cover -- darf nie laufen
            raise AssertionError("ohne Tage darf keine Abfrage passieren")

    assert await wake_values_for_days(_Explodiert(), 5, []) == {}
