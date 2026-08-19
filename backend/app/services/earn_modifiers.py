"""What the rider's bike adds to a ride's earn — the equipment layer.

FOUR RULES THIS FILE IS BUILT ON. None of them is decoration.

1. CONDITIONAL, NEVER FLAT. A flat "+10 % forever" is invisible after a week: it
   is not a decision, it is just a bigger number, and it inflates the economy on
   every ride with nothing regulating it. A bonus that only fires when the ride
   actually matched makes the rider CHOOSE before going out, regulates itself
   (a bonus firing on a third of rides costs a third as much), and is true to
   the sport — cyclists really do swap tyres and wheels for the day.

2. SLOTS, SO THE CHOICE IS REAL. One item per slot. Owning everything must not
   mean wearing everything, or the loadout stops being a decision and becomes a
   checklist — which is the single fastest way to kill an equipment system.
   Owning more should widen the CHOICE, not raise the floor.

3. A BONUS, NEVER A PENALTY. The maintenance modifier is where this matters
   most. "+12 % while the drivetrain is fresh" and "-12 % while it is dirty" are
   the same arithmetic and a completely different product: the first is a thing
   the rider can go and win this afternoon, the second is the app charging them
   for a fortnight of illness. `w3BikeSoul` already states the house position —
   an idle bike is an invitation, not a debt — and this file holds that line in
   the one place it would be easiest to quietly break.

4. NOTHING FIRES ON A FACT WE DO NOT HAVE. A modifier whose fact is None does
   not fire. A rider is never awarded a rain bonus because we could not tell
   whether it rained — one invented bonus makes every real one untrustworthy.

STACKING IS CAPPED. Uncapped additive multipliers are the documented way game
economies die: the faucet opens, the drain does not, and the currency stops
meaning anything. The streak multiplier is NOT here — it lives in
`rewards.streak_multiplier`, caps at x1.5 on its own, and stays a separate
system so neither has to reason about the other's ceiling.

ON THE CATALOGUE'S CHARACTER. Cycling has a culture worth mining, and several
items exist because they are FUNNY or because they reward something a coach
actually wants. `lanterne_rouge` pays for taking the easy day easy — the hardest
thing to get an enthusiastic athlete to do, and the one a training plan most
needs. `regel_neun` is the sufferfest badge: cold, wet and long, and it pays
like it. An equipment list that is only stat sticks is a spreadsheet.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

#: The most the equipment layer may ever add, as a percentage of base earn.
MAX_BONUS_PCT = 60

#: What the drivetrain bonus is worth while the bike is freshly serviced. Sized
#: to sit mid-table among the equipment bonuses: maintenance should be clearly
#: worth doing and never so dominant that it is the only thing that is.
CONDITION_BONUS_PCT = 12


# ── slots ───────────────────────────────────────────────────────────────────
#: One item may be equipped per slot. Five slots is enough for a real decision
#: and few enough that a rider can hold the whole loadout in their head.
#: Labels are short because the loadout rail draws all five across a 390 px
#: screen — "GLÜCKSBRINGER" truncated to "GLÜCKSBRIN…" there, which is the kind
#: of detail that makes a screen look unfinished. Kept German and kept whole.
SLOTS: dict[str, str] = {
    "tyres": "REIFEN",
    "wheels": "LAUFRÄDER",
    "mounted": "ANBAU",
    "cockpit": "COCKPIT",
    "charm": "GLÜCK",
}

#: Rarity drives price and how loudly the item is drawn. It does NOT strictly
#: drive percentage — a common item on the right day can out-earn a legendary
#: one on the wrong day, which is what keeps the common items worth owning.
RARITIES = ("common", "rare", "legendary")

# ── PRICES. NOTHING HERE IS EVER GRANTED ────────────────────────────────────
#
# Every item is bought with RideCoin the rider earned. There is no starter item,
# no free tier and no onboarding grant in this catalogue — `services/gear.buy`
# is the only way an item is ever owned, and it debits through `rewards.spend`.
#
# Priced off rarity in ONE place rather than per item, so the whole curve can be
# retuned against real ledger data by editing three numbers instead of thirty.
#
# Sized against a regular rider's income — roughly 100 RC a ride plus a 150 RC
# chain harvest every few weeks, so call it 500-700 RC a week:
#
#   common     ~1 week of riding   — something to buy most weeks
#   rare       ~3 weeks            — a decision, and a small wait
#   legendary  ~7 weeks            — a genuine goal you ride toward
#
# The full catalogue is deliberately about a year of collecting. That is the
# long-tail sink the economy needs: a currency with nothing left to buy stops
# being worth earning.
PRICE_BY_RARITY: dict[str, int] = {
    "common": 600,
    "rare": 1800,
    "legendary": 4500,
}


@dataclass(frozen=True)
class RideFacts:
    """What actually happened on a ride, as the modifiers need to see it.

    Every field is optional because every field comes from a device or a service
    that may not have reported it. See rule 4: a missing fact never fires.
    """

    distance_m: float | None = None
    elevation_gain_m: float | None = None
    duration_s: float | None = None
    avg_speed_kmh: float | None = None
    #: True only when the weather service actually reported precipitation.
    was_wet: bool | None = None
    #: Air temperature in °C, from the weather service.
    temp_c: float | None = None
    #: 'road' | 'gravel' | 'mtb' — from the activity's own surface read.
    surface: str | None = None
    #: Whether the ride ran outside daylight.
    in_dark: bool | None = None
    #: Local hour the ride started, 0-23.
    start_hour: int | None = None
    #: Intensity factor — the real Coggan ratio, when power made it computable.
    intensity_factor: float | None = None
    #: Steepest sustained gradient, in percent.
    max_gradient_pct: float | None = None
    #: True when this ride was ridden with at least one crew member.
    with_crew: bool | None = None
    #: True when the PLAN called for an easy day and the rider kept it easy.
    #: The one fact here that is a coaching judgement rather than a measurement.
    honoured_easy_day: bool | None = None
    #: True when the ride recorded power at all — the gateway fact.
    has_power: bool | None = None
    #: Whether the drivetrain was inside its service interval for this ride.
    drivetrain_fresh: bool | None = None


@dataclass(frozen=True)
class Modifier:
    """One earn-enhancing item.

    `applies` is a pure predicate and MUST return False when the fact it needs
    is None. `why` is shown to the rider whether it fires or not — an equipment
    bonus nobody can predict is a lottery, not a loadout.
    """

    id: str
    name_de: str
    slot: str
    rarity: str
    #: Percentage points added to base earn when it fires.
    pct: int
    #: The rule, in the rider's language.
    why: str
    #: One line of character. Not mechanical — this is why the item is fun.
    flavour_de: str
    applies: Callable[[RideFacts], bool] = field(repr=False)

    @property
    def price_rc(self) -> int:
        """What it costs. Every item costs something; see `PRICE_BY_RARITY`."""
        return PRICE_BY_RARITY[self.rarity]


# ── predicates ──────────────────────────────────────────────────────────────
# Written out rather than inlined so each can say, in its own name, what it is
# actually testing — and so `None` handling is visible instead of implied.

def _km(f: RideFacts) -> float:
    return (f.distance_m or 0) / 1000


def _per_km(f: RideFacts) -> float | None:
    """Metres climbed per kilometre — the standard "how hilly" ratio."""
    if f.elevation_gain_m is None or not f.distance_m:
        return None
    return f.elevation_gain_m / (f.distance_m / 1000)


def _flat_and_fast(f: RideFacts) -> bool:
    pk = _per_km(f)
    return f.avg_speed_kmh is not None and pk is not None and f.avg_speed_kmh >= 28 and pk < 6


def _time_trial(f: RideFacts) -> bool:
    """Genuinely a TT effort: flat, fast, and sustained hard."""
    pk = _per_km(f)
    return (
        f.avg_speed_kmh is not None and pk is not None and f.intensity_factor is not None
        and f.avg_speed_kmh >= 34 and pk < 4 and f.intensity_factor >= 0.85
    )


def _sufferfest(f: RideFacts) -> bool:
    """Rule #9 conditions: cold, wet, and long enough to have hurt."""
    return (
        f.was_wet is True and f.temp_c is not None and f.temp_c <= 8 and _km(f) >= 50
    )


def _dawn(f: RideFacts) -> bool:
    return f.start_hour is not None and 4 <= f.start_hour < 8


def _unhurried(f: RideFacts) -> bool:
    """The anti-Strava bonus: a genuinely gentle ride, of real length."""
    return f.avg_speed_kmh is not None and f.avg_speed_kmh < 20 and _km(f) >= 25


# ── the catalogue ───────────────────────────────────────────────────────────
def _m(**kw) -> Modifier:
    return Modifier(**kw)


_ALL: list[Modifier] = [
    # ── REIFEN ──────────────────────────────────────────────────────────────
    _m(id="gravel_tyres", name_de="Gravel-Stollen", slot="tyres", rarity="common", pct=15,
       why="Zählt auf Schotter und Trails.",
       flavour_de="Grober Stollen, breite Karkasse. Asphalt ist optional.",
       applies=lambda f: f.surface in ("gravel", "mtb")),
    _m(id="slicks", name_de="Slicks", slot="tyres", rarity="common", pct=12,
       why="Zählt trocken auf der Straße ab 28 km/h Schnitt.",
       flavour_de="Kein Profil, kein Widerstand, keine Ausreden.",
       applies=lambda f: f.surface == "road" and f.was_wet is False and _flat_and_fast(f)),
    _m(id="winter_tyres", name_de="Spike-Reifen", slot="tyres", rarity="rare", pct=28,
       why="Zählt unter 3 °C.",
       flavour_de="Für Tage, an denen vernünftige Menschen den Bus nehmen.",
       applies=lambda f: f.temp_c is not None and f.temp_c < 3),
    _m(id="tubulars", name_de="Schlauchreifen", slot="tyres", rarity="rare", pct=20,
       why="Zählt bei harten Einheiten ab IF 0,85.",
       flavour_de="Schnell, leicht, und im Pannenfall ein sehr langer Heimweg.",
       applies=lambda f: f.intensity_factor is not None and f.intensity_factor >= 0.85),
    _m(id="balloon_tyres", name_de="Ballonreifen", slot="tyres", rarity="common", pct=18,
       why="Zählt auf ruhigen Fahrten unter 20 km/h ab 25 km.",
       flavour_de="Fährt über alles drüber. Hat es nie eilig.",
       applies=_unhurried),

    # ── LAUFRÄDER ───────────────────────────────────────────────────────────
    _m(id="climbing_wheels", name_de="Kletter-Laufräder", slot="wheels", rarity="common", pct=18,
       why="Zählt ab 1 000 Höhenmetern.",
       flavour_de="Jedes eingesparte Gramm zählt — behauptet jedenfalls die Werbung.",
       applies=lambda f: (f.elevation_gain_m or 0) >= 1000),
    _m(id="aero_wheels", name_de="Aero-Laufräder", slot="wheels", rarity="common", pct=12,
       why="Zählt flach und schnell — ab 28 km/h Schnitt.",
       flavour_de="Klingt im Seitenwind wie ein startendes Flugzeug.",
       applies=_flat_and_fast),
    _m(id="disc_wheel", name_de="Scheibenrad", slot="wheels", rarity="legendary", pct=32,
       why="Zählt nur im echten Zeitfahren: flach, ab 34 km/h, IF ab 0,85.",
       flavour_de="Ein Rad ohne Speichen und ohne Sinn für Kompromisse.",
       applies=_time_trial),
    _m(id="steel_rims", name_de="Stahlfelgen", slot="wheels", rarity="rare", pct=16,
       why="Zählt auf ruhigen Fahrten unter 20 km/h ab 25 km.",
       flavour_de="Schwer wie Blei, hält länger als du.",
       applies=_unhurried),
    _m(id="deep_carbon", name_de="Hochprofil-Carbon", slot="wheels", rarity="rare", pct=22,
       why="Zählt ab 34 km/h Schnitt.",
       flavour_de="Sieht schnell aus. Ist es zufällig auch.",
       applies=lambda f: f.avg_speed_kmh is not None and f.avg_speed_kmh >= 34),

    # ── ANBAU ───────────────────────────────────────────────────────────────
    _m(id="mudguards", name_de="Schutzbleche", slot="mounted", rarity="common", pct=20,
       why="Zählt, wenn es geregnet hat.",
       flavour_de="Der Unterschied zwischen einem Regenstreifen und einer Dusche.",
       applies=lambda f: f.was_wet is True),
    _m(id="dynamo_light", name_de="Nabendynamo", slot="mounted", rarity="rare", pct=25,
       why="Zählt im Dunkeln.",
       flavour_de="Geht nie aus. Braucht nie Akku. Summt ein bisschen.",
       applies=lambda f: f.in_dark is True),
    _m(id="bikepacking_bags", name_de="Bikepacking-Taschen", slot="mounted", rarity="common", pct=22,
       why="Zählt ab 100 km.",
       flavour_de="Alles dabei, was du brauchst. Und drei Dinge, die du nie auspackst.",
       applies=lambda f: _km(f) >= 100),
    _m(id="second_cage", name_de="Zweiter Flaschenhalter", slot="mounted", rarity="common", pct=16,
       why="Zählt über 25 °C.",
       flavour_de="Die eine Flasche, die den Unterschied macht.",
       applies=lambda f: f.temp_c is not None and f.temp_c > 25),
    _m(id="frame_pump", name_de="Rahmenpumpe", slot="mounted", rarity="common", pct=14,
       why="Zählt ab 3 Stunden im Sattel.",
       flavour_de="Wiegt nichts, bis du sie brauchst. Dann wiegt sie alles.",
       applies=lambda f: (f.duration_s or 0) >= 3 * 3600),
    _m(id="rack", name_de="Gepäckträger", slot="mounted", rarity="common", pct=13,
       why="Zählt auf kurzen flachen Fahrten unter 25 km.",
       flavour_de="Nicht schnell. Sehr nützlich.",
       applies=lambda f: 0 < _km(f) < 25 and (_per_km(f) or 99) < 6),

    # ── COCKPIT ─────────────────────────────────────────────────────────────
    _m(id="power_meter", name_de="Powermeter", slot="cockpit", rarity="common", pct=8,
       why="Zählt auf jeder Fahrt mit Wattmessung.",
       flavour_de="Die Zahl, die nicht lügt. Leider.",
       applies=lambda f: f.has_power is True),
    _m(id="aero_bars", name_de="Zeitfahraufsatz", slot="cockpit", rarity="rare", pct=24,
       why="Zählt flach und schnell — ab 28 km/h Schnitt.",
       flavour_de="Bequem ist etwas anderes. Schnell ist genau das hier.",
       applies=_flat_and_fast),
    _m(id="climbing_bars", name_de="Flare-Lenker", slot="cockpit", rarity="common", pct=15,
       why="Zählt auf Schotter und Trails.",
       flavour_de="Ausgestellt, breit, und im Downhill dein bester Freund.",
       applies=lambda f: f.surface in ("gravel", "mtb")),
    _m(id="bell", name_de="Messingklingel", slot="cockpit", rarity="common", pct=12,
       why="Zählt auf Fahrten mit deiner Crew.",
       flavour_de="Ein freundliches Ding. Klingt teurer, als sie war.",
       applies=lambda f: f.with_crew is True),
    _m(id="bar_bag", name_de="Lenkertasche", slot="cockpit", rarity="common", pct=15,
       why="Zählt auf Fahrten, die vor 8 Uhr starten.",
       flavour_de="Riegel, Kamera, Kleingeld fürs Café.",
       applies=_dawn),

    # ── GLÜCKSBRINGER ───────────────────────────────────────────────────────
    # The fun slot. Nothing here is standard equipment and most of it is a joke
    # a cyclist would get.
    _m(id="regel_neun", name_de="Regel-9-Aufkleber", slot="charm", rarity="legendary", pct=35,
       why="Zählt bei Regen unter 8 °C ab 50 km.",
       flavour_de="Wer bei diesem Wetter fährt, ist Hardcore. Punkt.",
       applies=_sufferfest),
    _m(id="lanterne_rouge", name_de="Lanterne Rouge", slot="charm", rarity="legendary", pct=30,
       why="Zählt, wenn du einen geplanten Ruhetag wirklich ruhig gefahren bist.",
       flavour_de="Die rote Laterne des Letzten — und die schwerste Disziplin überhaupt: langsam fahren, wenn langsam draufsteht.",
       applies=lambda f: f.honoured_easy_day is True),
    _m(id="espresso_token", name_de="Espresso-Marke", slot="charm", rarity="common", pct=15,
       why="Zählt auf Fahrten, die vor 8 Uhr starten.",
       flavour_de="Eine Fahrt vor dem ersten Kaffee zählt doppelt. Gefühlt.",
       applies=_dawn),
    _m(id="banana", name_de="Bananenschale am Sattel", slot="charm", rarity="common", pct=18,
       why="Zählt ab 3 Stunden im Sattel.",
       flavour_de="Klassiker. Funktioniert seit hundert Jahren.",
       applies=lambda f: (f.duration_s or 0) >= 3 * 3600),
    _m(id="goat_charm", name_de="Bergziege", slot="charm", rarity="rare", pct=26,
       why="Zählt an Rampen ab 15 % Steigung.",
       flavour_de="Ein kleiner Messinganhänger. Behauptet, sie sei schon steiler gefahren.",
       applies=lambda f: f.max_gradient_pct is not None and f.max_gradient_pct >= 15),
    _m(id="club_socks", name_de="Zu hohe Socken", slot="charm", rarity="common", pct=14,
       why="Zählt auf Fahrten mit deiner Crew.",
       flavour_de="Die Sockenhöhe ist Ausdruck des Charakters. Deiner ist grenzwertig.",
       applies=lambda f: f.with_crew is True),
    _m(id="rain_cape", name_de="Zusammengefaltete Regenjacke", slot="charm", rarity="common", pct=17,
       why="Zählt, wenn es geregnet hat.",
       flavour_de="Seit Wochen in der Trikottasche. Heute war sie es wert.",
       applies=lambda f: f.was_wet is True),
    _m(id="night_owl", name_de="Reflektierendes Band", slot="charm", rarity="common", pct=20,
       why="Zählt im Dunkeln.",
       flavour_de="Niemand sieht gut darin aus. Alle sehen dich.",
       applies=lambda f: f.in_dark is True),
]

MODIFIERS: dict[str, Modifier] = {m.id: m for m in _ALL}

#: Not an item — the state of the bike itself. Kept out of `MODIFIERS` because
#: it is not owned, cannot be bought, occupies no slot, and is earned fresh
#: every service.
CONDITION = Modifier(
    id="drivetrain_fresh", name_de="Frischer Antrieb", slot="", rarity="common",
    pct=CONDITION_BONUS_PCT,
    why="Zählt, solange dein Antrieb frisch gewartet ist.",
    flavour_de="Eine saubere Kette läuft leiser, hält länger und zahlt sich aus.",
    applies=lambda f: f.drivetrain_fresh is True,
)


# ── set bonuses ─────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SetBonus:
    """A standing bonus for wearing a coherent build.

    Sets exist to reward COMMITTING to a build rather than cherry-picking the
    single highest number in each slot, and they are what turns a pile of owned
    items into a collection worth completing. Deliberately conditional too —
    a set that paid on every ride would be the flat multiplier rule 1 forbids.
    """

    id: str
    name_de: str
    pct: int
    #: Item ids that must ALL be equipped.
    requires: tuple[str, ...]
    why: str
    applies: Callable[[RideFacts], bool] = field(repr=False)


SETS: tuple[SetBonus, ...] = (
    SetBonus(
        id="set_gravel", name_de="Schotter-Set", pct=10,
        requires=("gravel_tyres", "climbing_bars"),
        why="Gravel-Stollen + Flare-Lenker, auf Schotter.",
        applies=lambda f: f.surface in ("gravel", "mtb"),
    ),
    SetBonus(
        id="set_tt", name_de="Zeitfahr-Set", pct=12,
        requires=("disc_wheel", "aero_bars"),
        why="Scheibenrad + Zeitfahraufsatz, im echten Zeitfahren.",
        applies=_time_trial,
    ),
    SetBonus(
        id="set_winter", name_de="Winter-Set", pct=12,
        requires=("winter_tyres", "mudguards"),
        why="Spike-Reifen + Schutzbleche, bei Regen unter 8 °C.",
        applies=_sufferfest,
    ),
    SetBonus(
        id="set_randonneur", name_de="Randonneur-Set", pct=12,
        requires=("dynamo_light", "bikepacking_bags"),
        why="Nabendynamo + Bikepacking-Taschen, im Dunkeln.",
        applies=lambda f: f.in_dark is True,
    ),
)


# ── resolution ──────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ModifierHit:
    id: str
    name_de: str
    slot: str
    rarity: str
    pct: int
    why: str
    flavour_de: str
    fired: bool


@dataclass(frozen=True)
class SetHit:
    id: str
    name_de: str
    pct: int
    why: str
    fired: bool


@dataclass(frozen=True)
class EarnBreakdown:
    """The equipment layer's contribution, itemised.

    `hits` carries the modifiers that did NOT fire as well as those that did.
    The near-miss is the useful part: "Schutzbleche +20 % — zählt, wenn es
    geregnet hat" on a dry day teaches the loadout. Hiding the misses would make
    the whole system feel random, which is the difference between an equipment
    system and a slot machine.
    """

    total_pct: int
    #: True when the cap actually bit. The UI says so rather than silently
    #: swallowing a bonus the rider paid for.
    capped: bool
    hits: list[ModifierHit]
    sets: list[SetHit]

    @property
    def multiplier(self) -> float:
        return 1.0 + self.total_pct / 100


class SlotConflictError(Exception):
    """Two items from the same slot were equipped at once."""

    def __init__(self, slot: str, ids: list[str]) -> None:
        super().__init__(f"slot {slot} has {len(ids)} items: {', '.join(sorted(ids))}")
        self.slot = slot
        self.ids = ids


def validate_loadout(equipped_ids: list[str] | set[str]) -> None:
    """Raise unless at most one item occupies each slot.

    Called by the equip endpoint, NOT by `resolve`. Awarding a ride that already
    happened must never fail on a loadout rule — see `resolve`.
    """
    by_slot: dict[str, list[str]] = {}
    for i in equipped_ids:
        m = MODIFIERS.get(i)
        if m:
            by_slot.setdefault(m.slot, []).append(i)
    for slot, ids in by_slot.items():
        if len(ids) > 1:
            raise SlotConflictError(slot, ids)


def resolve(equipped_ids: list[str] | set[str], facts: RideFacts) -> EarnBreakdown:
    """What this loadout adds to this ride.

    TOLERANT BY DESIGN. Unknown ids are ignored and a slot conflict is resolved
    rather than raised: this runs on the award path for a ride that has already
    been ridden, and a stale loadout must never be able to cost a rider their
    earn. When two items share a slot the HIGHER percentage wins, so the rider
    is never quietly given the worse of two things they own.
    """
    owned = [MODIFIERS[i] for i in equipped_ids if i in MODIFIERS]

    best: dict[str, Modifier] = {}
    for m in owned:
        current = best.get(m.slot)
        if current is None or m.pct > current.pct:
            best[m.slot] = m
    considered = [CONDITION] + list(best.values())

    hits = [
        ModifierHit(
            id=m.id, name_de=m.name_de, slot=m.slot, rarity=m.rarity,
            pct=m.pct, why=m.why, flavour_de=m.flavour_de, fired=m.applies(facts),
        )
        for m in considered
    ]

    worn = {m.id for m in best.values()}
    sets = [
        SetHit(
            id=s.id, name_de=s.name_de, pct=s.pct, why=s.why,
            fired=set(s.requires).issubset(worn) and s.applies(facts),
        )
        for s in SETS
        if set(s.requires).issubset(worn)
    ]

    raw = sum(h.pct for h in hits if h.fired) + sum(s.pct for s in sets if s.fired)
    total = min(raw, MAX_BONUS_PCT)
    return EarnBreakdown(
        total_pct=total, capped=raw > MAX_BONUS_PCT, hits=hits, sets=sets,
    )


def bonus_rc(base_rc: int, breakdown: EarnBreakdown) -> int:
    """The extra RideCoin the equipment earned, on top of base.

    Rounded down, and never negative: this layer can only ever add.
    """
    return max(0, int(base_rc * breakdown.total_pct / 100))


def catalogue() -> list[Modifier]:
    """Every item, for the shop and the loadout screen."""
    return list(_ALL)
