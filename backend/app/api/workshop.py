"""Workshop API — the nearest place that can fix the bike, right now.

GET /workshop/nearby. Position comes from the device when the browser granted
geolocation, and falls back to the athlete's last plausible GPS point (the same
resolver the weather nudge uses) so the page is useful even when permission is
denied. Data is OpenStreetMap via Overpass — see services/bike_shops.py for why.

Honest-absence contract, as everywhere else: no position or an Overpass outage
returns ``{"available": false}`` with an empty list rather than a fabricated
"no shops nearby", which would read as "your area has none".
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.athlete_profile import AthleteProfile
from app.models.user import User
from app.services.athlete_time import athlete_tz, set_athlete_tz_from_profile
from app.services.bike_shops import MAX_RADIUS_M, find_workshops
from app.services.rider_location import last_ride_location

router = APIRouter(prefix="/workshop", tags=["workshop"])

ATTRIBUTION = "© OpenStreetMap contributors (ODbL)"


@router.get("/nearby", summary="Bike shops and public repair stations near the athlete")
async def get_nearby_workshops(
    user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lat: Annotated[float | None, Query(ge=-90, le=90)] = None,
    lng: Annotated[float | None, Query(ge=-180, le=180)] = None,
    radius_m: Annotated[int, Query(ge=500, le=MAX_RADIUS_M)] = 15_000,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
) -> dict:
    profile = (
        await db.execute(select(AthleteProfile).where(AthleteProfile.user_id == user.id))
    ).scalar_one_or_none()
    set_athlete_tz_from_profile(profile)
    tz = athlete_tz()

    source = "device"
    if lat is None or lng is None:
        source = "last_ride"
        loc = await last_ride_location(db, user.id, str(tz))
        if loc is None:
            return {
                "available": False,
                "reason": "no_location",
                "origin": None,
                "shops": [],
                "stations": [],
                "attribution": ATTRIBUTION,
            }
        lat, lng = loc

    results = await find_workshops(lat, lng, radius_m, now=datetime.now(tz))
    if not results:
        return {
            "available": False,
            "reason": "none_found",
            "origin": {"lat": round(lat, 4), "lng": round(lng, 4), "source": source},
            "radius_m": radius_m,
            "shops": [],
            "stations": [],
            "attribution": ATTRIBUTION,
        }

    # Two lists, not one: an unattended 24/7 tool stand and a shop that shuts at
    # 18:00 answer different questions, and mixing them by distance alone buries
    # the one that helps on a Sunday evening.
    stations = [r for r in results if r["kind"] == "station"][:limit]
    shops = [r for r in results if r["kind"] != "station"][:limit]
    return {
        "available": True,
        "origin": {"lat": round(lat, 4), "lng": round(lng, 4), "source": source},
        "radius_m": radius_m,
        "shops": shops,
        "stations": stations,
        "open_now_count": sum(1 for r in shops if r["open_now"]),
        "attribution": ATTRIBUTION,
    }
