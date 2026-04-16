---
phase: 01-foundation-auth
plan: 01
subsystem: auth
tags: [fastapi, sqlalchemy, asyncpg, postgresql, timescaledb, jwt, pwdlib, argon2, alembic, pydantic-settings, docker]

# Dependency graph
requires: []
provides:
  - FastAPI async backend with PostgreSQL+TimescaleDB via Docker Compose
  - Async SQLAlchemy 2.0 setup (engine, session maker, Base, get_db)
  - Alembic migrations configured for async with TimescaleDB index filter
  - User ORM model (email, hashed_password, is_active, timestamps)
  - JWT auth: register, login, refresh (httpOnly cookie rotation), logout, me endpoints
  - Argon2 password hashing via pwdlib
  - Separate access/refresh JWT secrets; jti on refresh tokens for future revocation
  - get_current_user and get_current_active_user FastAPI dependencies
affects: [02-athlete-profile, 03-garmin-sync, 04-training-engine, 05-ai-coach, 06-frontend-auth]

# Tech tracking
tech-stack:
  added:
    - fastapi[standard]>=0.115
    - uvicorn[standard]
    - sqlalchemy[asyncio]>=2.0
    - asyncpg
    - alembic
    - pydantic-settings
    - PyJWT>=2.10
    - pwdlib[argon2]
    - httpx
    - timescale/timescaledb:latest-pg16 (Docker)
  patterns:
    - Async SQLAlchemy 2.0 with AsyncAttrs + DeclarativeBase
    - JWT dual-token: short-lived access token in body + long-lived refresh token as httpOnly cookie
    - Separate JWT secrets for access vs refresh tokens
    - jti (JWT ID) claim on refresh tokens for future Redis-based revocation
    - Alembic async template with TimescaleDB index filter (include_object)
    - pydantic-settings for typed env config with DATABASE_URL dialect validation

key-files:
  created:
    - backend/pyproject.toml
    - backend/.env.example
    - backend/docker-compose.yml
    - backend/alembic.ini
    - backend/app/__init__.py
    - backend/app/main.py
    - backend/app/config.py
    - backend/app/database.py
    - backend/app/dependencies.py
    - backend/app/models/__init__.py
    - backend/app/models/user.py
    - backend/app/schemas/__init__.py
    - backend/app/schemas/auth.py
    - backend/app/services/__init__.py
    - backend/app/services/auth_service.py
    - backend/app/api/__init__.py
    - backend/app/api/auth.py
    - backend/migrations/env.py
    - backend/migrations/versions/78e00c708669_create_users_table.py
  modified: []

key-decisions:
  - "PyJWT over python-jose: python-jose is abandoned; FastAPI dropped it"
  - "pwdlib[argon2] over passlib: FastAPI now recommends pwdlib; Argon2 is the recommended algorithm"
  - "DB port 5433 to avoid conflict with existing local postgres on 5432"
  - "Refresh token is httpOnly cookie (not in body); access token in body stored in memory by client"
  - "jti on refresh tokens from day 1 to enable Redis revocation in Phase 2 without token schema change"
  - "Deferred AthleteProfile and ConsentRecord relationships on User model until those models exist in Phase 2"
  - "TimescaleDB index filter in env.py prevents autogenerate from dropping hypertable indexes"
  - "Redis refresh token revocation deferred to Phase 2 - Phase 1 limitation documented"

patterns-established:
  - "Pattern: get_db dependency yields AsyncSession; all database access is async"
  - "Pattern: Auth router uses OAuth2PasswordRequestForm (username=email) for login per OAuth2 spec"
  - "Pattern: set_refresh_cookie / clear_refresh_cookie helpers centralize cookie policy"
  - "Pattern: Token rotation on /auth/refresh - new access + new refresh token on every refresh"

# Metrics
duration: 65min
completed: 2026-04-16
---

# Phase 1 Plan 1: Foundation + Auth Summary

**FastAPI async backend with PostgreSQL+TimescaleDB, Alembic migrations, Argon2 password hashing (pwdlib), and PyJWT dual-token auth (access token in body + httpOnly refresh cookie with rotation)**

## Performance

- **Duration:** 65 min
- **Started:** 2026-04-16T12:14:46Z
- **Completed:** 2026-04-16T13:20:05Z
- **Tasks:** 2 (Task 1 from prior session, Task 2 this session)
- **Files modified:** 19 created

## Accomplishments
- PostgreSQL+TimescaleDB running via Docker Compose on port 5433
- FastAPI server with async SQLAlchemy 2.0 + asyncpg, pydantic-settings config, and CORS middleware
- Alembic migrations configured for async execution with TimescaleDB index protection filter
- Complete JWT auth: register (201), login, refresh (cookie rotation), logout, me - all verified working
- Argon2 password hashing via pwdlib (FastAPI-recommended, timing-safe)
- Access + refresh tokens use separate JWT secrets; refresh tokens carry jti for future revocation

## Task Commits

1. **Task 1: Project scaffold with Docker, config, and async database** - `868e7e7` (feat, prior session)
2. **Task 2: User model, auth service, and auth endpoints** - `15c2d0a` (feat)

## Files Created/Modified
- `backend/app/config.py` - pydantic-settings Settings with DATABASE_URL dialect validator
- `backend/app/database.py` - Async SQLAlchemy engine, session maker, Base, get_db
- `backend/app/main.py` - FastAPI app with CORS, auth router, health check
- `backend/app/models/user.py` - User ORM model: email, hashed_password, is_active, timestamps
- `backend/app/schemas/auth.py` - RegisterRequest, LoginRequest, TokenResponse, UserResponse
- `backend/app/services/auth_service.py` - hash_password, verify_password, create_access_token, create_refresh_token, decode_*, create_user, authenticate_user
- `backend/app/dependencies.py` - oauth2_scheme, get_current_user, get_current_active_user
- `backend/app/api/auth.py` - Auth router: register, login, refresh, logout, me
- `backend/docker-compose.yml` - timescale/timescaledb:latest-pg16 on port 5433
- `backend/migrations/env.py` - Async Alembic with TimescaleDB index filter
- `backend/migrations/versions/78e00c708669_create_users_table.py` - Users table + indexes

## Decisions Made
- **Port 5433 for cycling coach DB:** Avoids conflict with existing local PostgreSQL on 5432 (another project running on that port)
- **No Redis in Phase 1:** Refresh token revocation deferred to Phase 2; jti claim added now so revocation store can be bolted on without token schema change
- **AthleteProfile/ConsentRecord relationships deferred:** These ORM relationships are commented out in User model until the actual models exist in Phase 2; forward references at mapper config time cause startup failures
- **Token rotation on /auth/refresh:** Every refresh call issues a new refresh token (not just access token), reducing window for stolen refresh token abuse

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed premature ORM relationships on User model**
- **Found during:** Task 2 (testing register endpoint)
- **Issue:** User model had `relationship("AthleteProfile", ...)` and `relationship("ConsentRecord", ...)` as string forward references. SQLAlchemy tries to resolve these at mapper configuration time, raising `InvalidRequestError: name 'AthleteProfile' failed to locate`. Server startup failed with 500 on all auth routes.
- **Fix:** Removed both relationship declarations from `backend/app/models/user.py`. Replaced with comment stubs noting they will be added in Phase 2 when the actual models are created.
- **Files modified:** `backend/app/models/user.py`
- **Verification:** Server started cleanly; register endpoint returned 201 with correct response body
- **Committed in:** `15c2d0a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Necessary fix. The relationships must wait until Phase 2 creates the referenced models. No scope creep; this will be completed in Phase 2 as designed.

## Issues Encountered
- Docker image pull for `timescale/timescaledb:latest-pg16` took ~10 minutes on first run (large image, ~400MB). Expected on fresh environment.

## User Setup Required
None - Docker Compose handles all database setup. Run `docker compose up -d` in `backend/` to start.

## Next Phase Readiness
- Backend auth foundation complete - all auth endpoints functional and verified
- Database connection and migrations working
- Ready for Phase 1 Plan 2: Athlete profile CRUD and GDPR consent flow
- Phase 2 must add AthleteProfile and ConsentRecord models and restore relationships on User

**Known Phase 1 limitation:** Refresh tokens cannot be server-side invalidated (no Redis revocation store). Logout clears the client cookie but the token itself remains valid until expiry. The `jti` claim is in place for Phase 2 to add Redis-based revocation without changing token format.

---
*Phase: 01-foundation-auth*
*Completed: 2026-04-16*
