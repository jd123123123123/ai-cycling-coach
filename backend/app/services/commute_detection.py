"""Den Arbeitsweg aus den Fahrten LESEN, statt danach zu fragen.

Die beste Eingabemaske ist die, die niemand ausfuellen muss. Wer viermal die
Woche um 7:40 eine halbe Stunde locker faehrt und um 17:10 dieselbe halbe
Stunde zurueck, hat das dem Plan laengst erzaehlt -- er hat es nur nie gelesen.

WAS HIER NICHT PASSIERT: geraten. Der Befund traegt seine eigene Belastbarkeit
(`sicherheit`) und die Zahl der Fahrten, auf denen er beruht. Unter der
Mindestzahl gibt es KEINEN Befund, nicht einen schwachen -- ein vorausgefuelltes
Formular mit falschen Werten ist schlechter als ein leeres, weil niemand es
nachprueft.

Die Einordnung selbst kommt aus `ride_classification`: kurz, werktags, niedrige
Intensitaet. Hier kommt nur die WIEDERHOLUNG dazu -- eine einzelne lockere
Feierabendrunde ist kein Arbeitsweg, dieselbe Fahrt an vier Dienstagen schon.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services.ride_classification import einordnen

#: Fenster, aus dem gelesen wird. Kuerzer verpasst Urlaube und Wetterwochen,
#: laenger schleppt einen alten Job mit.
FENSTER_TAGE = 56

#: Ein Wochentag gilt erst als Pendeltag, wenn er sich WIEDERHOLT hat.
MIN_FAHRTEN_JE_TAG = 2

#: Und der ganze Befund braucht genug Substanz, um vorausgefuellt zu werden.
MIN_FAHRTEN_GESAMT = 6


@dataclass
class Pendelbefund:
    """Was die Fahrten ueber den Arbeitsweg sagen."""

    wochentage: list[int]                 # 0 = Montag
    minuten_je_richtung: int
    #: Typisches Zeitfenster, aus den Startzeiten.
    frueheste: time | None = None
    spaeteste: time | None = None
    fahrten: int = 0
    #: Anteil der Tage, an denen ZWEI Fahrten lagen (hin und zurueck).
    paar_anteil: float = 0.0
    sicherheit: str = "niedrig"           # hoch | mittel | niedrig
    tage_je_wochentag: dict[int, int] = field(default_factory=dict)

    @property
    def wochentage_kuerzel(self) -> list[str]:
        namen = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
        return [namen[t] for t in sorted(self.wochentage)]


def _sicherheit(fahrten: int, paar_anteil: float, tage: int) -> str:
    """Wie belastbar ist der Befund.

    Drei Signale, und alle drei muessen mitspielen: genug Fahrten, genug
    Wochentage, und Hin-und-Rueckweg-Paare. Paare sind das staerkste davon --
    zweimal dieselbe kurze Strecke an einem Werktag ist schwer anders zu
    erklaeren.
    """
    if fahrten >= 12 and paar_anteil >= 0.5 and tage >= 3:
        return "hoch"
    if fahrten >= MIN_FAHRTEN_GESAMT and tage >= 2:
        return "mittel"
    return "niedrig"


async def detect_commute_pattern(
    db: AsyncSession, user_id: int, ftp: int | None, *, heute: date | None = None,
) -> Pendelbefund | None:
    """Der Pendelbefund aus den letzten Wochen, oder `None`."""
    heute = heute or datetime.now(timezone.utc).date()
    seit = datetime.combine(heute - timedelta(days=FENSTER_TAGE), time.min,
                            tzinfo=timezone.utc)
    res = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.started_at >= seit,
        ).order_by(Activity.started_at.asc())
    )

    je_tag: dict[date, list] = {}
    for a in res.scalars().all():
        e = einordnen(a, ftp)
        if e is None or not e.pendelverdacht:
            continue
        st = getattr(a, "started_at", None)
        if st is None:
            continue
        je_tag.setdefault(st.date(), []).append(a)

    if not je_tag:
        return None

    kandidaten = [a for lst in je_tag.values() for a in lst]
    if len(kandidaten) < MIN_FAHRTEN_GESAMT:
        return None

    # Wochentage, die sich wiederholt haben.
    je_wochentag: dict[int, int] = {}
    for tag, lst in je_tag.items():
        je_wochentag[tag.weekday()] = je_wochentag.get(tag.weekday(), 0) + len(lst)
    wochentage = sorted(w for w, n in je_wochentag.items() if n >= MIN_FAHRTEN_JE_TAG)
    if not wochentage:
        return None

    # Nur Fahrten an den erkannten Tagen zaehlen fuer Dauer und Fenster.
    passend = [a for tag, lst in je_tag.items() if tag.weekday() in wochentage
               for a in lst]
    minuten = round(statistics.median(
        (getattr(a, "duration_seconds", 0) or 0) / 60 for a in passend
    ))
    starts = sorted(a.started_at.time() for a in passend if a.started_at)
    paar_tage = sum(1 for tag, lst in je_tag.items()
                    if tag.weekday() in wochentage and len(lst) >= 2)
    tage_gesamt = sum(1 for tag in je_tag if tag.weekday() in wochentage)

    return Pendelbefund(
        wochentage=wochentage,
        minuten_je_richtung=max(1, minuten),
        frueheste=starts[0] if starts else None,
        spaeteste=starts[-1] if starts else None,
        fahrten=len(passend),
        paar_anteil=round(paar_tage / tage_gesamt, 2) if tage_gesamt else 0.0,
        sicherheit=_sicherheit(len(passend),
                               paar_tage / tage_gesamt if tage_gesamt else 0.0,
                               len(wochentage)),
        tage_je_wochentag=je_wochentag,
    )
