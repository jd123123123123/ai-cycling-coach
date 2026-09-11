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


#: THE LIGHT IS THE REWARD — the craft, never the hour.
#:
#: A stage is not a place to document, it is a place a rider EARNED. Rendered in
#: flat, even light it documents; the first Ventoux pass was accurate, correctly
#: grounded and emotionally inert.
#:
#: WHAT THIS CLAUSE MAY NOT DO, and the first version did. It opened with
#: "golden hour, twenty minutes before sunset, warm amber light" — and four of
#: the stages already in the catalogue name their own hour and weather:
#: `night_road` is "true night, lit only by a cold pool of light from a single
#: street lamp", `rain_road` has "a flat grey sky pressing down", `winter_road`
#: has "a low pale sun that gives light but no warmth", and `dawn_road` is
#: sunrise rather than sunset. Handing the model both is handing it a
#: contradiction, and Ventoux only looked right because its prose happens to
#: name no hour at all.
#:
#: So the hour belongs to the STAGE and the craft belongs here. Every lever
#: below works at any hour — that is the test a lever has to pass to be in this
#: string:
#:
#:  · SEPARATION — a rim of the scene's own key light along the machine's upper
#:    edges. Bright edge against dark ground is the visual grammar of triumph at
#:    midnight as much as at sunset.
#:  · A LONG SHADOW TOWARD CAMERA — shadows running at the viewer read as
#:    arrival rather than as passing through, whatever is casting them.
#:  · STEPPED RECESSION — awe tracks perceived vastness, and vastness is carried
#:    by separated depth planes far more than by focal length.
#:  · TRUE BLACKS AND RICH COLOUR — luminous, never milky. Applies to a grey
#:    rainy sky as much as to a gold one.
#:  · SPECULAR RICHNESS — highlights are what separate a desirable object from a
#:    photograph of a bike.
#:
#: THE TWO CLAUSES THAT ARE NOT ABOUT BEAUTY, both bought with a failed pass:
#:
#:  · THE FILL. Key light alone underexposed the drive side and the rider's own
#:    machine came back the darkest object in its own reward picture. A stage
#:    that hides the bike defeats the point of the bike.
#:  · THE LANDMARK. Chasing contrast and depth shrank the observatory tower into
#:    a generic antenna. For a stage whose whole reward is "I was there", the
#:    proof cannot be incidental.
#: HOW HARD IT WAS, AS A PICTURE.
#:
#: The stage is a reward, and a reward ladder only works if the rungs are
#: visibly apart. "Make it epic" applied to all fifty produces fifty maxed-out
#: pictures, which is a flat ladder wearing a lot of drama — and a flat ladder
#: cannot make anybody envious, because nothing in it is out of reach.
#:
#: So the discipline runs the other way: THE BOTTOM IS DELIBERATELY RESTRAINED.
#: `Alltag` is charming and ordinary on purpose. It has to be, or `Legendär` has
#: nowhere left to go.
#:
#: Four devices are RESERVED for the top and never spent below it, because each
#: one is a step a lower tier cannot take:
#:
#:   · IMPOSSIBILITY — the lower tiers are places a rider could stand in. The
#:     top tier is not: orbit, the abyss, an accretion disc. That single jump
#:     does more than any amount of extra colour.
#:   · AN EVENT — something is HAPPENING in the frame. Lava, lightning at the
#:     moment of grounding, spindrift streaming. Lower tiers hold still.
#:   · IMPOSSIBLE LIGHT — light no ordinary day produces: earthshine, aurora,
#:     bioluminescence, a sun that refuses to set.
#:   · VASTNESS — the horizon a lower tier cannot reach.
#:
#: The intensity is a property of the TIER, not of the scene, so a designer
#: writing a new stage picks a rung and inherits its register rather than
#: arguing about adjectives.
TIER_INTENSITY: dict[str, str] = {
    "alltag": (
        " REGISTER — QUIET AND CHARMING, NOT SPECTACULAR. This is an ordinary place, rendered "
        "beautifully: honest daylight, believable materials, nothing dramatic happening. It should "
        "feel warm, familiar and a little bit lovely — the kind of picture somebody smiles at, not "
        "one they gasp at. No extraordinary weather, no impossible light, no vast horizon. It is "
        "the bottom of a ladder and it must look like it, or nothing above it can feel earned."
    ),
    "ernsthaft": (
        " REGISTER — REAL PLACE, REAL WEATHER, PROPER LIGHT. Somewhere a committed rider actually "
        "goes, at an hour worth photographing: directional light, weather with character, honest "
        "atmosphere and depth. Striking, and entirely possible. Still no event, still nothing "
        "impossible."
    ),
    "selten": (
        " REGISTER — SPECTACULAR, AND SOMETHING IS HAPPENING. Somewhere astonishing that still "
        "exists on this planet, caught at its most extreme moment: the eruption glowing, the storm "
        "grounding, the aurora sheeting overhead. Deeply saturated, one colour nothing else in the "
        "collection has. This has to stop a thumb scrolling past it."
    ),
    "legendaer": (
        " REGISTER — IMPOSSIBLE, AND IT MUST LOOK IT. This is somewhere a human being cannot simply "
        "go, and the picture must make that obvious in the first quarter-second: the scale is "
        "overwhelming, the horizon is further than any horizon on Earth, the light is light that no "
        "ordinary day produces. Physically extraordinary and absolutely beautiful. Somebody seeing "
        "this on another rider's phone should immediately want to know what it costs to earn."
    ),
}


def tier_clause(tier: str | None) -> str:
    """The intensity register for one rung. Unknown or missing tier adds nothing
    rather than guessing a rung — a stage with no tier is simply not laddered."""
    return TIER_INTENSITY.get((tier or "").lower(), "")


#: WHAT A STAGE MAY NOT CONTAIN.
#:
#: Caught on the first playful stage that was tried. The world was described
#: only as "a child's bedroom from a 1990s animated film — sky-blue wall, flat
#: white cartoon clouds, honey floorboards". The render came back with two
#: real film posters on the wall, correctly branded and with the characters
#: drawn accurately. Nobody asked for them: the association pulled them in.
#:
#: A stage is shipped to riders, screenshotted and shared. It cannot carry
#: someone else's trademarks, characters or poster art, and the failure mode is
#: not that the model refuses — it is that it obliges, convincingly, in the
#: background of an otherwise good picture. So the guard is explicit and it
#: rides along with every world.
#:
#: The AESTHETIC is not what is forbidden — flat cartoon clouds on a blue wall
#: are a generic nursery, and a nursery is fine. What is forbidden is the
#: specific: a named property, a recognisable character, a real logo.
NO_IP = (
    " ABSOLUTELY CRITICAL — NO THIRD-PARTY INTELLECTUAL PROPERTY ANYWHERE IN THE IMAGE: no film, "
    "game or television characters, no movie posters, no album covers, no book jackets, no team "
    "kit, no sponsor boards, no brand logos or wordmarks of any kind on any wall, screen, sign, "
    "poster, packaging or vehicle. Walls, screens and signage are blank, abstract or bear only "
    "invented, unreadable marks. The ONLY branding permitted anywhere is what is already printed "
    "on the bicycle in the source image. If a surface would naturally carry a poster or a logo, "
    "leave it empty."
)

#: THE HOUR. Prose arm only — with a plate, the photograph already decided.
STAGE_HOUR = (
    " KEEP THE HOUR AND THE WEATHER THE SETTING ABOVE DESCRIBES: if it names night, rain, frost or "
    "first light, that is the hour, and nothing below may override it. Where the setting names no "
    "particular hour, choose the most beautiful light that place can have."
)

#: THE CRAFT. Every arm, because none of it dictates an hour — it says how to
#: light whatever hour is already there.
#:
#: THIS USED TO BE PROSE-ARM ONLY, AND THAT WAS THE BUG. The plate arm — the one
#: that gives two riders the same world — was receiving no rim separation, no
#: fill, no depth, no landmark rule and no composition at all. It was running
#: naked, and every plate-based render looked flat next to a prose one for that
#: reason alone. Compositing was never the problem.
LIGHT_CRAFT = (
    " THE LIGHT IS THE REWARD — this must feel like ARRIVING somewhere, not like documenting a "
    "place. Within whatever hour the scene already has: the scene's own key light lays a bright rim "
    "along the top tube, the saddle, the bars and the upper curve of both tyres so the bicycle "
    "separates from its ground in a clear edge, and throws its shadow LONG across the ground toward "
    "the camera. The distance recedes in several clearly separated planes so the depth reads as "
    "enormous. A soft bloom on the brightest edges, rich specular highlights across the paint and "
    "every polished component, deep saturated luminous colour with TRUE BLACKS — never milky. "
    "THE BICYCLE MUST NOT FALL INTO SILHOUETTE: a large soft bounce from the camera side, in the "
    "scene's own colour of light, fills its drive side so the frame colour, the decals, the "
    "drivetrain and the hubs stay clearly legible and richly detailed while the rim light still "
    "separates it. The machine is the brightest, most detailed and most desirable object in the "
    "frame. "
    "THE LANDMARK IS THE PROOF: whatever names this place is LARGE and PROMINENT, lit by the "
    "scene's own light and standing clear of the bicycle's silhouette rather than hidden behind it."
)

#: WHERE THE MACHINE SITS. Every arm, and stated as measurements — written as
#: prose ("a clear margin", "the lower middle") the model traded it away.
STAGE_COMPOSITION = (
    " COMPOSITION — THIS IMAGE IS A BACKGROUND WITH INTERFACE DRAWN OVER IT, and its left and right "
    "edges will be cropped by about a fifth. Treat these four as measurements, not preferences: "
    "(1) The bicycle spans NO MORE THAN 60% of the image width, centred horizontally, leaving at "
    "least 20% of the width as empty ground and air beyond EACH wheel. "
    "(2) The tyres meet the ground at about 72% of the image HEIGHT — low in the frame, near the "
    "front of the scene, not floating in the middle of it. "
    "(3) The top third of the frame, in a wide central column, is EMPTY SKY or empty distance: a "
    "portrait is drawn over it, so no landmark, peak or tower may stand there. Put whatever names "
    "the place to the LEFT or the RIGHT of that column. "
    "(4) Nothing that matters sits within the outer eighth of the frame on either side."
)

#: Kept as a name because callers and tests refer to it: the prose arm's full set.
REWARD_LIGHT = STAGE_HOUR + LIGHT_CRAFT + STAGE_COMPOSITION


def tier_clause(tier: str | None) -> str:
    """The intensity register for one rung. Unknown or missing tier adds nothing
    rather than guessing a rung — a stage with no tier is simply not laddered."""
    return TIER_INTENSITY.get((tier or "").lower(), "")


#: WHAT A STAGE MAY NOT CONTAIN.
#:
#: Caught on the first playful stage that was tried. The world was described
#: only as "a child's bedroom from a 1990s animated film — sky-blue wall, flat
#: white cartoon clouds, honey floorboards". The render came back with two
#: real film posters on the wall, correctly branded and with the characters
#: drawn accurately. Nobody asked for them: the association pulled them in.
#:
#: A stage is shipped to riders, screenshotted and shared. It cannot carry
#: someone else's trademarks, characters or poster art, and the failure mode is
#: not that the model refuses — it is that it obliges, convincingly, in the
#: background of an otherwise good picture. So the guard is explicit and it
#: rides along with every world.
#:
#: The AESTHETIC is not what is forbidden — flat cartoon clouds on a blue wall
#: are a generic nursery, and a nursery is fine. What is forbidden is the
#: specific: a named property, a recognisable character, a real logo.
NO_IP = (
    " ABSOLUTELY CRITICAL — NO THIRD-PARTY INTELLECTUAL PROPERTY ANYWHERE IN THE IMAGE: no film, "
    "game or television characters, no movie posters, no album covers, no book jackets, no team "
    "kit, no sponsor boards, no brand logos or wordmarks of any kind on any wall, screen, sign, "
    "poster, packaging or vehicle. Walls, screens and signage are blank, abstract or bear only "
    "invented, unreadable marks. The ONLY branding permitted anywhere is what is already printed "
    "on the bicycle in the source image. If a surface would naturally carry a poster or a logo, "
    "leave it empty."
)

REWARD_LIGHT = (
    " THE LIGHT IS THE REWARD — this image must feel like ARRIVING somewhere, not like documenting "
    "a place. KEEP THE HOUR AND THE WEATHER THE SETTING ABOVE DESCRIBES: if it names night, rain, "
    "frost or first light, that is the hour, and none of what follows may override it. Where the "
    "setting names no particular hour, choose the most beautiful light that place can have. "
    "Within that hour, light it like the best photograph ever taken of this machine: the scene's "
    "own key light lays a bright rim along the top tube, the saddle, the bars and the upper curve "
    "of both tyres so the bicycle separates from its ground in a clear edge, and throws its shadow "
    "LONG across the ground toward the camera. The distance recedes in several clearly separated "
    "planes, each one further and softer than the last, so the depth reads as enormous. Generous "
    "sky above the bicycle, a soft bloom on the brightest edges, rich specular highlights across "
    "the paint and every polished component. Deep saturated luminous colour with TRUE BLACKS — "
    "luminous, never milky or washed out. "
    "THE BICYCLE MUST NOT FALL INTO SILHOUETTE: a large soft bounce from the camera side, in the "
    "scene's own colour of light, fills its drive side so the frame colour, the decals, the "
    "drivetrain and the hubs stay clearly legible and richly detailed while the rim light still "
    "separates it. The machine is the brightest, most detailed and most desirable object in the "
    "frame. "
    "THE LANDMARK IS THE PROOF: whatever names this place is LARGE and PROMINENT, lit by the "
    "scene's own light and standing clear of the bicycle's silhouette rather than hidden behind "
    "it. "
    # COMPOSITION IS A CROP BUDGET, not a taste. The hero room draws a stage
    # with `object-fit: cover`, so whatever the container's shape does not
    # match gets cut — and it is cut from the sides, which is where the wheels
    # are. Rendering portrait (`cyclr_studio.STAGE_ASPECT`) removes most of it;
    # this margin absorbs the rest and every future surface's crop as well.
    # COMPOSITION IS AN INTERFACE CONSTRAINT. This picture is not looked at on
    # its own: it is the hero room, and the app draws over it — the rider's
    # portrait and handle in a centred column across the top third, the
    # readiness dock across the bottom fifth. A render that puts the landmark
    # dead centre gives the rider a bust wearing an observatory tower, and one
    # that centres the bicycle leaves a dead band of empty ground above the
    # dock. Both were measured in the room, not imagined.
    # NUMBERS, NOT ADJECTIVES. Written as prose — "a clear margin", "the lower
    # middle" — the model traded these off against everything else in the
    # string and produced a bigger, higher bicycle than the pass before. Layout
    # constraints have to be stated as measurements or they lose the argument.
    "COMPOSITION — THIS IMAGE IS A BACKGROUND WITH INTERFACE DRAWN OVER IT, and its left and right "
    "edges will be cropped by about a fifth. Treat these four as measurements, not preferences: "
    "(1) The bicycle spans NO MORE THAN 60% of the image width, centred horizontally, leaving at "
    "least 20% of the width as empty ground and air beyond EACH wheel. "
    "(2) The tyres meet the ground at about 72% of the image HEIGHT — low in the frame, near the "
    "front of the scene, not floating in the middle of it. "
    "(3) The top third of the frame, in a wide central column, is EMPTY SKY or empty distance: a "
    "portrait is drawn over it, so no landmark, peak or tower may stand there. Put whatever names "
    "the place to the LEFT or the RIGHT of that column. "
    "(4) Nothing that matters sits within the outer eighth of the frame on either side."
)


def edit_prompt(equipped: list[str], world: str = "", has_plate: bool = False,
                weather: str = "", tier: str | None = None) -> str:
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
    and the plate is the authority. `weather` is the ride's own recorded hour
    (`ride_weather.clause`) — empty for a ride with no stored weather, and then
    nothing is said rather than sunshine being invented.
    """
    from app.services.cyclr_studio import (
        BIKE_CAMERA,
        GENERAL_STYLE,
        ISOLATED_BIKE_STYLE,
    )

    # ── THE STAGE MAY NOT FIT ACCESSORIES ─────────────────────────────────
    # Measured on the Ventoux stage with a real rider's Standert: the model
    # returned the bike with two bottle cages, two bottles, a frame bag and a
    # top-tube bag, all in the frame's own accent colour. Every one of them
    # plausible, none of them the rider's.
    #
    # The collectible is a RECORD OF WHAT THE RIDER OWNS — the whole reason the
    # photograph is handed in rather than the description. A stage that quietly
    # fits luggage turns that record into a fiction, and it does it in the most
    # convincing way possible, which is what makes it worth an explicit clause.
    # A stage changes where the machine STANDS and how it is LIT. Nothing else.
    no_additions = (
        " ABSOLUTELY CRITICAL — ADD NOTHING TO THE BICYCLE: no bottle cages, no water bottles, no "
        "frame bag, no saddle bag, no top-tube bag, no lights, no computer, no pump, no mudguards, "
        "no luggage and no accessory of any kind that is not already present in the source image. "
        "Reproduce the machine exactly as given — same frame, same components, same decals — "
        "adding nothing and removing nothing. Only the SETTING and the LIGHTING change."
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
            f"Stand the bicycle, upright and side-on, in this setting: {world}\n"
            # THE SAME CONTACT RULE THE PLATE PATH GOT, and for the same reason.
            # That arm learned it from a real failure — a bike beautifully lit
            # and floating a hundred metres above a Dolomites road — and then
            # this arm, which is the one every ride actually takes, was left
            # with one soft sentence about the ground "closing over" the tyres.
            # Floating is the default failure of an image model: it composes,
            # it has no physics. So the contact is described as geometry.
            "BOTH TYRES ARE ON THE GROUND AND BEARING THE WEIGHT. Each contact patch is visibly "
            "flattened where the rubber meets the surface, and the surface reacts to it — grit "
            "displaced, grass bent and splayed around the tyre, dust pressed down. Directly under "
            "each contact patch the light is fully occluded: a tight, nearly black core no wider "
            "than the tyre, spreading outward into a soft cast shadow thrown by the key light. "
            "Loose material from the ground — blades of grass, grit, a fallen leaf — overlaps the "
            "bottom edge of each tyre, so the bicycle is IN the scene rather than pasted over it. "
            "There is NO gap, NO floating, and NO uniform grey smudge standing in for a shadow.\n"
            # DARK GROUND, LIVING SUBJECT. The register was reading as bleak
            # rather than premium: the falloff is what makes the bike the
            # subject, but it was draining the colour out of everything inside
            # the lit pool too.
            "The light on the bike matches the light of the place. Everything within that lit "
            "pool is ALIVE and deeply saturated — foliage a rich luminous green, real bounce "
            "light picking colour off the ground and throwing it back onto the underside of the "
            "frame and rims — while the world past it falls away into darkness. Abundant and "
            "rewarding to look at, like a jewel lit in a dark room; never dim, flat, washed-out "
            "or muddy. There is nobody in the picture: the bicycle stands alone."
        )
        if weather:
            ground += "\n" + weather
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
        # Only on the PROSE arm. With a plate, the photograph is the authority
        # on light and relighting it to a different hour would break the match
        # that arm exists to keep.
        # THE CRAFT AND THE COMPOSITION GO TO BOTH ARMS. Only the HOUR is
        # withheld from the plate arm, because the photograph already fixed it.
        + (LIGHT_CRAFT + STAGE_COMPOSITION if world else "")
        + (STAGE_HOUR if (world and not has_plate) else "")
        # Rides along with EVERY stage, plate arm included: a photographed
        # place can have a billboard in it just as easily as an imagined one.
        + (NO_IP if world else "")
        # The rung, last of all, so it colours everything above it. See
        # `TIER_INTENSITY`: the ladder only works because the bottom is quiet.
        + (tier_clause(tier) if world else "")
        # LAST, so it is the final instruction the model reads, and only when
        # nothing was deliberately equipped. A rider who BOUGHT a frame bag must
        # still get it fitted — the clause forbids inventions, not purchases.
        + (no_additions if not changes else "")
    )
