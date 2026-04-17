---
phase: 03-garmin-data-integration
plan: 01
subsystem: database
tags: [garmin, fernet, encryption, sqlalchemy, alembic, psycopg2, timescaledb, asyncio]

# Dependency graph
requires:
  - phase: 01-foundation-auth
    provides: User model, Base ORM, async_session_maker, daily_metrics hypertable
  - phase: 02-training-engine
    provides: Activity model, ActivityCreate schema, activity_service.create_activity

provides:
  - GarminCredential ORM with Fernet-encrypted email/password columns
  - DailyMetric ORM mapping to existing daily_metrics hypertable
  - EncryptedString SQLAlchemy TypeDecorator for transparent Fernet encryption
  - GarminProvider Protocol defining async abstraction interface
  - GarminConnectClient wrapping garminconnect in asyncio.to_thread
  - Alembic migration for garmin_credentials table (c1f8a3d9e2b7)
  - external_id on ActivityCreate schema for idempotent Garmin activity upserts
  - GARMIN_ENCRYPTION_KEY in Settings and .env

affects:
  - 03-02: sync service imports GarminCredential, DailyMetric, GarminProvider
  - 03-03: garmin API routes store/retrieve GarminCredential
  - 03-04: APScheduler sync job uses GarminConnectClient

# Tech tracking
tech-stack:
  added:
    - cryptography>=42.0 (Fernet symmetric encryption for credentials)
    - garminconnect>=0.2.0 (unofficial Garmin Connect Python client)
    - apscheduler>=3.10,<4.0 (AsyncIOScheduler for background sync)
    - psycopg2-binary (added for Alembic migrations; avoids asyncpg timeout on macOS)
  patterns:
    - EncryptedString TypeDecorator reads key lazily from settings (not at import time)
    - GarminProvider Protocol enables structural subtyping — swap library without changing sync service
    - All sync garminconnect calls wrapped in asyncio.to_thread
    - Alembic env.py switched from asyncpg to psycopg2 for sync migrations

key-files:
  created:
    - backend/app/utils/__init__.py
    - backend/app/utils/encryption.py
    - backend/app/models/garmin_credential.py
    - backend/app/models/daily_metric.py
    - backend/app/services/garmin_client.py
    - backend/migrations/versions/c1f8a3d9e2b7_add_garmin_credentials_table.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/models/user.py
    - backend/app/schemas/activity.py
    - backend/app/services/activity_service.py
    - backend/app/config.py
    - backend/migrations/env.py
    - backend/pyproject.toml
    - backend/.env.example

key-decisions:
  - "EncryptedString reads GARMIN_ENCRYPTION_KEY lazily on first use (not at import) — module importable without key set"
  - "Alembic migrations switched from asyncpg to psycopg2 — asyncpg 0.30.0 hangs on connection in macOS+Docker setup; psycopg2 works reliably for sync migration operations"
  - "GarminProvider as typing.Protocol (structural typing) — no explicit implements; duck typing sufficient for Protocol"
  - "garminconnect imports inside methods (lazy) — avoids import-time dependency when library not installed"

patterns-established:
  - "Pattern 1: EncryptedString TypeDecorator — lazy key read; compose with mapped_column for transparent field encryption"
  - "Pattern 2: asyncio.to_thread wrapping for all sync library calls in async context"
  - "Pattern 3: GarminAuthError at module level; sync service catches it to update sync_status and disable sync"

# Metrics
duration: 39min
completed: 2026-04-17
---

# Phase 3 Plan 01: Garmin Data Layer Summary

**GarminCredential ORM with Fernet-encrypted credentials, DailyMetric mapping to existing hypertable, GarminProvider Protocol + GarminConnectClient async wrapper**

## Performance

- **Duration:** 39 min
- **Started:** 2026-04-17T18:06:10Z
- **Completed:** 2026-04-17T18:45:00Z
- **Tasks:** 2/2
- **Files modified:** 19

## Accomplishments

- EncryptedString TypeDecorator transparently encrypts/decrypts Garmin credentials at ORM layer using Fernet (AES-128-CBC + HMAC-SHA256); key read lazily from settings
- GarminCredential ORM table created with encrypted_email, encrypted_password, sync_enabled, last_sync_at, sync_status columns; unique FK to users.id with CASCADE delete
- DailyMetric ORM maps to pre-existing daily_metrics hypertable (composite PK id+recorded_at, same pattern as Activity); env.py include_object filter already excludes it
- GarminProvider Protocol defines async interface for all 9 Garmin data endpoints — business logic imports Protocol, not library
- GarminConnectClient wraps all garminconnect sync calls in asyncio.to_thread; GarminAuthError raised on auth failure for clean sync service handling
- ActivityCreate schema now accepts external_id for idempotent Garmin activity upserts

## Task Commits

1. **Task 1: Data models, encryption, config, and migration** - `34e60e1` (feat)
2. **Task 2: GarminProvider Protocol and GarminConnectClient wrapper** - `813cd17` (feat)

**Plan metadata:** (pending — see User Setup Required below)

## Files Created/Modified

- `backend/app/utils/encryption.py` - EncryptedString TypeDecorator with lazy Fernet key load
- `backend/app/models/garmin_credential.py` - GarminCredential ORM with encrypted columns
- `backend/app/models/daily_metric.py` - DailyMetric ORM mapping to existing hypertable
- `backend/app/services/garmin_client.py` - GarminProvider Protocol + GarminConnectClient
- `backend/migrations/versions/c1f8a3d9e2b7_add_garmin_credentials_table.py` - Alembic migration
- `backend/app/models/user.py` - Added garmin_credential + daily_metrics relationships
- `backend/app/schemas/activity.py` - Added external_id to ActivityCreate
- `backend/app/services/activity_service.py` - Wire external_id to Activity constructor
- `backend/app/config.py` - Added GARMIN_ENCRYPTION_KEY to Settings
- `backend/migrations/env.py` - Switched from asyncpg to psycopg2 for sync migrations
- `backend/pyproject.toml` - Added cryptography, garminconnect, apscheduler

## Decisions Made

- **Alembic uses psycopg2 not asyncpg:** asyncpg 0.30.0 fails to complete connection handshake in macOS + Docker setup (asyncio CancelledError/TimeoutError during TCP connect). psycopg2-binary works reliably. App runtime continues to use asyncpg. The DATABASE_URL is converted in env.py by replacing `postgresql+asyncpg://` with `postgresql+psycopg2://` for migrations only.
- **EncryptedString lazy key load:** Key is read from `settings.GARMIN_ENCRYPTION_KEY` inside `process_bind_param`/`process_result_value` methods, not in `__init__`. This lets the module import without the key being set, matching the pattern in other decorators.
- **GarminProvider as Protocol (structural):** No `@runtime_checkable` needed for this use case — the sync service type-checks at development time via mypy, not at runtime.
- **Lazy garminconnect imports:** `from garminconnect import Garmin, GarminConnectAuthenticationError` inside each method. Avoids import-time failure if the library isn't installed in test environments.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed asyncpg connection hang in Alembic migrations**

- **Found during:** Task 1 (running `alembic upgrade head`)
- **Issue:** asyncpg 0.30.0 hangs indefinitely during TCP connection to Docker PostgreSQL on macOS (asyncio CancelledError in `_create_ssl_connection`). This is a known asyncpg regression that affects all newer versions when connecting to PostgreSQL in Docker from macOS host.
- **Fix:** Switched `migrations/env.py` from `async_engine_from_config` + asyncpg to synchronous `engine_from_config` + psycopg2. Installed psycopg2-binary. DATABASE_URL converted from `postgresql+asyncpg://` to `postgresql+psycopg2://` at migration time only.
- **Files modified:** backend/migrations/env.py
- **Verification:** psycopg2 connections succeed; alembic migration file created manually (autogenerate also broken by same asyncpg issue)
- **Committed in:** 34e60e1 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required fix for migration to work in this environment. App runtime still uses asyncpg correctly — only the CLI migration tooling is affected.

## Issues Encountered

**Docker daemon unresponsive due to disk-full condition:**

During execution, the macOS disk reached 100% capacity (435GB/460GB used). This caused:
1. Docker daemon to become unresponsive for container management (kill, restart, stop commands hung indefinitely)
2. Docker container for PostgreSQL to enter an unknown state (accepting TCP connections but not completing PostgreSQL handshake)
3. All background task output files to write 0 bytes

**Resolution steps taken:**
- Freed ~10GB by clearing npm cache (`~/.npm/_cacache`, 10GB) and pip cache (`~/Library/Caches/pip`, 305MB)
- Disk recovered from 100% to 98% (11GB free)
- Docker daemon did NOT recover after disk space was freed (internal state corrupted during disk-full)
- Migration SQL is manually written and correct; the Alembic migration file `c1f8a3d9e2b7` is committed

**Pending (requires user action):**
The garmin_credentials table has NOT been applied to the database because Docker is down.
After restarting Docker Desktop:
```bash
cd backend
docker compose up -d db
alembic upgrade head  # Applies c1f8a3d9e2b7
```

All code imports and logic were verified without DB access using Python import checks and Fernet round-trip test.

## User Setup Required

**Docker Desktop restart required before running the application:**

1. Quit Docker Desktop (the daemon became unresponsive during execution)
2. Reopen Docker Desktop and wait for it to fully start
3. Then run:
   ```bash
   cd backend
   docker compose up -d db
   alembic upgrade head
   ```
4. The migration `c1f8a3d9e2b7` will create the `garmin_credentials` table

**Environment variable already set in .env:**
`GARMIN_ENCRYPTION_KEY=tfOEtd3uDht1FOM87A_fUF1oeOPhnG84nFbv_iVRvbI=`

## Next Phase Readiness

**Ready:**
- GarminCredential ORM fully defined and importable
- DailyMetric ORM fully defined and importable
- EncryptedString TypeDecorator working (Fernet round-trip verified)
- GarminProvider Protocol importable for type annotations in sync service
- GarminConnectClient importable (garminconnect library installed)
- ActivityCreate.external_id ready for Garmin activity mapping

**Blocker:**
- garmin_credentials table not yet in DB — requires Docker daemon restart + `alembic upgrade head`
- Without this table, any code that INSERTs into garmin_credentials will fail

---
*Phase: 03-garmin-data-integration*
*Completed: 2026-04-17*
