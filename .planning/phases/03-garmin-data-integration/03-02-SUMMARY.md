---
phase: 03-garmin-data-integration
plan: 02
subsystem: api
tags: [garmin, activity-mapper, daily-metrics, sync, tss, sqlalchemy, asyncio, timescaledb]

# Dependency graph
requires:
  - phase: 03-01
    provides: GarminCredential ORM, DailyMetric ORM, GarminProvider Protocol, GarminConnectClient, ActivityCreate.external_id
  - phase: 02-02
    provides: create_activity with auto-TSS (cycling/running/gym)
  - phase: 02-01
    provides: calculate_cycling_tss, calculate_running_tss, calculate_hr_tss

provides:
  - garmin_mapper.py: GARMIN_SPORT_MAP (11 types), map_garmin_activity, map_daily_metrics
  - daily_metric_service.py: upsert_daily_metric (app-layer uniqueness), get_daily_metrics
  - garmin_sync_service.py: sync_user_garmin (main entry), sync_activities, sync_daily_metrics, create_garmin_client_for_user

affects:
  - 03-03: garmin API routes call sync_user_garmin and upsert_daily_metric
  - 03-04: APScheduler job calls sync_user_garmin on schedule
  - 04: dashboard reads DailyMetric via get_daily_metrics
  - 05: AI coaching reads activity TSS (already calculated on sync)

# Tech tracking
tech-stack:
  added:
    - cryptography>=42.0 (installed in venv for Fernet; already in pyproject.toml from 03-01)
  patterns:
    - map_garmin_activity returns None for unsupported sports (silent skip, not exception)
    - upsert_daily_metric flushes (not commits) — caller controls transaction boundary
    - sync_daily_metrics wraps each biometric endpoint in _safe_fetch try/except — partial data better than no data
    - Initial sync chunks activities in 30-day windows to respect pagination limits
    - All sync code imports GarminProvider Protocol, zero direct garminconnect imports

key-files:
  created:
    - backend/app/services/garmin_mapper.py
    - backend/app/services/daily_metric_service.py
    - backend/app/services/garmin_sync_service.py
  modified: []

key-decisions:
  - "map_garmin_activity returns None for 0-duration activities (stores duration_seconds=None to avoid TSS division-by-zero)"
  - "sync_activities loads AthleteProfile once per sync run (not per activity) — profile is user-scoped, not activity-scoped"
  - "sync_activities creates minimal AthleteProfile stub if user has none — activities created with TSS=None rather than crashing"
  - "_safe_fetch re-raises GarminAuthError but swallows all other exceptions — auth failures must propagate, endpoint failures should not abort the day"
  - "sync_daily_metrics batches all days into a single db.commit() — upsert_daily_metric only flushes"

patterns-established:
  - "Pattern 1: map_garmin_activity None-returns — unsupported sport OR missing activityId causes silent skip with DEBUG log"
  - "Pattern 2: flush-then-commit — service methods flush; orchestrator commits; allows batching"
  - "Pattern 3: _safe_fetch — generic try/except wrapper for per-endpoint resilience in daily metric loops"
  - "Pattern 4: Initial vs incremental sync detection via credential.last_sync_at is None"

# Metrics
duration: 56min
completed: 2026-04-17
---

# Phase 3 Plan 02: Garmin Sync Service Summary

**GARMIN_SPORT_MAP (11 types), activity mapper, daily metric upsert, and sync orchestrator that bridges Garmin API responses to auto-TSS-calculated activities and biometric DailyMetrics**

## Performance

- **Duration:** ~56 min
- **Started:** 2026-04-17T19:54:48Z
- **Completed:** 2026-04-17T20:50:14Z
- **Tasks:** 2/2
- **Files modified:** 3 created

## Accomplishments

- `garmin_mapper.py`: GARMIN_SPORT_MAP with 11 sport type keys (6 cycling, 3 running, 2 gym); `map_garmin_activity` transforms raw Garmin JSON into ActivityCreate with UTC timestamps, external_id for dedup, and graceful None defaults for all optional fields including power metrics; `map_daily_metrics` extracts sleep_score (nested `sleepScores.overall.value` then fallback `sleepScore`), HRV, body battery, resting HR, stress, steps from 6 biometric sources; all raw responses preserved in `raw_data` for forward compatibility
- `daily_metric_service.py`: `upsert_daily_metric` enforces app-layer uniqueness on `(user_id, date)` — SELECT before INSERT pattern since TimescaleDB hypertable cannot have UNIQUE on `(user_id, date)` without partition column; uses `db.flush()` (not commit) so caller controls transaction; `get_daily_metrics` date-range query ordered ASC for PMC/chart use
- `garmin_sync_service.py`: `sync_user_garmin` detects initial vs incremental sync via `credential.last_sync_at`; initial sync backfills 90 days of activities (chunked in 30-day windows) and 30 days of daily metrics; incremental sync uses 2-hour buffer for late Garmin uploads; `sync_activities` deduplicates on `external_id` and calls `create_activity` for auto-TSS; `sync_daily_metrics` wraps each biometric endpoint in `_safe_fetch` for per-endpoint resilience; `GarminAuthError` disables sync and updates `sync_status`; zero direct `garminconnect` imports (all via `GarminProvider` Protocol)

## Task Commits

1. **Task 1: Garmin activity mapper and daily metric service** - `76be807` (feat)
2. **Task 2: Garmin sync service orchestrator** - `41980cf` (feat)

**Plan metadata:** (pending — this commit)

## Files Created/Modified

- `backend/app/services/garmin_mapper.py` - GARMIN_SPORT_MAP, map_garmin_activity, map_daily_metrics
- `backend/app/services/daily_metric_service.py` - upsert_daily_metric (app-layer uniqueness), get_daily_metrics
- `backend/app/services/garmin_sync_service.py` - sync_user_garmin, sync_activities, sync_daily_metrics, create_garmin_client_for_user

## Decisions Made

- **AthleteProfile stub on missing profile:** `sync_activities` loads AthleteProfile once per sync run. If none exists (user skipped onboarding profile), a minimal stub is created in-memory so `create_activity` can run. Activities are stored with `TSS=None` rather than crashing. This is safe because TSS can be computed retroactively once the user sets their FTP/thresholds.
- **duration_seconds=None for 0-duration:** `map_garmin_activity` stores `None` for zero-duration activities rather than `0`, which prevents `TSS = 0` appearing in PMC and avoids potential division-by-zero in training load calculations.
- **_safe_fetch swallows non-auth errors:** Each biometric endpoint in `sync_daily_metrics` is wrapped in `_safe_fetch`. Only `GarminAuthError` propagates; all other exceptions log a warning and return `None`. Partial biometric data (e.g., sleep but no HRV) is better than no data for the day.
- **Batch commit in sync_daily_metrics:** `upsert_daily_metric` calls `db.flush()` only. `sync_daily_metrics` commits once after all days. This reduces round-trips for multi-day backfills. If the commit fails, the entire batch is rolled back (no partial days persisted).

## Deviations from Plan

None — plan executed exactly as written. The cryptography package was not installed in the local venv (was in pyproject.toml from 03-01 but not installed in the local virtual environment). Installed via `pip install cryptography` to unblock verification checks — this is a [Rule 3 - Blocking] fix for the local dev environment, not a code change.

---

**Total deviations:** 0 code deviations (1 local env fix)
**Impact on plan:** No scope changes. All tasks implemented as specified.

## Issues Encountered

- `cryptography` package was present in `pyproject.toml` but not installed in the local `.venv` (likely due to Docker being down during 03-01 when dependencies would have been synced). Fixed with `pip install cryptography` locally. No code changes required.

## User Setup Required

None — no external service configuration required. The garmin_credentials table still needs `alembic upgrade head` after Docker restart (carried over from 03-01 blocker).

## Next Phase Readiness

**Ready:**
- Complete sync pipeline: Garmin API -> ActivityCreate -> Activity (with TSS) -> DailyMetric
- All three services fully importable and verified
- Protocol abstraction maintained throughout (zero direct `garminconnect` imports in sync service)
- `sync_user_garmin` is the single entry point for 03-03 API routes and 03-04 scheduler

**Blocker (carried from 03-01):**
- `garmin_credentials` table not yet applied to DB — requires Docker restart + `alembic upgrade head`
- Sync service is fully implemented and verified by import; actual runtime sync requires the table to exist

---
*Phase: 03-garmin-data-integration*
*Completed: 2026-04-17*
