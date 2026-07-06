# Race Debrief — Phase 2: Orchestrator + Schema + Endpoint + AI verdict — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 11 pure Phase-1 analyzers into a callable API: a `RaceDebrief` schema, a `build_debrief` orchestrator that composes every analyzer over a real activity's streams (each in its own try/except → graceful `None`), a read-through cache, an AI verdict mirroring the period-report pattern (rule-based fallback), and `GET /analytics/activity-debrief/{activity_id}`.

**Architecture:** Mirror the shipped period-report backend exactly: a `RaceDebriefCache` (JSONB, keyed by user+activity) + `get_or_build_debrief` read-through cache + `_ai_verdict` (Anthropic with rule-based fallback) + a thin router endpoint. The orchestrator loads the activity, its `ActivityStream`, the athlete profile (mass, FTP), and the athlete's rolling MMP envelope, then runs every analyzer defensively and assembles the schema.

**Tech Stack:** FastAPI, async SQLAlchemy 2.0, PostgreSQL + JSONB, Alembic, Pydantic v2, the `anthropic` async SDK, pytest.

## Global Constraints

- **Graceful degradation:** the endpoint returns a `RaceDebrief` even when most blocks are `None`; every analyzer runs in its own try/except so one failure never sinks the report. No `ANTHROPIC_API_KEY` → rule-based verdict (`ai_model="rule-based-fallback"`).
- **AI model:** use `settings.COACH_MODEL` (mirrors `period_report._ai_verdict`); `temperature=0`; ephemeral-cached system prompt; verdict text capped.
- **Reuse the period-report machinery verbatim** where possible: cache upsert via `pg_insert(...).on_conflict_do_update`, `model_dump(mode="json")`, RLS via `get_db_for_user`.
- **RLS/ownership:** all queries run on the RLS-scoped session; the endpoint 404s when the activity isn't the caller's.
- **Power is already clean** (`ActivityStream.streams["power"]` is `list[float]`, no `None` — Phase 0 guarantees it); speed/altitude/cadence may contain `None` and the analyzers already tolerate that.
- Pydantic models: all analyzer blocks are `Optional`, default `None`; lists default `[]`.
- Run tests via `cd backend && .venv/bin/python -m pytest ...`. Commit after each task. Test style matches `backend/tests/`.

---

## File Structure

- `backend/app/models/race_debrief_cache.py` — **create**: `RaceDebriefCache` (mirrors `PeriodReportCache`).
- `backend/migrations/versions/<rev>_race_debrief_cache.py` — **create**: table migration.
- `backend/app/schemas/race_debrief.py` — **create**: `RaceDebrief` + nested block models.
- `backend/app/services/race_debrief.py` — **create**: `build_debrief`, rule-based grader/verdict, `_ai_verdict`, cache `get_or_build_debrief`/`_upsert_debrief`.
- `backend/app/api/analytics.py` — **modify**: add the `GET /analytics/activity-debrief/{activity_id}` route.
- Tests: `backend/tests/services/test_race_debrief.py`, `backend/tests/api/test_activity_debrief_endpoint.py` — **create**.

---

## Task 1: Cache model + migration

**Files:**
- Create: `backend/app/models/race_debrief_cache.py`
- Create: `backend/migrations/versions/<rev>_race_debrief_cache.py`

**Interfaces:**
- Produces: `RaceDebriefCache` — `id` (BigInteger PK), `user_id` (FK users, cascade, indexed), `activity_id` (BigInteger), `report` (JSONB), `generated_at` (tz DateTime, server default now). `UniqueConstraint(user_id, activity_id)`.

- [ ] **Step 1: Create the model**

Create `backend/app/models/race_debrief_cache.py`:

```python
"""RaceDebriefCache — one cached RaceDebrief per (user, activity).

Mirrors PeriodReportCache: a JSONB payload + generated_at, RLS-protected, one
latest row per (user_id, activity_id) via UniqueConstraint + upsert.
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger, DateTime, ForeignKey, Integer, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RaceDebriefCache(Base):
    __tablename__ = "race_debriefs"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_id", name="uq_race_debriefs_user_activity"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    activity_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    report: Mapped[dict] = mapped_column(JSONB, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )
```

- [ ] **Step 2: Generate the migration**

Run: `cd backend && .venv/bin/python -m alembic revision -m "race_debrief_cache"`.
Determine the true head first: `cd backend && .venv/bin/python -m alembic heads` (do NOT assume). Set `down_revision` to that head. Fill `upgrade()`/`downgrade()`:

```python
def upgrade() -> None:
    op.create_table(
        "race_debriefs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("activity_id", sa.BigInteger(), nullable=False),
        sa.Column("report", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True),
                  server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "activity_id", name="uq_race_debriefs_user_activity"),
    )
    op.create_index("ix_race_debriefs_user_id", "race_debriefs", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_race_debriefs_user_id", table_name="race_debriefs")
    op.drop_table("race_debriefs")
```

Ensure `from sqlalchemy.dialects import postgresql` and `import sqlalchemy as sa` are imported in the migration.

- [ ] **Step 3: Verify migration is well-formed**

`cd backend && .venv/bin/python -m py_compile migrations/versions/*race_debrief_cache*.py` → clean. If a DB is reachable, `.venv/bin/python -m alembic upgrade head`; if not (connection refused), note it as an operational follow-up (expected in sandbox), and confirm `down_revision` points at the real head with a single linear chain.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/race_debrief_cache.py backend/migrations/versions/*race_debrief_cache*.py
git commit -m "feat(debrief): RaceDebriefCache model + migration"
```

---

## Task 2: RaceDebrief schema

**Files:**
- Create: `backend/app/schemas/race_debrief.py`
- Test: `backend/tests/services/test_race_debrief_schema.py`

**Interfaces:**
- Produces the Pydantic `RaceDebrief` and its nested block models (all blocks Optional, lists default `[]`), mirroring the Phase-1 analyzer dataclasses. Fields below are the contract the orchestrator (Task 3) fills and the frontend (Phase 3) renders.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/services/test_race_debrief_schema.py`:

```python
"""The RaceDebrief schema validates minimal and rich payloads."""
from __future__ import annotations

from app.schemas.race_debrief import RaceDebrief


def test_minimal_payload_validates():
    rd = RaceDebrief(
        activity_id=1,
        header={"title": "Race", "date": "2026-07-01T09:00:00Z", "sport": "cycling",
                "distance_km": 100.0, "elevation_m": 1500.0, "moving_time_s": 12000,
                "np_watts": 230.0, "if_": 0.85, "tss": 250.0, "total_kj": 2500.0,
                "avg_speed_kmh": 30.0},
        verdict={"grade_letter": "B", "grade_score": 82.0, "ai_verdict": "Solid ride.",
                 "ai_model": "rule-based-fallback", "went_well": ["Strong finish"],
                 "watch_out": ["Faded mid-race"]},
    )
    assert rd.activity_id == 1
    assert rd.verdict.grade_letter == "B"
    # optional blocks default None / []
    assert rd.pacing is None
    assert rd.segments == []
    assert rd.plan == []


def test_rich_blocks_validate():
    rd = RaceDebrief(
        activity_id=2,
        header={"title": "R", "date": "2026-07-01T09:00:00Z", "sport": "cycling",
                "distance_km": 1.0, "elevation_m": 0.0, "moving_time_s": 60,
                "np_watts": 1.0, "if_": None, "tss": 0.0, "total_kj": 0.0,
                "avg_speed_kmh": 0.0},
        verdict={"grade_letter": "A", "grade_score": 95.0, "ai_verdict": "x",
                 "ai_model": "m", "went_well": [], "watch_out": []},
        pacing={"first_half_np": 200.0, "second_half_np": 190.0, "split_pct": -5.0,
                "variability_index": 1.1, "surge_count": 3, "phase_np": [200.0, 195.0, 190.0],
                "final_30min_np": 188.0, "zone_time_pct": {"zone2": 50.0}},
        segments=[{"kind": "climb", "start_s": 0, "end_s": 60, "duration_s": 60,
                   "distance_m": 600.0, "elev_gain_m": 40.0, "elev_loss_m": 0.0,
                   "avg_grade_pct": 6.6, "avg_power": 250.0, "avg_speed_ms": 10.0}],
        plan=[{"priority": 1, "headline": "Pace the opener", "race_tactic": "20W lower",
               "training_fix": "VO2 intervals", "tone": "caution"}],
    )
    assert rd.pacing.surge_count == 3
    assert rd.segments[0].kind == "climb"
    assert rd.plan[0].priority == 1
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_race_debrief_schema.py -v`
Expected: FAIL with `ModuleNotFoundError: app.schemas.race_debrief`.

- [ ] **Step 3: Implement the schema**

Create `backend/app/schemas/race_debrief.py`:

```python
"""Pydantic contract for the Race Debrief (one deep analysis of a single ride).

Every analytical block is Optional and renders nothing when absent — mirrors the
graceful-degradation contract of the underlying analyzers. Field names match the
Phase-1 analyzer dataclasses so the orchestrator can map them directly.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DebriefHeader(BaseModel):
    title: str
    date: str
    sport: str
    distance_km: float
    elevation_m: float
    moving_time_s: int
    np_watts: float
    if_: float | None = None
    tss: float
    total_kj: float
    avg_speed_kmh: float


class DebriefVerdict(BaseModel):
    grade_letter: str
    grade_score: float
    ai_verdict: str
    ai_model: str
    went_well: list[str] = []
    watch_out: list[str] = []


class KeyMomentOut(BaseModel):
    kind: str
    at_s: int
    label: str
    value: float
    tone: str


class RoutePoint(BaseModel):
    lat: float
    lng: float
    power: float | None = None
    grade: float | None = None


class DebriefStory(BaseModel):
    # Downsampled aligned series for the synchronized timeline.
    t: list[int] = []
    power: list[float] = []
    hr: list[float | None] = []
    wbal: list[float] = []
    altitude: list[float | None] = []
    speed: list[float | None] = []
    moments: list[KeyMomentOut] = []
    route: list[RoutePoint] = []


class SegmentOut(BaseModel):
    kind: str
    start_s: int
    end_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    elev_loss_m: float
    avg_grade_pct: float
    avg_power: float | None = None
    avg_speed_ms: float | None = None


class ClimbOut(BaseModel):
    start_s: int
    duration_s: int
    distance_m: float
    elev_gain_m: float
    avg_grade_pct: float
    vam_m_per_h: float
    w_per_kg: float | None = None
    avg_power: float | None = None
    category: str


class PacingOut(BaseModel):
    first_half_np: float
    second_half_np: float
    split_pct: float
    variability_index: float | None = None
    surge_count: int
    phase_np: list[float] = []
    final_30min_np: float | None = None
    zone_time_pct: dict[str, float] = {}


class EffortMatchOut(BaseModel):
    duration_s: int
    ride_watts: float
    best_watts: float | None = None
    pct_of_best: float | None = None
    is_pr: bool


class EfficiencyOut(BaseModel):
    efficiency_factor: float | None = None
    avg_hr: float | None = None
    decoupling_pct: float | None = None
    np_watts: float


class MatchOut(BaseModel):
    start_s: int
    end_s: int
    depth_j: float
    min_bal_j: float


class MatchbookOut(BaseModel):
    matches: list[MatchOut] = []
    match_count: int
    time_above_cp_s: int
    min_bal_j: float
    fully_depleted: bool


class QuadrantOut(BaseModel):
    q1_pct: float
    q2_pct: float
    q3_pct: float
    q4_pct: float
    force_threshold_n: float
    cadence_threshold_rpm: float
    sample_count: int


class FuelingOut(BaseModel):
    total_kj: float
    total_kcal: float
    cho_g_estimate: float
    fat_g_estimate: float
    carb_target_g_per_h: tuple[float, float]
    duration_h: float
    likely_underfueled: bool | None = None
    note: str


class WkoModelOut(BaseModel):
    mftp_watts: float
    cp_watts: float
    w_prime_j: float
    frc_j: float
    pmax_watts: float
    tte_s: int | None = None
    vo2max_estimate: float | None = None
    r_squared: float


class CdaOut(BaseModel):
    cda_m2: float
    sample_count: int
    avg_speed_ms: float


class PrescriptionOut(BaseModel):
    priority: int
    headline: str
    race_tactic: str
    training_fix: str
    tone: str = "neutral"


class RaceDebrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity_id: int
    header: DebriefHeader
    verdict: DebriefVerdict
    story: DebriefStory | None = None
    segments: list[SegmentOut] = []
    climbs: list[ClimbOut] = []
    pacing: PacingOut | None = None
    efforts: list[EffortMatchOut] = []
    efficiency: EfficiencyOut | None = None
    matchbook: MatchbookOut | None = None
    quadrant: QuadrantOut | None = None
    fueling: FuelingOut | None = None
    wko: WkoModelOut | None = None
    cda: CdaOut | None = None
    plan: list[PrescriptionOut] = []
    generated_at: datetime | None = None
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_race_debrief_schema.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/race_debrief.py backend/tests/services/test_race_debrief_schema.py
git commit -m "feat(debrief): RaceDebrief pydantic schema"
```

---

## Task 3: Orchestrator + rule-based grader + cache

**Files:**
- Create: `backend/app/services/race_debrief.py`
- Test: `backend/tests/services/test_race_debrief.py`

**Interfaces:**
- Consumes: all Phase-1 analyzers, `ActivityStream`, `Activity`, `AthleteProfile` (`weight_kg`, `ftp_watts`), `athlete_power_profile.aggregate_mmp_curves`, `w_balance.w_prime_balance`, the schema from Task 2.
- Produces:
  - `assemble_debrief(activity, stream, profile, athlete_envelope) -> RaceDebrief` — **pure** (no DB): runs every analyzer defensively, builds header/story/blocks, computes the rule-based grade + verdict + plan. This is the unit-testable core.
  - `async build_debrief(db, user_id, activity_id) -> RaceDebrief | None` — loads the rows, calls `assemble_debrief`, then overlays the AI verdict (Task 4 wires `_ai_verdict` in; in this task `ai_model="rule-based-fallback"`). Returns `None` when the activity or its stream is missing.
  - `async get_or_build_debrief(db, user_id, activity_id) -> RaceDebrief | None` + `_upsert_debrief` — read-through cache mirroring `period_report`.

- [ ] **Step 1: Write the failing test (pure assembler with a synthetic ride)**

Create `backend/tests/services/test_race_debrief.py`:

```python
"""Tests for the pure race-debrief assembler."""
from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from app.services.race_debrief import assemble_debrief


def _synthetic_stream(n=1800):
    # A climb-y interval ride: steady base with surges, rising then falling altitude.
    power = []
    for i in range(n):
        power.append(400.0 if (i % 300) < 40 else 180.0)
    altitude = [100.0 + min(i, n - i) * 0.03 for i in range(n)]
    distance = [10.0 * i for i in range(n)]
    speed = [10.0] * n
    hr = [140.0 + (i / n) * 15 for i in range(n)]
    cadence = [90.0] * n
    return {
        "power": power, "heart_rate": hr, "cadence": cadence, "altitude": altitude,
        "distance": distance, "speed": speed,
    }


def _activity():
    return SimpleNamespace(
        id=1, title="Sunday Race", sport="cycling",
        started_at=datetime(2026, 7, 1, 9, 0, tzinfo=timezone.utc),
        distance_meters=18000.0, duration_seconds=1800, tss=90.0,
    )


def _stream_row(streams):
    return SimpleNamespace(
        streams=streams, mmp_curve={5: 400.0, 60: 380.0, 300: 300.0, 600: 280.0, 1200: 260.0},
        total_kj=None, decoupling_pct=None, cp_watts=250.0, w_prime_j=20000.0, eftp_watts=256.0,
    )


def test_assemble_produces_header_verdict_and_blocks():
    streams = _synthetic_stream()
    profile = SimpleNamespace(weight_kg=70.0, ftp_watts=250)
    envelope = {5: 500.0, 60: 400.0, 300: 320.0, 600: 300.0, 1200: 280.0}
    rd = assemble_debrief(_activity(), _stream_row(streams), profile, envelope)

    assert rd.activity_id == 1
    assert rd.header.title == "Sunday Race"
    assert rd.header.moving_time_s == 1800
    assert rd.verdict.grade_letter in {"A", "B", "C", "D", "F"}
    # Analyzer blocks populated for a rich ride:
    assert rd.pacing is not None and rd.pacing.surge_count >= 1
    assert rd.efficiency is not None and rd.efficiency.efficiency_factor is not None
    assert rd.matchbook is not None
    assert rd.wko is not None and rd.wko.mftp_watts > 0
    assert rd.story is not None and len(rd.story.power) > 0
    assert rd.efforts  # effort matching vs the envelope
    assert rd.plan  # at least one prescription


def test_assemble_degrades_without_optional_channels():
    # No altitude/speed/hr/cadence → segmentation/climb/efficiency/quadrant/cda hide,
    # but header/verdict/pacing/matchbook still produced, no exception.
    n = 1200
    streams = {"power": [200.0] * n, "heart_rate": [], "cadence": [],
               "altitude": [], "distance": [], "speed": []}
    profile = SimpleNamespace(weight_kg=None, ftp_watts=250)
    rd = assemble_debrief(_activity(), _stream_row(streams), profile, {})
    assert rd.verdict is not None
    assert rd.segments == []
    assert rd.climbs == []
    assert rd.cda is None
    assert rd.pacing is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_race_debrief.py -v`
Expected: FAIL with `ModuleNotFoundError: app.services.race_debrief`.

- [ ] **Step 3: Implement the orchestrator**

Create `backend/app/services/race_debrief.py`:

```python
"""Race Debrief orchestrator — compose the Phase-1 analyzers into one report.

`assemble_debrief` is pure (plain activity/stream/profile inputs → RaceDebrief):
it runs every analyzer in its own try/except so one failure never sinks the
report, builds the header/story/blocks, and derives a rule-based grade, verdict,
and plan. `build_debrief`/`get_or_build_debrief` add the DB load + read-through
cache, mirroring period_report.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.activity import Activity
from app.models.activity_stream import ActivityStream
from app.models.athlete_profile import AthleteProfile
from app.models.race_debrief_cache import RaceDebriefCache
from app.schemas.race_debrief import RaceDebrief
from app.services import (
    cda_estimate, climbing_analysis, effort_matching, efficiency_metrics,
    fueling_analysis, key_moments, matchbook, pacing_analysis, quadrant_analysis,
    ride_segmentation, wko_power_model,
)
from app.services.athlete_power_profile import aggregate_mmp_curves
from app.services.environment import air_density
from app.services.w_balance import w_prime_balance

logger = logging.getLogger(__name__)

DEBRIEF_TTL_HOURS = 24 * 30  # a ride's analysis is stable; long TTL
_STORY_MAX_POINTS = 600


def _try(label: str, fn, default=None):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 — one analyzer never sinks the report
        logger.warning("debrief analyzer %s failed (non-fatal): %s", label, exc)
        return default


def _downsample(series: list, max_points: int) -> list:
    n = len(series)
    if n <= max_points:
        return list(series)
    step = n / max_points
    return [series[int(i * step)] for i in range(max_points)]


def _mps_to_kmh(v: float | None) -> float:
    return round((v or 0.0) * 3.6, 1)


def _grade_from_score(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def _rule_based_grade(pacing, efficiency, matchbook_, efforts, durability_drop):
    """Deterministic 0–100 ride-execution score from the analyzer blocks."""
    score = 80.0
    good: list[str] = []
    bad: list[str] = []
    if pacing is not None:
        if pacing.split_pct < -8:
            score -= 10; bad.append("Positive split — faded in the second half")
        elif pacing.split_pct > -3:
            score += 4; good.append("Evenly paced")
        if pacing.variability_index and pacing.variability_index > 1.25:
            score -= 4; bad.append("Very surgy (high variability)")
    if efficiency is not None and efficiency.decoupling_pct is not None:
        if efficiency.decoupling_pct < 5:
            score += 5; good.append("Low aerobic decoupling — well fuelled/paced")
        elif efficiency.decoupling_pct > 10:
            score -= 8; bad.append("High cardiac drift late in the ride")
    if matchbook_ is not None and matchbook_.fully_depleted:
        score -= 6; bad.append("Emptied the anaerobic tank")
    prs = [e for e in (efforts or []) if e.is_pr]
    if prs:
        score += 6; good.append(f"Set {len(prs)} power PR(s)")
    if durability_drop is not None and durability_drop > 15:
        score -= 6; bad.append("Power faded badly under fatigue")
    score = max(0.0, min(100.0, score))
    return score, good[:3], bad[:3]


def _build_plan(pacing, matchbook_, efficiency, fueling, durability_drop):
    """Deterministic ranked prescriptions with a race tactic + training fix each."""
    plan = []
    if matchbook_ is not None and matchbook_.fully_depleted:
        plan.append(dict(priority=len(plan) + 1,
            headline="Ration your matches early",
            race_tactic="Sit in on the first climb; hold 20–25 W under threshold.",
            training_fix="VO2 40/20s ×2/wk to raise W′ (anaerobic capacity).",
            tone="caution"))
    if fueling is not None and fueling.likely_underfueled:
        lo, hi = fueling.carb_target_g_per_h
        plan.append(dict(priority=len(plan) + 1,
            headline="Fuel earlier and more",
            race_tactic=f"Target {int(lo)}–{int(hi)} g carbs/h from the gun.",
            training_fix="Gut-training long rides at race carb intake.",
            tone="bad"))
    if pacing is not None and pacing.split_pct < -8:
        plan.append(dict(priority=len(plan) + 1,
            headline="Pace the first half more conservatively",
            race_tactic="Negative-split it: start ~5% easier than felt right.",
            training_fix="Threshold work at the end of long rides for durability.",
            tone="caution"))
    if durability_drop is not None and durability_drop > 15:
        plan.append(dict(priority=len(plan) + 1,
            headline="Build fatigue resistance",
            race_tactic="Practice key efforts late, on tired legs.",
            training_fix="Add tempo/threshold blocks after 2+ h of endurance.",
            tone="neutral"))
    if not plan:
        plan.append(dict(priority=1, headline="Keep doing what works",
            race_tactic="Repeat this pacing and fuelling.",
            training_fix="Progress load gradually; protect recovery.",
            tone="good"))
    return plan


def assemble_debrief(activity, stream, profile, athlete_envelope: dict) -> RaceDebrief:
    """Pure assembler: analyzers → RaceDebrief with a rule-based verdict. See docstring."""
    s = stream.streams or {}
    power = [float(p) for p in (s.get("power") or [])]
    hr = s.get("heart_rate") or []
    cadence = s.get("cadence") or []
    altitude = s.get("altitude") or []
    distance = s.get("distance") or []
    speed = s.get("speed") or []
    latitude = s.get("latitude") or []
    longitude = s.get("longitude") or []
    n = len(power)

    ftp = float(profile.ftp_watts) if profile and profile.ftp_watts else None
    mass = float(profile.weight_kg) if profile and getattr(profile, "weight_kg", None) else None
    cp = float(getattr(stream, "cp_watts", None) or 0.0)
    w_prime = float(getattr(stream, "w_prime_j", None) or 0.0)
    mmp = {int(k): float(v) for k, v in (stream.mmp_curve or {}).items()}

    # --- analyzer blocks (each defensive) ---
    hr_clean = [float(h) for h in hr] if hr and all(h is not None for h in hr) else None
    np_watts = _try("np", lambda: __import__(
        "app.services.training_load", fromlist=["calculate_np"]).calculate_np(power), 0.0) if power else 0.0

    segments = _try("segmentation", lambda: ride_segmentation.segment_ride(
        altitude, distance, power=power, speed=speed), []) or []
    climbs = _try("climbing", lambda: climbing_analysis.analyze_climbs(segments, mass), []) or []
    pacing = _try("pacing", lambda: pacing_analysis.analyze_pacing(power, ftp, hr_clean))
    efficiency = _try("efficiency", lambda: efficiency_metrics.analyze_efficiency(power, hr_clean, ftp))
    mb = _try("matchbook", lambda: matchbook.analyze_matchbook(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    quadrant = _try("quadrant", lambda: quadrant_analysis.analyze_quadrants(power, cadence, ftp=ftp))
    fueling = _try("fueling", lambda: fueling_analysis.analyze_fueling(
        power, if_=(round(np_watts / ftp, 3) if ftp else None),
        durability_drop_pct=getattr(stream, "durability_drop_pct", None),
        decoupling_pct=(efficiency.decoupling_pct if efficiency else None)))
    efforts = _try("efforts", lambda: effort_matching.match_efforts(mmp, athlete_envelope), []) or []
    wko = _try("wko", lambda: wko_power_model.fit_wko_model(mmp, mass))
    rho = _try("air_density", lambda: air_density(
        altitude[0] if altitude and altitude[0] is not None else 0.0), 1.225) or 1.225
    cda = _try("cda", lambda: cda_estimate.estimate_cda(
        power, speed, altitude, mass, air_density=rho)) if mass else None
    wbal = _try("wbal", lambda: w_prime_balance(power, cp, w_prime)) if cp > 0 and w_prime > 0 else None
    moments = _try("moments", lambda: key_moments.detect_key_moments(power, wbal, hr_clean), []) or []

    # --- header ---
    total_kj = round(sum(power) / 1000.0, 1) if power else 0.0
    if_val = round(np_watts / ftp, 3) if ftp else None
    dist_km = round((activity.distance_meters or 0.0) / 1000.0, 1)
    avg_speed_kmh = round(dist_km / (n / 3600.0), 1) if n > 0 and dist_km else 0.0
    header = dict(
        title=activity.title or "Race", date=activity.started_at.isoformat(),
        sport=activity.sport, distance_km=dist_km,
        elevation_m=round(sum(seg.elev_gain_m for seg in segments), 0),
        moving_time_s=n, np_watts=round(np_watts, 1), if_=if_val,
        tss=float(activity.tss or 0.0), total_kj=total_kj, avg_speed_kmh=avg_speed_kmh,
    )

    # --- story (downsampled) ---
    step_idx = list(range(n))
    story = dict(
        t=_downsample(step_idx, _STORY_MAX_POINTS),
        power=_downsample(power, _STORY_MAX_POINTS),
        hr=_downsample(hr, _STORY_MAX_POINTS) if hr else [],
        wbal=_downsample(wbal, _STORY_MAX_POINTS) if wbal else [],
        altitude=_downsample(altitude, _STORY_MAX_POINTS) if altitude else [],
        speed=_downsample(speed, _STORY_MAX_POINTS) if speed else [],
        moments=[m.__dict__ for m in moments],
        route=[{"lat": la, "lng": lo, "power": power[i] if i < n else None,
                "grade": None}
               for i, (la, lo) in enumerate(zip(latitude, longitude))
               if la is not None and lo is not None][:_STORY_MAX_POINTS],
    )

    # --- verdict + plan ---
    durability_drop = getattr(stream, "durability_drop_pct", None)
    score, good, bad = _rule_based_grade(pacing, efficiency, mb, efforts, durability_drop)
    verdict = dict(
        grade_letter=_grade_from_score(score), grade_score=round(score, 0),
        ai_verdict=_rule_based_verdict(activity, score, good, bad),
        ai_model="rule-based-fallback", went_well=good, watch_out=bad,
    )
    plan = _build_plan(pacing, mb, efficiency, fueling, durability_drop)

    return RaceDebrief(
        activity_id=activity.id, header=header, verdict=verdict, story=story,
        segments=[seg.__dict__ for seg in segments],
        climbs=[c.__dict__ for c in climbs],
        pacing=pacing.__dict__ if pacing else None,
        efforts=[e.__dict__ for e in efforts],
        efficiency=efficiency.__dict__ if efficiency else None,
        matchbook={**mb.__dict__, "matches": [m.__dict__ for m in mb.matches]} if mb else None,
        quadrant=quadrant.__dict__ if quadrant else None,
        fueling=fueling.__dict__ if fueling else None,
        wko=wko.__dict__ if wko else None,
        cda=cda.__dict__ if cda else None,
        plan=plan,
    )


def _rule_based_verdict(activity, score: float, good: list[str], bad: list[str]) -> str:
    grade = _grade_from_score(score)
    lead = {"A": "A standout ride.", "B": "A strong ride.", "C": "A solid ride.",
            "D": "A tough day.", "F": "A day to learn from."}[grade]
    win = f" What worked: {good[0].lower()}." if good else ""
    fix = f" To improve: {bad[0].lower()}." if bad else ""
    return (lead + win + fix)[:600]


async def _upsert_debrief(db: AsyncSession, user_id: int, activity_id: int, report: RaceDebrief) -> None:
    now = datetime.now(timezone.utc)
    payload = report.model_dump(mode="json")
    stmt = pg_insert(RaceDebriefCache).values(
        user_id=user_id, activity_id=activity_id, report=payload, generated_at=now,
    ).on_conflict_do_update(
        index_elements=["user_id", "activity_id"],
        set_={"report": payload, "generated_at": now},
    )
    await db.execute(stmt)
    await db.commit()
    report.generated_at = now


async def build_debrief(db: AsyncSession, user_id: int, activity_id: int) -> RaceDebrief | None:
    activity = await db.get(Activity, activity_id)
    if activity is None:
        # composite-PK hypertable: fall back to a scalar-id lookup
        activity = (await db.execute(
            select(Activity).where(Activity.id == activity_id))).scalars().first()
    if activity is None:
        return None
    stream = await db.get(ActivityStream, activity_id)
    if stream is None or not (stream.streams or {}).get("power"):
        return None
    profile = (await db.execute(
        select(AthleteProfile).where(AthleteProfile.user_id == user_id))).scalar_one_or_none()
    env_res = await db.execute(
        select(ActivityStream.mmp_curve).where(
            ActivityStream.user_id == user_id, ActivityStream.mmp_curve.isnot(None)))
    envelope = aggregate_mmp_curves([row[0] for row in env_res.all() if row[0]])
    report = assemble_debrief(activity, stream, profile, envelope)
    # Task 4 overlays the AI verdict here.
    return report


async def get_or_build_debrief(db: AsyncSession, user_id: int, activity_id: int) -> RaceDebrief | None:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=DEBRIEF_TTL_HOURS)
    row = (await db.execute(
        select(RaceDebriefCache).where(
            RaceDebriefCache.user_id == user_id,
            RaceDebriefCache.activity_id == activity_id,
            RaceDebriefCache.generated_at >= cutoff))).scalar_one_or_none()
    if row is not None:
        try:
            return RaceDebrief.model_validate({**row.report, "generated_at": row.generated_at})
        except ValidationError:
            logger.warning("Discarding malformed cached debrief user=%s act=%s", user_id, activity_id)
    report = await build_debrief(db, user_id, activity_id)
    if report is None:
        return None
    await _upsert_debrief(db, user_id, activity_id, report)
    return report
```

> **Note:** `aggregate_mmp_curves([])` must return `{}` (empty) — confirm it handles an empty list without error before relying on it in `build_debrief`; if it raises on empty input, guard the call with `if curves else {}`. Also confirm `training_load.calculate_np` import path used in `_try("np", ...)` — prefer a top-level `from app.services.training_load import calculate_np` import over the `__import__` shim in the final code; the shim is shown only to keep the analyzer list compact. Use the clean top-level import.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && .venv/bin/python -m pytest tests/services/test_race_debrief.py -v`
Expected: PASS (2 tests). If a block raises on the synthetic data, fix the mapping (not the test) and report.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/race_debrief.py backend/tests/services/test_race_debrief.py
git commit -m "feat(debrief): orchestrator + rule-based grade/verdict/plan + cache"
```

---

## Task 4: AI verdict + endpoint

**Files:**
- Modify: `backend/app/services/race_debrief.py` (add `_ai_verdict`, call it in `build_debrief`)
- Modify: `backend/app/api/analytics.py` (add the route)
- Test: `backend/tests/api/test_activity_debrief_endpoint.py`

**Interfaces:**
- Produces: `GET /analytics/activity-debrief/{activity_id}` → `RaceDebrief` (404 when the debrief can't be built for this user's activity). The AI verdict overlays `verdict.ai_verdict`/`verdict.ai_model` when a key is set; rule-based otherwise.

- [ ] **Step 1: Add the AI verdict to the service**

In `backend/app/services/race_debrief.py`, add (mirrors `period_report._ai_verdict`):

```python
_VERDICT_SYSTEM = (
    "You are a pro cycling coach writing a race debrief. In 2–3 sentences, give a "
    "candid verdict on how the ride was executed, referencing the athlete's real "
    "numbers. Be specific and encouraging but honest. Do not invent numbers."
)


async def _ai_verdict(report: RaceDebrief) -> tuple[str, str]:
    fallback = report.verdict.ai_verdict
    if not settings.ANTHROPIC_API_KEY:
        return fallback, "rule-based-fallback"
    p = report.pacing
    msg = (
        f"Grade: {report.verdict.grade_letter} ({report.verdict.grade_score}/100)\n"
        f"Distance {report.header.distance_km} km, {report.header.elevation_m} m climbing, "
        f"NP {report.header.np_watts} W, IF {report.header.if_}, {report.header.total_kj} kJ\n"
        f"Went well: {report.verdict.went_well}\n"
        f"Watch out: {report.verdict.watch_out}\n"
        f"Split {p.split_pct if p else 'n/a'}%, surges {p.surge_count if p else 'n/a'}\n"
    )
    try:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = await client.messages.create(
            model=settings.COACH_MODEL, max_tokens=320, temperature=0,
            system=[{"type": "text", "text": _VERDICT_SYSTEM,
                     "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": msg}],
        )
        text = "".join(getattr(b, "text", "") or "" for b in (getattr(resp, "content", None) or [])).strip()
        if not text:
            raise RuntimeError("empty Claude response")
        return text[:600], settings.COACH_MODEL
    except Exception as exc:  # noqa: BLE001
        logger.exception("Race-debrief verdict failed: %s", exc)
        return fallback, "rule-based-fallback"
```

Then in `build_debrief`, after `report = assemble_debrief(...)` and before returning, overlay:

```python
    text, model = await _ai_verdict(report)
    report.verdict.ai_verdict = text
    report.verdict.ai_model = model
```

- [ ] **Step 2: Add the endpoint**

In `backend/app/api/analytics.py`, add near the period-report route (import `get_or_build_debrief` and `RaceDebrief` at the top):

```python
@router.get(
    "/activity-debrief/{activity_id}",
    response_model=RaceDebrief,
    summary="Pro-grade deep analysis of a single ride",
)
async def get_activity_debrief(
    activity_id: int,
    _user: Annotated[User, Depends(get_current_active_user)],
    db: Annotated[AsyncSession, Depends(get_db_for_user)],
) -> RaceDebrief:
    report = await get_or_build_debrief(db, _user.id, activity_id)
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No analyzable ride (with power streams) found for this activity.",
        )
    return report
```

- [ ] **Step 3: Write the endpoint test**

Create `backend/tests/api/test_activity_debrief_endpoint.py`, following the existing auth+seed pattern used by other `backend/tests/api/` tests (inspect a sibling test for the fixture/client/token helpers). It must: register/authenticate a user, insert an `Activity` + an `ActivityStream` with a power blob for that user, `GET /analytics/activity-debrief/{id}`, assert 200 + a valid `RaceDebrief` body (grade present, header populated), and assert 404 for a non-existent activity id. Mirror the seeding approach of `backend/tests/api/` (do not invent a new harness).

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/python -m pytest tests/api/test_activity_debrief_endpoint.py tests/services/test_race_debrief.py -v`
Expected: PASS. Then the full suite: `cd backend && .venv/bin/python -m pytest -q` (expect all green).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/race_debrief.py backend/app/api/analytics.py backend/tests/api/test_activity_debrief_endpoint.py
git commit -m "feat(debrief): AI verdict + GET /analytics/activity-debrief/{id}"
```

---

## Self-Review

**Spec coverage:** cache model+migration → Task 1; `RaceDebrief` schema → Task 2; `assemble_debrief` orchestrator wiring all 11 analyzers defensively + rule-based grade/verdict/plan + read-through cache → Task 3; AI verdict (COACH_MODEL, rule-based fallback) + endpoint → Task 4.

**Placeholder scan:** none — full code in every code step. Two explicit verification notes (empty `aggregate_mmp_curves`; the `calculate_np` import shim → use a clean top-level import) are instructions, not deferred work. The endpoint test (Task 4 Step 3) intentionally defers to the codebase's existing api-test harness rather than inventing fixtures — the implementer must read a sibling `tests/api/` test.

**Type consistency:** every analyzer's dataclass fields map 1:1 to the Task-2 schema block (`__dict__` serialization); `matchbook.matches` (list of `Match`) is expanded to dicts explicitly. `AthleteProfile.weight_kg`/`ftp_watts`, `Activity.title`/`started_at`/`distance_meters`/`tss`, `ActivityStream.streams`/`mmp_curve`/`cp_watts`/`w_prime_j` are the real field names (verified against the models). `get_or_build_debrief`/`_upsert_debrief` mirror `period_report`'s verified cache pattern.
