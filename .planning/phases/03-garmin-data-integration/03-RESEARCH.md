# Phase 3: Garmin Data Integration - Research

**Researched:** 2026-04-16
**Domain:** Garmin Connect API, python-garminconnect, async background sync, credential encryption
**Confidence:** MEDIUM (core library verified via official GitHub source; JSON field names partially verified; rate limit details absent from official docs)

---

## Summary

Phase 3 integrates the unofficial `python-garminconnect` library behind an abstraction layer so that Garmin activities and daily biometrics (sleep, HRV, body battery, training status) flow into the existing TimescaleDB hypertables created in Phase 1. The library authenticates via Garmin's mobile SSO flow and stores DI OAuth tokens on disk; it auto-refreshes tokens with no re-login as long as the refresh token is valid, but MFA-enabled accounts have a known issue where fresh logins fail after token expiry. Garmin credentials (email + password) must be encrypted at rest because the unofficial library requires them for re-authentication; Fernet symmetric encryption stored in a `garmin_credentials` table is the standard approach.

The sync strategy is incremental polling via `get_activities_by_date`, deduplicating on `external_id` (Garmin's `activityId`). Background scheduling should use `APScheduler`'s `AsyncIOScheduler` integrated into FastAPI's `lifespan` context — this keeps everything in the same asyncio event loop without requiring Celery or a separate broker. The `daily_metrics` table (already created as a hypertable with a `recorded_at` partition column) needs an ORM model and a uniqueness-at-app-layer mechanism (unique constraint on `(user_id, date)` cannot be added at the DB layer due to TimescaleDB requiring the partition column in all unique indexes).

Power metrics (`averagePower`, `normalizedPower`) are present in `get_activities_by_date` response objects for cycling activities with a power meter, but the exact JSON key names require empirical verification — they are NOT in Garmin's official summary export format spec and may be `avgPower` / `normalizedPower` based on community sources. The activity detail endpoint (`get_activity_details`) contains richer data but costs an extra API call per activity and should be used selectively.

**Primary recommendation:** Use `python-garminconnect` with Fernet-encrypted credentials, `APScheduler AsyncIOScheduler` for periodic sync, and store `activityId` as `external_id` for idempotent upserts. Build the abstraction layer as a Python Protocol (structural typing) so the official API can slot in later without touching business logic.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `garminconnect` | latest (PyPI) | Unofficial Garmin Connect client | Only maintained Python wrapper; uses official Android SSO flow; 130+ endpoints |
| `cryptography` | >=42.0 | Fernet symmetric encryption for stored credentials | Standard Python crypto library; Fernet provides authenticated encryption, not just hashing |
| `apscheduler` | 3.x | Periodic background sync | AsyncIOScheduler runs in the FastAPI event loop; no broker/worker infrastructure needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `apscheduler[asyncio]` | 3.x | Async job executor | Required for non-blocking execution of sync jobs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `apscheduler` | Celery + Redis | Celery adds broker infrastructure; overkill for a single-tenant prototype with periodic polling |
| `apscheduler` | `asyncio.create_task` in lifespan | Less control over retry, misfire handling, and job state |
| Fernet in custom TypeDecorator | `sqlalchemy-utils` EncryptedType | sqlalchemy-utils TypeDecorator approach is equivalent but adds a dependency; custom TypeDecorator keeps it minimal |

### Installation
```bash
pip install garminconnect cryptography apscheduler
```

---

## Architecture Patterns

### Recommended Project Structure
```
backend/app/
├── models/
│   ├── garmin_credential.py   # GarminCredential ORM: encrypted email/password
│   └── daily_metric.py        # DailyMetric ORM: maps daily_metrics hypertable
├── services/
│   ├── garmin_client.py       # GarminProvider Protocol + GarminConnectClient impl
│   └── garmin_sync_service.py # Sync orchestration: activities + daily metrics
├── api/
│   └── garmin.py              # POST /garmin/connect, POST /garmin/sync, GET /garmin/status
└── scheduler.py               # APScheduler setup; mounted via lifespan
```

### Pattern 1: Provider Protocol (Abstraction Layer)
**What:** Define a `GarminProvider` Protocol with methods that match the data shape, not the library's API. Concrete implementations inject the actual library.
**When to use:** Everywhere. The business logic (sync service, TSS calculation) imports `GarminProvider`, not `garminconnect`.
**Example:**
```python
# Source: Python typing docs + project convention
from typing import Protocol
from datetime import date

class GarminProvider(Protocol):
    async def get_activities(self, start_date: date, end_date: date) -> list[dict]:
        ...

    async def get_sleep(self, for_date: date) -> dict | None:
        ...

    async def get_hrv(self, for_date: date) -> dict | None:
        ...

    async def get_body_battery(self, start_date: date, end_date: date) -> list[dict]:
        ...

    async def get_training_status(self, for_date: date) -> dict | None:
        ...


class GarminConnectClient:
    """Wraps the unofficial garminconnect library; implements GarminProvider."""

    def __init__(self, email: str, password: str, token_store: str | None = None):
        self._email = email
        self._password = password
        self._token_store = token_store
        self._api: Garmin | None = None

    async def _ensure_authenticated(self) -> None:
        if self._api is None:
            import asyncio
            loop = asyncio.get_event_loop()
            self._api = await loop.run_in_executor(None, self._login_sync)

    def _login_sync(self):
        from garminconnect import Garmin
        api = Garmin(email=self._email, password=self._password)
        api.login(tokenstore=self._token_store)
        return api

    async def get_activities(self, start_date: date, end_date: date) -> list[dict]:
        await self._ensure_authenticated()
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: self._api.get_activities_by_date(
                start_date.isoformat(), end_date.isoformat()
            )
        )
```

**Key point:** The library is synchronous. Wrap all calls in `loop.run_in_executor(None, ...)` to avoid blocking the asyncio event loop.

### Pattern 2: Idempotent Activity Upsert
**What:** Check `external_id` before inserting; skip if already present.
**When to use:** Every sync run, including initial historical backfill and incremental updates.
**Example:**
```python
# Source: project convention based on existing activity_service.py pattern
from sqlalchemy import select

async def upsert_activity(db: AsyncSession, user_id: int, garmin_data: dict, profile: AthleteProfile) -> Activity | None:
    external_id = str(garmin_data["activityId"])
    existing = await db.execute(
        select(Activity).where(
            Activity.user_id == user_id,
            Activity.external_id == external_id,
        )
    )
    if existing.scalar_one_or_none():
        return None  # already synced

    mapped = map_garmin_activity(garmin_data)
    return await create_activity(db, user_id, mapped, profile)
```

### Pattern 3: APScheduler AsyncIOScheduler in FastAPI Lifespan
**What:** Start/stop the scheduler in the lifespan context manager.
**When to use:** Any periodic background task that needs to run within the FastAPI process.
**Example:**
```python
# Source: APScheduler 3.x docs + FastAPI lifespan docs
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

scheduler = AsyncIOScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(run_all_user_syncs, "interval", hours=1, id="garmin_sync")
    scheduler.start()
    yield
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)
```

### Pattern 4: Fernet TypeDecorator for Encrypted Columns
**What:** SQLAlchemy `TypeDecorator` that transparently encrypts/decrypts values using Fernet.
**When to use:** `GarminCredential.encrypted_password` column.
**Example:**
```python
# Source: community pattern, verified against cryptography library docs
from cryptography.fernet import Fernet
from sqlalchemy import String
from sqlalchemy.types import TypeDecorator

class EncryptedString(TypeDecorator):
    impl = String
    cache_ok = True

    def __init__(self, key: bytes, *args, **kwargs):
        self._fernet = Fernet(key)
        super().__init__(*args, **kwargs)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return self._fernet.encrypt(value.encode()).decode()

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return self._fernet.decrypt(value.encode()).decode()
```

The Fernet key must be stored as an environment variable (e.g., `GARMIN_ENCRYPTION_KEY`), generated once with `Fernet.generate_key()` and never rotated without re-encrypting all rows.

### Anti-Patterns to Avoid
- **Calling garminconnect synchronously in async routes:** The library is sync; calling it without `run_in_executor` blocks the event loop for all users.
- **Storing Garmin password as plaintext:** Even in a prototype, encrypted storage is required — the password grants access to a third-party account.
- **Querying `get_activity_details` for every synced activity:** This makes N+1 API calls per sync. Use the list endpoint first; only call details for cycling activities where `avgPower` is absent or needed.
- **UNIQUE constraint at DB layer on `(user_id, date)` in daily_metrics:** TimescaleDB requires the partition column (`recorded_at`) in all unique constraints. Enforce one-record-per-day at the application layer instead.
- **Storing OAuth tokens in DB:** The library manages tokens in a file path. Configure `tokenstore` to a per-user path under a data volume (e.g., `/data/tokens/{user_id}/`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Garmin SSO auth flow | Custom HTTP session + cookie scraping | `garminconnect.Garmin.login()` | The OAuth flow involves CSRF tokens, redirect chains, and DI token exchange; the library handles all of this and stays updated when Garmin changes the flow |
| Symmetric encryption of credentials | XOR/ROT13 or base64 | `cryptography.fernet.Fernet` | Fernet provides authenticated encryption (AES-CBC + HMAC) so tampering is detectable |
| Periodic job scheduling | `asyncio.sleep` loop | `APScheduler AsyncIOScheduler` | APScheduler handles misfire policies, job persistence options, graceful shutdown, and exception logging |
| Activity deduplication | timestamp-based matching | `external_id` (Garmin's `activityId`) | Timestamps can shift with timezone corrections; `activityId` is stable and Garmin's own identifier |

**Key insight:** The unofficial Garmin API authentication flow is complex and fragile — Garmin changes it without notice. Never replicate it; always delegate to the library.

---

## Garmin Data Model Mapping

### Activity List Response (`get_activities_by_date`)
The list endpoint returns a JSON array. Verified field names (MEDIUM confidence — confirmed via multiple community sources but not official Garmin docs):

| Garmin JSON Key | Our Activity Field | Notes |
|-----------------|-------------------|-------|
| `activityId` | `external_id` (cast to str) | Garmin's stable unique ID |
| `activityName` | `title` | User-assigned name |
| `activityType.typeKey` | `sport` | e.g., `"cycling"`, `"running"`, mapped via lookup |
| `duration` | `duration_seconds` | Already in seconds |
| `distance` | `distance_meters` | Already in meters |
| `averageHR` | `average_hr` | Present for most activities |
| `maxHR` | `max_hr` | Present for most activities |
| `calories` | `calories` | `calories` key (not `activKilocalories`) in list response |
| `startTimeLocal` | `started_at` | ISO datetime string, parse to timezone-aware UTC |
| `avgPower` | `average_power` | LOW confidence — present for cycling with power meter; key may be `avgPower` or `averagePower` |
| `normalizedPower` | `normalized_power` | LOW confidence — may only be in `get_activity_details` response |
| `activityId` (str) | `source = "garmin"` | Hardcoded |

**Power metric caveat (LOW confidence):** The official Garmin summary export format does NOT include `avgPower` or `normalizedPower`. These fields appear in the internal API response for activities recorded with a power meter. The exact key names (`avgPower`, `averagePower`, `normalizedPower`) must be verified empirically by calling the API with a real cycling+power activity. Fall back to `get_activity_details` if the list response lacks power data.

**Sport type mapping:**
```python
GARMIN_SPORT_MAP = {
    "cycling": "cycling",
    "road_biking": "cycling",
    "mountain_biking": "cycling",
    "gravel_cycling": "cycling",
    "indoor_cycling": "cycling",
    "virtual_ride": "cycling",
    "running": "running",
    "trail_running": "running",
    "treadmill_running": "running",
    "strength_training": "gym",
    "fitness_equipment": "gym",
}
# Default to None / skip if unmapped
```

### Daily Metrics Response Mapping

#### Sleep (`get_sleep_data(date_str)`)
Returns `dict` with a `dailySleepDTO` key. Verified fields (MEDIUM confidence):

| Garmin Path | `daily_metrics` Column | Notes |
|------------|------------------------|-------|
| `dailySleepDTO.sleepScores.overall.value` OR `dailySleepDTO.sleepScore` | `sleep_score` | Key varies by device/firmware; check both paths |
| — | `raw_data` | Store full `dailySleepDTO` for future use |

The `sleepScore` integer (0-100) is the target; the nested path `sleepScores.overall.value` is used by newer firmware. Always check `raw_data` as fallback.

#### HRV (`get_hrv_data(date_str)`)
Returns `dict | None` (returns None if device doesn't support HRV or data unavailable).

| Garmin Path | `daily_metrics` Column | Notes |
|------------|------------------------|-------|
| `hrvSummary.lastNight` OR `hrv5MinHigh` | `hrv_status` | Nightly average RMSSD in ms; field name varies |
| — | `raw_data` | Store full response |

**Important:** `get_hrv_data` returns `None` (not an empty dict) when unavailable — guard against None before accessing keys.

#### Body Battery (`get_body_battery(start_date, end_date)`)
Returns a list of daily objects.

| Garmin Path | `daily_metrics` Column | Notes |
|------------|------------------------|-------|
| `[0].charged` | `body_battery` | End-of-day peak body battery (0-100) |
| — | `raw_data` | Store per-date object |

The list endpoint returns one object per date in the range. Access `[0]` when fetching a single day. The `charged` field is the highest body battery reading of the day.

#### Training Status (`get_training_status(date_str)`)
Returns `dict`. The `trainingStatus` sub-key holds the value string.

| Garmin Path | `daily_metrics` Column | Notes |
|------------|------------------------|-------|
| — | `raw_data` | Training status is a string enum (e.g., `"PRODUCTIVE"`, `"MAINTAINING"`, `"RECOVERY"`); store in `raw_data`, no dedicated column in current schema |

#### Resting HR / Stress (`get_user_summary(date_str)`, `get_all_day_stress(date_str)`)
| Garmin Path | `daily_metrics` Column |
|------------|------------------------|
| `restingHeartRate` from `get_heart_rates(date)` | `resting_hr` |
| `avgStressLevel` from `get_all_day_stress(date)` | `stress_level` |
| `totalSteps` from `get_user_summary(date)` | `steps` |

### DailyMetric ORM Model (needs to be created)
The `daily_metrics` table already exists in the DB (created in Phase 1 migration `a076ea752213`). The schema is:
```sql
id BIGSERIAL, user_id INTEGER, date DATE, recorded_at TIMESTAMPTZ (PK + partition),
sleep_score INTEGER, hrv_status FLOAT, body_battery INTEGER, resting_hr INTEGER,
stress_level INTEGER, steps INTEGER, weight_kg FLOAT, source VARCHAR(50), raw_data JSONB
```

The ORM model must use a composite PK `(id, recorded_at)` matching the hypertable. Uniqueness on `(user_id, date)` must be enforced at the service layer — check for existing row with that user_id+date before inserting.

---

## Security: Credential Storage

### GarminCredential Model
Create a new `garmin_credentials` table (not a hypertable; standard PG table):

```python
class GarminCredential(Base):
    __tablename__ = "garmin_credentials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    encrypted_email: Mapped[str] = mapped_column(String, nullable=False)
    encrypted_password: Mapped[str] = mapped_column(String, nullable=False)
    token_store_path: Mapped[str | None] = mapped_column(String, nullable=True)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

### Encryption Key Management
- Add `GARMIN_ENCRYPTION_KEY` to `Settings` in `config.py`
- Generate once: `Fernet.generate_key().decode()` and store in `.env`
- The `EncryptedString` TypeDecorator reads the key from `settings.GARMIN_ENCRYPTION_KEY`
- Never commit the key; add to `.env.example` as `GARMIN_ENCRYPTION_KEY=<generate with Fernet.generate_key()>`

### Token Store Path
Configure `token_store_path` as `/data/garmin_tokens/{user_id}/` (volume-mounted in Docker). This keeps OAuth tokens separate from credentials and lets them persist across container restarts.

---

## Sync Strategy

### Initial Sync
On first connection: sync the last 90 days of activities using `get_activities_by_date` in 30-day chunks to avoid hitting undocumented pagination limits. Also backfill the last 30 days of daily metrics (sleep, HRV, body battery) one day at a time.

### Incremental Sync
Scheduled hourly: fetch activities from `(last_sync_at - 2 hours)` to now. The 2-hour buffer handles Garmin's upload delay (activities sync to Garmin Connect several minutes to hours after the workout ends).

### Duplicate Handling
`external_id` check before insert. Never update an existing activity — if Garmin sends updated data for the same `activityId`, the existing record takes precedence (avoids overwriting manually corrected TSS values).

### Rate Limiting
Garmin's unofficial API has no published rate limits. Observed community limits suggest 429 errors after ~100 requests in short bursts. Strategy:
- Add `asyncio.sleep(0.3)` between per-activity detail calls
- On 429: exponential backoff starting at 60 seconds
- Log 429s; do not fail the entire sync job

### MFA Accounts (Known Issue)
Accounts with Garmin 2FA enabled have a known library bug: after the refresh token expires, `login()` fails with "OAuth1 token is required for OAuth2 refresh". Mitigation: during initial credential setup, warn the user to disable 2FA on their Garmin account OR prompt them to re-enter credentials via the API. The `resume_login` method exists for interactive MFA but cannot be used in a background scheduler.

---

## Background Processing

### AsyncIOScheduler Setup
`APScheduler 3.x AsyncIOScheduler` runs jobs as coroutines in the same event loop as FastAPI. This avoids needing Celery, Redis, or worker processes.

```python
# Source: APScheduler 3.x docs
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="UTC")

async def run_all_user_syncs():
    """Fetch all users with sync_enabled=True and run incremental sync."""
    async with async_session_maker() as db:
        credentials = await db.execute(
            select(GarminCredential).where(GarminCredential.sync_enabled == True)
        )
        for cred in credentials.scalars():
            try:
                await sync_user_garmin(db, cred)
            except Exception as e:
                logger.error("Sync failed for user %s: %s", cred.user_id, e)
```

**Critical:** garminconnect's library methods are synchronous. Always wrap in `asyncio.get_event_loop().run_in_executor(None, ...)` or `asyncio.to_thread(...)` (Python 3.9+). `asyncio.to_thread` is preferred for Python 3.11.

```python
import asyncio
result = await asyncio.to_thread(api.get_activities_by_date, start_str, end_str)
```

### Job Misfire Policy
Configure `misfire_grace_time=600` (10 minutes) so that if the server restarts during a scheduled sync, the job still runs within the grace window rather than being skipped.

---

## Common Pitfalls

### Pitfall 1: Sync Library Blocking Event Loop
**What goes wrong:** Calling `api.get_activities_by_date(...)` directly in an `async def` function blocks the entire asyncio event loop. All other requests hang until Garmin responds.
**Why it happens:** `garminconnect` uses `requests` (synchronous HTTP) internally.
**How to avoid:** Always wrap calls in `await asyncio.to_thread(...)`.
**Warning signs:** API latency spikes during sync; all endpoints slow down simultaneously.

### Pitfall 2: Token Expiry with MFA Accounts
**What goes wrong:** After refresh token expiry (typically 30+ days of inactivity), re-login fails silently or raises `GarminConnectAuthenticationError` mid-sync.
**Why it happens:** Known bug in garminconnect for MFA accounts — the OAuth1→OAuth2 token bridge breaks.
**How to avoid:** Set `sync_enabled = False` and notify the user via a status field when auth fails. Provide a re-connect endpoint.
**Warning signs:** `GarminConnectAuthenticationError` in sync logs.

### Pitfall 3: TimescaleDB Unique Constraint on daily_metrics
**What goes wrong:** Adding `UNIQUE(user_id, date)` to `daily_metrics` fails because TimescaleDB requires all unique constraints to include the partition column (`recorded_at`).
**Why it happens:** TimescaleDB hypertable chunks require the partition column in all unique indexes for cross-chunk lookups.
**How to avoid:** Enforce uniqueness in the service layer with a `SELECT` before `INSERT`. The migration comment in `a076ea752213` already documents this.
**Warning signs:** `psycopg2.errors.InvalidTableDefinition: unique constraint on partitioned table must include all partitioning columns`.

### Pitfall 4: Power Fields Missing for Non-Power Activities
**What goes wrong:** Mapper crashes when `avgPower` key is absent from the activity dict (e.g., running activities, older cycling activities without a power meter).
**Why it happens:** Power fields are only present when the activity was recorded with a compatible power meter.
**How to avoid:** Use `activity.get("avgPower")` with `None` default everywhere. The `Activity` model already allows `nullable=True` for power fields.

### Pitfall 5: HRV Returns None (Not Empty Dict)
**What goes wrong:** `get_hrv_data(date)` returns `None` when no HRV data is available. Accessing `.get(...)` on `None` raises `AttributeError`.
**Why it happens:** Some Garmin devices do not record overnight HRV (requires Garmin device with HRV Status feature).
**How to avoid:** Always check `if hrv_data is None: return` before accessing keys.

### Pitfall 6: `started_at` Timezone Handling
**What goes wrong:** Garmin returns `startTimeLocal` (device local time, no timezone info) and `startTimeGMT` (UTC). Using `startTimeLocal` without timezone annotation leads to incorrect UTC comparisons.
**Why it happens:** The TimescaleDB hypertable uses `TIMESTAMPTZ` (timezone-aware). Naive datetimes cause comparison bugs and partition routing issues.
**How to avoid:** Parse `startTimeGMT` and attach UTC: `datetime.fromisoformat(activity["startTimeGMT"]).replace(tzinfo=timezone.utc)`.

---

## Code Examples

### Authentication with Token Persistence
```python
# Source: python-garminconnect __init__.py (verified via GitHub)
import asyncio
from garminconnect import Garmin, GarminConnectAuthenticationError

async def create_garmin_client(email: str, password: str, token_store_path: str) -> Garmin:
    def _login():
        api = Garmin(email=email, password=password)
        api.login(tokenstore=token_store_path)
        return api

    try:
        return await asyncio.to_thread(_login)
    except GarminConnectAuthenticationError as e:
        raise ValueError(f"Garmin authentication failed: {e}") from e
```

### Fetch Activities by Date Range
```python
# Source: python-garminconnect __init__.py (verified via GitHub)
from datetime import date
import asyncio

async def fetch_activities(api: Garmin, start: date, end: date) -> list[dict]:
    return await asyncio.to_thread(
        api.get_activities_by_date,
        start.isoformat(),
        end.isoformat(),
        "cycling",  # activitytype filter; pass None for all sports
    )
```

### Garmin Activity to ActivityCreate Mapping
```python
from datetime import timezone, datetime
from app.schemas.activity import ActivityCreate

SPORT_MAP = {
    "cycling": "cycling", "road_biking": "cycling", "indoor_cycling": "cycling",
    "gravel_cycling": "cycling", "mountain_biking": "cycling", "virtual_ride": "cycling",
    "running": "running", "trail_running": "running", "treadmill_running": "running",
    "strength_training": "gym", "fitness_equipment": "gym",
}

def map_garmin_activity(raw: dict) -> ActivityCreate | None:
    type_key = raw.get("activityType", {}).get("typeKey", "")
    sport = SPORT_MAP.get(type_key)
    if sport is None:
        return None  # skip unsupported sports

    started_at_str = raw.get("startTimeGMT") or raw.get("startTimeLocal")
    started_at = datetime.fromisoformat(started_at_str).replace(tzinfo=timezone.utc)

    return ActivityCreate(
        sport=sport,
        started_at=started_at,
        duration_seconds=int(raw.get("duration", 0)) or None,
        distance_meters=raw.get("distance"),
        average_hr=raw.get("averageHR"),
        max_hr=raw.get("maxHR"),
        calories=raw.get("calories"),
        title=raw.get("activityName"),
        # Power fields: key names need empirical verification; try both
        average_power=raw.get("avgPower") or raw.get("averagePower"),
        normalized_power=raw.get("normalizedPower"),
        source="garmin",
        external_id=str(raw["activityId"]),
    )
```

### Daily Metrics Upsert (app-layer uniqueness)
```python
from sqlalchemy import select
from app.models.daily_metric import DailyMetric

async def upsert_daily_metric(db: AsyncSession, user_id: int, for_date: date, data: dict) -> None:
    existing = await db.execute(
        select(DailyMetric).where(
            DailyMetric.user_id == user_id,
            DailyMetric.date == for_date,
        )
    )
    if existing.scalar_one_or_none():
        return  # already have data for this day

    metric = DailyMetric(
        user_id=user_id,
        date=for_date,
        sleep_score=data.get("sleep_score"),
        hrv_status=data.get("hrv_status"),
        body_battery=data.get("body_battery"),
        resting_hr=data.get("resting_hr"),
        stress_level=data.get("stress_level"),
        steps=data.get("steps"),
        source="garmin",
        raw_data=data.get("raw"),
    )
    db.add(metric)
    await db.commit()
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| garminconnect using OAuth1 cookies | DI OAuth Bearer tokens via Android SSO | ~2023-2024 | Token format changed; old saved tokens invalid after library upgrade |
| `garminconnect` using `garth` as dep | Internal SSO; `garth` deprecated | 2024 | `garth` library marked deprecated; `garminconnect` now standalone |
| APScheduler 4.x AsyncScheduler | APScheduler 3.x AsyncIOScheduler | APScheduler 4 is unstable/alpha | Use 3.x for production; 4.x API is completely different |

**Deprecated/outdated:**
- `garth` library: marked deprecated by its author; do not use directly
- APScheduler 4.x: the new async API (`AsyncScheduler`) is in alpha; stick with 3.x `AsyncIOScheduler`

---

## Open Questions

1. **Exact power field names in activity list response**
   - What we know: Power metrics exist in Garmin Connect for cycling activities with power meters; community sources use `avgPower` and `normalizedPower`
   - What's unclear: Whether these are in the list endpoint or only in `get_activity_details`
   - Recommendation: In the mapper, try `raw.get("avgPower") or raw.get("averagePower")` with a fallback to `None`. If `None` and it's a cycling activity, optionally call `get_activity_details(activity_id)` to get richer data — but only if TSS calculation is needed (FTP must be set).

2. **Sleep score JSON path**
   - What we know: `dailySleepDTO` is the top-level key; `sleepScore` exists but the nested path varies by firmware
   - What's unclear: Whether it's `dailySleepDTO.sleepScore` (flat) or `dailySleepDTO.sleepScores.overall.value` (nested)
   - Recommendation: Try flat path first; fall back to nested path; log when neither is present.

3. **Rate limit behavior**
   - What we know: 429 errors are reported in community issues; no official documentation of limits
   - What's unclear: Exact threshold, whether limits are per-IP or per-account
   - Recommendation: Add 300ms inter-request delay for bulk operations and exponential backoff on 429.

4. **Garmin Connect Developer Program (official API)**
   - What we know: Official API requires business entity approval; Phase 3 uses unofficial library
   - What's unclear: Timeline for approval if pursued; official API field names may differ from unofficial
   - Recommendation: The abstraction layer (GarminProvider Protocol) is the mitigation. When official API becomes available, write a new concrete class implementing the same Protocol.

---

## Sources

### Primary (HIGH confidence)
- `cyberjunky/python-garminconnect` GitHub — method signatures, endpoints, token storage flow, MFA issues
  - `garminconnect/__init__.py` — exact method signatures fetched directly
  - Issue #312 — MFA re-login failure documented
- FastAPI lifespan docs — `https://fastapi.tiangolo.com/advanced/events/`
- APScheduler 3.x docs — `https://apscheduler.readthedocs.io/en/3.x/userguide.html`

### Secondary (MEDIUM confidence)
- `mxd.codes` Garmin+Strapi article — activity list field names (`activityId`, `activityName`, `activityType`, `duration`, `distance`, `averageSpeed`)
- `olgarithm.medium.com` — confirmed `averageHR`, `maxHR`, `calories`, `vO2MaxValue` in activity response
- `support.mydatahelps.org/garmin-activity-summary-export-format` — official export format confirming `AverageHeartRateInBeatsPerMinute`, `MaxHeartRateInBeatsPerMinute`, `ActiveKilocalories`, `DurationInSeconds` (note: export format field names differ from API field names)
- Python `cryptography` Fernet docs — encryption pattern confirmed via GeeksForGeeks and other sources

### Tertiary (LOW confidence)
- Power field names (`avgPower`, `normalizedPower`) — referenced in community sources but not officially documented; must be verified empirically
- Sleep score JSON path — structure inferred from GarminSleepAnalytics repo and community discussion; exact path may vary by firmware
- HRV `lastNight` field name — inferred from field naming conventions; needs empirical verification
- Body battery `charged`/`drained` fields — referenced in one secondary source

---

## Metadata

**Confidence breakdown:**
- Standard stack (library choices): HIGH — garminconnect is the only maintained option; cryptography and apscheduler are well-established
- Authentication flow: HIGH — verified from library source code directly
- Activity field names (non-power): MEDIUM — confirmed via multiple community sources
- Power field names: LOW — not in official docs; community-sourced only
- Sleep/HRV/body battery field names: LOW — indirect sources only; must verify empirically
- Architecture patterns (Protocol, async wrapping, APScheduler): HIGH — standard Python patterns

**Research date:** 2026-04-16
**Valid until:** 2026-05-16 (garminconnect changes auth flow without notice; re-verify if auth issues arise)
