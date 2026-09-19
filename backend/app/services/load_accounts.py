"""Die Wochenlast, nach Reiz getrennt gefuehrt.

Bisher fuehrte der Plan EIN Wochenbudget in TSS. Daraus folgte der Pendlerfehler:
Grundlagenumfang aus dem Arbeitsweg lief in dasselbe Budget wie Intervallarbeit,
und wenn das Budget riss, wurde die groesste Einheit gekuerzt -- also die
Qualitaetseinheit, weil die die hoechste TSS-Dichte hat.

Drei Konten statt einer Summe. Die Invariante, um die es geht:

    Grundlagenlast darf niemals Qualitaetslast kuerzen.

Ausarbeitung: `docs/2026-09-19-pendlerfehler-reizkonten.md`, Abschnitt 5.

EHRLICHKEIT UEBER DIE LUECKE. Fahrten ohne Leistungsbezug (keine FTP, kein
Wattmesser) lassen sich nicht einordnen. Sie landen NICHT still auf der
Grundlage -- sie werden in `nicht_einordbar` gefuehrt, damit der Aufrufer weiss,
dass sein Bild unvollstaendig ist, statt eine saubere Summe vorzutaeuschen.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.services.ride_classification import Konto, einordnen


@dataclass
class Kontostand:
    """Was in einem Zeitraum auf welchem Konto gelandet ist."""

    grundlage: float = 0.0
    schwelle: float = 0.0
    hoch: float = 0.0
    #: Anteil der Grundlage, der auf Arbeitswege entfaellt.
    pendeln: float = 0.0
    #: TSS aus Fahrten, die sich nicht einordnen liessen (keine FTP/Leistung).
    nicht_einordbar: float = 0.0
    #: Anzahl erkannter Pendelfahrten -- fuer den Beleg.
    pendelfahrten: int = 0
    pendelgruende: list[str] = field(default_factory=list)

    @property
    def qualitaet(self) -> float:
        """Schwelle + hoch: die Last, die wirklich Erholung kostet."""
        return self.schwelle + self.hoch

    @property
    def gesamt(self) -> float:
        return self.grundlage + self.schwelle + self.hoch + self.nicht_einordbar

    def auf(self, konto: Konto) -> float:
        return {"grundlage": self.grundlage, "schwelle": self.schwelle,
                "hoch": self.hoch}[konto]


async def kontostaende(
    db: AsyncSession,
    user_id: int,
    ftp: int | None,
    *,
    von: date,
    bis: date,
    arbeitstage: set[int] | None = None,
    fenster: tuple[time, time] | None = None,
) -> Kontostand:
    """Die Konten fuer [von, bis], beide Tage einschliesslich."""
    start = datetime.combine(von, time.min).replace(tzinfo=timezone.utc)
    ende = datetime.combine(bis, time.max).replace(tzinfo=timezone.utc)
    res = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.started_at >= start,
            Activity.started_at <= ende,
        )
    )
    stand = Kontostand()
    for a in res.scalars().all():
        tss = float(getattr(a, "tss", None) or 0.0)
        if tss <= 0:
            continue
        e = einordnen(a, ftp, arbeitstage=arbeitstage, fenster=fenster)
        if e is None:
            stand.nicht_einordbar += tss
            continue
        setattr(stand, e.konto, getattr(stand, e.konto) + tss)
        if e.pendelverdacht:
            stand.pendeln += tss
            stand.pendelfahrten += 1
            if e.gruende and len(stand.pendelgruende) < 3:
                stand.pendelgruende.append(", ".join(e.gruende))
    return stand


async def wochenkonten(
    db: AsyncSession, user_id: int, ftp: int | None, *, monday: date,
    arbeitstage: set[int] | None = None, fenster: tuple[time, time] | None = None,
) -> Kontostand:
    """Die laufende Trainingswoche, Montag bis Sonntag."""
    return await kontostaende(
        db, user_id, ftp, von=monday, bis=monday + timedelta(days=6),
        arbeitstage=arbeitstage, fenster=fenster,
    )
