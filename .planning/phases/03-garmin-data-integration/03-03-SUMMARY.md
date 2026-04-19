---
phase: 03-garmin-data-integration
plan: 03
subsystem: api
tags: [garmin, api, apscheduler, lifespan, fastapi, background-jobs]

# Dependency graph
requires:
  - phase: 03-02
    provides: sync_user_garmin (main sync entry), GarminAuthError propagation
  - phase: 03-01
    provides: GarminCredential ORM, EncryptedString, GarminProvider Protocol
  - phase: 01-01
    provides: get_current_active_user, get_db_for_user (RLS session)

provides:
  - api/garmin.py: 4 REST endpoints (POST /connect, DELETE /disconnect, GET /status, POST /sync)
  - schemas/garmin.py: GarminConnectRequest, GarminStatusResponse, GarminSyncResponse, GarminDisconnectResponse
  - scheduler.py: AsyncIOScheduler singleton, run_all_user_syncs (iterate sync_enabled=True, per-user isolation)
  - main.py: lifespan context manager registering hourly garmin_sync job with misfire_grace_time=600

affects:
  - 04 (dashboard): /garmin/status drives connection UI state; /garmin/sync for manual refresh button
  - 05 (AI coaching): hourly background job keeps Activity + DailyMetric fresh for coaching loop
  - Phase 3 complete: Garmin data now flows user-initiated (API) and automatically (scheduler) into training engine

# Tech tracking
tech-stack:
  added:
    - apscheduler (AsyncIOScheduler) — already in pyproject.toml from 03-01
  patterns:
    - Scheduler uses async_session_maker directly (no RLS) — system job, not user request; sync_user_garmin filters by user_id explicitly
    - Per-user try/except in run_all_user_syncs — one bad credential must not block the rest
    - misfire_grace_time=600s allows job to run up to 10 minutes late after server restart without being counted as missed
    - POST /connect creates token store dir (os.makedirs exist_ok=True) before attempting initial sync
    - POST /sync uses sync_status=="syncing" as an in-progress guard to block concurrent manual triggers
    - DELETE /disconnect cleans up token store dir in try/except (cleanup failure must not fail the API call)

key-files:
  created:
    - backend/app/api/garmin.py
    - backend/app/schemas/garmin.py
    - backend/app/scheduler.py
  modified:
    - backend/app/main.py (lifespan context manager + garmin_router registration)

key-decisions:
  - "Scheduler bypasses RLS intentionally — system-level job processes all users; sync_user_garmin queries are already user_id-scoped (WHERE user_id = ...)"
  - "Per-user try/except in run_all_user_syncs isolates individual credential failures (bad password, Garmin outage, etc.) from blocking other users' syncs"
  - "misfire_grace_time=600s (10 min) on hourly job — server restart within 10 min of scheduled time still runs the job; longer outages skip that tick rather than pile up"
  - "POST /connect returns 409 if credential already exists — force user to disconnect first rather than silently replacing (avoids losing sync history / audit trail)"
  - "POST /sync rejects with 409 when sync_status=='syncing' — prevents concurrent sync attempts from same user racing on the same DB rows"

patterns-established:
  - "Pattern: FastAPI lifespan for scheduler — start in lifespan(), shutdown on yield exit; registered before app.add_middleware to ensure clean startup ordering"
  - "Pattern: API routes delegate sync logic to sync_user_garmin — no business logic in route handlers; route = validation + auth + thin wrapper"
  - "Pattern: Token store path per-user at /data/garmin_tokens/{user_id}/ — created lazily on connect, cleaned on disconnect"

# Metrics
duration: ~40min (estimated — previous session + current completion)
completed: 2026-04-19
---

# Phase 3 Plan 03: Garmin API Routes and Background Scheduler Summary

**4 Garmin REST endpoints (connect/disconnect/status/sync) + APScheduler hourly background job + FastAPI lifespan integration — exposes the sync pipeline to users and automates it**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-04-19
- **Tasks:** 2/2
- **Files:** 3 created, 1 modified

## Accomplishments

- `schemas/garmin.py`: 4 Pydantic models — GarminConnectRequest (email, password), GarminStatusResponse (connected, sync_enabled, last_sync_at, sync_status), GarminSyncResponse (activities_synced, metrics_days, message), GarminDisconnectResponse (message)
- `api/garmin.py`: Router with 4 endpoints, all gated by `get_current_active_user` + `get_db_for_user` (RLS). POST /connect stores encrypted creds, creates `/data/garmin_tokens/{user_id}/` dir, triggers initial sync (90-day activity backfill + 30-day metrics); handles GarminAuthError (delete bad cred, 401) vs generic failure (set sync_status='error', 500). DELETE /disconnect removes credential and cleans token store. GET /status returns connection state without exposing secrets. POST /sync guards against concurrent runs via sync_status=='syncing' check.
- `scheduler.py`: AsyncIOScheduler singleton + `run_all_user_syncs` async function — iterates all credentials WHERE sync_enabled=True, calls sync_user_garmin per user inside a try/except so one bad credential never blocks others; logs succeeded/failed counts.
- `main.py`: Lifespan context manager registers the garmin_sync job at `interval=1h` with `misfire_grace_time=600` then starts the scheduler; shuts down cleanly on app exit. Garmin router registered in the import + include_router block.

## Task Commits

1. **Task 1: Garmin API endpoints and schemas** — `9b785df` (feat)
2. **Task 2: APScheduler background sync with FastAPI lifespan** — `b43ea8d` (feat)

## Files Created/Modified

- `backend/app/schemas/garmin.py` (new, 53 lines) — 4 Pydantic schemas
- `backend/app/api/garmin.py` (new, 273 lines) — 4 REST endpoints
- `backend/app/scheduler.py` (new, 60 lines) — AsyncIOScheduler + run_all_user_syncs
- `backend/app/main.py` (modified, +25 lines) — lifespan context manager, logger, garmin_router registration

## Decisions Made

- **Scheduler bypasses RLS by design:** `run_all_user_syncs` uses `async_session_maker()` directly, not `get_db_for_user`. This is a system-level job that must see all users' credentials. `sync_user_garmin` already filters by `user_id` in every query, so no cross-user contamination risk. If we later move to a hardened production role without superuser, the scheduler will need a SET LOCAL role bypass — noted as a carried concern.
- **Per-user try/except isolation:** Individual user sync failures (bad creds, Garmin outage, transient network error) log and continue to the next user. The alternative — aborting the whole batch on first failure — would let one stale credential block every user from syncing indefinitely.
- **409 on duplicate connect:** POST /connect returns 409 if a credential already exists for the user rather than overwriting. Forces the explicit disconnect → reconnect flow, which preserves audit visibility (we don't silently replace stored creds) and avoids losing last_sync_at tracking.
- **409 on in-progress sync:** POST /sync returns 409 when sync_status=='syncing'. Prevents two manual triggers (or a manual trigger racing the hourly scheduler) from double-inserting the same activities or trampling each other's commits.
- **misfire_grace_time=600s:** An hourly job with a 10-minute grace window: server restart within 10 min still runs that tick; longer outages skip (don't pile up). Chosen because sync is idempotent on external_id, so a single missed tick is recovered by the next hour anyway.

## Deviations from Plan

None — plan executed exactly as written across both tasks.

---

**Total deviations:** 0
**Impact on plan:** No scope changes. All tasks implemented as specified.

## Issues Encountered

- None during verification. All 4 verify steps passed on first run:
  - `from app.scheduler import scheduler, run_all_user_syncs` → `AsyncIOScheduler`
  - `from app.api.garmin import router` → 4 routes
  - `from app.schemas.garmin import ...` → OK
  - Task 1 was completed in a prior session; Task 2 required only import verification since it's pure wiring.

## User Setup Required

- **Carried from 03-01 (still blocking real runtime sync):** `alembic upgrade head` to apply `c1f8a3d9e2b7` migration (garmin_credentials table). Until applied, the scheduler will log errors on every tick when querying `GarminCredential`, and POST /connect will fail at the ORM layer.
- **Carried from Phase 3 setup:** Garmin Connect Developer Program business approval pending — currently using unofficial `python-garminconnect` library behind the Protocol abstraction as planned.

## Next Phase Readiness

**Phase 3 complete. Ready for Phase 4 (Dashboard + Visualization):**
- Users can connect Garmin via POST /garmin/connect → credentials stored encrypted, initial sync kicks off
- Users can see connection state via GET /garmin/status — drives dashboard connection UI
- Users can manually refresh via POST /garmin/sync — powers a dashboard "refresh now" button
- Users can disconnect via DELETE /garmin/disconnect — clean removal with token dir cleanup
- Hourly background scheduler keeps all connected users' data fresh without user action
- End-to-end data path now validated: Garmin API → Protocol → mapper → Activity (auto-TSS) + DailyMetric → ready to be visualized

**Known carried concerns (not blocking phase completion, documented for Phase 4+):**
- Migration not yet applied to local DB (Docker restart required)
- Scheduler uses superuser session in dev — production role hardening needed before launch
- `python-garminconnect` is unofficial; swap path via GarminProvider Protocol is clear when official API access is granted

---
*Phase: 03-garmin-data-integration*
*Completed: 2026-04-19*
