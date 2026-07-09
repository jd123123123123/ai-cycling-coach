"""Compute a head-to-head "duel" from two RaceDebrief objects, and the DB
orchestration that finds the rival and builds both debriefs."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity
from app.schemas.race_debrief import RaceDebrief
from app.schemas.ride_compare import (
    ClimbDuel, PacingDuel, PowerDuel, RiderRef, RideComparison,
)
from app.services.crew_score import _user_context
from app.services.race_debrief import get_or_build_debrief
from app.services.ride_matching import find_rival_ride

# Point weights per battle won.
_CLIMB_PTS, _POWER_PTS, _PACING_PTS = 3, 1, 2

# Marquee climbs and headline power durations to surface (keeps the duel legible).
_MAX_CLIMBS = 6
_KEY_DURATIONS = (5, 15, 60, 300, 1200, 3600)  # 5s, 15s, 1m, 5m, 20m, 60m


def _win(self_val: float, rival_val: float, better: str) -> str:
    if self_val == rival_val:
        return "tie"
    if better == "higher":
        return "self" if self_val > rival_val else "rival"
    return "self" if self_val < rival_val else "rival"


def _climb_winner(ca, cb) -> str:
    """Decide a climb by effort: W/kg first, then avg power, then faster time.

    Riders on the same route share timestamps, so W/kg (and power) is the real
    differentiator; time is only the fallback for rides without power on the climb.
    """
    if ca.w_per_kg is not None and cb.w_per_kg is not None:
        return _win(ca.w_per_kg, cb.w_per_kg, "higher")
    if ca.avg_power is not None and cb.avg_power is not None:
        return _win(ca.avg_power, cb.avg_power, "higher")
    return _win(ca.duration_s, cb.duration_s, "lower")


def _climb_duels(me: RaceDebrief, rival: RaceDebrief) -> list[ClimbDuel]:
    a = sorted(me.climbs, key=lambda c: c.start_s)
    b = sorted(rival.climbs, key=lambda c: c.start_s)
    # Align by route position, then keep only the most significant climbs.
    pairs = list(zip(a, b))
    pairs.sort(key=lambda p: p[0].elev_gain_m, reverse=True)
    pairs = pairs[:_MAX_CLIMBS]
    # Re-order the surfaced climbs back into route order for display.
    pairs.sort(key=lambda p: p[0].start_s)
    out: list[ClimbDuel] = []
    for i, (ca, cb) in enumerate(pairs):
        out.append(ClimbDuel(
            label=f"Climb {i + 1}",
            distance_m=ca.distance_m, elev_gain_m=ca.elev_gain_m,
            self_time_s=ca.duration_s, rival_time_s=cb.duration_s,
            self_vam=ca.vam_m_per_h, rival_vam=cb.vam_m_per_h,
            self_wkg=ca.w_per_kg, rival_wkg=cb.w_per_kg,
            winner=_climb_winner(ca, cb),
        ))
    return out


def _power_duels(me: RaceDebrief, rival: RaceDebrief) -> list[PowerDuel]:
    rival_by_dur = {e.duration_s: e.ride_watts for e in rival.efforts}
    self_by_dur = {e.duration_s: e.ride_watts for e in me.efforts}
    out: list[PowerDuel] = []
    for dur in _KEY_DURATIONS:
        sw, rw = self_by_dur.get(dur), rival_by_dur.get(dur)
        if sw is None or rw is None:
            continue
        out.append(PowerDuel(
            duration_s=dur, self_watts=sw, rival_watts=rw,
            winner=_win(sw, rw, "higher"),
        ))
    return out


def _pacing_duels(me: RaceDebrief, rival: RaceDebrief) -> list[PacingDuel]:
    out: list[PacingDuel] = []
    if me.pacing and rival.pacing:
        out.append(PacingDuel(metric="np", self_value=me.header.np_watts,
            rival_value=rival.header.np_watts, better="higher",
            winner=_win(me.header.np_watts, rival.header.np_watts, "higher")))
        out.append(PacingDuel(metric="split", self_value=abs(me.pacing.split_pct),
            rival_value=abs(rival.pacing.split_pct), better="lower",
            winner=_win(abs(me.pacing.split_pct), abs(rival.pacing.split_pct), "lower")))
    if me.matchbook and rival.matchbook:
        # Lower remaining W'bal = dug deeper.
        out.append(PacingDuel(metric="wprime_depth", self_value=me.matchbook.min_bal_j,
            rival_value=rival.matchbook.min_bal_j, better="lower",
            winner=_win(me.matchbook.min_bal_j, rival.matchbook.min_bal_j, "lower")))
    return out


def build_duel(me_name: str, rival_name: str, me: RaceDebrief, rival: RaceDebrief,
               lang: str = "en") -> RideComparison:
    climbs = _climb_duels(me, rival)
    powers = _power_duels(me, rival)
    pacing = _pacing_duels(me, rival)

    def _tally(pts: int, items) -> tuple[int, int]:
        s = sum(pts for x in items if x.winner == "self")
        r = sum(pts for x in items if x.winner == "rival")
        return s, r
    cs, cr = _tally(_CLIMB_PTS, climbs)
    ps, pr = _tally(_POWER_PTS, powers)
    pas, par = _tally(_PACING_PTS, pacing)
    self_pts, rival_pts = cs + ps + pas, cr + pr + par
    overall = "tie" if self_pts == rival_pts else ("self" if self_pts > rival_pts else "rival")

    if overall == "tie":
        headline = "Dead heat." if lang == "en" else "Kopf-an-Kopf."
    else:
        winner_name = me_name if overall == "self" else rival_name
        headline = (f"{winner_name} won the day." if lang == "en"
                    else f"{winner_name} gewinnt den Tag.")

    return RideComparison(
        activity_id=me.activity_id,
        me=RiderRef(user_id=0, display_name=me_name, is_self=True),
        rival=RiderRef(user_id=0, display_name=rival_name, is_self=False),
        overall_winner=overall, self_points=self_pts, rival_points=rival_pts,
        headline=headline, climb_duels=climbs, power_duels=powers,
        pacing_duels=pacing, lang=lang,
    )


def _display_name(user, profile) -> str:
    if profile is not None and getattr(profile, "display_name", None):
        return profile.display_name
    if user is not None and user.email:
        # "jannis.deters@icloud.com" -> "Jannis"
        return user.email.split("@")[0].split(".")[0].capitalize()
    return "Rider"


async def build_comparison(db: AsyncSession, user_id: int, activity_id: int,
                           lang: str = "en") -> RideComparison | None:
    activity = (await db.execute(
        select(Activity).where(Activity.id == activity_id))).scalars().first()
    if activity is None:
        return None
    match = await find_rival_ride(db, user_id, activity)
    if match is None:
        return None
    me = await get_or_build_debrief(db, user_id, activity_id, lang)
    rival = await get_or_build_debrief(db, match.rival_user_id, match.rival_activity_id, lang)
    if me is None or rival is None:
        return None
    me_user, me_profile = await _user_context(db, user_id)
    rv_user, rv_profile = await _user_context(db, match.rival_user_id)
    duel = build_duel(_display_name(me_user, me_profile),
                      _display_name(rv_user, rv_profile), me, rival, lang)
    duel.me.user_id = user_id
    duel.rival.user_id = match.rival_user_id
    return duel
