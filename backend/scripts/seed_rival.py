"""Seed a crew-mate rival with a ride overlapping a reference activity, so the
compare/duel view renders. Idempotent by rival external_id marker. Usage:
    python -m scripts.seed_rival --ref-activity 71
"""
from __future__ import annotations

import argparse
import asyncio
import copy

from sqlalchemy import select

from app.database import async_session_maker
from app.models import (
    Activity, ActivityStream, AthleteProfile, Crew, CrewMembership, User,
)
from app.services.auth_service import hash_password
from app.services.power_curve import mmp_curve

RIVAL_EMAIL = "luca@maratona.cc"


def _smoothed_grade(alt: list, dist: list, i: int, win: int = 20) -> float:
    """Grade (rise/run) over a ~win-sample window ending at i. Falls back to a
    pure altitude slope when distance is unavailable."""
    j = max(0, i - win)
    if alt[i] is None or alt[j] is None:
        return 0.0
    rise = alt[i] - alt[j]
    if dist and i < len(dist) and dist[i] is not None and dist[j] is not None:
        run = dist[i] - dist[j]
        return rise / run if run > 1e-6 else 0.0
    return rise / max(1, i - j) / 5.0  # crude m/s-ish slope proxy


def _perturb(streams: dict) -> dict:
    """Shape the rival into a believable, competitive alter-ego so the duel is a
    real back-and-forth rather than a sweep.

    - Climbs are numbered as contiguous sustained-gradient (>2%) sections. On
      ODD climbs the rival attacks (+13%); on EVEN climbs they sit up (-10%) and
      you take it. So the climb battle splits roughly down the middle.
    - On the flats/descents the rival eases slightly (-4%), leaving the sprints
      to you (the short-power curve is further trimmed in main()).
    """
    out = copy.deepcopy(streams)
    power = out.get("power") or []
    alt = out.get("altitude") or []
    dist = out.get("distance") or []
    new_power = []
    climb_idx = 0
    on_climb = False
    for i, p in enumerate(power):
        if p is None or not alt or i >= len(alt):
            new_power.append(p)
            continue
        climbing = _smoothed_grade(alt, dist, i) > 0.02
        if climbing and not on_climb:
            climb_idx += 1          # entered a new climb section
        on_climb = climbing
        if climbing:
            factor = 1.13 if climb_idx % 2 == 1 else 0.90
        else:
            factor = 0.96
        new_power.append(round(p * factor, 1))
    out["power"] = new_power
    return out


def _trim_short_power(curve: dict[int, float], factor: float = 0.83) -> dict[int, float]:
    """Give the sprints back to you: dampen the rival's short-duration peaks so
    the puncheur battles (<= 60s) go your way even though the rival climbs harder."""
    return {d: (v * factor if d <= 60 else v) for d, v in curve.items()}


async def main(ref_activity_id: int) -> None:
    async with async_session_maker() as db:
        ref = (await db.execute(
            select(Activity).where(Activity.id == ref_activity_id))).scalars().first()
        if ref is None:
            raise SystemExit(f"reference activity {ref_activity_id} not found")
        crew = (await db.execute(
            select(Crew).where(Crew.owner_user_id == ref.user_id))).scalar_one_or_none()
        if crew is None:
            raise SystemExit("owner has no crew; create one first")

        rival = (await db.execute(
            select(User).where(User.email == RIVAL_EMAIL))).scalar_one_or_none()
        if rival is None:
            rival = User(email=RIVAL_EMAIL, hashed_password=hash_password("Rival123!"),
                         is_active=True)
            db.add(rival)
            await db.flush()

        owner_profile = (await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == ref.user_id))).scalar_one_or_none()
        rprofile = (await db.execute(
            select(AthleteProfile).where(AthleteProfile.user_id == rival.id))).scalar_one_or_none()
        if rprofile is None:
            rprofile = AthleteProfile(user_id=rival.id)
            if owner_profile is not None:
                rprofile.weight_kg = owner_profile.weight_kg
                rprofile.ftp_watts = owner_profile.ftp_watts
            db.add(rprofile)

        member = (await db.execute(select(CrewMembership).where(
            CrewMembership.user_id == rival.id))).scalar_one_or_none()
        if member is None:
            db.add(CrewMembership(crew_id=crew.id, user_id=rival.id, role="member"))

        marker = f"rival-of-{ref_activity_id}"
        existing = (await db.execute(select(Activity).where(
            Activity.user_id == rival.id, Activity.external_id == marker))).scalar_one_or_none()
        if existing is not None:
            old_stream = await db.get(ActivityStream, existing.id)
            if old_stream is not None:
                await db.delete(old_stream)
            await db.delete(existing)
            await db.flush()
            print(f"replaced existing rival activity {existing.id}")

        new_act = Activity(
            user_id=rival.id, started_at=ref.started_at, sport=ref.sport,
            duration_seconds=ref.duration_seconds, distance_meters=ref.distance_meters,
            title=f"Luca · {ref.title}", source="synthetic", external_id=marker,
        )
        db.add(new_act)
        await db.flush()

        ref_stream = await db.get(ActivityStream, ref.id)
        if ref_stream is not None:
            perturbed = _perturb(ref_stream.streams or {})
            power = [p for p in (perturbed.get("power") or []) if p is not None]
            db.add(ActivityStream(
                activity_id=new_act.id, user_id=rival.id,
                streams=perturbed,
                mmp_curve=_trim_short_power(mmp_curve(power)) if power else None,
                cp_watts=ref_stream.cp_watts,
                w_prime_j=ref_stream.w_prime_j,
                has_gps=ref_stream.has_gps,
            ))
        print(f"seeded rival activity {new_act.id} for user {rival.id}")
        await db.commit()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref-activity", type=int, default=71)
    args = ap.parse_args()
    asyncio.run(main(args.ref_activity))
