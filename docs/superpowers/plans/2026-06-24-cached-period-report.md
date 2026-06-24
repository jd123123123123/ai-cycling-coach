# Cached Period Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the period report from a per-`(user, days)` DB cache so window switches are instant, and keep it fresh via post-workout + once-a-day-morning regeneration on the existing sync job.

**Architecture:** Mirror the existing `coach_briefs` read-through cache. A new `period_reports` table stores one JSONB `PeriodReport` per `(user_id, days)`. `GET /period-report` goes through `get_or_build_report` (serve fresh cache, else `build_report` + upsert). The background Garmin sync invalidates cached reports when a workout lands and warms the preset windows (7/14/30) on the first sync past 09:00 athlete-local.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + Postgres RLS + Pydantic v2; APScheduler (existing). Python `zoneinfo` for the morning-hour check.

## Global Constraints

- Cache table mirrors `coach_briefs`/`user_dashboards`: JSONB payload column, RLS via `current_setting('app.current_user_id', true)::INTEGER`, accessed through `get_db_for_user` for user requests; the sync job uses `async_session_maker` directly (system job, RLS bypassed, queries scoped by `user_id`).
- One row per `(user_id, days)` — `UniqueConstraint(user_id, days)`.
- Preset windows precomputed = exactly `(7, 14, 30)`. Custom `days` are read-through only.
- Read-through backstop TTL = `PERIOD_REPORT_TTL_HOURS = 18`.
- Morning hour = `MORNING_HOUR = 9` (09:00), resolved in the athlete's IANA timezone (`AthleteProfile.timezone`, nullable → fall back to UTC).
- New Alembic migration `down_revision = "d0e1f2a3b4c5"` (current head).
- Cache/precompute/invalidation failures inside the sync are **non-fatal** (logged, `db.rollback()`), matching the existing coach-brief invalidation.
- Backend tests: `fastapi.testclient.TestClient` + `app.dependency_overrides` + `AsyncMock` db for API; plain mocked-db / pure-function tests for services. Run from `backend/` via `.venv/bin/pytest` and `.venv/bin/alembic`. Postgres must be up (`docker compose up -d`) for the migration step.

---

## File Structure

- Create `backend/app/models/period_report_cache.py` — `PeriodReportCache` ORM model.
- Create `backend/migrations/versions/e1f2a3b4c5d6_add_period_reports.py` — table + RLS + unique.
- Modify `backend/app/schemas/period_report.py` — add `generated_at` field.
- Modify `backend/app/models/__init__.py` — register model.
- Modify `backend/app/services/period_report.py` — `get_or_build_report`, `_upsert_report`, `precompute_preset_reports`, `should_precompute_daily`, constants.
- Modify `backend/app/api/analytics.py` — call the read-through wrapper.
- Modify `backend/app/services/garmin_sync_service.py` — invalidate + warm hook.
- Tests: `backend/tests/test_period_report_cache.py`, `backend/tests/api/test_period_report_cache_api.py`.

---

## Task 1: Cache model + schema field + migration

**Files:**
- Modify: `backend/app/schemas/period_report.py`
- Create: `backend/app/models/period_report_cache.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/e1f2a3b4c5d6_add_period_reports.py`
- Test: `backend/tests/test_period_report_cache.py`

**Interfaces:**
- Produces: `PeriodReport.generated_at: datetime | None` (defaults None); `PeriodReportCache` model (`id`, `user_id`, `days`, `report: dict`, `generated_at: datetime`, unique `(user_id, days)`).

- [ ] **Step 1: Write the failing schema test**

Create `backend/tests/test_period_report_cache.py`:

```python
"""Tests for the period-report cache: schema field + model import."""
from datetime import datetime, timezone

from app.schemas.period_report import PeriodReport


def _minimal_report_kwargs() -> dict:
    return dict(
        days=7, start_date="2026-06-18", end_date="2026-06-24",
        prev_start_date="2026-06-11", prev_end_date="2026-06-17",
        has_baseline=False, grade_letter=None, grade_score=None,
        radar=[], improvements=[], weaknesses=[], milestones=[],
        ai_verdict="x", ai_model="rule-based-fallback",
    )


def test_generated_at_defaults_none():
    r = PeriodReport(**_minimal_report_kwargs())
    assert r.generated_at is None


def test_generated_at_round_trips_through_dump_and_validate():
    ts = datetime(2026, 6, 24, 7, 30, tzinfo=timezone.utc)
    r = PeriodReport(**_minimal_report_kwargs(), generated_at=ts)
    dumped = r.model_dump(mode="json")
    # merging a stored timestamp back in (the cache read path) validates cleanly
    again = PeriodReport.model_validate({**dumped, "generated_at": ts})
    assert again.generated_at == ts
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -v`
Expected: FAIL — `TypeError`/`ValidationError`: `generated_at` is not a field.

- [ ] **Step 3: Add the schema field**

In `backend/app/schemas/period_report.py`, add the datetime import at the top (with the other imports):

```python
from datetime import datetime
```

In the `class PeriodReport(BaseModel):` block, after the `ai_model: str` line, add:

```python
    # Cache freshness stamp — None on a live build; set to the row's
    # generated_at when served from the period_reports cache.
    generated_at: datetime | None = None
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Create the cache model**

Create `backend/app/models/period_report_cache.py`:

```python
"""PeriodReportCache — one cached PeriodReport per (user, window).

Mirrors coach_briefs: a JSONB payload + generated_at, RLS-protected. Unlike
coach_briefs we keep only the latest row per (user_id, days) (UniqueConstraint
+ upsert) — a period report is derived analytics, not an audit trail.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PeriodReportCache(Base):
    __tablename__ = "period_reports"
    __table_args__ = (UniqueConstraint("user_id", "days", name="uq_period_reports_user_days"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    days: Mapped[int] = mapped_column(Integer, nullable=False)
    report: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
```

- [ ] **Step 6: Register the model**

In `backend/app/models/__init__.py`, after the `UserTabLayout` import add:

```python
from app.models.period_report_cache import PeriodReportCache  # noqa: F401
```

And add `"PeriodReportCache",` to `__all__`.

- [ ] **Step 7: Create the migration**

Create `backend/migrations/versions/e1f2a3b4c5d6_add_period_reports.py`:

```python
"""add period_reports cache table

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-24 00:00:00.000000

Per-(user, days) cached PeriodReport payloads. One row per window per user
(unique user_id+days). Ownership via user_id + RLS (same pattern as
coach_briefs / user_tab_layouts).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "period_reports",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "generated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "days", name="uq_period_reports_user_days"),
    )
    op.create_index(
        op.f("ix_period_reports_user_id"), "period_reports", ["user_id"], unique=False,
    )

    op.execute("ALTER TABLE period_reports ENABLE ROW LEVEL SECURITY;")
    op.execute(
        """
        CREATE POLICY user_isolation ON period_reports
            USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS user_isolation ON period_reports;")
    op.execute("ALTER TABLE period_reports DISABLE ROW LEVEL SECURITY;")
    op.drop_index(op.f("ix_period_reports_user_id"), table_name="period_reports")
    op.drop_table("period_reports")
```

- [ ] **Step 8: Apply the migration up/down/up**

Run:
```bash
cd backend && .venv/bin/alembic upgrade head && .venv/bin/alembic downgrade -1 && .venv/bin/alembic upgrade head
```
Expected: no errors; head ends at `e1f2a3b4c5d6`. (Postgres up: `docker compose up -d` from `backend/`.)

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/period_report.py backend/app/models/period_report_cache.py \
  backend/app/models/__init__.py backend/migrations/versions/e1f2a3b4c5d6_add_period_reports.py \
  backend/tests/test_period_report_cache.py
git commit -m "feat(report): period_reports cache model, schema field, migration"
```

---

## Task 2: Read-through + precompute service

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report_cache.py`

**Interfaces:**
- Consumes: `PeriodReportCache` (Task 1); existing `build_report(db, user_id, days) -> PeriodReport`.
- Produces: `PERIOD_REPORT_TTL_HOURS = 18`; `PRESET_WINDOWS = (7, 14, 30)`; `async get_or_build_report(db, user_id, days) -> PeriodReport`; `async precompute_preset_reports(db, user_id) -> None`; `async _upsert_report(db, user_id, days, report) -> None`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_period_report_cache.py`:

```python
import types
from unittest.mock import AsyncMock, MagicMock

import pytest

import app.services.period_report as pr


def _fresh_row(days=7):
    row = MagicMock()
    row.report = _minimal_report_kwargs() | {"days": days}
    row.generated_at = datetime.now(timezone.utc)
    return row


def _db_returning(row):
    db = AsyncMock()

    async def _execute(*a, **k):
        res = MagicMock()
        res.scalar_one_or_none.return_value = row
        return res

    db.execute = _execute
    db.add = MagicMock()
    db.commit = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_get_or_build_returns_cache_without_building(monkeypatch):
    build = AsyncMock()
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(_fresh_row(7))
    out = await pr.get_or_build_report(db, user_id=1, days=7)
    assert out.days == 7
    build.assert_not_called()  # served from cache


@pytest.mark.asyncio
async def test_get_or_build_builds_and_upserts_on_miss(monkeypatch):
    built = PeriodReport(**_minimal_report_kwargs())
    build = AsyncMock(return_value=built)
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(None)  # no fresh row, no existing row
    out = await pr.get_or_build_report(db, user_id=1, days=7)
    build.assert_awaited_once()
    assert out.generated_at is not None  # stamped on build
    db.add.assert_called_once()          # inserted a new cache row


@pytest.mark.asyncio
async def test_precompute_writes_all_presets(monkeypatch):
    build = AsyncMock(return_value=PeriodReport(**_minimal_report_kwargs()))
    monkeypatch.setattr(pr, "build_report", build)
    db = _db_returning(None)
    await pr.precompute_preset_reports(db, user_id=1)
    assert build.await_count == len(pr.PRESET_WINDOWS)  # one build per preset


@pytest.mark.asyncio
async def test_precompute_continues_when_one_window_fails(monkeypatch):
    calls = {"n": 0}

    async def flaky(db, user_id, days):
        calls["n"] += 1
        if days == 14:
            raise RuntimeError("boom")
        return PeriodReport(**(_minimal_report_kwargs() | {"days": days}))

    monkeypatch.setattr(pr, "build_report", flaky)
    db = _db_returning(None)
    await pr.precompute_preset_reports(db, user_id=1)  # must not raise
    assert calls["n"] == len(pr.PRESET_WINDOWS)  # tried all three
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -v`
Expected: FAIL — `AttributeError`: `get_or_build_report` / `precompute_preset_reports` / `PRESET_WINDOWS` not defined.

- [ ] **Step 3: Implement the service additions**

In `backend/app/services/period_report.py`, add near the top-level imports (the module already imports `select` from sqlalchemy, `AsyncSession`, `datetime`, `timezone`, `timedelta`, `logging`):

```python
from pydantic import ValidationError

from app.models.period_report_cache import PeriodReportCache
```

Then add, at module scope (e.g. just above `async def build_report`):

```python
PERIOD_REPORT_TTL_HOURS = 18
PRESET_WINDOWS = (7, 14, 30)


async def _upsert_report(db: AsyncSession, user_id: int, days: int, report) -> None:
    """Insert or replace the cached row for (user, days), stamping generated_at."""
    from app.schemas.period_report import PeriodReport  # local import: avoid cycle

    assert isinstance(report, PeriodReport)
    now = datetime.now(timezone.utc)
    payload = report.model_dump(mode="json")
    result = await db.execute(
        select(PeriodReportCache).where(
            PeriodReportCache.user_id == user_id,
            PeriodReportCache.days == days,
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        db.add(PeriodReportCache(user_id=user_id, days=days, report=payload, generated_at=now))
    else:
        row.report = payload
        row.generated_at = now
    await db.commit()
    report.generated_at = now


async def get_or_build_report(db: AsyncSession, user_id: int, days: int):
    """Read-through cache around build_report. Returns a fresh cached PeriodReport
    when one exists within the TTL, else builds, upserts, and returns it."""
    from app.schemas.period_report import PeriodReport

    cutoff = datetime.now(timezone.utc) - timedelta(hours=PERIOD_REPORT_TTL_HOURS)
    result = await db.execute(
        select(PeriodReportCache).where(
            PeriodReportCache.user_id == user_id,
            PeriodReportCache.days == days,
            PeriodReportCache.generated_at >= cutoff,
        )
    )
    row = result.scalar_one_or_none()
    if row is not None:
        try:
            return PeriodReport.model_validate({**row.report, "generated_at": row.generated_at})
        except ValidationError:
            logger.warning("Discarding malformed cached report user=%s days=%s", user_id, days)
    report = await build_report(db, user_id, days)
    await _upsert_report(db, user_id, days, report)
    return report


async def precompute_preset_reports(db: AsyncSession, user_id: int) -> None:
    """Build + cache the preset windows. One window failing logs and continues."""
    for days in PRESET_WINDOWS:
        try:
            report = await build_report(db, user_id, days)
            await _upsert_report(db, user_id, days, report)
        except Exception as exc:  # noqa: BLE001 — best-effort cache warming
            logger.warning("precompute_preset_reports failed user=%s days=%s: %s", user_id, days, exc)
```

(`build_report` is defined later in the same module — referencing it from these functions is fine since they run at call time, not import time.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -v`
Expected: PASS (6 passed total in the file)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report_cache.py
git commit -m "feat(report): get_or_build_report + precompute_preset_reports"
```

---

## Task 3: Morning-gate pure helper

**Files:**
- Modify: `backend/app/services/period_report.py`
- Test: `backend/tests/test_period_report_cache.py`

**Interfaces:**
- Produces: `MORNING_HOUR = 9`; `should_precompute_daily(now_utc: datetime, tz_name: str | None, last_generated_at: datetime | None) -> bool`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_period_report_cache.py`:

```python
def test_morning_gate_false_before_morning():
    now = datetime(2026, 6, 24, 6, 0, tzinfo=timezone.utc)  # 06:00 UTC
    assert pr.should_precompute_daily(now, None, None) is False


def test_morning_gate_true_first_time_after_morning():
    now = datetime(2026, 6, 24, 10, 0, tzinfo=timezone.utc)  # 10:00 UTC
    assert pr.should_precompute_daily(now, None, None) is True


def test_morning_gate_false_when_already_done_today():
    now = datetime(2026, 6, 24, 14, 0, tzinfo=timezone.utc)
    last = datetime(2026, 6, 24, 9, 30, tzinfo=timezone.utc)  # generated at 09:30 today
    assert pr.should_precompute_daily(now, None, last) is False


def test_morning_gate_true_when_last_was_yesterday():
    now = datetime(2026, 6, 24, 9, 5, tzinfo=timezone.utc)
    last = datetime(2026, 6, 23, 12, 0, tzinfo=timezone.utc)
    assert pr.should_precompute_daily(now, None, last) is True


def test_morning_gate_respects_athlete_timezone():
    # 08:00 UTC == 10:00 in Europe/Berlin (UTC+2 in June) → past the 09:00 local gate
    now = datetime(2026, 6, 24, 8, 0, tzinfo=timezone.utc)
    assert pr.should_precompute_daily(now, "Europe/Berlin", None) is True


def test_morning_gate_bad_timezone_falls_back_to_utc():
    now = datetime(2026, 6, 24, 6, 0, tzinfo=timezone.utc)  # before 09:00 UTC
    assert pr.should_precompute_daily(now, "Not/AZone", None) is False
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -k morning_gate -v`
Expected: FAIL — `AttributeError`: `should_precompute_daily` not defined.

- [ ] **Step 3: Implement the helper**

In `backend/app/services/period_report.py`, add `from zoneinfo import ZoneInfo` to the imports, and add at module scope:

```python
MORNING_HOUR = 9


def should_precompute_daily(now_utc, tz_name, last_generated_at) -> bool:
    """True when it's at/after MORNING_HOUR in the athlete's local time AND the
    presets weren't already (re)generated at/after this morning's hour today.
    tz_name None or invalid → UTC."""
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except Exception:  # noqa: BLE001 — unknown IANA name → UTC
        tz = timezone.utc
    local_now = now_utc.astimezone(tz)
    if local_now.hour < MORNING_HOUR:
        return False
    if last_generated_at is None:
        return True
    morning_today = local_now.replace(hour=MORNING_HOUR, minute=0, second=0, microsecond=0)
    return last_generated_at.astimezone(tz) < morning_today
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -k morning_gate -v`
Expected: PASS (6 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/period_report.py backend/tests/test_period_report_cache.py
git commit -m "feat(report): should_precompute_daily morning gate"
```

---

## Task 4: Endpoint reads through the cache

**Files:**
- Modify: `backend/app/api/analytics.py`
- Test: `backend/tests/api/test_period_report_cache_api.py`

**Interfaces:**
- Consumes: `get_or_build_report` (Task 2).

- [ ] **Step 1: Write the failing API test**

Create `backend/tests/api/test_period_report_cache_api.py`:

```python
"""GET /analytics/period-report serves from the read-through cache."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.dependencies import get_current_active_user, get_db_for_user, get_current_user
from app.schemas.period_report import PeriodReport


def _user():
    u = MagicMock(); u.id = 1; u.is_active = True
    return u


def _report():
    return PeriodReport(
        days=7, start_date="2026-06-18", end_date="2026-06-24",
        prev_start_date="2026-06-11", prev_end_date="2026-06-17",
        has_baseline=False, grade_letter=None, grade_score=None,
        radar=[], improvements=[], weaknesses=[], milestones=[],
        ai_verdict="x", ai_model="rule-based-fallback",
        generated_at=datetime(2026, 6, 24, 7, 0, tzinfo=timezone.utc),
    )


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture(autouse=True)
def _clear():
    yield
    app.dependency_overrides.clear()


def _override():
    async def _u():
        return _user()

    async def _d():
        yield AsyncMock()

    app.dependency_overrides[get_current_active_user] = _u
    app.dependency_overrides[get_current_user] = _u
    app.dependency_overrides[get_db_for_user] = _d


def test_get_period_report_uses_cache_wrapper(client, monkeypatch):
    wrapper = AsyncMock(return_value=_report())
    monkeypatch.setattr("app.api.analytics.get_or_build_report", wrapper)
    _override()
    resp = client.get("/analytics/period-report?days=7")
    assert resp.status_code == 200
    assert resp.json()["generated_at"] is not None
    wrapper.assert_awaited_once()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/api/test_period_report_cache_api.py -v`
Expected: FAIL — `AttributeError`: `app.api.analytics` has no `get_or_build_report` (import not added yet).

- [ ] **Step 3: Wire the endpoint**

In `backend/app/api/analytics.py`, change the import on line 30 from:

```python
from app.services.period_report import build_report
```
to:
```python
from app.services.period_report import get_or_build_report
```
(`build_report` is referenced only at the single call site below, so swap the import outright — no unused import.)

In `get_period_report`, change the final line from:

```python
    return await build_report(db, _user.id, days)
```
to:
```python
    return await get_or_build_report(db, _user.id, days)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/api/test_period_report_cache_api.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/analytics.py backend/tests/api/test_period_report_cache_api.py
git commit -m "feat(report): GET /period-report reads through the cache"
```

---

## Task 5: Sync invalidates + warms the cache

**Files:**
- Modify: `backend/app/services/garmin_sync_service.py`
- Test: `backend/tests/test_period_report_cache.py`

**Interfaces:**
- Consumes: `PeriodReportCache` (Task 1); `precompute_preset_reports`, `should_precompute_daily` (Tasks 2–3); existing `total_activities` (count of newly synced activities) and `today` (UTC date) locals inside `sync_user_garmin`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_period_report_cache.py`:

```python
import app.services.garmin_sync_service as sync_mod


@pytest.mark.asyncio
async def test_refresh_cache_warms_on_new_activity(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: False)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=3, tz_name=None,
    )
    precompute.assert_awaited_once()  # a workout landed → warm presets


@pytest.mark.asyncio
async def test_refresh_cache_warms_on_daily_gate_without_activity(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: True)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=0, tz_name="Europe/Berlin",
    )
    precompute.assert_awaited_once()  # daily morning refresh


@pytest.mark.asyncio
async def test_refresh_cache_skips_when_nothing_due(monkeypatch):
    precompute = AsyncMock()
    monkeypatch.setattr(sync_mod, "precompute_preset_reports", precompute)
    monkeypatch.setattr(sync_mod, "should_precompute_daily", lambda *a, **k: False)
    db = _db_returning(None)
    await sync_mod._refresh_period_report_cache(
        db, user_id=1, today=datetime.now(timezone.utc).date(),
        new_activities=0, tz_name=None,
    )
    precompute.assert_not_called()  # no workout + not morning-due → no warm
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -k refresh_cache -v`
Expected: FAIL — `AttributeError`: `garmin_sync_service` has no `_refresh_period_report_cache`.

- [ ] **Step 3: Implement the helper + wire it into the sync**

In `backend/app/services/garmin_sync_service.py`, add to the imports (the module already imports `delete`, `select`, `AthleteProfile`, `datetime`, `UTC`, `timezone`):

```python
from app.models.period_report_cache import PeriodReportCache
from app.services.period_report import precompute_preset_reports, should_precompute_daily
```

Add this helper at module scope (e.g. just above `async def sync_user_garmin`):

```python
async def _refresh_period_report_cache(db, user_id, today, new_activities, tz_name) -> None:
    """Keep the period_reports cache fresh after a sync. Best-effort: never raises.

    - A workout landed (new_activities > 0): invalidate today's cached reports
      (all windows, incl. custom) and warm the presets.
    - Else, on the first sync past the morning hour today: warm the presets.
    """
    try:
        last = (
            await db.execute(
                select(PeriodReportCache.generated_at)
                .where(PeriodReportCache.user_id == user_id)
                .order_by(PeriodReportCache.generated_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        daily_due = should_precompute_daily(datetime.now(timezone.utc), tz_name, last)

        if new_activities > 0:
            await db.execute(
                delete(PeriodReportCache).where(
                    PeriodReportCache.user_id == user_id,
                    PeriodReportCache.generated_at
                    >= datetime.combine(today, datetime.min.time(), tzinfo=UTC),
                )
            )
            await db.commit()
            await precompute_preset_reports(db, user_id)
        elif daily_due:
            await precompute_preset_reports(db, user_id)
    except Exception as exc:  # noqa: BLE001 — cache refresh must not break sync
        logger.warning(
            "period-report cache refresh failed for user_id=%s (non-fatal): %s", user_id, exc
        )
        await db.rollback()
```

Then, inside `sync_user_garmin`, immediately AFTER the existing `try/except` block that invalidates `CoachBrief` (the block ending with its `await db.rollback()` around line 511), add:

```python
        # Keep the period-report cache fresh (mirror coach_briefs). Reads the
        # athlete's timezone for the once-a-day morning gate.
        prof = (
            await db.execute(
                select(AthleteProfile).where(AthleteProfile.user_id == user_id)
            )
        ).scalar_one_or_none()
        await _refresh_period_report_cache(
            db, user_id, today, total_activities, prof.timezone if prof else None,
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py -k refresh_cache -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Run the whole cache test file + confirm import health**

Run: `cd backend && .venv/bin/pytest tests/test_period_report_cache.py tests/api/test_period_report_cache_api.py -q`
Expected: all pass. Then `cd backend && .venv/bin/python -c "import app.main"` → no import errors.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/garmin_sync_service.py backend/tests/test_period_report_cache.py
git commit -m "feat(report): sync invalidates + warms period_reports cache"
```

---

## Self-Review Notes

- **Spec coverage:** cache table + RLS + unique (Task 1); read-through `get_or_build_report` + 18h TTL (Task 2); `precompute_preset_reports` for 7/14/30 (Task 2); `generated_at` on the schema (Task 1) + surfaced by the endpoint (Task 4); post-workout invalidation + warm and once-a-day morning gate at 09:00 athlete-local with UTC fallback (Tasks 3 + 5); endpoint reads through (Task 4). All spec sections map to a task.
- **Type consistency:** `get_or_build_report(db, user_id, days) -> PeriodReport`, `precompute_preset_reports(db, user_id)`, `should_precompute_daily(now_utc, tz_name, last_generated_at)`, `_refresh_period_report_cache(db, user_id, today, new_activities, tz_name)` — names/params identical across the tasks that define and call them.
- **Non-fatal posture:** every cache mutation inside the sync is wrapped so a failure logs + rolls back without breaking the sync's return, matching the existing coach-brief invalidation.
- **RLS note for the system job:** the sync uses `async_session_maker` (RLS bypassed) and all cache queries are explicitly scoped by `user_id`, consistent with the rest of `sync_user_garmin`.
