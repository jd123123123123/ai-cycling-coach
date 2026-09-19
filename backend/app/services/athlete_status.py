"""Wer sich krank meldet, wird wieder gefragt.

DAS PROBLEM. `athlete_status` wurde einmal gesetzt und nie wieder angefasst:
{"state": "sick", "since": "2026-09-17"}. Danach unterdrueckte
`illness_interlock` das Training -- taeglich, unbefristet, ohne dass jemand
noch einmal nachfragte. In der Produktion gemessen: ein Fahrer stand seit dem
17.09. auf krank, waehrend seine Bereitschaft laengst wieder bei 72 lag. Der
Plan wartete auf eine Entwarnung, die niemand je erbeten hatte.

DIE REGEL. Solange ein Status nicht "healthy" ist, wird er EINMAL PRO
ATHLETEN-LOKALEM TAG zur Bestaetigung vorgelegt. Nicht oefter: eine zweite
Frage am selben Tag ist Draengeln.

WAS NICHT PASSIERT: automatisches Zuruecksetzen. Es waere bequem, den Status
nach drei Tagen von selbst auf "gesund" fallen zu lassen -- und es waere
falsch. Dann liefe das volle Programm wieder an, weil eine Frist abgelaufen
ist, nicht weil es dem Fahrer besser geht. Nur seine Antwort aendert den
Zustand; diese Datei sorgt lediglich dafuer, dass die Frage ueberhaupt
gestellt wird.

ALTE ZEILEN HABEN KEIN `confirmed_on`. Sie zaehlen als am Tag der Meldung
bestaetigt -- wer seit Tagen auf krank steht, bekommt die Frage also sofort.
Genau das ist der Fall, der diese Datei ausgeloest hat.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

#: Zustaende, die den Plan anhalten und deshalb nachgefragt werden muessen.
PAUSIERENDE = frozenset({"sick", "injured", "break"})


@dataclass(frozen=True)
class StatusLage:
    state: str
    since: date | None
    confirmed_on: date | None
    #: Wie lange der Plan schon ruht -- der Preis, der sichtbar gehoert.
    tage_pausiert: int | None
    #: Heute noch nicht bestaetigt: die Frage steht an.
    nachfragen: bool


def _tag(wert: object) -> date | None:
    if not isinstance(wert, str):
        return None
    try:
        return date.fromisoformat(wert)
    except ValueError:
        return None


def lage(goals: object, *, heute: date) -> StatusLage:
    """Den Status aus `profile.goals` lesen und beurteilen."""
    roh = goals.get("athlete_status") if isinstance(goals, dict) else None
    roh = roh if isinstance(roh, dict) else {}
    state = str(roh.get("state") or "healthy")
    if state not in PAUSIERENDE:
        return StatusLage("healthy", None, None, None, False)

    since = _tag(roh.get("since"))
    # Fehlt die Bestaetigung, gilt der Meldetag als letzte Antwort.
    confirmed = _tag(roh.get("confirmed_on")) or since
    tage = (heute - since).days if since else None
    return StatusLage(
        state=state,
        since=since,
        confirmed_on=confirmed,
        tage_pausiert=tage,
        nachfragen=confirmed is None or confirmed < heute,
    )


def satz(l: StatusLage) -> str | None:
    """Was der Fahrer liest -- der Preis zuerst, dann die Frage.

    Die Zahl steht bewusst drin: "krank gemeldet" ist eine Einstellung, "seit
    vier Tagen ruht dein Plan" ist eine Tatsache mit Folgen.
    """
    if not l.nachfragen:
        return None
    wort = {"sick": "krank", "injured": "verletzt", "break": "in der Pause"}.get(l.state)
    if l.tage_pausiert is None or l.tage_pausiert < 1:
        return f"Du stehst auf {wort}. Passt das noch?"
    if l.tage_pausiert == 1:
        return f"Seit gestern stehst du auf {wort} — dein Plan ruht. Passt das noch?"
    return (
        f"Seit {l.tage_pausiert} Tagen stehst du auf {wort} — so lange ruht "
        "dein Plan. Passt das noch?"
    )
