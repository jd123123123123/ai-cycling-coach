# Stack Research

**Domain:** AI-powered multi-sport training platform
**Researched:** 2026-04-16
**Confidence:** MEDIUM-HIGH (most items verified via multiple sources; some niche libraries verified via single source)

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Python | 3.12+ | Runtime | FastAPI 0.135+ requires 3.10+. Use 3.12 for best perf and typing support. 3.13 acceptable if stable on all deps. | HIGH |
| FastAPI | 0.135.x | API framework | User-chosen. Current stable (0.135.3, Apr 2026). Native async, OpenAPI docs, Pydantic v2 integration. Streaming JSON Lines support useful for chat. | HIGH |
| Uvicorn | latest | ASGI server | Standard FastAPI production server. Use with `--workers` for multi-process or behind Gunicorn for production. | HIGH |
| React | 18.x / 19.x | Frontend | User-chosen. Component ecosystem, charting libraries, strong typing with TypeScript. | HIGH |
| PostgreSQL | 16+ | Primary database | Relational data (users, plans, workouts). Pairs with TimescaleDB for time-series. Battle-tested. | HIGH |
| TimescaleDB | 2.x (extension) | Time-series data | Extension on PostgreSQL -- not a separate DB. 20x insert perf, 396x query speedup on time-series vs vanilla PG. Critical for training metrics (daily CTL/ATL/TSB, activity history, sleep/HRV trends). Same connection string, same ORM, same tools. | MEDIUM-HIGH |
| Redis | 8.x | Caching, task queue, sessions | Session store, API response caching, rate limiting, task queue broker (for ARQ). redis-py 5.1 has native async via `redis.asyncio`. | HIGH |

### Backend Libraries

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| SQLAlchemy | 2.0.x (2.0.48+) | ORM / database toolkit | Async engine with asyncpg driver. Declarative models, relationship management. Native async `AsyncSession` pairs with FastAPI dependency injection. | HIGH |
| asyncpg | latest | PostgreSQL async driver | Purpose-built async PG driver. Significantly faster than psycopg2 in async contexts. Required by SQLAlchemy async engine. | HIGH |
| Alembic | 1.18.x | Database migrations | Standard SQLAlchemy migration tool. Has async template for async engines. Migrations themselves run synchronously (fine -- migrations are one-off ops). | HIGH |
| Pydantic | 2.12.x | Validation & serialization | Ships with FastAPI. 5-50x faster than v1 (Rust core). Use `pydantic-settings` for config. | HIGH |
| pydantic-settings | 2.x | Configuration management | `.env` file loading, typed settings, validation. Standard FastAPI pattern. | HIGH |
| PyJWT | 2.x | JWT authentication | FastAPI officially recommends PyJWT over abandoned python-jose. Simple, maintained, focused API. | HIGH |
| pwdlib | latest | Password hashing | FastAPI-recommended replacement for passlib. Use with bcrypt backend. | MEDIUM |
| anthropic | 0.94.x | Claude API SDK | Official Anthropic Python SDK. Supports async, streaming, prompt caching. Latest: 0.94.1 (Apr 2026). | HIGH |
| ARQ | latest | Async task queue | Built for asyncio from ground up. Pairs naturally with FastAPI's async model. Uses Redis as broker. Perfect for: Garmin data sync jobs, scheduled training plan updates, notification sending. ~700 lines of code, lightweight. | MEDIUM-HIGH |
| fit-tool | 0.9.x | FIT file generation | Only maintained Python library that can ENCODE (write) FIT files. Community-maintained fork on PyPI. Supports workout message types (WorkoutMessage, WorkoutStepMessage). Has known bugs -- use GitHub version if PyPI version has issues. | MEDIUM |
| garminconnect | 0.3.x | Garmin Connect (unofficial) | Unofficial Python wrapper. v0.3.2 (Apr 2026). Provides access to sleep, HRV, body battery, activities, training status. Useful for dev/prototyping but NOT for production -- use official Garmin Connect Developer Program APIs for production. | MEDIUM |
| httpx | latest | HTTP client | Async HTTP client for calling Garmin APIs, Yazio endpoints, external services. Replaces requests for async contexts. | HIGH |

### Frontend Libraries

| Library | Version | Purpose | Why Recommended | Confidence |
|---------|---------|---------|-----------------|------------|
| TypeScript | 5.x | Type safety | Non-negotiable for a project this size. Catches integration bugs at compile time. | HIGH |
| Vite | 6.x | Build tool | Fast dev server, HMR, ESBuild-powered. Standard React build tool in 2026. | HIGH |
| Recharts | 2.x | Dashboard charts | Built on React + D3. Declarative components. Best for training load charts, power curves, TSB graphs. Modular, only re-renders changed parts. | HIGH |
| TanStack Query | 5.x | Server state management | Async data fetching, caching, background refetching. Handles Garmin data sync status, dashboard data loading. Replaces manual useEffect + useState patterns. | HIGH |
| React Router | 7.x | Routing | Standard React routing. Dashboard, chat, settings, social pages. | HIGH |
| Tailwind CSS | 4.x | Styling | Utility-first CSS. Fast iteration, consistent design. Pairs well with component libraries. | MEDIUM-HIGH |
| Zustand | 5.x | Client state | Lightweight global state for UI state (selected date range, active sport filter, chat state). Simpler than Redux for this use case. | MEDIUM-HIGH |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Docker + Docker Compose | Local dev environment | PostgreSQL + TimescaleDB + Redis in containers. Reproducible setup. |
| pytest + pytest-asyncio | Testing | Async test support for FastAPI routes and background jobs. |
| Ruff | Python linting + formatting | Replaces flake8 + black + isort. Extremely fast (Rust). Single tool. |
| ESLint + Prettier | Frontend linting | Standard React/TypeScript tooling. |
| pre-commit | Git hooks | Run Ruff, ESLint before commit. Catch issues early. |

## Garmin Integration Strategy

**CRITICAL DECISION: Official API vs Unofficial Library**

The Garmin Connect Developer Program offers five APIs:

| API | Direction | What It Provides |
|-----|-----------|-----------------|
| **Health API** | Garmin -> You | Sleep, HRV, heart rate, steps, stress, body composition, SpO2, epochs |
| **Activity API** | Garmin -> You | Full activity data for 30+ activity types |
| **Training API** | You -> Garmin | Publish workouts and training plans to Garmin Connect calendar (syncs to device) |
| **Courses API** | You -> Garmin | Publish GPS courses for devices |
| **Women's Health API** | Garmin -> You | Menstrual cycle, pregnancy data |

**Recommendation:** Use the official Garmin Connect Developer Program APIs for production.

- **Access:** Free for approved business developers. Start with evaluation key (rate-limited), then apply for production credentials.
- **OAuth:** Migrating from OAuth 1.0 to OAuth 2.0 PKCE. OAuth 1 retired 12/31/2026. Build with OAuth 2.0 from the start.
- **Data flow:** Health API + Activity API for pulling data (push or ping/pull architecture). Training API for pushing workouts back.
- **Limitation:** Cannot push completed activity data back. Can only push future workouts/plans. This is fine for our use case.

**For development/prototyping:** The unofficial `garminconnect` library (0.3.x) can speed up prototyping since it doesn't require business approval. But plan to migrate to official APIs before production.

## Yazio Integration Strategy

**CRITICAL FINDING: Yazio has NO official public API.**

- An unofficial reverse-engineered API exists (documented at github.com/saganos/yazio_public_api)
- OAuth login works and returns valid tokens
- Endpoints work via HTTP clients (not browser due to CORS)
- An unofficial MCP server exists (github.com/fliptheweb/yazio-mcp)
- **Risk:** Unofficial API can break at any time without notice

**Recommendation:** Build a nutrition data abstraction layer with pluggable providers:

1. **Primary (MVP):** Manual nutrition input in-app (user enters macros/calories)
2. **Secondary:** Yazio unofficial API integration behind a provider interface
3. **Fallback providers:** FatSecret API (official, 5000 free calls/day, 2.3M+ foods), Open Food Facts (open source, 2.8M products), USDA FoodData Central (free, government-maintained)

This way, when Yazio breaks (and it will), you swap providers without rewriting the coaching logic.

## FIT File Generation Strategy

**Situation:** The Python FIT ecosystem is fragmented.

| Library | Can Read | Can Write | Maintained | Notes |
|---------|----------|-----------|------------|-------|
| fit-tool | Yes | **Yes** | Community fork | Only option for encoding. v0.9.x. Has bugs, patches available. |
| garmin-fit-sdk | Yes | **No** | Official Garmin | Decoder only. No plans to add encoding. |
| python-fitparse | Yes | No | Yes | Parse only. |
| fitdecode | Yes | No | Yes | Parse only. |

**Recommendation:** Use `fit-tool` for FIT file generation. It is the ONLY Python library that supports encoding.

- Install from PyPI: `pip install fit-tool`
- If bugs encountered, install from GitHub fork (stuartlynne/python_fit_tool)
- For workout files: use `FitFileBuilder`, `WorkoutMessage`, `WorkoutStepMessage`
- **Risk mitigation:** If fit-tool proves too buggy, fallback is to use the official Garmin FIT SDK in Java/C++ via subprocess or microservice. LOW confidence this will be needed.

## Claude API Integration Strategy

| Component | Recommendation | Why |
|-----------|---------------|-----|
| SDK | `anthropic` 0.94.x | Official, async support, streaming |
| Model | Claude Sonnet 4 for daily coaching, Claude Haiku 4 for quick responses | Cost/quality tradeoff. Sonnet for analysis, Haiku for simple queries. |
| Streaming | Use `client.messages.stream()` | Real-time chat experience. FastAPI SSE endpoint. |
| Prompt Caching | Use `cache_control` parameter | Cache training science knowledge base, user profile context. Massive cost savings. |
| Context | Build structured context from user data | Assemble: current metrics, training plan, recent activities, nutrition, TSB state. |

**Key pattern:** Build a "coaching context assembler" that constructs the prompt from current user data. The AI doesn't store state -- it receives full context each call.

## Training Load Model (CTL/ATL/TSB)

This is a pure math implementation -- no library needed.

```python
# Core formulas (exponentially weighted moving average)
# ATL = ATL_yesterday * e^(-1/k_atl) + TSS_today * (1 - e^(-1/k_atl))
# CTL = CTL_yesterday * e^(-1/k_ctl) + TSS_today * (1 - e^(-1/k_ctl))
# TSB = CTL - ATL
# where k_atl = 7 (acute, ~7 day), k_ctl = 42 (chronic, ~42 day)
```

**Dependencies for calculation:**
- TSS (Training Stress Score) per activity -- derived from power data (cycling) or pace/HR (running)
- FTP (Functional Threshold Power) -- from Garmin or user-set
- numpy/pandas for efficient time-series math

**Store daily CTL/ATL/TSB values in TimescaleDB** for historical charts and trend analysis.

## Database Schema Strategy

| Data Type | Storage | Why |
|-----------|---------|-----|
| Users, profiles, settings | PostgreSQL (regular tables) | Relational, infrequently updated |
| Training plans, mesocycles | PostgreSQL (regular tables) | Structured, relational (plan -> weeks -> days -> workouts) |
| Daily metrics (sleep, HRV, body battery) | TimescaleDB hypertable | Time-series, partitioned by time, compressed |
| Activity history | TimescaleDB hypertable | Time-series, queried by date range frequently |
| CTL/ATL/TSB daily values | TimescaleDB hypertable | Time-series, historical trends |
| Chat history | PostgreSQL (regular tables) | Relational (user -> conversations -> messages) |
| Workout files (.FIT) | Object storage (S3/MinIO) or filesystem | Binary files, served as downloads |

## Installation

```bash
# Backend (Python)
pip install fastapi[standard] uvicorn[standard]
pip install sqlalchemy[asyncio] asyncpg alembic
pip install pydantic-settings
pip install anthropic
pip install httpx
pip install PyJWT pwdlib[bcrypt]
pip install redis arq
pip install fit-tool
pip install garminconnect  # dev/prototyping only
pip install numpy pandas   # training load calculations

# Dev dependencies
pip install pytest pytest-asyncio pytest-cov
pip install ruff
pip install pre-commit

# Frontend (Node/npm)
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install react-router recharts @tanstack/react-query zustand
npm install -D tailwindcss @tailwindcss/vite eslint prettier
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| PostgreSQL + TimescaleDB | InfluxDB | Only if you need sub-second time-series ingestion at massive scale. Overkill for athlete data. Loses SQL compatibility. |
| SQLAlchemy 2 async | Tortoise ORM | If you want Django-style ORM. Less mature async story, smaller ecosystem. |
| ARQ | Celery | If you need 10+ workers, complex routing, multiple broker support. Overkill for Garmin sync + plan generation jobs. |
| ARQ | FastAPI BackgroundTasks | Only for true fire-and-forget (send email). No retry, no monitoring, no persistence. |
| Recharts | Apache ECharts | If you need highly interactive charts with zoom/pan on mobile. More complex API. |
| Recharts | Chart.js (react-chartjs-2) | If you want Canvas rendering for very large datasets (1M+ points). Not needed for athlete data. |
| Zustand | Redux Toolkit | If app grows very large with complex state. Zustand is simpler for this scope. |
| PyJWT | python-jose | Never. python-jose is abandoned (no releases in 3+ years). FastAPI officially dropped it. |
| Tailwind CSS | CSS Modules | If you prefer co-located CSS. Tailwind is faster for iteration. |
| fit-tool | FIT SDK (Java) | If fit-tool proves too buggy. Run Java FIT SDK as microservice. Last resort. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| python-jose | Abandoned, no releases in 3+ years. FastAPI dropped recommendation. | PyJWT |
| passlib | Maintenance issues. FastAPI now recommends alternatives. | pwdlib |
| aioredis | Deprecated. Merged into redis-py. | redis-py with `redis.asyncio` |
| Celery (for this project) | Synchronous, heavy, complex config. Overkill for async FastAPI + simple job types. | ARQ |
| garmin-fit-sdk (for writing) | Official SDK is decoder-only. Cannot write FIT files. | fit-tool |
| MongoDB | Schema-less is wrong model for structured training data. Loses joins, transactions, TimescaleDB. | PostgreSQL + TimescaleDB |
| Django | Async story is bolted-on, not native. User chose FastAPI. | FastAPI |
| Flask | No native async, no auto-docs, no Pydantic. Outdated for new projects in 2026. | FastAPI |
| Next.js API routes (as backend) | User chose Python backend. Don't split backend logic across two runtimes. | FastAPI only |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| FastAPI 0.135.x | Pydantic 2.7+ | Pydantic v1 support fully dropped |
| FastAPI 0.135.x | Python 3.10+ | Python 3.9 dropped in v0.130.0 (Feb 2026) |
| SQLAlchemy 2.0.x | asyncpg, Alembic 1.18.x | Use async template for Alembic |
| TimescaleDB 2.x | PostgreSQL 14-16 | Install as PG extension. Same connection. |
| redis-py 5.1 | Redis 7.x/8.x | Native async via `redis.asyncio` |
| anthropic 0.94.x | Python 3.9+ | Supports async client natively |
| fit-tool 0.9.x | Python 3.8-3.14 | Community fork. Test with your Python version. |

## Sources

- [FastAPI releases (PyPI)](https://pypi.org/project/fastapi/) -- version 0.135.3 confirmed (HIGH)
- [Garmin Connect Developer Program Overview](https://developer.garmin.com/gc-developer-program/overview/) -- API catalog confirmed (HIGH)
- [Garmin Training API](https://developer.garmin.com/gc-developer-program/training-api/) -- workout push capability confirmed (HIGH)
- [Garmin OAuth 2.0 PKCE Spec](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf) -- OAuth migration confirmed (HIGH)
- [garminconnect PyPI](https://pypi.org/project/garminconnect/) -- v0.3.2 confirmed (HIGH)
- [fit-tool PyPI](https://pypi.org/project/fit-tool/) -- v0.9.x, encoding capability confirmed (MEDIUM)
- [stuartlynne/python_fit_tool (GitHub)](https://github.com/stuartlynne/python_fit_tool) -- fork with patches (MEDIUM)
- [Garmin FIT SDK Python](https://developer.garmin.com/fit/example-projects/python/) -- decoder-only confirmed (HIGH)
- [anthropic PyPI](https://pypi.org/project/anthropic/) -- v0.94.1 confirmed (HIGH)
- [saganos/yazio_public_api (GitHub)](https://github.com/saganos/yazio_public_api) -- unofficial API docs (LOW)
- [FatSecret Platform API](https://platform.fatsecret.com/) -- nutrition API alternative (MEDIUM)
- [TimescaleDB vs PostgreSQL (MadDevs)](https://maddevs.io/writeups/time-series-data-management-with-timescaledb/) -- performance benchmarks (MEDIUM)
- [FastAPI JWT discussion #11345](https://github.com/fastapi/fastapi/discussions/11345) -- PyJWT recommendation (HIGH)
- [Alembic 1.18.4 docs](https://alembic.sqlalchemy.org/en/latest/) -- async template confirmed (HIGH)
- [TrainingPeaks CTL/ATL/TSB Guide](https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/) -- formulas verified (HIGH)
- [ARQ vs Celery comparison (Leapcell)](https://leapcell.io/blog/celery-versus-arq-choosing-the-right-task-queue-for-python-applications) -- async task queue comparison (MEDIUM)

---
*Stack research for: AI Cycling Coach -- multi-sport training platform*
*Researched: 2026-04-16*
