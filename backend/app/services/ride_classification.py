"""Auf welches Reizkonto eine Fahrt gehoert — gemessen, nicht geraten.

DAS PROBLEM, DAS DIESE DATEI LOEST. Eine skalare Trainingslast ist reizblind:
90 min Pendeln bei IF 0,55 und 50 min VO2max-Intervalle koennen denselben
TSS-Wert tragen und haben physiologisch fast nichts gemeinsam. Der Planer
verrechnete beide gegeneinander und strich deshalb Qualitaetseinheiten, weil
jemand zur Arbeit geradelt war -- der Reiz, den nur hohe Intensitaet erzeugt,
verschwand, waehrend der Umfang wuchs.

Ausarbeitung: `docs/2026-09-19-pendlerfehler-reizkonten.md`.

DIE SCHWELLEN SIND GELIEHEN, NICHT ERFUNDEN. `advanced_metrics.zone_distribution`
teilt seit je bei IF < 0,77 und IF <= 1,00 (Seiler-Dreizonenmodell). Zwei
Stellen, die Intensitaet verschieden einordnen, laufen in diesem Repo
zuverlaessig auseinander -- deshalb stehen die Grenzen hier einmal und werden
dort importiert, nicht kopiert.

WAS HIER NICHT PASSIERT. Es wird nicht geraten. Ohne Leistungsbezug (kein NP
oder average_power, keine FTP) gibt es KEIN Konto -- `None`, und der Aufrufer
behandelt die Fahrt wie bisher. Eine falsch einsortierte harte Fahrt waere
schlimmer als der Zustand vor dieser Datei: Sie wuerde die Intervalle von
jemandem schuetzen, der seine Intensitaet bereits auf dem Arbeitsweg verbraucht
hat.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import time
from typing import Any, Literal

#: Reizkonten. Grundlage ersetzt Grundlage; sie ersetzt niemals Qualitaet.
Konto = Literal["grundlage", "schwelle", "hoch"]

#: Seiler-Dreizonengrenzen, wortgleich mit `advanced_metrics.zone_distribution`.
#: Wer sie hier aendert, aendert auch die Verteilung auf der Analytik-Flaeche.
IF_Z1_MAX = 0.77
IF_Z2_MAX = 1.00

#: Eine Fahrt laenger als das ist kein Arbeitsweg mehr, egal wie locker.
PENDEL_MAX_MINUTEN = 75
#: Und kuerzer als das traegt keine nennenswerte Last.
PENDEL_MIN_MINUTEN = 8


@dataclass(frozen=True)
class Einordnung:
    """Was diese Fahrt fuer den Plan bedeutet."""

    konto: Konto
    intensity_factor: float
    #: Nur wahr, wenn es dafuer Belege gibt -- siehe `_pendel_indizien`.
    pendelverdacht: bool
    #: Die Indizien im Klartext, damit der Beleg sie zeigen kann.
    gruende: tuple[str, ...]


def konto_fuer_if(intensity_factor: float) -> Konto:
    """Die reine Abbildung Intensitaet -> Konto."""
    if intensity_factor < IF_Z1_MAX:
        return "grundlage"
    if intensity_factor <= IF_Z2_MAX:
        return "schwelle"
    return "hoch"


def _intensity_factor(activity: Any, ftp: int | None) -> float | None:
    """NP bevorzugt, average_power als Rueckfall -- wie in `zone_distribution`."""
    if not ftp or ftp <= 0:
        return None
    np_ = getattr(activity, "normalized_power", None)
    if np_:
        return float(np_) / ftp
    ap = getattr(activity, "average_power", None)
    if ap:
        return float(ap) / ftp
    return None


def _pendel_indizien(
    activity: Any,
    intensity_factor: float,
    *,
    arbeitstage: set[int] | None = None,
    fenster: tuple[time, time] | None = None,
) -> tuple[bool, tuple[str, ...]]:
    """Indizien fuer einen Arbeitsweg. KONSERVATIV: im Zweifel nein.

    Eine faelschlich als Pendelfahrt gefuehrte harte Einheit kehrt den Fehler um
    (Gruppe E der Ausarbeitung: wer den Arbeitsweg sprintet, hat seine Intensitaet
    schon verbraucht). Deshalb ist niedrige Intensitaet eine NOTWENDIGE, keine
    hinreichende Bedingung -- ohne sie gibt es kein Pendelurteil.
    """
    if intensity_factor >= IF_Z1_MAX:
        return False, ()

    gruende: list[str] = []
    dauer_s = getattr(activity, "duration_seconds", None) or 0
    minuten = dauer_s / 60.0
    if not (PENDEL_MIN_MINUTEN <= minuten <= PENDEL_MAX_MINUTEN):
        return False, ()
    gruende.append(f"{round(minuten)} min")

    start = getattr(activity, "started_at", None)
    if start is not None:
        if arbeitstage is not None:
            if start.weekday() not in arbeitstage:
                return False, ()
            gruende.append("Arbeitstag")
        elif start.weekday() >= 5:
            # Ohne Profil: Wochenende ist kein Arbeitsweg.
            return False, ()
        if fenster is not None:
            von, bis = fenster
            if not (von <= start.time() <= bis):
                return False, ()
            gruende.append("im Pendelfenster")

    gruende.append(f"IF {intensity_factor:.2f}")
    return True, tuple(gruende)


def einordnen(
    activity: Any,
    ftp: int | None,
    *,
    arbeitstage: set[int] | None = None,
    fenster: tuple[time, time] | None = None,
) -> Einordnung | None:
    """Die Einordnung einer Fahrt, oder `None`, wenn sie nicht messbar ist.

    `arbeitstage` und `fenster` stammen aus dem Alltagsprofil. Fehlen sie, faellt
    die Erkennung auf die schwaechere Heuristik zurueck (Werktag + Dauer +
    niedrige Intensitaet) -- nutzbar, aber absichtlich zurueckhaltend.
    """
    if (getattr(activity, "sport", None) or "").lower() not in ("cycling", "biking", ""):
        return None
    if_ = _intensity_factor(activity, ftp)
    if if_ is None:
        return None
    pendel, gruende = _pendel_indizien(
        activity, if_, arbeitstage=arbeitstage, fenster=fenster
    )
    return Einordnung(
        konto=konto_fuer_if(if_),
        intensity_factor=round(if_, 3),
        pendelverdacht=pendel,
        gruende=gruende,
    )
