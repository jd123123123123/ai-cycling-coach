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

Only what the server actually needs is mirrored (id, name, kind, tier/slot,
price, prompt). Blurbs and art paths stay in the frontend, where they belong.
The PROMPT is here because the composed bike render asks the image model for
"this bike, wearing these components", and the prompt is how a component is
described — see `services/bike_render`.
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
    prompt: str = ""


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
        prompt="a battered rusty old city bicycle, flaking brown rust on a faded once-blue steel frame, bent chrome fenders, a crooked wire basket on the front, cracked black saddle, mismatched tyres, one pedal missing its rubber",
    ),
    "steel-commuter": CatalogItem(
        id="steel-commuter", name="Der Pendler", kind="bike",
        tier="steel", slot=None, price=400,
        prompt="a simple dark green steel commuter bicycle, straight flat handlebar, black plastic fenders, a slim rear rack, brown worn saddle, sensible grey tyres",
    ),
    "steel-fixie": CatalogItem(
        id="steel-fixie", name="Der Fixie", kind="bike",
        tier="steel", slot=None, price=550,
        prompt="a matte black steel fixed-gear track bicycle, deep white rims, no derailleurs, riser bars with white grip tape, minimal black saddle, slim white-wall tyres",
    ),
    "steel-tourer": CatalogItem(
        id="steel-tourer", name="Der Weltenbummler", kind="bike",
        tier="steel", slot=None, price=700,
        prompt="a classic burgundy steel touring bicycle, drop handlebars with honey-brown leather tape, brown leather saddle, front and rear racks, wide tan-wall tyres, silver components",
    ),
    "steel-retro": CatalogItem(
        id="steel-retro", name="Der Klassiker", kind="bike",
        tier="steel", slot=None, price=850,
        prompt="a vintage 1980s celeste-green steel racing bicycle, thin round tubes, chrome fork crown, white handlebar tape, classic silver groupset, narrow black tyres, small pump clipped to the frame",
    ),
    "steel-gravel": CatalogItem(
        id="steel-gravel", name="Der Schotterhund", kind="bike",
        tier="steel", slot=None, price=1000,
        prompt="a sand-beige steel gravel bicycle, flared drop handlebars, knobby tan-wall gravel tyres, a frame bag in the main triangle, bronze-anodised hubs",
    ),
    "alloy-allez": CatalogItem(
        id="alloy-allez", name="Der Einsteiger", kind="bike",
        tier="alloy", slot=None, price=1400,
        prompt="a gloss blue aluminium road racing bicycle, compact sloping frame, black drop handlebars, shallow black rims with tan-wall tyres, black saddle",
    ),
    "alloy-crit": CatalogItem(
        id="alloy-crit", name="Der Kriteriumsflitzer", kind="bike",
        tier="alloy", slot=None, price=1700,
        prompt="an aggressive red aluminium criterium racing bicycle, low stack, short head tube, deep black rims, red-and-black handlebar tape, stiff oversized bottom bracket",
    ),
    "alloy-cx": CatalogItem(
        id="alloy-cx", name="Der Querfeldein", kind="bike",
        tier="alloy", slot=None, price=2000,
        prompt="a mud-splattered grey aluminium cyclocross bicycle, high bottom bracket, wide mud clearance, knobby black tyres, blue accent decals, single chainring",
    ),
    "alloy-aero": CatalogItem(
        id="alloy-aero", name="Der Windschnittige", kind="bike",
        tier="alloy", slot=None, price=2300,
        prompt="a silver aluminium aero road bicycle, flattened kamm-tail tubes, integrated seatpost clamp, 40mm deep black rims, black bar tape",
    ),
    "alloy-climber": CatalogItem(
        id="alloy-climber", name="Der Bergfloh", kind="bike",
        tier="alloy", slot=None, price=2600,
        prompt="a lightweight white aluminium climbing bicycle, slender tubes, shallow lightweight rims, minimal white saddle, compact crankset, orange accent decals",
    ),
    "carbon-endurance": CatalogItem(
        id="carbon-endurance", name="Der Dauerläufer", kind="bike",
        tier="carbon", slot=None, price=3400,
        prompt="a deep navy carbon endurance road bicycle, smooth organic tube shapes, comfort-tuned slender seatstays, 35mm carbon rims, black hoods and tape, disc brakes",
    ),
    "carbon-race": CatalogItem(
        id="carbon-race", name="Der Rennmaschine", kind="bike",
        tier="carbon", slot=None, price=4200,
        prompt="a gloss black-and-yellow carbon race bicycle, aggressive geometry, integrated cockpit, 50mm carbon rims, yellow accent stripes, disc brakes",
    ),
    "carbon-aero": CatalogItem(
        id="carbon-aero", name="Die Klinge", kind="bike",
        tier="carbon", slot=None, price=5000,
        prompt="a matte charcoal carbon aero bicycle, deep truncated aerofoil tubes, fully integrated one-piece bar-stem, dropped seatstays, 60mm deep carbon rims, hidden cables",
    ),
    "carbon-climber": CatalogItem(
        id="carbon-climber", name="Der Gipfelstürmer", kind="bike",
        tier="carbon", slot=None, price=5800,
        prompt="an ultralight pearl-white carbon climbing bicycle, impossibly slim tubes, exposed raw carbon weave accents, 30mm shallow carbon rims, red logo details",
    ),
    "carbon-gravel": CatalogItem(
        id="carbon-gravel", name="Der Grenzgänger", kind="bike",
        tier="carbon", slot=None, price=6400,
        prompt="a forest-green carbon gravel bicycle, flared carbon drop bars, wide 45mm knobby tan-wall tyres, top-tube bag, bronze headset spacers, disc brakes",
    ),
    "pro-worldtour": CatalogItem(
        id="pro-worldtour", name="Das WorldTour-Rad", kind="bike",
        tier="pro", slot=None, price=8000,
        prompt="a WorldTour team carbon race bicycle in bold electric-blue and black team livery, sponsor decals, fully integrated cockpit, 55mm carbon rims, electronic groupset, power meter crank",
    ),
    "pro-tt": CatalogItem(
        id="pro-tt", name="Die Zeitfahrmaschine", kind="bike",
        tier="pro", slot=None, price=9500,
        prompt="a black-and-gold carbon time-trial bicycle, extreme aero frame, long extension aerobars with armrests, disc rear wheel, deep 80mm front rim, hidden brakes",
    ),
    "pro-titanium": CatalogItem(
        id="pro-titanium", name="Das Titanstück", kind="bike",
        tier="pro", slot=None, price=11000,
        prompt="a brushed raw titanium custom road bicycle, visible weld beads, understated etched logos, classic round tubes, silver mechanical groupset, brown leather saddle, polished silver rims",
    ),
    "pro-superlight": CatalogItem(
        id="pro-superlight", name="Die Feder", kind="bike",
        tier="pro", slot=None, price=13000,
        prompt="an extremely lightweight unpainted raw carbon-weave road bicycle, skeletal drilled components, exposed carbon everywhere, ultralight shallow tubular rims, no logos at all",
    ),
    "pro-prototype": CatalogItem(
        id="pro-prototype", name="Der Prototyp", kind="bike",
        tier="pro", slot=None, price=15000,
        prompt="a futuristic prototype carbon race bicycle, iridescent oil-slick colour-shifting paint that glows purple-to-teal, radical dropped-stay frame, fully hidden cabling, matte black deep rims, no branding",
    ),
    "steel-singlespeed": CatalogItem(
        id="steel-singlespeed", name="Der Stadtstreicher", kind="bike",
        tier="steel", slot=None, price=500,
        prompt="a plain grey steel single-speed bicycle, straight bars, black rims, cheap black saddle, dark grey tyres",
    ),
    "alloy-fitness": CatalogItem(
        id="alloy-fitness", name="Der Flachlenker", kind="bike",
        tier="alloy", slot=None, price=1500,
        prompt="a black aluminium flat-bar fitness road bicycle, flat handlebar with ergonomic grips, road tyres, shallow black rims, disc brakes",
    ),
    "carbon-allroad": CatalogItem(
        id="carbon-allroad", name="Der Allrounder", kind="bike",
        tier="carbon", slot=None, price=3800,
        prompt="a slate-grey carbon all-road bicycle, clearance for wide 38mm slick tyres, mudguard mounts, 40mm carbon rims, understated white logos",
    ),
    "pro-track": CatalogItem(
        id="pro-track", name="Die Bahnmaschine", kind="bike",
        tier="pro", slot=None, price=8800,
        prompt="a polished chrome and crimson carbon track pursuit bicycle, no brakes, aero bullhorn bars, full disc rear wheel, 5-spoke tri-spoke front wheel, oversized chainring",
    ),
    "pro-classics": CatalogItem(
        id="pro-classics", name="Der Kopfsteinpflaster-König", kind="bike",
        tier="pro", slot=None, price=10500,
        prompt="a mud-flecked cobble-classics carbon race bicycle in deep maroon, double-wrapped handlebar tape, wide 32mm tyres, shallow tough carbon rims, front suspension insert in the fork",
    ),
    "frame-stock": CatalogItem(
        id="frame-stock", name="Serienlack", kind="part",
        tier=None, slot="frame", price=0,
        prompt="a plain matte dark grey bicycle frameset, no decals, understated",
    ),
    "frame-racered": CatalogItem(
        id="frame-racered", name="Rennrot", kind="part",
        tier=None, slot="frame", price=350,
        prompt="a glossy racing-red bicycle frameset with a thin white pinstripe along the top tube",
    ),
    "frame-chrome": CatalogItem(
        id="frame-chrome", name="Chrom", kind="part",
        tier=None, slot="frame", price=900,
        prompt="a fully polished mirror-chrome bicycle frameset, highly reflective metal, no paint",
    ),
    "frame-lime": CatalogItem(
        id="frame-lime", name="W3-Lime", kind="part",
        tier=None, slot="frame", price=650,
        prompt="a bicycle frameset in bright lime green (#C8FF00) with matte black panels on the down tube",
    ),
    "frame-oilslick": CatalogItem(
        id="frame-oilslick", name="Ölschimmer", kind="part",
        tier=None, slot="frame", price=1600,
        prompt="a bicycle frameset in iridescent oil-slick paint, colour shifting from deep purple through teal to bronze",
    ),
    "frame-splatter": CatalogItem(
        id="frame-splatter", name="Farbspritzer", kind="part",
        tier=None, slot="frame", price=1100,
        prompt="a white bicycle frameset covered in bold 1990s neon paint splatter, pink magenta and cyan flecks",
    ),
    "wheels-stock": CatalogItem(
        id="wheels-stock", name="Serienlaufrad", kind="part",
        tier=None, slot="wheels", price=0,
        prompt="a basic shallow black aluminium bicycle wheel with plain black tyre and 32 silver spokes",
    ),
    "wheels-tanwall": CatalogItem(
        id="wheels-tanwall", name="Beige Flanke", kind="part",
        tier=None, slot="wheels", price=400,
        prompt="a classic bicycle wheel with a tan-wall gumwall tyre, polished silver box-section rim and silver spokes",
    ),
    "wheels-deep": CatalogItem(
        id="wheels-deep", name="Hochprofil", kind="part",
        tier=None, slot="wheels", price=1200,
        prompt="a deep 60mm matte carbon bicycle wheel with black tyre and bladed black spokes",
    ),
    "wheels-disc": CatalogItem(
        id="wheels-disc", name="Scheibenrad", kind="part",
        tier=None, slot="wheels", price=2400,
        prompt="a full solid black carbon disc bicycle wheel, no spokes at all, smooth continuous surface, black tyre",
    ),
    "wheels-fivespoke": CatalogItem(
        id="wheels-fivespoke", name="Fünfspeiche", kind="part",
        tier=None, slot="wheels", price=2000,
        prompt="a five-spoke carbon tri-spoke bicycle wheel, thick aerodynamic blades instead of spokes, black tyre",
    ),
    "wheels-gold": CatalogItem(
        id="wheels-gold", name="Goldfelge", kind="part",
        tier=None, slot="wheels", price=1500,
        prompt="a bicycle wheel with a polished gold anodised rim, black tyre and black spokes, gold hub",
    ),
    "bars-stock": CatalogItem(
        id="bars-stock", name="Serienband", kind="part",
        tier=None, slot="bars", price=0,
        prompt="a black aluminium drop handlebar wrapped in plain black bar tape",
    ),
    "bars-lime": CatalogItem(
        id="bars-lime", name="Limeband", kind="part",
        tier=None, slot="bars", price=250,
        prompt="a black drop handlebar wrapped in bright lime green (#C8FF00) bar tape",
    ),
    "bars-leather": CatalogItem(
        id="bars-leather", name="Leder", kind="part",
        tier=None, slot="bars", price=700,
        prompt="a silver drop handlebar wrapped in honey-brown stitched leather bar tape with twine ends",
    ),
    "bars-aero": CatalogItem(
        id="bars-aero", name="Aero-Cockpit", kind="part",
        tier=None, slot="bars", price=1800,
        prompt="a one-piece integrated matte carbon aero handlebar and stem, flattened wing-shaped tops, fully internal cabling",
    ),
    "bars-bullhorn": CatalogItem(
        id="bars-bullhorn", name="Bullhorn", kind="part",
        tier=None, slot="bars", price=600,
        prompt="a polished silver bullhorn handlebar with forward-swept horns and black grip tape",
    ),
    "bars-white": CatalogItem(
        id="bars-white", name="Weißband", kind="part",
        tier=None, slot="bars", price=300,
        prompt="a black drop handlebar wrapped in crisp white bar tape",
    ),
    "saddle-stock": CatalogItem(
        id="saddle-stock", name="Serienattel", kind="part",
        tier=None, slot="saddle", price=0,
        prompt="a plain black bicycle saddle with modest padding and steel rails",
    ),
    "saddle-leather": CatalogItem(
        id="saddle-leather", name="Ledersattel", kind="part",
        tier=None, slot="saddle", price=800,
        prompt="a classic honey-brown leather bicycle saddle with copper rivets along the edge and steel rails",
    ),
    "saddle-carbon": CatalogItem(
        id="saddle-carbon", name="Carbonschale", kind="part",
        tier=None, slot="saddle", price=1900,
        prompt="a skeletal raw carbon-weave bicycle racing saddle, cut-out centre channel, minimal padding, carbon rails",
    ),
    "saddle-lime": CatalogItem(
        id="saddle-lime", name="Lime-Kante", kind="part",
        tier=None, slot="saddle", price=450,
        prompt="a black bicycle racing saddle with a bright lime green (#C8FF00) accent stripe along its edge",
    ),
    "saddle-white": CatalogItem(
        id="saddle-white", name="Weißsattel", kind="part",
        tier=None, slot="saddle", price=400,
        prompt="a clean white bicycle racing saddle with subtle grey logo detail",
    ),
    "saddle-suspension": CatalogItem(
        id="saddle-suspension", name="Komfortsattel", kind="part",
        tier=None, slot="saddle", price=300,
        prompt="a wide well-padded black comfort bicycle saddle with visible coil springs under the rear",
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
