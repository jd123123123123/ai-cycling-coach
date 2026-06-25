# Same-Workout Progression ("Workouts") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Workouts" view that groups an athlete's repeated workouts by normalized title and trends per-rep metrics (power@HR efficiency, avg/NP power, avg HR, pace, TSS) so they can see whether they're improving.

**Architecture:** A pure scoring core (`normalize_title` + grouping + per-rep metrics + trends + headline) with no DB, wrapped by a thin DB/API layer that loads the user's activities and assembles `GET /workouts` (groups, count ≥ 2) and `GET /workouts/{key}` (reps + trends). A new frontend "Workouts" tab lists repeated workouts and opens a per-workout progression detail. Reads existing `activities` — no migration.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Pydantic v2 (backend); React 19 + TypeScript + @tanstack/react-query + recharts (frontend).

## Global Constraints

- Grouping is by **normalized title** only (sport carried for display + metric selection, not for grouping).
- A "repeated workout" = a normalized key with **≥ 2** activities; groups with < 2 are never listed and `GET /workouts/{key}` returns **404** for them.
- All metrics derive from existing `Activity` columns: `average_power`, `normalized_power`, `average_hr`, `max_hr`, `tss`, `duration_seconds`, `distance_meters`, `started_at`, `title`, `sport`. **No per-second streams** (true intra-ride decoupling is out of scope / phase-2).
- `efficiency_factor = (normalized_power or average_power) / average_hr`, only when a power value and `average_hr > 0` exist.
- `pace_s_per_km = duration_seconds / (distance_meters/1000)`, only when `distance_meters > 0`.
- "Improving" direction: `efficiency`, `avg_power`, `np`, `tss` → up is better; `pace`, `avg_hr` → down is better.
- API routes use `Annotated[User, Depends(get_current_active_user)]` + `Annotated[AsyncSession, Depends(get_db_for_user)]` (RLS).
- Backend tests: pure-function unit tests; API via `fastapi.testclient.TestClient` + `app.dependency_overrides` + `AsyncMock` db (mirror `tests/api/test_tab_layouts.py`). Run from `backend/` via `.venv/bin/pytest`.
- Frontend has no test runner — verify new files typecheck (`npx tsc -b --noEmit 2>&1 | grep <file>`) and verify behavior live against the running app.
- Nav: a new top-level **Workouts** tab (`TabId` gains `'workouts'`) wired into both `DashboardPage` and `MobileBottomNav`; all strings via `useT()` (en + de).

---

## File Structure

**Backend**
- Create `backend/app/schemas/workout_progression.py` — Pydantic models.
- Create `backend/app/services/workout_comparison.py` — pure core + DB entry points.
- Create `backend/app/api/workouts.py` — the two endpoints.
- Modify `backend/app/main.py` — register router.
- Tests: `backend/tests/test_workout_comparison.py`, `backend/tests/api/test_workouts.py`.

**Frontend**
- Create `frontend/src/api/workouts.ts`, `frontend/src/hooks/useWorkouts.ts`.
- Create `frontend/src/components/workouts/WorkoutsList.tsx`,
  `frontend/src/components/workouts/WorkoutDetail.tsx`,
  `frontend/src/components/dashboard/tabs/WorkoutsTab.tsx`.
- Modify `frontend/src/pages/DashboardPage.tsx`,
  `frontend/src/components/dashboard/MobileBottomNav.tsx`,
  `frontend/src/i18n/strings.ts`.

---

## Task 1: Backend pure core (schemas + comparison functions)

**Files:**
- Create: `backend/app/schemas/workout_progression.py`
- Create: `backend/app/services/workout_comparison.py`
- Test: `backend/tests/test_workout_comparison.py`

**Interfaces:**
- Produces: schemas `WorkoutRep`, `WorkoutTrend`, `Headline`, `WorkoutGroupSummary`, `WorkoutGroupDetail`; pure functions `normalize_title(title) -> str|None`, `rep_from_activity(act) -> WorkoutRep`, `build_trend(metric, values, improving_up) -> WorkoutTrend`, `pick_headline(trends, count) -> Headline`, `group_activities(acts) -> dict[str, list]`, `build_group_summary(key, acts) -> WorkoutGroupSummary`, `build_group_detail(key, acts) -> WorkoutGroupDetail`. (`act` is anything with the Activity attributes.)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_workout_comparison.py`:

```python
"""Unit tests for the pure workout-comparison core."""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.workout_comparison import (
    normalize_title, rep_from_activity, build_trend, pick_headline,
    group_activities, build_group_summary, build_group_detail,
)


def _act(**kw):
    base = dict(
        id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), title="Zwift - Rønnestad",
        sport="cycling", duration_seconds=3600, distance_meters=30000.0, tss=70.0,
        average_power=200.0, normalized_power=210.0, average_hr=150, max_hr=175,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def test_normalize_strips_platform_prefix_and_counter():
    assert normalize_title("Zwift - Breakfast Returns (1)") == "breakfast returns"
    assert normalize_title("ROUVY - IRONMAN 70.3") == "ironman 70.3"
    assert normalize_title("  Zwift -  Aerobic   Forge ") == "aerobic forge"


def test_normalize_none_and_blank():
    assert normalize_title(None) is None
    assert normalize_title("   ") is None


def test_normalize_plain_title_unchanged():
    assert normalize_title("Berlin Laufen") == "berlin laufen"


def test_rep_efficiency_and_pace():
    rep = rep_from_activity(_act(normalized_power=210.0, average_hr=150,
                                 duration_seconds=3600, distance_meters=30000.0))
    assert rep.efficiency_factor == round(210.0 / 150, 3)
    assert rep.pace_s_per_km == round(3600 / 30.0, 1)


def test_rep_missing_power_or_hr_yields_none_efficiency():
    rep = rep_from_activity(_act(normalized_power=None, average_power=None))
    assert rep.efficiency_factor is None


def test_build_trend_direction_and_delta():
    up = build_trend("avg_power", [200.0, 220.0], improving_up=True)
    assert up.delta == 20.0 and up.pct == 10.0 and up.improving is True
    down = build_trend("pace", [300.0, 280.0], improving_up=False)
    assert down.improving is True  # pace dropped → better
    none = build_trend("np", [None, 200.0], improving_up=True)
    assert none.improving is None  # < 2 real points


def test_grouping_buckets_normalized_titles():
    acts = [_act(id=1, title="Zwift - Forge"), _act(id=2, title="Forge"),
            _act(id=3, title="Berlin Laufen")]
    groups = group_activities(acts)
    assert sorted((k, len(v)) for k, v in groups.items()) == [("berlin laufen", 1), ("forge", 2)]


def test_summary_count_dates_and_headline():
    a1 = _act(id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
              normalized_power=200.0, average_hr=160)
    a2 = _act(id=2, started_at=datetime(2026, 2, 1, tzinfo=timezone.utc),
              normalized_power=220.0, average_hr=160)
    s = build_group_summary("forge", [a1, a2])
    assert s.count == 2 and s.first_date == "2026-01-01" and s.last_date == "2026-02-01"
    assert s.headline.text.startswith("Efficiency") and s.headline.tone == "good"


def test_detail_orders_reps_oldest_to_newest_with_trends():
    a1 = _act(id=1, started_at=datetime(2026, 2, 1, tzinfo=timezone.utc))
    a2 = _act(id=2, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    d = build_group_detail("forge", [a1, a2])
    assert [r.activity_id for r in d.reps] == [2, 1]  # oldest first
    assert {t.metric for t in d.trends} == {"efficiency", "avg_power", "np", "avg_hr", "pace", "tss"}


def test_headline_falls_back_to_count_when_no_metrics():
    a1 = _act(id=1, average_power=None, normalized_power=None, average_hr=None, distance_meters=None)
    a2 = _act(id=2, average_power=None, normalized_power=None, average_hr=None, distance_meters=None)
    s = build_group_summary("x", [a1, a2])
    assert s.headline.text == "2× logged" and s.headline.tone == "neutral"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_workout_comparison.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.workout_comparison`.

- [ ] **Step 3: Create the schemas**

Create `backend/app/schemas/workout_progression.py`:

```python
"""Schemas for the same-workout progression view."""
from pydantic import BaseModel


class WorkoutRep(BaseModel):
    activity_id: int
    date: str
    duration_s: int | None = None
    distance_m: float | None = None
    tss: float | None = None
    avg_power: float | None = None
    normalized_power: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    efficiency_factor: float | None = None
    pace_s_per_km: float | None = None


class WorkoutTrend(BaseModel):
    metric: str
    series: list[float]
    first: float | None = None
    last: float | None = None
    delta: float | None = None
    pct: float | None = None
    improving: bool | None = None


class Headline(BaseModel):
    text: str
    tone: str  # 'good' | 'bad' | 'neutral'


class WorkoutGroupSummary(BaseModel):
    key: str
    title: str
    sport: str
    count: int
    first_date: str
    last_date: str
    headline: Headline


class WorkoutGroupDetail(BaseModel):
    key: str
    title: str
    sport: str
    reps: list[WorkoutRep]
    trends: list[WorkoutTrend]
```

- [ ] **Step 4: Create the pure core**

Create `backend/app/services/workout_comparison.py`:

```python
"""Same-workout progression — pure scoring core + DB entry points.

The top of this module is DB-free and deterministic (unit-tested in isolation):
title normalization, per-rep metric extraction, trend math, headline selection,
and grouping. The two `*_workout_*` coroutines at the bottom are the only
DB-touching entry points.
"""
from __future__ import annotations

import re
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import Activity
from app.schemas.workout_progression import (
    Headline, WorkoutGroupDetail, WorkoutGroupSummary, WorkoutRep, WorkoutTrend,
)

_PLATFORM_PREFIX = re.compile(
    r"^(zwift|rouvy|wahoo|trainerroad|mywhoosh|indievelo|peloton)\s*-\s*", re.IGNORECASE
)
_TRAILING_COUNTER = re.compile(r"\s*\(\d+\)\s*$")


def normalize_title(title: str | None) -> str | None:
    """Grouping key: lowercase, collapse whitespace, strip a leading platform
    prefix and a trailing ' (n)' counter. None/blank → None (ungroupable)."""
    if not title or not title.strip():
        return None
    t = " ".join(title.strip().split()).lower()
    t = _PLATFORM_PREFIX.sub("", t)
    t = _TRAILING_COUNTER.sub("", t)
    t = t.strip()
    return t or None


def _efficiency_factor(np: float | None, avg_power: float | None, avg_hr: int | None) -> float | None:
    p = np if np else avg_power
    if not p or not avg_hr or avg_hr <= 0:
        return None
    return round(p / avg_hr, 3)


def _pace_s_per_km(duration_s: int | None, distance_m: float | None) -> float | None:
    if not duration_s or not distance_m or distance_m <= 0:
        return None
    return round(duration_s / (distance_m / 1000.0), 1)


def rep_from_activity(act) -> WorkoutRep:
    return WorkoutRep(
        activity_id=act.id,
        date=act.started_at.date().isoformat(),
        duration_s=act.duration_seconds,
        distance_m=act.distance_meters,
        tss=act.tss,
        avg_power=act.average_power,
        normalized_power=act.normalized_power,
        avg_hr=act.average_hr,
        max_hr=act.max_hr,
        efficiency_factor=_efficiency_factor(act.normalized_power, act.average_power, act.average_hr),
        pace_s_per_km=_pace_s_per_km(act.duration_seconds, act.distance_meters),
    )


def build_trend(metric: str, values: list, improving_up: bool) -> WorkoutTrend:
    vals = [float(v) for v in values if v is not None]
    if len(vals) < 2:
        return WorkoutTrend(
            metric=metric, series=vals,
            first=(vals[0] if vals else None), last=(vals[-1] if vals else None),
        )
    first, last = vals[0], vals[-1]
    delta = round(last - first, 3)
    pct = round(delta / first * 100, 1) if first else None
    improving = (delta > 0) if improving_up else (delta < 0)
    return WorkoutTrend(metric=metric, series=vals, first=first, last=last,
                        delta=delta, pct=pct, improving=improving)


def _trends_for(reps: list[WorkoutRep]) -> list[WorkoutTrend]:
    specs = [
        ("efficiency", [r.efficiency_factor for r in reps], True),
        ("avg_power", [r.avg_power for r in reps], True),
        ("np", [r.normalized_power for r in reps], True),
        ("avg_hr", [r.avg_hr for r in reps], False),
        ("pace", [r.pace_s_per_km for r in reps], False),
        ("tss", [r.tss for r in reps], True),
    ]
    return [build_trend(m, vals, up) for (m, vals, up) in specs]


def _fmt_pace(s: float) -> str:
    m, sec = divmod(int(round(s)), 60)
    return f"{m}:{sec:02d}"


def pick_headline(trends: list[WorkoutTrend], count: int) -> Headline:
    by = {t.metric: t for t in trends}
    eff = by.get("efficiency")
    if eff and eff.pct is not None and eff.improving is not None:
        return Headline(text=f"Efficiency {eff.pct:+.0f}%", tone="good" if eff.improving else "bad")
    pw = next((by[m] for m in ("avg_power", "np") if by.get(m) and by[m].delta is not None), None)
    if pw and pw.first is not None and pw.improving is not None:
        return Headline(text=f"Avg power {pw.first:.0f}→{pw.last:.0f} W",
                        tone="good" if pw.improving else "bad")
    pace = by.get("pace")
    if pace and pace.first is not None and pace.improving is not None:
        return Headline(text=f"Pace {_fmt_pace(pace.first)}→{_fmt_pace(pace.last)} /km",
                        tone="good" if pace.improving else "bad")
    return Headline(text=f"{count}× logged", tone="neutral")


def group_activities(acts: list) -> dict[str, list]:
    groups: dict[str, list] = {}
    for a in acts:
        k = normalize_title(a.title)
        if k is None:
            continue
        groups.setdefault(k, []).append(a)
    return groups


def _title_and_sport(acts: list) -> tuple[str, str]:
    title = Counter(a.title for a in acts if a.title).most_common(1)[0][0]
    sport = Counter(a.sport for a in acts if a.sport).most_common(1)[0][0]
    return title, sport


def build_group_summary(key: str, acts: list) -> WorkoutGroupSummary:
    acts_sorted = sorted(acts, key=lambda a: a.started_at)
    reps = [rep_from_activity(a) for a in acts_sorted]
    trends = _trends_for(reps)
    title, sport = _title_and_sport(acts_sorted)
    return WorkoutGroupSummary(
        key=key, title=title, sport=sport, count=len(acts_sorted),
        first_date=acts_sorted[0].started_at.date().isoformat(),
        last_date=acts_sorted[-1].started_at.date().isoformat(),
        headline=pick_headline(trends, len(acts_sorted)),
    )


def build_group_detail(key: str, acts: list) -> WorkoutGroupDetail:
    acts_sorted = sorted(acts, key=lambda a: a.started_at)
    reps = [rep_from_activity(a) for a in acts_sorted]
    title, sport = _title_and_sport(acts_sorted)
    return WorkoutGroupDetail(key=key, title=title, sport=sport,
                              reps=reps, trends=_trends_for(reps))


# ── DB entry points (Task 2 adds the API that calls these) ────────────────────

async def list_workout_groups(db: AsyncSession, user_id: int) -> list[WorkoutGroupSummary]:
    result = await db.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(Activity.started_at)
    )
    acts = list(result.scalars())
    summaries = [build_group_summary(k, v) for k, v in group_activities(acts).items() if len(v) >= 2]
    summaries.sort(key=lambda s: (s.count, s.last_date), reverse=True)
    return summaries


async def get_workout_group(db: AsyncSession, user_id: int, key: str) -> WorkoutGroupDetail | None:
    result = await db.execute(
        select(Activity).where(Activity.user_id == user_id).order_by(Activity.started_at)
    )
    acts = list(result.scalars())
    match = group_activities(acts).get(key)
    if not match or len(match) < 2:
        return None
    return build_group_detail(key, match)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_workout_comparison.py -v`
Expected: PASS (10 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/workout_progression.py backend/app/services/workout_comparison.py backend/tests/test_workout_comparison.py
git commit -m "feat(workouts): workout-comparison pure core + schemas"
```

---

## Task 2: Backend API — GET /workouts and /workouts/{key}

**Files:**
- Create: `backend/app/api/workouts.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/api/test_workouts.py`

**Interfaces:**
- Consumes: `list_workout_groups`, `get_workout_group` (Task 1); `get_current_active_user`, `get_db_for_user`.
- Produces: `GET /workouts` → `list[WorkoutGroupSummary]`; `GET /workouts/{key:path}` → `WorkoutGroupDetail` (404 when < 2 reps).

- [ ] **Step 1: Write the failing API test**

Create `backend/tests/api/test_workouts.py`:

```python
"""Integration tests for /workouts (mocked db, dependency_overrides)."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user


def _act(**kw):
    base = dict(
        id=1, started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), title="Zwift - Forge",
        sport="cycling", duration_seconds=3600, distance_meters=30000.0, tss=70.0,
        average_power=200.0, normalized_power=210.0, average_hr=150, max_hr=175,
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _db_with_activities(acts):
    db = AsyncMock()

    async def _execute(*a, **k):
        res = MagicMock()
        res.scalars.return_value = list(acts)
        return res

    db.execute = _execute
    return db


def _user():
    u = MagicMock(); u.id = 1; u.is_active = True
    return u


def _override(db):
    async def _u():
        return _user()

    async def _d():
        yield db

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def test_list_requires_auth(client):
    assert client.get("/workouts").status_code == 401


def test_list_returns_only_repeated_groups_sorted(client):
    acts = [
        _act(id=1, title="Zwift - Forge", started_at=datetime(2026, 1, 1, tzinfo=timezone.utc)),
        _act(id=2, title="Forge", started_at=datetime(2026, 2, 1, tzinfo=timezone.utc)),
        _act(id=3, title="ROUVY - Solo", started_at=datetime(2026, 1, 5, tzinfo=timezone.utc)),  # only 1 → excluded
    ]
    _override(_db_with_activities(acts))
    resp = client.get("/workouts")
    assert resp.status_code == 200
    body = resp.json()
    assert [g["key"] for g in body] == ["forge"]  # 'solo' has <2 reps, dropped
    assert body[0]["count"] == 2


def test_detail_returns_reps_and_trends(client):
    acts = [
        _act(id=1, title="Zwift - Forge", started_at=datetime(2026, 1, 1, tzinfo=timezone.utc), normalized_power=200.0, average_hr=160),
        _act(id=2, title="Forge", started_at=datetime(2026, 2, 1, tzinfo=timezone.utc), normalized_power=220.0, average_hr=160),
    ]
    _override(_db_with_activities(acts))
    resp = client.get("/workouts/forge")
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] in ("Zwift - Forge", "Forge")
    assert [r["activity_id"] for r in body["reps"]] == [1, 2]
    assert any(t["metric"] == "efficiency" for t in body["trends"])


def test_detail_unknown_key_404(client):
    _override(_db_with_activities([_act(id=1, title="Zwift - Forge"), _act(id=2, title="Forge")]))
    assert client.get("/workouts/nope").status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/api/test_workouts.py -v`
Expected: FAIL — 404s (router not registered).

- [ ] **Step 3: Create the router**

Create `backend/app/api/workouts.py`:

```python
"""Same-workout progression endpoints.

  · GET /workouts        — repeated workouts (count >= 2), most-repeated first
  · GET /workouts/{key}  — one workout's per-rep metrics + trends

RLS-protected via get_db_for_user.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_active_user, get_db_for_user
from app.models.user import User
from app.schemas.workout_progression import WorkoutGroupDetail, WorkoutGroupSummary
from app.services.workout_comparison import get_workout_group, list_workout_groups

router = APIRouter(prefix="/workouts", tags=["workouts"])


@router.get("", response_model=list[WorkoutGroupSummary])
async def list_workouts(
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> list[WorkoutGroupSummary]:
    return await list_workout_groups(db, _user.id)


@router.get("/{key:path}", response_model=WorkoutGroupDetail)
async def get_workout(
    key: str,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> WorkoutGroupDetail:
    detail = await get_workout_group(db, _user.id, key)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workout not found")
    return detail
```

- [ ] **Step 4: Register the router**

In `backend/app/main.py`, after the `tab_layouts` import (with the other `# noqa: E402` router imports) add:

```python
from app.api.workouts import router as workouts_router  # noqa: E402
```

After `app.include_router(tab_layouts_router)` add:

```python
app.include_router(workouts_router)
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/api/test_workouts.py -v`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/workouts.py backend/app/main.py backend/tests/api/test_workouts.py
git commit -m "feat(workouts): GET /workouts + /workouts/{key} endpoints"
```

---

## Task 3: Frontend data layer

**Files:**
- Create: `frontend/src/api/workouts.ts`
- Create: `frontend/src/hooks/useWorkouts.ts`

**Interfaces:**
- Consumes: `apiClient` from `./client`.
- Produces: types `WorkoutRep`, `WorkoutTrend`, `Headline`, `WorkoutGroupSummary`, `WorkoutGroupDetail`; `listWorkouts()`, `getWorkout(key)`; `useWorkouts()`, `useWorkout(key)`.

- [ ] **Step 1: Create the api client**

Create `frontend/src/api/workouts.ts`:

```ts
import { apiClient } from './client'

export interface WorkoutRep {
  activity_id: number
  date: string
  duration_s: number | null
  distance_m: number | null
  tss: number | null
  avg_power: number | null
  normalized_power: number | null
  avg_hr: number | null
  max_hr: number | null
  efficiency_factor: number | null
  pace_s_per_km: number | null
}

export interface WorkoutTrend {
  metric: string
  series: number[]
  first: number | null
  last: number | null
  delta: number | null
  pct: number | null
  improving: boolean | null
}

export interface Headline {
  text: string
  tone: 'good' | 'bad' | 'neutral'
}

export interface WorkoutGroupSummary {
  key: string
  title: string
  sport: string
  count: number
  first_date: string
  last_date: string
  headline: Headline
}

export interface WorkoutGroupDetail {
  key: string
  title: string
  sport: string
  reps: WorkoutRep[]
  trends: WorkoutTrend[]
}

export async function listWorkouts(): Promise<WorkoutGroupSummary[]> {
  const res = await apiClient.get<WorkoutGroupSummary[]>('/workouts')
  return res.data
}

export async function getWorkout(key: string): Promise<WorkoutGroupDetail> {
  const res = await apiClient.get<WorkoutGroupDetail>(`/workouts/${encodeURIComponent(key)}`)
  return res.data
}
```

- [ ] **Step 2: Create the hooks**

Create `frontend/src/hooks/useWorkouts.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { getWorkout, listWorkouts, type WorkoutGroupDetail, type WorkoutGroupSummary } from '../api/workouts'

export function useWorkouts() {
  return useQuery<WorkoutGroupSummary[]>({
    queryKey: ['workouts'],
    queryFn: listWorkouts,
    staleTime: 5 * 60_000,
  })
}

export function useWorkout(key: string | null) {
  return useQuery<WorkoutGroupDetail>({
    queryKey: ['workouts', key],
    queryFn: () => getWorkout(key as string),
    enabled: key !== null,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "api/workouts|useWorkouts" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/workouts.ts frontend/src/hooks/useWorkouts.ts
git commit -m "feat(workouts): api client + react-query hooks"
```

---

## Task 4: Frontend — Workouts view (list + detail + tab)

**Files:**
- Create: `frontend/src/components/workouts/WorkoutsList.tsx`
- Create: `frontend/src/components/workouts/WorkoutDetail.tsx`
- Create: `frontend/src/components/dashboard/tabs/WorkoutsTab.tsx`
- Modify: `frontend/src/i18n/strings.ts`

**Interfaces:**
- Consumes: `useWorkouts`, `useWorkout` (Task 3); `Sparkline` from `../dashboard/Sparkline`; `recharts`; `useT` from `../../../contexts/LocaleContext` (tab) / `../../contexts/LocaleContext` (components under `components/workouts`).
- Produces: default export `WorkoutsTab` (manages list↔detail via a `selectedKey` state, mirroring `DashboardsWorkspace`).

- [ ] **Step 1: Add strings**

In `frontend/src/i18n/strings.ts`, add inside `STRINGS`:

```ts
  tab_workouts: { en: 'Workouts', de: 'Workouts' },
  workouts_title: { en: 'Repeated workouts', de: 'Wiederholte Workouts' },
  workouts_empty: { en: 'No repeated workouts yet — do a named workout more than once to compare.', de: 'Noch keine Wiederholungen — absolviere ein benanntes Workout mehrfach zum Vergleich.' },
  workouts_times: { en: '× done', de: '× gemacht' },
  workouts_back: { en: 'All workouts', de: 'Alle Workouts' },
  workouts_not_found: { en: 'Workout not found', de: 'Workout nicht gefunden' },
  workouts_metric_efficiency: { en: 'Efficiency (W/bpm)', de: 'Effizienz (W/bpm)' },
  workouts_metric_avg_power: { en: 'Avg power (W)', de: 'Ø Leistung (W)' },
  workouts_metric_np: { en: 'Normalized power (W)', de: 'Normalisierte Leistung (W)' },
  workouts_metric_avg_hr: { en: 'Avg HR (bpm)', de: 'Ø HF (bpm)' },
  workouts_metric_pace: { en: 'Pace (/km)', de: 'Pace (/km)' },
  workouts_metric_tss: { en: 'TSS', de: 'TSS' },
```

- [ ] **Step 2: Create WorkoutsList**

Create `frontend/src/components/workouts/WorkoutsList.tsx`:

```tsx
import Sparkline from '../dashboard/Sparkline'
import { useWorkouts } from '../../hooks/useWorkouts'
import { useT } from '../../contexts/LocaleContext'

const TONE_COLOR: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'var(--color-good)',
  bad: 'var(--color-bad)',
  neutral: 'var(--color-muted)',
}

export default function WorkoutsList({ onOpen }: { onOpen: (key: string) => void }) {
  const t = useT()
  const { data, isLoading, isError } = useWorkouts()

  if (isLoading) return <div style={{ color: 'var(--color-muted)' }}>{t('loading')}</div>
  if (isError) return <div style={{ color: 'var(--color-bad)' }}>{t('workouts_not_found')}</div>
  if (!data || data.length === 0) {
    return (
      <div className="rounded-[14px] p-6" style={{ border: '1px dashed var(--color-rule)', color: 'var(--color-ink-2)' }}>
        {t('workouts_empty')}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-[22px]" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic', color: 'var(--color-ink)' }}>
        {t('workouts_title')}
      </h1>
      {data.map((w) => {
        // sparkline of the first trend that has ≥2 points (efficiency preferred)
        return (
          <button
            key={w.key}
            type="button"
            onClick={() => onOpen(w.key)}
            className="text-left rounded-[14px] p-4 flex items-center gap-4 transition-transform hover:-translate-y-[1px]"
            style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}
          >
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ fontSize: 15, color: 'var(--color-ink)' }}>{w.title}</div>
              <div className="num-mono" style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                {w.count}{t('workouts_times')} · {w.first_date} → {w.last_date}
              </div>
            </div>
            <span className="num-mono whitespace-nowrap" style={{ fontSize: 13, color: TONE_COLOR[w.headline.tone] }}>
              {w.headline.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create WorkoutDetail**

Create `frontend/src/components/workouts/WorkoutDetail.tsx`:

```tsx
import { ArrowLeft } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useWorkout } from '../../hooks/useWorkouts'
import { useT } from '../../contexts/LocaleContext'

const METRIC_LABEL: Record<string, string> = {
  efficiency: 'workouts_metric_efficiency',
  avg_power: 'workouts_metric_avg_power',
  np: 'workouts_metric_np',
  avg_hr: 'workouts_metric_avg_hr',
  pace: 'workouts_metric_pace',
  tss: 'workouts_metric_tss',
}

export default function WorkoutDetail({ workoutKey, onBack }: { workoutKey: string; onBack: () => void }) {
  const t = useT()
  const { data, isLoading, isError } = useWorkout(workoutKey)

  return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-2 text-[13px] self-start" style={{ color: 'var(--color-ink-2)' }}>
        <ArrowLeft size={14} strokeWidth={2} /> {t('workouts_back')}
      </button>

      {isLoading && <div style={{ color: 'var(--color-muted)' }}>{t('loading')}</div>}
      {isError && <div style={{ color: 'var(--color-bad)' }}>{t('workouts_not_found')}</div>}

      {data && (
        <>
          <h1 className="text-[24px]" style={{ fontFamily: '"Fraunces", serif', fontStyle: 'italic', color: 'var(--color-ink)' }}>
            {data.title}
          </h1>

          <div className="grid gap-4 md:grid-cols-2">
            {data.trends.filter((tr) => tr.series.length >= 2).map((tr) => (
              <div key={tr.metric} className="rounded-[14px] p-4" style={{ backgroundColor: 'var(--color-paper-2)', border: '1px solid var(--color-rule)' }}>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="eyebrow" style={{ color: 'var(--color-muted)', fontSize: 10 }}>{t(METRIC_LABEL[tr.metric] ?? tr.metric)}</span>
                  {tr.pct != null && (
                    <span className="num-mono" style={{ fontSize: 12, color: tr.improving ? 'var(--color-good)' : 'var(--color-bad)' }}>
                      {tr.pct > 0 ? '+' : ''}{tr.pct}%
                    </span>
                  )}
                </div>
                <div style={{ height: 120 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={tr.series.map((v, i) => ({ i, v }))}>
                      <XAxis dataKey="i" hide />
                      <YAxis domain={['dataMin', 'dataMax']} hide />
                      <Tooltip formatter={(v: number) => v} labelFormatter={() => ''} />
                      <Line type="monotone" dataKey="v" stroke="var(--color-forest-2)" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>

          {/* Per-rep table */}
          <div className="rounded-[14px] overflow-x-auto" style={{ border: '1px solid var(--color-rule)' }}>
            <table className="w-full num-mono" style={{ fontSize: 12, color: 'var(--color-ink-2)' }}>
              <thead>
                <tr style={{ color: 'var(--color-muted)' }}>
                  {['Date', 'Power', 'NP', 'HR', 'EF', 'Pace', 'TSS'].map((h) => (
                    <th key={h} className="text-left px-3 py-2">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reps.map((r) => (
                  <tr key={r.activity_id} style={{ borderTop: '1px solid var(--color-rule)' }}>
                    <td className="px-3 py-2">{r.date}</td>
                    <td className="px-3 py-2">{r.avg_power ?? '—'}</td>
                    <td className="px-3 py-2">{r.normalized_power ?? '—'}</td>
                    <td className="px-3 py-2">{r.avg_hr ?? '—'}</td>
                    <td className="px-3 py-2">{r.efficiency_factor ?? '—'}</td>
                    <td className="px-3 py-2">{r.pace_s_per_km ? `${Math.floor(r.pace_s_per_km / 60)}:${String(Math.round(r.pace_s_per_km % 60)).padStart(2, '0')}` : '—'}</td>
                    <td className="px-3 py-2">{r.tss ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create WorkoutsTab**

Create `frontend/src/components/dashboard/tabs/WorkoutsTab.tsx`:

```tsx
import { useState } from 'react'
import WorkoutsList from '../../workouts/WorkoutsList'
import WorkoutDetail from '../../workouts/WorkoutDetail'

export default function WorkoutsTab() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  return selectedKey === null ? (
    <WorkoutsList onOpen={setSelectedKey} />
  ) : (
    <WorkoutDetail workoutKey={selectedKey} onBack={() => setSelectedKey(null)} />
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "WorkoutsList|WorkoutDetail|WorkoutsTab" || echo "no new type errors"`
Expected: `no new type errors`. (`t('loading')` is an existing key — `strings.ts:299`.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/workouts/WorkoutsList.tsx frontend/src/components/workouts/WorkoutDetail.tsx frontend/src/components/dashboard/tabs/WorkoutsTab.tsx frontend/src/i18n/strings.ts
git commit -m "feat(workouts): Workouts list + detail view"
```

---

## Task 5: Wire the Workouts tab + live verification

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Modify: `frontend/src/components/dashboard/MobileBottomNav.tsx`

**Interfaces:**
- Consumes: `WorkoutsTab` (Task 4).

- [ ] **Step 1: Wire DashboardPage**

In `frontend/src/pages/DashboardPage.tsx`:

Add the import with the other tab imports:
```tsx
import WorkoutsTab from '../components/dashboard/tabs/WorkoutsTab'
```

Change the `TabId` type to include workouts:
```tsx
type TabId = 'today' | 'train' | 'analyze' | 'workouts' | 'crew'
```

In `resolveTab`, add a case before `default`:
```tsx
    case 'workouts': return 'workouts'
```

Add to the `tabs` array (after `analyze`, before `crew`):
```tsx
    { id: 'workouts', label: t('tab_workouts') },
```

Add to the `tabContent` switch:
```tsx
      case 'workouts': return <WorkoutsTab />
```

- [ ] **Step 2: Wire MobileBottomNav**

In `frontend/src/components/dashboard/MobileBottomNav.tsx`:

Change the `TabId` type to include workouts:
```tsx
type TabId = 'today' | 'train' | 'analyze' | 'workouts' | 'crew'
```

Add an icon import to the existing `lucide-react` import line (e.g. `Repeat`):
```tsx
import { Sun, CalendarDays, BarChart3, Repeat, Users } from 'lucide-react'
```
(Keep whatever icons are already imported; add `Repeat`.)

Add to the `TABS` array (after `analyze`, before `crew`), and widen the `labelKey` union to include `'tab_workouts'`:
```tsx
  { id: 'workouts', labelKey: 'tab_workouts', icon: <Repeat size={20} strokeWidth={1.8} /> },
```

In `resolveActive`, add before the final `return 'today'`:
```tsx
  if (raw === 'workouts') return 'workouts'
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -E "DashboardPage|MobileBottomNav" || echo "no new type errors"`
Expected: `no new type errors`

- [ ] **Step 4: Live verification (Playwright, against the running app)**

Dev servers running (backend :8042 restarted to load the new `/workouts` router; vite :5173; Postgres up). Steps:
1. Restart the backend so the new router loads: kill the uvicorn on :8042 and relaunch `.venv/bin/uvicorn app.main:app --port 8042`.
2. Navigate to `http://localhost:5173/dashboard?tab=workouts`.
3. Expect the **Workouts** tab present in the nav and a list of repeated workouts (the seeded data has e.g. "Zwift - Aerobic Foundation Forge" ×4, "ROUVY - IRONMAN 70.3 Knokke-Heist" ×3) — each card shows "N× done", a date range, and a headline delta.
4. Click a card → the detail shows trend charts (efficiency/power/HR/pace/TSS as available) and a per-rep table ordered oldest→newest.
5. Confirm a workout done only once never appears in the list.
6. No console errors.

Expected: all checks pass; capture a screenshot of the list and one detail.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx frontend/src/components/dashboard/MobileBottomNav.tsx
git commit -m "feat(workouts): add Workouts tab to dashboard nav"
```

---

## Self-Review Notes

- **Spec coverage:** normalize_title grouping (Task 1); per-rep metrics incl. efficiency factor + pace (Task 1); trends with direction-aware `improving` + headline priority (Task 1); `GET /workouts` (count ≥ 2, sorted) + `GET /workouts/{key}` (404 < 2) (Task 2); data layer (Task 3); list + detail view with the four metric families + per-rep table (Task 4); new Workouts tab in both nav surfaces, localized (Tasks 4–5). Decoupling explicitly deferred (spec non-goal) — efficiency-factor trend stands in. No migration (reads existing activities).
- **Type consistency:** `list_workout_groups`/`get_workout_group` signatures, `WorkoutGroupSummary`/`WorkoutGroupDetail`/`WorkoutRep`/`WorkoutTrend`/`Headline` field names match across schema, service, API, and the TS interfaces (snake_case preserved over the wire). `useWorkout(key: string | null)` gates on `enabled`.
- **Nav:** `TabId` union widened identically in `DashboardPage` and `MobileBottomNav`; `tab_workouts` label added to `strings.ts` (Task 4) before the nav references it (Task 5). `t('loading')` is a pre-existing key (`strings.ts:299`).
