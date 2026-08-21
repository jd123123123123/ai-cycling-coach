"""Cycl_r Studio — the avatar / bike / scene generation pipeline.

Adopted from the `cycl_r-studio` reference the owner chose (its prompts are the
"cool vinyl-toy, hyper-detailed clothing, 1:1 hair" recipe we want), merged
with this app's honest gating and the GPX-derived scene idea.

Three stages, matching the reference:

1. ``analyze_asset(photo, kind)`` — vision pass. `kind='rider'` extracts a
   1:1-exact description (hair especially); `kind='bike'` extracts a dense,
   literal, double-triangle-accurate description.
2. ``render_isolated(description, kind, seed_src=...)`` — the standalone avatar
   (front-facing bust) or isolated bike. The seed comes from the PHOTO, not the
   description: the vision pass returns different prose on every run even at
   temperature 0, so seeding on its output handed a rider a different face each
   time they re-rendered. Same photo, same asset — which is also what makes the
   result cacheable.
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
import logging
import pathlib
from typing import Any

from app.config import settings

log = logging.getLogger(__name__)

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

    "THE BODY IS A RATIO, and the ratio is the look: a designer art-toy collectible. The head is a "
    "big smooth sphere, two thirds as wide as the shoulders are broad, and the whole standing "
    "figure is three and a half heads tall. The head nests straight down into the collar the way a "
    "toy's head sits on its garment. Shoulders broad, soft and gently sloped, ending just past the "
    "head's outer edge, with a short compressed torso beneath them. Everything else is volume "
    "rather than anatomy — thick cylindrical limbs of even girth, mitten hands.\n\n"

    "THE CONTRAST IS WHAT MAKES IT EXPENSIVE: simplified vinyl-toy geometry wearing "
    "photorealistic technical clothing. Skin and hair stay one flawless soft-matte surface, "
    "uniform and completely clean, and the whole detail budget goes to the kit — woven with real "
    "physical relief, a weave with depth you could feel, seams that stand proud of the panels they "
    "join, hardware with actual thickness. Hard trim anchors the soft forms: metal, enamel and "
    "satin against matte vinyl, under a controlled key with a crisp rim light separating the "
    "figure from the ground and deep ambient occlusion where forms meet."
)
BIKE_STYLE = (
    "The bicycle must maintain perfect, realistic mechanical geometry but with slightly chunky, "
    "premium proportions to match the cool 3D toy character seamlessly. CRITICAL: The wheels and "
    "spokes MUST be perfectly sharp, crisp, and static. NO motion blur, NO spinning effect."
)
#: THE GROUND EVERY BIKE STANDS ON, and it is the app's own.
#:
#: Bikes were rendered on "a clean, soft, neutral LIGHT-GREY studio backdrop"
#: — a pale square dropped onto a near-black app, which is why Today had to
#: screen-blend and radially mask the art to stop it reading as a lit card in
#: the middle of the screen, and why it could never simply fill the frame: a
#: bright rectangle has edges that must be hidden. The whole CSS apparatus
#: existed to disguise the ground the render came with.
#:
#: This is `backdrops.studio_black` said in the bike's own language, so the free
#: default stage and the plain collectible are the SAME picture rather than two
#: that have to be reconciled.
BIKE_GROUND = (
    "Set the bicycle on a near-black studio ground: deep matte darkness falling away on every "
    "side with no horizon and no scenery at all, a soft pool of light on the floor beneath the "
    "wheels, a real contact shadow under each tyre, and a gentle falloff into pure black at the "
    "edges of frame. The bicycle is the only colour in the picture. The background must be plain "
    "— no props, no scenery, no text."
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
        "geometry and matching colors.\n\n"
        # ── AND THEN, THE PART THE RIDER READS ──────────────────────────────
        # The description above is an IMAGE PROMPT and stays English on purpose:
        # it is scaffolded by English instructions and mixing languages inside
        # one prompt costs render quality. But the app showed that same English
        # paragraph to the rider as a spec sheet, in a German interface — which
        # is the single most obvious "unfinished" signal a product can give.
        # So the pass writes the read-out too, in the rider's language, and the
        # two are kept apart by a marker rather than by a new column.
        "FINALLY, output a line containing exactly '---DE---', and after it a SHORT GERMAN "
        "spec sheet for the owner to read — three lines, each 'Label: Wert', using exactly these "
        "labels in this order: 'Rahmen', 'Cockpit', 'Laufräder'. Plain German, no English words, "
        "no marketing, at most twelve words per line. Describe only what is visible."
    ),
}

#: Separates the English image prompt from the German read-out inside one
#: stored description. Chosen to be something no vision pass would ever emit.
DESC_SPLIT = "---DE---"


def split_description(description: str | None) -> tuple[str, str]:
    """(prompt text, rider-facing text) out of one stored description.

    Older assets were stored before the pass wrote a German half, so they have
    no marker: their English text is returned for both, which is exactly what
    the app showed before — no backfill, and nothing gets worse.
    """
    if not description:
        return "", ""
    if DESC_SPLIT not in description:
        return description.strip(), description.strip()
    prompt, _, human = description.partition(DESC_SPLIT)
    return prompt.strip(), (human.strip() or prompt.strip())

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


# The image model used when `IMAGE_MODEL` isn't set.
#
# CHANGED 2026-08-20, and the reason is resolution. The default was
# `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite), the cheap tier, which
# renders at 1K ONLY — it rejects 2K outright with `400 Image size 2K is not
# supported for this model`. 1K is not enough for the one thing a rider looks
# hardest at: the brand lettering on their own frame. At 1K a Standert came back
# reading "Stanlert"/"Standert" depending on the draw, because the model is
# resolving type at the same scale it is resolving spokes.
#
# The non-lite flash model takes the same call shape and renders 2K (measured,
# ~20 s) and 4K (~22 s). 2K is the sweet spot: legible decals, no meaningful
# latency cost. `gemini-3-pro-image` also does both and is slower and dearer,
# so it is not the default.
DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image"

#: What we ASK the model for. Bigger buys correctly-rendered small type and
#: crisp mechanical detail; what we STORE is a different question — see
#: `STORE_MAX_PX` and `_to_data_url`.
RENDER_SIZE = getattr(settings, "IMAGE_SIZE", "") or "2K"

#: What we KEEP. These images are stored inline (garage_assets.image_url,
#: ride_scenes) and ride in JSON on Today's critical path of a mobile-first app,
#: where base64 adds a third again on top of the file size. A full 2K WebP is
#: ~4x the payload of the 1K one it replaces, for detail no surface displays:
#: the Today hero paints at 252 px and the share card at 1080 px wide.
#: Rendering at 2K and keeping 1536 px is the best of both — the model resolves
#: the lettering properly, and a downscale of a correct render stays sharper
#: than a 1K render of the same thing ever was.
STORE_MAX_PX = 1536


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


# ── the one place this module talks to the image model ──────────────────────

#: The size the model fell back to when it refused the one we asked for. Every
#: image model in this family renders 1K; only the paid tiers render 2K.
FALLBACK_SIZE = "1K"


def _is_size_refusal(err: Exception) -> bool:
    """A 400 that means "not at that resolution", rather than a real fault.

    Matched on the message because the SDK gives no code for it: the API answers
    `400 INVALID_ARGUMENT — Image size 2K is not supported for this model`.
    """
    m = str(err).lower()
    return "image size" in m and "not supported" in m


async def _render(
    contents: list, seed_src: str, size: str, aspect: str = "1:1",
) -> str | None:
    """Ask the image model for one picture. Returns None rather than raising.

    THIS FUNCTION EXISTS BECAUSE OF A 500. `RENDER_SIZE` moved to 2K while the
    deployed `IMAGE_MODEL` was still the lite tier, which renders 1K only — so
    every call raised `ClientError: 400 Image size 2K is not supported`, and
    because nothing caught it, `POST /garage/asset/render` answered 500 and the
    rider's onboarding died on a configuration mismatch.

    The module's contract has always been honest degradation: "with no provider
    or key, every function returns the prompt it WOULD send and
    `image_model_unavailable`, never a fake". That contract was only ever
    enforced against `_gemini_ready()` — configuration — and not against the
    call itself, so a quota exhaustion, a timeout, a safety refusal or a size
    the model does not support all crashed instead of degrading. They are the
    same class of event as a missing key: the picture cannot be made right now.

    TWO BEHAVIOURS, DELIBERATELY DIFFERENT:

      · A SIZE REFUSAL IS RETRIED ONCE, at 1K. `RENDER_SIZE` is a preference and
        the model's capability is a fact; a smaller picture is a far better
        answer than no picture, and it makes the setting safe to raise before
        every deployment's model has caught up.
      · EVERYTHING ELSE DEGRADES. Logged at warning with the model and size, so
        a depleted quota is diagnosable from the logs rather than from a 500.
    """
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or DEFAULT_IMAGE_MODEL

    for attempt_size in (size, FALLBACK_SIZE):
        try:
            resp = client.models.generate_content(
                model=model,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["Image"],
                    seed=_seed(seed_src),
                    image_config=types.ImageConfig(
                        aspect_ratio=aspect, image_size=attempt_size,
                    ),
                ),
            )
        except Exception as err:
            if attempt_size != FALLBACK_SIZE and _is_size_refusal(err):
                log.info(
                    "%s cannot render %s; retrying at %s", model, attempt_size, FALLBACK_SIZE,
                )
                continue
            log.warning(
                "image render failed (model=%s size=%s): %s", model, attempt_size, err,
            )
            return None

        try:
            for part in resp.candidates[0].content.parts:
                data = getattr(part, "inline_data", None)
                if data and data.data:
                    return _to_data_url(data.data)
        except (AttributeError, IndexError, TypeError):
            # A response with no candidates at all — a safety refusal looks like
            # this. Not an error to raise on; there is simply no image.
            log.warning("image model returned no image (model=%s)", model)
        return None

    return None


async def _generate(
    prompt: str, seed_src: str, size: str = "", aspect: str = "1:1",
) -> str | None:
    """Render one image at `size`, defaulting to `RENDER_SIZE`.

    `aspect` is 1:1 for everything the garage shows — collectibles are shot on
    one locked square camera so they read as a set — and only the full-screen
    onboarding art asks for anything else.
    """
    return await _render([prompt], seed_src, size or RENDER_SIZE, aspect)


def _to_data_url(png: bytes) -> str:
    """Pack rendered bytes into a data URL, transcoding PNG → WebP first.

    These images are stored inline (garage_assets.image_url, ride_scenes) and
    ride in JSON on Today's critical path, where base64's 33% inflation lands on
    top of the file size. A 1K render is ~525 KB as PNG (~700 KB base64) and
    ~43 KB as WebP q85 (~57 KB base64) — a 12× cut for output that is displayed
    at 252 px, with no visible loss on flat toy-render shading.

    IT ALSO DOWNSCALES, and that is deliberate rather than lossy by accident.
    We render at `RENDER_SIZE` (2K) because the model needs that much room to
    resolve the lettering on a rider's own frame correctly, and we keep
    `STORE_MAX_PX` because no surface in the app displays more. Downscaling a
    correct 2K render is not the same as rendering 1K: the type stays right.

    Pillow is a hard dependency (requirements.txt), but a missing or broken
    encoder must never cost the rider the bike they just made — we fall back to
    the original PNG rather than failing the render.
    """
    try:
        import io

        from PIL import Image

        img = Image.open(io.BytesIO(png)).convert("RGB")
        if max(img.size) > STORE_MAX_PX:
            img.thumbnail((STORE_MAX_PX, STORE_MAX_PX), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=85, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return "data:image/png;base64," + base64.b64encode(png).decode()


def _isolated_prompt(description: str, kind: str, wear: str = "") -> str:
    """The standalone collectible: a rider bust, or a bike alone.

    `wear` is `rider_wear.clause` — the helmet and glasses this rider has
    equipped. It belongs HERE and not only in a scene, because Today shows the
    bust itself: a rider who buys a helmet must be able to see it on the face
    they look at every morning, not only in a picture of a ride.
    """
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
            f"{DEFAULT_KIT} {wear} "
            # Stated explicitly, because without it the render invents a setting:
            # a blurred living room turned up behind the bust the first time the
            # style asked for a richly modelled world.
            f"BACKGROUND: a clean, plain, softly-lit studio ground in a single muted colour with a "
            f"gentle vignette. NO room, NO furniture, NO scenery, NO props, NO text. "
            f"{GENERAL_STYLE} {CHARACTER_STYLE}"
        )
    return (
        f"An isolated 3D bicycle inspired by this description: [{description}]. "
        f"{BIKE_CAMERA} {BIKE_GROUND} {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
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
#: For GENERATED art, where there is no photograph to copy from.
#:
#: `NO_INVENTED_TEXT` governs the EDIT path and is written around one idea —
#: copy the lettering off the supplied picture. Shipped art has no supplied
#: picture, so that rule has nothing to bite on, and the model filled the gap
#: the way it always does: it put a "W3" wordmark on the onboarding kit and a
#: logo on the jersey of the first character a new rider ever sees. Invented
#: branding on the app's own art is worse than invented branding on a rider's
#: bike, because every single person sees it.
NO_TEXT_AT_ALL = (
    "NO TEXT ANYWHERE IN THIS IMAGE. No brand name, no wordmark, no logo, no number, no slogan, "
    "no lettering of any kind — not on clothing, not on the frame, not on the rims or tyres, not "
    "in the background. Where a real product would carry a logo, render clean unmarked fabric or "
    "plain material instead. This is house art with no brand in it."
)

NO_INVENTED_TEXT = (
    "CRITICAL — THE LETTERING ON THIS BICYCLE IS COPIED, NEVER WRITTEN.\n"
    "The frame in the supplied photograph carries a brand name. That name is the single detail the "
    "rider will check first, because it is the difference between their bicycle and a bicycle. "
    "COPY IT CHARACTER BY CHARACTER from the photograph: the same letters in the same order, the "
    "same shapes, the same spacing, the same size, in the same place on the same tube. Read it off "
    "the picture rather than recalling what bicycle brands are called — a real name that is not "
    "the one in the photograph is the worst outcome of all, and a plausible near-miss "
    "('SALLON' for 'Standert') is exactly how this fails.\n"
    "The same rule governs every other word in frame: rim decals, tyre sidewalls, component "
    "markings. Where text is too small or too blurred to read with confidence, render that decal "
    "as an abstract shape, a colour block or nothing at all — an honest smudge is correct and an "
    "invented word never is. NEVER add a brand, a model name, a slogan or any word that is not "
    "already in the photograph."
)


def pad_to_square(photo_b64: str) -> str:
    """Letterbox a photo to 1:1 on its own edge colour, without cropping.

    WHY THIS EXISTS. Every render is requested at `aspect_ratio="1:1"`, but a
    bike photograph is almost always landscape. Handing a wide image to a square
    render forces the model to RECOMPOSE — and recomposing is exactly when it
    re-frames the subject, which for a bicycle means quietly rotating it a few
    degrees toward the viewer. Four rounds of increasingly blunt camera wording
    moved that angle but never removed it; the aspect mismatch was doing the
    damage upstream of the words.

    Padded on the sampled edge colour rather than white, so a studio-sweep
    photograph gains no visible seam and the model reads one continuous
    background instead of a picture pasted on a card.

    Returns the original string untouched if Pillow is unavailable or the image
    cannot be read — this is an improvement to fidelity, never a dependency.
    """
    try:
        import io

        from PIL import Image
    except Exception:
        return photo_b64

    try:
        raw = photo_b64.split(",", 1)[1] if photo_b64.startswith("data:") else photo_b64
        im = Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")
        w, h = im.size
        if w == h:
            return photo_b64
        side = max(w, h)
        # Sample a corner for the fill: on a product shot that is the sweep.
        bg = im.getpixel((0, 0))
        canvas = Image.new("RGB", (side, side), bg)
        canvas.paste(im, ((side - w) // 2, (side - h) // 2))
        buf = io.BytesIO()
        canvas.save(buf, "WEBP", quality=92, method=6)
        return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return photo_b64



def _cut_out(image: str) -> str:
    """Free the bicycle from its ground, keeping the original if that fails.

    ONLY THE BIKE. The rider bust is drawn as a portrait with its own vignette
    and is never placed on another background, so cutting it out would buy
    nothing and cost the soft edge the portrait is composed with.
    """
    from app.services import cutout

    return cutout.cut_out(image) or image


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
        f"{BIKE_CAMERA} {BIKE_GROUND} "
        f"{GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"
    )
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    # Squared FIRST — see `pad_to_square`. A landscape photo rendered at 1:1
    # makes the model recompose, and recomposing is when the bike rotates.
    img = await edit_image(pad_to_square(photo_b64), prompt, photo_b64)
    # Transparent from here on, so every surface can stand this bike wherever it
    # likes without blending, masking or asking a model to composite.
    if img:
        img = _cut_out(img)
    return img, prompt, "ok" if img else "image_model_unavailable"


#: A shipped picture of the character BUILD the house style wants: a sphere of a
#: head sitting straight into a collar with no neck, broad soft sloped shoulders,
#: simple heavy volume for a body — and a garment rendered at product-photography
#: density against that flawless matte skin.
#:
#: WHY AN IMAGE AND NOT MORE WORDS. The prompt described this build four times
#: across two rounds, in progressively blunter language, and every render came
#: back with near-anatomical limbs: the model has a very strong prior for
#: "cyclist" and prose loses to it. The same lesson the bike learned — anything
#: that must match is handed over as an image, never as a description.
#:
#: REPLACED 2026-08-20. The previous file was a pastel toy cyclist, and it was
#: carrying two things at once: the chunky proportions we wanted, and a soft
#: low-fidelity finish we did not. It set the ceiling — a render can't look more
#: expensive than the picture it is told to match. This is now the W3 character
#: itself, which holds the proportions AND the material contrast the look is
#: actually built on. Its garment is streetwear, so `_BUILD_MANDATE` states
#: explicitly that the fidelity carries over and the jacket does not.
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

#: The WHOLE FIGURE, standing, in the starter kit — the reference a SCENE needs.
#:
#: The gap this fills: every other reference in this module is a bust. The face
#: reference is a face, the build reference is a bust, and the rider's own
#: collectible is a portrait crop (see `_rider_compose_prompt`), so a scene had
#: a picture of the head and prose for everything below it — and prose loses to
#: the model's prior for "cyclist" exactly as it did for the build. Measured
#: across four prompt rounds on 2026-08-20: the bust improved every round while
#: the same wording sent the scene's body back and forth between a chunky toy
#: and a lean adult, because nothing in the scene's inputs showed a body.
#:
#: Generated by the studio itself and then hand-vetted, the same way the other
#: two style assets were. Its hair is a deliberately plain crop: the first draw
#: came back wearing the build reference's distinctive locs, which is precisely
#: the kind of detail a downstream render copies onto a rider who has no such
#: thing. Its face is nobody, and every mandate that uses it says so.
#:
#: IT IS ON A BIKE, and that is the second half of the job. A standing figure
#: only half survives the transfer to a riding position — the proportions came
#: back thinner the moment the body had to fold onto a frame, and the rider read
#: small against their own bicycle. This asset therefore shows the finished
#: figure RIDING, on the same locked drive-side camera the scenes use, so it
#: also carries the SCALE: shoulders wider than the bars, a frame that looks
#: compact beneath its rider.
#:
#: HOW IT WAS MADE, because the obvious route fails. Generating it from prose
#: against `_BUILD_REF` produced a render wearing the reference's streetwear,
#: locs, goggles and graphic face, on a collector's plinth — the mandate saying
#: "carry the fidelity, never the jacket" does not hold when the whole subject
#: is being invented. Editing THIS figure into a new pose does hold: the pose
#: changes and the character cannot, because it is the input.
_BODY_REF = pathlib.Path(__file__).resolve().parents[1] / "data/style/character_body.webp"

#: Used with the reference. The danger of a style image is that the model copies
#: the WRONG things from it, so what to take and what to ignore is spelled out.
_BUILD_MANDATE = (
    "\n\nTHE TWO ATTACHED IMAGES ARE STYLE REFERENCES, not people. IMAGE 1 ALONE DECIDES THE "
    "FACE: copy its eye size relative to the face, its short wide head proportions, how low the "
    "features sit and how warm the expression is — your face should look built by the same hand. "
    "If your eyes are smaller or your face longer than IMAGE 1, you have drifted back toward "
    "realism; match the reference. IMAGE 2's face is flat graphic decal work and is NOT a face — "
    "it has no bearing here, and nothing about the eyes, brows or mouth comes from it.\n"
    "IMAGE 2 SETS THE BODY FROM THE COLLAR DOWN, and two things about it are the target. FIRST, "
    "THE PROPORTIONS: the "
    "size of that head against those shoulders, the head sitting straight into the collar with no "
    "neck showing, the broad softly-sloped shoulders, the whole figure built from simple heavy "
    "volume. SECOND, THE MATERIAL FIDELITY: how clean and matte the skin is, against how densely "
    "real the garment is — visible fabric weave, a moulded zip with legible branding on its tape, "
    "an enamel pin, crisp stitching, all lit like a product photograph. Match that gap between the "
    "smooth figure and the expensive clothing.\n"
    "TAKE ONLY THOSE FROM IMAGE 2. Its garment is streetwear and this rider wears the cycling kit "
    "described above — carry over the fidelity, never the jacket. Take nothing else from either "
    "image: not their faces, skin tones, hair, colours, poses or backgrounds. The references supply "
    "the sculpt and the finish; the description supplies the person. "
    "The head is bare: no helmet, cap or glasses, so the hair stays fully visible."
)


def _style_reference(path: pathlib.Path) -> str | None:
    """One shipped style reference as a data URL, or None when it isn't there.

    Every caller treats a missing reference as "render without it" rather than
    as an error: a deploy that ships neither degrades to the old text-only
    render, which is worse-looking but still an avatar.
    """
    try:
        raw = path.read_bytes()
    except OSError:
        return None
    return "data:image/webp;base64," + base64.b64encode(raw).decode()


def _style_references() -> list[str]:
    """The face and build references, as data URLs, IN ROLE ORDER.

    Order is part of the contract: `_BUILD_MANDATE` calls them "IMAGE 1" and
    "IMAGE 2", so face must come first. Either may be absent — each is optional
    by design, and a deploy that ships neither degrades to the old text-only
    render rather than failing to make an avatar at all.
    """
    out: list[str] = []
    for path in (_FACE_REF, _BUILD_REF):
        ref = _style_reference(path)
        if ref:
            out.append(ref)
    return out


async def _generate_with_refs(prompt: str, refs: list[str], seed_src: str) -> str | None:
    """One render conditioned on several style references at once.

    THE SEED DOES NOT MAKE THIS REPRODUCIBLE, and it is worth knowing before you
    trust a single render as evidence. Measured 2026-08-20: the same description
    through this function twice, same prompt and same seed value, returned two
    different images. The seed fix this module shipped is still the right one —
    it stopped the seed being derived from a vision pass that returns different
    prose every run — but it buys a stable INPUT, not a stable output.

    What actually keeps a rider's avatar stable is that the render is STORED
    (`garage_assets`, `ride_scenes`, `DayScene`) and re-served rather than
    re-rendered. Anything that re-renders hands the rider a slightly different
    figure, so re-render on demand, never on a cache miss you could have avoided.

    The practical consequence when tuning these prompts: one render is one
    sample, and two prompts cannot be compared on one draw each.
    """

    return await _render([_img_part(r) for r in refs] + [prompt], seed_src, RENDER_SIZE)


async def render_isolated(
    description: str, kind: str, *, seed_src: str | None = None, wear: str = "",
) -> tuple[str | None, str, str]:
    """Render the standalone avatar bust or isolated bike from a description.

    The RIDER is conditioned on TWO shipped style references — the face
    treatment and the body sculpt — because prose could not hold either. Both
    were described in careful narrative and both still drifted toward a
    semi-realistic adult; the images hold them. The bike takes no style
    reference: its shape must come from the rider's own photograph, which is
    what `render_bike_from_photo` is for.

    SEED FROM THE PHOTO, NOT THE DESCRIPTION. `seed_src` exists because the
    module's promise — "the same photo always yields the same asset" — was
    false. The seed used to come from the description, and the vision pass
    returns different prose on every run even at temperature 0, so two renders
    of one selfie produced two different faces. Measured: same photo, two runs,
    two descriptions of different lengths and two unrelated images. Callers that
    hold the photo pass it here; the description is only the fallback.
    """
    prompt = _isolated_prompt(description, kind, wear)
    seed = seed_src or description

    if kind == "rider":
        refs = _style_references()
        if refs:
            prompt += _BUILD_MANDATE
            if not _gemini_ready():
                return None, prompt, "image_model_unavailable"
            img = await _generate_with_refs(prompt, refs, seed)
            return img, prompt, "ok" if img else "image_model_unavailable"

    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    img = await _generate(prompt, seed)
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
    # The photo is the stable identity here; the description is not.
    # ONLY THE PROMPT HALF REACHES THE IMAGE MODEL. Handing it the German
    # read-out as well would put two languages in one prompt for no gain.
    prompt_text, _ = split_description(description)
    img, prompt, status = await render_isolated(prompt_text, kind, seed_src=photo_b64)
    if img and kind == "bike":
        img = _cut_out(img)
    return {"name": name, "description": description, "image": img, "prompt": prompt, "status": status}


def _scene_prompt(
    rider_desc: str, bike_desc: str, training_context: str, wear: str = "",
) -> str:
    """The combined full-body hero. `training_context` is the pose + scene —
    for a ride, built from the GPX via `ride_scene.scene_descriptor`.

    `wear` is `rider_wear.clause` — what the rider has equipped on their own
    head. It goes in AFTER the kit and BEFORE the action, so the helmet is part
    of who is in the picture rather than something the action has to remember.
    """
    return (
        f"LOCKED CAMERA ANGLE: A wide-angle, full-body shot of a 3D character and their bicycle. "
        f"CRITICAL INSTRUCTION: The character's face and hair MUST be 100% identical to "
        f"this exact description: [{rider_desc}]. Do not alter their facial features or expression "
        f"from the description. {DEFAULT_KIT} {wear} You MUST strictly adhere to the exact details in this bicycle "
        f"description: [{bike_desc}]. The action/scene is: {training_context}. CRITICAL "
        f"COMPLETENESS: the figure is whole. Both arms, both hands, both legs and both feet MUST be "
        f"fully visible, distinct and flawlessly rendered, each one a heavy simple cylinder of the "
        f"stylised build described above (no missing limbs, no clipping into the bike or ground). "
        # This clause used to open "CRITICAL ANATOMY: the character MUST be
        # rendered with complete, CORRECT HUMAN ANATOMY", and those two words
        # were an all-caps realism absolute living in the one path that drifts
        # realistic — the isolated bust has no equivalent line and holds its toy
        # proportions, while the same description in a scene came back as a lean
        # adult with anatomical legs. What the clause is actually for is limb
        # COUNT and visibility (a pose that fights the framing renders as a
        # clipped, three-limbed mess), and it still says exactly that.
        f"CRITICAL CAMERA FRAMING: The "
        f"camera angle, lens focal length, height, and framing MUST be 100% identical and static "
        f"across all images. The character and bicycle MUST occupy the exact same scale and "
        f"proportions in the center of the frame, regardless of the pose. Use a fixed eye-level "
        f"SIDE-ON PROFILE from the bike's DRIVE SIDE (its right-hand side, chainring and cassette "
        f"facing the camera), with the rider and bike travelling to the RIGHT of frame — the same "
        f"locked camera the isolated bike collectible uses, so a rider's scenes and their garage "
        f"bike read as one set. Do not use a three-quarter or front-on angle. "
        # THE CAMERA STAYS FLAT, and this was tried the other way on 2026-08-20.
        # Turning it to a front three-quarter did put the whole face in view, and
        # cost more than it bought: the flat profile is what shows the entire
        # machine — full frame geometry, both wheels, the drivetrain — and what
        # lets the world around the bike read as a real place rather than as a
        # backdrop behind a portrait. It is also the camera `BIKE_CAMERA` and
        # `ride_framing` both lock, so all three surfaces stay one set.
        #
        # The worn slots do not need the rotation. A helmet is a silhouette and
        # reads BETTER in profile than head-on; glasses read as a lens edge and
        # an arm along the temple. What profile loses is only the second eye.
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
    "more realistic or a more generic figure. Only the POSE and the SURROUNDINGS are new.\n\n"
    "THE POSE IS THE ONE EXCEPTION, AND IT OUTRANKS THE REFERENCES. Both of them show a figure "
    "standing still, and that stillness must not leak into this render. The posture is whatever "
    "the action above describes, taken literally and at full commitment: if it says out of the "
    "saddle with hands in the drops and the torso low and driving, draw exactly that — do not "
    "settle the rider back onto the hoods or sit them upright because the reference figure is. "
    "The references govern WHO and WHAT; the action governs HOW THEY ARE MOVING."
)

#: Appended when the house-style build reference rides along as a THIRD image.
#:
#: WHY IT HAS TO. The rider's own collectible is a PORTRAIT CROP — head and
#: chest — so a scene conditioned on it has a reference for the face and nothing
#: at all for the body, and invents the rest from prose. Measured: the same
#: description that renders a chunky toy bust in the garage comes back in a
#: scene as a lean, near-anatomical adult with thin limbs and a visible neck.
#: That is this module's oldest lesson arriving at a third surface — prose loses
#: to the model's prior for "cyclist", and the fix is always an image.
_BUILD_ROLE = (
    "\n\nTHE THIRD IMAGE IS NOT A PERSON AND IT IS NOT THIS RIDER. It is the house-style BODY "
    "REFERENCE: the same kit, on a bicycle, on this same camera — it exists to show you the build "
    "from the collar down and how that build sits on a bike. COPY ITS PROPORTIONS EXACTLY: the "
    "size of that head against those shoulders, the head sitting straight into the collar with no "
    "neck showing, the softly-sloped shoulders, the short compressed torso, and above all the "
    "THICKNESS of those arms and legs — heavy even cylinders of simple volume, no musculature and "
    "no skeletal landmarks. COPY ITS SCALE TOO, which is the part that goes wrong most often: "
    "this rider is BIG on this bicycle. Their shoulders are wider than the handlebars and the "
    "frame looks compact beneath them. Take its material finish as well — flawless matte skin "
    "against a kit with real woven texture and crisp raised seams.\n"
    "Take nothing else from it. Its face, its hair, its skin tone and its grey studio ground have "
    "no bearing here: the FIRST image is this rider's face and the description is who they are. "
    "The third image is the body they are built on."
)


#: Appended when a shared PLACE PLATE rides along as a background reference.
#:
#: The economics of the whole place system live in this one paragraph. A place
#: is rendered ONCE, globally, with no rider and no bike in it (`places.
#: plate_prompt`), and every rider who owns that place has their own hero
#: composed INTO that same picture. Two riders who both climbed the Stelvio are
#: therefore looking at the same Stelvio, and the app paid for it once.
#:
#: It is handed over LAST, after the rider and the bike, because it is the least
#: important thing in the frame to get exactly right: a plate that shifts a
#: little is a different photograph of the same place, while a face that shifts
#: is a different person.
_PLATE_ROLE = (
    "\n\nTHE LAST IMAGE IS THE PLACE ITSELF — the real location this scene happens in, "
    "photographed without anybody in it. Use it as the actual background: keep its landforms, its "
    "vegetation, its road surface, its light, its weather and its colour, and put the rider and "
    "their bicycle into it as though they had been photographed there. Match the rider's lighting "
    "to that plate — the same key direction, the same warmth, the same time of day — so the figure "
    "belongs in the picture rather than being pasted onto it, and let the plate's own defocused "
    "foreground stay in front of the rider where it already sits.\n"
    "The plate holds no people and no bicycles, so nothing in it competes with them: the rider "
    "and the bike are the only subjects, standing in the clear middle of that place."
)


async def compose_scene(
    rider_desc: str,
    bike_desc: str,
    training_context: str,
    *,
    rider_img: str | None = None,
    bike_img: str | None = None,
    wear: str = "",
    plate_img: str | None = None,
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
    prompt = _scene_prompt(rider_desc, bike_desc, training_context, wear)
    refs = [i for i in (rider_img, bike_img) if i]
    if refs:
        prompt += _REFERENCE_MANDATE
        # The build reference goes LAST so the rider's own two collectibles keep
        # the strongest positions, and only when both of them are present — with
        # one missing, "the FIRST/SECOND/THIRD image" stops describing what was
        # actually handed over and the roles all shift by one.
        if rider_img and bike_img:
            body = _style_reference(_BODY_REF)
            if body:
                refs.append(body)
                prompt += _BUILD_ROLE
            # The place goes last of all — see `_PLATE_ROLE`. Only ever with the
            # full set in front of it, so "the FIRST / SECOND / THIRD / LAST
            # image" keeps describing what was actually handed over.
            if plate_img:
                refs.append(plate_img)
                prompt += _PLATE_ROLE
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    if not refs:
        img = await _generate(prompt, prompt)
        return img, prompt, "ok" if img else "image_model_unavailable"


    # Images FIRST, prompt last — the same order `compose_rider` uses, and the
    # order the model weights references most strongly.
    contents = [_img_part(i) for i in refs] + [prompt]
    img = await _render(contents, prompt, RENDER_SIZE)
    return (img, prompt, "ok") if img else (None, prompt, "image_model_unavailable")


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


async def edit_image(
    base_b64: str, prompt: str, seed_src: str, size: str = "", *, extra_b64: str | None = None,
) -> str | None:
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

    # The base image FIRST and always: it is the thing that must survive the
    # edit unchanged. `extra` is for a second picture the instruction refers to
    # — a place plate the bike is being set into — and it is deliberately not
    # optional-by-default anywhere: an edit with two inputs and a prompt that
    # only names one produces a composite of both, which is how a bike ends up
    # wearing a mountain.
    contents = [_img_part(base_b64)]
    if extra_b64:
        contents.append(_img_part(extra_b64))
    contents.append(prompt)
    return await _render(contents, seed_src, size)


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
    self_b64: str, bike_b64: str, helmet_b64: str, size: str = ""
) -> dict[str, Any]:
    """Compose the final rider from three real photos (self, bike, helmet) in one
    multi-image generation. Returns {image, prompt, status}. Honestly gated.

    `size` DEFAULTED TO A HARDCODED "2K", and that was a live bug rather than a
    preference: the configured model was `gemini-3.1-flash-lite-image`, which
    rejects 2K outright, so every call to this function — the whole
    `/garage/rider/compose` endpoint — died on a 400. It defers to `RENDER_SIZE`
    now, which the default model actually supports.
    """
    size = size or RENDER_SIZE
    prompt = _rider_compose_prompt()
    if not _gemini_ready():
        return {"image": None, "prompt": prompt, "status": "image_model_unavailable"}

    # `_render` transcodes through `_to_data_url` like every other path here —
    # this function used to hand back a raw PNG, which at 2K is ~2.7 MB once
    # base64'd into the JSON response.
    seed_src = self_b64[:64] + bike_b64[:32] + helmet_b64[:32]
    contents = [prompt, _img_part(self_b64), _img_part(bike_b64), _img_part(helmet_b64)]
    img = await _render(contents, seed_src, size)
    return {"image": img, "prompt": prompt, "status": "ok" if img else "image_model_unavailable"}
