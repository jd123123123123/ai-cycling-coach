"""Where a ride actually happened, from its own GPS.

`ride_scene.py` has always been able to say WHAT a ride was — mountain, hilly,
flat, coastal, from elevation per km — but never WHERE, because naming a place
without a reverse-geocoder would be fabrication and this codebase does not
fabricate. So the ride hero has been a generic mountain rather than the Dolomites.

`cycl_r-studio-3` solves this by handing the coordinates to a text model and
asking it to name the location. That works, and this module borrows it — but
with the honesty guard the reference does not have, because the reference asks
one call to BOTH identify the place AND write scenic prose about it, at a
non-zero temperature. That blends a factual lookup with creative writing, and a
model that cannot identify a place will happily invent one rather than break
the flow of a paragraph it was asked to produce.

SO THIS SPLITS THE TWO:

  · Identification only, temperature 0, with an explicit UNKNOWN escape. The
    model returns a place name or the literal token, nothing else. That makes
    "I don't know" a first-class answer instead of something we hope for.
  · The scenery is NOT written here. It comes from `ride_framing`'s art-directed
    catalogue, which was tuned against real renders. The place only ever
    seasons a framing; it never replaces one.

The result is a stylised interpretation of a real region — exactly the scope
`ride_scene`'s header already claims — and the app still never states a place
it could not resolve.
"""
from __future__ import annotations

import logging
import re

from app.config import settings

log = logging.getLogger(__name__)

#: The model's own "I cannot identify this" answer. Checked case-insensitively
#: and as a whole word, so a real place called e.g. "Unknown Pass" is not eaten.
UNKNOWN = "UNKNOWN"

#: Longest plausible place name. Anything longer is the model narrating rather
#: than naming, and narration is what this module exists to prevent.
MAX_PLACE_CHARS = 60

_PROMPT = (
    "You are a geographer. These coordinates are the START of a real cycling ride.\n"
    "Latitude: {lat}\nLongitude: {lng}\n\n"
    "Name the region a cyclist would call this — a mountain range, a massif, a named "
    "climb, a national park, a coastline, or failing all of those the nearest city or "
    "province. Examples of the register: 'the Dolomites', 'Mont Ventoux', 'the Black "
    "Forest', 'the Yorkshire Dales', 'coastal Mallorca', 'Munich'.\n\n"
    "RULES:\n"
    "- Answer with the place name ALONE. No sentence, no punctuation, no explanation.\n"
    f"- If you cannot identify the location with confidence, answer exactly {UNKNOWN}.\n"
    f"- Guessing is worse than {UNKNOWN}. A wrong region is shown to the rider who "
    "actually rode there, and they will know."
)


def _clean(raw: str | None) -> str | None:
    """The model's answer, or None if it is not a usable place name.

    Models decorate even under a one-word instruction — quotes, bold, a trailing
    full stop, an occasional "The location is ...". Anything that survives
    stripping and is still a single short phrase is taken as the name; anything
    longer is treated as narration and dropped.
    """
    if not raw:
        return None
    text = raw.strip().splitlines()[0].strip()
    # Peel decoration until it stops changing. A single pass is not enough: on
    # `**"the Dolomites"**.` the trailing full stop blocks the quote/asterisk
    # strip, and stripping the stop afterwards leaves `the Dolomites"**` — a
    # place name with markdown still welded to it, which is what then reaches
    # the image prompt.
    trim = "*_\"'“”‘’ .,;:!"
    while True:
        stripped = text.strip(trim)
        if stripped == text:
            break
        text = stripped
    if not text:
        return None
    if re.fullmatch(UNKNOWN, text, flags=re.IGNORECASE):
        return None
    if len(text) > MAX_PLACE_CHARS:
        return None
    # A comma is fine ("coastal Mallorca, Spain"); a full sentence is not.
    if text.count(" ") > 7:
        return None
    return text


def _valid_coords(lat: float | None, lng: float | None) -> bool:
    """Real, in-range, and not Null Island — a 0,0 fix is a GPS dropout, not a
    ride start, and asking the model about it returns the Gulf of Guinea."""
    if lat is None or lng is None:
        return False
    if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
        return False
    return not (abs(lat) < 0.01 and abs(lng) < 0.01)


def _ready() -> bool:
    """Same three-part check `cyclr_studio._gemini_ready` makes, and for the same
    reason: the SDK was once declared nowhere and every call 500'd in prod."""
    import importlib.util

    if (getattr(settings, "IMAGE_PROVIDER", "") or "").lower() != "gemini":
        return False
    if not getattr(settings, "GEMINI_API_KEY", None):
        return False
    return importlib.util.find_spec("google.genai") is not None


async def resolve(lat: float | None, lng: float | None) -> str | None:
    """The region these coordinates sit in, or None.

    None is a perfectly good answer and every caller must handle it: no GPS, no
    model, a refusal, or narration instead of a name all land here. The scene
    then describes the terrain alone, exactly as it did before this module
    existed — never a place the app could not resolve.
    """
    if not _valid_coords(lat, lng):
        return None
    if not _ready():
        return None

    from google import genai
    from google.genai import types

    try:
        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        resp = client.models.generate_content(
            model="gemini-flash-latest",
            contents=[_PROMPT.format(lat=f"{lat:.5f}", lng=f"{lng:.5f}")],
            config=types.GenerateContentConfig(temperature=0.0),
        )
    except Exception:
        # A scene that renders without its place name is a small loss; a ride
        # page that 500s because a geography lookup failed is a large one.
        log.warning("place lookup failed for %.5f,%.5f", lat, lng, exc_info=True)
        return None

    return _clean(getattr(resp, "text", None))


def place_clause(place: str | None) -> str:
    """The place, as a prompt fragment, or an empty string.

    Deliberately a SEASONING and not a scene: the framing already fixes the
    foreground, ground, backdrop and light, all tuned against real renders. The
    place shifts the vegetation, rock and architecture toward the real region
    without being allowed to redecorate the shot.
    """
    if not place:
        return ""
    return (
        f"REGION: this is {place}. Let the vegetation, rock, soil and any built detail read as "
        f"{place} specifically, rather than as a generic version of the setting. Keep the "
        "framing, camera, light and colour discipline exactly as described above — the region "
        "informs WHAT is in the scene, never how it is shot. Do not add signage, place names, "
        "text or landmarks-as-labels."
    )
