"""Das Alltagsprofil lesen: Arbeitstage, Pendelfenster, freies Trainingsfenster.

Der Plan kannte den Alltag nicht. Er erfuhr von einer Pendelfahrt erst, wenn sie
gefahren und synchronisiert war, beschnitt die Woche nachtraeglich und traf dabei
Qualitaetseinheiten. Vier Angaben genuegen, um das umzudrehen -- mehr wuerde
niemand ausfuellen.

`docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 6.

ROBUST GEGEN MUELL. Das Feld ist JSONB und wird von einem Formular befuellt;
jede Angabe kann fehlen oder Unsinn sein. Jede Funktion hier gibt `None` zurueck,
wenn sie nichts Verlaessliches findet -- und `None` faellt ueberall auf das
bisherige Verhalten zurueck.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import time, timedelta

#: Wochentagskuerzel wie in `days_available` und `hard_day_blackouts`.
_TAGE = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}

#: Wie weit vor Arbeitsbeginn und nach Arbeitsende eine Fahrt noch als
#: Arbeitsweg zaehlt. Grosszuegig, weil Menschen unterschiedlich frueh losfahren
#: -- die Intensitaet entscheidet ohnehin mit.
_FENSTER_PUFFER = timedelta(minutes=120)


@dataclass(frozen=True)
class Alltag:
    arbeitstage: set[int]
    beginn: time | None
    ende: time | None
    pendelt_mit_rad: bool
    pendelminuten: int | None
    #: Nur bei wechselnden Zeiten: Wochentag -> (Beginn, Ende). Leer heisst,
    #: `beginn`/`ende` gelten fuer alle Arbeitstage.
    tageszeiten: dict[int, tuple[time | None, time | None]] = field(default_factory=dict)

    @property
    def pendellast_pro_tag_minuten(self) -> int | None:
        """Hin und zurueck. Ohne Radpendeln: nichts."""
        if not self.pendelt_mit_rad or not self.pendelminuten:
            return None
        return self.pendelminuten * 2


def _uhr(wert: object) -> time | None:
    if not isinstance(wert, str) or ":" not in wert:
        return None
    try:
        h, m = wert.split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, TypeError):
        return None


def aus_profil(profile: object) -> Alltag | None:
    """Das Alltagsprofil, oder `None`, wenn es nicht (brauchbar) ausgefuellt ist."""
    roh = getattr(profile, "work_rhythm", None)
    if not isinstance(roh, dict):
        return None
    tage = {
        _TAGE[t] for t in roh.get("work_days", [])
        if isinstance(t, str) and t in _TAGE
    }
    if not tage:
        return None
    modus = roh.get("commute")
    minuten = roh.get("commute_minutes")
    # Wechselnde Zeiten: je Arbeitstag ein eigenes Paar. Fehlt der Tag, gelten
    # die allgemeinen Zeiten -- niemand muss sieben Zeilen ausfuellen.
    tageszeiten: dict[int, tuple[time | None, time | None]] = {}
    roh_tz = roh.get("day_hours")
    if isinstance(roh_tz, dict):
        for kuerzel, paar in roh_tz.items():
            if kuerzel not in _TAGE or not isinstance(paar, dict):
                continue
            tageszeiten[_TAGE[kuerzel]] = (_uhr(paar.get("start")), _uhr(paar.get("end")))

    return Alltag(
        arbeitstage=tage,
        beginn=_uhr(roh.get("start")),
        ende=_uhr(roh.get("end")),
        tageszeiten=tageszeiten,
        pendelt_mit_rad=modus in ("bike", "partly"),
        pendelminuten=int(minuten) if isinstance(minuten, (int, float)) and minuten > 0 else None,
    )


def pendelfenster(alltag: Alltag | None) -> tuple[time, time] | None:
    """Das Zeitfenster, in dem eine Fahrt ein Arbeitsweg sein KANN.

    Von zwei Stunden vor Arbeitsbeginn bis zwei Stunden nach Arbeitsende. Das
    ist bewusst weit: Es soll nicht entscheiden, sondern nur ausschliessen --
    eine Mittagsrunde am Samstag ist kein Arbeitsweg, eine Fahrt um 7:40 vor
    einem 8:30-Beginn schon.
    """
    if alltag is None:
        return None
    # Bei wechselnden Zeiten den WEITESTEN Tag nehmen. Ein Fenster, das nur den
    # Regeltag abdeckt, wuerde die Fruehschicht als Nicht-Pendelfahrt aussortieren
    # -- und damit genau die Tage verlieren, fuer die es die Angabe ueberhaupt gibt.
    beginne = [t for t, _ in alltag.tageszeiten.values() if t] + \
              ([alltag.beginn] if alltag.beginn else [])
    enden = [t for _, t in alltag.tageszeiten.values() if t] + \
            ([alltag.ende] if alltag.ende else [])
    if not beginne or not enden:
        return None
    alltag = Alltag(
        arbeitstage=alltag.arbeitstage, beginn=min(beginne), ende=max(enden),
        pendelt_mit_rad=alltag.pendelt_mit_rad, pendelminuten=alltag.pendelminuten,
        tageszeiten=alltag.tageszeiten,
    )
    heute = timedelta()

    def _minus(t: time, d: timedelta) -> time:
        ges = timedelta(hours=t.hour, minutes=t.minute) - d
        if ges < heute:
            return time.min
        return (time.min.replace(hour=int(ges.total_seconds() // 3600 % 24),
                                 minute=int(ges.total_seconds() // 60 % 60)))

    def _plus(t: time, d: timedelta) -> time:
        ges = timedelta(hours=t.hour, minutes=t.minute) + d
        if ges >= timedelta(hours=24):
            return time.max
        return time(int(ges.total_seconds() // 3600), int(ges.total_seconds() // 60 % 60))

    return _minus(alltag.beginn, _FENSTER_PUFFER), _plus(alltag.ende, _FENSTER_PUFFER)


def erwartete_pendellast_tss(alltag: Alltag | None, *, if_annahme: float = 0.60) -> float | None:
    """Die Grundlagenlast, die der Arbeitsweg pro Woche VORAUSSICHTLICH bringt.

    TSS = Dauer_h · IF² · 100. Mit IF 0,60 als Annahme fuer lockeres Pendeln --
    die gemessene Intensitaet ersetzt die Annahme, sobald Fahrten vorliegen.
    Der Wert ist eine Planungsgroesse fuer den Wochenaufbau, keine Messung, und
    er ist als solche zu kennzeichnen, wo er angezeigt wird.
    """
    if alltag is None:
        return None
    pro_tag = alltag.pendellast_pro_tag_minuten
    if pro_tag is None:
        return None
    stunden = (pro_tag / 60.0) * len(alltag.arbeitstage)
    return round(stunden * if_annahme * if_annahme * 100, 1)
