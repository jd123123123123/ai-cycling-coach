# Phase 1: Foundation + Auth - Research

**Researched:** 2026-04-16
**Domain:** FastAPI + async SQLAlchemy + PostgreSQL/TimescaleDB + JWT auth + GDPR consent
**Confidence:** HIGH (core stack verified via official docs and Context7; GDPR requirements verified via official EU sources)

## Summary

Phase 1 establishes the entire foundation the rest of the platform builds on: user accounts, athlete profiles, training goals, multi-user data isolation, and GDPR consent. Getting this right matters more than any other phase because every subsequent phase inherits these decisions.

The standard approach is a FastAPI async backend with SQLAlchemy 2.0 async + asyncpg driver, JWT access tokens (short-lived, in memory on client) + refresh tokens (long-lived, httpOnly cookie), PostgreSQL row-level security for data isolation at the database layer, and a separate consent record table that stores timestamped, versioned consent events. The TimescaleDB question is resolved: create hypertables for `activities` and `daily_metrics` from day one using the modern `WITH (tsdb.hypertable)` DDL syntax in the initial Alembic migration. Migrating later is painful; starting correctly costs nothing.

The key risk in Phase 1 is the GDPR consent flow. Health data (HRV, sleep, heart rate) is "special category" data under GDPR Article 9 requiring explicit, granular, documented consent — not a checkbox in terms of service. The consent schema and UI must ship with registration, not be retrofitted after launch.

**Primary recommendation:** Build the auth and data isolation layer first (2-3 days), then athlete profile CRUD, then the GDPR consent flow — in that order, because consent references user IDs and profile types.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | 0.135.x | API framework | Official choice. Native async, auto-docs, Pydantic v2 integration. Current stable: 0.135.3 |
| SQLAlchemy | 2.0.x (2.0.48+) | ORM | Async engine with `AsyncSession`, declarative models. `asyncpg` dialect required |
| asyncpg | latest | PostgreSQL async driver | Purpose-built async PG driver; required by SQLAlchemy async engine. Significantly faster than psycopg2 |
| Alembic | 1.18.x | DB migrations | Standard SQLAlchemy migration tool. Use `alembic init -t async` template |
| Pydantic | 2.12.x | Validation | Ships with FastAPI. Use `pydantic-settings` for config/env loading |
| PyJWT | 2.x | JWT tokens | FastAPI officially recommends over abandoned python-jose. Simple, focused |
| pwdlib | latest | Password hashing | FastAPI-recommended replacement for passlib. Use with argon2 backend |
| PostgreSQL | 16+ | Primary database | Relational data + TimescaleDB extension host |
| TimescaleDB | 2.x | Time-series extension | PostgreSQL extension for `activities` and `daily_metrics` hypertables |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pydantic-settings | 2.x | Config management | `.env` file loading, typed settings. Phase 1 needs DB URL, JWT secret, allowed origins |
| httpx | latest | HTTP client | Not used in Phase 1, but install now to avoid adding later. Phase 3 needs it |
| redis-py | 5.1 | Session store (optional) | Consider for refresh token revocation list. Can defer to Phase 2 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| PyJWT | python-jose | Never use python-jose — abandoned, no releases in 3+ years, FastAPI dropped it |
| pwdlib | passlib | passlib has maintenance issues. FastAPI now recommends pwdlib |
| PostgreSQL RLS | App-only filtering | App-only is faster to implement but RLS provides defense-in-depth for health data |
| TimescaleDB from day 1 | Add later | Adding hypertables to populated tables requires downtime + migration. Start with hypertables |

**Installation:**
```bash
# Backend
pip install "fastapi[standard]" uvicorn[standard]
pip install "sqlalchemy[asyncio]" asyncpg alembic
pip install pydantic-settings
pip install PyJWT "pwdlib[argon2]"
pip install httpx

# Dev
pip install pytest pytest-asyncio httpx ruff pre-commit
```

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── app/
│   ├── main.py                   # FastAPI app factory, CORS, startup
│   ├── config.py                 # pydantic-settings Settings class
│   ├── database.py               # engine, async_session_maker, Base, get_db
│   ├── dependencies.py           # get_current_user dependency
│   │
│   ├── api/
│   │   ├── auth.py               # POST /auth/register, /auth/login, /auth/refresh, /auth/logout
│   │   ├── athletes.py           # GET/PUT /athletes/me (profile)
│   │   └── goals.py              # GET/PUT /athletes/me/goals
│   │
│   ├── models/
│   │   ├── user.py               # User ORM model
│   │   ├── athlete_profile.py    # AthleteProfile ORM model
│   │   └── consent.py            # ConsentRecord ORM model
│   │
│   ├── schemas/
│   │   ├── auth.py               # RegisterRequest, LoginRequest, TokenResponse
│   │   ├── athlete.py            # AthleteProfileCreate, AthleteProfileRead
│   │   └── consent.py            # ConsentRequest, ConsentRecord
│   │
│   └── services/
│       ├── auth_service.py       # create_user, authenticate, create_tokens
│       └── athlete_service.py    # get_profile, update_profile, update_goals
│
├── migrations/                   # Alembic
│   ├── env.py                    # Async env.py template
│   └── versions/
│       └── 0001_initial.py       # users, athlete_profiles, consent_records
│                                 # + create_hypertable for activities, daily_metrics
│
├── tests/
│   ├── conftest.py               # pytest fixtures: test db, client, test user
│   ├── test_auth.py              # register, login, refresh, logout, isolation
│   └── test_athlete.py           # profile CRUD, goals CRUD
│
├── docker-compose.yml            # postgres+timescaledb, (redis optional)
├── pyproject.toml
└── .env.example
```

```
frontend/
├── src/
│   ├── api/
│   │   ├── client.ts             # axios instance with interceptors
│   │   └── auth.ts               # register(), login(), logout(), refreshToken()
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx       # AuthProvider, useAuth hook
│   │
│   ├── pages/
│   │   ├── RegisterPage.tsx      # Registration + GDPR consent flow
│   │   ├── LoginPage.tsx
│   │   └── ProfileSetupPage.tsx  # FTP, weight, zones, goals
│   │
│   └── components/
│       └── ConsentFlow.tsx       # Granular consent checkboxes
│
├── package.json
└── vite.config.ts
```

### Pattern 1: Async SQLAlchemy Setup

**What:** Database engine, session maker, Base class, and FastAPI dependency injection.
**When to use:** This is the foundation; set it up first.

```python
# Source: https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/
# app/database.py
from sqlalchemy.ext.asyncio import (
    AsyncAttrs, AsyncSession, async_sessionmaker, create_async_engine
)
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator

class Base(AsyncAttrs, DeclarativeBase):
    pass

# CRITICAL: use "postgresql+asyncpg://" not "postgresql://"
# Using the wrong dialect string won't error immediately but blocks event loop under load
engine = create_async_engine(
    settings.DATABASE_URL,  # postgresql+asyncpg://user:pass@host/db
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(engine, expire_on_commit=False)

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session
```

### Pattern 2: JWT Auth with httpOnly Refresh Token

**What:** Short-lived access token in memory (15-30 min), long-lived refresh token in httpOnly cookie.
**When to use:** For all authenticated requests. This is more secure than localStorage for both tokens.

```python
# Source: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/
# app/services/auth_service.py
from datetime import datetime, timedelta, timezone
import jwt
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2 by default

def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=30)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.JWT_SECRET_KEY,
        algorithm="HS256",
    )

def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=30)
    return jwt.encode(
        {"sub": str(user_id), "type": "refresh", "exp": expire},
        settings.JWT_REFRESH_SECRET_KEY,  # Different secret than access token
        algorithm="HS256",
    )
```

```python
# app/api/auth.py — login endpoint sets httpOnly cookie
from fastapi import APIRouter, Response, Depends
from fastapi.security import OAuth2PasswordRequestForm

router = APIRouter()

@router.post("/auth/login")
async def login(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    user = await authenticate_user(db, form_data.username, form_data.password)
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    # Refresh token in httpOnly cookie — not accessible to JavaScript
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,       # HTTPS only in production
        samesite="lax",
        max_age=30 * 24 * 60 * 60,  # 30 days
    )

    # Access token returned in response body — stored in memory by React
    return {"access_token": access_token, "token_type": "bearer"}
```

```python
# app/dependencies.py — get current user from access token
from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### Pattern 3: PostgreSQL Row-Level Security for Multi-User Isolation

**What:** Database-level enforcement that users can only read/write their own rows.
**When to use:** Every table with athlete-specific data (activities, daily_metrics, athlete_profiles, consent_records, etc.).
**Why:** Defense-in-depth. Application-level filters are the primary line; RLS is the safety net if a service bug forgets to filter by user_id.

```sql
-- Source: PostgreSQL official docs + https://adityamattos.com/multi-tenancy-in-python-fastapi-and-sqlalchemy-using-postgres-row-level-security
-- In Alembic migration (op.execute() calls):

-- Enable RLS on all athlete data tables
ALTER TABLE athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Policy: users only see their own rows
-- current_setting() reads the session variable set by the FastAPI dependency
CREATE POLICY user_isolation ON athlete_profiles
    USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

CREATE POLICY user_isolation ON activities
    USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

-- Same pattern for all other tables
```

```python
# app/dependencies.py — sets user context on each request for RLS
from sqlalchemy import text

async def get_db_for_user(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AsyncGenerator[AsyncSession, None]:
    # Set the PostgreSQL session variable that RLS policies check
    await db.execute(
        text(f"SET LOCAL app.current_user_id = '{current_user.id}'")
    )
    yield db
```

### Pattern 4: TimescaleDB Hypertables in Initial Migration

**What:** Create time-series tables as hypertables from the very first migration using the modern `WITH (tsdb.hypertable)` syntax or `create_hypertable()` call.
**When to use:** Phase 1 initial migration. Do not defer this decision.

**The decision:** Start with hypertables for `activities` and `daily_metrics`. Regular tables for everything else (users, athlete_profiles, consent_records, training_plans).

**Why hypertables for activities/daily_metrics:** These will be queried by date range constantly (PMC charts, weekly summaries, trend analysis). TimescaleDB chunk skipping and compression are designed for exactly this query pattern. Converting after data exists requires downtime and a migration script.

**Why NOT hypertables for users/profiles/consent:** These are relational tables queried by ID, not by time range. No performance benefit.

```sql
-- Source: https://www.tigerdata.com/docs/api/latest/hypertable/create_hypertable
-- Modern TimescaleDB syntax (2.x with tsdb.hypertable parameter):

-- In Alembic migration, AFTER creating the table, call create_hypertable
-- via op.execute() since Alembic has no native TimescaleDB support

-- Phase 1 only defines the schema; activities and daily_metrics will be
-- physically created in Phase 3 when Garmin data arrives. However,
-- create the tables as hypertables now so Phase 3 doesn't need a schema migration.

-- Option A: Modern syntax (TimescaleDB 2.x)
CREATE TABLE activities (
    id          BIGSERIAL,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at  TIMESTAMPTZ NOT NULL,
    sport       VARCHAR(30) NOT NULL,
    -- ... other columns
    PRIMARY KEY (id, started_at)  -- hypertables require time column in PK
) WITH (tsdb.hypertable, tsdb.segmentby = 'user_id', tsdb.orderby = 'started_at DESC');

-- Option B: Legacy syntax (also works in TimescaleDB 2.x)
CREATE TABLE activities ( ... );
SELECT create_hypertable('activities', 'started_at',
    chunk_time_interval => INTERVAL '7 days'  -- 7 days default; good for athlete data
);
```

```python
# In Alembic migration file:
def upgrade():
    # Create table with regular DDL
    op.create_table('activities', ...)

    # Then convert to hypertable
    op.execute("""
        SELECT create_hypertable(
            'activities',
            'started_at',
            chunk_time_interval => INTERVAL '7 days'
        )
    """)

    # IMPORTANT: Alembic autogenerate will try to drop the auto-created
    # TimescaleDB index on the time column. Exclude it in env.py:
    # See: https://github.com/sqlalchemy/alembic/discussions/1465
```

**Alembic + TimescaleDB index conflict fix:**
```python
# In alembic/env.py — prevent autogenerate from dropping TimescaleDB indexes
def include_object(object, name, type_, reflected, compare_to):
    if type_ == "index" and reflected and compare_to is None:
        # TimescaleDB auto-creates indexes; ignore reflected-only indexes
        return False
    return True

context.configure(
    ...
    include_object=include_object,
)
```

### Pattern 5: GDPR Consent Schema and Flow

**What:** Granular, versioned, explicitly-documented consent records stored separately from the user profile.
**When to use:** At registration. Health data processing cannot begin until relevant consents are collected.
**Legal basis:** GDPR Article 9 — health data (HRV, sleep, heart rate, weight, body composition) is "special category" data requiring explicit consent, not just standard consent.

```sql
-- Consent records table (regular PostgreSQL table, not hypertable)
CREATE TABLE consent_records (
    id              BIGSERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_type    VARCHAR(50) NOT NULL,    -- 'health_data', 'garmin_sync', 'data_analytics', 'marketing'
    consent_version VARCHAR(20) NOT NULL,    -- '1.0', '1.1' -- version of the consent text shown
    granted         BOOLEAN NOT NULL,
    granted_at      TIMESTAMPTZ,
    withdrawn_at    TIMESTAMPTZ,
    ip_address      INET,
    user_agent      TEXT,
    consent_text    TEXT NOT NULL,           -- exact text user saw when consenting
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    -- Each user can have one active record per consent type
    UNIQUE(user_id, consent_type, consent_version)
);
```

**Consent types for Phase 1:**
| Type | Description | Required for |
|------|-------------|-------------|
| `health_data` | Processing HRV, sleep, heart rate, body composition | All health features |
| `garmin_sync` | Accessing Garmin Connect data on user's behalf | Phase 3 data sync |
| `coaching_ai` | Using training history to generate AI coaching | Phase 5 AI coach |
| `data_analytics` | Aggregated analytics for platform improvement | Optional |

**GDPR-compliant registration flow:**
1. User fills registration form (email + password)
2. Account is created but not activated
3. BEFORE first login, present consent screens (one per consent type, separate screens not bundled)
4. User explicitly checks each box after reading the consent text
5. On submit, `consent_records` rows are inserted with timestamp, version, IP, user agent
6. Account is activated; user redirected to profile setup

**Data deletion endpoint (required by GDPR):**
```python
# DELETE /users/me — must actually delete all data, not soft-delete
@router.delete("/users/me")
async def delete_account(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # ON DELETE CASCADE handles: athlete_profiles, activities, daily_metrics,
    # planned_workouts, consent_records (all foreign key to users.id)
    await db.delete(current_user)
    await db.commit()
    # Note: consent_records are retained per GDPR - you need proof of consent
    # even after account deletion. Anonymize rather than delete them.
    # See: Open Question 2
```

### Anti-Patterns to Avoid

- **Storing JWT access tokens in localStorage:** XSS can steal them. Use memory (React state) + httpOnly cookie for refresh token.
- **Using python-jose:** Abandoned library. FastAPI officially dropped it. Use PyJWT.
- **Single combined consent checkbox:** "I agree to Terms of Service" does NOT satisfy GDPR Article 9 explicit consent. Must be separate, specific, and deliberate per data type.
- **App-only user isolation (no RLS):** One buggy query exposes all users' health data. Use both app-level filtering AND PostgreSQL RLS.
- **Deferring hypertable creation:** Altering a populated table to a hypertable requires downtime. Set it up in the first migration.
- **Storing passwords without hashing:** Use pwdlib with Argon2. Never bcrypt directly anymore (pwdlib wraps it better but Argon2 is the recommended algorithm).
- **Missing `postgresql+asyncpg://` dialect prefix:** Using `postgresql://` silently falls back to synchronous driver, blocking the event loop under load.
- **Soft-deleting users:** GDPR right to erasure requires actual deletion. Use hard delete with CASCADE. See exception for consent records in Open Questions.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt wrapper | `pwdlib[argon2]` | Argon2 is the current recommended algorithm; timing-safe comparison included |
| JWT creation/validation | Custom JWT library | `PyJWT` | Edge cases in signature validation, expiry, key handling |
| Settings/env loading | `os.getenv()` everywhere | `pydantic-settings` | Type coercion, validation, `.env` file support, IDE completion |
| CORS configuration | Manual headers | `fastapi.middleware.cors.CORSMiddleware` | Handles preflight, credentials, wildcards correctly |
| Multi-user row filtering | Manual `WHERE user_id=?` only | PostgreSQL RLS as safety net | Defense-in-depth; prevents data leaks from service bugs |
| Alembic async setup | Manual migration scripts | `alembic init -t async` template | Async template handles event loop correctly for async engines |
| TimescaleDB hypertable creation | Custom partitioning | `create_hypertable()` in migration | TimescaleDB handles chunk management, compression, retention automatically |

**Key insight:** Authentication and authorization in particular have many subtle edge cases (timing attacks on password comparison, JWT algorithm confusion attacks, CSRF with cookies). Use the official library patterns exactly — don't improvise.

## Common Pitfalls

### Pitfall 1: Wrong SQLAlchemy Dialect String
**What goes wrong:** Using `postgresql://` instead of `postgresql+asyncpg://` in the database URL. The connection appears to work in development but uses the synchronous driver, blocking the event loop under any load.
**Why it happens:** `postgresql://` is the familiar SQLAlchemy URL. The asyncpg dialect requires the explicit driver specification.
**How to avoid:** Always set `DATABASE_URL=postgresql+asyncpg://...` in `.env`. Validate the URL format in `Settings.model_validator` at startup.
**Warning signs:** Fast in dev, mysteriously slow under concurrent load; async routes that pause unexpectedly.

### Pitfall 2: GDPR Consent as Checkbox, Not as Record
**What goes wrong:** Treating consent as a boolean in the users table (`gdpr_accepted: bool`). This fails GDPR Article 9 in multiple ways: no version tracking (consent text can change), no granularity (must be separate per purpose), no timestamp/IP for proof of consent, no withdrawal mechanism.
**Why it happens:** "I agreed to the terms" feels like sufficient consent to developers.
**How to avoid:** Implement the `consent_records` table from the architecture section. Present separate consent screens for each data type. Store the exact consent text version shown.
**Warning signs:** Single `consent_accepted` boolean in the users table; no consent version field; no withdrawal endpoint.

### Pitfall 3: Alembic Autogenerate Dropping TimescaleDB Indexes
**What goes wrong:** Running `alembic revision --autogenerate` after creating hypertables generates a migration that drops the auto-created TimescaleDB index on the time column. If applied, it breaks hypertable functionality.
**Why it happens:** Alembic sees a "reflected" index that has no corresponding Python model definition, so it marks it for deletion.
**How to avoid:** Add the `include_object` filter in `alembic/env.py` (see code example in Pattern 4). Test autogenerate before applying migrations.
**Warning signs:** Autogenerated migration contains `op.drop_index()` for an index named like `_hyper_1_1_chunk_...` or `activities_started_at_idx`.

### Pitfall 4: Missing RLS Context Setting
**What goes wrong:** PostgreSQL RLS policies using `current_setting('app.current_user_id')` silently fail (or block all queries) if the FastAPI dependency that sets this context variable is not applied to all protected routes.
**Why it happens:** Developers forget to use `get_db_for_user` instead of `get_db` on some routes, or use `get_db` in background tasks where no user context exists.
**How to avoid:** Make `get_db_for_user` the standard dependency for all user-facing routes. Create a separate `get_db_admin` for background tasks and migrations that bypasses RLS. Test cross-user isolation explicitly in the test suite.
**Warning signs:** Routes returning empty results for all users; 500 errors mentioning `unrecognized configuration parameter "app.current_user_id"` if `true` flag is not used in `current_setting()`.

### Pitfall 5: Refresh Token Not Invalidated on Logout
**What goes wrong:** Logout only removes the cookie client-side. The refresh token itself is still valid until expiry. A stolen refresh token remains usable even after the user logs out.
**Why it happens:** Stateless JWT is appealing because it requires no server-side storage. Logout "just works" by deleting the cookie, but the token is still cryptographically valid.
**How to avoid:** For Phase 1, accept this limitation as a known tradeoff and document it. For production hardening, maintain a small Redis set of revoked refresh token JTIs (JWT IDs). Check this set in the refresh endpoint. The `jti` claim (JWT ID) enables this without storing full tokens.
**Warning signs:** User logs out but the refresh token obtained before logout still works when submitted directly to `/auth/refresh`.

### Pitfall 6: Data Deletion Not Cascading Completely
**What goes wrong:** `DELETE FROM users WHERE id=?` cascades to foreign-keyed tables but misses: cached data in Redis, AI conversation logs, background job queues, application logs with user email, analytics events.
**Why it happens:** Cascade in the database handles DB-layer data; non-DB stores are invisible to it.
**How to avoid:** Write a `delete_user_data(user_id)` service function that explicitly cleans: Redis keys with user prefix, removes queued jobs for the user, logs a deletion audit event. Test with a real account deletion.
**Warning signs:** Deleted user's data still appears in Redis; background sync jobs running for deleted users.

## Code Examples

### User Registration
```python
# Source: https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ (official FastAPI docs)
# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, TokenResponse
from app.services.auth_service import create_user, create_access_token, create_refresh_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    request: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    # Check for existing email
    existing = await db.execute(select(User).where(User.email == request.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = await create_user(db, request.email, request.password)

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    response.set_cookie(
        key="refresh_token", value=refresh_token,
        httponly=True, secure=True, samesite="lax",
        max_age=30 * 24 * 60 * 60,
    )
    return TokenResponse(access_token=access_token, token_type="bearer")
```

### Athlete Profile Model
```python
# app/models/athlete_profile.py
from sqlalchemy import Column, Integer, Float, String, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class AthleteProfile(Base):
    __tablename__ = "athlete_profiles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Cycling thresholds
    ftp_watts = Column(Integer)           # Functional Threshold Power
    lthr_cycling = Column(Integer)        # Lactate Threshold HR cycling

    # Running thresholds
    running_threshold_pace_ms = Column(Float)   # m/s at threshold
    lthr_running = Column(Integer)

    # General
    max_heart_rate = Column(Integer)
    resting_heart_rate = Column(Integer)
    weight_kg = Column(Float)
    date_of_birth = Column(String)        # store as ISO string, not Date, for simplicity

    # Training availability
    weekly_hours_available = Column(Float)   # max training hours per week
    primary_sport = Column(String(20))        # cycling, running
    secondary_sports = Column(JSON)           # list of sport strings

    # Goals (stored as JSON for flexibility — schema evolves)
    goals = Column(JSON)                  # {"target_ftp": 300, "target_event": {...}, "weekly_hours": 10}

    # FTP history — list of {ftp_watts, measured_at} dicts
    ftp_history = Column(JSON, default=list)

    __table_args__ = (UniqueConstraint("user_id"),)
    user = relationship("User", back_populates="athlete_profile")
```

### Alembic Async env.py Template Key Section
```python
# Source: https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/
# migrations/env.py — key additions needed

from app.database import Base
from app.models import user, athlete_profile, consent  # MUST import all models

# Include object filter to prevent TimescaleDB index deletion
def include_object(object, name, type_, reflected, compare_to):
    if type_ == "index" and reflected and compare_to is None:
        return False
    return True

async def run_migrations_online() -> None:
    connectable = create_async_engine(config.get_main_option("sqlalchemy.url"))
    async with connectable.connect() as connection:
        await connection.run_sync(
            context.configure,
            target_metadata=target_metadata,
            include_object=include_object,
        )
        async with context.begin_transaction():
            await context.run_migrations()
```

### React Auth Context (Frontend)
```typescript
// Source: community pattern verified via multiple sources
// src/contexts/AuthContext.tsx
import { createContext, useContext, useState, useEffect } from 'react'
import { apiClient } from '../api/client'

interface AuthContextType {
  user: User | null
  accessToken: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Access token lives in memory only — NOT localStorage
  // Refresh token lives in httpOnly cookie (not accessible here)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)

  // On mount: try to get a new access token using the httpOnly refresh token cookie
  useEffect(() => {
    apiClient.post('/auth/refresh')
      .then(res => setAccessToken(res.data.access_token))
      .catch(() => {/* not logged in */})
  }, [])

  const login = async (email: string, password: string) => {
    const res = await apiClient.post('/auth/login', { email, password })
    setAccessToken(res.data.access_token)
    // Refresh token set as httpOnly cookie by server response — no action needed here
  }

  const logout = async () => {
    await apiClient.post('/auth/logout')  // server clears cookie
    setAccessToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, login, logout, isAuthenticated: !!accessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `python-jose` for JWT | `PyJWT` | 2024 | python-jose abandoned; FastAPI officially switched recommendation |
| `passlib` for password hashing | `pwdlib[argon2]` | 2024 | passlib maintenance issues; FastAPI now recommends pwdlib |
| `aioredis` for async Redis | `redis-py` with `redis.asyncio` | 2023 | aioredis merged into redis-py; single package |
| `postgresql://` URL | `postgresql+asyncpg://` URL | SQLAlchemy 2.0 | Required for true async; wrong URL silently uses sync driver |
| `create_hypertable()` function call | `WITH (tsdb.hypertable)` DDL parameter | TimescaleDB 2.x | Modern syntax, but `create_hypertable()` still works and is more widely documented |
| OAuth2 implicit flow | OAuth2 PKCE | 2023 | Implicit flow deprecated; relevant for Garmin OAuth in Phase 3 |

**Deprecated/outdated:**
- `python-jose`: Abandoned, security issues, FastAPI dropped it — never use
- `passlib`: Soft-deprecated in FastAPI docs — use `pwdlib` instead
- Garmin OAuth 1.0: Retirement is 12/31/2026 — build only on OAuth 2.0 PKCE

## Open Questions

1. **Redis for refresh token revocation in Phase 1?**
   - What we know: Stateless JWT refresh tokens cannot be invalidated without a revocation store. httpOnly cookie logout prevents client-side reuse but doesn't invalidate the token cryptographically.
   - What's unclear: Is immediate invalidation required for Phase 1 given this is a personal-scale app initially?
   - Recommendation: Defer Redis to Phase 2. Add a `jti` (JWT ID) claim to refresh tokens from the start so the revocation store can be bolted on later. Document this as a known Phase 1 limitation.

2. **Consent record retention after account deletion**
   - What we know: GDPR Art. 17 requires data deletion on request. But consent records serve as legal proof of lawful processing — deleting them could undermine your legal basis documentation.
   - What's unclear: How long must consent records be retained after account deletion?
   - Recommendation: Anonymize consent records on account deletion (null the user_id, keep only the timestamp and consent version). Do NOT cascade-delete consent_records when the user is deleted. Get legal review before launch.

3. **TimescaleDB `create_hypertable` vs `WITH (tsdb.hypertable)` syntax**
   - What we know: The modern `WITH (tsdb.hypertable)` syntax is recommended in current TimescaleDB 2.x docs. `create_hypertable()` is documented as "legacy" but still fully supported.
   - What's unclear: Whether the modern syntax is supported in the self-hosted TimescaleDB Docker image (`timescale/timescaledb:latest-pg16`) vs only Timescale Cloud.
   - Recommendation: Use `create_hypertable()` via `op.execute()` in Alembic migrations for maximum compatibility. Test both syntaxes against the Docker image before committing.

4. **Primary key constraint with hypertables**
   - What we know: TimescaleDB requires the partition column (time column) to be part of the primary key for hypertables with space partitioning.
   - What's unclear: Whether this changes the foreign key patterns on child tables that reference `activities.id`.
   - Recommendation: Use composite primary key `(id, started_at)` for hypertables. Reference `activities` from other tables by `id` only (not the composite key) — PostgreSQL allows this for foreign keys as long as `id` has a unique constraint.

## Sources

### Primary (HIGH confidence)
- https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/ — Official FastAPI JWT auth docs; PyJWT + pwdlib recommendation verified
- https://berkkaraal.com/blog/2024/09/19/setup-fastapi-project-with-async-sqlalchemy-2-alembic-postgresql-and-docker/ — Async SQLAlchemy 2.0 + Alembic setup patterns
- https://www.tigerdata.com/docs/api/latest/hypertable/create_hypertable — TimescaleDB create_hypertable parameters (official, post-redirect)
- https://www.themomentum.ai/blog/gdpr-consent-requirements-health-data — GDPR Article 9 explicit consent requirements for fitness apps
- Project STACK.md and ARCHITECTURE.md in `.planning/research/` — Pre-existing verified research on full platform stack

### Secondary (MEDIUM confidence)
- https://github.com/sqlalchemy/alembic/discussions/1465 — TimescaleDB + Alembic index conflict, confirmed community fix
- Multiple WebSearch results confirming JWT httpOnly cookie pattern (verified against FastAPI official docs)
- WebSearch results on TimescaleDB chunk interval recommendations (consistent across multiple sources: 7-day default is good for athlete data volumes)

### Tertiary (LOW confidence)
- WebSearch results on GDPR consent record retention after deletion — no definitive official source; needs legal review

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — core libraries verified via official FastAPI docs and project's own prior research (STACK.md)
- Architecture patterns: HIGH for auth/SQLAlchemy, MEDIUM for RLS pattern (working pattern but some details inferred)
- GDPR requirements: HIGH for what's required, LOW for retention-after-deletion edge case
- TimescaleDB hypertable syntax: MEDIUM — `create_hypertable()` is widely documented; modern `WITH (tsdb.hypertable)` syntax confirmed in docs but Docker image compatibility needs testing

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (stable stack; GDPR requirements are stable; TimescaleDB syntax is stable)
