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
import json
from typing import Any

from app.config import settings

# ── Style constants (verbatim from the cycl_r-studio reference) ──
GENERAL_STYLE = (
    "Playful, cool, highly attractive, and extremely likable 3D designer vinyl toy aesthetic "
    "(similar to premium kawaii Web3 avatars). It must look stylish, awesome, and aesthetically "
    "pleasing. Bold vibrant colors, clean soft studio lighting, minimalist soft solid color "
    "background, chunky toy proportions, high-quality octane render."
)
CHARACTER_STYLE = (
    "The character must be an incredibly cool, charming, and stylish 3D vinyl toy figure (think "
    "beloved protagonist). CRITICAL: The character's hair MUST be an exact 1:1 match to the "
    "described person (exact cut, color, volume, and style), sculpted with bold 3D toy geometry "
    "but matching the real hairstyle perfectly. The face MUST be highly flattering, cute, and "
    "deeply likable (an idealized, highly appealing sweet 3D feature set) with accurate skin tone "
    "and eyebrows. CRITICAL: The clothing MUST be hyper-realistic, highly detailed (intricate "
    "folds, seams, zippers, and realistic fabric materials like glossy nylon, knit, or denim) to "
    "create a striking textural contrast with the smooth 3D toy face."
)
BIKE_STYLE = (
    "The bicycle must maintain perfect, realistic mechanical geometry (accurate triangular frame) "
    "but with slightly chunky, premium proportions to match the cool 3D toy character seamlessly."
)
ISOLATED_BIKE_STYLE = (
    "The bicycle MUST be an isolated, standalone object with NO rider, NO hands, and NO human "
    "figures present in the image. It must maintain perfect, realistic mechanical geometry "
    "(accurate triangular frame) but with slightly chunky, premium proportions to match the 3D "
    "toy aesthetic."
)

_ANALYSIS = {
    "rider": (
        "You are an expert prompt engineer. Analyze this image to extract the person's distinct "
        "physical features. CRITICAL: You MUST provide a 1:1 EXACT, highly detailed description of "
        "their hair (exact style, length, texture, color, hairline, volume). Describe their "
        "eyebrows, eye shape, skin tone, clothing, and accessories so they can be sculpted into an "
        "incredibly cool, highly attractive, charming, and stylish 3D vinyl toy character. "
        "Translate their vibe into something extremely flattering and awesome (like a beloved "
        "stylish protagonist). The hair description must be perfectly accurate to guarantee a 1:1 match."
    ),
    "bike": (
        "You are an expert prompt engineer and cycling aficionado. Analyze this bicycle and extract "
        "a highly structured, dense description for a highly accurate 3D model. Detail the: 1. Frame "
        "(exact geometry, tube shapes, primary/secondary colors). 2. Cockpit (handlebar type, "
        "tape/grip color). 3. Wheels (rim depth, rim color, tire wall color). 4. Components (saddle "
        "color, pedals). Be extremely literal. The description must ensure the generated bike "
        "maintains physically accurate double-triangle geometry and matching colors."
    ),
}


def _seed(s: str) -> int:
    """Deterministic 32-bit seed from a string (mirrors the reference's
    hashString) — same photo/prompt → same asset, so results are reproducible
    and cacheable."""
    h = 0
    for ch in s:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
    return h & 0x7FFFFFFF


def _gemini_ready() -> bool:
    return (getattr(settings, "IMAGE_PROVIDER", "") or "").lower() == "gemini" and bool(
        getattr(settings, "GEMINI_API_KEY", None)
    )


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


async def _generate(prompt: str, seed_src: str, size: str = "2K") -> str | None:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or "gemini-3-pro-image"
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
            return "data:image/png;base64," + base64.b64encode(data.data).decode()
    return None


def _isolated_prompt(description: str, kind: str) -> str:
    if kind == "rider":
        return (
            f"A strict front-facing portrait (head and shoulders ONLY) of a 3D character heavily "
            f"inspired by this description: [{description}]. CAMERA FRAMING: The character MUST be "
            f"shot from a direct frontal angle (0-degree profile). They must be looking dead "
            f"straight into the lens, perfectly centered. Do NOT show a side profile. Do NOT show "
            f"the full body or legs. Focus on translating the distinct features, expression, skin "
            f"tone, and clothing to the figure while maintaining the toy aesthetic. "
            f"{GENERAL_STYLE} {CHARACTER_STYLE}"
        )
    return f"An isolated 3D bicycle inspired by this description: [{description}]. {GENERAL_STYLE} {ISOLATED_BIKE_STYLE}"


async def render_isolated(description: str, kind: str) -> tuple[str | None, str, str]:
    """Render the standalone avatar bust or isolated bike from a description."""
    prompt = _isolated_prompt(description, kind)
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    img = await _generate(prompt, description)
    return img, prompt, "ok" if img else "image_model_unavailable"


async def render_from_photo(photo_b64: str, kind: str) -> dict[str, Any]:
    """Full asset pipeline: analyse the photo, then render the isolated asset.
    `kind` ∈ {'rider','bike'}."""
    description = await analyze_asset(photo_b64, kind)
    if description is None:
        return {"description": None, "image": None, "prompt": _isolated_prompt("", kind), "status": "image_model_unavailable"}
    img, prompt, status = await render_isolated(description, kind)
    return {"description": description, "image": img, "prompt": prompt, "status": status}


def _scene_prompt(rider_desc: str, bike_desc: str, training_context: str) -> str:
    """The combined full-body hero. `training_context` is the pose + scene —
    for a ride, built from the GPX via `ride_scene.scene_descriptor`."""
    return (
        f"LOCKED CAMERA ANGLE: A wide-angle, full-body shot of a 3D character and their bicycle. "
        f"CRITICAL INSTRUCTION: The character's face, hair, and clothing MUST be 100% identical to "
        f"this exact description: [{rider_desc}]. Do not alter their facial features or expression "
        f"from the description. You MUST strictly adhere to the exact details in this bicycle "
        f"description: [{bike_desc}]. The action/scene is: {training_context}. CRITICAL ANATOMY: "
        f"The character MUST be rendered with complete, correct human anatomy. Both arms, both "
        f"hands, both legs, and both feet MUST be fully visible, distinct, and flawlessly rendered "
        f"(no missing limbs, no clipping into the bike or ground). CRITICAL CAMERA FRAMING: The "
        f"camera angle, lens focal length, height, and framing MUST be 100% identical and static "
        f"across all images. The character and bicycle MUST occupy the exact same scale and "
        f"proportions in the center of the frame, regardless of the pose. Use a fixed eye-level, "
        f"straight-on medium-wide shot. Do not crop or zoom in; both wheels, the rider's head, and "
        f"BOTH FEET must be 100% visible with consistent padding around the edges. "
        f"{GENERAL_STYLE} {CHARACTER_STYLE} {BIKE_STYLE}"
    )


async def compose_scene(rider_desc: str, bike_desc: str, training_context: str) -> tuple[str | None, str, str]:
    """The rider-on-bike hero for a given training context / GPX scene."""
    prompt = _scene_prompt(rider_desc, bike_desc, training_context)
    if not _gemini_ready():
        return None, prompt, "image_model_unavailable"
    img = await _generate(prompt, prompt)
    return img, prompt, "ok" if img else "image_model_unavailable"
