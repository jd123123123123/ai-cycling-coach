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


def _style_prompt(a: BikeAnalysis) -> str:
    """The W3:Ride collectible aesthetic, parameterised by the real bike.

    Target (from the w3:browser marketplace renders): a single bike, glossy
    toy-like 3D, three-quarter side view, centred on a soft pastel radial-
    gradient backdrop with a gentle contact shadow on the floor — a premium
    designer-collectible product render, no rider and no text.
    """
    accent = f", {a.accent_color} accents" if a.accent_color else ""
    groupset = f", {a.groupset} groupset" if a.groupset else ""
    return (
        f"A single {a.bike_type} bicycle, {a.frame_color} frame{accent}, "
        f"{a.wheels} wheels, {a.handlebar}{groupset}. {a.distinctive}. "
        "Rendered as one glossy, toy-like collectible 3D object in a clean "
        "Blender / Octane product-render style: smooth high-gloss materials, "
        "soft studio lighting with a gentle rim light, slightly oversized "
        "playful proportions like a designer vinyl figure. Three-quarter side "
        "view, whole bike centred and fully in frame, floating just above a "
        "subtle soft contact shadow. Background is a smooth pastel radial "
        "gradient, dreamy and minimal. No rider, no people, no text, no logos, "
        "no watermark. Crisp, high-detail, premium collectible look."
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


async def render_from_photo(photo_b64: str) -> dict[str, Any]:
    """Full pipeline: analyse the real bike, then render it W3-style."""
    analysis = await analyze_bike(photo_b64)
    image_b64, prompt, status = await render_bike(analysis)
    return {"analysis": asdict(analysis), "prompt": prompt, "image_b64": image_b64, "status": status}
