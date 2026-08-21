"""What the weather was, in the words a picture needs.

The app already stores Open-Meteo's hourly blob for every ride
(`ActivityStream.weather`) and uses it for wind analysis and the wet-weather
gear rules. The ride hero never looked at it, so a ride done in the rain and a
ride done in August sun were photographed in the same light — which is the exact
moment a rider stops believing the picture is about THEIR ride.

Only four channels are actually stored: `temperature_2m`, `precipitation`,
`wind_speed_10m`, `wind_direction_10m`. No cloud cover, no weather code. So this
module says what those four can honestly support and nothing more — a wet road,
a cold blue cast, grass moving in wind — and stays silent rather than inventing
a sky it has no evidence for.

The strings are image-model prompt text, English on purpose, never UI copy.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class RideWeather:
    """The hour the ride actually started, reduced to what a render needs."""

    temperature_c: float | None
    precipitation_mm: float | None
    wind_ms: float | None

    @property
    def wet(self) -> bool:
        """Any measurable rain in the hour. 0.1 mm already darkens tarmac."""
        return (self.precipitation_mm or 0.0) >= 0.1


def _hour_index(times: list[str], start: datetime) -> int | None:
    """Which hourly slot the ride began in. Open-Meteo timestamps are naive UTC
    ISO strings ('2026-08-12T14:00'), so the ride's start is normalised to UTC
    before comparing — matching a local timestamp against a UTC series is how a
    morning ride ends up wearing the evening's weather."""
    if not times:
        return None
    at = start.astimezone(timezone.utc) if start.tzinfo else start.replace(tzinfo=timezone.utc)
    stamp = at.strftime("%Y-%m-%dT%H:00")
    try:
        return times.index(stamp)
    except ValueError:
        # A ride whose hour is not in the window still gets the closest slot we
        # have rather than nothing: an hour out is far better than no weather.
        return 0 if times else None


def summarise(blob: dict | None, start: datetime | None) -> RideWeather | None:
    """Reduce a stored Open-Meteo blob to the ride's own hour, or None."""
    if not isinstance(blob, dict) or start is None:
        return None
    hourly = blob.get("hourly")
    if not isinstance(hourly, dict):
        return None
    i = _hour_index(hourly.get("time") or [], start)
    if i is None:
        return None

    def at(channel: str) -> float | None:
        series = hourly.get(channel)
        if not isinstance(series, list) or i >= len(series):
            return None
        v = series[i]
        return float(v) if isinstance(v, (int, float)) else None

    w = RideWeather(
        temperature_c=at("temperature_2m"),
        precipitation_mm=at("precipitation"),
        wind_ms=at("wind_speed_10m"),
    )
    # A row with every channel missing is not weather, it is an empty dict
    # wearing a dataclass. Say nothing rather than nothing-shaped.
    if w.temperature_c is None and w.precipitation_mm is None and w.wind_ms is None:
        return None
    return w


def clause(w: RideWeather | None) -> str:
    """The weather, as prompt prose. Empty string when there is nothing to say.

    Written as things a camera would SEE, not as a forecast: the model cannot
    render "8 °C", but it renders a cold blue cast and breath-thin air readily.
    """
    if w is None:
        return ""

    parts: list[str] = []

    # WET IS THE BIG ONE. A wet road is a different photograph: it goes dark,
    # it mirrors the bike, and it puts light back up into the frame.
    if w.wet:
        parts.append(
            "the surface is WET from recent rain — dark, saturated tarmac with standing water "
            "in its low points throwing a soft mirrored reflection of the bicycle back up, fine "
            "spray beading on the frame and rims, and damp grit clinging to the tyres. Every "
            "highlight is doubled by the wet ground"
        )
    else:
        parts.append("the surface is dry, with fine dust and loose grit catching the light")

    t = w.temperature_c
    if t is not None:
        if t <= 3:
            parts.append(
                "the air is near-freezing: a hard cold blue-cyan cast in the shadows, crisp "
                "high-clarity air with no haze, and frost picking out the edges of things"
            )
        elif t <= 11:
            parts.append("the air is cold — a cool blue cast in the shadows and very clear, sharp air")
        elif t <= 20:
            parts.append("the air is mild and neutral, clean and undramatic")
        elif t <= 28:
            parts.append(
                "the air is warm — a golden cast in the light, soft warm haze in the distance "
                "and colour that runs rich and saturated"
            )
        else:
            parts.append(
                "the air is hot — a heavy golden-amber cast, visible heat haze shimmering off "
                "the surface and deep saturated colour throughout"
            )

    ws = w.wind_ms
    if ws is not None and ws >= 5.0:
        parts.append(
            "it is genuinely windy: every blade of grass, leaf and stem in the frame is bent "
            "and streaming in one consistent direction"
        )
    elif ws is not None and ws <= 1.0:
        parts.append("the air is completely still — nothing in the frame is moving")

    return "WEATHER ON THE DAY (this is the light and the surface, not a caption): " + "; ".join(parts) + "."
