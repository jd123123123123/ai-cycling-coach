"""The past-ride hero: the rider's bike, alone, as a photoreal product shot.

WHY THIS IS NOT `ride_scene.py`. That module composes TODAY's hero — a stylised
3D character on a stylised bike, and its `_RENDER_STYLE` says so in as many
words: "simplified and stylised rather than photoreal", plus a mandatory
lime-green accent in the light. That register is correct for Today, where a
cartoon-adjacent rider figure is carrying the day's message through its posture.

It is the wrong register for a past ride. The reference this module was built
from is photoreal product photography with no lime anywhere in it — its only
accents are a crimson bloom and an orange pump. Rendering both from one style
constant is why ride scenes never looked like the reference. So there are two
registers, deliberately, and this file owns the photoreal one.

THREE DIFFERENCES FROM THE TODAY REGISTER, all load-bearing:

  1. NO RIDER. `cyclr_studio._scene_prompt` carries a long defensive anatomy
     block ("both arms, both hands, both legs, both feet ... no clipping")
     because the human figure is where these models fail. The reference has no
     human in it at all, which is exactly why it is flawless. A past ride shows
     the machine.
  2. PHOTOREAL, not stylised. Ray-traced global illumination, physically-based
     materials, real optical depth of field.
  3. NO MANDATORY LIME. The accent budget belongs to the framing, and most
     framings spend it on something other than lime.

WHAT IS EARNED AND WHAT IS BOUGHT. The ride's real GPS and elevation choose the
DEFAULT framing (`default_framing_for`) — climb a mountain and the ride is shot
in the alpine framing, for free, because the rider went there. Owning another
framing lets them re-shoot the same ride in it. Nothing here fabricates a place:
as `ride_scene`'s own header already states, these are stylised impressions of a
region and terrain, never a satellite-accurate reconstruction, and never a
place name the app did not resolve.
"""
from __future__ import annotations

from dataclasses import dataclass

from app.services.ride_scene import RideGeo, terrain_key

# ── the invariants: camera, light and render, shared by every framing ────────
#
# These three are what make two rides in two different framings read as one set.
# A framing may restyle the world around the bike; it may never move the camera,
# because the whole garage depends on one locked drive-side profile.

SCENE_CAMERA = (
    "LOCKED CAMERA: a strict side-on profile of the bicycle from its DRIVE SIDE (the right-hand "
    "side, so the chainring, chain and rear cassette all face the camera), at eye level with the "
    "bike's centre, the bike facing to the RIGHT of frame. Shoot as if on an 85-105mm short "
    "telephoto: NO wide-angle distortion, both wheels perfectly circular and never foreshortened, "
    "no converging verticals. The bicycle is centred and FILLS THE FRAME — it occupies at least "
    "85% of the frame width and is vertically centred, with only a narrow, even margin around it. "
    "Do not leave a large empty band of dark space above the bicycle. Nothing is cropped: both "
    "wheels, the bars and the saddle are fully in frame. The focal plane sits exactly on the "
    "drive side of the frame, at an aperture around f/2.0 — the bike is razor sharp from wheel to "
    "wheel while everything nearer and further falls away into genuine optical bokeh. Do NOT use "
    "a three-quarter view, a low hero angle, or a top-down view."
)

SCENE_LIGHT = (
    "LIGHTING: THE BICYCLE IS THE BRIGHTEST OBJECT IN THE FRAME and must be fully, richly exposed "
    "— every tube, rim and component clearly lit and legible, its metal genuinely gleaming. A "
    "single hard key light from the front-left, roughly 35 degrees above the horizon and 20 "
    "degrees off the camera axis, rakes across the drive side and draws one bright continuous "
    "specular highlight running the full length of the top tube and down tube. A distinct cooler "
    "rim light from behind-left separates the bicycle's silhouette from the background and catches "
    "the edges of whatever surrounds it. "
    "THE AGGRESSIVE FALLOFF APPLIES TO THE SURROUNDINGS, NEVER TO THE BICYCLE: the world past it "
    "sinks quickly to near-black, while the bicycle stays bright — that contrast between a lit "
    "subject and a dark world is the entire look. Do NOT render a dim, flat, underexposed or "
    "evenly-lit scene. No fill on the bicycle's shadow side; its shadows stay deep and clean. "
    "There is no sky and no horizon line in frame. A soft, believable contact shadow sits directly "
    "beneath both wheels."
)

SCENE_RENDER = (
    "RENDER: photorealistic 3D product photography of the highest standard — ray-traced global "
    "illumination, physically-based materials, true optical depth of field, fine micro-surface "
    "detail. This is a premium campaign still of a real object in a real place. NOT stylised, NOT "
    "simplified, NOT a cartoon, NOT a toy diorama, NOT an illustration. No text, no watermark, no "
    "logos other than those already on the bicycle, no people, no hands, no animals."
)

# The bike is the subject and it must survive the restyling untouched. This is
# the same promise `bike_render.compose_prompt` makes about components, applied
# to the world around them instead.
SCENE_SUBJECT = (
    "THE BICYCLE ITSELF IS UNCHANGED. Keep its exact frame geometry, its exact colours and "
    "finishes, its exact components, decals and accessories, precisely as described. The framing "
    "restyles only the environment around the bicycle — never the bicycle."
)


@dataclass(frozen=True)
class Framing:
    """One purchasable way to shoot a ride.

    A framing owns the whole world around the bike — the defocused near layer
    that frames it, the surface it stands on, what is behind it, and the colour
    grade over all three. It never owns the camera, the subject, or the render
    style; those are the invariants above.

    `price_rc` of 0 is a framing every rider has: the studio, and whichever
    framing the ride's own terrain earned.
    """

    id: str
    name_de: str
    price_rc: int
    #: The heavily defocused near-camera layer. This is the single biggest
    #: contributor to the reference's expensive look and the literal "framing".
    foreground: str
    #: The surface the bicycle stands on, sharp beneath the wheels.
    ground: str
    #: What lies behind, dissolving into black in the upper third.
    backdrop: str
    #: The three-family colour discipline. Restraint is doing as much work here
    #: as detail is.
    palette: str


# ── the catalogue ───────────────────────────────────────────────────────────
#
# GARDEN is transcribed from the reference frame, layer by layer. The others are
# built to the same four-part structure so they are genuinely comparable and a
# rider can swap between them without the picture changing character.

FRAMINGS: dict[str, Framing] = {
    "studio": Framing(
        id="studio",
        name_de="Studio",
        price_rc=0,
        foreground=(
            "nothing in the near field — the frame edges are clean, with only a gentle darkening "
            "into the corners"
        ),
        ground=(
            "a seamless, soft, neutral dark-grey studio sweep with a subtle contact shadow "
            "directly beneath the wheels"
        ),
        backdrop=(
            "the same seamless sweep curving up behind the bicycle and falling evenly to "
            "near-black, with no visible join, no props and no scenery"
        ),
        palette=(
            "a strictly neutral greyscale ground so the bicycle's own colours are the only "
            "chroma in the frame"
        ),
    ),
    "garden": Framing(
        id="garden",
        name_de="Garten",
        price_rc=900,
        foreground=(
            "a band of extremely defocused dark-green foliage across the bottom edge of the frame, "
            "rising no higher than the lower quarter of the left and right edges — a low near "
            "border, NOT a tunnel or an archway, and never closing in around the bicycle. It sits "
            "so close to the lens that it is EXTREMELY out of focus — individual leaves, stems and "
            "petals must be completely unreadable, melted into soft blobs of colour and shadow with "
            "no hard edge anywhere in this layer. Two or three muted crimson blooms sit in that "
            "near band at bottom-centre, reduced to nothing but warm circles of colour. This is the "
            "most defocused thing in the picture, far blurrier than the background. It frames the "
            "bicycle and darkens the corners; it must never come into focus and must never obscure "
            "a wheel"
        ),
        ground=(
            "a closely mown summer lawn, tack-sharp directly beneath the bicycle with individual "
            "blades resolved, softening out of focus within roughly one bike length in each "
            "direction"
        ),
        backdrop=(
            "dense, dark boxwood hedging and clipped topiary massed behind the bicycle at about "
            "wheel-top height, softly defocused, with tall shrubs at the left and right edges; the "
            "planting falls away fast and dissolves into COMPLETE BLACK across the whole upper "
            "third of the frame — no detail, no shape and no light survives up there"
        ),
        palette=(
            "three colour families only — deep greens from near-black through to a lit mid-green, "
            "the bicycle's own metal and paint, and the near band's warm crimson. Cool greens set "
            "against a neutral-to-warm key at roughly 5000K. Nothing else is permitted any "
            "saturation"
        ),
    ),
    "alpine": Framing(
        id="alpine",
        name_de="Hochgebirge",
        price_rc=1200,
        foreground=(
            "a defocused foreground of dark wet rock and coarse alpine grass along the bottom edge, "
            "with a suggestion of cold mist drifting through the near field, softening the lower "
            "corners without ever obscuring the wheels"
        ),
        ground=(
            "damp, coarse granite chippings at the edge of a pass road, sharp under the tyres, with "
            "meltwater darkening the stone and holding a specular sheen from the key light"
        ),
        backdrop=(
            "sheer dark rock faces rising immediately behind, their detail swallowed by shadow, and "
            "cold mist filling the space between them; no summit and no sky are visible"
        ),
        palette=(
            "cold slate greys and blue-black rock against the bicycle's own colours, with the key "
            "light noticeably cooler than neutral. No warm tones anywhere except on the bicycle"
        ),
    ),
    "coast": Framing(
        id="coast",
        name_de="Küste",
        price_rc=1100,
        foreground=(
            "defocused marram grass and dune sand across the bottom edge, bending in the wind, and "
            "a faint haze of salt spray softening both lower corners"
        ),
        ground=(
            "compacted damp sand at the top of a beach, sharp beneath the wheels, with fine ripples "
            "and a dark waterline holding the reflection of the key light"
        ),
        backdrop=(
            "dark cold water behind, its surface broken and unlit, with a low headland dissolving "
            "into the black at the left edge; no sunset and no bright sky"
        ),
        palette=(
            "deep blue-greens and wet sand against the bicycle, with the key light breaking cold "
            "and hard across the frame"
        ),
    ),
    "autumn": Framing(
        id="autumn",
        name_de="Herbstwald",
        price_rc=1000,
        foreground=(
            "a defocused drift of fallen beech and oak leaves banked along the bottom edge, their "
            "ambers and rusts reduced to soft warm shapes, rising slightly up both side edges"
        ),
        ground=(
            "a damp forest track thick with fallen leaves, tack-sharp under the tyres so individual "
            "leaf edges and the wet earth between them read clearly"
        ),
        backdrop=(
            "close-set dark trunks receding into the wood behind, bare branches interlacing "
            "overhead, everything past the third rank of trees lost to black"
        ),
        palette=(
            "warm amber and rust against near-black bark and wet dark earth, with a low, warm key "
            "raking through the trunks"
        ),
    ),
    "nocturne": Framing(
        id="nocturne",
        name_de="Nachtfahrt",
        price_rc=1400,
        foreground=(
            "wet asphalt filling the near field, thrown far out of focus, scattering the key light "
            "into broad soft pools across the bottom edge of the frame"
        ),
        ground=(
            "rain-soaked tarmac, mirror-sharp beneath the bicycle, holding a clean inverted "
            "reflection of the frame and wheels that fades within half a bike length"
        ),
        backdrop=(
            "an empty street at night falling immediately to black, with two or three distant "
            "sodium lights reduced to soft bokeh discs high in the frame"
        ),
        palette=(
            "near-black throughout, lifted only by the cold specular sheen on wet tarmac and the "
            "warm amber bokeh of the distant lamps"
        ),
    ),
}

DEFAULT_FRAMING = "studio"

# Terrain the ride actually covered -> the framing it earns, free. A rider who
# climbed a mountain gets the alpine framing for that ride without paying for
# it; buying a framing is how you shoot a ride in a world it did NOT earn.
_TERRAIN_FRAMING = {
    "mountain": "alpine",
    "coastal": "coast",
    "hilly": "studio",
    "flat": "studio",
}


def default_framing_for(g: RideGeo) -> str:
    """The framing this ride earned from its own GPS and elevation.

    Free for the rider, every time, because they went there. With no distance
    and no elevation to read there is no terrain to earn anything from, and the
    ride falls back to the studio rather than being awarded a landscape.
    """
    if (g.distance_m or 0) <= 0 and g.elevation_gain_m is None:
        return DEFAULT_FRAMING
    return _TERRAIN_FRAMING.get(terrain_key(g), DEFAULT_FRAMING)


def get(framing_id: str | None) -> Framing:
    """A framing by id, falling back to the studio. Never raises: an unknown id
    coming back from an old cached row must degrade to a real picture."""
    return FRAMINGS.get(framing_id or "", FRAMINGS[DEFAULT_FRAMING])


def scene_prompt(bike_description: str, framing_id: str | None) -> str:
    """The full past-ride hero prompt: this exact bicycle, in this world.

    Composed in the order the model reads best — subject, then camera, then the
    world in depth order (near band, ground, backdrop), then light, grade and
    render. The bicycle's own description leads, because it is the one thing in
    the frame that must not be reinterpreted.
    """
    f = get(framing_id)
    return (
        f"A photorealistic still of a single bicycle, alone, in the setting described below. "
        f"THE BICYCLE: [{bike_description}]. {SCENE_SUBJECT} "
        f"{SCENE_CAMERA} "
        f"FOREGROUND (nearest the lens, heavily out of focus): {f.foreground}. "
        f"GROUND: {f.ground}. "
        f"BACKDROP: {f.backdrop}. "
        f"{SCENE_LIGHT} "
        f"COLOUR: {f.palette}. "
        f"{SCENE_RENDER}"
    )


def edit_prompt(framing_id: str | None) -> str:
    """The image-conditioned variant: re-shoot an EXISTING bike render in a new
    world, handing the rider's own bike image in as the input.

    This is the path a framing purchase takes. `docs/w3-bike-customisation.md`
    measured why it beats generating from a description: the bike stays
    pixel-identical across framings because it is never redrawn, only relit and
    re-grounded. Always edit from the rider's ORIGINAL bike render, never from
    an already-framed image — stacking drifts.
    """
    f = get(framing_id)
    return (
        "Place the bicycle from the supplied photograph into the setting described below. "
        "Keep the SAME bicycle, pixel for pixel where you can: the same frame geometry, the same "
        "colours, finishes, decals, components and accessories, at the same scale and the same "
        "position in frame. Change ONLY the world around it, and the light falling on it. "
        f"{SCENE_CAMERA} "
        f"FOREGROUND (nearest the lens, heavily out of focus): {f.foreground}. "
        f"GROUND: {f.ground}. "
        f"BACKDROP: {f.backdrop}. "
        f"{SCENE_LIGHT} "
        f"COLOUR: {f.palette}. "
        f"{SCENE_RENDER}"
    )
