# Architecture Research

**Domain:** AI-Powered Multi-Sport Training Platform
**Researched:** 2026-04-16
**Confidence:** MEDIUM (Garmin API specifics require developer program access to fully verify; training science models are well-documented; AI coaching patterns are established but domain-specific application is novel)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────┐   │
│  │  Dashboard   │  │  Chat UI     │  │  Calendar / Plan View        │   │
│  │  (React)     │  │  (React)     │  │  (React)                     │   │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┬───────────────┘   │
├─────────┴──────────────────┴────────────────────────┴───────────────────┤
│                         API GATEWAY (FastAPI)                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────────┐  │
│  │  Auth/User │ │  Webhook   │ │  REST API  │ │  WebSocket (chat)    │  │
│  │  Router    │ │  Receiver  │ │  Routers   │ │  Handler             │  │
│  └─────┬──────┘ └─────┬──────┘ └─────┬──────┘ └──────────┬───────────┘  │
├────────┴──────────────┴──────────────┴───────────────────┴──────────────┤
│                         SERVICE LAYER                                    │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐  │
│  │  Athlete      │ │  Training     │ │  AI Coaching  │ │  Garmin     │  │
│  │  Profile      │ │  Engine       │ │  Service      │ │  Sync       │  │
│  │  Service      │ │  Service      │ │               │ │  Service    │  │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └──────┬──────┘  │
│          │                 │                  │                │         │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌─────────────┐  │
│  │  Nutrition    │ │  FIT File     │ │  Knowledge    │ │  Workout    │  │
│  │  Service      │ │  Generator    │ │  Base (RAG)   │ │  Builder    │  │
│  │  (Yazio)      │ │               │ │               │ │  Service    │  │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘ └──────┬──────┘  │
├──────────┴─────────────────┴─────────────────┴───────────────┴──────────┤
│                         DATA LAYER                                       │
│  ┌───────────────────────┐ ┌─────────────┐ ┌──────────────────────────┐  │
│  │  PostgreSQL           │ │  Redis      │ │  Vector Store            │  │
│  │  (+ TimescaleDB)      │ │  (cache +   │ │  (pgvector or           │  │
│  │                       │ │   queue)    │ │   ChromaDB)              │  │
│  └───────────────────────┘ └─────────────┘ └──────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                         EXTERNAL SERVICES                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  Garmin    │  │  Yazio     │  │  Claude    │  │  Garmin FIT      │   │
│  │  Connect   │  │  API       │  │  API       │  │  SDK             │   │
│  │  API       │  │            │  │            │  │                  │   │
│  └────────────┘  └────────────┘  └────────────┘  └──────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Dashboard UI** | Display daily readiness, training load charts (CTL/ATL/TSB), body metrics, upcoming workouts | React + charting library (Recharts or Chart.js) |
| **Chat UI** | Streaming conversational interface for AI coaching, workout creation, plan adjustments | React + WebSocket/SSE for streaming Claude responses |
| **Calendar/Plan View** | Visualize training plan structure (macrocycle/mesocycle/microcycle), drag workouts | React + calendar component |
| **Auth/User Router** | OAuth2 flow for Garmin, JWT session management, multi-tenant user isolation | FastAPI security, python-jose |
| **Webhook Receiver** | Receive Garmin Health API push notifications for new activities/sleep/HRV data | FastAPI endpoint, signature verification |
| **Athlete Profile Service** | CRUD for athlete settings (FTP, threshold pace, weight, goals, sport preferences) | SQLAlchemy models, Pydantic schemas |
| **Training Engine Service** | Calculate TSS/CTL/ATL/TSB, manage periodization cycles, generate training blocks | Pure Python computation module, no external deps |
| **AI Coaching Service** | Orchestrate Claude API calls with athlete context, manage prompt assembly, parse structured responses | Anthropic Python SDK, context assembly pipeline |
| **Garmin Sync Service** | Bi-directional sync: receive activities via webhook, push workouts via Training API | python-garminconnect or direct Garmin API |
| **FIT File Generator** | Convert structured workout definitions into Garmin .FIT binary format | garmin-fit-sdk (official) for encoding |
| **Workout Builder Service** | Translate AI/engine workout descriptions into structured step sequences | Domain logic, sport-specific step templates |
| **Nutrition Service** | Ingest Yazio data (calories, macros), correlate with training load | API client, data normalization |
| **Knowledge Base (RAG)** | Store/retrieve training science documents for AI context enrichment | Embeddings + vector search |

## Recommended Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app factory, middleware
│   ├── config.py                  # Settings via pydantic-settings
│   ├── dependencies.py            # Shared DI (db session, current user)
│   │
│   ├── api/                       # Route handlers only (thin)
│   │   ├── auth.py                # Login, OAuth callbacks
│   │   ├── athletes.py            # Athlete profile CRUD
│   │   ├── dashboard.py           # Dashboard data aggregation
│   │   ├── workouts.py            # Workout CRUD + FIT export
│   │   ├── training_plan.py       # Plan generation, calendar ops
│   │   ├── chat.py                # AI chat WebSocket/SSE endpoint
│   │   └── webhooks.py            # Garmin push notification receiver
│   │
│   ├── services/                  # Business logic (testable, no HTTP)
│   │   ├── athlete_service.py
│   │   ├── training_engine.py     # TSS/CTL/ATL/TSB + periodization
│   │   ├── ai_coaching.py         # Claude API orchestration
│   │   ├── garmin_sync.py         # Garmin Connect integration
│   │   ├── fit_generator.py       # .FIT file encoding
│   │   ├── workout_builder.py     # Structured workout creation
│   │   ├── nutrition_service.py   # Yazio data ingestion
│   │   └── knowledge_base.py      # RAG retrieval
│   │
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── user.py
│   │   ├── athlete_profile.py
│   │   ├── activity.py            # Synced activities from Garmin
│   │   ├── daily_metrics.py       # Sleep, HRV, stress, weight
│   │   ├── workout.py             # Planned workouts
│   │   ├── training_plan.py       # Periodization plan structure
│   │   └── training_load.py       # CTL/ATL/TSB time series
│   │
│   ├── schemas/                   # Pydantic request/response models
│   │
│   ├── engine/                    # Pure computation, no IO
│   │   ├── tss_calculator.py      # Sport-specific TSS formulas
│   │   ├── performance_model.py   # CTL/ATL/TSB exponential decay
│   │   ├── periodization.py       # Mesocycle/microcycle generation
│   │   ├── readiness_score.py     # Multi-factor daily readiness
│   │   └── zone_calculator.py     # HR/power/pace zone computation
│   │
│   ├── ai/                        # AI-specific code
│   │   ├── context_builder.py     # Assemble athlete context for Claude
│   │   ├── prompt_templates.py    # System prompts, structured output schemas
│   │   ├── response_parser.py     # Parse Claude structured responses
│   │   └── rag_pipeline.py        # Embedding + retrieval pipeline
│   │
│   └── integrations/              # External API clients
│       ├── garmin_client.py
│       ├── yazio_client.py
│       └── fit_sdk_wrapper.py
│
├── knowledge/                     # Training science documents for RAG
│   ├── periodization/
│   ├── nutrition/
│   └── recovery/
│
├── migrations/                    # Alembic
├── tests/
└── pyproject.toml
```

### Structure Rationale

- **`api/` vs `services/`:** Routes are thin HTTP adapters. All business logic in services, making it testable without HTTP. This separation is critical because the AI coaching service is complex and must be independently testable.
- **`engine/`:** Pure computation with zero IO dependencies. The TSS/CTL/ATL/TSB calculations, zone computations, and periodization logic are mathematical -- they should be pure functions that take data in and return results. This makes them fast, testable, and debuggable.
- **`ai/`:** Isolated AI orchestration code. Context building, prompt templates, and response parsing change independently from business logic. Separating them means you can iterate on prompts without touching services.
- **`integrations/`:** External API clients wrapped behind clean interfaces. When Garmin changes their API, only one file changes.

## Architectural Patterns

### Pattern 1: Athlete Context Assembly Pipeline

**What:** A staged pipeline that assembles the right athlete context for each Claude API call, keeping token usage efficient while providing enough context for good recommendations.

**When to use:** Every AI coaching interaction (chat, plan generation, daily briefing).

**Trade-offs:** More complex than dumping everything into the prompt, but saves 80%+ on token costs and produces better recommendations because the context is focused.

**How it works:**

The core challenge is that an athlete's full history (years of activities, daily metrics, nutrition logs) far exceeds Claude's context window. You need a tiered context assembly strategy:

```python
# Context tiers (assembled per-request)
class AthleteContext:
    # TIER 1: Always included (~500 tokens)
    # Static profile: FTP, threshold pace, weight, age, goals, injury history
    profile: AthleteProfile

    # TIER 2: Always included (~800 tokens)
    # Current state: today's CTL/ATL/TSB, last night's sleep/HRV,
    # current mesocycle phase, days until target event
    current_state: CurrentState

    # TIER 3: Included for plan/workout requests (~1500 tokens)
    # Recent history: last 7-14 days of activities with TSS,
    # weekly volume trend, compliance rate
    recent_history: list[ActivitySummary]

    # TIER 4: Included when relevant (~variable tokens)
    # RAG results: training science documents relevant to the query
    knowledge_context: list[RetrievedDocument]

    # TIER 5: Included for deep analysis only (~2000 tokens)
    # Extended history: 6-week rolling summary, season progression,
    # performance test results
    extended_history: SeasonSummary
```

**Context budget management:**

```python
MAX_CONTEXT_TOKENS = 8000  # Reserve rest for system prompt + response

def build_context(athlete_id: int, request_type: str, query: str) -> str:
    budget = MAX_CONTEXT_TOKENS
    sections = []

    # Tier 1+2 always included
    profile = get_athlete_profile(athlete_id)      # ~500 tokens
    state = get_current_state(athlete_id)           # ~800 tokens
    sections.extend([format_profile(profile), format_state(state)])
    budget -= estimate_tokens(sections)

    # Tier 3 for workout/plan requests
    if request_type in ("workout", "plan", "analysis"):
        history = get_recent_history(athlete_id, days=14)
        sections.append(format_history(history))
        budget -= estimate_tokens(format_history(history))

    # Tier 4: RAG retrieval based on query
    if budget > 1000:
        docs = retrieve_relevant_docs(query, max_tokens=min(budget - 500, 2000))
        sections.append(format_docs(docs))
        budget -= estimate_tokens(format_docs(docs))

    # Tier 5 only if budget remains
    if budget > 1500 and request_type == "analysis":
        season = get_season_summary(athlete_id)
        sections.append(format_season(season))

    return "\n\n".join(sections)
```

**Confidence:** MEDIUM -- this pattern is a synthesis of standard RAG context assembly practices applied to the athlete domain. The specific token budgets will need tuning in practice.

### Pattern 2: Training Load as Exponential Weighted Moving Average (EWMA)

**What:** The mathematical model for computing CTL (fitness), ATL (fatigue), and TSB (form) from daily training stress scores.

**When to use:** Every time an activity is recorded or a daily rollup occurs.

**Trade-offs:** Simple to implement, well-understood in sports science, but has known limitations (does not account for training type, only load magnitude).

**Mathematical model:**

```python
import math
from datetime import date, timedelta

# Core formulas (Banister Impulse-Response model)
# CTL_today = CTL_yesterday + (TSS_today - CTL_yesterday) / tau_CTL
# ATL_today = ATL_yesterday + (TSS_today - ATL_yesterday) / tau_ATL
# TSB_today = CTL_today - ATL_today

CTL_TIME_CONSTANT = 42  # days (chronic / fitness)
ATL_TIME_CONSTANT = 7   # days (acute / fatigue)

def update_training_load(
    previous_ctl: float,
    previous_atl: float,
    daily_tss: float,
) -> tuple[float, float, float]:
    """Compute today's CTL, ATL, TSB from yesterday's values + today's TSS."""
    ctl = previous_ctl + (daily_tss - previous_ctl) / CTL_TIME_CONSTANT
    atl = previous_atl + (daily_tss - previous_atl) / ATL_TIME_CONSTANT
    tsb = ctl - atl
    return ctl, atl, tsb

# Multi-sport TSS normalization
def calculate_tss(sport: str, duration_seconds: float, **kwargs) -> float:
    """
    Sport-specific TSS calculation.

    Cycling (power-based): TSS = (duration * NP * IF) / (FTP * 3600) * 100
      where NP = Normalized Power, IF = Intensity Factor = NP/FTP

    Running (pace-based / rTSS): TSS = (duration * NGP * IF) / (rFTP * 3600) * 100
      where NGP = Normalized Graded Pace, IF = NGP/rFTP

    Heart-rate based (hrTSS, fallback for all sports):
      TSS = (duration * HRreserve_fraction * IF) / 3600 * 100

    Gym/strength (session RPE):
      TSS = duration_minutes * RPE_factor
      (approximate, less precise)
    """
    if sport == "cycling" and "normalized_power" in kwargs:
        np = kwargs["normalized_power"]
        ftp = kwargs["ftp"]
        intensity_factor = np / ftp
        return (duration_seconds * np * intensity_factor) / (ftp * 3600) * 100

    elif sport == "running" and "normalized_graded_pace" in kwargs:
        ngp = kwargs["normalized_graded_pace"]  # m/s
        rftp = kwargs["running_threshold_pace"]  # m/s
        intensity_factor = ngp / rftp
        return (duration_seconds * intensity_factor ** 2) / 3600 * 100

    elif "avg_heart_rate" in kwargs:
        # hrTSS fallback for swimming, gym, etc.
        hr = kwargs["avg_heart_rate"]
        hr_max = kwargs["hr_max"]
        hr_rest = kwargs["hr_rest"]
        hrr = (hr - hr_rest) / (hr_max - hr_rest)
        # Simplified hrTSS
        return duration_seconds / 3600 * hrr * 100

    else:
        # Session RPE fallback
        rpe = kwargs.get("rpe", 5)
        return (duration_seconds / 60) * (rpe / 10) * 5
```

**Confidence:** HIGH -- the CTL/ATL/TSB formulas are well-documented by Dr. Andrew Coggan and used by TrainingPeaks, Intervals.icu, TrainerRoad, and Golden Cheetah. The multi-sport TSS variants are standardized by TrainingPeaks.

### Pattern 3: Periodization State Machine

**What:** Model training plan structure as a hierarchical state machine: Macrocycle > Mesocycle > Microcycle > Session.

**When to use:** When generating or managing structured training plans.

**Trade-offs:** More complex than a flat workout list, but essential for proper periodization and for the AI to reason about training phase.

```python
from enum import Enum
from dataclasses import dataclass
from datetime import date

class MesocyclePhase(Enum):
    BASE = "base"              # Aerobic foundation, high volume, low intensity
    BUILD = "build"            # Increasing intensity, sport-specific work
    PEAK = "peak"              # Race-specific, high intensity, reduced volume
    TAPER = "taper"            # Volume reduction before event, maintain intensity
    RECOVERY = "recovery"      # Active recovery, cross-training
    TRANSITION = "transition"  # Off-season, unstructured

class MicrocyclePattern(Enum):
    NORMAL = "normal"          # Standard training week
    RECOVERY = "recovery"      # Reduced load (every 3rd-4th week)
    OVERLOAD = "overload"      # Intentional overreach
    RACE = "race"              # Race week adjustments
    TEST = "test"              # Performance testing week

@dataclass
class Macrocycle:
    """Full season plan: 16-52 weeks"""
    athlete_id: int
    name: str                   # "2026 Road Season"
    start_date: date
    end_date: date
    target_event: str | None    # "Gran Fondo Alps"
    target_event_date: date | None
    mesocycles: list["Mesocycle"]

@dataclass
class Mesocycle:
    """Training block: 3-6 weeks"""
    phase: MesocyclePhase
    start_date: date
    end_date: date
    target_weekly_tss: float    # Target training load for the block
    tss_ramp_rate: float        # Weekly TSS increase (typically 5-10%)
    focus: str                  # "Endurance base", "VO2max intervals"
    microcycles: list["Microcycle"]

@dataclass
class Microcycle:
    """Training week: 7 days"""
    week_number: int
    pattern: MicrocyclePattern
    target_tss: float
    sessions: list["PlannedSession"]

@dataclass
class PlannedSession:
    """Single workout"""
    day_of_week: int            # 0=Monday
    sport: str                  # cycling, running, gym
    workout_type: str           # endurance, intervals, tempo, recovery
    target_tss: float
    target_duration_minutes: int
    structured_steps: list[dict] | None  # For structured workouts
    notes: str                  # AI-generated coaching notes
```

**Confidence:** HIGH for the domain model. Periodization cycles are textbook sports science. The specific implementation as a state machine is an architectural choice that maps well to the domain.

### Pattern 4: Garmin Data Sync (Webhook-First)

**What:** Use Garmin Health API push notifications as the primary data ingestion trigger, with polling as fallback.

**When to use:** Always -- this is the primary data pipeline.

**Architecture:**

```
Garmin Device → Garmin Connect → Webhook Push → Your Server
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Webhook Handler│
                              │ (FastAPI)      │
                              └───────┬───────┘
                                      │
                          ┌───────────┴───────────┐
                          ▼                       ▼
                   ┌─────────────┐         ┌─────────────┐
                   │ Activity    │         │ Health Data  │
                   │ Processor   │         │ Processor    │
                   │ (FIT parse) │         │ (JSON)       │
                   └──────┬──────┘         └──────┬───────┘
                          │                       │
                          ▼                       ▼
                   ┌─────────────┐         ┌──────────────┐
                   │ TSS Calc    │         │ Daily Metrics │
                   │ + Store     │         │ Update        │
                   └──────┬──────┘         └──────┬────────┘
                          │                       │
                          └───────────┬───────────┘
                                      ▼
                              ┌───────────────┐
                              │ Recalculate   │
                              │ CTL/ATL/TSB   │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ Update Daily  │
                              │ Readiness     │
                              └───────────────┘
```

**Garmin API data types received via webhook:**

| Data Type | Delivery | Key Fields | Update Frequency |
|-----------|----------|------------|------------------|
| Activities | Push (ping/pull or push) | FIT file, sport type, duration, distance | After each activity sync |
| Daily Summaries | Push | Steps, calories, active minutes | Every few hours |
| Sleep | Push | Sleep stages (light/deep/REM), duration, sleep score | Morning after sync |
| HRV | Push | Beat-to-beat intervals, HRV status | Morning after sync |
| Stress | Push | Stress level summaries | Periodic throughout day |
| Body Composition | Push | Weight, body fat %, BMI | After scale sync |

**Important: Garmin requires business developer approval.** The Garmin Connect Developer Program is free but requires application and approval. The unofficial `python-garminconnect` library (using mobile SSO auth) is an alternative for development/personal use but may violate ToS for production multi-user applications.

**Confidence:** MEDIUM -- the push/pull architecture is documented by Garmin, but exact webhook payload formats require developer program access to verify. The unofficial library capabilities are verified via GitHub/PyPI.

## Data Flow

### Flow 1: Activity Ingestion Pipeline

```
1. Athlete completes a ride/run/swim
2. Device syncs to Garmin Connect
3. Garmin pushes webhook notification to our server
4. Server fetches activity detail (FIT file or JSON summary)
5. Parse activity: extract sport, duration, power/pace/HR data
6. Calculate sport-specific TSS
7. Store activity record + TSS
8. Recalculate CTL/ATL/TSB from updated activity history
9. Update daily readiness score
10. If training plan exists, mark scheduled workout as completed
11. Check compliance: did actual match planned?
12. Trigger notification if significant deviation
```

### Flow 2: AI Chat Coaching Request

```
1. Athlete sends message via chat UI
2. WebSocket/SSE handler receives message
3. Context builder assembles tiered athlete context:
   - Profile (FTP, goals, history)
   - Current state (CTL/ATL/TSB, sleep, HRV)
   - Recent activities (last 7-14 days)
   - RAG: retrieve relevant training science docs
4. Compose system prompt + athlete context + user message
5. Call Claude API with streaming enabled
6. Stream response tokens back to client
7. If response contains structured workout, parse and offer to save
8. If response modifies plan, apply changes with confirmation
9. Log conversation for context continuity
```

### Flow 3: Workout Generation and Garmin Push

```
1. Training engine determines next workout from plan
   OR AI coaching session generates ad-hoc workout
2. Workout Builder creates structured step sequence:
   - Warmup (duration, target zone)
   - Main set (intervals with work/rest, or steady state)
   - Cooldown
3. Two parallel paths:
   a. Store workout in database, display in calendar UI
   b. Push to Garmin via Training API:
      - Serialize to Garmin workout JSON format
      - POST to Garmin Connect calendar
      - Workout syncs to athlete's device automatically
4. Alternative path: Generate .FIT file
   - Use garmin-fit-sdk Encoder to create .FIT binary
   - Provide as downloadable file for manual device transfer
```

### Flow 4: Daily Readiness Score Computation

```
1. Morning data arrives (sleep + HRV via Garmin webhook)
2. Fetch current training load state (CTL/ATL/TSB)
3. Fetch nutrition data from Yazio (if available)
4. Compute multi-factor readiness score:

   readiness = weighted_average(
       tsb_factor       * 0.30,   # Form: TSB normalized to -20..+20
       sleep_factor     * 0.25,   # Sleep quality/duration vs target
       hrv_factor       * 0.20,   # HRV vs 7-day rolling baseline
       recovery_factor  * 0.15,   # Days since last hard session
       nutrition_factor * 0.10,   # Caloric adequacy
   )

5. Adjust today's planned workout intensity based on readiness:
   - readiness > 80: proceed as planned or increase
   - readiness 50-80: proceed as planned
   - readiness 30-50: reduce intensity/volume
   - readiness < 30: suggest recovery day
6. Push updated recommendation to dashboard
```

## Database Schema Considerations

### Core Tables

```sql
-- Multi-tenant isolation: every row belongs to a user
-- Use user_id as partition key for all athlete data

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),
    garmin_oauth_token JSONB,       -- Encrypted OAuth tokens
    yazio_api_key VARCHAR(255),     -- Encrypted
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE athlete_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    -- Cycling thresholds
    ftp_watts INTEGER,                    -- Functional Threshold Power
    lthr_cycling INTEGER,                 -- Lactate Threshold HR (cycling)
    -- Running thresholds
    running_threshold_pace_ms FLOAT,      -- m/s at threshold
    lthr_running INTEGER,                 -- Lactate Threshold HR (running)
    -- General
    max_heart_rate INTEGER,
    resting_heart_rate INTEGER,
    weight_kg FLOAT,
    date_of_birth DATE,
    -- Preferences
    weekly_hours_available FLOAT,         -- Max training hours/week
    primary_sport VARCHAR(20),
    secondary_sports VARCHAR(20)[],
    goals JSONB,                          -- Structured goals
    injury_history JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Time-series: consider TimescaleDB hypertable for activities
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    garmin_activity_id BIGINT,            -- External ID for dedup
    sport VARCHAR(30) NOT NULL,           -- cycling, running, swimming, gym
    started_at TIMESTAMPTZ NOT NULL,
    duration_seconds INTEGER NOT NULL,
    distance_meters FLOAT,
    -- Performance metrics
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    avg_power_watts FLOAT,               -- Cycling
    normalized_power FLOAT,              -- Cycling
    avg_pace_ms FLOAT,                   -- Running (m/s)
    normalized_graded_pace FLOAT,        -- Running
    -- Computed
    tss FLOAT NOT NULL,                  -- Unified Training Stress Score
    intensity_factor FLOAT,
    -- Raw data reference
    fit_file_path VARCHAR(255),          -- S3/local path to .FIT file
    summary_json JSONB,                  -- Full Garmin summary
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, garmin_activity_id)
);

-- Daily time-series for health/body metrics
CREATE TABLE daily_metrics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    -- Sleep
    sleep_duration_seconds INTEGER,
    sleep_score FLOAT,
    deep_sleep_seconds INTEGER,
    rem_sleep_seconds INTEGER,
    -- HRV
    hrv_overnight FLOAT,                 -- Overnight HRV (RMSSD)
    hrv_status VARCHAR(20),              -- balanced, low, high
    -- Stress & Recovery
    stress_avg FLOAT,
    body_battery_min INTEGER,
    body_battery_max INTEGER,
    -- Body composition
    weight_kg FLOAT,
    body_fat_pct FLOAT,
    -- Nutrition (from Yazio)
    calories_consumed INTEGER,
    protein_g FLOAT,
    carbs_g FLOAT,
    fat_g FLOAT,
    -- Computed
    readiness_score FLOAT,               -- Composite 0-100
    -- Training load snapshot
    ctl FLOAT,                           -- CTL as of this date
    atl FLOAT,                           -- ATL as of this date
    tsb FLOAT,                           -- TSB as of this date
    daily_tss FLOAT,                     -- Total TSS for this date
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, metric_date)
);

-- Training plan hierarchy
CREATE TABLE training_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    target_event VARCHAR(255),
    target_event_date DATE,
    status VARCHAR(20) DEFAULT 'active', -- active, completed, archived
    plan_json JSONB,                     -- Full plan structure
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE planned_workouts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES training_plans(id) ON DELETE SET NULL,
    scheduled_date DATE NOT NULL,
    sport VARCHAR(30) NOT NULL,
    workout_type VARCHAR(50),            -- endurance, intervals, tempo, recovery
    target_tss FLOAT,
    target_duration_minutes INTEGER,
    structured_steps JSONB,              -- Workout step definitions
    coaching_notes TEXT,                 -- AI-generated notes
    -- Completion tracking
    completed_activity_id INTEGER REFERENCES activities(id),
    compliance_score FLOAT,              -- How close actual matched planned
    -- Garmin sync
    garmin_workout_id BIGINT,            -- If pushed to Garmin
    garmin_scheduled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat history for AI context continuity
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,           -- user, assistant
    content TEXT NOT NULL,
    metadata JSONB,                      -- Parsed actions, workout refs
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Schema Design Decisions

**Why PostgreSQL + TimescaleDB over a dedicated time-series DB:**
- PostgreSQL handles relational data (users, plans, workouts) natively
- TimescaleDB extension adds efficient time-series queries for activities and daily_metrics
- Single database to manage, simpler ops
- JSONB columns provide schema flexibility for evolving Garmin data formats

**Why daily_metrics stores CTL/ATL/TSB snapshots:**
- Avoids recalculating entire history on every dashboard load
- CTL/ATL/TSB are recalculated incrementally when new activities arrive
- Enables fast chart rendering for performance management charts

**Why JSONB for structured_steps and plan_json:**
- Workout step structures vary by sport (cycling intervals vs running fartlek vs swim drills)
- Plan structure evolves as you add features
- Querying step details is rare; rendering from JSON is the primary use case

## FIT File Generation Pipeline

The .FIT (Flexible and Interoperable Data Transfer) format is a binary protocol designed by Garmin/ANT+ for fitness data. Two paths exist for getting workouts onto Garmin devices:

### Path A: Garmin Training API (Recommended for multi-user)

```
Workout definition → Garmin Training API JSON format → POST to API → Auto-syncs to device
```

This is the official path. Requires Garmin Connect Developer Program approval. Handles device compatibility automatically.

### Path B: FIT File Generation (Fallback / advanced users)

```python
# Using the official garmin-fit-sdk (supports encoding as of 2026)
from garmin_fit_sdk import Encoder, Profile

def generate_workout_fit(workout: PlannedWorkout) -> bytes:
    """Generate a .FIT workout file from a planned workout."""
    encoder = Encoder()

    # File ID message (required)
    encoder.write_file_id(
        type=Profile.FileType.WORKOUT,
        manufacturer=Profile.Manufacturer.DEVELOPMENT,
        product=0,
        serial_number=12345,
    )

    # Workout message
    encoder.write_workout(
        sport=map_sport(workout.sport),  # Profile.Sport.CYCLING etc.
        num_valid_steps=len(workout.structured_steps),
        workout_name=workout.name,
    )

    # Workout steps
    for i, step in enumerate(workout.structured_steps):
        encoder.write_workout_step(
            message_index=i,
            intensity=map_intensity(step["intensity"]),
            duration_type=map_duration_type(step["duration_type"]),
            duration_value=step.get("duration_value"),
            target_type=map_target_type(step["target_type"]),
            target_value=step.get("target_value"),
            target_low=step.get("target_low"),
            target_high=step.get("target_high"),
        )

    return encoder.close()
```

**Important note on FIT SDK:** The official `garmin-fit-sdk` Python package confirmed as of 2026 to support both encoding and decoding. The community `fit-tool` library (v0.9.15, Feb 2026) also supports encoding but is less actively maintained than the official SDK. **Recommendation: Use the official `garmin-fit-sdk` for encoding.**

**Confidence:** MEDIUM -- the official SDK encoding capability is confirmed via GitHub README, but specific encoding API method names shown above are illustrative. The actual Encoder API should be verified against the SDK documentation during implementation.

## AI Coaching Architecture Detail

### Claude API Integration Strategy

```python
from anthropic import Anthropic

class AICoachingService:
    def __init__(self, client: Anthropic):
        self.client = client

    async def get_coaching_response(
        self,
        athlete_context: str,
        user_message: str,
        response_format: str = "text",  # or "structured_workout"
    ):
        system_prompt = self._build_system_prompt(response_format)

        messages = [
            {"role": "user", "content": f"""
## Athlete Context
{athlete_context}

## Athlete's Question
{user_message}
"""}
        ]

        # Use streaming for chat responses
        with self.client.messages.stream(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield text
```

**System prompt strategy:**

The system prompt should encode:
1. Coach persona and communication style
2. Training science principles (periodization, progressive overload, recovery)
3. Response format instructions (especially for structured workouts)
4. Safety guardrails (injury prevention, overtraining warnings)
5. Output schema when structured data is needed

**When to use structured output vs free-form:**

| Scenario | Output Format | Why |
|----------|---------------|-----|
| General coaching chat | Free-form text | Natural conversation |
| "Create a workout for tomorrow" | JSON structured workout | Needs to be parseable for saving/Garmin push |
| "Adjust my plan" | JSON plan modification | Must map to database operations |
| "Analyze my last week" | Free-form with embedded data | Narrative with specific metrics |
| Daily briefing | Structured JSON | Rendered into dashboard widgets |

### Knowledge Base (RAG) Architecture

**What to store:** Training science research, periodization principles, sport-specific coaching guidelines, nutrition science, recovery protocols.

**Recommended approach:** Start with pgvector (PostgreSQL extension) rather than a separate vector database.

**Why pgvector over dedicated vector DB (Pinecone/Weaviate/ChromaDB):**
- Already using PostgreSQL -- no new infrastructure
- Knowledge base is small (hundreds to low thousands of documents, not millions)
- Simpler deployment and backup
- Adequate performance for this scale
- Can always migrate to dedicated vector DB later if needed

```sql
-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_documents (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255),
    content TEXT NOT NULL,
    category VARCHAR(50),          -- periodization, nutrition, recovery, etc.
    sport VARCHAR(30),             -- cycling, running, general
    source VARCHAR(255),           -- Citation
    embedding vector(1536),        -- OpenAI ada-002 or similar
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON knowledge_documents
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 20);
```

**Embedding strategy:**
- Chunk documents into ~500 token segments with overlap
- Use a fast embedding model (OpenAI text-embedding-3-small or local sentence-transformers)
- At query time: embed the user's question, find top-K similar chunks, inject into Claude context
- K = 3-5 chunks is typically sufficient for this domain

**Confidence:** MEDIUM -- pgvector is a well-established pattern. The specific chunking and retrieval parameters will need tuning.

## Multi-User Data Isolation

### Strategy: Row-Level Security (RLS) in PostgreSQL

Every table with athlete data includes a `user_id` column. Use PostgreSQL Row-Level Security to enforce isolation at the database level, not just the application level.

```sql
-- Enable RLS on athlete data tables
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE planned_workouts ENABLE ROW LEVEL SECURITY;

-- Policy: users can only see their own data
CREATE POLICY user_isolation ON activities
    USING (user_id = current_setting('app.current_user_id')::INTEGER);
```

**Application-level enforcement:**

```python
# FastAPI dependency that sets the current user context
async def get_db_session(current_user: User = Depends(get_current_user)):
    async with async_session() as session:
        await session.execute(
            text(f"SET app.current_user_id = '{current_user.id}'")
        )
        yield session
```

**Why belt-and-suspenders (app + DB level):**
- Application-level: every query filters by user_id (fast, standard)
- DB-level RLS: defense in depth -- even if a service bug skips the filter, the DB blocks cross-user access
- Critical for health data (HRV, weight, training history is sensitive)

## Anti-Patterns

### Anti-Pattern 1: Monolithic AI Prompt

**What people do:** Dump ALL athlete data (full activity history, every metric, entire plan) into every Claude API call.
**Why it is wrong:** Hits token limits, costs 10x more per request, dilutes relevant context with noise, slower responses.
**Do this instead:** Use the tiered context assembly pipeline (Pattern 1). Build context appropriate to the request type. Summarize history rather than including raw data.

### Anti-Pattern 2: Synchronous Garmin Data Processing

**What people do:** Process Garmin webhook data synchronously in the HTTP request handler, blocking the response.
**Why it is wrong:** FIT file parsing and TSS calculation can take seconds. Garmin webhooks have timeout expectations. Under load, webhook processing blocks the server.
**Do this instead:** Accept the webhook, enqueue a background task (Celery, or FastAPI BackgroundTasks for simple cases), return 200 immediately. Process asynchronously.

### Anti-Pattern 3: Recalculating CTL/ATL/TSB from Scratch

**What people do:** On every dashboard load, query all historical activities and recalculate the full EWMA series.
**Why it is wrong:** O(n) with full activity history. Gets slower as athlete accumulates years of data.
**Do this instead:** Store daily CTL/ATL/TSB snapshots in daily_metrics. When a new activity arrives, update incrementally from the previous day's values. Only do full recalculation when correcting historical data.

### Anti-Pattern 4: Storing Raw FIT Files in the Database

**What people do:** Store binary .FIT file contents as BYTEA columns in PostgreSQL.
**Why it is wrong:** Bloats the database, slows backups, FIT files are write-once/read-rarely.
**Do this instead:** Store FIT files in object storage (S3, MinIO, or local filesystem). Store the path/URL in the database. Parse and extract metrics into structured columns at ingestion time.

### Anti-Pattern 5: Flat Workout Model

**What people do:** Store workouts as unstructured text descriptions ("Do 5x5min at threshold").
**Why it is wrong:** Cannot generate FIT files, cannot push to Garmin, cannot compute target TSS, AI cannot reason about workout structure programmatically.
**Do this instead:** Use a structured workout step model (warmup/work/rest/cooldown with duration, target power/pace/HR zones). Store as JSONB with a defined schema. Text descriptions are a presentation layer on top of structured data.

## Integration Points

### External Services

| Service | Integration Pattern | Key Considerations |
|---------|---------------------|---------------------|
| **Garmin Connect API** | OAuth2 + webhooks (push) + REST (pull) | Requires developer program approval. Push model preferred. Unofficial python-garminconnect for dev/personal use. |
| **Garmin Training API** | REST POST to push workouts to calendar | Workouts auto-sync to device. Sport-specific workout types (cycling/running/swimming). |
| **Garmin FIT SDK** | Local library for .FIT binary encoding | Official garmin-fit-sdk supports encoding. For workout files only (not activity upload). |
| **Yazio API** | REST polling or manual CSV import | Verify API availability -- Yazio may not have a public API. May need scraping or manual data entry as fallback. |
| **Claude API (Anthropic)** | REST with streaming | Use streaming for chat. Structured output for workout generation. Budget ~8K tokens for athlete context. |
| **pgvector** | PostgreSQL extension | Cosine similarity search for RAG. Install as extension, no separate service. |

### Internal Boundaries

| Boundary | Communication | Key Consideration |
|----------|---------------|-------------------|
| API routes <-> Services | Direct function calls | Services are injected via FastAPI Depends() |
| Training Engine <-> AI Coaching | Engine provides data, AI consumes | Engine computes metrics; AI interprets them for recommendations |
| Garmin Sync <-> Training Engine | Async event: new activity triggers recalc | Use background task or simple event bus |
| FIT Generator <-> Workout Builder | Builder creates steps, Generator encodes | Clean interface: WorkoutSteps in, bytes out |
| Knowledge Base <-> AI Coaching | RAG retrieval feeds into context builder | Retrieved docs are just text injected into prompt |

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-100 users | Monolith is fine. Single PostgreSQL. Background tasks via FastAPI BackgroundTasks. All services in one process. |
| 100-1K users | Add Redis for caching (dashboard data, CTL/ATL/TSB) and as Celery broker for background task queue. Consider TimescaleDB hypertables for activities/daily_metrics. |
| 1K-10K users | Separate background workers from web server. Consider read replicas for dashboard queries. Object storage for FIT files. Rate limit Claude API calls (batch non-urgent requests). |
| 10K+ users | Microservice split: Garmin sync, AI coaching, and training engine as separate services. Event-driven architecture. This scale is unlikely in early stages -- do not pre-optimize. |

### Scaling Priorities

1. **First bottleneck: Claude API costs and latency.** Each coaching interaction costs tokens. Mitigate with: context budget management, caching common recommendations, batching daily briefings.
2. **Second bottleneck: Webhook processing under load.** Multiple users syncing simultaneously. Mitigate with: async task queue, batch processing.
3. **Third bottleneck: Dashboard query performance.** Time-series aggregation for charts. Mitigate with: pre-computed daily snapshots (daily_metrics table), caching.

## Build Order Dependencies

Based on the architecture, components should be built in this order due to dependencies:

```
Phase 1: Foundation (no external deps)
  ├── Database schema + migrations
  ├── User auth (JWT)
  ├── Athlete profile CRUD
  └── Basic API structure

Phase 2: Training Engine (pure computation, no external APIs)
  ├── TSS calculators (cycling, running, HR-based)
  ├── CTL/ATL/TSB computation
  ├── Zone calculator
  └── Readiness score formula

Phase 3: Data Ingestion (requires Garmin access)
  ├── Garmin OAuth flow
  ├── Webhook receiver
  ├── Activity parser (FIT → structured data)
  ├── Daily metrics ingestion (sleep, HRV)
  └── TSS calculation on ingestion → CTL/ATL/TSB update

Phase 4: AI Coaching (requires working data pipeline)
  ├── Context builder (needs athlete data to assemble)
  ├── Claude API integration
  ├── Chat interface (WebSocket/SSE)
  ├── Prompt templates
  └── Response parsing

Phase 5: Training Plan Generation
  ├── Periodization model (mesocycle/microcycle)
  ├── AI-driven plan generation
  ├── Workout builder (structured steps)
  └── Plan calendar UI

Phase 6: Garmin Workout Push
  ├── FIT file generator
  ├── Garmin Training API integration
  ├── Workout scheduling on Garmin calendar
  └── Sync status tracking

Phase 7: Knowledge Base + RAG
  ├── Document ingestion pipeline
  ├── Embedding generation
  ├── pgvector setup
  ├── Retrieval integration into context builder
  └── Training science content curation

Phase 8: Advanced Features
  ├── Nutrition integration (Yazio)
  ├── Multi-sport unified dashboard
  ├── Social/gamification
  └── Performance analytics
```

**Rationale:** Each phase builds on the previous. You cannot do AI coaching without athlete data. You cannot push workouts without a workout builder. The training engine is pure computation that can be built and tested independently before any API integration.

## Sources

- [Garmin Connect Developer Program Overview](https://developer.garmin.com/gc-developer-program/overview/) -- Official API documentation hub (MEDIUM confidence -- full docs require program enrollment)
- [Garmin Activity API](https://developer.garmin.com/gc-developer-program/activity-api/) -- Push/pull data delivery for activities
- [Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/) -- Sleep, HRV, stress, body composition data
- [Garmin Training API](https://developer.garmin.com/gc-developer-program/training-api/) -- Push workouts and plans to Garmin Connect
- [Garmin FIT Python SDK (GitHub)](https://github.com/garmin/fit-python-sdk) -- Official SDK, supports encoding and decoding (HIGH confidence)
- [garmin-fit-sdk on PyPI](https://pypi.org/project/garmin-fit-sdk/) -- v21.141.0+, Python 3.6+
- [fit-tool on PyPI](https://pypi.org/project/fit-tool/) -- Community FIT encoding library, v0.9.15
- [FIT SDK Cookbook: Encoding Workouts](https://developer.garmin.com/fit/cookbook/encoding-workout-files/) -- Official workout encoding reference
- [python-garminconnect (GitHub)](https://github.com/cyberjunky/python-garminconnect) -- Unofficial library with workout upload/schedule methods
- [TrainingPeaks: CTL, ATL, TSB Guide](https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/) -- Authoritative source for performance management model (HIGH confidence)
- [TrainingPeaks: rTSS Explained](https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/) -- Running TSS methodology
- [TrainingPeaks: TSS Explained](https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained) -- Multi-sport TSS variants
- [TrainingPeaks: Periodization Cycles](https://www.trainingpeaks.com/blog/macrocycles-mesocycles-and-microcycles-understanding-the-3-cycles-of-periodization/) -- Macro/meso/microcycle structure
- [TrainerRoad: TSS Guide](https://www.trainerroad.com/blog/tss-what-it-is-what-its-good-for-and-why-it-can-be-misleading/) -- TSS limitations and proper usage
- [Intervals.icu](https://www.intervals.icu/) -- Reference implementation for training load platform with open API
- [Neon: FastAPI + TimescaleDB Guide](https://neon.com/guides/timescale-fastapi) -- Time-series data pattern with FastAPI
- [Fellrnr: Modeling Human Performance](https://fellrnr.com/wiki/Modeling_Human_Performance) -- Deep dive into Banister model mathematics

---
*Architecture research for: AI-Powered Multi-Sport Training Platform*
*Researched: 2026-04-16*
