"""W3 shop catalogue — the SERVER's copy of the bike ladder and the parts wall.

GENERATED FILE — DO NOT EDIT BY HAND.

    Regenerate:  backend/.venv/bin/python backend/scripts/sync_catalog.py
    Sources:     frontend/src/editorial/w3/w3bikes.ts
                 frontend/src/editorial/w3/w3parts.ts

WHY A MIRROR AND NOT A CLIENT PAYLOAD. Price is the only thing standing between
a rider and the 15 000 RC prototype, so it can never arrive in a request body.
`services/shop.purchase` looks every price up HERE and ignores whatever the
client thinks an item costs. `tests/test_shop.py::TestCatalogDrift` re-parses the
TypeScript and fails if this file is stale — editing the catalogue without
re-running the sync script breaks the build rather than mispricing the shop.

Only the four fields the server actually needs are mirrored (id, name, kind,
tier/slot, price). Blurbs, prompts and art paths stay in the frontend, where
they belong.
"""
from __future__ import annotations

from dataclasses import dataclass

KIND_BIKE = "bike"
KIND_PART = "part"


@dataclass(frozen=True)
class CatalogItem:
    """One purchasable thing. ``tier`` is set for bikes, ``slot`` for parts —
    never both, and the slot is what tells `shop.equip` which column to write."""

    id: str
    name: str
    kind: str
    tier: str | None
    slot: str | None
    price: int


PART_SLOTS: tuple[str, ...] = (
    "frame",
    "wheels",
    "bars",
    "saddle",
)

STARTER_BIKE_ID = "rustbucket"

STOCK_PARTS: dict[str, str] = {
    "frame": "frame-stock",
    "wheels": "wheels-stock",
    "bars": "bars-stock",
    "saddle": "saddle-stock",
}

CATALOG: dict[str, CatalogItem] = {
    "rustbucket": CatalogItem(
        id="rustbucket", name="Die Rostlaube", kind="bike",
        tier="starter", slot=None, price=0,
    ),
    "steel-commuter": CatalogItem(
        id="steel-commuter", name="Der Pendler", kind="bike",
        tier="steel", slot=None, price=400,
    ),
    "steel-fixie": CatalogItem(
        id="steel-fixie", name="Der Fixie", kind="bike",
        tier="steel", slot=None, price=550,
    ),
    "steel-tourer": CatalogItem(
        id="steel-tourer", name="Der Weltenbummler", kind="bike",
        tier="steel", slot=None, price=700,
    ),
    "steel-retro": CatalogItem(
        id="steel-retro", name="Der Klassiker", kind="bike",
        tier="steel", slot=None, price=850,
    ),
    "steel-gravel": CatalogItem(
        id="steel-gravel", name="Der Schotterhund", kind="bike",
        tier="steel", slot=None, price=1000,
    ),
    "alloy-allez": CatalogItem(
        id="alloy-allez", name="Der Einsteiger", kind="bike",
        tier="alloy", slot=None, price=1400,
    ),
    "alloy-crit": CatalogItem(
        id="alloy-crit", name="Der Kriteriumsflitzer", kind="bike",
        tier="alloy", slot=None, price=1700,
    ),
    "alloy-cx": CatalogItem(
        id="alloy-cx", name="Der Querfeldein", kind="bike",
        tier="alloy", slot=None, price=2000,
    ),
    "alloy-aero": CatalogItem(
        id="alloy-aero", name="Der Windschnittige", kind="bike",
        tier="alloy", slot=None, price=2300,
    ),
    "alloy-climber": CatalogItem(
        id="alloy-climber", name="Der Bergfloh", kind="bike",
        tier="alloy", slot=None, price=2600,
    ),
    "carbon-endurance": CatalogItem(
        id="carbon-endurance", name="Der Dauerläufer", kind="bike",
        tier="carbon", slot=None, price=3400,
    ),
    "carbon-race": CatalogItem(
        id="carbon-race", name="Der Rennmaschine", kind="bike",
        tier="carbon", slot=None, price=4200,
    ),
    "carbon-aero": CatalogItem(
        id="carbon-aero", name="Die Klinge", kind="bike",
        tier="carbon", slot=None, price=5000,
    ),
    "carbon-climber": CatalogItem(
        id="carbon-climber", name="Der Gipfelstürmer", kind="bike",
        tier="carbon", slot=None, price=5800,
    ),
    "carbon-gravel": CatalogItem(
        id="carbon-gravel", name="Der Grenzgänger", kind="bike",
        tier="carbon", slot=None, price=6400,
    ),
    "pro-worldtour": CatalogItem(
        id="pro-worldtour", name="Das WorldTour-Rad", kind="bike",
        tier="pro", slot=None, price=8000,
    ),
    "pro-tt": CatalogItem(
        id="pro-tt", name="Die Zeitfahrmaschine", kind="bike",
        tier="pro", slot=None, price=9500,
    ),
    "pro-titanium": CatalogItem(
        id="pro-titanium", name="Das Titanstück", kind="bike",
        tier="pro", slot=None, price=11000,
    ),
    "pro-superlight": CatalogItem(
        id="pro-superlight", name="Die Feder", kind="bike",
        tier="pro", slot=None, price=13000,
    ),
    "pro-prototype": CatalogItem(
        id="pro-prototype", name="Der Prototyp", kind="bike",
        tier="pro", slot=None, price=15000,
    ),
    "steel-singlespeed": CatalogItem(
        id="steel-singlespeed", name="Der Stadtstreicher", kind="bike",
        tier="steel", slot=None, price=500,
    ),
    "alloy-fitness": CatalogItem(
        id="alloy-fitness", name="Der Flachlenker", kind="bike",
        tier="alloy", slot=None, price=1500,
    ),
    "carbon-allroad": CatalogItem(
        id="carbon-allroad", name="Der Allrounder", kind="bike",
        tier="carbon", slot=None, price=3800,
    ),
    "pro-track": CatalogItem(
        id="pro-track", name="Die Bahnmaschine", kind="bike",
        tier="pro", slot=None, price=8800,
    ),
    "pro-classics": CatalogItem(
        id="pro-classics", name="Der Kopfsteinpflaster-König", kind="bike",
        tier="pro", slot=None, price=10500,
    ),
    "frame-stock": CatalogItem(
        id="frame-stock", name="Serienlack", kind="part",
        tier=None, slot="frame", price=0,
    ),
    "frame-racered": CatalogItem(
        id="frame-racered", name="Rennrot", kind="part",
        tier=None, slot="frame", price=350,
    ),
    "frame-chrome": CatalogItem(
        id="frame-chrome", name="Chrom", kind="part",
        tier=None, slot="frame", price=900,
    ),
    "frame-lime": CatalogItem(
        id="frame-lime", name="W3-Lime", kind="part",
        tier=None, slot="frame", price=650,
    ),
    "frame-oilslick": CatalogItem(
        id="frame-oilslick", name="Ölschimmer", kind="part",
        tier=None, slot="frame", price=1600,
    ),
    "frame-splatter": CatalogItem(
        id="frame-splatter", name="Farbspritzer", kind="part",
        tier=None, slot="frame", price=1100,
    ),
    "wheels-stock": CatalogItem(
        id="wheels-stock", name="Serienlaufrad", kind="part",
        tier=None, slot="wheels", price=0,
    ),
    "wheels-tanwall": CatalogItem(
        id="wheels-tanwall", name="Beige Flanke", kind="part",
        tier=None, slot="wheels", price=400,
    ),
    "wheels-deep": CatalogItem(
        id="wheels-deep", name="Hochprofil", kind="part",
        tier=None, slot="wheels", price=1200,
    ),
    "wheels-disc": CatalogItem(
        id="wheels-disc", name="Scheibenrad", kind="part",
        tier=None, slot="wheels", price=2400,
    ),
    "wheels-fivespoke": CatalogItem(
        id="wheels-fivespoke", name="Fünfspeiche", kind="part",
        tier=None, slot="wheels", price=2000,
    ),
    "wheels-gold": CatalogItem(
        id="wheels-gold", name="Goldfelge", kind="part",
        tier=None, slot="wheels", price=1500,
    ),
    "bars-stock": CatalogItem(
        id="bars-stock", name="Serienband", kind="part",
        tier=None, slot="bars", price=0,
    ),
    "bars-lime": CatalogItem(
        id="bars-lime", name="Limeband", kind="part",
        tier=None, slot="bars", price=250,
    ),
    "bars-leather": CatalogItem(
        id="bars-leather", name="Leder", kind="part",
        tier=None, slot="bars", price=700,
    ),
    "bars-aero": CatalogItem(
        id="bars-aero", name="Aero-Cockpit", kind="part",
        tier=None, slot="bars", price=1800,
    ),
    "bars-bullhorn": CatalogItem(
        id="bars-bullhorn", name="Bullhorn", kind="part",
        tier=None, slot="bars", price=600,
    ),
    "bars-white": CatalogItem(
        id="bars-white", name="Weißband", kind="part",
        tier=None, slot="bars", price=300,
    ),
    "saddle-stock": CatalogItem(
        id="saddle-stock", name="Serienattel", kind="part",
        tier=None, slot="saddle", price=0,
    ),
    "saddle-leather": CatalogItem(
        id="saddle-leather", name="Ledersattel", kind="part",
        tier=None, slot="saddle", price=800,
    ),
    "saddle-carbon": CatalogItem(
        id="saddle-carbon", name="Carbonschale", kind="part",
        tier=None, slot="saddle", price=1900,
    ),
    "saddle-lime": CatalogItem(
        id="saddle-lime", name="Lime-Kante", kind="part",
        tier=None, slot="saddle", price=450,
    ),
    "saddle-white": CatalogItem(
        id="saddle-white", name="Weißsattel", kind="part",
        tier=None, slot="saddle", price=400,
    ),
    "saddle-suspension": CatalogItem(
        id="saddle-suspension", name="Komfortsattel", kind="part",
        tier=None, slot="saddle", price=300,
    ),
}


# The things every rider owns from the first minute: the starter bike and the
# stock part in each slot. `shop.ensure_starter` grants exactly this set — it is
# derived from price, so a future free item joins it without a code change.
FREE_ITEM_IDS: tuple[str, ...] = tuple(
    item_id for item_id, item in CATALOG.items() if item.price == 0
)


def get(item_id: str) -> CatalogItem | None:
    """The catalogue entry for an id, or ``None`` when nothing is sold under it."""
    return CATALOG.get(item_id)
