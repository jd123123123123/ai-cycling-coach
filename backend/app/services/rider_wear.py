"""What the rider is WEARING, as the scene prompt needs to see it.

The counterpart to `bike_build`, and deliberately not the same mechanism. A bike
is EDITED from its stored photograph — one call, "change only these components",
which is what keeps the frame and the light identical between two builds. A
rider is COMPOSED fresh into every scene, so there is no stored figure to edit:
worn items are clauses inside the scene prompt, applied at composition time.

That difference has a consequence worth stating, because it looks like an
inconsistency until you see it. Equipping mudguards costs an image-model call
and produces a new bike render. Equipping a helmet costs nothing until the next
scene is composed — and then it is simply there, in every pose, for free.

WHAT IS NOT HERE. Only the two worn slots. A Glücksbringer in a jersey pocket
and a power meter on a crank are not on the rider's head, and the scene must not
invent them there. `WORN` is therefore keyed only on `helmet` and `eyewear`
items, and anything else equipped is silently irrelevant to this module.

English, because this is prompt text and never UI copy — the same split
`ride_scene` and `bike_build` both make.
"""
from __future__ import annotations

from app.services import earn_modifiers as em

#: The slots this module speaks for. Everything else lives on the machine.
WORN_SLOTS = ("helmet", "eyewear")

#: item id → how it looks on the figure, in the house style.
#:
#: Written as a garment on a stylised toy rather than as a product, because the
#: figure is one: "a smooth matte shell" renders; "Giro Aether MIPS" renders as
#: a logo the rider never bought. Each clause also says where the item SITS, so
#: a helmet cannot come back floating above the hair or swallowing the face —
#: the two ways this goes wrong on a character with an oversized round head.
WORN: dict[str, str] = {
    # helmet
    "aero_helm": (
        "a smooth matte black aerodynamic time-trial helmet with no vents and a long tapered "
        "tail running down the back of the head, sitting low over the brow"
    ),
    "kletterhelm": (
        "a lightweight matte white road helmet with large open vents and a thin acid-lime trim, "
        "sitting level on the head with the hair visible at the temples and the straps meeting "
        "under the ear"
    ),
    "winter_helm": (
        "a matte black road helmet worn over a thin black thermal skull cap that covers the ears, "
        "the cap's edge just visible under the helmet's rim"
    ),
    "casquette": (
        "a white cotton cycling cap with a short upturned peak and a thin lime stripe, worn under "
        "a matte black road helmet"
    ),
    # eyewear
    "photochrome": (
        "a pair of large single-lens wraparound cycling glasses with a smoke-grey photochromic "
        "lens and thin black arms, worn over the eyes"
    ),
    "sonnenbrille": (
        "a pair of oversized single-lens wraparound cycling glasses with a mirrored acid-lime "
        "lens that hides the eyes completely, worn over the eyes"
    ),
    "klarglas": (
        "a pair of wraparound cycling glasses with completely clear lenses, the eyes fully "
        "visible through them, worn over the eyes"
    ),
    "gletscherbrille": (
        "a pair of small round vintage glacier glasses with dark green lenses and brown leather "
        "side shields, worn over the eyes"
    ),
}


def worn_ids(equipped: list[str] | tuple[str, ...]) -> list[str]:
    """The equipped items this module has a look for, in slot order.

    Slot order rather than the caller's order, so the same loadout always
    produces the same clause and therefore the same scene cache key.
    """
    by_slot = {
        m.slot: m.id
        for i in equipped
        if (m := em.MODIFIERS.get(i)) is not None and m.slot in WORN_SLOTS and m.id in WORN
    }
    return [by_slot[s] for s in WORN_SLOTS if s in by_slot]


def clause(equipped: list[str] | tuple[str, ...]) -> str:
    """The prompt sentence for what the rider is wearing, or "" for a bare head.

    The empty string matters as much as the populated one: with nothing worn the
    scene prompt must say nothing at all about headwear, because the house style
    already specifies a bare head with the hair fully visible, and a sentence
    that mentions a helmet in order to deny it puts a helmet in the context
    window. Same rule this codebase applies everywhere — describe what IS.
    """
    ids = worn_ids(equipped)
    if not ids:
        return ""
    items = " and ".join(WORN[i] for i in ids)
    return (
        f"THE RIDER IS WEARING {items}. This is equipment the rider chose and owns, so it is "
        f"clearly visible and correctly fitted, drawn with the same material care as the kit. "
        f"Seen from the side it reads in silhouette — the helmet's shell against the sky, the "
        f"lens edge and the arm of the glasses along the temple — and it never swallows the face: "
        f"the profile's expression stays legible from the brow, the mouth and the jaw."
    )


def key(equipped: list[str] | tuple[str, ...]) -> str:
    """A stable fragment identifying the worn loadout, for cache keys.

    "bare" rather than "" so a cache key never contains an empty segment that
    could collide with a missing one.
    """
    ids = worn_ids(equipped)
    return "-".join(ids) if ids else "bare"
