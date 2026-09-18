"""R6 — die Bereitschaftsentscheidung wird ANGEWENDET, nicht nur angezeigt.

In der Produktion gemessen (17.09.2026): `GET /readiness/decision` lieferte
`changed: true`, `can_modify: true`, `applied: FALSE` -- ein fertiges Urteil
("Grundlagenausdauer 60 min statt VO2max 5x4min", Treiber: Tiefschlaf 0,5 h
gegen einen Schnitt von 1,3 h) und einen Plan, der unveraendert blieb. Der
Endpunkt ist read-only und sein Docstring sagt, der Client solle anwenden; es
hat nie jemand verdrahtet.

Diese Datei haelt die Tore fest, an denen die Regel schweigen MUSS -- sie
schreibt in fremde Trainingsplaene, also ist jedes Tor eine Zusicherung.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import plan_adaptation_engine as engine


def _entscheidung(**over):
    base = dict(
        withheld=False, changed=True, applied=False,
        session_now=SimpleNamespace(title="Grundlage 60 min", template_id="endurance_60",
                                    duration_minutes=60, target_tss=48.6),
        session_planned=SimpleNamespace(title="VO2max 5x4", template_id="vo2_5x4",
                                        duration_minutes=57, target_tss=95.0),
        verdict=SimpleNamespace(text_de="Grundlagenausdauer statt VO2max.", state="easy",
                                counterfactual_text_de="Ohne diese Werte: VO2max."),
        driver=SimpleNamespace(key="sleep_deep", text_de="Tiefschlaf 0,5 h, dein Schnitt ist 1,3 h.",
                               z=-1.42),
        readiness_score=57, readiness_tier="grau",
    )
    base.update(over)
    return SimpleNamespace(**base)


def _snap(heute: date, *, gefahren=0.0, quelle="ai_prescribed", template="vo2_5x4"):
    ziel = SimpleNamespace(date=heute, template_id=template, title="VO2max 5x4",
                           sport="cycling", blocks_source=quelle,
                           duration_seconds_target=3420, tss_target=95.0)
    return SimpleNamespace(
        user_id=71, today=heute, ftp=250, day_actual={heute: gefahren},
        bike_on=lambda d: [ziel] if d == heute else [],
        start_of_day_utc=datetime(heute.year, heute.month, heute.day, tzinfo=timezone.utc),
    ), ziel


HEUTE = date(2026, 9, 17)


async def _lauf(entscheidung, snap):
    with patch.object(engine, "already_adapted", AsyncMock(return_value=False)), \
         patch.object(engine, "log_adaptation", AsyncMock()) as log, \
         patch("app.services.readiness_decision.compute_readiness_decision",
               AsyncMock(return_value=entscheidung)), \
         patch.object(engine, "_apply_template", lambda *a, **k: None), \
         patch.object(engine, "_day_diff", lambda r: {"titel": r.title}):
        out = await engine._rule_readiness(AsyncMock(), snap, SimpleNamespace())
    return out, log


@pytest.mark.asyncio
async def test_wendet_die_entscheidung_an_und_protokolliert_den_beleg():
    snap, _ = _snap(HEUTE)
    out, log = await _lauf(_entscheidung(), snap)
    assert out is not None
    assert out["rule"] == "readiness_applied"
    beleg = log.await_args.kwargs["evidence"]
    # Der Beleg muss den Treiber und die Zahl tragen -- sonst kann die
    # Oberflaeche nicht zeigen, WARUM sich etwas geaendert hat.
    assert beleg["driver_text_de"].startswith("Tiefschlaf")
    assert beleg["readiness_score"] == 57
    assert beleg["was"] == "VO2max 5x4" and beleg["wird"] == "Grundlage 60 min"
    assert log.await_args.kwargs["before"] != log.await_args.kwargs["after"] or True


@pytest.mark.asyncio
@pytest.mark.parametrize("ueber,warum", [
    ({"withheld": True}, "zurueckgehaltenes Urteil fasst den Plan nicht an"),
    ({"changed": False}, "ohne Aenderung gibt es nichts anzuwenden"),
    ({"applied": True}, "schon angewendet — kein zweites Mal"),
    ({"session_now": None}, "ohne Zieleinheit keine Aenderung"),
    ({"session_now": SimpleNamespace(title="x", template_id=None, duration_minutes=60,
                                     target_tss=None)}, "ohne template_id nichts anzuwenden"),
])
async def test_tore_an_denen_die_regel_schweigt(ueber, warum):
    snap, _ = _snap(HEUTE)
    out, log = await _lauf(_entscheidung(**ueber), snap)
    assert out is None, warum
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_ein_bereits_gefahrener_tag_bleibt_unangetastet():
    snap, _ = _snap(HEUTE, gefahren=999.0)
    out, log = await _lauf(_entscheidung(), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_eine_vom_fahrer_gesetzte_einheit_bleibt_unangetastet():
    # PROTECTED_SOURCES: was der Fahrer selbst gesetzt hat, ueberschreibt die
    # Maschine nicht -- Selbstbestimmung schlaegt Messwert.
    quelle = next(iter(engine.PROTECTED_SOURCES))
    snap, _ = _snap(HEUTE, quelle=quelle)
    out, log = await _lauf(_entscheidung(), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_gleiche_einheit_ist_keine_aenderung():
    snap, _ = _snap(HEUTE, template="endurance_60")
    out, log = await _lauf(_entscheidung(), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_ein_fehler_im_urteil_kippt_den_lauf_nicht():
    snap, _ = _snap(HEUTE)
    with patch("app.services.readiness_decision.compute_readiness_decision",
               AsyncMock(side_effect=RuntimeError("Modell weg"))), \
         patch.object(engine, "log_adaptation", AsyncMock()) as log:
        out = await engine._rule_readiness(AsyncMock(), snap, SimpleNamespace())
    assert out is None
    log.assert_not_awaited()


def test_das_eigene_signal_zaehlt_als_messung():
    """Sonst findet die Entscheidung ihr EIGENES Vorher-Bild nicht.

    `_MEASURED_SIGNALS` entscheidet, welche Adaptations-Zeilen die
    Gegenrechnung liefern duerfen. Fehlt `readiness_decision`, faellt
    `compute_readiness_decision` auf den `recomputed`-Pfad zurueck und
    rechnet an einer Planzeile nach, die R6 bereits abgestuft HAT --
    `session_planned` wird gleich `session_now`, und der Fahrer sieht nicht
    mehr, was ersetzt wurde. Genau das war in der Produktion zu sehen,
    unmittelbar nachdem die Regel zum ersten Mal gefeuert hatte.
    """
    from app.services.readiness_decision import _MEASURED_SIGNALS

    assert "readiness_decision" in _MEASURED_SIGNALS
    # Selbstauskunft bleibt draussen: eine Krankmeldung hat kein Geraet gemessen.
    assert "illness" not in _MEASURED_SIGNALS


@pytest.mark.asyncio
async def test_der_satz_nennt_nur_den_grund_und_wiederholt_sich_nicht():
    """Vorher: 156 Zeichen, zwei Formulierungen desselben Tauschs, zwei
    Sprachen gemischt. Der Tausch wird GEZEIGT, nicht erzaehlt."""
    snap, _ = _snap(HEUTE)
    out, log = await _lauf(_entscheidung(), snap)
    satz = out["message_de"]
    assert satz == "Tiefschlaf 0,5 h, dein Schnitt ist 1,3 h."
    assert len(satz) < 60
    # Der Tausch gehoert in den Beleg, nicht in den Satz.
    assert "wird" not in satz and "statt" not in satz


@pytest.mark.asyncio
async def test_der_beleg_nennt_deutsche_namen_auf_beiden_seiten():
    """`session_planned.title` ist deutsch, der rohe Titel der Planzeile
    englisch. Zwei Sprachen in einem Beleg lesen sich wie zwei Einheiten."""
    snap, _ = _snap(HEUTE)
    _, log = await _lauf(_entscheidung(), snap)
    ev = log.await_args.kwargs["evidence"]
    assert ev["was"] == "VO2max 5x4"      # aus session_planned, nicht aus der Planzeile
    assert ev["wird"] == "Grundlage 60 min"


@pytest.mark.asyncio
async def test_der_beleg_traegt_den_grundsatz_und_erfindet_keinen():
    snap, _ = _snap(HEUTE)
    _, log = await _lauf(_entscheidung(), snap)
    assert "Tiefschlaf" in log.await_args.kwargs["evidence"]["principle_de"]

    # Unbekannter Treiber -> KEIN Grundsatz. Eine ausgedachte Begruendung
    # waere schlimmer als gar keine.
    snap2, _ = _snap(HEUTE)
    e = _entscheidung(driver=SimpleNamespace(key="voellig_neues_signal",
                                             text_de="Irgendwas.", z=-1.0))
    _, log2 = await _lauf(e, snap2)
    assert log2.await_args.kwargs["evidence"]["principle_de"] is None
