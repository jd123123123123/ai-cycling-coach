"""Cycl_r Studio — the avatar / bike / scene generation pipeline.

Adopted from the `cycl_r-studio` reference the owner chose (its prompts are the
"cool vinyl-toy, hyper-detailed clothing, 1:1 hair" recipe we want), merged
with this app's honest gating and the GPX-derived scene idea.

Three stages, matching the reference:

1. ``analyze_asset(photo, kind)`` — vision pass. `kind='rider'` extracts a
   1:1-exact description (hair especially); `kind='bike'` extracts a dense,
   literal, double-triangle-accurate description.
2. ``render_isolated(description, kind)`` — the standalone avatar (front-facing
   bust) or isolated bike, in the toy-vinyl style, with a DETERMINISTIC seed so
   the same photo always yields the same asset (free consistency + caching).
3. ``compose_scene(rider_desc, bike_desc, training_context)`` — the full-body
   rider-on-bike hero, locked-camera, where `training_context` is the pose +
   scene. For a ride/session this is built from the ride's real GPS via
   `services.ride_scene.scene_descriptor` — the GPX-generated background.

Honest gating throughout: with no Gemini provider/key, every function returns
the prompt it *would* send and `status="image_model_unavailable"`, never a fake.
"""
from __future__ import annotations

import base64
import importlib.util
import json
import pathlib
from typing import Any

from app.config import settings

# ── Style constants (verbatim from the cycl_r-studio reference) ──
# ── Art direction ──
#
# W3 is near-black, one acid accent, tight type, disciplined. The original
# direction here — "kawaii vinyl toy", "chunky toy proportions", "cute" — was
# inherited from the cycl_r-studio reference and read as CHILDISH against that
# ground. It also clashed with the bike ladder, whose art is premium product
# photography on a studio sweep: two different products in one app.
#
# The direction now matches the bikes: stylised realism, matte materials,
# controlled studio light with one acid rim, believable athletic proportions.
# Character comes from posture and attitude, never from cartoon devices.
# ── THE HOUSE STYLE ─────────────────────────────────────────────────────────
#
# Adopted 2026-08-19 from `cycl_r-studio-3`, the owner's own working studio,
# after comparing its output against this file's previous direction. This
# REVERSES the note that used to sit here — the old constants read "NOT cute,
# NOT kawaii, NOT a vinyl toy, NOT chibi" and pushed a restrained, grown-up
# product-campaign look. The studio's premium designer-toy direction is what the
# owner chose on the evidence, so it is the house style now.
#
# NOTE THE ONE BOUNDARY: this style governs the rider, the bike collectible and
# the composed rider-on-bike scenes. It does NOT govern past-ride heroes — those
# render through `ride_framing`, which is deliberately photorealistic because it
# was built and tuned against a different reference the owner supplied for that
# specific surface. Two registers, on purpose. See `ride_framing`'s header.
GENERAL_STYLE = (
    "Premium, high-fidelity 3D render in a warm animated-feature style — richly detailed, "
    "beautifully lit and genuinely expensive-looking. Smooth matte materials with subtle surface "
    "texture, soft rounded forms, physically-based shading, ray-traced global illumination, gentle "
    "ambient occlusion in the creases and a real depth of field. Confident saturated colour under "
    "controlled cinematic lighting. "
    "NOT a flat vector illustration, NOT a cheap plastic toy render, NOT a cartoon."
)
# The "everything in frame is modelled with the same care, no empty voids"
# mandate lives in `ride_scene._RENDER_STYLE`, NOT here. It was briefly in this
# constant and leaked into the ISOLATED renders, where there is no scene to
# model: the rider bust came back standing in an invented, blurred living room.
# A portrait and an object want a clean ground; only a scene wants a world.
# ── HOW THESE PROMPTS ARE WRITTEN ───────────────────────────────────────────
#
# Google's own guidance for this model family is explicit: DESCRIBE THE SCENE,
# do not list keywords. A flowing descriptive paragraph beats a pile of
# comma-separated tags, because the model reads narrative context rather than
# matching terms.
#
# Two consequences, and both changed this file:
#
#  1. PROSE, NOT LISTS. Earlier versions were slabs of shouted fragments —
#     "NO pores, NO wrinkles, NO blemishes, NO visible skin texture" — which is
#     precisely the anti-pattern. They now read as a director's brief.
#  2. POSITIVE, NOT NEGATIVE. A negation has to name the thing it forbids, and
#     naming it is itself a strong signal to a diffusion model: "no wrinkles"
#     puts wrinkles in the context window. Say what the surface IS instead —
#     "smooth matte vinyl" — and the unwanted thing never enters the prompt.
#
# Negations are kept only where there is no positive way to say it and the
# failure is severe (inventing brand text on a frame, changing someone's skin
# colour). Everywhere else, describe the target.
CHARACTER_STYLE = (
    "A warm, instantly likeable stylised 3D collectible character. The look is one contrast: a "
    "simple, clean, beautifully designed face against a hyper-detailed outfit.\n\n"

    "THE FACE follows the attached face reference for its eye size, head proportions and "
    "expression. One flawless smooth matte surface, very few features, an openly happy smile with "
    "a clean line of upper teeth and both corners lifted evenly. The eyes are the largest feature "
    "on the face — each about a fifth of its width, round and wide-set, with bright white sclera "
    "clearly visible around a large coloured iris, a dark pupil and one crisp catchlight, looking "
    "straight down the lens. Small dark dots are far too small: open them up. "
    "THE HEAD PROPORTIONS ARE ALWAYS THE STYLE'S, never the description's: whatever face shape "
    "the person is described as having — oval, long, narrow — it is compressed into this style's "
    "short wide head. The described shape survives only as a light character cue. The head "
    "is short and wide — no longer than it is across — with the features low on it and a generous "
    "rounded forehead above. A slim neck and a light jaw beneath.\n\n"

    "THE PERSON comes entirely from the written description, through four anchors: the hair's cut "
    "and curl, the exact moustache or beard shape, the true skin tone, and the face shape. "
    "HAIR IS THE STRONGEST ANCHOR, so render its curl pattern at full strength: sculpt it as "
    "distinct, separated clusters of curl with clear gaps and shadow between them and real height "
    "off the scalp, so the texture reads instantly from a distance. When the description says "
    "curly or wavy, commit to it fully — a smoothed-down, softly-waved cap of hair loses the one "
    "feature that makes this person recognisable. Facial hair is rendered literally at the "
    "density described — only a full beard is modelled as geometry; light stubble is the faintest "
    "shift in skin tone on an unbroken surface. An adult in their thirties, simplified but never "
    "childlike.\n\n"

    "THE BODY is chunky and rounded: thick soft tubular limbs, full shoulders, mitten hands, a "
    "short stout torso, all in the same clean matte finish.\n\n"

    "THE OUTFIT CARRIES ALL THE DETAIL and should look expensive — the fine ribbed weave of "
    "technical lycra, crisp flatlock seams tracing each panel, a zip with real teeth, gripper "
    "cuffs, and soft folds where fabric gathers."
)
BIKE_STYLE = (
    "The bicycle must maintain perfect, realistic mechanical geometry but with slightly chunky, "
    "premium proportions to match the cool 3D toy character seamlessly. CRITICAL: The wheels and "
    "spokes MUST be perfectly sharp, crisp, and static. NO motion blur, NO spinning effect."
)
ISOLATED_BIKE_STYLE = (
    "The bicycle MUST be an isolated, standalone object with NO rider, NO hands, and NO human "
    "figures present in the image. It must maintain perfect mechanical geometry but with slightly "
    "chunky, premium proportions to match the 3D toy aesthetic. CRITICAL: The wheels and spokes "
    "MUST be perfectly sharp, crisp, and static. NO motion blur, NO spinning effect."
)

# The studio's grounding mandate, and the single best line in it. Without this a
# generated scene reads as a bike sticker pasted over a landscape; with it the
# terrain closes over the contact patch and the whole thing becomes one object.
GROUNDING = (
    "CRITICAL GROUNDING: The bicycle and rider MUST NOT look like they are floating or lazily "
    "pasted on top of the background. The environment's ground surface (grass, dirt, snow, gravel "
    "or road) MUST physically wrap around and partially cover the bottom of the tires, firmly "
    "grounding the bicycle into the terrain like a real 3D diorama or physical model."
)

# The studio's integration mandate, for cosmetic swaps. A part that keeps its
# own former context — chair legs, a rucksack's straps — is the failure mode
# this exists to name, and naming it explicitly is what fixes it.
INTEGRATION = (
    "INTEGRATION MANDATE: ANY new part MUST be structurally integrated into the bicycle's "
    "mechanical design. It cannot look like it is floating, lazily copy-pasted, or retaining "
    "parts that belong to its previous form. For example, if fitting an office chair as a saddle, "
    "completely REMOVE the chair's wheels and legs and fuse its top directly to the seatpost, so "
    "the result looks like a fully functional, custom-built bicycle component. Adjust mounting "
    "brackets, hardware colours and scale so everything looks like it physically belongs on this "
    "frame."
)
# The SAME starter kit for every rider — cosmetics (new kits/looks) are unlocked
# later with points, never taken from the source photo. This keeps avatars
# consistent and app-branded from day one.
#: The kit is where the detail budget goes — see `CHARACTER_STYLE`'s contrast
#: rule. Written as a garment a person would actually own rather than as a
#: colour spec, because the model renders material it can picture.
DEFAULT_KIT = (
    "THE STARTER KIT, worn by every rider so the look is consistent from day one, and described "
    "here as the garment it is. A fitted short-sleeved cycling jersey in matte black with bold "
    "acid lime-green (#C8FF00) side panels and sleeves, a bold white 'W3' wordmark across the "
    "chest and a thin lime accent stripe, worn over matching black bib shorts. "
    "Render the fabric richly: the fine ribbed weave of technical lycra catching the light, crisp "
    "flatlock seams tracing every panel join, a full-length front zip with individual teeth and a "
    "small pull tab at the collar, a gripper band at the hem and cuffs, and the subtle sheen "
    "difference between the matte black panels and the satin lime ones. Soft natural folds gather "
    "at the shoulders and the inside of the elbows where a real jersey would. "
    "This kit replaces whatever the person wore in their photograph."
)

_ANALYSIS = {
    # The likeness clause is the studio's, and adopting it fixes a real defect
    # rather than merely changing a look. The previous prompt asked for a
    # "flattering", "extremely awesome" translation of the person's "vibe" and
    # never once told the model to preserve skin tone or ethnic features — so a
    # model optimising for "attractive" was free to lighten skin and westernise
    # features, and nothing in the prompt objected. The studio's version makes
    # accurate skin tone and ethnic identity an explicit, repeated requirement.
    # That is not a style preference; a rider must recognise themselves.
    # WRITTEN FOR A STYLISED AVATAR, NOT A PORTRAIT — and that is the point.
    #
    # The previous version asked for "distinct facial structure, jawline, eye
    # shape, realistic facial hair". Every one of those is a realism cue, and a
    # specific description beats a general style instruction every time: the
    # render came back as a semi-realistic adult no matter how firmly the style
    # constant asked for a simplified designed face. The description was
    # fighting the art direction and winning.
    #
    # So this pass now extracts only what CARRIES the likeness in this style —
    # hair, facial hair, skin tone, face shape — and is told plainly what the
    # output is for.
    "rider": (
        "You are describing a real person so an artist can sculpt them as a SIMPLIFIED, stylised "
        "3D collectible avatar — not a realistic portrait. Recognition in that style comes from a "
        "few big shapes, so describe those precisely and leave fine detail out.\n\n"
        "Cover exactly these, in a short flowing paragraph:\n"
        "1. HAIR — the single most identifying feature. Its exact colour, length, cut, parting, "
        "and whether it is straight, wavy, curly or coily, plus how much volume it has.\n"
        "2. FACIAL HAIR — its exact shape, colour AND DENSITY. Be precise about how much there "
        "actually is and exactly where it grows: say whether the moustache is the prominent "
        "feature and the rest is only faint stubble, or whether there is a genuinely full beard. "
        "Name the coverage — clean-shaven cheeks, a shadow along the jaw, a connected beard — "
        "because an artist will otherwise render more hair than the person has, which is the "
        "single most common way this likeness goes wrong. If there is none, say so plainly.\n"
        "3. SKIN TONE and ethnic features — described accurately and respectfully. This must be "
        "reproduced truthfully and must never be lightened or altered.\n"
        "4. THE OVERALL SHAPE of the face — round, square, long, heart-shaped — and eye colour.\n\n"
        "Keep it to those. Do NOT describe pores, wrinkles, blemishes, skin texture, fine jawline "
        "structure, or anything that would push an artist toward photorealism — that detail makes "
        "this style worse, not better. Describe the person warmly and flatteringly; this is "
        "someone's own avatar and they should be pleased with it.\n\n"
        "Say nothing about their clothing: the avatar wears a fixed kit."
    ),
    "bike": (
        "You are an expert prompt engineer and cycling aficionado. Analyze this bicycle. "
        "FIRST LINE, exactly: 'NAME: <short name>' — the brand and model if you can read them off "
        "the frame (e.g. 'Specialized Allez'), otherwise a short descriptive name of at most three "
        "words (e.g. 'Steel Fixie', 'Black Gravel'). Never invent a brand you cannot see. "
        "THEN, from the second line on, extract a highly structured, dense description for a highly "
        "accurate 3D model. Detail the: 1. Frame (exact geometry, tube shapes, primary/secondary "
        "colors). 2. Cockpit (handlebar type, tape/grip color). 3. Wheels (rim depth, rim color, "
        "tire wall color). 4. Components (saddle color, pedals). Be extremely literal. The "
        "description must ensure the generated bike maintains physically accurate double-triangle "
        "geometry and matching colors."
    ),
}

# The bike collectible's locked camera. Every bike in the garage is shot the
# same way — drive-side profile, eye level, whole bike in frame — so a rider's
# bike reads as one consistent collectible next to everyone else's, and so the
# Today hero can crop it predictably. Without this the model wanders between
# three-quarter views and crops, and no two renders are comparable.
BIKE_CAMERA = (
    "LOCKED CAMERA: a FLAT SIDE ELEVATION of the bicycle — an orthographic side view, as in a "
    "manufacturer's catalogue photograph or a technical drawing. The camera sits exactly level "
    "with the bike's centre, perfectly perpendicular to it, with a long lens and no perspective "
    "at all.\n"
    "THE TEST FOR THIS IS THE WHEELS: both are perfect circles of IDENTICAL size, and neither is "
    "an ellipse. If the far wheel looks smaller than the near one, or you can see any of the "
    "bike's width — the far side of the bars, the far crank, the top of the saddle, the far side "
    "of the tyres — the camera has rotated and the render is wrong. From this angle the bicycle "
    "is a flat silhouette with no depth showing.\n"
    "It is seen from its DRIVE SIDE (the right-hand side, so the chainring, chain and rear "
    "cassette face the camera) and faces to the RIGHT of frame, centred with clean even padding, "
    "nothing cropped."
)


# The image model used when `IMAGE_MODEL` isn't set. Nano Banana 2 Lite — the
# cheap tier, and verified against this file's exact call shape (locked-camera
# bike prompt, deterministic seed, 1:1). NOTE: the flash models only render at
# 1K; see `_generate`.
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image"


def _seed(s: str) -> int:
    """Deterministic 32-bit seed from a string (mirrors the reference's
    hashString) — same photo/prompt → same asset, so results are reproducible
    and cacheable."""
    h = 0
    for ch in s:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
    return h & 0x7FFFFFFF


def _gemini_ready() -> bool:
    """Provider configured, key present, AND the SDK actually importable.

    The import check is not paranoia — it is the bug this module shipped with.
    `google-genai` was imported lazily inside each call but declared in neither
    requirements.txt nor pyproject.toml, so every render in production died on
    `from google import genai` with a 500. Locally it passed, because the dev
    venv happened to have the package. This module's whole contract is that a
    missing image model degrades to `image_model_unavailable` and never fakes
    or crashes; a missing SDK is exactly that case, so it belongs here.
    """
    if (getattr(settings, "IMAGE_PROVIDER", "") or "").lower() != "gemini":
        return False
    if not getattr(settings, "GEMINI_API_KEY", None):
        return False
    return importlib.util.find_spec("google.genai") is not None


async def analyze_asset(photo_b64: str, kind: str) -> str | None:
    """Vision analysis → the structured description. `kind` ∈ {'rider','bike'}.
    Returns None when the vision model isn't available."""
    if not _gemini_ready():
        return None
    from google import genai
    from google.genai import types

    raw = photo_b64.split(",", 1)[1] if photo_b64.startswith("data:") else photo_b64
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    resp = client.models.generate_content(
        model="gemini-flash-latest",
        contents=[_ANALYSIS[kind], types.Part.from_bytes(data=base64.b64decode(raw), mime_type="image/jpeg")],
        config=types.GenerateContentConfig(temperature=0.0),
    )
    return (resp.text or "").strip() or None


async def _generate(prompt: str, seed_src: str, size: str = "1K") -> str | None:
    """Render one image. `size` is 1K by default and MUST stay 1K on the flash
    models: `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) rejects 2K with
    `400 Image size 2K is not supported for this model`, so a 2K default would
    fail every render. 1K (1024²) is also more than the app ever displays — the
    Today hero paints at 252 px and the share card at 1080 px wide."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
    resp = client.models.generate_content(
        model=model,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(seed_src),
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size=size),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return _to_data_url(data.data)
    return None


def _to_data_url(png: bytes) -> str:
    """Pack rendered bytes into a data URL, transcoding PNG → WebP first.

    These images are stored inline (garage_assets.image_url, ride_scenes) and
    ride in JSON on Today's critical path, where base64's 33% inflation lands on
    top of the file size. A 1K render is ~525 KB as PNG (~700 KB base64) and
    ~43 KB as WebP q85 (~57 KB base64) — a 12× cut for output that is displayed
    at 252 px, with no visible loss on flat toy-render shading.

    Pillow is a hard dependency (requirements.txt), but a missing or broken
    encoder must never cost the rider the bike they just made — we fall back to
    the original PNG rather than failing the render.
    """
    try:
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.open(io.BytesIO(png)).convert("RGB").save(buf, "WEBP", quality=85, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return "data:image/png;base64," + base64.b64encode(png).decode()


def _isolated_prompt(description: str, kind: str) -> str:
    if kind == "rider":
        return (
            f"A tight front-facing PORTRAIT of a 3D character built from this description: "
            f"[{description}].\n\n"
            f"CAMERA FRAMING — this is a close portrait crop, not a figure shot. The head fills "
            f"most of the frame: the crop runs from just above the hair to the middle of the "
            f"chest, and the shoulders reach the left and right edges. Shot dead-on at a direct "
            f"frontal angle, the face square to camera and perfectly centred, looking straight "
            f"down the lens. If the waist, hips or legs are visible the crop is far too wide — "
            f"push in until the head dominates.\n\n"
            f"{DEFAULT_KIT} "
            # Stated explicitly, because without it the render invents a setting:
            # a blurred living room turned up behind the bust the first time the
            # style asked for a richly modelled world.
            f"BACKGROUND: a clean, plain, softly-lit studio ground in a single muted colour with a "
            f"gentle vignette. NO room, NO furniture, NO scenery, NO props, NO text. "
            f"{GENERAL_STYLE} {CHARACTER_STYLE}"
        )
    return (
        f"An isolated 3D bicycle inspired by this description: [{description}]. "
        f"{BIKE_CAMERA} {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )


def split_name(description: str | None) -> tuple[str | None, str | None]:
    """Split a bike analysis into its ``NAME:`` line and the rest.

    The vision pass is asked for `NAME: <short name>` on the first line so the
    collectible can carry a real name without a second model call. The name is
    stripped from the description before rendering — it is a label, not a
    modelling instruction. Older rows (and the rider kind, which is never asked
    for a name) simply have no NAME line, so this returns `(None, description)`
    and nothing downstream changes.
    """
    if not description:
        return None, description
    head, sep, rest = description.partition("\n")
    if not head.strip().upper().startswith("NAME:"):
        return None, description
    # Models decorate: `**"Steel Fixie"**`. Strip quotes and emphasis from both
    # ends in one pass, in any order they were layered on.
    name = head.split(":", 1)[1].strip().strip("*\"'“”‘’ ") or None
    if name and len(name) > 80:
        name = name[:80].rstrip()
    return name, (rest.strip() if sep else None) or None


#: Generated images cannot spell. Left to itself the model writes plausible
#: nonsense onto a frame — a real Standert came back branded "GRAVEL MONSTER"
#: and "LAUEK" — which is worse than no branding at all, because it looks like
#: the app got the rider's bike wrong rather than declining to letter it.
NO_INVENTED_TEXT = (
    "CRITICAL — NO INVENTED LETTERING: reproduce brand names, logos and decal TEXT only where they "
    "are clearly legible in the source photograph, and reproduce them exactly. Where text is not "
    "clearly readable, render that decal as an abstract shape, a colour block or nothing at all. "
    "NEVER invent a brand name, a model name, a slogan or any word. Misspelled or fabricated "
    "lettering on the frame, rims or tyres is a failure."
)


async def render_bike_from_photo(photo_b64: str, description: str) -> tuple[str | None, str, str]:
    """The rider's bike collectible, rendered FROM THE PHOTO — 1:1.

    WHY THIS EXISTS ALONGSIDE `render_isolated`. That path renders from the
    vision description alone, and a description is lossy no matter how dense:
    run on a real Standert Kieswerk it produced the right colour and roughly the
    right bike, with the wrong decals, the wrong wheel depth and an invented
    brand. The rider recognises their bike by exactly those details.

    Handing the photograph in as the input image anchors the geometry, the
    paint, the decals and the component spec to the real machine, and the prompt
    then only has to ask for a change of RENDER STYLE. The description still
    rides along because it survives the photo — every later scene and build is
    composed from it — but it is no longer the only source of truth.
    """
    prompt = (
        # THE CAMERA LEADS. It sat after the restyle instruction for three
        # attempts and the render kept coming back rotated a few degrees toward
        # the viewer — a "product render" prior the model applies by default.
        # Moved to the first line, where it is read as the frame for everything
        # after it rather than a caveat on it.
        "KEEP THE EXACT CAMERA OF THE SUPPLIED PHOTOGRAPH. It is a dead-flat side elevation and "
        "the bicycle must not rotate by even one degree. Do not turn it toward the viewer, do not "
        "add perspective, and do not make it more three-dimensional: from this angle the bicycle "
        "is a flat silhouette, both wheels are perfect circles of equal size, and none of the "
        "bike's width is visible — no far-side handlebar, no far crank, no top of the saddle.\n\n"
        "Now re-render that bicycle, in that orientation, as a premium 3D model.\n\n"
        "THIS IS A RESTYLE, NOT A REDESIGN. The bicycle must be 1:1 IDENTICAL to the photograph: "
        "the same frame geometry and tube shapes, the same paint colour and finish, the same "
        "decals in the same places, the same handlebar, saddle, wheels, rim depth, tyres, "
        "drivetrain and brakes. Change NOTHING about the machine itself — not the colour, not the "
        "shape, not a single component. Only the rendering style changes.\n\n"
        "KEEP THE PHOTOGRAPH'S CAMERA EXACTLY. It is already a flat, straight-on side elevation, "
        "and the bicycle must stay in precisely that orientation — do not rotate it even slightly "
        "toward the viewer, and do not add perspective or a three-quarter turn to make it look "
        "more dimensional. Overlay your result on the original and the two silhouettes should sit "
        "on top of each other: both wheels perfect circles of equal size, and none of the bike's "
        "width showing.\n\n"
        f"REFERENCE DETAIL (from the same photograph): [{description}]\n\n"
        f"{NO_INVENTED_TEXT}\n\n"
        f"{BIKE_CAMERA} "
        "Set the bicycle on a clean, soft, neutral light-grey studio backdrop with a subtle contact "
        "shadow directly beneath the wheels. The background must be plain — no props, no scenery. "
        f"{GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    img = await edit_image(photo_b64, prompt, description or photo_b64[:64])
    return img, prompt, "ok" if img else "image_model_unavailable"


#: A shipped picture of the character BUILD the house style wants — thick
#: tubular limbs, short stout torso, big round head.
#:
#: WHY AN IMAGE AND NOT MORE WORDS. The prompt described this build four times
#: across two rounds, in progressively blunter language, and every render came
#: back with near-anatomical limbs: the model has a very strong prior for
#: "cyclist" and prose loses to it. The same lesson the bike learned — anything
#: that must match is handed over as an image, never as a description.
_BUILD_REF = pathlib.Path(__file__).resolve().parents[1] / "data/style/character_build.webp"

#: A shipped picture of the FACE TREATMENT the house style wants — big round
#: clean eyes, few features, smooth matte surface, warm expression.
#:
#: Same lesson as the build and the bike, learned a third time: the face was
#: described in careful narrative prose — "large, round, wide-set, bright white
#: sclera, warm and open" — and still came back with small narrow eyes on a
#: long semi-realistic head. Google's own guidance for this model family says
#: reference images beat description and that each image's ROLE should be named
#: explicitly, so there are now two, and the prompt says what each is for.
_FACE_REF = pathlib.Path(__file__).resolve().parents[1] / "data/style/character_face.webp"

#: Used with the reference. The danger of a style image is that the model copies
#: the WRONG things from it, so what to take and what to ignore is spelled out.
_BUILD_MANDATE = (
    "\n\nTHE TWO ATTACHED IMAGES ARE STYLE REFERENCES, not people. IMAGE 1 sets the FACE: copy "
    "its eye size relative to the face, its short wide head proportions, how low the features sit "
    "and how warm the expression is — your face should look built by the same hand. IMAGE 2 sets "
    "the BODY: copy its chunky proportions and thick soft limbs. If your eyes are smaller or your "
    "face longer than IMAGE 1, you have drifted back toward realism; match the reference.\n"
    "Take nothing else from either image — not their faces, skin tones, hair, clothing, colours, "
    "poses or backgrounds. The references supply the sculpt; the description supplies the person. "
    "The head is bare: no helmet, cap or glasses, so the hair stays fully visible."
)


def _style_references() -> list[str]:
    """The face and build references, as data URLs, IN ROLE ORDER.

    Order is part of the contract: `_BUILD_MANDATE` calls them "IMAGE 1" and
    "IMAGE 2", so face must come first. Either may be absent — each is optional
    by design, and a deploy that ships neither degrades to the old text-only
    render rather than failing to make an avatar at all.
    """
    out: list[str] = []
    for path in (_FACE_REF, _BUILD_REF):
        try:
            raw = path.read_bytes()
        except OSError:
            continue
        out.append("data:image/webp;base64," + base64.b64encode(raw).decode())
    return out


async def _generate_with_refs(prompt: str, refs: list[str], seed_src: str) -> str | None:
    """One render conditioned on several style references at once."""
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
    resp = client.models.generate_content(
        model=model,
        contents=[_img_part(r) for r in refs] + [prompt],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(seed_src),
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return _to_data_url(data.data)
    return None


async def render_isolated(description: str, kind: str) -> tuple[str | None, str, str]:
    """Render the standalone avatar bust or isolated bike from a description.

    The RIDER is conditioned on TWO shipped style references — the face
    treatment and the body sculpt — because prose could not hold either. Both
    were described in careful narrative and both still drifted toward a
    semi-realistic adult; the images hold them. The bike takes no style
    reference: its shape must come from the rider's own photograph, which is
    what `render_bike_from_photo` is for.
    """
    prompt = _isolated_prompt(description, kind)

    if kind == "rider":
        refs = _style_references()
        if refs:
            prompt += _BUILD_MANDATE
            if not _gemini_ready():
                return None, prompt, "image_model_unavailable"
            img = await _generate_with_refs(prompt, refs, description)
            return img, prompt, "ok" if img else "image_model_unavailable"

    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    img = await _generate(prompt, description)
    return img, prompt, "ok" if img else "image_model_unavailable"


async def render_from_photo(photo_b64: str, kind: str) -> dict[str, Any]:
    """Full asset pipeline: analyse the photo, then render the isolated asset.
    `kind` ∈ {'rider','bike'}. For a bike the analysis also yields the
    collectible's `name` (see `split_name`); for a rider `name` is always None."""
    raw = await analyze_asset(photo_b64, kind)
    if raw is None:
        return {"name": None, "description": None, "image": None,
                "prompt": _isolated_prompt("", kind), "status": "image_model_unavailable"}
    name, description = split_name(raw) if kind == "bike" else (None, raw)
    if not description:
        # The model returned only a name line — nothing to render from.
        return {"name": name, "description": None, "image": None,
                "prompt": _isolated_prompt("", kind), "status": "image_model_unavailable"}
    img, prompt, status = await render_isolated(description, kind)
    return {"name": name, "description": description, "image": img, "prompt": prompt, "status": status}


def _scene_prompt(rider_desc: str, bike_desc: str, training_context: str) -> str:
    """The combined full-body hero. `training_context` is the pose + scene —
    for a ride, built from the GPX via `ride_scene.scene_descriptor`."""
    return (
        f"LOCKED CAMERA ANGLE: A wide-angle, full-body shot of a 3D character and their bicycle. "
        f"CRITICAL INSTRUCTION: The character's face and hair MUST be 100% identical to "
        f"this exact description: [{rider_desc}]. Do not alter their facial features or expression "
        f"from the description. {DEFAULT_KIT} You MUST strictly adhere to the exact details in this bicycle "
        f"description: [{bike_desc}]. The action/scene is: {training_context}. CRITICAL ANATOMY: "
        f"The character MUST be rendered with complete, correct human anatomy. Both arms, both "
        f"hands, both legs, and both feet MUST be fully visible, distinct, and flawlessly rendered "
        f"(no missing limbs, no clipping into the bike or ground). CRITICAL CAMERA FRAMING: The "
        f"camera angle, lens focal length, height, and framing MUST be 100% identical and static "
        f"across all images. The character and bicycle MUST occupy the exact same scale and "
        f"proportions in the center of the frame, regardless of the pose. Use a fixed eye-level "
        f"SIDE-ON PROFILE from the bike's DRIVE SIDE (its right-hand side, chainring and cassette "
        f"facing the camera), with the rider and bike travelling to the RIGHT of frame — the same "
        f"locked camera the isolated bike collectible uses, so a rider's scenes and their garage "
        f"bike read as one set. Do not use a three-quarter or front-on angle. "
        f"Do not crop or zoom in; both wheels, the rider's head, and "
        f"BOTH FEET must be 100% visible with consistent padding around the edges. "
        f"{GROUNDING} "
        f"{GENERAL_STYLE} {CHARACTER_STYLE} {BIKE_STYLE}"
    )


#: Appended when the rider's and bike's own renders are handed in as image
#: inputs. Without it the model treats them as loose inspiration.
_REFERENCE_MANDATE = (
    "\n\nCRITICAL — THE SUPPLIED REFERENCE IMAGES ARE THE SOURCE OF TRUTH, above any wording in "
    "this prompt. The FIRST image is the rider's own character render: reproduce that exact face, "
    "the same head shape and proportions, the same eyes, the same hair, the same facial hair, the "
    "same skin tone and the same body build and limb thickness — this is the same character, in a "
    "new pose. The SECOND image is the rider's own bicycle: reproduce that exact bike — the same "
    "frame shape and colour, the same decals and lettering, the same wheels, rim depth, tyres and "
    "components. Do NOT redesign either, do NOT re-letter the frame, and do NOT drift toward a "
    "more realistic or a more generic figure. Only the POSE and the SURROUNDINGS are new."
)


async def compose_scene(
    rider_desc: str,
    bike_desc: str,
    training_context: str,
    *,
    rider_img: str | None = None,
    bike_img: str | None = None,
) -> tuple[str | None, str, str]:
    """The rider-on-bike hero for a given training context / GPX scene.

    PASS THE RENDERS WHEN YOU HAVE THEM. Text-only composition re-derives both
    subjects from words on every call, and words are lossy in exactly the places
    that matter: measured on a real Standert, the garage bike read "standert"
    correctly while the same bike in a scene came back branded "IRELER", and the
    character drifted from the stylised bust toward a realistic adult with thin
    limbs. Handing the two collectibles in as image inputs anchors both, so the
    rider on the mountain is recognisably the rider in the garage.

    Degrades cleanly: with no images this is exactly the old text-only path, so
    a rider who has a description but no render still gets a scene.
    """
    prompt = _scene_prompt(rider_desc, bike_desc, training_context)
    refs = [i for i in (rider_img, bike_img) if i]
    if refs:
        prompt += _REFERENCE_MANDATE
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    if not refs:
        img = await _generate(prompt, prompt)
        return img, prompt, "ok" if img else "image_model_unavailable"

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
    # Images FIRST, prompt last — the same order `compose_rider` uses, and the
    # order the model weights references most strongly.
    contents = [_img_part(i) for i in refs] + [prompt]
    resp = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(prompt),
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size="1K"),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return _to_data_url(data.data), prompt, "ok"
    return None, prompt, "image_model_unavailable"


def _rider_compose_prompt() -> str:
    """The final composed rider: the person on their bike, wearing their helmet,
    as one premium W3 3D collectible. The three reference photos are provided as
    image inputs (rider first, then bike, then helmet)."""
    return (
        "Create ONE premium 3D designer-vinyl-toy collectible: a full-body, side-profile "
        "shot of a cyclist actively riding a road bike, in a dynamic athletic riding "
        "posture (hands on the drops, leaning forward). Use the THREE reference images: "
        "IMAGE 1 is the PERSON — the character's face, hair, skin tone, eyebrows and "
        "facial hair MUST be an exact, highly flattering 1:1 likeness of this person "
        "(idealized into a cute, deeply likable 3D toy face, but unmistakably them). "
        "IMAGE 2 is the BIKE — reproduce its frame geometry, colours and components "
        "faithfully with slightly chunky premium toy proportions. IMAGE 3 is the HELMET "
        "— the character MUST wear this exact helmet (shape, colour, straps). "
        f"{DEFAULT_KIT} "
        "COMPOSITION: complete correct anatomy (both arms, both hands, both legs, both "
        "feet visible, feet on the pedals), the whole bike and rider centered with clean "
        "padding, a clean minimalist solid soft pastel studio background, soft studio "
        "lighting, high-quality octane render. "
        f"{GENERAL_STYLE} {CHARACTER_STYLE} {BIKE_STYLE}"
    )


async def edit_image(base_b64: str, prompt: str, seed_src: str, size: str = "1K") -> str | None:
    """Image-conditioned edit: hand a picture back with an instruction.

    The difference from `_generate` is the whole reason `bike_build` works. A
    text-only render redraws the bicycle from a description and the result
    differs from the last one in every pixel; an edit keeps the frame, the
    paint, the camera and the light and moves only what was asked for.
    `docs/w3-bike-customisation.md` measured it — a wheel swap moves 5.4 % of
    pixels, a saddle 0.9 %.

    ALWAYS pass the rider's ORIGINAL render as `base_b64`, never an
    already-edited one: the same note measured stacking drifting from 5.3 % to
    6.3 % over two steps, which is how a bike slowly stops being the bike.
    """
    if not _gemini_ready():
        return None
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
    resp = client.models.generate_content(
        model=model,
        contents=[_img_part(base_b64), prompt],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(seed_src),
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size=size),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return _to_data_url(data.data)
    return None


def _img_part(photo_b64: str):
    from google.genai import types
    mime = "image/jpeg"
    raw = photo_b64
    if photo_b64.startswith("data:"):
        header, raw = photo_b64.split(",", 1)
        if "image/png" in header:
            mime = "image/png"
        elif "image/webp" in header:
            mime = "image/webp"
    return types.Part.from_bytes(data=base64.b64decode(raw), mime_type=mime)


async def compose_rider(
    self_b64: str, bike_b64: str, helmet_b64: str, size: str = "2K"
) -> dict[str, Any]:
    """Compose the final rider from three real photos (self, bike, helmet) in one
    multi-image generation. Returns {image, prompt, status}. Honestly gated."""
    prompt = _rider_compose_prompt()
    if not _gemini_ready():
        return {"image": None, "prompt": prompt, "status": "image_model_unavailable"}
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL
    resp = client.models.generate_content(
        model=model,
        contents=[prompt, _img_part(self_b64), _img_part(bike_b64), _img_part(helmet_b64)],
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            seed=_seed(self_b64[:64] + bike_b64[:32] + helmet_b64[:32]),
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size=size),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            img = "data:image/png;base64," + base64.b64encode(data.data).decode()
            return {"image": img, "prompt": prompt, "status": "ok"}
    return {"image": None, "prompt": prompt, "status": "image_model_unavailable"}
