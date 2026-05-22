# App Structure Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the AI Cycling Coach app from content-based tabs (`Today/Train/Trends/Crew`) to moment-based tabs (`Today/Ride/Progress/Coach`), add an Easy/Pro experience level with per-section overrides, introduce a Sunday-planning ritual, and ship two new Pro-only metrics (Durability + Aerobic Decoupling).

**Architecture:** Backend additions are small: three columns on `athlete_profiles`, one new table `week_intentions`, two new GET endpoints. Frontend is a navigation rename + tab reshuffle, three new tab containers (`RideTab`, `ProgressTab` replacing `TrendsTab`, refreshed `CoachTab`), and ~7 new components. Experience level lives in a React context provider that wraps the app and reads from `useAthleteProfile()`; existing components branch on it.

**Tech Stack:** Backend — FastAPI, SQLAlchemy 2.0 (declarative `Mapped[]` style), pytest. Frontend — React 18, react-router-dom, TanStack Query (existing), Vite. Migrations: raw SQL files (no Alembic detected) — schema changes ship as SQL files in `backend/migrations/` plus the SQLAlchemy model update.

---

## File Structure

### Backend — new files
- `backend/migrations/2026_05_22_experience_level.sql` — adds `experience_level`, `goal_text`, `display_overrides` to `athlete_profiles`.
- `backend/migrations/2026_05_22_week_intentions.sql` — new `week_intentions` table.
- `backend/app/models/week_intention.py` — SQLAlchemy model.
- `backend/app/schemas/week_intention.py` — Pydantic schemas.
- `backend/app/api/week_intentions.py` — CRUD endpoints.
- `backend/app/services/durability.py` — power-decay computation.
- `backend/app/services/aerobic_decoupling.py` — HR-drift-vs-power computation.
- `backend/app/api/progress_metrics.py` — `GET /api/progress/durability`, `GET /api/progress/decoupling`.
- `backend/tests/test_week_intentions.py`
- `backend/tests/test_durability.py`
- `backend/tests/test_aerobic_decoupling.py`
- `backend/tests/test_progress_metrics_api.py`

### Backend — modified
- `backend/app/models/athlete_profile.py` — add three columns.
- `backend/app/schemas/athlete_profile.py` (or equivalent) — surface new fields in read/update schemas.
- `backend/app/main.py` (or router registration file) — register new routers.

### Frontend — new files
- `frontend/src/contexts/ExperienceLevelContext.tsx` — provider exposing `level`, `goal`, `overrides`, `effectiveDepth(section)`.
- `frontend/src/components/dashboard/tabs/RideTab.tsx` — pre/post/rest state machine.
- `frontend/src/components/dashboard/tabs/ProgressTab.tsx` — replaces `TrendsTab` semantically.
- `frontend/src/components/dashboard/tabs/CoachTab.tsx` — wraps `CoachChat` + Sunday-mode entrypoint.
- `frontend/src/components/dashboard/ContributorsSheet.tsx` — drawer from `ReadinessHero` tap.
- `frontend/src/components/dashboard/RideRestDayPanel.tsx` — Ride-tab rest state.
- `frontend/src/components/dashboard/WhatGotBetter.tsx` — Easy-mode Progress identity recap.
- `frontend/src/components/dashboard/DurabilityTrend.tsx` — Pro-mode Progress section.
- `frontend/src/components/dashboard/AerobicDecouplingTrend.tsx` — Pro-mode Progress section.
- `frontend/src/components/dashboard/SundayPlanFlow.tsx` — 3-step flow in Coach tab.
- `frontend/src/components/dashboard/TomorrowChip.tsx` — small chip replacing `TomorrowCard` in Today.
- `frontend/src/hooks/useExperienceLevel.ts` — convenience hook.
- `frontend/src/hooks/useWeekIntentions.ts` — CRUD hooks.
- `frontend/src/hooks/useDurability.ts`, `useAerobicDecoupling.ts`
- `frontend/src/pages/CrewPage.tsx` — full `/crew` page (CrewStrip lifts content here).
- Test files mirror component locations (existing test infra patterns).

### Frontend — modified
- `frontend/src/App.tsx` — wrap with `ExperienceLevelProvider`, add `/crew` route.
- `frontend/src/pages/DashboardPage.tsx` — replace `TrainTab`/`WeekTab` references with `RideTab`, `TrendsTab` with `ProgressTab`, `CrewTab` removed from main tabs.
- `frontend/src/components/dashboard/MobileBottomNav.tsx` — tab IDs change: `today / ride / progress / coach`.
- `frontend/src/components/dashboard/tabs/TodayTab.tsx` — remove polarized/last-week/PMC; add `CrewStrip` (lift from existing `CrewTab`), swap `TomorrowCard` → `TomorrowChip`, wire Contributors-Sheet trigger.
- `frontend/src/components/dashboard/ReadinessHero.tsx` — add `onContributorsTap` prop.
- `frontend/src/pages/ProfileSetupPage.tsx` — append two new questions (Goal text + experience level).
- `frontend/src/pages/SettingsPage.tsx` — add "Display depth" section with per-section toggles.
- `frontend/src/i18n/*` — new strings for tab labels, Easy/Pro variants, Sunday-mode copy.

### Frontend — retired
- `frontend/src/components/dashboard/DashboardTabs.tsx` — no longer used.
- `frontend/src/components/dashboard/tabs/TrendsTab.tsx` — replaced by `ProgressTab`.
- `frontend/src/components/dashboard/tabs/CrewTab.tsx` — content moves to `CrewPage`.
- `frontend/src/components/dashboard/tabs/PlanTab.tsx`, `BikeTab.tsx`, `RunTab.tsx`, `SportTab.tsx`, `WeekTab.tsx` — were already legacy or used only by old structure; verify no remaining imports and delete.
- `frontend/src/components/dashboard/TomorrowCard.tsx` — superseded by `TomorrowChip`.

---

## Task Sequence Overview

| Phase | Tasks | Goal |
|---|---|---|
| 1. Backend schema | 1–4 | `experience_level`, `goal_text`, `display_overrides`, `week_intentions` |
| 2. Backend services | 5–7 | Durability + Decoupling computation + endpoints |
| 3. Frontend foundations | 8–10 | Experience-level context, hooks, i18n strings |
| 4. Navigation | 11–13 | Tab rename, `/crew` route, mobile nav |
| 5. Today refresh | 14–16 | CrewStrip, TomorrowChip, Contributors-Sheet |
| 6. Ride tab | 17–19 | Pre / Post / Rest states |
| 7. Progress tab | 20–24 | Recap + WhatGotBetter + Body + (Pro) Form/Durability/Decoupling |
| 8. Coach tab + Sunday | 25–27 | Coach surface + SundayPlanFlow + week-intention persistence |
| 9. Onboarding + Settings | 28–30 | New onboarding questions + Display Depth panel |
| 10. Cleanup | 31–32 | Delete retired components, verify no orphan imports |

---

## Phase 1 — Backend Schema

### Task 1: Add experience_level columns to athlete_profiles

**Files:**
- Create: `backend/migrations/2026_05_22_experience_level.sql`
- Modify: `backend/app/models/athlete_profile.py`
- Modify: `backend/app/schemas/athlete_profile.py` (or wherever the read schema is)
- Test: `backend/tests/test_athlete_profile_experience_level.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_athlete_profile_experience_level.py
from app.models.athlete_profile import AthleteProfile

def test_experience_level_defaults_to_easy(db_session, user_factory):
    user = user_factory()
    profile = AthleteProfile(user_id=user.id)
    db_session.add(profile); db_session.commit(); db_session.refresh(profile)
    assert profile.experience_level == "easy"
    assert profile.goal_text is None
    assert profile.display_overrides == {}

def test_experience_level_accepts_pro(db_session, user_factory):
    user = user_factory()
    profile = AthleteProfile(user_id=user.id, experience_level="pro",
                             goal_text="FTP +20W by August",
                             display_overrides={"form": "pro", "body": "easy"})
    db_session.add(profile); db_session.commit(); db_session.refresh(profile)
    assert profile.experience_level == "pro"
    assert profile.goal_text == "FTP +20W by August"
    assert profile.display_overrides["form"] == "pro"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_athlete_profile_experience_level.py -v`
Expected: FAIL with attribute error on `experience_level`.

- [ ] **Step 3: Write the SQL migration**

```sql
-- backend/migrations/2026_05_22_experience_level.sql
ALTER TABLE athlete_profiles
  ADD COLUMN experience_level VARCHAR(8) NOT NULL DEFAULT 'easy'
    CHECK (experience_level IN ('easy', 'pro')),
  ADD COLUMN goal_text TEXT,
  ADD COLUMN display_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
```

- [ ] **Step 4: Update the SQLAlchemy model**

Add inside `AthleteProfile` (after `injury_note`):

```python
# Experience-level — controls Easy/Pro presentation across the app.
experience_level: Mapped[str] = mapped_column(
    String(8), nullable=False, server_default="easy", default="easy"
)
goal_text: Mapped[str | None] = mapped_column(Text, nullable=True)
display_overrides: Mapped[dict] = mapped_column(
    JSON, nullable=False, server_default="{}", default=dict
)
```

- [ ] **Step 5: Update the read/update Pydantic schemas**

In `backend/app/schemas/athlete_profile.py`, add `experience_level: Literal["easy","pro"] = "easy"`, `goal_text: str | None = None`, `display_overrides: dict[str, str] = Field(default_factory=dict)` to both `AthleteProfileRead` and `AthleteProfileUpdate`.

- [ ] **Step 6: Apply migration locally**

```bash
cd backend && psql $DATABASE_URL -f migrations/2026_05_22_experience_level.sql
```

Expected: `ALTER TABLE` succeeds.

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && pytest tests/test_athlete_profile_experience_level.py -v`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/migrations/2026_05_22_experience_level.sql \
        backend/app/models/athlete_profile.py \
        backend/app/schemas/athlete_profile.py \
        backend/tests/test_athlete_profile_experience_level.py
git commit -m "feat(athlete-profile): add experience_level, goal_text, display_overrides"
```

### Task 2: Surface new fields via athlete-profile API

**Files:**
- Modify: `backend/app/api/athletes.py` (or wherever profile read/update endpoints live)
- Test: `backend/tests/test_athletes_api_experience_level.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_athletes_api_experience_level.py
def test_get_profile_returns_experience_level(auth_client, athlete_profile):
    r = auth_client.get("/api/athletes/me/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["experience_level"] == "easy"
    assert body["goal_text"] is None
    assert body["display_overrides"] == {}

def test_patch_profile_updates_experience_level(auth_client):
    r = auth_client.patch("/api/athletes/me/profile",
                          json={"experience_level": "pro",
                                "goal_text": "Sub-3h century",
                                "display_overrides": {"form": "pro"}})
    assert r.status_code == 200
    assert r.json()["experience_level"] == "pro"
    assert r.json()["display_overrides"] == {"form": "pro"}

def test_patch_rejects_invalid_experience_level(auth_client):
    r = auth_client.patch("/api/athletes/me/profile",
                          json={"experience_level": "godmode"})
    assert r.status_code == 422
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_athletes_api_experience_level.py -v`
Expected: at least the 422 test fails (no validation on the field) — or all pass if `AthleteProfileUpdate` already passes through. Adjust handler to copy the three new fields explicitly if needed.

- [ ] **Step 3: Implement / verify the handler**

Locate the `PATCH /api/athletes/me/profile` handler. Ensure the request body is parsed with `AthleteProfileUpdate` (added in Task 1 Step 5) and the three new fields are copied with `setattr`. Add `Literal["easy", "pro"]` in the schema to enforce the 422 case.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_athletes_api_experience_level.py -v`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/athletes.py backend/app/schemas/athlete_profile.py \
        backend/tests/test_athletes_api_experience_level.py
git commit -m "feat(athletes-api): expose experience_level / goal_text / display_overrides"
```

### Task 3: week_intentions table + model

**Files:**
- Create: `backend/migrations/2026_05_22_week_intentions.sql`
- Create: `backend/app/models/week_intention.py`
- Test: `backend/tests/test_week_intention_model.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_week_intention_model.py
from datetime import date, datetime, timezone
from app.models.week_intention import WeekIntention

def test_week_intention_create(db_session, user_factory):
    user = user_factory()
    intent = WeekIntention(
        user_id=user.id, iso_week="2026-W21",
        text="Wednesday Z2 60min",
        target_day=date(2026, 5, 27),
    )
    db_session.add(intent); db_session.commit(); db_session.refresh(intent)
    assert intent.id is not None
    assert intent.completed_at is None
    assert intent.created_at is not None

def test_unique_per_user_per_week(db_session, user_factory):
    user = user_factory()
    db_session.add(WeekIntention(user_id=user.id, iso_week="2026-W21", text="A"))
    db_session.commit()
    db_session.add(WeekIntention(user_id=user.id, iso_week="2026-W21", text="B"))
    import pytest
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        db_session.commit()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_week_intention_model.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the migration**

```sql
-- backend/migrations/2026_05_22_week_intentions.sql
CREATE TABLE week_intentions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iso_week VARCHAR(8) NOT NULL,           -- "YYYY-Www"
  text TEXT NOT NULL,
  target_day DATE,
  target_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (user_id, iso_week)
);
CREATE INDEX idx_week_intentions_user_week ON week_intentions(user_id, iso_week);
```

- [ ] **Step 4: Write the model**

```python
# backend/app/models/week_intention.py
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, Time, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WeekIntention(Base):
    __tablename__ = "week_intentions"
    __table_args__ = (UniqueConstraint("user_id", "iso_week", name="uq_week_intentions_user_week"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    iso_week: Mapped[str] = mapped_column(String(8), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    target_day: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 5: Apply migration**

```bash
cd backend && psql $DATABASE_URL -f migrations/2026_05_22_week_intentions.sql
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && pytest tests/test_week_intention_model.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/migrations/2026_05_22_week_intentions.sql \
        backend/app/models/week_intention.py \
        backend/tests/test_week_intention_model.py
git commit -m "feat(db): add week_intentions table for Sunday-planning ritual"
```

### Task 4: week_intentions CRUD endpoints

**Files:**
- Create: `backend/app/schemas/week_intention.py`
- Create: `backend/app/api/week_intentions.py`
- Modify: `backend/app/main.py` (router registration)
- Test: `backend/tests/test_week_intentions_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_week_intentions_api.py
def test_get_current_week_empty(auth_client):
    r = auth_client.get("/api/week-intentions/current")
    assert r.status_code == 200
    assert r.json() is None

def test_create_intention(auth_client):
    r = auth_client.post("/api/week-intentions",
                         json={"iso_week": "2026-W21", "text": "Z2 Wednesday 18:00",
                               "target_day": "2026-05-27", "target_time": "18:00:00"})
    assert r.status_code == 201
    body = r.json()
    assert body["text"] == "Z2 Wednesday 18:00"
    assert body["completed_at"] is None

def test_create_duplicate_returns_409(auth_client):
    auth_client.post("/api/week-intentions",
                     json={"iso_week": "2026-W21", "text": "A"})
    r = auth_client.post("/api/week-intentions",
                         json={"iso_week": "2026-W21", "text": "B"})
    assert r.status_code == 409

def test_mark_completed(auth_client):
    created = auth_client.post("/api/week-intentions",
                               json={"iso_week": "2026-W21", "text": "A"}).json()
    r = auth_client.post(f"/api/week-intentions/{created['id']}/complete")
    assert r.status_code == 200
    assert r.json()["completed_at"] is not None
```

- [ ] **Step 2: Write the schema**

```python
# backend/app/schemas/week_intention.py
from datetime import date, datetime, time
from pydantic import BaseModel, Field

class WeekIntentionCreate(BaseModel):
    iso_week: str = Field(pattern=r"^\d{4}-W\d{2}$")
    text: str = Field(min_length=1, max_length=500)
    target_day: date | None = None
    target_time: time | None = None

class WeekIntentionRead(BaseModel):
    id: int
    iso_week: str
    text: str
    target_day: date | None
    target_time: time | None
    created_at: datetime
    completed_at: datetime | None
    class Config: from_attributes = True
```

- [ ] **Step 3: Write the router**

```python
# backend/app/api/week_intentions.py
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app.dependencies import get_current_user      # adapt to actual auth import
from app.models.user import User
from app.models.week_intention import WeekIntention
from app.schemas.week_intention import WeekIntentionCreate, WeekIntentionRead

router = APIRouter(prefix="/api/week-intentions", tags=["week-intentions"])


def _current_iso_week() -> str:
    today = datetime.now(timezone.utc).date()
    yr, wk, _ = today.isocalendar()
    return f"{yr}-W{wk:02d}"


@router.get("/current", response_model=WeekIntentionRead | None)
def get_current(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (db.query(WeekIntention)
              .filter_by(user_id=user.id, iso_week=_current_iso_week())
              .one_or_none())


@router.post("", response_model=WeekIntentionRead, status_code=201)
def create(body: WeekIntentionCreate,
           user: User = Depends(get_current_user),
           db: Session = Depends(get_db)):
    intent = WeekIntention(user_id=user.id, **body.model_dump())
    db.add(intent)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "intention already exists for this week")
    db.refresh(intent)
    return intent


@router.post("/{intention_id}/complete", response_model=WeekIntentionRead)
def complete(intention_id: int,
             user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    intent = (db.query(WeekIntention)
                .filter_by(id=intention_id, user_id=user.id).one_or_none())
    if not intent:
        raise HTTPException(404)
    intent.completed_at = datetime.now(timezone.utc)
    db.commit(); db.refresh(intent)
    return intent
```

- [ ] **Step 4: Register the router**

In `backend/app/main.py`, add `from app.api import week_intentions` and `app.include_router(week_intentions.router)`.

- [ ] **Step 5: Run tests**

Run: `cd backend && pytest tests/test_week_intentions_api.py -v`
Expected: PASS (all four).

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/week_intention.py backend/app/api/week_intentions.py \
        backend/app/main.py backend/tests/test_week_intentions_api.py
git commit -m "feat(api): week_intentions CRUD endpoints"
```

---

## Phase 2 — Backend Pro Metrics

### Task 5: Durability computation service

**Files:**
- Create: `backend/app/services/durability.py`
- Test: `backend/tests/test_durability.py`

**Definition:** Durability score for a ride = `mean_power_last_30min / mean_power_first_30min`, **only for rides ≥90 min** with power data, normalized to matched intensity (we require both windows to be within Z2/Z3 — HR < threshold). Return a per-ride record `(activity_id, date, score, sample_count_first, sample_count_last)` and a smoothed 6-ride moving average for trend display.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_durability.py
from datetime import date
from app.services.durability import compute_durability_for_activity, durability_trend

def test_returns_none_for_short_ride():
    streams = {"power": [200]*60*30, "heart_rate": [130]*60*30, "time": list(range(60*30))}
    assert compute_durability_for_activity(activity_id=1, ride_date=date(2026,5,1),
                                           streams=streams, ftp=250, lthr=160) is None

def test_returns_none_without_power():
    streams = {"heart_rate": [130]*60*120, "time": list(range(60*120))}
    assert compute_durability_for_activity(activity_id=1, ride_date=date(2026,5,1),
                                           streams=streams, ftp=250, lthr=160) is None

def test_perfectly_durable_ride_scores_1():
    # 120 min ride, constant 200W, HR in Z2
    n = 60*120
    streams = {"power": [200]*n, "heart_rate": [130]*n, "time": list(range(n))}
    r = compute_durability_for_activity(activity_id=1, ride_date=date(2026,5,1),
                                        streams=streams, ftp=250, lthr=160)
    assert r is not None
    assert abs(r["score"] - 1.0) < 0.01

def test_fading_ride_scores_below_1():
    n = 60*120
    power = [220]*(n//2) + [180]*(n//2)
    streams = {"power": power, "heart_rate": [130]*n, "time": list(range(n))}
    r = compute_durability_for_activity(1, date(2026,5,1), streams, ftp=250, lthr=160)
    assert r is not None
    assert 0.7 < r["score"] < 0.9

def test_trend_returns_rolling_average():
    rides = [{"activity_id": i, "date": date(2026,5,i), "score": s,
              "sample_count_first": 1800, "sample_count_last": 1800}
             for i, s in enumerate([1.0, 0.95, 0.92, 0.90, 0.88, 0.85, 0.83], start=1)]
    trend = durability_trend(rides, window=6)
    assert len(trend) == len(rides)
    assert abs(trend[-1]["smoothed"] - sum(r["score"] for r in rides[1:7]) / 6) < 0.001
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_durability.py -v`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```python
# backend/app/services/durability.py
from datetime import date
from typing import Optional

WINDOW_SEC = 30 * 60  # 30 minutes

def compute_durability_for_activity(
    *, activity_id: int, ride_date: date,
    streams: dict, ftp: int, lthr: int,
) -> Optional[dict]:
    """Power decay between the first and last 30 minutes of rides ≥90 min."""
    power = streams.get("power")
    hr = streams.get("heart_rate")
    if not power or not hr:
        return None
    if len(power) < 90 * 60:           # <90min
        return None
    first = power[:WINDOW_SEC]
    last = power[-WINDOW_SEC:]
    hr_first = hr[:WINDOW_SEC]
    hr_last = hr[-WINDOW_SEC:]
    # Require both windows in Z2/Z3 (HR < LTHR) to ensure intensity match.
    if any(h >= lthr for h in hr_first) or any(h >= lthr for h in hr_last):
        return None
    mean_first = sum(first) / len(first)
    mean_last = sum(last) / len(last)
    if mean_first <= 0:
        return None
    return {
        "activity_id": activity_id,
        "date": ride_date,
        "score": mean_last / mean_first,
        "sample_count_first": len(first),
        "sample_count_last": len(last),
    }


def durability_trend(rides: list[dict], window: int = 6) -> list[dict]:
    """Append a rolling-mean `smoothed` field to each ride record."""
    out: list[dict] = []
    for i, r in enumerate(rides):
        window_slice = rides[max(0, i - window + 1): i + 1]
        smoothed = sum(x["score"] for x in window_slice) / len(window_slice)
        out.append({**r, "smoothed": smoothed})
    return out
```

- [ ] **Step 4: Run tests**

Run: `cd backend && pytest tests/test_durability.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/durability.py backend/tests/test_durability.py
git commit -m "feat(services): durability score and trend"
```

### Task 6: Aerobic Decoupling computation service

**Files:**
- Create: `backend/app/services/aerobic_decoupling.py`
- Test: `backend/tests/test_aerobic_decoupling.py`

**Definition:** Decoupling = `(HR/Power)_secondHalf / (HR/Power)_firstHalf - 1`. Only Z2 rides ≥60 min where mean HR < LTHR throughout. <5 % is "well-coupled", 5–10 % "moderate decoupling", >10 % "poor durability".

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_aerobic_decoupling.py
from datetime import date
from app.services.aerobic_decoupling import compute_decoupling

def test_short_ride_returns_none():
    streams = {"power":[200]*60*30,"heart_rate":[130]*60*30,"time":list(range(60*30))}
    assert compute_decoupling(activity_id=1, ride_date=date(2026,5,1),
                              streams=streams, lthr=160) is None

def test_above_threshold_returns_none():
    n = 60*70
    streams = {"power":[200]*n, "heart_rate":[170]*n, "time":list(range(n))}
    assert compute_decoupling(1, date(2026,5,1), streams, lthr=160) is None

def test_coupled_ride_returns_near_zero():
    n = 60*70
    streams = {"power":[200]*n, "heart_rate":[130]*n, "time":list(range(n))}
    r = compute_decoupling(1, date(2026,5,1), streams, lthr=160)
    assert r is not None
    assert abs(r["pct"]) < 0.5

def test_decoupling_detects_drift():
    n = 60*70
    hr = [125]*(n//2) + [140]*(n//2)
    streams = {"power":[200]*n, "heart_rate":hr, "time":list(range(n))}
    r = compute_decoupling(1, date(2026,5,1), streams, lthr=160)
    assert r is not None
    assert r["pct"] > 8.0       # ~ +12 %
    assert r["bucket"] == "moderate"
```

- [ ] **Step 2: Implement**

```python
# backend/app/services/aerobic_decoupling.py
from datetime import date
from typing import Optional

MIN_DURATION_SEC = 60 * 60   # 60 min minimum


def _bucket(pct: float) -> str:
    if pct < 5.0:  return "good"
    if pct < 10.0: return "moderate"
    return "poor"


def compute_decoupling(
    *, activity_id: int, ride_date: date, streams: dict, lthr: int,
) -> Optional[dict]:
    power = streams.get("power"); hr = streams.get("heart_rate")
    if not power or not hr or len(power) < MIN_DURATION_SEC:
        return None
    if any(h >= lthr for h in hr):
        return None
    half = len(power) // 2
    def ratio(p, h):
        mean_p = sum(p) / len(p)
        if mean_p <= 0: return None
        return (sum(h) / len(h)) / mean_p
    r1 = ratio(power[:half], hr[:half])
    r2 = ratio(power[half:], hr[half:])
    if r1 is None or r2 is None or r1 == 0:
        return None
    pct = (r2 / r1 - 1.0) * 100.0
    return {"activity_id": activity_id, "date": ride_date,
            "pct": pct, "bucket": _bucket(abs(pct))}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd backend && pytest tests/test_aerobic_decoupling.py -v
git add backend/app/services/aerobic_decoupling.py backend/tests/test_aerobic_decoupling.py
git commit -m "feat(services): aerobic decoupling computation"
```

### Task 7: Progress-metrics API endpoints

**Files:**
- Create: `backend/app/api/progress_metrics.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_progress_metrics_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_progress_metrics_api.py
def test_durability_endpoint_returns_empty_when_no_rides(auth_client):
    r = auth_client.get("/api/progress/durability")
    assert r.status_code == 200
    assert r.json() == {"rides": [], "trend": []}

def test_durability_endpoint_includes_qualifying_rides(auth_client, activity_factory):
    activity_factory(duration_min=120, mean_power=200, mean_hr=130,
                     decay_pct=0.0)  # adapt to actual factory
    r = auth_client.get("/api/progress/durability")
    body = r.json()
    assert len(body["rides"]) == 1
    assert abs(body["rides"][0]["score"] - 1.0) < 0.05

def test_decoupling_endpoint(auth_client, activity_factory):
    activity_factory(duration_min=70, mean_power=200, mean_hr=130, drift_bpm=10)
    r = auth_client.get("/api/progress/decoupling")
    assert r.status_code == 200
    assert "rides" in r.json()
```

- [ ] **Step 2: Implement the router**

```python
# backend/app/api/progress_metrics.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.models.activity import Activity   # adapt to actual model name
from app.services.durability import compute_durability_for_activity, durability_trend
from app.services.aerobic_decoupling import compute_decoupling
from app.services.streams import load_streams  # adapt or inline

router = APIRouter(prefix="/api/progress", tags=["progress"])


def _athlete_thresholds(user: User) -> tuple[int, int]:
    p = user.athlete_profile
    return p.ftp_watts or 200, p.lthr_cycling or 160


@router.get("/durability")
def durability(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ftp, lthr = _athlete_thresholds(user)
    rides = (db.query(Activity).filter_by(user_id=user.id)
                .order_by(Activity.start_date.desc()).limit(60).all())
    out = []
    for a in rides:
        streams = load_streams(a)
        if not streams: continue
        r = compute_durability_for_activity(
            activity_id=a.id, ride_date=a.start_date.date(),
            streams=streams, ftp=ftp, lthr=lthr)
        if r: out.append(r)
    out.sort(key=lambda r: r["date"])
    return {"rides": out, "trend": durability_trend(out)}


@router.get("/decoupling")
def decoupling(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _, lthr = _athlete_thresholds(user)
    rides = (db.query(Activity).filter_by(user_id=user.id)
                .order_by(Activity.start_date.desc()).limit(60).all())
    out = []
    for a in rides:
        streams = load_streams(a)
        if not streams: continue
        r = compute_decoupling(activity_id=a.id, ride_date=a.start_date.date(),
                                streams=streams, lthr=lthr)
        if r: out.append(r)
    out.sort(key=lambda r: r["date"])
    return {"rides": out}
```

- [ ] **Step 3: Register router**

In `backend/app/main.py`: `from app.api import progress_metrics` + `app.include_router(progress_metrics.router)`.

- [ ] **Step 4: Run tests + commit**

```bash
cd backend && pytest tests/test_progress_metrics_api.py -v
git add backend/app/api/progress_metrics.py backend/app/main.py \
        backend/tests/test_progress_metrics_api.py
git commit -m "feat(api): progress/durability + progress/decoupling endpoints"
```

---

## Phase 3 — Frontend Foundations

### Task 8: ExperienceLevelContext + provider + hook

**Files:**
- Create: `frontend/src/contexts/ExperienceLevelContext.tsx`
- Create: `frontend/src/hooks/useExperienceLevel.ts`
- Modify: `frontend/src/App.tsx` (wrap with provider)
- Test: `frontend/src/contexts/ExperienceLevelContext.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/contexts/ExperienceLevelContext.test.tsx
import { render, screen } from '@testing-library/react'
import { ExperienceLevelProvider, useExperienceLevel } from './ExperienceLevelContext'

function Probe() {
  const { level, effectiveDepth } = useExperienceLevel()
  return <div>
    <span data-testid="lvl">{level}</span>
    <span data-testid="form">{effectiveDepth('form')}</span>
    <span data-testid="body">{effectiveDepth('body')}</span>
  </div>
}

test('default is easy across sections', () => {
  render(<ExperienceLevelProvider value={{ level: 'easy', goal: null, overrides: {} }}><Probe/></ExperienceLevelProvider>)
  expect(screen.getByTestId('lvl').textContent).toBe('easy')
  expect(screen.getByTestId('form').textContent).toBe('easy')
})

test('per-section override beats global', () => {
  render(<ExperienceLevelProvider value={{ level: 'easy', goal: null, overrides: { form: 'pro' } }}><Probe/></ExperienceLevelProvider>)
  expect(screen.getByTestId('form').textContent).toBe('pro')
  expect(screen.getByTestId('body').textContent).toBe('easy')
})

test('pro level applies to all sections without overrides', () => {
  render(<ExperienceLevelProvider value={{ level: 'pro', goal: null, overrides: {} }}><Probe/></ExperienceLevelProvider>)
  expect(screen.getByTestId('form').textContent).toBe('pro')
  expect(screen.getByTestId('body').textContent).toBe('pro')
})
```

- [ ] **Step 2: Implement context + provider**

```tsx
// frontend/src/contexts/ExperienceLevelContext.tsx
import { createContext, useContext, type ReactNode } from 'react'

export type Level = 'easy' | 'pro'
export type Section = 'form' | 'body' | 'workout_detail'

export interface ExperienceLevelValue {
  level: Level
  goal: string | null
  overrides: Partial<Record<Section, Level>>
}

interface ContextShape extends ExperienceLevelValue {
  effectiveDepth: (section: Section) => Level
}

const ExperienceLevelContext = createContext<ContextShape | null>(null)

export function ExperienceLevelProvider({
  value, children,
}: { value: ExperienceLevelValue; children: ReactNode }) {
  const effectiveDepth = (section: Section): Level =>
    value.overrides[section] ?? value.level
  return (
    <ExperienceLevelContext.Provider value={{ ...value, effectiveDepth }}>
      {children}
    </ExperienceLevelContext.Provider>
  )
}

export function useExperienceLevel(): ContextShape {
  const ctx = useContext(ExperienceLevelContext)
  if (!ctx) throw new Error('useExperienceLevel must be used within ExperienceLevelProvider')
  return ctx
}
```

- [ ] **Step 3: Implement convenience hook that reads from profile**

```ts
// frontend/src/hooks/useExperienceLevel.ts
import { useAthleteProfile } from './useAthleteProfile'
import type { ExperienceLevelValue, Level, Section } from '../contexts/ExperienceLevelContext'

export function useExperienceLevelFromProfile(): ExperienceLevelValue {
  const { data: profile } = useAthleteProfile()
  return {
    level: (profile?.experience_level ?? 'easy') as Level,
    goal: profile?.goal_text ?? null,
    overrides: (profile?.display_overrides ?? {}) as Partial<Record<Section, Level>>,
  }
}
```

- [ ] **Step 4: Wrap App with provider**

In `frontend/src/App.tsx`, after `AuthProvider` and inside `LocaleProvider`, add a wrapper component that reads profile and supplies the provider:

```tsx
import { ExperienceLevelProvider } from './contexts/ExperienceLevelContext'
import { useExperienceLevelFromProfile } from './hooks/useExperienceLevel'

function ExperienceLevelBridge({ children }: { children: React.ReactNode }) {
  const value = useExperienceLevelFromProfile()
  return <ExperienceLevelProvider value={value}>{children}</ExperienceLevelProvider>
}
```

Wrap `<Routes>...</Routes>` in `<ExperienceLevelBridge>`. Place inside `AuthProvider` so the profile fetch is authenticated.

- [ ] **Step 5: Run tests**

Run: `cd frontend && npm test -- ExperienceLevelContext`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/contexts/ExperienceLevelContext.tsx \
        frontend/src/hooks/useExperienceLevel.ts \
        frontend/src/App.tsx \
        frontend/src/contexts/ExperienceLevelContext.test.tsx
git commit -m "feat(frontend): ExperienceLevelProvider + useExperienceLevel hook"
```

### Task 9: Pro-metrics + week-intentions data hooks

**Files:**
- Create: `frontend/src/hooks/useWeekIntentions.ts`
- Create: `frontend/src/hooks/useDurability.ts`
- Create: `frontend/src/hooks/useAerobicDecoupling.ts`

- [ ] **Step 1: Implement hooks (no tests — thin TanStack wrappers)**

```ts
// frontend/src/hooks/useWeekIntentions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'   // adapt to project's fetch wrapper

export interface WeekIntention {
  id: number; iso_week: string; text: string
  target_day: string | null; target_time: string | null
  created_at: string; completed_at: string | null
}

export function useCurrentWeekIntention() {
  return useQuery<WeekIntention | null>({
    queryKey: ['week-intentions','current'],
    queryFn: () => api.get('/api/week-intentions/current').then(r => r.data),
  })
}

export function useCreateWeekIntention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Pick<WeekIntention,'iso_week'|'text'|'target_day'|'target_time'>) =>
      api.post('/api/week-intentions', body).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['week-intentions'] }),
  })
}

export function useCompleteWeekIntention() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/api/week-intentions/${id}/complete`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['week-intentions'] }),
  })
}
```

```ts
// frontend/src/hooks/useDurability.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export interface DurabilityRide {
  activity_id: number; date: string; score: number; smoothed?: number
}
export function useDurability() {
  return useQuery<{ rides: DurabilityRide[]; trend: DurabilityRide[] }>({
    queryKey: ['progress','durability'],
    queryFn: () => api.get('/api/progress/durability').then(r => r.data),
  })
}
```

```ts
// frontend/src/hooks/useAerobicDecoupling.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export interface DecouplingRide {
  activity_id: number; date: string; pct: number; bucket: 'good'|'moderate'|'poor'
}
export function useAerobicDecoupling() {
  return useQuery<{ rides: DecouplingRide[] }>({
    queryKey: ['progress','decoupling'],
    queryFn: () => api.get('/api/progress/decoupling').then(r => r.data),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/hooks/useWeekIntentions.ts \
        frontend/src/hooks/useDurability.ts \
        frontend/src/hooks/useAerobicDecoupling.ts
git commit -m "feat(frontend): data hooks for week intentions, durability, decoupling"
```

### Task 10: i18n strings for new copy

**Files:**
- Modify: `frontend/src/i18n/en.ts` (or equivalent)
- Modify: `frontend/src/i18n/de.ts`

- [ ] **Step 1: Add the new keys**

Add the following keys (EN + matching DE) — if existing structure is flat object, append; if nested by section, place appropriately.

```
tab_ride              "Ride"                       "Ride"
tab_progress          "Progress"                   "Form"
tab_coach             "Coach"                      "Coach"
ride_pre_title        "Today's workout"            "Heutiges Workout"
ride_post_title       "How that ride landed"       "So lief dein Ride"
ride_rest_title       "Today is rest"              "Heute ist Pause"
ride_rest_subtitle    "Recovery is the work"       "Erholung ist die Arbeit"
progress_this_week    "This week"                  "Diese Woche"
progress_what_better  "What got better"            "Was wurde besser"
progress_your_body    "Your body"                  "Dein Körper"
progress_form_fitness "Form & Fitness"             "Form & Fitness"
progress_durability   "Durability"                 "Durability"
progress_decoupling   "Aerobic Decoupling"         "Aerober Drift"
coach_sunday_title    "Plan next week"             "Nächste Woche planen"
coach_sunday_step1    "How was your week?"         "Wie lief deine Woche?"
coach_sunday_step2    "Here's what's coming"       "Das steht an"
coach_sunday_step3    "What's one ride you'll commit to?" "Welcher Ride ist sicher?"
verdict_explain_cta   "Why this verdict?"          "Warum dieses Verdict?"
contributors_title    "What shaped your verdict"   "Was dein Verdict prägt"
onboarding_goal_q     "What's your goal?"          "Was ist dein Ziel?"
onboarding_goal_ph    "e.g. first 100 km, FTP +20W" "z.B. erste 100 km, FTP +20 W"
onboarding_level_q    "How deep do you want to go on the data?" "Wie tief willst du in Daten einsteigen?"
onboarding_level_easy "Just ride"                  "Einfach fahren"
onboarding_level_pro  "Show me the metrics"        "Zeig mir die Zahlen"
settings_display_depth "Display depth"             "Anzeigetiefe"
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "i18n: strings for new tabs, Sunday-mode, Contributors-sheet, onboarding"
```

---

## Phase 4 — Navigation

### Task 11: Rename tabs in MobileBottomNav

**Files:**
- Modify: `frontend/src/components/dashboard/MobileBottomNav.tsx`

- [ ] **Step 1: Update tab definitions**

Replace the `TABS` array:

```tsx
import { Sun, Bike, LineChart, MessageCircle } from 'lucide-react'

type TabId = 'today' | 'ride' | 'progress' | 'coach'

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'today',    label: 'Today',    icon: <Sun size={20} strokeWidth={1.8} /> },
  { id: 'ride',     label: 'Ride',     icon: <Bike size={20} strokeWidth={1.8} /> },
  { id: 'progress', label: 'Progress', icon: <LineChart size={20} strokeWidth={1.8} /> },
  { id: 'coach',    label: 'Coach',    icon: <MessageCircle size={20} strokeWidth={1.8} /> },
]

function resolveActive(raw: string | null): TabId {
  if (raw === 'ride' || raw === 'train' || raw === 'week') return 'ride'
  if (raw === 'progress' || raw === 'trends') return 'progress'
  if (raw === 'coach') return 'coach'
  return 'today'
}
```

(The `train/week/trends` aliases preserve back-compat for any bookmarks/links.)

- [ ] **Step 2: Run typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: any errors are only from DashboardPage referring to old tab IDs (fixed in next task).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/MobileBottomNav.tsx
git commit -m "feat(nav): rename mobile tabs to today/ride/progress/coach"
```

### Task 12: DashboardPage — wire new tab containers (stubs)

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`
- Create: `frontend/src/components/dashboard/tabs/RideTab.tsx` (stub for now)
- Create: `frontend/src/components/dashboard/tabs/ProgressTab.tsx` (stub)
- Create: `frontend/src/components/dashboard/tabs/CoachTab.tsx` (stub)

- [ ] **Step 1: Create stub tabs**

Each file:

```tsx
// RideTab.tsx
export default function RideTab() {
  return <div className="p-4 text-muted">Ride tab — coming soon</div>
}
```

Same shape for `ProgressTab.tsx` and `CoachTab.tsx`.

- [ ] **Step 2: Update DashboardPage**

Replace tab union + imports + resolver + content switch:

```tsx
type TabId = 'today' | 'ride' | 'progress' | 'coach'

import TodayTab from '../components/dashboard/tabs/TodayTab'
import RideTab from '../components/dashboard/tabs/RideTab'
import ProgressTab from '../components/dashboard/tabs/ProgressTab'
import CoachTab from '../components/dashboard/tabs/CoachTab'

function resolveTab(raw: string | null): TabId {
  switch (raw) {
    case 'today': return 'today'
    case 'ride':
    case 'train':
    case 'week': return 'ride'
    case 'progress':
    case 'trends': return 'progress'
    case 'coach': return 'coach'
    case 'crew': return 'today'      // crew is no longer a tab — falls back to today; deep-link via /crew page
    default: return 'today'
  }
}

// inside component:
const tabs = [
  { id: 'today',    label: t('tab_today') },
  { id: 'ride',     label: t('tab_ride') },
  { id: 'progress', label: t('tab_progress') },
  { id: 'coach',    label: t('tab_coach') },
] as const

const tabContent = (() => {
  switch (activeTab) {
    case 'today':    return <TodayTab />
    case 'ride':     return <RideTab />
    case 'progress': return <ProgressTab />
    case 'coach':    return <CoachTab />
  }
})()
```

- [ ] **Step 3: Typecheck + run app**

```bash
cd frontend && npx tsc --noEmit && npm run dev
```

Visit `/dashboard?tab=ride`, `/dashboard?tab=progress`, `/dashboard?tab=coach` — should render stubs.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx \
        frontend/src/components/dashboard/tabs/RideTab.tsx \
        frontend/src/components/dashboard/tabs/ProgressTab.tsx \
        frontend/src/components/dashboard/tabs/CoachTab.tsx
git commit -m "feat(nav): switch DashboardPage to 4 moment-first tabs"
```

### Task 13: /crew page + remove Crew from main tabs

**Files:**
- Create: `frontend/src/pages/CrewPage.tsx`
- Modify: `frontend/src/App.tsx` (add `/crew` route)
- Note: `CrewTab.tsx` removed in cleanup phase.

- [ ] **Step 1: Create CrewPage**

```tsx
// frontend/src/pages/CrewPage.tsx
import DashboardShell from '../components/dashboard/DashboardShell'
import CrewTab from '../components/dashboard/tabs/CrewTab'   // reuse existing content
// If CrewTab is being deleted, lift its body into a new component before this task.

export default function CrewPage() {
  return (
    <DashboardShell stickyBar={null} tabs={null}>
      <CrewTab />
    </DashboardShell>
  )
}
```

- [ ] **Step 2: Register route**

In `App.tsx`:

```tsx
import CrewPage from './pages/CrewPage'
// ...
<Route path="/crew" element={<ProtectedRoute checkOnboarding><CrewPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Smoke test**

`npm run dev` → visit `/crew` → existing crew UI renders.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CrewPage.tsx frontend/src/App.tsx
git commit -m "feat(nav): /crew page (lifts CrewTab out of main tabs)"
```

---

## Phase 5 — Today Refresh

### Task 14: CrewStrip in Today

**Files:**
- Create: `frontend/src/components/dashboard/CrewStrip.tsx` (if doesn't exist as a standalone)
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`

**Note:** check if `CrewStrip.tsx` already exists — there's a `MissedYesterdayChip` and `WeeklyChallenge` for adjacent purposes but no CrewStrip. If a sub-component is already embedded in `CrewTab`, lift it. Otherwise build minimal.

- [ ] **Step 1: Build / lift CrewStrip**

```tsx
// frontend/src/components/dashboard/CrewStrip.tsx
import { useNavigate } from 'react-router-dom'
import { Users } from 'lucide-react'
import { useT } from '../../contexts/LocaleContext'
import { useCrewToday } from '../../hooks/useCrew'   // assume an existing data hook; if not, hard-code an "empty" fallback

export default function CrewStrip() {
  const navigate = useNavigate()
  const t = useT()
  const { data } = useCrewToday()
  const ridersToday = data?.ridersToday ?? 0
  const totalMembers = data?.totalMembers ?? 0
  return (
    <button onClick={() => navigate('/crew')}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-rule bg-paper-2 hover:bg-paper-3 transition">
      <span className="flex items-center gap-2">
        <Users size={18}/>
        <span className="text-sm">{ridersToday}/{totalMembers} {t('crew_rode_today')}</span>
      </span>
      <span className="text-xs text-muted">→</span>
    </button>
  )
}
```

If `useCrewToday` doesn't exist, return a static placeholder text and TODO-mark it. *(Exception to no-placeholder rule: only the data hook stub is acceptable since crew API surface is already separate scope; if it doesn't exist, fall back to "Open Crew →" CTA only.)*

- [ ] **Step 2: Wire into TodayTab**

In `TodayTab.tsx`:
- **Remove** imports for `PolarizedDistribution`, `LastWeekRecap`, `WeeklySportMetrics`, `PMCCompact`. These now live in `ProgressTab`.
- **Add** `import CrewStrip from '../CrewStrip'` and place between `MorningCheckin` and `StreakStrip` (or wherever appropriate by current layout).

- [ ] **Step 3: Smoke test**

`npm run dev` → today tab shows CrewStrip and clicking navigates to `/crew`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/CrewStrip.tsx \
        frontend/src/components/dashboard/tabs/TodayTab.tsx
git commit -m "feat(today): CrewStrip + remove sections that moved to Progress"
```

### Task 15: TomorrowChip replaces TomorrowCard

**Files:**
- Create: `frontend/src/components/dashboard/TomorrowChip.tsx`
- Modify: `frontend/src/components/dashboard/tabs/TodayTab.tsx`

- [ ] **Step 1: Build TomorrowChip**

```tsx
// frontend/src/components/dashboard/TomorrowChip.tsx
import { useTomorrowPreview } from '../../hooks/useTomorrowPreview'   // existing hook for TomorrowCard data
import { useT } from '../../contexts/LocaleContext'

export default function TomorrowChip() {
  const t = useT()
  const { data } = useTomorrowPreview()
  if (!data) return null
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                    text-xs bg-paper-2 border border-rule text-muted">
      <span className="font-medium text-ink">{t('tomorrow')}</span>
      <span>·</span>
      <span>{data.summary}</span>
    </div>
  )
}
```

- [ ] **Step 2: Swap in TodayTab**

Replace `<TomorrowCard />` with `<TomorrowChip />`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/TomorrowChip.tsx \
        frontend/src/components/dashboard/tabs/TodayTab.tsx
git commit -m "feat(today): TomorrowChip replaces TomorrowCard (preserves Sunday moment)"
```

### Task 16: ContributorsSheet from ReadinessHero tap

**Files:**
- Create: `frontend/src/components/dashboard/ContributorsSheet.tsx`
- Modify: `frontend/src/components/dashboard/ReadinessHero.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/ContributorsSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import ContributorsSheet from './ContributorsSheet'

const fixtures = {
  hrv: { current: 65, baseline: 60, trend: 'up' as const },
  sleep: { hours: 7.5, score: 82 },
  load: { ctl: 65, atl: 60, tsb: 5 },
  strain: { yesterday: 110, weeklyAvg: 90 },
}

test('renders all four contributors', () => {
  render(<ContributorsSheet open contributors={fixtures} onClose={() => {}} />)
  expect(screen.getByText(/HRV/i)).toBeInTheDocument()
  expect(screen.getByText(/sleep/i)).toBeInTheDocument()
  expect(screen.getByText(/load/i)).toBeInTheDocument()
  expect(screen.getByText(/strain/i)).toBeInTheDocument()
})

test('close button triggers onClose', () => {
  const onClose = vi.fn()
  render(<ContributorsSheet open contributors={fixtures} onClose={onClose} />)
  fireEvent.click(screen.getByLabelText(/close/i))
  expect(onClose).toHaveBeenCalled()
})
```

- [ ] **Step 2: Implement ContributorsSheet**

```tsx
// frontend/src/components/dashboard/ContributorsSheet.tsx
import { X } from 'lucide-react'
import { useT } from '../../contexts/LocaleContext'

interface Contributors {
  hrv: { current: number; baseline: number; trend: 'up' | 'flat' | 'down' }
  sleep: { hours: number; score: number }
  load: { ctl: number; atl: number; tsb: number }
  strain: { yesterday: number; weeklyAvg: number }
}

interface Props {
  open: boolean
  contributors: Contributors
  onClose: () => void
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between py-3 border-b border-rule">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-base font-medium">{value}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </div>
  )
}

export default function ContributorsSheet({ open, contributors, onClose }: Props) {
  const t = useT()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div className="absolute bottom-0 inset-x-0 bg-paper rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t('contributors_title')}</h2>
          <button aria-label="Close" onClick={onClose}><X /></button>
        </div>
        <Row label="HRV" value={`${contributors.hrv.current} ms`}
             hint={`baseline ${contributors.hrv.baseline} · ${contributors.hrv.trend}`} />
        <Row label="Sleep" value={`${contributors.sleep.hours.toFixed(1)} h`}
             hint={`score ${contributors.sleep.score}`} />
        <Row label="Load" value={`TSB ${contributors.load.tsb > 0 ? '+' : ''}${contributors.load.tsb}`}
             hint={`CTL ${contributors.load.ctl} · ATL ${contributors.load.atl}`} />
        <Row label="Strain" value={`${contributors.strain.yesterday}`}
             hint={`weekly avg ${contributors.strain.weeklyAvg}`} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Make ReadinessHero open the sheet**

In `ReadinessHero.tsx`, add `useState` for sheet open, build contributors from existing props/data, render `<ContributorsSheet>` as a sibling of the hero, and make the hero clickable:

```tsx
const [sheetOpen, setSheetOpen] = useState(false)
// ... wrap hero contents in a <button> or add onClick that calls setSheetOpen(true)
<ContributorsSheet open={sheetOpen} onClose={() => setSheetOpen(false)} contributors={contributors} />
```

`contributors` is assembled from existing readiness/biometrics data already passed to / fetched within ReadinessHero.

- [ ] **Step 4: Run tests + manual smoke**

```bash
cd frontend && npm test -- ContributorsSheet
npm run dev
```

Tap the hero → sheet slides up → close works.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard/ContributorsSheet.tsx \
        frontend/src/components/dashboard/ContributorsSheet.test.tsx \
        frontend/src/components/dashboard/ReadinessHero.tsx
git commit -m "feat(today): ContributorsSheet — tap verdict to see inputs"
```

---

## Phase 6 — Ride Tab

### Task 17: RideTab state-machine scaffold

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/RideTab.tsx` (replace stub)
- Test: `frontend/src/components/dashboard/tabs/RideTab.test.tsx`

**State logic:**
- If today is a rest day in the plan → `rest`
- Else if today's activity has been synced → `post`
- Else → `pre`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/dashboard/tabs/RideTab.test.tsx
import { render, screen } from '@testing-library/react'
import { resolveRideState } from './RideTab'

test('rest day if plan says rest', () => {
  expect(resolveRideState({ plan: { type: 'rest' }, activityToday: null })).toBe('rest')
})
test('post if an activity synced today', () => {
  expect(resolveRideState({ plan: { type: 'vo2' }, activityToday: { id: 1 } })).toBe('post')
})
test('pre otherwise', () => {
  expect(resolveRideState({ plan: { type: 'vo2' }, activityToday: null })).toBe('pre')
})
```

- [ ] **Step 2: Implement**

```tsx
// frontend/src/components/dashboard/tabs/RideTab.tsx
import { usePrescribedWorkout } from '../../../hooks/usePrescribedWorkout'   // existing
import { useTodayActivity } from '../../../hooks/useTodayActivity'           // existing
import PrescribedWorkoutCard from '../PrescribedWorkoutCard'
import PostRideReview from '../PostRideReview'
import RideRestDayPanel from '../RideRestDayPanel'
import IntervalRibbon from '../IntervalRibbon'
import WorkoutExportRow from '../WorkoutExportRow'
import TrainingLogStrip from '../TrainingLogStrip'

export type RideState = 'pre' | 'post' | 'rest'

export function resolveRideState(input: { plan: { type: string } | null; activityToday: { id: number } | null }): RideState {
  if (input.plan?.type === 'rest') return 'rest'
  if (input.activityToday) return 'post'
  return 'pre'
}

export default function RideTab() {
  const { data: plan } = usePrescribedWorkout()
  const { data: activity } = useTodayActivity()
  const state = resolveRideState({ plan: plan ?? null, activityToday: activity ?? null })

  return (
    <div className="flex flex-col gap-4 p-4">
      {state === 'pre' && (
        <>
          <PrescribedWorkoutCard />
          <IntervalRibbon />
          <WorkoutExportRow />
          <TrainingLogStrip />
        </>
      )}
      {state === 'post' && (
        <>
          <PostRideReview />
          <TrainingLogStrip />
        </>
      )}
      {state === 'rest' && (
        <>
          <RideRestDayPanel />
          <TrainingLogStrip />
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Run unit tests**

```bash
cd frontend && npm test -- RideTab
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/tabs/RideTab.tsx \
        frontend/src/components/dashboard/tabs/RideTab.test.tsx
git commit -m "feat(ride): pre/post/rest state machine wiring"
```

### Task 18: RideRestDayPanel

**Files:**
- Create: `frontend/src/components/dashboard/RideRestDayPanel.tsx`

- [ ] **Step 1: Build the panel**

```tsx
// frontend/src/components/dashboard/RideRestDayPanel.tsx
import { useT } from '../../contexts/LocaleContext'
import { useWeekPlan } from '../../hooks/useWeekPlan'   // existing
import { Coffee } from 'lucide-react'

export default function RideRestDayPanel() {
  const t = useT()
  const { data: week } = useWeekPlan()
  const next3 = (week?.upcoming ?? []).slice(0, 3)
  return (
    <div className="flex flex-col gap-5 p-5 rounded-2xl border border-rule bg-paper-2">
      <div className="flex items-center gap-3">
        <Coffee size={28} />
        <div>
          <h2 className="text-lg font-semibold">{t('ride_rest_title')}</h2>
          <p className="text-sm text-muted">{t('ride_rest_subtitle')}</p>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-medium mb-2">{t('coming_up')}</h3>
        <ul className="flex flex-col gap-2">
          {next3.map(d => (
            <li key={d.date} className="flex justify-between text-sm">
              <span className="text-muted">{d.dayLabel}</span>
              <span>{d.summary}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add i18n keys `coming_up`** to en/de.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/RideRestDayPanel.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(ride): RideRestDayPanel — rest-day state with 3-day preview"
```

### Task 19: Easy/Pro variants on RideTab inputs

**Files:**
- Modify: `frontend/src/components/dashboard/PrescribedWorkoutCard.tsx`
- Modify: `frontend/src/components/dashboard/IntervalRibbon.tsx`

- [ ] **Step 1: Read level from context in PrescribedWorkoutCard**

```tsx
import { useExperienceLevel } from '../../contexts/ExperienceLevelContext'
// inside component:
const { effectiveDepth } = useExperienceLevel()
const depth = effectiveDepth('workout_detail')
// where the workout copy renders:
return depth === 'pro'
  ? <span>{workout.label} · {workout.minutes} min · Z2 · {workout.watt_low}–{workout.watt_high} W</span>
  : <span>{workout.label} · {workout.minutes} min · {t('easy_pace_chat')}</span>
```

(`easy_pace_chat` → "easy spin, chat-pace" / "locker plaudern" — add to i18n.)

- [ ] **Step 2: Same for IntervalRibbon**

`pro`: `3 × 8min @ 105% FTP / 4min rec`
`easy`: `3 × hard chunk with rest`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/PrescribedWorkoutCard.tsx \
        frontend/src/components/dashboard/IntervalRibbon.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(ride): Easy/Pro language variants for workout + intervals"
```

---

## Phase 7 — Progress Tab

### Task 20: ProgressTab — section scaffold + this-week + body

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/ProgressTab.tsx` (replace stub)

- [ ] **Step 1: Build the scaffold**

```tsx
// frontend/src/components/dashboard/tabs/ProgressTab.tsx
import { useExperienceLevel } from '../../../contexts/ExperienceLevelContext'
import { useT } from '../../../contexts/LocaleContext'
import WeekStrip from '../WeekStrip'
import ComplianceStrip from '../ComplianceStrip'
import LastWeekRecap from '../LastWeekRecap'
import WeeklyChallenge from '../WeeklyChallenge'
import WhatGotBetter from '../WhatGotBetter'
import HRVTrend from '../HRVTrend'
import BiometricsDetail from '../BiometricsDetail'
import RegenerationCard from '../RegenerationCard'
import PMCChart from '../PMCChart'
import RampRate from '../RampRate'
import FTPEstimate from '../FTPEstimate'
import VO2MaxEstimate from '../VO2MaxEstimate'
import IntensityDistribution from '../IntensityDistribution'
import PolarizedDistribution from '../PolarizedDistribution'
import DurabilityTrend from '../DurabilityTrend'
import AerobicDecouplingTrend from '../AerobicDecouplingTrend'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  )
}

export default function ProgressTab() {
  const t = useT()
  const { effectiveDepth } = useExperienceLevel()
  const showForm = effectiveDepth('form') === 'pro'
  const bodyDepth = effectiveDepth('body')

  return (
    <div className="flex flex-col gap-8 p-4">
      <Section title={t('progress_this_week')}>
        <WeekStrip />
        <ComplianceStrip />
        <LastWeekRecap />
        <WeeklyChallenge />
      </Section>

      <Section title={t('progress_what_better')}>
        <WhatGotBetter />
      </Section>

      <Section title={t('progress_your_body')}>
        <HRVTrend depth={bodyDepth} />
        <BiometricsDetail depth={bodyDepth} />
        <RegenerationCard />
      </Section>

      {showForm && (
        <>
          <Section title={t('progress_form_fitness')}>
            <PMCChart />
            <RampRate />
            <FTPEstimate />
            <VO2MaxEstimate />
            <IntensityDistribution />
            <PolarizedDistribution />
          </Section>

          <Section title={t('progress_durability')}>
            <DurabilityTrend />
          </Section>

          <Section title={t('progress_decoupling')}>
            <AerobicDecouplingTrend />
          </Section>
        </>
      )}
    </div>
  )
}
```

(`HRVTrend` and `BiometricsDetail` must accept a `depth` prop — Task 23.)

- [ ] **Step 2: Smoke test**

`npm run dev` → switch `experience_level` to `pro` via direct API → reload → all sections visible. Switch to `easy` → only top three sections visible.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/tabs/ProgressTab.tsx
git commit -m "feat(progress): ProgressTab scaffold with Easy/Pro section gating"
```

### Task 21: WhatGotBetter

**Files:**
- Create: `frontend/src/components/dashboard/WhatGotBetter.tsx`

- [ ] **Step 1: Build component**

```tsx
// frontend/src/components/dashboard/WhatGotBetter.tsx
import { TrendingUp, Trophy, Flame, Mountain } from 'lucide-react'
import { useWeekRecap } from '../../hooks/useWeekRecap'   // existing
import { useT } from '../../contexts/LocaleContext'

function Card({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-rule bg-paper-2">
      <div className="opacity-70">{icon}</div>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="text-base font-medium">{value}</div>
      </div>
    </div>
  )
}

export default function WhatGotBetter() {
  const t = useT()
  const { data } = useWeekRecap()
  if (!data) return null
  return (
    <div className="grid grid-cols-2 gap-3">
      {data.longestRideKm && <Card icon={<Mountain size={20}/>} label={t('longest_ride')}     value={`${data.longestRideKm} km`} />}
      {data.peakPower      && <Card icon={<TrendingUp size={20}/>} label={t('peak_power')}     value={`${data.peakPower} W`} />}
      {data.streakDays     && <Card icon={<Flame size={20}/>}      label={t('current_streak')} value={`${data.streakDays} d`} />}
      {data.newPRs?.length && <Card icon={<Trophy size={20}/>}     label={t('new_prs')}        value={`${data.newPRs.length}`} />}
    </div>
  )
}
```

(Add i18n: `longest_ride`, `peak_power`, `current_streak`, `new_prs`.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/WhatGotBetter.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(progress): WhatGotBetter — identity-framed weekly recap"
```

### Task 22: DurabilityTrend component

**Files:**
- Create: `frontend/src/components/dashboard/DurabilityTrend.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/src/components/dashboard/DurabilityTrend.tsx
import { useDurability } from '../../hooks/useDurability'
import { useT } from '../../contexts/LocaleContext'

export default function DurabilityTrend() {
  const t = useT()
  const { data, isLoading } = useDurability()
  if (isLoading) return <div className="text-sm text-muted">…</div>
  if (!data || data.rides.length < 3) {
    return <div className="text-sm text-muted">{t('durability_empty')}</div>
  }
  const latest = data.trend.at(-1)!.smoothed!
  const ridesSorted = data.rides
  const max = Math.max(...ridesSorted.map(r => r.score))
  const min = Math.min(...ridesSorted.map(r => r.score))
  return (
    <div className="p-4 rounded-2xl border border-rule bg-paper-2">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-muted">{t('progress_durability')}</span>
        <span className="text-2xl font-semibold">{(latest * 100).toFixed(0)}%</span>
      </div>
      <p className="text-xs text-muted mb-3">{t('durability_explain')}</p>
      <svg viewBox={`0 0 100 30`} className="w-full h-20">
        <polyline fill="none" stroke="currentColor" strokeWidth="1"
          points={ridesSorted.map((r, i) => {
            const x = (i / (ridesSorted.length - 1 || 1)) * 100
            const y = 30 - ((r.score - min) / (max - min || 1)) * 30
            return `${x},${y}`
          }).join(' ')}
        />
      </svg>
    </div>
  )
}
```

(Add i18n: `durability_empty`, `durability_explain`.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/DurabilityTrend.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(progress): DurabilityTrend visualization"
```

### Task 23: AerobicDecouplingTrend component + HRVTrend depth prop

**Files:**
- Create: `frontend/src/components/dashboard/AerobicDecouplingTrend.tsx`
- Modify: `frontend/src/components/dashboard/HRVTrend.tsx`
- Modify: `frontend/src/components/dashboard/BiometricsDetail.tsx`

- [ ] **Step 1: Build AerobicDecouplingTrend**

```tsx
// frontend/src/components/dashboard/AerobicDecouplingTrend.tsx
import { useAerobicDecoupling } from '../../hooks/useAerobicDecoupling'
import { useT } from '../../contexts/LocaleContext'

const BUCKET_COLOR: Record<string, string> = {
  good: 'var(--color-good)', moderate: 'var(--color-warn)', poor: 'var(--color-bad)',
}

export default function AerobicDecouplingTrend() {
  const t = useT()
  const { data, isLoading } = useAerobicDecoupling()
  if (isLoading) return <div className="text-sm text-muted">…</div>
  if (!data || data.rides.length < 3) {
    return <div className="text-sm text-muted">{t('decoupling_empty')}</div>
  }
  return (
    <div className="p-4 rounded-2xl border border-rule bg-paper-2">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs text-muted">{t('progress_decoupling')}</span>
        <span className="text-2xl font-semibold">
          {data.rides.at(-1)!.pct.toFixed(1)}%
        </span>
      </div>
      <p className="text-xs text-muted mb-3">{t('decoupling_explain')}</p>
      <div className="flex items-end gap-1 h-20">
        {data.rides.map(r => (
          <div key={r.activity_id}
               className="flex-1 rounded-t"
               style={{
                 height: `${Math.min(100, Math.abs(r.pct) * 6)}%`,
                 backgroundColor: BUCKET_COLOR[r.bucket],
               }}
               title={`${r.date}: ${r.pct.toFixed(1)}% (${r.bucket})`}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add `depth` prop to HRVTrend and BiometricsDetail**

In each, accept `depth: 'easy' | 'pro'` as an optional prop. For HRVTrend Easy mode: render only an arrow + word ("Erholung gut" / "Recovery good"). For Pro mode: keep current chart and millisecond detail. Use `useExperienceLevel().effectiveDepth('body')` if `depth` not passed.

- [ ] **Step 3: Add i18n keys** `decoupling_empty`, `decoupling_explain`, `recovery_good`, `recovery_low`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/dashboard/AerobicDecouplingTrend.tsx \
        frontend/src/components/dashboard/HRVTrend.tsx \
        frontend/src/components/dashboard/BiometricsDetail.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(progress): AerobicDecouplingTrend + Easy variants for HRV/Biometrics"
```

### Task 24: Manual end-to-end check of ProgressTab

- [ ] **Step 1: Run dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Test Easy mode**

PATCH profile to `experience_level=easy` → reload `/dashboard?tab=progress` → expect This-Week + WhatGotBetter + Body (with Easy framing) only.

- [ ] **Step 3: Test Pro mode**

PATCH to `experience_level=pro` → reload → expect Form/Fitness + Durability + Decoupling visible.

- [ ] **Step 4: Test per-section override**

PATCH `display_overrides={"form":"pro"}` with `experience_level=easy` → only Form section appears (no Durability/Decoupling — those follow the `form` flag too, which matches; document this).

Decision: Durability + Decoupling follow the same `form` gate (they're Form/Fitness deep cuts). Update `ProgressTab` if needed so both Durability/Decoupling are inside the `showForm` block (already done in Task 20).

- [ ] **Step 5: Commit (if any fixes needed)**

---

## Phase 8 — Coach Tab + Sunday Planning

### Task 25: CoachTab default surface

**Files:**
- Modify: `frontend/src/components/dashboard/tabs/CoachTab.tsx` (replace stub)

- [ ] **Step 1: Implement**

```tsx
// frontend/src/components/dashboard/tabs/CoachTab.tsx
import CoachChat from '../CoachChat'
import PatternInsight from '../PatternInsight'
import PersonalInsights from '../PersonalInsights'
import DidYouKnow from '../DidYouKnow'
import SundayPlanFlow from '../SundayPlanFlow'
import { useSearchParams } from 'react-router-dom'
import { useT } from '../../../contexts/LocaleContext'

export default function CoachTab() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode')

  if (mode === 'sunday') {
    return <SundayPlanFlow onDone={() => setParams({ tab: 'coach' }, { replace: true })} />
  }
  return (
    <div className="flex flex-col gap-6 p-4">
      <CoachChat />
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setParams({ tab: 'coach', mode: 'sunday' }, { replace: true })}
                className="px-3 py-1.5 rounded-full bg-paper-2 border border-rule text-sm">
          {t('coach_sunday_title')} →
        </button>
      </div>
      <PatternInsight />
      <PersonalInsights />
      <DidYouKnow />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/tabs/CoachTab.tsx
git commit -m "feat(coach): default surface with CoachChat + insights + Sunday entry"
```

### Task 26: SundayPlanFlow — 3-step

**Files:**
- Create: `frontend/src/components/dashboard/SundayPlanFlow.tsx`

- [ ] **Step 1: Implement**

```tsx
// frontend/src/components/dashboard/SundayPlanFlow.tsx
import { useState } from 'react'
import { useLastWeekRecap } from '../../hooks/useLastWeekRecap'  // existing or adapt
import { useNextWeekPreview } from '../../hooks/useNextWeekPreview'  // existing or adapt
import { useCreateWeekIntention, useCurrentWeekIntention } from '../../hooks/useWeekIntentions'
import { useT } from '../../contexts/LocaleContext'

function isoWeekFor(date: Date): string {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = tmp.getUTCDay() || 7
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  const wk = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${tmp.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
}

export default function SundayPlanFlow({ onDone }: { onDone: () => void }) {
  const t = useT()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [text, setText] = useState('')
  const [day, setDay] = useState('')
  const [time, setTime] = useState('')
  const { data: recap } = useLastWeekRecap()
  const { data: preview } = useNextWeekPreview()
  const { data: existing } = useCurrentWeekIntention()
  const create = useCreateWeekIntention()

  if (existing) {
    return (
      <div className="p-5 rounded-2xl border border-rule bg-paper-2">
        <h2 className="text-lg font-semibold mb-2">{t('coach_sunday_title')}</h2>
        <p className="text-sm text-muted mb-3">{t('sunday_already_set')}</p>
        <p className="text-base">"{existing.text}"</p>
        <button className="mt-4 text-sm underline" onClick={onDone}>{t('back')}</button>
      </div>
    )
  }

  return (
    <div className="p-5 rounded-2xl border border-rule bg-paper-2 flex flex-col gap-4">
      {step === 1 && (
        <>
          <h2 className="text-lg font-semibold">{t('coach_sunday_step1')}</h2>
          <div className="text-sm">{recap?.summary ?? '…'}</div>
          <button className="self-end px-3 py-1.5 rounded-full bg-ink text-paper" onClick={() => setStep(2)}>
            {t('next')} →
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <h2 className="text-lg font-semibold">{t('coach_sunday_step2')}</h2>
          <ul className="text-sm flex flex-col gap-1">
            {(preview?.days ?? []).map(d => (
              <li key={d.date} className="flex justify-between"><span className="text-muted">{d.dayLabel}</span><span>{d.summary}</span></li>
            ))}
          </ul>
          <button className="self-end px-3 py-1.5 rounded-full bg-ink text-paper" onClick={() => setStep(3)}>
            {t('next')} →
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <h2 className="text-lg font-semibold">{t('coach_sunday_step3')}</h2>
          <input value={text} onChange={e => setText(e.target.value)}
            placeholder={t('intention_placeholder')}
            className="border border-rule rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input type="date" value={day} onChange={e => setDay(e.target.value)} className="flex-1 border border-rule rounded-lg px-3 py-2 text-sm" />
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className="flex-1 border border-rule rounded-lg px-3 py-2 text-sm" />
          </div>
          <button
            disabled={!text || create.isPending}
            onClick={async () => {
              const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7)
              await create.mutateAsync({
                iso_week: isoWeekFor(nextWeek),
                text,
                target_day: day || null,
                target_time: time ? `${time}:00` : null,
              })
              onDone()
            }}
            className="self-end px-4 py-2 rounded-full bg-ink text-paper disabled:opacity-50">
            {t('commit_intention')}
          </button>
        </>
      )}
    </div>
  )
}
```

(Add i18n: `next`, `back`, `commit_intention`, `intention_placeholder`, `sunday_already_set`.)

- [ ] **Step 2: Smoke test**

`npm run dev` → `/dashboard?tab=coach&mode=sunday` → walk through 3 steps → check DB row appears in `week_intentions`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/SundayPlanFlow.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(coach): SundayPlanFlow — 3-step weekly intention ritual"
```

### Task 27: Surface active intention in Today's verdict

**Files:**
- Modify: `frontend/src/components/dashboard/CoachBrief.tsx` (or `TodayHero` — wherever the verdict explanation copy renders)

- [ ] **Step 1: Read current intention + reference it**

```tsx
import { useCurrentWeekIntention } from '../../hooks/useWeekIntentions'
// inside component:
const { data: intent } = useCurrentWeekIntention()
const todayIso = new Date().toISOString().slice(0,10)
const intentMatchesToday = intent?.target_day === todayIso && !intent.completed_at
// inject below the existing brief copy:
{intentMatchesToday && (
  <p className="text-sm text-muted italic mt-1">
    {t('you_wanted_today')}: "{intent.text}"
  </p>
)}
```

Add `you_wanted_today` to i18n: `"You wanted to ride today"` / `"Du wolltest heute fahren"`.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/dashboard/CoachBrief.tsx \
        frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(today): surface this-week intention in Today's brief"
```

---

## Phase 9 — Onboarding + Settings

### Task 28: Onboarding — Goal + Experience Level questions

**Files:**
- Modify: `frontend/src/pages/ProfileSetupPage.tsx`
- Modify: `frontend/src/api/athletes.ts` (if there's an update wrapper)

- [ ] **Step 1: Add state + form fields**

In `ProfileSetupPage.tsx`, alongside existing fields:

```tsx
const [goalText, setGoalText] = useState('')
const [experienceLevel, setExperienceLevel] = useState<'easy'|'pro'>('easy')
```

In the form JSX, add two new questions (after the existing goal fields):

```tsx
<label className="flex flex-col gap-1">
  <span className="text-sm">{t('onboarding_goal_q')}</span>
  <input value={goalText} onChange={e=>setGoalText(e.target.value)}
         placeholder={t('onboarding_goal_ph')}
         className="border border-rule rounded-lg px-3 py-2"/>
</label>

<fieldset className="flex flex-col gap-2">
  <legend className="text-sm">{t('onboarding_level_q')}</legend>
  <label className="flex items-center gap-2">
    <input type="radio" checked={experienceLevel==='easy'} onChange={()=>setExperienceLevel('easy')}/>
    {t('onboarding_level_easy')}
  </label>
  <label className="flex items-center gap-2">
    <input type="radio" checked={experienceLevel==='pro'} onChange={()=>setExperienceLevel('pro')}/>
    {t('onboarding_level_pro')}
  </label>
</fieldset>
```

In `handleSubmit`, include `experience_level` and `goal_text` in the profile-update call.

- [ ] **Step 2: Smoke test**

Run onboarding end-to-end → check the new fields persist by hitting `GET /api/athletes/me/profile` after submit.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ProfileSetupPage.tsx frontend/src/api/athletes.ts
git commit -m "feat(onboarding): goal + experience-level questions"
```

### Task 29: Settings — Display Depth panel

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add section**

```tsx
// inside SettingsPage
const { data: profile, refetch } = useAthleteProfile()
const update = useUpdateAthleteProfile()   // existing
const overrides = profile?.display_overrides ?? {}
const level = profile?.experience_level ?? 'easy'

const sections = ['form', 'body', 'workout_detail'] as const

async function setOverride(section: typeof sections[number], val: 'easy'|'pro'|null) {
  const next = { ...overrides }
  if (val === null) delete next[section]
  else next[section] = val
  await update.mutateAsync({ display_overrides: next })
  refetch()
}

return (
  // ... existing settings sections
  <section className="flex flex-col gap-3">
    <h2 className="text-sm uppercase tracking-wider text-muted">{t('settings_display_depth')}</h2>
    <p className="text-xs text-muted">{t('settings_display_depth_help')}</p>
    {sections.map(s => (
      <div key={s} className="flex items-center justify-between py-2 border-b border-rule">
        <span className="text-sm">{t(`section_${s}`)}</span>
        <div className="flex gap-1 text-xs">
          {(['easy','pro'] as const).map(v => (
            <button key={v}
              onClick={() => setOverride(s, overrides[s] === v ? null : v)}
              className={`px-2 py-1 rounded-full ${overrides[s]===v?'bg-ink text-paper':'border border-rule'}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
    ))}
    <p className="text-xs text-muted">{t('settings_display_depth_default')}: {level}</p>
  </section>
)
```

(Add i18n: `settings_display_depth_help`, `settings_display_depth_default`, `section_form`, `section_body`, `section_workout_detail`.)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx frontend/src/i18n/en.ts frontend/src/i18n/de.ts
git commit -m "feat(settings): display-depth per-section overrides"
```

### Task 30: Quick E2E acceptance walkthrough

- [ ] **Step 1: Reset to fresh user, complete onboarding picking `pro`** — confirm Progress shows all sections.
- [ ] **Step 2: In Settings, override `body=easy`** — Body section now shows "Recovery good/bad" framing, Form/Durability/Decoupling unchanged.
- [ ] **Step 3: Switch global to `easy`, override `form=pro`** — Form/Durability/Decoupling reappear, Body returns to Easy framing.
- [ ] **Step 4: Tap ReadinessHero** — Contributors-Sheet opens.
- [ ] **Step 5: Tap CrewStrip** — navigates to `/crew`.
- [ ] **Step 6: Visit `/dashboard?tab=coach&mode=sunday`** — flow runs, intention persists, surfaces in Today on the next target day.
- [ ] **Step 7: Visit Ride tab** — verify all three states by adjusting plan + activity fixtures.

Document anything broken in this pass; fix and commit before Phase 10.

---

## Phase 10 — Cleanup

### Task 31: Delete retired components

**Files (delete):**
- `frontend/src/components/dashboard/DashboardTabs.tsx`
- `frontend/src/components/dashboard/tabs/TrendsTab.tsx`
- `frontend/src/components/dashboard/tabs/CrewTab.tsx` (only after its content has been lifted into `CrewPage`)
- `frontend/src/components/dashboard/tabs/PlanTab.tsx`
- `frontend/src/components/dashboard/tabs/BikeTab.tsx`
- `frontend/src/components/dashboard/tabs/RunTab.tsx`
- `frontend/src/components/dashboard/tabs/SportTab.tsx`
- `frontend/src/components/dashboard/tabs/WeekTab.tsx`
- `frontend/src/components/dashboard/TomorrowCard.tsx`

- [ ] **Step 1: Verify no remaining imports**

```bash
cd frontend && for f in DashboardTabs TrendsTab CrewTab PlanTab BikeTab RunTab SportTab WeekTab TomorrowCard; do
  echo "=== $f ==="
  grep -rn "from.*$f" src --include="*.tsx" --include="*.ts" | grep -v "/$f"
done
```

Each `===` block must be empty. If a hit appears, replace the import before deleting.

- [ ] **Step 2: Delete**

```bash
cd frontend
rm src/components/dashboard/DashboardTabs.tsx \
   src/components/dashboard/tabs/TrendsTab.tsx \
   src/components/dashboard/tabs/CrewTab.tsx \
   src/components/dashboard/tabs/PlanTab.tsx \
   src/components/dashboard/tabs/BikeTab.tsx \
   src/components/dashboard/tabs/RunTab.tsx \
   src/components/dashboard/tabs/SportTab.tsx \
   src/components/dashboard/tabs/WeekTab.tsx \
   src/components/dashboard/TomorrowCard.tsx
```

**Caveat about CrewPage:** Task 13 has CrewPage importing `CrewTab`. Before deleting `CrewTab.tsx`, refactor its body into a `CrewSurface` component (or inline into `CrewPage.tsx`) so `CrewPage` is self-contained.

- [ ] **Step 3: Build**

```bash
cd frontend && npx tsc --noEmit && npm run build
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove components retired by tab restructure"
```

### Task 32: Full-app smoke + final commit

- [ ] **Step 1: Backend tests**

```bash
cd backend && pytest -q
```

Expected: all green.

- [ ] **Step 2: Frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: all green.

- [ ] **Step 3: Manual app-level smoke**

Run the dev server, walk through:
1. New user signup → onboarding (with goal + level) → dashboard
2. Today → tap ReadinessHero → Contributors-Sheet → close
3. Today → tap CrewStrip → /crew → back
4. Ride tab (in each of pre/post/rest states)
5. Progress tab (toggle level easy↔pro, watch sections appear)
6. Coach tab → Sunday-mode → commit intention → return to Today, confirm it surfaces on target day
7. Settings → per-section override → verify Progress reflects

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: post-restructure smoke fixes"
```

---

## Self-Review Notes

1. **Spec coverage** — verified each of the 10 spec sections maps to at least one task:
   - §3.1 Tabs → Tasks 11, 12, 13
   - §3.2 Today → Tasks 14, 15, 16
   - §3.2 Ride → Tasks 17, 18, 19
   - §3.2 Progress → Tasks 20, 21, 22, 23, 24
   - §3.2 Coach → Tasks 25, 26, 27
   - §3.2 Crew page → Task 13
   - §4 Experience level → Tasks 1, 2, 8, 19, 23, 28, 29
   - §5 Sunday ritual → Tasks 3, 4, 9, 26, 27
   - §6 New components → spread across phases 5–8
   - §7 Backend → Tasks 1–7
   - §8 Risks → addressed in component logic (rest-day state in 18, empty-states in 22/23)
   - §9 Out of scope → respected (no notification infra task; Sunday push is chip-only — see open question)
2. **Placeholders** — every code block compiles or is concrete except the noted `useCrewToday` fallback in Task 14, which is acceptable scope-exception.
3. **Type consistency** — `experience_level`, `goal_text`, `display_overrides` use identical names backend↔frontend; `effectiveDepth(section)` signature consistent across consumers; `WeekIntention` shape matches API↔hook↔component.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-app-structure-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration. Uses the `superpowers:subagent-driven-development` skill.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints for review.

**Which approach?**
