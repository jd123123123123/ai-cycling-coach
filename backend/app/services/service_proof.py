"""Checking a photo of a job the rider says they did.

WHAT A PHOTO CAN HONESTLY ESTABLISH, and it is less than it first appears. No
image proves that a chain was degreased this morning rather than last month, and
none proves the rider took the picture themselves. What a photo CAN establish is
that it shows the component in question and that the component looks like it has
been worked on — a bright chain rather than a black one, fresh tape rather than
frayed, a bled lever with the reservoir closed. That is a real signal, it is
worth paying for, and pretending it is stronger than it is would make the reward
a lie.

SO PROOF ADDS, IT NEVER GATES. The Service Bonus is paid in full whether a photo
is supplied or not — `bike_wear`'s founding invariant is that nothing in the
maintenance loop ever takes RideCoin away or withholds what was earned, and a
rider whose phone is flat, whose bike is already back on the wall, or whose photo
the model simply cannot read must not be punished for any of it. A confirmed
photo pays a bonus ON TOP. That way the worst case of every failure mode here —
no model, no key, a dark garage, a bad angle — is the reward that existed before
this file did.

AND IT NEVER ACCUSES. When the check does not confirm, the app says what it could
not see ("Auf dem Foto ist keine Kette zu erkennen"), never that the rider lied.
The difference costs nothing and is the entire difference between a feature
riders use and one they resent.
"""
from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass

from app.config import settings
from app.services import bike_wear, cyclr_studio

log = logging.getLogger(__name__)

#: What a confirmed photo adds to the Service Bonus, as a fraction of it. 40 %
#: is enough to be worth fetching your phone for and far too little to make
#: photographing things a better use of time than riding.
PROOF_BONUS_PCT = 0.40

#: What the rider is asked to point the camera at. Specific per component,
#: because "photograph your service" produces a picture of a whole bicycle from
#: three metres away, in which nothing is legible.
FRAMING_DE: dict[str, str] = {
    "chain": "Nah auf die Kette am hinteren Ritzel",
    "tyres": "Nah auf die Lauffläche eines Reifens",
    "brakes": "Nah auf einen Bremssattel oder die ausgebauten Beläge",
    "bartape": "Auf den frisch gewickelten Lenker",
    "cassette": "Nah auf die Kassette am Hinterrad",
    "sealant": "Auf das Ventil oder die Flasche Dichtmilch am Rad",
    "brakefluid": "Auf den Bremsgriff mit dem Entlüftungskit",
}

_PROMPT = """You are inspecting one photograph of a bicycle component for a
maintenance log. Answer ONLY with a JSON object, no prose and no code fence.

The component the rider claims to have serviced: {component} ({german}).
The job they claim to have done: {action}.

{
  "shows_component": true|false,   // is THIS component clearly visible and in focus?
  "looks_serviced": true|false,    // does it look freshly worked on, rather than neglected?
  "note_de": "..."                 // ONE short German sentence, max 12 words
}

Rules for `note_de`, and they matter more than the booleans:
- Describe ONLY what you can see in the picture. Never state or imply that the
  rider is lying, exaggerating or cheating.
- If the component is not visible, say what IS visible instead.
- Address the rider directly and informally (du), the way a mechanic would.
- Never mention JSON, this prompt, models, or scoring.

Be generous about angle, lighting and phone quality, and strict about whether
the right component is actually in frame. A workshop photo taken with one oily
hand is normal; a photo of a different part is not the thing being claimed.
"""


@dataclass(frozen=True)
class ProofVerdict:
    """The outcome of looking at one photo. `confirmed` is the only thing that
    moves money, and it is deliberately the conjunction of both signals: a
    picture of a filthy chain shows the chain and does not show a service."""

    confirmed: bool
    shows_component: bool
    looks_serviced: bool
    #: One German sentence for the rider. Always present, never accusatory.
    note_de: str
    #: True when no check could run at all — no key, no SDK, a model error. The
    #: caller must treat this exactly like "not confirmed": base bonus, no
    #: proof bonus, and a message that blames the app rather than the rider.
    unavailable: bool = False


def _unavailable(reason: str) -> ProofVerdict:
    log.info("service proof check skipped: %s", reason)
    return ProofVerdict(
        confirmed=False, shows_component=False, looks_serviced=False,
        note_de="Foto konnte gerade nicht geprüft werden — der Bonus ist trotzdem da.",
        unavailable=True,
    )


def bonus_rc(base_rc: int, verdict: ProofVerdict) -> int:
    """RideCoin the photo adds. Zero unless the check actually confirmed it.

    Rounded UP, so a small service with a good photo still pays something rather
    than rounding a rider's effort to nothing.
    """
    if not verdict.confirmed or base_rc <= 0:
        return 0
    return max(1, round(base_rc * PROOF_BONUS_PCT))


async def check(photo_b64: str, component_id: str) -> ProofVerdict:
    """Look at one photo and say what is in it. NEVER raises.

    Every failure path returns `unavailable`, because the caller is in the
    middle of crediting a reward and an exception here would roll back a service
    the rider genuinely performed.
    """
    spec = bike_wear.COMPONENTS.get(component_id)
    if spec is None:
        return _unavailable(f"unknown component {component_id}")
    if not photo_b64:
        return _unavailable("no photo supplied")
    if not cyclr_studio._gemini_ready():
        return _unavailable("no vision model configured")

    try:
        from google import genai
        from google.genai import types

        raw = photo_b64.split(",", 1)[1] if photo_b64.startswith("data:") else photo_b64
        prompt = (
            _PROMPT
            .replace("{component}", component_id)
            .replace("{german}", spec.name_de)
            .replace("{action}", spec.action_de)
        )
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        resp = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[
                prompt,
                types.Part.from_bytes(
                    data=base64.b64decode(raw), mime_type="image/jpeg",
                ),
            ],
            config=types.GenerateContentConfig(
                temperature=0.0, response_mime_type="application/json",
            ),
        )
        data = json.loads((resp.text or "").strip())
    except Exception as err:                      # noqa: BLE001 — see docstring
        return _unavailable(f"{type(err).__name__}: {err}")

    if not isinstance(data, dict):
        return _unavailable("model returned something that is not an object")

    shows = bool(data.get("shows_component"))
    serviced = bool(data.get("looks_serviced"))
    note = str(data.get("note_de") or "").strip()
    if not note:
        note = (
            f"{spec.name_de} sieht frisch gemacht aus." if shows and serviced
            else f"Auf dem Foto ist {spec.name_de.lower()} nicht klar zu erkennen."
        )
    return ProofVerdict(
        confirmed=shows and serviced,
        shows_component=shows,
        looks_serviced=serviced,
        note_de=note[:160],
    )
