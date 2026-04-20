# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.
**Current focus:** Phase 5 Wave 1 complete -- coach backend with causal briefs shipped. Phase 5 Wave 2 (frontend coach UI) is next.

## Current Position

Phase: 5 of 9 (AI Coaching Core) -- IN PROGRESS (Wave 1 COMPLETE)
Plan: 05-01 complete (coach backend with Claude Opus 4.7 tool-use + rule-based fallback + safety rails + 10 advanced metrics)
Status: 05-01 backend shipped; 05-02 frontend can start immediately (5 endpoints ready, schemas exported)
Last activity: 2026-04-20 -- Completed 05-01-PLAN.md (7 tasks, 68 new tests, all 123 passing)

Progress: [██████████░] ~91%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 36 min
- Total execution time: 1.08 + 0.75 + 0.25 + 0.75 + 0.033 + 0.65 hours = ~3.52 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-auth | 4 | ~170 min | ~43 min |
| 02-training-engine | 3 | ~8 min | ~2.7 min |
| 03-garmin-data-integration | 3 | ~135 min | ~45 min |
| 05-ai-coaching-core | 1 (Wave 1) | ~52 min | ~52 min |

**Recent Trend:**
- Last 5 plans: ~2 min, 39 min, 56 min, ~40 min, 52 min
- Trend: stable (backend plans consistently 40-56 min)

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [01-01]: PyJWT over python-jose (abandoned); pwdlib[argon2] over passlib (deprecated) -- FastAPI official recs
- [01-01]: DB port 5433 to avoid conflict with existing local PostgreSQL on 5432
- [01-01]: jti on refresh tokens from day 1 to enable Redis revocation in Phase 2 without token schema change
- [01-01]: Redis refresh token revocation deferred to Phase 2 -- Phase 1 known limitation documented
- [01-02]: GDPR consent records anonymized on deletion (user_id=NULL) -- legal proof must survive account deletion
- [01-02]: FTP history as append-only JSON list on AthleteProfile -- sufficient for Phase 1, no separate table needed
- [01-02]: goals as JSON dict on AthleteProfile -- flexible, avoids migrations for goal type changes
- [01-02]: daily_metrics UNIQUE(user_id, date) dropped -- TimescaleDB requires partition col in all unique constraints; app-layer enforcement in Phase 3
- [01-02]: TimescaleDB hypertables (activities 7-day, daily_metrics 30-day) pre-created in Phase 1 -- avoids Phase 3 migration downtime
- [01-03]: Access token stored in JS module variable (never localStorage) -- XSS-safe per security pattern
- [01-03]: Axios 401 interceptor queues concurrent requests during refresh to prevent duplicate refresh calls
- [01-03]: Login uses URLSearchParams (form data) not JSON -- OAuth2PasswordRequestForm requires username/password fields
- [01-03]: RegisterPage redirects to /dashboard until Plan 04 creates /profile-setup route
- [01-04]: CONSENT_TYPES as const array in types/consent.ts -- single source of truth for text sent to backend (GDPR Article 9 granularity)
- [01-04]: Consent version pinned to "1.0" -- updating version will trigger re-consent flow for returning users
- [01-04]: useOnboarding hook (not inline in ProtectedRoute) -- dedicated hook for testability, checks /consent + /athletes/me on every protected entry
- [Roadmap]: Build training engine before Garmin integration (pure math, testable with synthetic data)
- [Roadmap]: Use unofficial python-garminconnect behind abstraction layer, swap for official API later
- [Roadmap]: Safety guardrails ship with AI coaching core (Phase 5), not deferred
- [Roadmap]: Nutrition designed as enhancement (Phase 8), not dependency -- manual entry as Yazio fallback
- [Roadmap]: Social/gamification last (Phase 9) -- needs users first, highest harm risk if rushed
- [02-01]: Lazy numpy import inside calculate_np() body — keeps module importable without numpy in all contexts
- [02-01]: NP test requires 60s power blocks (not 1s alternation) — 30s rolling window smooths sub-30s variation to mean
- [02-01]: Cycling TSS formula gives 61.73 for 220W/280FTP (not 61.2 as commonly cited)
- [02-02]: Activity ORM maps to pre-existing hypertable DDL, no new migration; env.py include_object skips activities + daily_metrics
- [02-02]: TSS=None when athlete profile lacks thresholds — activity created regardless, TSS populated when thresholds are set
- [02-02]: average_power used as NP fallback for cycling TSS (overestimates for variable-intensity rides, documented)
- [02-02]: Gym hrTSS defaults sex="male" — TODO add sex field to AthleteProfile in future plan
- [02-03]: Python gap-fill for rest days instead of time_bucket_gapfill — gapfill + multi-sport GROUP BY unreliable; Python iteration simpler and correct
- [02-03]: Total PMC from summed daily TSS (single EWMA), not sum of per-sport CTLs — summing CTLs violates EWMA model
- [02-03]: FTP endpoint separate from athlete PATCH — adds source field; legacy PATCH entries lack source, handled via .get("source","manual") fallback
- [02-03]: PUT /athletes/me/ftp always appends to history — each call is a deliberate measurement event; dedup is caller responsibility
- [03-01]: EncryptedString reads GARMIN_ENCRYPTION_KEY lazily on first use (not import time) — module importable without key set
- [03-01]: Alembic migrations switched from asyncpg to psycopg2 — asyncpg 0.30.0 hangs on connection to Docker PostgreSQL on macOS; psycopg2 works reliably for sync migration operations; app runtime still uses asyncpg
- [03-01]: GarminProvider as typing.Protocol (structural typing) — no explicit implements; business logic imports Protocol, not library directly
- [03-02]: map_garmin_activity returns None for 0-duration activities (duration_seconds=None) — avoids TSS division-by-zero
- [03-02]: sync_activities loads AthleteProfile once per sync run (not per activity) — creates in-memory stub if none exists, activities stored with TSS=None
- [03-02]: _safe_fetch swallows non-auth exceptions per biometric endpoint — partial biometric data better than no data for the day
- [03-02]: sync_daily_metrics batches all days in a single db.commit() — upsert_daily_metric only flushes
- [03-03]: Scheduler bypasses RLS via async_session_maker directly — system-level job; sync_user_garmin already scopes all queries by user_id. Production hardening needed when moving to non-superuser DB role.
- [03-03]: Per-user try/except in run_all_user_syncs — one bad credential must not block others' syncs
- [03-03]: POST /connect returns 409 on duplicate rather than replacing — forces explicit disconnect flow, preserves audit trail
- [03-03]: POST /sync returns 409 while sync_status=='syncing' — prevents manual trigger racing the hourly scheduler
- [03-03]: misfire_grace_time=600s — 10 min grace for server restart; longer outages skip rather than pile up (sync is idempotent via external_id)
- [04-01]: retry:false on 401/403/404 in React Query QueryClient — avoids racing axios 401 interceptor refresh queue
- [04-01]: DashboardShell uses ReactNode props for section slots (not children) — named props enable parallel Wave 2 plans without shell collisions
- [04-01]: min-w-0 on every flex/grid child containing Recharts ResponsiveContainer — ResponsiveContainer renders 0px wide without it
- [04-01]: Null readiness metrics get weight 0 and remaining weights renormalize — null→50 fallback would distort single-metric scores
- [04-01]: toIsoDate() uses local date (not UTC) for /daily-metrics params — backend date type is timezone-agnostic calendar day
- [04-02]: recharts v3 TooltipContentProps<any, any> required — strict ContentType generic contravariance makes narrow types incompatible; any is pragmatic workaround
- [04-02]: Tooltip content prop must be function reference (not JSX element) in recharts v3 — element form causes TS2739
- [04-03]: dateFnsLocalizer required for react-big-calendar — renders nothing without it
- [04-03]: PointerSensor activationConstraint:{distance:8} + TouchSensor delay+tolerance — prevents nav button clicks being intercepted as drag starts
- [04-03]: Optimistic PATCH updates all planned-workouts cache keys via getQueriesData — calendar has multiple overlapping query keys (week vs month view)
- [04-03]: EventRenderer typed to EventProps<CalEvent>, DroppableDateCell to DateCellWrapperProps — react-big-calendar components prop requires exact generic types
- [04-04]: WorkoutPreviewModal renders via portal from inside TrainingCalendar (not DashboardShell) — modal state co-located with calendar; shell workoutPreviewModal slot stays null for future global routing use
- [04-04]: IntervalStructure imported into dashboard.ts replacing inline zone:number — zone 1..7 union enforced at API type boundary
- [04-04]: zoneFromPctFtp fallback for null power returns Z2 (endurance) not Z1 — null power most likely base/endurance, not pure recovery
- [04.5]: uPlot legend:false — native uPlot legend disabled, LegendPip bottom strip preserved for visual consistency
- [04.5]: IntensityDistribution uses Recharts PieChart (no new bundle cost) — ECharts donut unnecessary overhead
- [04.5]: Sparkline bandValues prop added as extension (not split into new component) — cleanest path
- [04.5]: EF scatter dots via paths:null in uPlot — path builder returning null suppresses connecting line, only points config renders
- [04.5]: ECharts VisualMapComponent required for CalendarHeatmap color scale — tree-shaken but ~246 KB gzipped delta (budget was 200 KB; total well under 1.3 MB ceiling)
- [05-01]: Anthropic SDK imported lazily inside coach_service.generate_brief — ModuleNotFoundError on SDK cannot break app boot when ANTHROPIC_API_KEY is unset
- [05-01]: Rule-based fallback activates on THREE paths — missing key, SDK exception, LLM returns no brief_response tool_use block. /coach/brief always returns 200
- [05-01]: Created backend/requirements.txt mirroring pyproject.toml — plan called for it but repo previously shipped only pyproject.toml; both now track deps in lockstep
- [05-01]: Safety rails applied AFTER Claude response, never before — LLM may suggest anything; rails mark options as blocked=True with human-readable reason (never silently drop) to preserve transparency
- [05-01]: Prompt caching scoped to system prompt only (ephemeral cache_control) — user message varies per request; stable system prompt block delivers ~80% input-token savings within 5-min cache window
- [05-01]: coach_prompt.py separated from coach_service.py so prompt caching sees a stable prefix and so the system prompt is independently inspectable via /coach/transparency
- [05-01]: Zone distribution uses session-level IF→3-zone bucket heuristic (not per-second streams) — matches full TID at >90% agreement per Seiler 2009; avoids loading raw sample arrays
- [05-01]: why_am_i_tired synthesizer orders causes by severity (high→med→low) — LLM receives pre-sorted list so the strongest signal is cited first in the rationale
- [05-01]: ED-keyword filter runs on final concatenated stream buffer, not on deltas — partial phrases would false-trigger; an SSE 'replace' frame tells the client to wipe its buffer and display the safe redirect
- [05-01]: Coach chat rate limit is in-memory deque (20 msgs/min/user) — per-process only; production multi-worker deploy needs Redis (tracked in pending todos)
- [05-01]: coach_briefs is append-only audit trail (never overwrite) — every generation persisted for auditability; 6h TTL is a read-through cache on the latest row
- [05-01]: injury_flag has server_default FALSE — existing rows get false without a backfill step; safety_rails.intensity_ceiling already treats missing-as-false via boolean context
- [05-01]: Migrations/env.py model import list expanded to include all 8 models — was stale (missing planned_workout, daily_metric_sample); future autogenerate now sees complete metadata

### Pending Todos

- Legal review needed: consent record retention period after account deletion (before public launch)
- Production deployment: use non-superuser PostgreSQL role for full RLS enforcement (coach user is superuser in dev)
- Consider adding source field to athlete PATCH route FTP history append — currently FTP endpoint has source but PATCH route doesn't (mixed history format)
- IMMEDIATE: Restart Docker Desktop (daemon became unresponsive during 03-01 execution due to disk full); then run `cd backend && docker compose up -d db && alembic upgrade head` to apply c1f8a3d9e2b7 migration
- Coach chat rate limiter: move from in-memory deque to Redis when deploying behind multiple uvicorn workers
- Production readiness: provision ANTHROPIC_API_KEY env var before launch so /coach/* endpoints use Claude rather than the rule-based fallback

### Blockers/Concerns

- IMMEDIATE: Docker daemon unresponsive (disk was 100% full during 03-01 execution). Restart Docker Desktop, then run `alembic upgrade head` to apply garmin_credentials migration.
- Garmin Connect Developer Program requires business entity approval -- apply immediately to unblock Phase 3
- Yazio has no official API -- run spike to validate before Phase 8 commits to integration
- [RESOLVED 01-01] TimescaleDB hypertable decision -- decided: activities/daily_metrics will be hypertables from day 1 (done in 01-02 migration)
- [RESOLVED 01-02] AthleteProfile + ConsentRecord relationships -- activated in Phase 2 as planned

## Session Continuity

Last session: 2026-04-20
Stopped at: Phase 5 Wave 1 complete — coach backend with Claude Opus 4.7 + safety rails + 10 advanced metrics (commits 118c1d1..9d13fb0)
Resume file: None
Next: 05-02 (frontend coach UI) — 5 coach endpoints + schemas ready; /coach/brief always returns 200 with structured payload (rule-based when no key, LLM when key present)
Pending: Provision ANTHROPIC_API_KEY in production before launch; migrate chat rate limiter to Redis when scaling to multiple workers
