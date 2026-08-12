"""Turn a rider's bike photo into a W3:Ride-style collectible render.

Two stages, each independently honest about what it needs:

1. ``analyze_bike`` — REAL and available today. Sends the photo to the
   already-configured vision model (``OPENAI_MODEL``, gpt-4o-mini) and gets
   back a precise structured description of *this* bike: type, frame colour,
   accent, wheels, groupset, handlebar, distinctive marks. This is what keeps
   the eventual render 1:1 with the real bike rather than a generic stock bike.

2. ``render_bike`` — REAL code, but needs an IMAGE model. It builds a W3-style
   prompt from the analysis and calls the image API. No image model is
   provisioned in this project yet (Anthropic and gpt-4o-mini are text/vision
   only, neither *emits* images), so when ``IMAGE_MODEL``/key is unset this
   returns ``image_b64=None`` with ``status="image_model_unavailable"`` and the
   prompt it *would* have sent — an honest, inspectable stub, never a fake
   image. Drop in an image model + key and the same call goes live.

The output is a stylised render that preserves the bike's identity closely; it
is not a manipulable 3D mesh and not pixel-exact — a diffusion model
approximates. Callers/UI must not claim "exact 3D model".
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, asdict
from typing import Any

from app.config import settings


@dataclass
class BikeAnalysis:
    bike_type: str          # "road" | "gravel" | "TT" | "mountain" | ...
    frame_color: str        # plain-language, e.g. "matte teal"
    accent_color: str | None
    wheels: str             # "deep-section carbon" | "box-section alloy" | ...
    groupset: str | None    # "Shimano 105" if legible, else null
    handlebar: str          # "drop bars" | "aero bars" | "flat bars"
    distinctive: str        # one short phrase of what makes THIS bike itself
    confidence: float       # 0..1 — how sure the vision model is it's a bike


VISION_SYSTEM = (
    "You identify bicycles from a single photo for a collectible render. "
    "Return ONLY compact JSON matching the schema. Describe what you can SEE; "
    "use null where a detail is not legible. Never invent a brand you cannot read."
)

VISION_SCHEMA_HINT = (
    '{"bike_type":str,"frame_color":str,"accent_color":str|null,"wheels":str,'
    '"groupset":str|null,"handlebar":str,"distinctive":str,"confidence":0..1}'
)


# ── Validated prompts (empirically tuned on gemini-3-pro-image, 2026-08-12;
#    see docs/research/2026-08-w3ride/collectible-avatar-2026-research.md and
#    the me_hero proofs). The winning recipe is: restyle DIRECTLY from the real
#    photo (image-to-image), with an explicit component/feature checklist that
#    forces detail retention, a geometry guardrail, and 2K. ──

# Bike: restyle the real bike photo. The component checklist keeps DT-Swiss /
# Schwalbe / groupset detail; the double-triangle guardrail (from the user's
# own template) keeps the frame physically correct.
_BIKE_PROMPT = (
    "Recreate the EXACT bicycle in the provided photo as a high-detail glossy collectible 3D "
    "render, keeping true-to-life realistic road-bike proportions (accurate double-triangle frame "
    "geometry, NOT chunky, NOT fat tires). Preserve EVERY component visible in the photo faithfully "
    "and at high fidelity: the frame silhouette, tube shapes and exact colours; all frame graphics "
    "and logos; the wheels with their exact rim depth, rim branding and spoke pattern; the tyres and "
    "their wall colour and tread; the full groupset (rear derailleur, cassette sprockets, chainrings, "
    "crank, chain); front and rear disc brake rotors and calipers; the drop handlebars with bar tape, "
    "stem, seatpost and saddle. Render in a premium product-render / designer-collectible style: "
    "smooth high-gloss materials, clean soft studio lighting with a gentle rim light, crisp sharp "
    "detail. Three-quarter side profile matching the photo, the whole bike isolated, centred and "
    "fully in frame, floating just above a soft contact shadow, on a smooth pastel radial-gradient "
    "studio backdrop. It MUST be a standalone object with NO rider, NO hands and NO human figures. "
    "No extra text or watermark. Ultra-detailed, sharp, high resolution."
)

# Avatar: the winning "blend" recipe — W3 reference (style/kit) + selfie
# (identity) + refine-more-than-toy. Kept deliberately SHORT: the photo carries
# identity, over-describing features makes the face generic.
_AVATAR_PROMPT = (
    "IMAGE 1 is the STYLE / CAMERA / KIT reference — copy its W3 vibe: a front-facing "
    "head-and-shoulders bust, straight-on camera, character centred and filling the frame, dark "
    "near-black studio gradient background with soft rim lighting, glossy premium collectible finish, "
    "slightly oversized cute head, and a richly detailed layered neon-green technical hooded jacket "
    "over a hoodie with a striped inner collar, metal zipper pull, drawcords and stitching. Do NOT "
    "copy image 1's face or hair. "
    "IMAGE 2 is the real PERSON — keep his likeness clearly recognisable (his face shape, hair "
    "colour/style, moustache and smile from the photo). "
    "Create a collectible avatar bust of THIS person that blends the toy-collectible vibe with more "
    "refinement: keep the cute glossy proportions, but render his HAIR realistically detailed "
    "(natural strands and flow, not smooth balloon clumps) and the FACE detailed enough that his real "
    "features read clearly (still stylised, not photoreal), and the CLOTHING with high detail. "
    "Front-facing, dark studio gradient, soft rim light, very high detail, sharp. No text, no watermark."
)


def _style_prompt(a: BikeAnalysis) -> str:
    """Legacy freeform bike prompt (OpenAI text-to-image fallback path). The
    validated path is image-to-image via `_BIKE_PROMPT` — see `render_bike`."""
    accent = f", {a.accent_color} accents" if a.accent_color else ""
    groupset = f", {a.groupset} groupset" if a.groupset else ""
    return (
        f"A single {a.bike_type} bicycle, {a.frame_color} frame{accent}, "
        f"{a.wheels} wheels, {a.handlebar}{groupset}. {a.distinctive}. "
        "Rendered as one glossy, toy-like collectible 3D object, accurate "
        "double-triangle frame geometry, soft studio lighting, three-quarter "
        "side view, isolated with no rider, on a pastel radial-gradient "
        "backdrop. No people, no text, no watermark. High-detail, premium."
    )


async def _gemini_image(prompt: str, image_b64s: list[str], size: str = "2K") -> str | None:
    """Shared Gemini image call (image-to-image / compositing) at high res.

    Returns a `data:image/png;base64,...` URI, or None. Callers gate on the
    provider/key BEFORE invoking (this raises if google-genai / key missing).
    """
    from google import genai
    from google.genai import types

    parts: list[Any] = [prompt]
    for b in image_b64s:
        raw = b.split(",", 1)[1] if b.startswith("data:") else b
        parts.append(types.Part.from_bytes(data=base64.b64decode(raw), mime_type="image/png"))
    client = genai.Client(api_key=settings.GEMINI_API_KEY)
    model = getattr(settings, "IMAGE_MODEL", "") or "gemini-3-pro-image"
    resp = client.models.generate_content(
        model=model,
        contents=parts,
        config=types.GenerateContentConfig(
            response_modalities=["Image"],
            image_config=types.ImageConfig(aspect_ratio="1:1", image_size=size),
        ),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return "data:image/png;base64," + base64.b64encode(data.data).decode()
    return None


def _gemini_ready() -> bool:
    return (getattr(settings, "IMAGE_PROVIDER", "") or "").lower() == "gemini" and bool(
        getattr(settings, "GEMINI_API_KEY", None)
    )


async def analyze_bike(photo_b64: str) -> BikeAnalysis:
    """Vision analysis of the real bike. Raises if the vision model is unset."""
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("vision_model_unavailable")
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    data_url = photo_b64 if photo_b64.startswith("data:") else f"data:image/jpeg;base64,{photo_b64}"
    resp = await client.chat.completions.create(
        model=settings.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": f"{VISION_SYSTEM} Schema: {VISION_SCHEMA_HINT}"},
            {"role": "user", "content": [
                {"type": "text", "text": "Identify this bike. JSON only."},
                {"type": "image_url", "image_url": {"url": data_url}},
            ]},
        ],
        response_format={"type": "json_object"},
        max_tokens=400,
    )
    raw = json.loads((resp.choices[0].message.content or "{}"))
    return BikeAnalysis(
        bike_type=str(raw.get("bike_type") or "road"),
        frame_color=str(raw.get("frame_color") or "unpainted"),
        accent_color=raw.get("accent_color") or None,
        wheels=str(raw.get("wheels") or "alloy"),
        groupset=raw.get("groupset") or None,
        handlebar=str(raw.get("handlebar") or "drop bars"),
        distinctive=str(raw.get("distinctive") or "a clean build"),
        confidence=float(raw.get("confidence") or 0.5),
    )


async def render_bike(a: BikeAnalysis) -> tuple[str | None, str, str]:
    """Return (image_b64 | None, prompt, status).

    status: "ok" | "image_model_unavailable". The prompt is always returned so
    the pipeline is inspectable even before an image model is provisioned.
    """
    prompt = _style_prompt(a)
    image_model = getattr(settings, "IMAGE_MODEL", "") or ""
    if not image_model or not settings.OPENAI_API_KEY:
        return None, prompt, "image_model_unavailable"

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    result = await client.images.generate(
        model=image_model,           # e.g. "gpt-image-1"
        prompt=prompt,
        size="1024x1024",
        n=1,
    )
    b64 = result.data[0].b64_json if result.data else None
    return (f"data:image/png;base64,{b64}" if b64 else None), prompt, "ok" if b64 else "image_model_unavailable"


async def render_bike_from_photo(photo_b64: str) -> tuple[str | None, str, str]:
    """The VALIDATED bike render: image-to-image restyle of the real photo on
    Gemini at 2K, with the component checklist + double-triangle guardrail.
    Honest gated fallback when Gemini isn't provisioned."""
    if not _gemini_ready():
        return None, _BIKE_PROMPT, "image_model_unavailable"
    img = await _gemini_image(_BIKE_PROMPT, [photo_b64])
    return img, _BIKE_PROMPT, "ok" if img else "image_model_unavailable"


async def compose_avatar(selfie_b64: str, style_ref_b64: str) -> tuple[str | None, str, str]:
    """Avatar/PFP from the rider's selfie + a W3 style reference (2K, Gemini).
    Honest gated fallback when Gemini isn't provisioned."""
    if not _gemini_ready():
        return None, _AVATAR_PROMPT, "image_model_unavailable"
    img = await _gemini_image(_AVATAR_PROMPT, [style_ref_b64, selfie_b64])
    return img, _AVATAR_PROMPT, "ok" if img else "image_model_unavailable"


async def render_from_photo(photo_b64: str) -> dict[str, Any]:
    """Full bike pipeline: prefer the validated Gemini image-to-image restyle;
    fall back to the OpenAI text-to-image path (analysis + freeform prompt)."""
    if _gemini_ready():
        analysis = await analyze_bike(photo_b64) if settings.OPENAI_API_KEY else None
        image_b64, prompt, status = await render_bike_from_photo(photo_b64)
        return {"analysis": asdict(analysis) if analysis else None, "prompt": prompt,
                "image_b64": image_b64, "status": status}
    analysis = await analyze_bike(photo_b64)
    image_b64, prompt, status = await render_bike(analysis)
    return {"analysis": asdict(analysis), "prompt": prompt, "image_b64": image_b64, "status": status}


# ─────────────────────────────────────────────────────────────────────────
# Living hero — compose a day-mood scene from ONE canonical figure.
#
# Validated empirically 2026-08-12 (gemini-3-pro-image): lock an approved
# "canonical you" render, then generate every mood FROM it, changing ONLY pose
# + background. Kit and bike inherit from the canonical base, so the equipped
# setup can never drift between scenes. The scene descriptor is built from the
# ride's real GPS (see services/ride_scene.py).
# ─────────────────────────────────────────────────────────────────────────

# The lock clause — everything except pose+background stays identical to the
# canonical base image.
_HERO_LOCK = (
    "The provided image is the CANONICAL character and setup. Keep the character and equipment "
    "EXACTLY identical and do not redesign anything: same face and likeness, same cute "
    "toy-collectible proportions (big round head, chunky little body), the exact same helmet, "
    "jersey, shorts and shoes, and the EXACT same bike with its wheels, drop bars and groupset. "
    "Same glossy toy-collectible render style, same SIDE-PROFILE three-quarter camera angle, same "
    "scale and framing, whole rider and bike centred and fully in frame, soft contact shadow. "
    "ONLY the pose and the background change. No text, no watermark."
)

# Day-state → pose clause. Keyed to the app's DayState + intensity. The 'hard'
# pose is the user-approved "variant B" recipe (fun, funny, climbing).
HERO_POSES: dict[str, str] = {
    "rest": "POSE: sitting up relaxed and easy on the bike, calm and content, a soft happy smile — laid-back.",
    "endurance": "POSE: a steady comfortable riding posture, cruising happily, cheerful and loose.",
    "hard": ("POSE: a fun, playful, hard-climbing pose — standing up out of the saddle, dancing on the "
             "pedals, tongue out and eyes wide with comical determined effort, one hand briefly punching "
             "the air in triumph. The bike is tilted with the front wheel higher, angled uphill on the "
             "slope so it clearly reads as climbing. Energetic and funny, cute not tired."),
    "recovery": "POSE: an extra-gentle easy spin, soft and sleepy-relaxed, a mellow contented look.",
    "evening": "POSE: an easy relaxed cruise, calm and satisfied at the end of the day.",
}


async def compose_hero(canonical_png_b64: str, pose_key: str, scene_descriptor: str) -> tuple[str | None, str, str]:
    """Compose one day-mood hero from the canonical figure + a ride scene.

    `canonical_png_b64`: the approved "you + your bike" base render (data URI or
    raw base64 PNG). `pose_key`: a key of HERO_POSES. `scene_descriptor`: from
    services.ride_scene.scene_descriptor(). Returns (image_data_uri|None,
    prompt, status) — honest gated fallback when no Gemini key is set.
    """
    pose = HERO_POSES.get(pose_key, HERO_POSES["rest"])
    prompt = f"{_HERO_LOCK} {pose} {scene_descriptor}"

    provider = (getattr(settings, "IMAGE_PROVIDER", "") or "").lower()
    gem_key = getattr(settings, "GEMINI_API_KEY", None)
    model = getattr(settings, "IMAGE_MODEL", "") or "gemini-3-pro-image"
    if provider != "gemini" or not gem_key:
        return None, prompt, "image_model_unavailable"

    from google import genai
    from google.genai import types

    raw = canonical_png_b64.split(",", 1)[1] if canonical_png_b64.startswith("data:") else canonical_png_b64
    img = types.Part.from_bytes(data=base64.b64decode(raw), mime_type="image/png")
    client = genai.Client(api_key=gem_key)
    resp = client.models.generate_content(
        model=model,
        contents=[prompt, img],
        config=types.GenerateContentConfig(response_modalities=["Image"]),
    )
    for part in resp.candidates[0].content.parts:
        data = getattr(part, "inline_data", None)
        if data and data.data:
            return "data:image/png;base64," + base64.b64encode(data.data).decode(), prompt, "ok"
    return None, prompt, "image_model_unavailable"
