---
phase: 02-training-engine
plan: 02
subsystem: api
tags: [sqlalchemy, fastapi, timescaledb, pydantic, tss, training-load, activities, rls]

# Dependency graph
requires:
  - phase: 02-01
    provides: calculate_cycling_tss, calculate_running_tss, calculate_hr_tss pure functions
  - phase: 01-02
    provides: activities hypertable (pre-created), AthleteProfile model with thresholds, RLS setup

provides:
  - Activity ORM model (SQLAlchemy) mapping to existing TimescaleDB hypertable
  - ActivityCreate, ActivityRead, ActivityListResponse Pydantic schemas
  - PMCEntry, PMCResponse, PowerZonesResponse, PaceZonesResponse, FTPHistoryResponse schemas
  - activity_service: create/list/get with TSS auto-calculation
  - POST /activities, GET /activities, GET /activities/{id} REST endpoints

affects:
  - 02-03 (daily_metrics model, PMC API will query activities for TSS aggregation)
  - 03-garmin (Garmin sync will call create_activity)
  - 05-ai-coaching (activity history feeds AI coaching recommendations)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Activity hypertable ORM without Alembic migration: model maps to pre-existing DDL, env.py include_object filter excludes it"
    - "TSS auto-calculation in service layer: sport-specific dispatch with graceful None fallback when thresholds missing"
    - "RLS via get_db_for_user: SET LOCAL app.current_user_id before all user-data queries"

key-files:
  created:
    - backend/app/models/activity.py
    - backend/app/schemas/activity.py
    - backend/app/schemas/training_load.py
    - backend/app/services/activity_service.py
    - backend/app/api/activities.py
  modified:
    - backend/app/models/user.py
    - backend/app/models/__init__.py
    - backend/migrations/env.py
    - backend/app/main.py

key-decisions:
  - "Activity ORM maps to existing DDL, no new migration — migrations/env.py include_object skips activities and daily_metrics tables"
  - "TSS stored as None when athlete profile lacks required thresholds — API creates activity regardless, TSS populated later"
  - "Gym hrTSS defaults sex='male' — TODO add sex field to AthleteProfile in future plan"
  - "average_power used as NP fallback for cycling TSS when normalized_power not provided"

patterns-established:
  - "Hypertable ORM pattern: map to pre-created hypertable, exclude from Alembic autogenerate via include_object filter"
  - "Sport-dispatch TSS: _compute_tss() helper with per-sport calculation branches, all return None on missing data"

# Metrics
duration: 2min
completed: 2026-04-16
---

# Phase 2 Plan 02: Activity API Summary

**Activity ORM (TimescaleDB hypertable), Pydantic schemas, and REST API with sport-specific TSS auto-calculation (cycling=Coggan, running=rTSS, gym=hrTSS)**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-16T15:27:07Z
- **Completed:** 2026-04-16T15:29:23Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Activity ORM model mapping to the existing TimescaleDB activities hypertable with composite PK (id, started_at) — no new migration needed
- Complete Pydantic schema set: ActivityCreate/Read/ListResponse + all training load schemas (PMC, zones, FTP history)
- Activity service with sport-specific TSS auto-calculation: cycling (Coggan TSS via NP or avg power fallback), running (rTSS from speed), gym (hrTSS via Banister TRIMP)
- Three REST endpoints (POST/GET/GET-by-id) with RLS via get_db_for_user, graceful TSS=None when thresholds missing

## Task Commits

Each task was committed atomically:

1. **Task 1: Activity ORM model and Pydantic schemas** - `50b2055` (feat)
2. **Task 2: Activity service with TSS auto-calculation and API endpoints** - `9365d78` (feat)

**Plan metadata:** (next commit — docs)

## Files Created/Modified

- `backend/app/models/activity.py` - SQLAlchemy ORM for activities hypertable (composite PK, all 16 columns)
- `backend/app/schemas/activity.py` - ActivityCreate, ActivityRead, ActivityListResponse
- `backend/app/schemas/training_load.py` - PMCEntry, PMCResponse, ZoneEntry, PowerZonesResponse, PaceZonesResponse, FTPHistoryEntry, FTPHistoryResponse
- `backend/app/services/activity_service.py` - create/list/get_activity with _compute_tss() dispatch
- `backend/app/api/activities.py` - POST /activities (201), GET /activities (filters), GET /activities/{id}
- `backend/app/models/user.py` - Added activities relationship (back_populates)
- `backend/app/models/__init__.py` - Export Activity
- `backend/migrations/env.py` - include_object skips activities + daily_metrics tables
- `backend/app/main.py` - Register activities router

## Decisions Made

- **Activity ORM without new migration**: The activities table was pre-created as a TimescaleDB hypertable in Phase 1 (migration a076ea752213). Adding an Alembic-managed model requires excluding the table from autogenerate — done via `include_object` filter in env.py.
- **TSS=None on missing thresholds**: Rather than blocking activity creation, TSS is stored as None when the athlete profile lacks FTP/threshold pace/HR data. This allows logging workouts immediately after signup without forcing profile setup.
- **average_power as NP fallback for cycling**: When only average_power is provided (no NP from power meter), it is used as the NP estimate. Documented as fallback (overestimates TSS for variable-intensity rides).
- **Gym sex defaults to "male"**: AthleteProfile has no sex field. Defaulted to "male" (higher TRIMP k-constant, slightly more conservative TSS). TODO added in code for Phase 4+.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready:** Activity data layer complete. POST /activities works with TSS auto-calculation. Feeds directly into 02-03 PMC API (daily_metrics aggregation).
- **Dependency for 02-03:** `list_activities` service function + Activity model with `started_at` and `tss` fields ready for PMC aggregation queries.
- **Dependency for 03-Garmin:** `create_activity` accepts `source="garmin"` and `external_id` for deduplication.

---
*Phase: 02-training-engine*
*Completed: 2026-04-16*
