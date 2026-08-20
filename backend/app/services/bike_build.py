"""The rider's bike, wearing what they equipped.

This is `cycl_r-studio-3`'s `/api/upgrade-bike` rebased onto the rider's OWN
bike and this app's gear catalogue, with the two mandates from that endpoint
that do the heavy lifting kept verbatim in spirit:

  · INTEGRATION — a new part must be structurally fused into the machine, not
    pasted on with its former context still attached. The studio's own example
    is the right one: fitting an office chair as a saddle means removing the
    chair's wheels and legs and fusing its top to the seatpost.
  · The bike is EDITED, never redrawn. The rider's stored render goes back to
    the model as an input image with "change only these components". That is
    what keeps the frame, the camera, the colours and the light identical
    between two builds — `docs/w3-bike-customisation.md` measured it: a wheel
    swap moves 5.4 % of pixels, a saddle 0.9 %, and three changes in one call
    5.8 %. It also proved the two rules below.

TWO RULES FROM THAT MEASUREMENT, and both are load-bearing:

  1. ONE CALL PER BUILD, not one per part. Three changes cost no more than one.
  2. ALWAYS EDIT FROM THE ORIGINAL. Stacking drifts (5.3 % → 6.3 % over two
     steps), so a build is composed from the rider's base render every time and
     never from an already-edited image.

WHAT THIS IS NOT. Only items with a described visual change appear; a
Glücksbringer that lives in the rider's jersey pocket does not alter the
photograph, and inventing a change for it would put objects on the bike that are
not on the bike. `VISUALS` is deliberately smaller than the catalogue.
"""
from __future__ import annotations

import hashlib

from app.services import earn_modifiers as em

#: item id → the change to ask the model for. Only items that genuinely alter
#: the machine's appearance are here. Written in English: this is prompt text,
#: never UI copy — the same split `ride_scene` makes.
VISUALS: dict[str, str] = {
    # tyres
    "gravel_tyres": "Replace BOTH tyres with wide, chunky knobbly gravel tyres with tan sidewalls",
    "slicks": "Replace BOTH tyres with narrow glossy black slick road tyres with no tread",
    "winter_tyres": "Replace BOTH tyres with studded winter tyres, metal spikes visible in the tread",
    "tubulars": "Replace BOTH tyres with very narrow lightweight tubular racing tyres",
    "balloon_tyres": "Replace BOTH tyres with very fat cream-coloured balloon tyres",
    # wheels
    "climbing_wheels": "Replace BOTH wheels with shallow low-profile lightweight rims with thin spokes",
    "aero_wheels": "Replace BOTH wheels with deep-section aerodynamic carbon rims with bladed spokes",
    "disc_wheel": "Replace the REAR wheel with a solid carbon disc wheel with no spokes, keeping the front wheel spoked",
    "steel_rims": "Replace BOTH wheels with polished chrome steel box-section rims with bright chrome spokes",
    "deep_carbon": "Replace BOTH wheels with very deep-section glossy carbon rims",
    # mounted
    "mudguards": "Fit full-length matte black mudguards over both wheels, properly mounted to the frame and fork",
    "dynamo_light": "Fit a small polished chrome dynamo headlight to the fork crown, with its wire running neatly along the fork",
    "bikepacking_bags": "Fit olive-green canvas bikepacking bags: a saddle bag behind the seatpost and a frame bag inside the main triangle, strapped tight",
    "second_cage": "Fit a second bottle cage with a bottle in it on the seat tube",
    "frame_pump": "Fit a slim silver frame pump along the seat tube",
    "rack": "Fit a tubular metal rear luggage rack over the back wheel, bolted at the dropouts and seatstays",
    # cockpit
    "power_meter": "Fit a power meter pod to the drive-side crank arm",
    "aero_bars": "Fit clip-on time-trial aero bar extensions to the handlebar, with arm pads",
    "climbing_bars": "Replace the handlebar with a flared drop bar, wrapped in matching tape",
    "bell": "Fit a small polished brass bell to the handlebar next to the stem",
    "bar_bag": "Fit a small waxed-canvas handlebar bag to the front of the bars with leather straps",
    # charm — only the ones that are physically ON the bike
    "lanterne_rouge": "Fit a small vintage red lantern with a brass body to the rear of the saddle rails",
    "goat_charm": "Hang a tiny brass mountain-goat charm from the head tube on a short chain",
    "banana": "Drape a banana peel over the back of the saddle",
    "regel_neun": "Apply a round weatherproof sticker with a bold number 9 to the top tube",
}

INTEGRATION = (
    "INTEGRATION MANDATE: every fitted part MUST be structurally integrated into the bicycle's "
    "mechanical design. Nothing may float, look pasted on, or keep parts belonging to its "
    "previous form. Mounting hardware, brackets, bolts, cable runs and straps must be present "
    "and physically plausible, scaled correctly to this frame, and finished so the part looks "
    "like it was built for this bicycle. A part that merely hovers in roughly the right place is "
    "wrong."
)


def build_key(
    asset_id: int, asset_stamp: str, equipped: list[str], backdrop: str = "",
) -> str:
    """The cache key for one build of one rider's bike.

    Includes the ASSET's identity and a stamp of its own render, so re-uploading
    a bike invalidates every build of the old one rather than serving a build of
    a bicycle that no longer exists.

    Unlike the catalogue-bike era this key can NOT be global: the base image is
    the rider's own bike, so no two riders share a picture. It is hashed to keep
    it short and stable regardless of how many items exist.
    """
    worn = "|".join(sorted(i for i in equipped if i in VISUALS))
    # The BACKDROP is part of the build, added 2026-08-20. Today shows the
    # rider's bike standing in the place they chose, so the same wheels on the
    # starter road and on the Dolomites are two different pictures — and a key
    # that ignored the stage would serve whichever of them rendered first.
    raw = f"a{asset_id}:{asset_stamp}:{worn}:{backdrop}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def is_stock(equipped: list[str]) -> bool:
    """True when nothing worn changes the picture.

    The common case, and it must stay free: a rider wearing only pocket charms
    sees their own base render with no call made at all.
    """
    return not any(i in VISUALS for i in equipped)


def describe(equipped: list[str]) -> list[str]:
    """The changes to ask for, in catalogue order so the prompt is stable.

    Order matters for the cache: two loadouts that differ only in the order the
    rider equipped them must produce one key and one prompt, not two.
    """
    worn = {i for i in equipped if i in VISUALS}
    return [VISUALS[m.id] for m in em.catalogue() if m.id in worn]


def edit_prompt(equipped: list[str], world: str = "", has_plate: bool = False) -> str:
    """The full instruction: this exact bicycle, wearing these parts, standing
    wherever the rider chose to stand it.

    The bike arrives as an IMAGE, so it is deliberately not re-described here —
    describing it again invites the model to redraw the one thing that must stay
    pixel-identical.

    ONE CALL DOES BOTH, and that is not a shortcut. `docs/w3-bike-customisation.md`
    measured three part changes in a single call costing no more drift than one,
    while two stacked calls drifted further than either — so fitting the parts
    and placing the bike in its world has to happen together, from the rider's
    original render, or the bike stops being the bike.

    `world` is the chosen stage's prose. `has_plate` says a picture of that place
    is being handed over alongside the bike, in which case the prose steps back
    and the plate is the authority.
    """
    from app.services.cyclr_studio import (
        BIKE_CAMERA,
        GENERAL_STYLE,
        ISOLATED_BIKE_STYLE,
    )

    changes = describe(equipped)
    if has_plate:
        ground = (
            "SET THE BICYCLE INTO THE PLACE IN THE SECOND IMAGE. That photograph is the world "
            "this bike now stands in: keep its landforms, its vegetation, its ground surface, its "
            "light, its weather and its colour exactly as they are.\n"
            # WHERE THE BIKE GOES, and the reason this is spelled out at length.
            # Measured on a real Dolomites plate: told to stand the bike "in the
            # clear middle" of the picture, the model put it in the middle of the
            # FRAME — which on a plate whose road runs across the lower third is
            # empty valley air. The bike came back hovering, beautifully lit and
            # floating a hundred metres above the tarmac. The anchor has to be
            # the road surface, never the composition.
            "STAND IT ON THE ROAD. Find the tarmac in that photograph — it runs across the lower "
            "part of the frame, widest and nearest the camera — and place the bicycle upright and "
            "side-on with BOTH TYRES RESTING ON THAT ROAD SURFACE, at the size a real bicycle "
            "would be standing there. The contact points are the whole test: the bottom of each "
            "tyre is touching tarmac, the road's own texture runs right up to the rubber, and the "
            "bike casts a soft contact shadow onto the road directly beneath it. It is standing "
            "on the ground, not hovering over it and not floating in the middle of the picture.\n"
            "Relight the bike to match that place — the same key direction, the same warmth, the "
            "same time of day — and let the plate's own defocused foreground pass in front of the "
            "wheels where it already sits. There is nobody in the picture: the bicycle stands "
            "alone."
        )
    elif world:
        ground = (
            f"Stand the bicycle, upright and side-on, in this setting: {world} The ground closes "
            "over the bottom of both tyres so the bike is planted in the terrain rather than "
            "pasted onto it, and the light on the bike matches the light of the place. There is "
            "nobody in the picture: the bicycle stands alone."
        )
    else:
        # The same near-black ground the collectible itself is shot on, so a
        # build and a plain render are the same picture with different parts.
        from app.services.cyclr_studio import BIKE_GROUND
        ground = BIKE_GROUND
    # THE PREAMBLE DEPENDS ON WHAT IS BEING CHANGED, and conflating the two cost
    # two failed renders. A PARTS swap must hold the camera, the position, the
    # scale and the background still — that is the whole reason an edit beats a
    # redraw. A WORLD swap cannot: telling the model to keep "the same position
    # in frame, the same scale and the same background" while also asking it to
    # stand the bike on a road in a different photograph is a contradiction, and
    # it resolved it the way the wording weighted it — the bike kept its
    # frame-filling scale and its position, and floated in mid-air above the
    # road. What must survive a world swap is the bike's IDENTITY, not its
    # placement.
    if world or has_plate:
        keep = (
            "Take the bicycle from the supplied photograph and put it somewhere new. Keep the "
            "SAME BICYCLE — the same frame geometry and proportions, the same paint and finish, "
            "the same decals and lettering, the same wheels, tyres and components, seen from the "
            "same side. Its SIZE AND PLACEMENT IN THE FRAME ARE NEW, because it now has to stand "
            "on real ground: scale it to a believable bicycle in that landscape, which is smaller "
            "than it appears in the source photograph, and position it where the instructions "
            "below say. Change ONLY the components listed below and leave "
        )
    else:
        keep = (
            "Edit the bicycle in the supplied photograph. Keep the SAME bicycle: the same frame "
            "geometry, the same paint and finish, the same camera, the same position in frame, the "
            "same scale and the same background. Change ONLY the components listed below and leave "
        )
    return (
        keep
        + "every other part of the bicycle exactly as it is.\n\n"
        + "\n".join(f"- {c}" for c in changes)
        + "\n\nEVERY LISTED PART IS BRAND NEW AND MUST BE FITTED COMPLETELY: clean and uniform "
        "over its whole surface, with none of the old part's wear showing through it. A rider "
        "paid for these, so a half-applied or patchy result is wrong. Anything NOT listed keeps "
        "its existing condition and character.\n\n"
        f"{INTEGRATION}\n\n"
        "The result must be a photograph of one coherent, physically correct bicycle: new wheels "
        "sit in the existing dropouts, a new handlebar on the existing steerer, bags strapped to "
        "real mounting points. "
        f"{BIKE_CAMERA} {ground} {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )
