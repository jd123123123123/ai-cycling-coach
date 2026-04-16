# Project Research Summary

**Project:** AI Cycling Coach
**Domain:** AI-powered multi-sport training platform
**Researched:** 2026-04-16
**Confidence:** MEDIUM-HIGH

## Executive Summary

This is an AI-powered multi-sport training platform that combines Garmin biometric data (sleep, HRV, body battery), nutrition tracking (Yazio), and Claude AI coaching to deliver periodized training plans with .FIT workout export. The competitive landscape shows a genuine gap: no existing platform unifies body metrics + nutrition + conversational AI coaching + structured workout generation + behavioral-science-driven gamification. TrainerRoad adapts silently from workout data alone; Xert models fitness continuously but has no coaching conversation; Intervals.icu provides analytics without AI. This product's differentiator is the multi-signal adaptation (biometrics + nutrition + performance + social context) delivered through a conversational AI interface.

The recommended approach is a Python/FastAPI + React monolith with PostgreSQL/TimescaleDB for time-series data, Redis for caching and task queues, and the Anthropic SDK for Claude integration. The architecture follows a layered pattern: thin API routes, business logic services, pure computation engine (TSS/CTL/ATL/TSB), and isolated AI orchestration with tiered context assembly. The training load model (Banister impulse-response) is well-established sports science with straightforward implementation. FIT file generation should use the official `garmin-fit-sdk` which now supports encoding (resolving a contradiction between researchers -- see FIT SDK note below). Build order follows strict dependencies: foundation and auth first, then training engine (pure math, no external APIs), then Garmin data ingestion, then AI coaching, then workout generation and Garmin push.

The three highest risks are: (1) Garmin Connect Developer Program requires business entity approval -- apply immediately or risk blocking the entire project; (2) AI coaching safety -- Claude can generate dangerous training advice without hard-coded safety constraints and output validation; (3) Yazio has no official API -- the nutrition feature depends on a 6-year-old reverse-engineered spec that may be dead. Mitigate risk 1 by applying for business access now while building with the unofficial library behind an abstraction layer. Mitigate risk 2 by shipping safety guardrails (TSS caps, intensity ceilings, mandatory disclaimers) alongside the very first AI feature. Mitigate risk 3 by designing a pluggable NutritionProvider interface and validating Yazio access in a 1-2 day spike before committing to it.

## Key Findings

### Recommended Stack

The stack is Python-native async throughout: FastAPI 0.135.x with Pydantic v2, SQLAlchemy 2.0 async with asyncpg, and ARQ (async task queue on Redis) for background jobs like Garmin sync and plan generation. The frontend is React 18/19 with TypeScript, Vite, Recharts for training load charts, TanStack Query for server state, and Tailwind CSS.

**Core technologies:**
- **FastAPI + Uvicorn:** API framework -- native async, OpenAPI docs, Pydantic v2 integration, SSE streaming for chat
- **PostgreSQL 16 + TimescaleDB 2.x:** Primary database -- relational for users/plans, hypertables for time-series metrics (20x insert, 396x query speedup for daily CTL/ATL/TSB)
- **Redis 8.x + ARQ:** Caching, sessions, async task queue -- lightweight async alternative to Celery, perfect for Garmin sync jobs
- **Anthropic SDK 0.94.x:** Claude API -- async streaming, prompt caching for cost control. Sonnet 4 for coaching, Haiku 4 for quick queries
- **React + TypeScript + Recharts:** Frontend -- charting library built on D3, ideal for PMC charts and power curves
- **garmin-fit-sdk:** Official Garmin SDK -- now supports both encoding and decoding of .FIT files (see resolution note below)

**FIT SDK Resolution:** Stack research identified `fit-tool` as the "only" Python FIT writer, while Architecture research found the official `garmin-fit-sdk` now supports encoding. **Recommendation: Use the official `garmin-fit-sdk` for FIT encoding.** It is actively maintained by Garmin (v21.141.0+), confirmed via GitHub README to support encoding, and eliminates dependency on the community-maintained `fit-tool` (which has known bugs). Keep `fit-tool` as a documented fallback only if the official SDK's encoding API proves insufficient for workout-specific message types. Verify the exact Encoder API against SDK docs during implementation.

### Expected Features

**Must have (table stakes):**
- Activity history and analytics with PMC chart (CTL/ATL/TSB)
- Power zone display (Coggan 7-zone, auto-calculated from FTP)
- Training calendar with planned vs completed workouts
- .FIT workout export with intervals, repeat blocks, power/HR targets
- Garmin data sync (activities, sleep, HRV, body battery)
- Conversational AI coach with full athlete context
- Basic periodization (base/build/peak mesocycles)
- User accounts with profiles and goal setting

**Should have (differentiators):**
- Unified body status dashboard (sleep + HRV + body battery + nutrition + training load in one view) -- this is the killer feature
- Nutrition-aware training adaptation (no competitor does this)
- AI-adaptive periodization using multi-signal input (biometrics + nutrition + performance)
- .FIT auto-push to Garmin (reduces friction from "see plan" to "execute plan")
- Smart streaks that reward plan adherence including rest days
- Knowledge base with citations for AI coaching credibility

**Defer (v2+):**
- Rival system, accountability partnerships, team challenges
- Narrative quests and recovery credit system
- Advanced nutrition periodization (carb cycling, race-week fueling)
- Forecast AI (predict future FTP from planned training)

### Architecture Approach

Layered monolith with clear separation: thin API routes (FastAPI routers), business logic services (injectable via Depends), pure computation engine (TSS/zones/periodization with zero IO), isolated AI orchestration (context builder, prompt templates, response parser), and external API clients behind abstraction interfaces. Data flows through webhook-first Garmin ingestion (accept webhook, enqueue background task, process async) into incremental CTL/ATL/TSB updates stored as daily snapshots in TimescaleDB hypertables. AI coaching uses a tiered context assembly pipeline (profile ~500 tokens, current state ~800 tokens, recent history ~1500 tokens, RAG ~variable) to stay within an 8K token budget per interaction. Multi-user isolation via PostgreSQL Row-Level Security as defense-in-depth.

**Major components:**
1. **Training Engine** -- pure math: TSS calculators (cycling power, running pace, HR fallback), EWMA for CTL/ATL/TSB, zone calculator, readiness score
2. **AI Coaching Service** -- Claude API orchestration with tiered context assembly, streaming responses, structured output parsing for workouts
3. **Garmin Sync Service** -- webhook receiver, activity parser, daily metrics ingestion, OAuth 2.0 PKCE token management
4. **Workout Builder + FIT Generator** -- structured step sequences (warmup/work/rest/cooldown) encoded to .FIT binary via garmin-fit-sdk
5. **Periodization Engine** -- hierarchical state machine (macrocycle > mesocycle > microcycle > session) with strategic vs tactical adaptation layers

### Critical Pitfalls

1. **AI gives dangerous training advice** -- hard-code safety constraints (max TSS caps relative to CTL, intensity ceilings based on recovery, mandatory rest triggers). Add output validation layer that checks AI recommendations against safety rules before display. Ship disclaimers with every recommendation. Must be in place before any user sees AI output.

2. **Garmin API access requires business approval** -- apply for the Garmin Connect Developer Program immediately with a business entity. Build with unofficial `python-garminconnect` behind an abstraction layer as a bridge. Official API is free but gated; unofficial breaks regularly (documented in GitHub issues #127, #213, #332, #337).

3. **Yazio has no official API** -- the only docs are a 2020 reverse-engineered spec with 10 commits. Run a 1-2 day spike to validate access before planning any nutrition features. Design a NutritionProvider interface with fallbacks: manual entry, FatSecret API (5000 free calls/day), USDA FoodData Central, CSV import.

4. **Multi-sport TSS is not comparable across sports** -- power-based cycling TSS is accurate, HR-based gym TSS is unreliable. Track sport-specific load separately. Display confidence indicators. Build cycling-only first, then carefully add running/gym with separate tracking.

5. **Health data triggers GDPR special category protections** -- HRV, sleep, body composition, nutrition are health data under Article 9. Implement explicit granular consent, encryption at rest, right to deletion, and data minimization from Phase 1.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 0: Pre-Development Validation
**Rationale:** Two blocking unknowns must be resolved before committing to development.
**Delivers:** Go/no-go on Garmin official API and Yazio integration.
**Actions:** Apply for Garmin Connect Developer Program with business entity. Run 1-2 day Yazio API spike. Set up Docker dev environment (PostgreSQL + TimescaleDB + Redis).
**Avoids:** Pitfall 2 (Garmin access blocked), Pitfall 4 (Yazio unreliable).

### Phase 1: Foundation + Auth + Athlete Profile
**Rationale:** Everything depends on user accounts and data models. Privacy-by-design must be baked in from the start.
**Delivers:** Database schema with migrations, JWT auth, athlete profile CRUD, basic API structure, GDPR consent flows, encrypted token storage.
**Addresses:** User accounts, profiles, goal setting (table stakes).
**Avoids:** Pitfall 8 (GDPR violations).

### Phase 2: Training Engine (Pure Computation)
**Rationale:** No external API dependencies -- can be built and tested in isolation with synthetic data. Required before AI coaching or data ingestion can produce meaningful results.
**Delivers:** TSS calculators (cycling power-based, running pace-based, HR fallback), CTL/ATL/TSB EWMA computation, power/HR zone calculator, daily readiness score formula.
**Addresses:** Training load model, power zone display, FTP tracking (table stakes).
**Avoids:** Pitfall 5 (multi-sport TSS errors) by building cycling-only first.

### Phase 3: Garmin Data Ingestion
**Rationale:** AI coaching is useless without real athlete data. This phase feeds the training engine.
**Delivers:** Garmin OAuth 2.0 PKCE flow, webhook receiver for push notifications, activity parser (FIT to structured data), daily metrics ingestion (sleep, HRV, body battery), incremental CTL/ATL/TSB updates on new activity.
**Addresses:** Garmin data sync, activity history and analytics (table stakes).
**Avoids:** Pitfall 2 (uses abstraction layer for official/unofficial swap), Pitfall 10 (robust token management).

### Phase 4: Dashboard + Calendar
**Rationale:** Users need to see their data before interacting with AI. The dashboard is the primary daily touchpoint.
**Delivers:** Body status dashboard (morning readiness view), PMC chart (CTL/ATL/TSB), activity history with analytics, training calendar (week/month view), FTP history timeline.
**Addresses:** Body status dashboard (differentiator), training calendar, activity history (table stakes).

### Phase 5: AI Coaching + Chat
**Rationale:** Requires working data pipeline (Phases 2-3) to assemble meaningful context. This is the core differentiator.
**Delivers:** Claude API integration with streaming, tiered context assembly pipeline, chat WebSocket/SSE endpoint, safety validation layer, prompt templates for coaching/workout generation, conversation history.
**Addresses:** Conversational AI coach (differentiator), daily training recommendation (table stakes).
**Avoids:** Pitfall 1 (dangerous AI advice) via hard-coded safety constraints and output validation. Pitfall 12 (cost explosion) via prompt caching and token budgets.

### Phase 6: Periodization + Workout Generation + FIT Export
**Rationale:** Depends on AI coaching (Phase 5) for AI-driven plan generation and on training engine (Phase 2) for TSS targets.
**Delivers:** Periodization state machine (macrocycle/mesocycle/microcycle), AI-driven plan generation, structured workout builder, .FIT file generation via garmin-fit-sdk, Garmin Training API push.
**Addresses:** Basic periodization, .FIT workout export, .FIT auto-push (table stakes + differentiator).
**Avoids:** Pitfall 6 (FIT incompatibilities) via SDK validation tool and device testing. Pitfall 7 (plan rigidity/reactivity) via strategic vs tactical layer separation.

### Phase 7: Nutrition Integration
**Rationale:** Independent of other features after dashboard exists. Can be added without disrupting existing functionality. Depends on Phase 0 spike results.
**Delivers:** NutritionProvider interface, Yazio integration (or fallback provider), nutrition dashboard, pre/post workout fueling advice, nutrition-aware training adaptation.
**Addresses:** Nutrition-aware training adaptation (differentiator), unified body status dashboard enhancement.
**Avoids:** Pitfall 3 (eating disorder triggers) via performance-framing-only, calorie floor minimums, ED screening. Pitfall 4 (Yazio unreliable) via pluggable provider interface.

### Phase 8: Social + Gamification
**Rationale:** Retention features that build on established core. Requires user research before building. Should be research-driven using SDT and Octalysis frameworks.
**Delivers:** Friends + kudos, smart streaks (plan-adherent, rest-day-inclusive), basic social feed (auto-generated, not user-created content).
**Addresses:** Smart streaks, friends + kudos (P2 features).
**Avoids:** Pitfall 11 (social harm) via opt-in only, progress-framing, SDT design framework, limited gamification density.

### Phase 9: Knowledge Base + RAG
**Rationale:** Enhances AI coaching quality but not required for MVP. Can be added incrementally.
**Delivers:** pgvector setup, document ingestion pipeline, embedding generation, retrieval integration into context builder, training science content curation.
**Addresses:** Knowledge base with citations (differentiator).

### Phase Ordering Rationale

- Phases 0-1 first because Garmin access and auth/privacy are blocking prerequisites that affect everything downstream.
- Phase 2 before Phase 3 because the training engine is pure computation that can be built and tested with synthetic data, while Garmin integration requires API access. Building math first means ingested data immediately produces meaningful metrics.
- Phase 4 before Phase 5 because the dashboard gives users value from their data before AI coaching adds interpretation. Also validates the data pipeline works correctly.
- Phase 5 before Phase 6 because AI-driven plan generation depends on the coaching service, and manual plan building is explicitly an anti-feature.
- Phase 7 is independent and can be parallelized with Phases 6 or 8 if resources allow.
- Phase 8 last among core features because social/gamification requires the most user research and has the highest risk of causing harm if done wrong.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (Garmin Data Ingestion):** Garmin webhook payload formats require developer program access to fully verify. OAuth 2.0 PKCE flow specifics need SDK documentation review.
- **Phase 6 (FIT Export):** garmin-fit-sdk Encoder API method names need verification against actual SDK docs. Device compatibility testing needed across Edge/Forerunner generations.
- **Phase 7 (Nutrition):** Depends entirely on Phase 0 spike results. If Yazio is dead, research alternative providers.
- **Phase 8 (Social/Gamification):** Requires user research. Behavioral psychology frameworks are documented but application is novel.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation/Auth):** Well-documented FastAPI + JWT + SQLAlchemy patterns.
- **Phase 2 (Training Engine):** Sports science formulas are textbook. Coggan's model is the industry standard.
- **Phase 4 (Dashboard):** Standard React + charting patterns.
- **Phase 5 (AI Coaching):** Claude API integration is well-documented. Context assembly is a synthesis of standard RAG patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All technologies verified via PyPI/npm with current versions. FastAPI + SQLAlchemy async + Anthropic SDK are mature, well-documented choices. |
| Features | MEDIUM-HIGH | Competitive landscape well-mapped across 9 competitors. Feature gaps validated. .FIT specifics need SDK verification during implementation. |
| Architecture | MEDIUM | Core patterns (EWMA training load, tiered context, webhook-first sync) are well-established. Garmin API specifics require developer program enrollment. garmin-fit-sdk encoding API confirmed but exact method signatures are illustrative. |
| Pitfalls | MEDIUM-HIGH | Safety and privacy pitfalls verified via academic sources. Garmin API fragility confirmed via GitHub issues. Yazio risk is LOW confidence by nature (absence of information). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **garmin-fit-sdk Encoder API:** Confirmed to support encoding via GitHub README, but exact Python API for writing workout messages needs verification against SDK documentation during Phase 6 implementation.
- **Garmin Developer Program approval timeline:** Unknown how long approval takes. This is a blocking dependency. Have the unofficial library fallback ready.
- **Yazio API viability:** Cannot be assessed without a spike test. This is a go/no-go decision for the nutrition feature. Plan for manual entry as the guaranteed fallback.
- **TimescaleDB hypertable migration path:** When to convert regular PostgreSQL tables to hypertables needs to be decided -- can start with regular tables and convert later, or set up hypertables from the start for activities and daily_metrics.
- **Claude prompt caching cost savings:** Actual savings depend on cache hit rates which depend on usage patterns. Monitor during Phase 5 and adjust context strategy accordingly.

## Sources

### Primary (HIGH confidence)
- [Garmin Connect Developer Program](https://developer.garmin.com/gc-developer-program/overview/) -- API catalog, OAuth migration, Training API capabilities
- [Garmin FIT SDK](https://developer.garmin.com/fit/) -- workout file types, encoding cookbook, step types
- [garmin-fit-sdk GitHub](https://github.com/garmin/fit-python-sdk) -- official Python SDK, encoding support confirmed
- [TrainingPeaks CTL/ATL/TSB Guide](https://www.trainingpeaks.com/coach-blog/a-coachs-guide-to-atl-ctl-tsb/) -- performance management model formulas
- [FastAPI 0.135.x](https://pypi.org/project/fastapi/) -- current stable version confirmed
- [Anthropic SDK 0.94.x](https://pypi.org/project/anthropic/) -- async, streaming, prompt caching

### Secondary (MEDIUM confidence)
- [Frontiers in Psychology: Gamification S-curve](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full) -- excessive gamification causes burnout
- [Harvard: AI and eating disorders](https://hsph.harvard.edu/news/artificial-intelligence-tools-offer-harmful-advice-on-eating-disorders/) -- AI safety in nutrition context
- [python-garminconnect GitHub Issues](https://github.com/cyberjunky/python-garminconnect) -- documented API breakages
- [TimescaleDB benchmarks](https://maddevs.io/writeups/time-series-data-management-with-timescaledb/) -- performance vs vanilla PostgreSQL
- [Yu-kai Chou Octalysis Framework](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/) -- gamification design framework

### Tertiary (LOW confidence)
- [saganos/yazio_public_api](https://github.com/saganos/yazio_public_api) -- unofficial, last updated 2020. Needs spike validation.
- [fit-tool 0.9.x](https://pypi.org/project/fit-tool/) -- community FIT encoding library. Fallback only.

---
*Research completed: 2026-04-16*
*Ready for roadmap: yes*
