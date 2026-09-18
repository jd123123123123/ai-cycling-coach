"""R7 — der gemessene Infektbefund erreicht endlich den Plan.

`morning_health_detector` rechnet die akute Infekt-Trias (Ruhepuls hoch, HRV
gedaempft, Atemfrequenz hoch, dazu SpO2) samt hinterlegter Evidenz. Er hing
bisher allein an `GET /health/morning` -- also an einer Karte. Der Plan fragte
ausschliesslich `status_state == "sick"`, die Selbstauskunft. Wer sich nicht
krank meldet, und in den Tagen, in denen ein Infekt hochkommt, meldet sich
kaum jemand krank, bekam das volle Intervall.

Die Regel schreibt in fremde Trainingsplaene, also ist jedes Tor hier eine
Zusicherung -- besonders die Aktualitaetssperre: ein Befund von letzter Woche
darf das heutige Training nicht loeschen.
"""
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import plan_adaptation_engine as engine

HEUTE = date(2026, 9, 18)


def _befund(level="elevated", signale=None):
    return {
        "level": level,
        "signals": signale if signale is not None else [
            {"metric": "rhr", "value": 54.0, "baseline": 48.0, "delta": 6.0,
             "severity": "strong"},
            {"metric": "respiration", "value": 16.8, "baseline": 14.9, "delta": 1.9,
             "severity": "mild"},
        ],
        "headline_de": "Deine Morgenwerte weichen ab.",
        "recommendation_de": "Heute locker.",
        "headline_en": None, "recommendation_en": None,
    }


def _snap(*, status=None, gefahren=0.0, quelle="ai_prescribed", template="vo2_5x4"):
    ziel = SimpleNamespace(
        date=HEUTE, template_id=template, title="VO2max 5x4", sport="cycling",
        blocks_source=quelle, duration_seconds_target=3420, tss_target=95.0,
    )
    return SimpleNamespace(
        user_id=71, today=HEUTE, ftp=250, metrics=[], status_state=status,
        day_actual={HEUTE: gefahren},
        bike_on=lambda d: [ziel] if d == HEUTE else [],
        start_of_day_utc=datetime(2026, 9, 18, tzinfo=timezone.utc),
    ), ziel


async def _lauf(befund, snap, *, schon=False):
    with patch.object(engine, "already_adapted", AsyncMock(return_value=schon)), \
         patch.object(engine, "log_adaptation", AsyncMock()) as log, \
         patch("app.services.morning_health_detector.verdict_for_rows",
               lambda *a, **k: befund), \
         patch.object(engine, "_apply_template", lambda *a, **k: None), \
         patch.object(engine, "_set_rest", lambda r: setattr(r, "template_id", "rest_day")), \
         patch.object(engine, "_day_diff", lambda r: {"titel": r.title,
                                                     "vorlage": r.template_id}):
        out = await engine._rule_morning_health(AsyncMock(), snap)
    return out, log


@pytest.mark.asyncio
async def test_erhoehter_befund_schwaecht_ab_und_belegt_die_messwerte():
    snap, _ = _snap()
    out, log = await _lauf(_befund(), snap)
    assert out is not None
    assert out["rule"] == "morning_health_downgrade"
    beleg = log.await_args.kwargs["evidence"]
    # Der Beleg traegt die Messwerte MIT ihrer Basislinie -- nachpruefbar,
    # nicht bloss plausibel.
    assert beleg["level"] == "elevated"
    assert {s["metric"] for s in beleg["signals"]} == {"rhr", "respiration"}
    assert beleg["signals"][0]["baseline"] == 48.0
    # Und den Grundsatz, nach dem entschieden wurde.
    assert "Infekt" in beleg["principle_de"]
    # Der Satz nennt die Werte, die gemeinsam abweichen.
    assert "Ruhepuls" in out["message_de"] and "Atemfrequenz" in out["message_de"]


@pytest.mark.asyncio
async def test_starker_befund_macht_heute_zum_ruhetag():
    snap, ziel = _snap()
    out, _ = await _lauf(_befund("high"), snap)
    assert out is not None
    assert ziel.template_id == "rest_day"


@pytest.mark.asyncio
async def test_greift_nicht_auf_morgen_vor():
    # Reichweite: nur heute. Zwei Tage Ruhe ist die Reichweite der
    # Selbstauskunft, nicht die eines Armbands.
    snap, _ = _snap()
    out, _ = await _lauf(_befund("high"), snap)
    assert out["dates"] == [HEUTE.isoformat()]


@pytest.mark.asyncio
@pytest.mark.parametrize("befund,warum", [
    (_befund("none"), "kein Befund, kein Eingriff"),
    (_befund("watch"), "ein Beobachtungshinweis loescht kein Training"),
])
async def test_schwache_befunde_fassen_den_plan_nicht_an(befund, warum):
    snap, _ = _snap()
    out, log = await _lauf(befund, snap)
    assert out is None, warum
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_selbstauskunft_hat_vorrang():
    # R4/R5 hat bereits gehandelt -- kein zweiter Eingriff, kein zweiter Beleg.
    snap, _ = _snap(status="sick")
    out, log = await _lauf(_befund("high"), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_ein_bereits_gefahrener_tag_bleibt_unangetastet():
    snap, _ = _snap(gefahren=999.0)
    out, log = await _lauf(_befund("high"), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_eine_vom_fahrer_gesetzte_einheit_bleibt_unangetastet():
    quelle = next(iter(engine.PROTECTED_SOURCES))
    snap, _ = _snap(quelle=quelle)
    out, log = await _lauf(_befund("high"), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_ein_ruhetag_wird_nicht_noch_einmal_zum_ruhetag():
    snap, _ = _snap(template="rest_day")
    out, log = await _lauf(_befund("high"), snap)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_zweimal_am_selben_tag_greift_nur_einmal():
    snap, _ = _snap()
    out, log = await _lauf(_befund(), snap, schon=True)
    assert out is None
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_ein_befundfehler_kippt_den_lauf_nicht():
    snap, _ = _snap()
    def _explodiert(*a, **k):
        raise RuntimeError("Detektor kaputt")
    with patch.object(engine, "already_adapted", AsyncMock(return_value=False)), \
         patch.object(engine, "log_adaptation", AsyncMock()) as log, \
         patch("app.services.morning_health_detector.verdict_for_rows", _explodiert):
        out = await engine._rule_morning_health(AsyncMock(), snap)
    assert out is None
    log.assert_not_awaited()


# ── Die geteilte Aktualitaetssperre ──────────────────────────────────────────
# Sie liegt seit R7 in `verdict_for_rows`, weil derselbe Befund die Morgenkarte
# UND das heutige Training steuert. Live beobachtet am 27.07.2026: die
# neueste Zeile war vom 20.07. und wurde dauerhaft als "heute frueh" gelesen.

from app.services.morning_health_detector import verdict_for_rows  # noqa: E402


def _zeile(tag, *, rhr=48.0, hrv=60.0, atmung=14.9, spo2=96.0, schlaf=80.0):
    return SimpleNamespace(
        date=tag, recorded_at=datetime(tag.year, tag.month, tag.day, tzinfo=timezone.utc),
        resting_hr=rhr, hrv_status=hrv, respiration_avg=atmung,
        spo2_avg=spo2, sleep_score=schlaf,
    )


def test_ein_befund_von_gestern_gilt_nicht_fuer_heute():
    from datetime import timedelta
    zeilen = [_zeile(HEUTE - timedelta(days=n)) for n in range(20, 0, -1)]
    # Die letzte Zeile ist von gestern, nicht von heute.
    urteil = verdict_for_rows(zeilen, today=HEUTE)
    assert urteil["level"] == "none"
    assert urteil["signals"] == []


def test_ohne_zeilen_kein_urteil():
    urteil = verdict_for_rows([], today=HEUTE)
    assert urteil["level"] == "none" and urteil["signals"] == []


def test_die_letzte_zeile_eines_tages_gewinnt_den_tag():
    from app.services.morning_health_detector import rows_to_daily
    frueh = _zeile(HEUTE, rhr=48.0)
    spaet = _zeile(HEUTE, rhr=55.0)
    taege = rows_to_daily([frueh, spaet])
    assert len(taege) == 1 and taege[0]["rhr"] == 55.0
