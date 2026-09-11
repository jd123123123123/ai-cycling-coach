"""Where Today's hero happens — and what a rider has to do to open it.

THE RULE THIS FILE EXISTS TO KEEP: a backdrop is somewhere the rider has BEEN,
in the sense that matters to a training app — they did the thing the place
stands for. The mountain road opens after a day with real climbing in it, the
dawn road after actually going out in the dark, the coast road after a long one.
That is why these are unlocked by ride facts and not sold for RideCoin: the
garage already has a shop, and a picture you bought says nothing about you.

The studios and the starter roads are open from the start, because a rider on
day one must still be able to choose. Everything else is earned once and kept
forever.

THE TWO STUDIOS ARE ALSO THE APP'S TWO MODES. `studio_black` is the near-black
room every screen has always been; `studio_white` is the same room with the
lights on, and choosing it turns the whole app white. The ground the machine
stands on is the ground the app stands on — see `W3ModeProvider` on the client.

WHAT A BACKDROP IS NOT. It is not a place we invent for the rider. The `place`
in a RIDE scene comes from real GPS through `ride_scene.scene_descriptor` and
still does — this module governs Today's hero, which has no ride under it and
therefore no coordinates to be honest about. These are stylised STAGES, written
as such, and none of them claims to be a location the rider rode through.

English prose, because every string here is prompt text. The rider-facing names
and unlock rules are German and live alongside them.
"""
from __future__ import annotations

from datetime import datetime, timezone

from collections.abc import Callable
from dataclasses import dataclass, field

from app.services.earn_modifiers import RideFacts


#: Stages are earned from rides ridden ON OR AFTER this moment. Nothing before
#: it unlocks anything, on either path.
#:
#: WHY A CUTOFF AT ALL, given a rider really did climb that pass last spring.
#: Because the unlock is a MOMENT, not an inventory line. A rider with three
#: seasons in the app would open it on their first sync and be handed forty
#: stages at once — which is not forty rewards, it is one undifferentiated dump
#: that teaches them the stages mean nothing. Everyone starts level, and the
#: first one lands on its own.
#:
#: THE COST, STATED PLAINLY: a Ventoux climbed last year does not count, and the
#: rider has to go back. That is a real loss and it is the deliberate trade.
#:
#: Kept as a UTC instant rather than a date so the boundary is unambiguous for
#: a rider syncing across midnight in any timezone.
STAGES_LIVE_FROM = datetime(2026, 9, 10, 0, 0, tzinfo=timezone.utc)


def counts_for_stages(started_at: "datetime | None") -> bool:
    """True when a ride is recent enough to open a stage.

    A ride with no start time never counts: an unlock has to be attributable to
    a real day, and `unlocked_by` promises the rider a date.
    """
    if started_at is None:
        return False
    when = started_at
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when >= STAGES_LIVE_FROM


@dataclass(frozen=True)
class Backdrop:
    """One stage Today's hero can play out on."""

    id: str
    name_de: str
    #: The BACKGROUND clause, in the studio's language. No location is claimed.
    prose: str
    #: What it takes, in the rider's language. "" for the two starters.
    unlock_de: str
    #: Fires against ONE ride. None for a starter backdrop, which needs nothing.
    #: Same discipline as `earn_modifiers`: a fact we do not have never unlocks.
    unlocked_by: Callable[[RideFacts], bool] | None = field(default=None, repr=False)

    @property
    def is_starter(self) -> bool:
        return self.unlocked_by is None


_ALL: list[Backdrop] = [
    Backdrop(
        id="studio_black",
        name_de="Studio",
        unlock_de="",
        prose=(
            "a near-black studio — no scenery and no horizon at all, just deep matte darkness "
            "falling away on every side, with a soft pool of light on the ground beneath the "
            "wheels and a gentle falloff into black at the edges of frame. The only colour in the "
            "picture is the machine itself"
        ),
    ),
    Backdrop(
        id="studio_white",
        name_de="Weißes Studio",
        unlock_de="",
        prose=(
            "a bright white studio — a seamless paper cyclorama with no horizon and no corner "
            "anywhere in it, lit high and soft from the front so the machine casts one clean "
            "contact shadow on the floor beneath its tyres and nothing else. The walls fall away "
            "to pure white at the edges of frame. The only colour in the picture is the machine "
            "itself"
        ),
    ),
    Backdrop(
        id="starter_road",
        name_de="Startstraße",
        unlock_de="",
        prose=(
            "the W3 starter road — a dark, moody stretch of empty tarmac at dawn, deep near-black "
            "surroundings falling away into shadow, a low horizon with the faintest cold light on "
            "it, and a thin lime-green edge of first sun catching the road as it runs off to the "
            "right of frame. Atmospheric and restrained"
        ),
    ),
    Backdrop(
        id="night_road",
        name_de="Nachtstraße",
        unlock_de="",
        prose=(
            "a road at true night, lit only by a cold pool of light from a single street lamp "
            "behind the rider and the faint lime spill of their own light on the tarmac ahead. "
            "Wet asphalt holding reflections, the verges black, a deep unlit blue above"
        ),
    ),
    Backdrop(
        id="mountain_pass",
        name_de="Passhöhe",
        unlock_de="1 000 hm an einem Tag",
        unlocked_by=lambda f: (f.elevation_gain_m or 0) >= 1000,
        prose=(
            "a high mountain pass in late light — pale limestone walls rising steeply behind, the "
            "road switchbacking away below into blue shadow, dark pines on the lower slopes, thin "
            "cold air and a bank of cloud sitting under the summits"
        ),
    ),
    Backdrop(
        id="dawn_road",
        name_de="Morgengrauen",
        unlock_de="Fahrt vor 7 Uhr gestartet",
        unlocked_by=lambda f: f.start_hour is not None and f.start_hour < 7,
        prose=(
            "an empty country road in the first ten minutes of sunrise — low golden light raking "
            "across the tarmac from the right, long soft shadows, ground mist lying in the field "
            "beside the road, a pale warm sky going to blue overhead"
        ),
    ),
    Backdrop(
        id="coast_road",
        name_de="Küstenstraße",
        unlock_de="100 km am Stück",
        unlocked_by=lambda f: (f.distance_m or 0) >= 100_000,
        prose=(
            "a coastal road cut into a cliff — open sea filling the distance in deep blue-green, a "
            "low stone wall along the seaward edge, dry grass and scrub on the landward bank, hard "
            "bright light and a clean salt haze on the horizon"
        ),
    ),
    Backdrop(
        id="rain_road",
        name_de="Regenstraße",
        unlock_de="Eine Fahrt im Regen",
        unlocked_by=lambda f: f.was_wet is True,
        prose=(
            "a road in steady rain — the tarmac black and streaming, standing water throwing back "
            "the light, spray hanging behind the wheels, dripping trees close on both sides and a "
            "flat grey sky pressing down"
        ),
    ),
    Backdrop(
        id="gravel_track",
        name_de="Schotterweg",
        unlock_de="Eine Schotterfahrt",
        unlocked_by=lambda f: f.surface == "gravel",
        prose=(
            "a dry gravel track running through open country — loose pale stones with tyre lines "
            "worn through them, dust hanging low, dry golden grass either side and a line of trees "
            "in the far distance under a wide clear sky"
        ),
    ),
    Backdrop(
        id="winter_road",
        name_de="Winterstraße",
        unlock_de="Eine Fahrt bei 0 °C oder kälter",
        unlocked_by=lambda f: f.temp_c is not None and f.temp_c <= 0,
        prose=(
            "a cleared road through hard frost — banks of old snow pushed up on both verges, bare "
            "black trees, salt-white tarmac, and a low pale sun that gives light but no warmth in "
            "a washed-out sky"
        ),
    ),
    Backdrop(
        id="velodrome",
        name_de="Bahn",
        unlock_de="Eine Fahrt mit IF 0,95 oder höher",
        unlocked_by=lambda f: f.intensity_factor is not None and f.intensity_factor >= 0.95,
        prose=(
            "the boards of an indoor velodrome — warm varnished pine banking sweeping up behind "
            "the rider, the black measurement line and the red sprinters' line running along the "
            "track, empty tiered seating lost in the dark beyond, lit by hard overhead lamps"
        ),
    ),
]

CATALOGUE: dict[str, Backdrop] = {b.id: b for b in _ALL}

#: What a rider gets before they have ridden anything at all.
STARTERS: tuple[str, ...] = tuple(b.id for b in _ALL if b.is_starter)

#: The one every rider starts on. Kept as the app's default everywhere so an
#: unset choice and a deliberate one produce the same picture.
#:
#: THE BLACK STUDIO, not the starter road. A bike on a near-black ground is what
#: the garage is built around — the floor sweep, the pool of light, the chips
#: floating on it — and a rider who has chosen nothing should see their machine
#: exactly the way the app presents machines. The starter road is still free and
#: one swipe away; it is a place, and a place is something you move TO.
DEFAULT_ID = "studio_black"


#: The rules that need weather. Everything else can be answered from columns the
#: activity already carries, which is what makes the split in `api/garage`
#: possible: these are captured at ingestion, the rest evaluate live over
#: history. Kept as data rather than as a comment so the two halves cannot
#: silently drift apart — `test_backdrops` asserts this set is exactly the set
#: of rules that read a weather fact.
NEEDS_WEATHER: frozenset[str] = frozenset({"rain_road", "winter_road"})


def earned_by(facts: RideFacts) -> list[str]:
    """Which non-starter stages THIS ONE ride opens.

    The ingestion-time half. Takes a complete `RideFacts` — the one
    `ride_economy` has already built to settle the ride's earn — so the weather
    rules can fire here and only here.
    """
    return [
        b.id for b in _ALL
        if not b.is_starter and b.unlocked_by(facts)  # type: ignore[misc]
    ]


def unlocked_ids(rides: list[RideFacts]) -> list[str]:
    """Every backdrop this rider has opened, starters included, in catalogue order.

    Evaluated per RIDE, never against an aggregate: "1 000 hm an einem Tag" is a
    day's climbing and not a season's, and summing the season would hand out a
    reward the rider did not do. The same reading `earn_modifiers` takes of its
    own facts, for the same reason.
    """
    out = list(STARTERS)
    for b in _ALL:
        if b.is_starter or b.id in out:
            continue
        if any(b.unlocked_by(f) for f in rides):  # type: ignore[misc]
            out.append(b.id)
    return [b.id for b in _ALL if b.id in out]


def resolve(backdrop_id: str | None) -> Backdrop:
    """The backdrop to render, defaulting rather than failing.

    A stored id that no longer exists in the catalogue must not cost a rider
    their hero — an item removed in a deploy would otherwise 500 every scene
    request until they picked again.
    """
    return CATALOGUE.get(backdrop_id or "", CATALOGUE[DEFAULT_ID])
