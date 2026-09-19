"""Der Pendlerfehler: Grundlagenlast darf niemals Qualitaetslast kuerzen.

Die Klage, woertlich: "Wenn mein Plan FTP oder VO2max vorsieht und meine
VO2max-Einheiten dann reduziert werden, weil ich zur Arbeit gefahren bin -- dann
habe ich doch keinen echten Trainingsreiz mehr, oder?"

Sie war im Code exakt reproduzierbar. `plan_absorption` waehlte sein Opfer aus
`filler_pool or fresh`: solange ein Grundlagentag uebrig war, blieb die
Qualitaetseinheit verschont -- war keiner mehr da, griff `max(_tss_of)` zur
groessten Einheit, also zur VO2max- oder Schwelleneinheit. Wer taeglich pendelt,
verbraucht genau diese Grundlagentage zuerst. Der Schutz versagte also
strukturell bei der Gruppe, fuer die er gedacht war.

Ausarbeitung: `docs/2026-09-19-pendlerfehler-reizkonten.md`.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services.plan_absorption import choose_victim
from app.services.ride_classification import einordnen, konto_fuer_if


def _einheit(template_id, quelle="ai_prescribed"):
    return SimpleNamespace(template_id=template_id, blocks_source=quelle,
                           title=template_id)


# ── Die Invariante ──────────────────────────────────────────────────────────

def test_ein_grundlagentag_weicht_zuerst():
    # Unveraendertes Verhalten, wenn ein Fuellertag da ist.
    woche = [_einheit("vo2_5x4"), _einheit("z2_endurance_60"), _einheit("z2_long_120")]
    opfer = choose_victim(woche, frozenset())
    assert opfer is not None
    assert opfer.template_id in ("z2_endurance_60", "z2_long_120")


def test_ohne_grundlagentag_bleibt_die_qualitaetseinheit_stehen():
    # DER KERN. Frueher waere hier vo2_5x4 das Opfer gewesen -- die groesste
    # Einheit der Woche. Ein gestrichenes Intervall laesst sich innerhalb der
    # Woche nicht durch Umfang ersetzen.
    woche = [_einheit("vo2_5x4"), _einheit("threshold_2x15")]
    assert choose_victim(woche, frozenset()) is None


def test_eine_leere_woche_hat_kein_opfer():
    assert choose_victim([], frozenset()) is None


def test_eine_vom_fahrer_gesetzte_einheit_ist_kein_opfer():
    quelle = "user_modified"
    woche = [_einheit("z2_endurance_60", quelle)]
    assert choose_victim(woche, frozenset({quelle})) is None


# ── Die Einordnung ──────────────────────────────────────────────────────────

def test_die_zonengrenzen_sind_die_geliehenen():
    # Wortgleich mit `advanced_metrics.zone_distribution`: < 0,77 / <= 1,00.
    assert konto_fuer_if(0.55) == "grundlage"
    assert konto_fuer_if(0.76) == "grundlage"
    assert konto_fuer_if(0.77) == "schwelle"
    assert konto_fuer_if(1.00) == "schwelle"
    assert konto_fuer_if(1.05) == "hoch"


def _fahrt(minuten, np_, *, tag=None, stunde=8):
    # 2026-09-15 ist ein Dienstag.
    t = tag or datetime(2026, 9, 15, stunde, 0, tzinfo=timezone.utc)
    return SimpleNamespace(sport="cycling", duration_seconds=minuten * 60,
                           normalized_power=np_, average_power=np_,
                           started_at=t, tss=30.0)


def test_eine_lockere_kurze_werktagsfahrt_gilt_als_arbeitsweg():
    e = einordnen(_fahrt(28, 140), ftp=250)
    assert e is not None
    assert e.konto == "grundlage"
    assert e.pendelverdacht is True


def test_der_schnelle_arbeitsweg_gilt_NICHT_als_grundlage():
    # Gruppe E der Ausarbeitung: wer den Arbeitsweg sprintet, hat seine
    # Intensitaet bereits verbraucht. Ihn als Grundlage zu fuehren wuerde den
    # Fehler umkehren und ihm abends unveraendert VO2max geben.
    e = einordnen(_fahrt(28, 240), ftp=250)   # IF 0,96
    assert e is not None
    assert e.konto == "schwelle"
    assert e.pendelverdacht is False


def test_eine_lange_lockere_ausfahrt_ist_kein_arbeitsweg():
    e = einordnen(_fahrt(150, 140), ftp=250)
    assert e is not None
    assert e.konto == "grundlage"
    assert e.pendelverdacht is False


def test_am_wochenende_ohne_profil_kein_pendelurteil():
    sonntag = datetime(2026, 9, 20, 8, 0, tzinfo=timezone.utc)
    e = einordnen(_fahrt(28, 140, tag=sonntag), ftp=250)
    assert e is not None and e.pendelverdacht is False


def test_ohne_leistungsbezug_gibt_es_keine_einordnung():
    # KEIN RATEN. Ohne FTP oder Leistung waere jede Einordnung erfunden -- und
    # eine falsch als "Grundlage" gefuehrte harte Fahrt schuetzt Intervalle,
    # die der Fahrer laengst verbraucht hat.
    assert einordnen(_fahrt(28, None), ftp=250) is None
    assert einordnen(_fahrt(28, 140), ftp=None) is None


def test_laufen_wird_nicht_eingeordnet():
    lauf = _fahrt(28, 140)
    lauf.sport = "running"
    assert einordnen(lauf, ftp=250) is None


# ── Das Alltagsprofil ───────────────────────────────────────────────────────

from datetime import time  # noqa: E402

from app.services.work_rhythm import (  # noqa: E402
    aus_profil, erwartete_pendellast_tss, pendelfenster,
)


def _profil(**over):
    roh = {"work_days": ["mon", "tue", "wed", "thu", "fri"],
           "start": "08:30", "end": "17:00",
           "commute": "bike", "commute_minutes": 28}
    roh.update(over)
    return SimpleNamespace(work_rhythm=roh)


def test_liest_arbeitstage_und_zeiten():
    a = aus_profil(_profil())
    assert a is not None
    assert a.arbeitstage == {0, 1, 2, 3, 4}
    assert a.beginn == time(8, 30) and a.ende == time(17, 0)
    assert a.pendellast_pro_tag_minuten == 56


def test_ohne_profil_kein_alltag():
    assert aus_profil(SimpleNamespace(work_rhythm=None)) is None
    assert aus_profil(SimpleNamespace()) is None


def test_muell_im_feld_kippt_nichts():
    # Das Feld ist JSONB aus einem Formular -- jede Angabe kann Unsinn sein.
    assert aus_profil(SimpleNamespace(work_rhythm={"work_days": []})) is None
    assert aus_profil(SimpleNamespace(work_rhythm="Montag bis Freitag")) is None
    a = aus_profil(_profil(start="acht Uhr", commute_minutes="viel"))
    assert a is not None and a.beginn is None and a.pendelminuten is None


def test_wer_nicht_mit_dem_rad_pendelt_bringt_keine_pendellast():
    a = aus_profil(_profil(commute="none"))
    assert a is not None and a.pendellast_pro_tag_minuten is None
    assert erwartete_pendellast_tss(a) is None


def test_das_pendelfenster_umfasst_hin_und_rueckweg():
    f = pendelfenster(aus_profil(_profil()))
    assert f is not None
    von, bis = f
    assert von == time(6, 30) and bis == time(19, 0)


def test_ohne_uhrzeiten_kein_fenster():
    assert pendelfenster(aus_profil(_profil(start=None, end=None))) is None


def test_erwartete_wochenlast_ist_eine_planungsgroesse():
    # 5 Tage x 56 min = 4,67 h; TSS = 4,67 · 0,6² · 100 ≈ 168
    tss = erwartete_pendellast_tss(aus_profil(_profil()))
    assert tss is not None and 160 <= tss <= 175


# ── Die Schnittstelle weist Unsinn am Rand ab ───────────────────────────────

from pydantic import ValidationError  # noqa: E402

from app.schemas.athlete import WorkRhythm  # noqa: E402


def test_ein_vollstaendiges_profil_wird_angenommen():
    w = WorkRhythm(work_days=["mon", "fri"], start="08:30", end="17:00",
                   commute="bike", commute_minutes=28)
    assert w.commute_minutes == 28


@pytest.mark.parametrize("feld,wert", [
    ("work_days", ["montag"]),
    ("start", "8 Uhr"),
    ("end", "25:00"),
    ("commute", "Auto"),
    ("commute_minutes", 0),
    # Ein Arbeitsweg ueber zwei Stunden je Richtung ist fast sicher ein
    # Vertipper -- und wuerde als Pendellast den halben Plan auffressen.
    ("commute_minutes", 240),
])
def test_unsinn_scheitert_am_rand(feld, wert):
    with pytest.raises(ValidationError):
        WorkRhythm(**{feld: wert})


def test_ein_leeres_profil_ist_erlaubt():
    # Niemand muss das ausfuellen. Ohne Angaben faellt alles auf das bisherige
    # Verhalten zurueck.
    w = WorkRhythm()
    assert w.work_days == [] and w.commute is None
