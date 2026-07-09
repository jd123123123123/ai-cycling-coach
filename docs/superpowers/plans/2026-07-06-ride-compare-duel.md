# Ride Compare / "Duel" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a Race Debrief, auto-surface a competitive head-to-head ("who won the day") against a crew-mate who rode the same ride.

**Architecture:** A matching service finds an overlapping crew-mate ride; a compare service reuses the existing `get_or_build_debrief` for both riders and computes a duel layer (climbs, peak power, pacing, overall points); a new endpoint serves it; the frontend adds a `CompareDuel` VS section to `DebriefView`. A seed script creates a rival + overlapping ride so it renders on activity 71.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Pydantic + TimescaleDB (backend); React + TypeScript + react-query + Vite (frontend); pytest; Playwright for visual verification.

## Global Constraints

- Python: async SQLAlchemy sessions; every DB helper is `async def`.
- All new analytical blocks are **optional and degrade gracefully** — a missing input yields an empty block, never a 500 (mirror `race_debrief._try`).
- Cross-user rival reads are authorized **in app code by shared crew membership** (owner-role RLS bypass, same as `crew_score`).
- Frontend styling uses existing CSS variables only (`--color-ink`, `--color-ink-2`, `--color-paper`, `--color-paper-2`, `--color-rule`, `--color-good`, `--color-bad`, `--font-serif`, `--ease-spring`). Win = `--color-good`, loss = `--color-ink-2`.
- All user-facing copy has EN + DE variants via `useLocale()` / `strings.ts`.
- Backend server run cmd (venv already at `backend/.venv`): `cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8000`. DB is on `localhost:5433`. Frontend dev server on `:5173`. Demo account: `jannis.deters@icloud.com` / `Debrief123!` (user id 5, activity 71).

---

### Task 1: Rival matching service

**Files:**
- Create: `backend/app/services/ride_matching.py`
- Test: `backend/tests/test_ride_matching.py`

**Interfaces:**
- Consumes: `crew_score._crew_member_user_ids(db, crew_id)`, `models.Activity`, `models.CrewMembership`.
- Produces:
  - `@dataclass RivalMatch { rival_user_id: int, rival_activity_id: int }`
  - `def select_rival_activity(reference: Activity, candidates: list[Activity], *, start_tol_s: int = 5400, dist_tol_pct: float = 0.15) -> Activity | None` (pure, unit-testable)
  - `async def find_rival_ride(db, user_id: int, activity: Activity) -> RivalMatch | None`

- [ ] **Step 1: Write the failing test** for the pure selector.

```python
# backend/tests/test_ride_matching.py
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from app.services.ride_matching import select_rival_activity

def _act(id, user_id, start, dur=3600, dist=100000.0):
    return SimpleNamespace(id=id, user_id=user_id, started_at=start,
                           duration_seconds=dur, distance_meters=dist)

BASE = datetime(2026, 7, 5, 4, 20, tzinfo=timezone.utc)

def test_picks_closest_overlapping_same_distance_ride():
    ref = _act(71, 5, BASE, dist=106000.0)
    near = _act(200, 9, BASE + timedelta(minutes=10), dist=104000.0)   # match
    far_time = _act(201, 9, BASE + timedelta(hours=5), dist=106000.0)  # start out of window
    far_dist = _act(202, 9, BASE + timedelta(minutes=5), dist=40000.0) # distance off
    best = select_rival_activity(ref, [far_time, far_dist, near])
    assert best is not None and best.id == 200

def test_returns_none_when_no_candidate_qualifies():
    ref = _act(71, 5, BASE, dist=106000.0)
    off = _act(300, 9, BASE + timedelta(hours=6), dist=106000.0)
    assert select_rival_activity(ref, [off]) is None

def test_prefers_smaller_combined_delta_among_two_matches():
    ref = _act(71, 5, BASE, dist=106000.0)
    a = _act(400, 9, BASE + timedelta(minutes=30), dist=100000.0)
    b = _act(401, 9, BASE + timedelta(minutes=5), dist=105000.0)  # closer on both
    assert select_rival_activity(ref, [a, b]).id == 401
```

- [ ] **Step 2: Run test to verify it fails.**
Run: `cd backend && source .venv/bin/activate && pytest tests/test_ride_matching.py -v`
Expected: FAIL — `ModuleNotFoundError` / `select_rival_activity` undefined.

- [ ] **Step 3: Implement the service.**

```python
# backend/app/services/ride_matching.py
"""Find a crew-mate's ride that overlaps a reference ride ("rode it with me").

Authorization is by shared crew membership; cross-user Activity reads rely on
the app's owner-role RLS bypass (same mechanism as crew_score).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Activity, CrewMembership
from app.services.crew_score import _crew_member_user_ids


@dataclass(frozen=True)
class RivalMatch:
    rival_user_id: int
    rival_activity_id: int


def _delta_score(reference: Activity, cand: Activity, start_tol_s: int, dist_tol_pct: float) -> float | None:
    start_delta = abs((cand.started_at - reference.started_at).total_seconds())
    if start_delta > start_tol_s:
        return None
    ref_dist = float(reference.distance_meters or 0.0)
    cand_dist = float(cand.distance_meters or 0.0)
    if ref_dist <= 0 or cand_dist <= 0:
        return None
    dist_delta_pct = abs(cand_dist - ref_dist) / ref_dist
    if dist_delta_pct > dist_tol_pct:
        return None
    # Normalise both deltas to [0,1] and sum; lower is better.
    return start_delta / start_tol_s + dist_delta_pct / dist_tol_pct


def select_rival_activity(
    reference: Activity,
    candidates: list[Activity],
    *,
    start_tol_s: int = 5400,
    dist_tol_pct: float = 0.15,
) -> Activity | None:
    best: Activity | None = None
    best_score: float | None = None
    for cand in candidates:
        score = _delta_score(reference, cand, start_tol_s, dist_tol_pct)
        if score is None:
            continue
        if best_score is None or score < best_score:
            best, best_score = cand, score
    return best


async def find_rival_ride(db: AsyncSession, user_id: int, activity: Activity) -> RivalMatch | None:
    membership = (
        await db.execute(select(CrewMembership).where(CrewMembership.user_id == user_id))
    ).scalar_one_or_none()
    if membership is None:
        return None
    member_ids = [uid for uid in await _crew_member_user_ids(db, membership.crew_id) if uid != user_id]
    if not member_ids:
        return None
    window = timedelta(seconds=5400)
    rows = await db.execute(
        select(Activity).where(
            Activity.user_id.in_(member_ids),
            Activity.started_at >= activity.started_at - window,
            Activity.started_at <= activity.started_at + window,
        )
    )
    rival = select_rival_activity(activity, list(rows.scalars().all()))
    if rival is None:
        return None
    return RivalMatch(rival_user_id=rival.user_id, rival_activity_id=rival.id)
```

- [ ] **Step 4: Run tests to verify they pass.**
Run: `cd backend && source .venv/bin/activate && pytest tests/test_ride_matching.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit.**
```bash
git add backend/app/services/ride_matching.py backend/tests/test_ride_matching.py
git commit -m "feat(compare): rival ride matching service"
```

---

### Task 2: Compare schema + duel assembly service

**Files:**
- Create: `backend/app/schemas/ride_compare.py`
- Create: `backend/app/services/ride_compare.py`
- Test: `backend/tests/test_ride_compare.py`

**Interfaces:**
- Consumes: `RaceDebrief` (and its `climbs`, `efforts`, `pacing`, `matchbook`, `header`) from `app.schemas.race_debrief`; `race_debrief.get_or_build_debrief`; `ride_matching.find_rival_ride`; `crew_score._user_context`.
- Produces:
  - Schema `RideComparison` (see below).
  - `def build_duel(me_name, rival_name, me: RaceDebrief, rival: RaceDebrief, lang="en") -> RideComparison` (pure, unit-testable — no DB, no self/rival user ids required; caller fills ids).
  - `async def build_comparison(db, user_id, activity_id, lang="en") -> RideComparison | None`

- [ ] **Step 1: Write the schema.**

```python
# backend/app/schemas/ride_compare.py
"""Contract for the head-to-head ride comparison ("duel")."""
from __future__ import annotations

from pydantic import BaseModel

Winner = str  # "self" | "rival" | "tie"


class RiderRef(BaseModel):
    user_id: int
    display_name: str
    is_self: bool


class ClimbDuel(BaseModel):
    label: str
    distance_m: float
    elev_gain_m: float
    self_time_s: int
    rival_time_s: int
    self_vam: float | None = None
    rival_vam: float | None = None
    self_wkg: float | None = None
    rival_wkg: float | None = None
    winner: Winner


class PowerDuel(BaseModel):
    duration_s: int
    self_watts: float
    rival_watts: float
    winner: Winner


class PacingDuel(BaseModel):
    metric: str            # "np" | "if" | "split" | "surges" | "wprime_depth"
    self_value: float
    rival_value: float
    better: str            # "higher" | "lower"
    winner: Winner


class RideComparison(BaseModel):
    activity_id: int
    me: RiderRef
    rival: RiderRef
    overall_winner: Winner
    self_points: int
    rival_points: int
    headline: str
    climb_duels: list[ClimbDuel] = []
    power_duels: list[PowerDuel] = []
    pacing_duels: list[PacingDuel] = []
    lang: str = "en"
```

- [ ] **Step 2: Write the failing test** for `build_duel`.

```python
# backend/tests/test_ride_compare.py
from app.schemas.race_debrief import (
    RaceDebrief, DebriefHeader, DebriefVerdict, ClimbOut, EffortMatchOut,
    PacingOut, MatchbookOut,
)
from app.services.ride_compare import build_duel

def _hdr(np): return DebriefHeader(title="R", date="2026-07-05", sport="ride",
    distance_km=100.0, elevation_m=2000.0, moving_time_s=3600, np_watts=np,
    if_=0.7, tss=200.0, total_kj=3000.0, avg_speed_kmh=25.0)

def _dbr(np, climb_time, climb_wkg, effort_20m, split, surges, wbal_min):
    return RaceDebrief(
        activity_id=1, header=_hdr(np),
        verdict=DebriefVerdict(grade_letter="B", grade_score=80, ai_verdict="", ai_model=""),
        climbs=[ClimbOut(start_s=0, duration_s=climb_time, distance_m=3000.0,
            elev_gain_m=200.0, avg_grade_pct=6.5, vam_m_per_h=1000.0,
            w_per_kg=climb_wkg, avg_power=300.0, category="cat3")],
        efforts=[EffortMatchOut(duration_s=1200, ride_watts=effort_20m, best_watts=None,
            pct_of_best=None, is_pr=False)],
        pacing=PacingOut(first_half_np=np, second_half_np=np, split_pct=split,
            variability_index=1.05, surge_count=surges),
        matchbook=MatchbookOut(matches=[], match_count=0, time_above_cp_s=0,
            min_bal_j=wbal_min, fully_depleted=False),
    )

def test_self_wins_climb_and_power_and_overall():
    me = _dbr(np=250, climb_time=600, climb_wkg=4.2, effort_20m=300, split=-2.0, surges=5, wbal_min=500.0)
    rival = _dbr(np=240, climb_time=650, climb_wkg=3.9, effort_20m=280, split=-8.0, surges=5, wbal_min=1500.0)
    duel = build_duel("Me", "Rival", me, rival)
    assert duel.climb_duels[0].winner == "self"          # faster time
    assert duel.power_duels[0].winner == "self"          # higher watts
    split = next(p for p in duel.pacing_duels if p.metric == "split")
    assert split.winner == "self"                        # |split| smaller
    assert duel.overall_winner == "self"
    assert duel.self_points > duel.rival_points

def test_ties_when_identical():
    me = _dbr(250, 600, 4.0, 300, -3.0, 5, 800.0)
    rival = _dbr(250, 600, 4.0, 300, -3.0, 5, 800.0)
    duel = build_duel("Me", "Rival", me, rival)
    assert duel.overall_winner == "tie"
    assert duel.self_points == duel.rival_points
```

- [ ] **Step 3: Run test to verify it fails.**
Run: `cd backend && source .venv/bin/activate && pytest tests/test_ride_compare.py -v`
Expected: FAIL — `build_duel` undefined.

- [ ] **Step 4: Implement the service.**

```python
# backend/app/services/ride_compare.py
"""Compute a head-to-head "duel" from two RaceDebrief objects, and the DB
orchestration that finds the rival and builds both debriefs."""
from __future__ import annotations

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


def _win(self_val: float, rival_val: float, better: str) -> str:
    if self_val == rival_val:
        return "tie"
    if better == "higher":
        return "self" if self_val > rival_val else "rival"
    return "self" if self_val < rival_val else "rival"


def _climb_duels(me: RaceDebrief, rival: RaceDebrief) -> list[ClimbDuel]:
    a = sorted(me.climbs, key=lambda c: c.start_s)
    b = sorted(rival.climbs, key=lambda c: c.start_s)
    out: list[ClimbDuel] = []
    for i in range(min(len(a), len(b))):
        ca, cb = a[i], b[i]
        out.append(ClimbDuel(
            label=f"Climb {i + 1}",
            distance_m=ca.distance_m, elev_gain_m=ca.elev_gain_m,
            self_time_s=ca.duration_s, rival_time_s=cb.duration_s,
            self_vam=ca.vam_m_per_h, rival_vam=cb.vam_m_per_h,
            self_wkg=ca.w_per_kg, rival_wkg=cb.w_per_kg,
            winner=_win(ca.duration_s, cb.duration_s, "lower"),  # faster wins
        ))
    return out


def _power_duels(me: RaceDebrief, rival: RaceDebrief) -> list[PowerDuel]:
    rival_by_dur = {e.duration_s: e.ride_watts for e in rival.efforts}
    out: list[PowerDuel] = []
    for e in sorted(me.efforts, key=lambda x: x.duration_s):
        rw = rival_by_dur.get(e.duration_s)
        if rw is None:
            continue
        out.append(PowerDuel(
            duration_s=e.duration_s, self_watts=e.ride_watts, rival_watts=rw,
            winner=_win(e.ride_watts, rw, "higher"),
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
        return user.email.split("@")[0]
    return "Rider"


async def build_comparison(db: AsyncSession, user_id: int, activity_id: int,
                           lang: str = "en") -> RideComparison | None:
    activity = await db.get(Activity, activity_id)
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
```

Note: if `AthleteProfile` has no `display_name` column, `_display_name` falls back to the email prefix — no schema change required.

- [ ] **Step 5: Run tests to verify they pass.**
Run: `cd backend && source .venv/bin/activate && pytest tests/test_ride_compare.py -v`
Expected: 2 passed.

- [ ] **Step 6: Commit.**
```bash
git add backend/app/schemas/ride_compare.py backend/app/services/ride_compare.py backend/tests/test_ride_compare.py
git commit -m "feat(compare): duel schema + assembly service"
```

---

### Task 3: Compare endpoint

**Files:**
- Modify: `backend/app/api/analytics.py` (add route after `get_activity_debrief`, ~line 271)

**Interfaces:**
- Consumes: `ride_compare.build_comparison`, `schemas.ride_compare.RideComparison`.
- Produces: `GET /activity-debrief/{activity_id}/compare` → `RideComparison` or `204`.

- [ ] **Step 1: Add imports** near the existing debrief imports in `analytics.py`.

```python
from fastapi import Response
from app.schemas.ride_compare import RideComparison
from app.services.ride_compare import build_comparison
```
(If `Response`/`status` are already imported, don't duplicate.)

- [ ] **Step 2: Add the route** immediately after `get_activity_debrief`.

```python
@router.get(
    "/activity-debrief/{activity_id}/compare",
    response_model=RideComparison,
    summary="Head-to-head comparison against a crew-mate who rode the same ride",
)
async def get_activity_compare(
    activity_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
    lang: str = "en",
):
    lang = "de" if lang.lower().startswith("de") else "en"
    comparison = await build_comparison(db, _user.id, activity_id, lang)
    if comparison is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return comparison
```

- [ ] **Step 3: Smoke-test the route wiring** (server must be running; no rival seeded yet → expect 204).
Run: `curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $(curl -s -X POST http://localhost:8000/auth/login -d 'username=jannis.deters@icloud.com&password=Debrief123!' | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')" "http://localhost:8000/activity-debrief/71/compare"`
Expected: `204`.

- [ ] **Step 4: Commit.**
```bash
git add backend/app/api/analytics.py
git commit -m "feat(compare): GET /activity-debrief/{id}/compare endpoint"
```

---

### Task 4: Seed a rival + overlapping ride

**Files:**
- Create: `backend/scripts/seed_rival.py`

**Interfaces:**
- Consumes: models `User`, `Activity`, `ActivityStream`, `AthleteProfile`, `Crew`, `CrewMembership`; `auth_service.hash_password`.
- Produces: a rival user in crew 2 with an overlapping copy of activity 71 (perturbed streams). Idempotent by rival email.

- [ ] **Step 1: Write the seed script.**

```python
# backend/scripts/seed_rival.py
"""Seed a crew-mate rival with a ride overlapping a reference activity, so the
compare/duel view renders. Idempotent by rival email. Usage:
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

RIVAL_EMAIL = "luca@maratona.cc"
RIVAL_NAME = "Luca"


def _perturb(streams: dict) -> dict:
    """Rival: ~8% stronger on climbs (power when altitude rising), ~5% weaker on
    the flats. Uses altitude delta as the terrain signal."""
    out = copy.deepcopy(streams)
    power = out.get("power") or []
    alt = out.get("altitude") or []
    new_power = []
    for i, p in enumerate(power):
        if p is None:
            new_power.append(p)
            continue
        rising = i > 0 and alt and alt[i] is not None and alt[i - 1] is not None and alt[i] > alt[i - 1]
        factor = 1.08 if rising else 0.95
        new_power.append(round(p * factor, 1))
    out["power"] = new_power
    return out


async def main(ref_activity_id: int) -> None:
    async with async_session_maker() as db:
        ref = await db.get(Activity, ref_activity_id)
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
        # profile (copy weight/ftp from ref owner if present)
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
        # crew membership
        member = (await db.execute(select(CrewMembership).where(
            CrewMembership.user_id == rival.id))).scalar_one_or_none()
        if member is None:
            db.add(CrewMembership(crew_id=crew.id, user_id=rival.id, role="member"))

        # overlapping activity (idempotent by external_id marker)
        marker = f"rival-of-{ref_activity_id}"
        existing = (await db.execute(select(Activity).where(
            Activity.user_id == rival.id, Activity.external_id == marker))).scalar_one_or_none()
        if existing is None:
            new_act = Activity(
                user_id=rival.id, started_at=ref.started_at, sport=ref.sport,
                duration_seconds=ref.duration_seconds, distance_meters=ref.distance_meters,
                title=f"{RIVAL_NAME} · {ref.title}", source="synthetic", external_id=marker,
            )
            db.add(new_act)
            await db.flush()
            ref_stream = await db.get(ActivityStream, ref.id)
            if ref_stream is not None:
                db.add(ActivityStream(
                    activity_id=new_act.id, user_id=rival.id,
                    streams=_perturb(ref_stream.streams or {}),
                    has_gps=ref_stream.has_gps,
                ))
            print(f"seeded rival activity {new_act.id} for user {rival.id}")
        else:
            print(f"rival activity already exists: {existing.id}")
        await db.commit()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref-activity", type=int, default=71)
    args = ap.parse_args()
    asyncio.run(main(args.ref_activity))
```

Note: confirm the actual `Activity`/`ActivityStream`/`AthleteProfile`/`User` column names during implementation (e.g. `hashed_password`, `title`, `external_id`, `has_gps`, profile `weight_kg`/`ftp_watts`) and adjust; the model files are the source of truth.

- [ ] **Step 2: Run the seed.**
Run: `cd backend && source .venv/bin/activate && python -m scripts.seed_rival --ref-activity 71`
Expected: prints `seeded rival activity <id> for user <id>`.

- [ ] **Step 3: Verify the endpoint now returns 200 with a duel** (reuse the token curl from Task 3 Step 3, without `-o /dev/null`).
Expected: JSON with `overall_winner`, non-empty `climb_duels`, `power_duels`.

- [ ] **Step 4: Commit.**
```bash
git add backend/scripts/seed_rival.py
git commit -m "chore(compare): seed rival crew-mate + overlapping ride"
```

---

### Task 5: Frontend API client + hook

**Files:**
- Create: `frontend/src/api/compare.ts`
- Create: `frontend/src/hooks/useRideCompare.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client`; `useLocale`.
- Produces: `fetchRideComparison(activityId, locale) -> Promise<RideComparison | null>` (204 → null); `useRideCompare(activityId)`.

- [ ] **Step 1: Write the API client** (mirror `api/debrief.ts` types).

```ts
// frontend/src/api/compare.ts
import { apiClient } from './client'

export type Winner = 'self' | 'rival' | 'tie'
export interface RiderRef { user_id: number; display_name: string; is_self: boolean }
export interface ClimbDuel {
  label: string; distance_m: number; elev_gain_m: number
  self_time_s: number; rival_time_s: number
  self_vam: number | null; rival_vam: number | null
  self_wkg: number | null; rival_wkg: number | null; winner: Winner
}
export interface PowerDuel { duration_s: number; self_watts: number; rival_watts: number; winner: Winner }
export interface PacingDuel {
  metric: string; self_value: number; rival_value: number; better: 'higher' | 'lower'; winner: Winner
}
export interface RideComparison {
  activity_id: number; me: RiderRef; rival: RiderRef
  overall_winner: Winner; self_points: number; rival_points: number; headline: string
  climb_duels: ClimbDuel[]; power_duels: PowerDuel[]; pacing_duels: PacingDuel[]; lang: string
}

export async function fetchRideComparison(
  activityId: number, locale: string,
): Promise<RideComparison | null> {
  const res = await apiClient.get<RideComparison>(
    `/activity-debrief/${activityId}/compare`, { params: { lang: locale } })
  if (res.status === 204) return null
  return res.data
}
```

- [ ] **Step 2: Write the hook.**

```ts
// frontend/src/hooks/useRideCompare.ts
import { useQuery } from '@tanstack/react-query'
import { fetchRideComparison, type RideComparison } from '../api/compare'
import { useLocale } from '../contexts/LocaleContext'

export function useRideCompare(activityId: number | undefined) {
  const { locale } = useLocale()
  return useQuery<RideComparison | null>({
    queryKey: ['ride-compare', activityId, locale],
    queryFn: () => fetchRideComparison(activityId as number, locale),
    enabled: activityId != null,
  })
}
```

- [ ] **Step 3: Typecheck.**
Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors from the new files.

- [ ] **Step 4: Commit.**
```bash
git add frontend/src/api/compare.ts frontend/src/hooks/useRideCompare.ts
git commit -m "feat(compare): frontend api client + hook"
```

---

### Task 6: CompareDuel component + DebriefView integration + i18n

**Files:**
- Create: `frontend/src/components/debrief/CompareDuel.tsx`
- Modify: `frontend/src/pages/DebriefView.tsx` (add a `<section>` after `KeyReads`)
- Modify: `frontend/src/i18n/strings.ts` (new labels)

**Interfaces:**
- Consumes: `useRideCompare`, `useLocale`, `RideComparison` types.
- Produces: `<CompareDuel activityId={number} />` — renders nothing when the hook returns null/undefined.

- [ ] **Step 1: Add i18n strings** in `strings.ts` (follow the file's existing shape; keys under a `compare` group). Provide EN + DE for: `versus` ("VS"/"VS"), `wonTheDay`, `deadHeat`, `climbBattle` ("Climb battle"/"Anstiegs-Duell"), `powerDuel` ("Power duel"/"Leistungs-Duell"), `pacingEffort` ("Pacing & effort"/"Pacing & Einsatz"), `you` ("You"/"Du"), metric labels `np` ("NP"/"NP"), `split` ("Split discipline"/"Split-Disziplin"), `wprime_depth` ("Dug deepest"/"Tiefster Einsatz"). Match the existing export/lookup pattern in the file.

- [ ] **Step 2: Write the component.** Style with the CSS variables listed in Global Constraints; win = `--color-good`, loss = `--color-ink-2`.

```tsx
// frontend/src/components/debrief/CompareDuel.tsx
import { useLocale } from '../../contexts/LocaleContext'
import { useRideCompare } from '../../hooks/useRideCompare'
import type { Winner } from '../../api/compare'

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const winColor = (w: Winner, mine: boolean) =>
  w === 'tie' ? 'var(--color-ink-2)'
    : (w === 'self') === mine ? 'var(--color-good)' : 'var(--color-ink-2)'

export default function CompareDuel({ activityId }: { activityId: number }) {
  const { locale } = useLocale()
  const de = locale === 'de'
  const { data } = useRideCompare(activityId)
  if (!data) return null

  const meWon = data.overall_winner === 'self'
  const tie = data.overall_winner === 'tie'

  const card: React.CSSProperties = {
    backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)',
  }

  return (
    <div>
      <h2 className="mb-3" style={{ color: 'var(--color-ink)', fontFamily: 'var(--font-serif)',
        fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em' }}>
        {de ? 'Kopf an Kopf' : 'Head to head'}
      </h2>

      {/* Scoreboard hero */}
      <div className="rounded-[18px] p-5 mb-3" style={card}>
        <div className="flex items-center justify-between">
          <ScorePill name={de ? 'Du' : 'You'} pts={data.self_points}
            win={!tie && meWon} />
          <div className="px-3 text-center">
            <div style={{ color: 'var(--color-ink-2)', fontSize: 12, letterSpacing: '0.14em' }}>VS</div>
          </div>
          <ScorePill name={data.rival.display_name} pts={data.rival_points}
            win={!tie && !meWon} align="right" />
        </div>
        <p className="mt-3 text-center" style={{ color: 'var(--color-ink)', fontSize: 14 }}>
          {tie ? (de ? 'Kopf-an-Kopf.' : 'Dead heat.') : data.headline}
        </p>
      </div>

      {/* Climb battle */}
      {data.climb_duels.length > 0 && (
        <div className="rounded-[16px] p-4 mb-3" style={card}>
          <SectionLabel>{de ? 'Anstiegs-Duell' : 'Climb battle'}</SectionLabel>
          <div className="flex flex-col gap-2">
            {data.climb_duels.map((c, i) => (
              <div key={i} className="flex items-center justify-between" style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--color-ink-2)' }}>{c.label}</span>
                <span style={{ color: winColor(c.winner, true) }}>{fmtTime(c.self_time_s)}</span>
                <span style={{ color: 'var(--color-ink-2)', fontSize: 11 }}>vs</span>
                <span style={{ color: winColor(c.winner, false) }}>{fmtTime(c.rival_time_s)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Power duel */}
      {data.power_duels.length > 0 && (
        <div className="rounded-[16px] p-4 mb-3" style={card}>
          <SectionLabel>{de ? 'Leistungs-Duell' : 'Power duel'}</SectionLabel>
          <div className="flex flex-col gap-2">
            {data.power_duels.map((p, i) => {
              const total = p.self_watts + p.rival_watts || 1
              const selfPct = (p.self_watts / total) * 100
              return (
                <div key={i} style={{ fontSize: 12 }}>
                  <div className="flex justify-between" style={{ color: 'var(--color-ink-2)' }}>
                    <span style={{ color: winColor(p.winner, true) }}>{Math.round(p.self_watts)}w</span>
                    <span>{p.duration_s < 60 ? `${p.duration_s}s` : `${p.duration_s / 60}m`}</span>
                    <span style={{ color: winColor(p.winner, false) }}>{Math.round(p.rival_watts)}w</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full overflow-hidden flex"
                    style={{ background: 'var(--color-rule)' }}>
                    <div style={{ width: `${selfPct}%`, background: winColor(p.winner, true) }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pacing & effort */}
      {data.pacing_duels.length > 0 && (
        <div className="rounded-[16px] p-4" style={card}>
          <SectionLabel>{de ? 'Pacing & Einsatz' : 'Pacing & effort'}</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {data.pacing_duels.map((p, i) => (
              <span key={i} className="rounded-full px-3 py-1" style={{
                fontSize: 12, border: '1px solid var(--color-rule)',
                color: winColor(p.winner, true) }}>
                {p.metric} {p.self_value.toFixed(0)} · {p.rival_value.toFixed(0)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ScorePill({ name, pts, win, align }: { name: string; pts: number; win: boolean; align?: 'right' }) {
  return (
    <div className="flex flex-col" style={{ alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <span style={{ color: 'var(--color-ink-2)', fontSize: 13 }}>{name}</span>
      <span style={{ color: win ? 'var(--color-good)' : 'var(--color-ink)',
        fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 500 }}>{pts}</span>
      {win && <span style={{ color: 'var(--color-good)', fontSize: 10, letterSpacing: '0.14em' }}>WON</span>}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2" style={{ color: 'var(--color-ink-2)', fontSize: 11,
    letterSpacing: '0.14em', textTransform: 'uppercase' }}>{children}</div>
}
```

- [ ] **Step 3: Integrate into `DebriefView.tsx`.** Add the import and render it after the `KeyReads` section.

```tsx
import CompareDuel from '../components/debrief/CompareDuel'
// ...inside the {data && (<>...</>)} block, after the KeyReads <section>:
<section style={{ animation: 'card-enter 480ms var(--ease-apple-default, ease) both', animationDelay: '200ms' }}>
  {activityId != null && <CompareDuel activityId={activityId} />}
</section>
```

- [ ] **Step 4: Typecheck.**
Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit.**
```bash
git add frontend/src/components/debrief/CompareDuel.tsx frontend/src/pages/DebriefView.tsx frontend/src/i18n/strings.ts
git commit -m "feat(compare): CompareDuel VS section on debrief"
```

---

### Task 7: Visual verification & polish

**Files:** (polish edits to `CompareDuel.tsx` as needed)

- [ ] **Step 1:** Ensure backend + frontend dev servers are running and the rival is seeded (Tasks 3–4).
- [ ] **Step 2:** Drive the app with Playwright: log in (`jannis.deters@icloud.com` / `Debrief123!` — or the session is already authed), navigate to `http://localhost:5173/activities/71/debrief`.
- [ ] **Step 3:** Screenshot the full page (desktop 1440-wide) and a mobile viewport (390-wide). Read both screenshots.
- [ ] **Step 4:** Critique against the polish bar (per user memory *always-visually-verify-and-polish* and *engaging-surface-quality-bar*): does the VS scoreboard read in five seconds? Is the winner obvious? Do bars/colors match the WHOOP-tier debrief? Iterate on `CompareDuel.tsx` until it's striking on both viewports.
- [ ] **Step 5:** Verify DE locale renders (toggle to DE, re-screenshot).
- [ ] **Step 6: Commit** any polish.
```bash
git add frontend/src/components/debrief/CompareDuel.tsx
git commit -m "polish(compare): VS view visual pass (desktop + mobile)"
```

---

## Self-Review notes

- **Spec coverage:** matching (T1), duel + all four surfaces / overall points (T2), endpoint w/ 204 (T3), seed (T4), FE api+hook (T5), component+integration+i18n (T6), visual verification (T7). All spec sections mapped.
- **Type consistency:** `RideComparison`/`ClimbDuel`/`PowerDuel`/`PacingDuel`/`RiderRef` identical across backend schema (T2) and FE types (T5); `winner` values `self|rival|tie`; `better` values `higher|lower`.
- **Known verification points during implementation:** exact model column names in T4 seed (source of truth = model files); whether `AthleteProfile.display_name` exists (T2 falls back gracefully); whether `apiClient` surfaces `res.status` for the 204 check (T5 — confirm axios config; if it throws on 204, catch and return null).
