# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.
**Current focus:** Phase 5.4 COMPLETE -- PMC hover tooltip shows a plain-English per-day narrative below the CTL/ATL/TSB numbers. Rule-based, deterministic, <=140 chars, simple/technical language-aware. Classifies each day into rest/easy/moderate/hard/big from TSS/h and writes a 1-2 sentence summary. Phase 6 (training-plan-generation) is next.

## Current Position

Phase: 5.4 of 9 (PMC Hover Narratives) -- COMPLETE
Plan: 05.4-01 complete (4 tasks, 4 atomic commits; 319/319 backend tests incl. 60 new pmc_narratives; tsc clean; build clean)
Status: Hovering any datapoint in the fitness/fatigue timeline now shows a one-sentence explanation of what happened that day. Simple mode never leaks FTP/TSS/CTL/ATL/TSB/EF/VI/NP/RPE/Z1-Z7/Coggan/Banister/Seiler/Friel/Mujika/polarized (parametrized test firewall). Technical mode cites CTL/ATL/TSB notation. Phase 6 can start immediately
Last activity: 2026-04-20 -- Completed 05.4-01-PLAN.md (pmc_narratives service + /training-load/pmc language param + PMCChart uPlot tooltip overlay + 60 new tests)

Progress: [████████████] 100% through Phase 5 + 5.1 + 5.2 + 5.3 + 5.4 / ~95% overall

## Performance Metrics

**Velocity:**
- Total plans completed: 13
- Average duration: ~47 min
- Total execution time: ~9.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-auth | 4 | ~170 min | ~43 min |
| 02-training-engine | 3 | ~8 min | ~2.7 min |
| 03-garmin-data-integration | 3 | ~135 min | ~45 min |
| 05-ai-coaching-core | 2 (complete) | ~107 min | ~54 min |
| 05.1-precision-prescription | 1 (complete) | ~75 min | ~75 min |
| 05.2-language-and-sync | 1 (complete) | ~41 min | ~41 min |
| 05.3-post-ride-review | 1 (complete) | ~75 min | ~75 min |
| 05.4-pmc-hover-narratives | 1 (complete) | ~130 min | ~130 min |

**Recent Trend:**
- Last 5 plans: 55 min, 75 min, 41 min, 75 min, 130 min
- Trend: 5.4 took longer than the 35-min plan estimate primarily because the plan described PMCChart as Recharts-based when it's actually uPlot (04.5 decision). Reconciling via a setCursor->React-state bridge + overlay HTML tooltip added ~20 min. Narrator logic and jargon test firewall were on-plan. File count: 3 created / 5 modified.

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
- [05-02]: SSE client uses fetch + ReadableStream, not EventSource — EventSource is GET-only; /coach/chat needs POST body with messages array
- [05-02]: Coach chat messages are session-local React state (not persisted) — briefs are the audit trail; chat is ephemeral by design
- [05-02]: Evidence chips derived from the snapshot the LLM saw, not a separate endpoint — brief response already contains everything the component needs
- [05-02]: Blocked options render styled (strikethrough + reason) rather than being filtered out — preserves transparency: athlete sees what the LLM suggested AND what rails intervened
- [05-02]: motion/react (not framer-motion) — motion is the renamed package; identical API, installed cleanly
- [05-02]: Stubbed WhyAmITired + TransparencyDrawer during Task 2 so CoachBrief commit compiled; Tasks 4/5 atomic-replaced stubs with full implementations
- [05-02]: Custom JSON renderer for TransparencyDrawer (~40 LOC) — no highlight.js dependency; token-class colouring sufficient
- [05-02]: Decoupling + durability tiles shipped as placeholders — backend computes both but /activities doesn't carry sample streams yet; tiles ready for /coach/metrics-trend
- [05-02]: 503 on /coach/chat = visible disabled state with ANTHROPIC_API_KEY guidance, not a silent toast — degradation must be legible
- [05-02]: Root `tsc --noEmit` doesn't check anything (files:[] + references); typecheck via `-p tsconfig.app.json` or rely on `npm run build` which uses `tsc -b`
- [05.1-01]: Templates are the atomic unit of prescription — LLM picks/substitutes from a 12-template library and cannot author intervals from scratch. Each block carries target_pct_ftp; watts are materialised server-side via parametrize_template(template, ftp) at request time. Single source of truth for athlete-scaled numbers
- [05.1-01]: Server-side watts authority (resolve_and_prescribe) — LLM's block watts are unconditionally rewritten from athlete's current FTP. LLM can only bend duration ±15% (via the duration_minutes hint) and that bend is clamped twice (resolve_and_prescribe + parametrize_template.duration_scale). Makes LLM hallucinations harmless
- [05.1-01]: Rails enforcement via template downgrade (not option-blocking) — Phase 5 marked options blocked=True; 5.1 has only ONE workout so above-ceiling templates are substituted with _safe_template_for_ceiling(ceiling) and the downgrade is noted inline in why_this_workout. Cleaner UX, preserves transparency
- [05.1-01]: Zone-keyed tolerance bands — Z1 ±10%, Z2 ±8%, Z3 ±6%, Z4+ ±5%. Tighter on high-zone efforts (intent-enforcing), wider on Z2 (HR-drift-first pacing)
- [05.1-01]: Friel phase boundaries — 7d=race, 21d=taper, 49d=peak, 112d=build, else base; base/build split on CTL threshold (40 for base, 55 for build). No goal + CTL<30 = offseason; CTL>=30 = maintenance
- [05.1-01]: Phase-weighted Seiler polarized — base 90/10, build 75/25, taper 85/15, race 100/0. Hard-session count is phase-specific (build2 gets VO2+threshold, base2 gets threshold-only, base1 gets none)
- [05.1-01]: session_type_for_today is a first-match-wins cascade: intensity_ceiling → phase → day-of-week → weekly_progress. Sunday=long endurance, Monday=rest, Wed=key-workout-day for build/peak phases
- [05.1-01]: pick_template fallback chain when primary category is empty (FTP<180+vo2, etc.): sweet_spot_2x20 → z2_endurance_60 → recovery_30 → rest_day. Never returns nothing
- [05.1-01]: Alternates resolver synthesises missing labels — a missing less_time / recover alternate is filled with a sensible default rather than rejecting the response. UI always has 2 alternates to render
- [05.1-01]: Invalid/unknown LLM template_id falls back to snapshot.picked_template_id (the pre-LLM rules-based pick) — even a completely nonsense LLM response still produces a coherent workout
- [05.1-01]: coach_briefs options column made nullable (not dropped) — rollback-safe; legacy rows still deserialise through BriefRead's optional options[] field
- [05.1-01]: EF prediction band keyed by template category (recovery 1.00-1.20, endurance 1.30-1.60, sweet_spot 1.45-1.75, threshold 1.50-1.80, vo2 1.30-1.55) — VO2 band lower than threshold because VO2 effort pushes HR harder. Sets post-workout expectations without per-athlete history
- [05.1-01]: IntervalRibbon height mapping clamped(22, 96, pct_ftp*80) — Z1 blocks stay visible at 22% min-height instead of becoming invisible warm-ups
- [05.1-01]: DashboardSection uses max-height transition (not display:none) — 4000px is enough for any realistic expanded content and keeps the reveal smooth. localStorage persisted per section id for returning-user preference
- [05.1-01]: ReadinessHero drops its internal KpiStrip — duplicate with KpiStripCompact (fold 2) violated the user's iPhone bar. Fold 1 hero now only renders dial + verdict + CoachBrief. Net removal: 100 LOC, 1.2 KB gzipped
- [05.1-01]: Zone-color palette (--color-zone-1..7) as CSS custom properties, not Tailwind classes — IntervalRibbon reads via inline style so a future theme switch updates every ribbon segment without a rebuild
- [05.2-01]: Default coach language is 'simple' (plain English, no FTP/TSS/CTL/Z-numbers) — non-athlete users are the majority; technical mode with full Coggan/Seiler vocabulary is opt-in via the masthead toggle
- [05.2-01]: coach_prompt.py exports SYSTEM_PROMPT_SIMPLE + SYSTEM_PROMPT_TECHNICAL + system_prompt_for_language() router; SYSTEM_PROMPT stays aliased to technical for backward compat with /coach/transparency importers (avoids rename churn)
- [05.2-01]: Language lives inside evidence JSONB, not a new column — get_or_generate_brief filters via `func.coalesce(CoachBrief.evidence['language'].astext, 'simple') == language` so pre-5.2 rows serve simple-mode requests transparently. Zero migration cost
- [05.2-01]: _rule_based_brief hard-coerces anything that isn't exactly 'technical' to 'simple' — corrupt / unknown language values cannot leak jargon into the plain-English response. Mirrors the endpoint's Literal narrowing
- [05.2-01]: TransparencyDrawer stays technical by design — it IS the "show me the raw nerd data" surface. Only the intro sentence flips tone in simple mode ("Numbers and nerd details.")
- [05.2-01]: Per-browser localStorage persistence with cross-tab storage-event mirror — phone vs laptop can have different preferences; toggling in one tab mirrors to other open tabs for free
- [05.2-01]: React Query brief key is ['coach','brief',language] — toggling mutates the key, old-language data is removed (not just invalidated) because refetch fires automatically on the new key
- [05.2-01]: Plain-English phrase map (frontend/src/utils/coachLanguage.ts) handles only what the backend can't write — tooltips, block name hints, CTA labels, category-based workout titles. Coach-generated text (rationale, why_this_workout) is backend-language-aware via SYSTEM_PROMPT_SIMPLE/TECHNICAL
- [05.2-01]: Category→feel mapping drives simple-mode intensity language — recovery→"chill pace", vo2→"hard intervals", threshold→"hard pace". Same taxonomy used in titles + summary lines + interval tooltips
- [05.2-01]: SyncButton invalidates 6 React Query keys on success (daily-metrics, activities, pmc, coach-brief, intraday, garmin-status) — full dashboard refresh without location.reload(); preserves scroll position and avoids white flash
- [05.2-01]: /coach/why and /coach/transparency endpoints are NOT language-aware server-side — WhyAmITired rewrites the technical evidence strings client-side via simpleEvidenceFor (known-label map + regex fallback for unknown labels). Acceptable because evidence is structured; future phase can server-side-ify if needed
- [05.2-01]: PMC chart + calendar heatmap retain technical labels (CTL/TSB/TSS) — they're dense analytic panels in fold 4 (collapsed by default), same role as TransparencyDrawer. Plan did not list them for language-mode work
- [05.3-01]: score_ride grades against template.base_tss (not actual-duration-scaled TSS) — matches the "what should have been" baseline the picker chose. parametrize_template only scales TSS when duration_scale is applied, never when matching actuals to targets
- [05.3-01]: First-match-wins grade rubric: perfect(±10 both) → overcooked(>30 either) → undercooked(<-30 either) → strong(one ≤10 + other ≤25 or both ≤20) → okay(both ≤30) → mixed fallback(TSS high=overcooked, else undercooked). Explicit and testable — no magic fuzzy scoring
- [05.3-01]: IF target proxy averages main-block target_pct_ftp (excludes Warm-up/Cool-down/Recovery). Deterministic for multi-main templates like vo2_5x4; equals the single block's pct for steady templates
- [05.3-01]: TSB projection bifurcates on days_to_goal — ≤14 uses Mujika ATL-decay (~15 TSB lift over full taper), >14 uses TSB_now + (ctl_7d × days/7 × 0.3). Dampener reflects fatigue catching up with fitness builds
- [05.3-01]: taper_window='unknown' when days_to_goal>21 — Mujika classification is only meaningful inside the actual taper window
- [05.3-01]: Offseason / maintenance phase grades against absolute TSS bands (25-80 / 30-100) instead of template target — avoids penalising chill rides against a build-phase prescription
- [05.3-01]: CompliancePair rounding adapts to magnitude — target<5.0 (IF values) → 2 decimals, target≥5.0 (duration/TSS) → 1 decimal. Prevents IF 0.65 quantising to 0.7
- [05.3-01]: resolve_and_prescribe forces template_id='rest_day' when snapshot.post_ride is present — post_ride_review IS the fold-1 hero, showing a second prescription card would muddy UX
- [05.3-01]: Rule-based synthesiser + LLM path both call _build_post_ride_review — LLM narrative fields merge over the deterministic builder; compliance numbers are never LLM-writable (scorer is authority). Ships without API key
- [05.3-01]: post_ride_review persisted inside evidence JSONB — no migration, no new column; _brief_to_read extracts via Pydantic on response, tolerates pre-5.3 rows (key missing → None)
- [05.3-01]: Simple-mode trajectory narrative runs a defensive regex scrub on trajectory.narrative_hook (CTL→fitness, TSB→freshness, TSS→training points) even though the backend emits plain-enough text — belt-and-braces against future text changes
- [05.3-01]: Grade pill palette mapped to paper design system — perfect=#7c9e7e (sage), overcooked=#c4614c (coral), strong=#b5874f (goldenrod), undercooked=#9b8a6b (muted warm-grey), okay=paper-2 neutral. Colour intent matches grade valence
- [05.3-01]: Only extreme grades get visual decoration — perfect=2.4s pulse/glow loop, overcooked="Extra recovery tonight." micro-copy. Okay/strong/undercooked stay quiet per cognitive-deload principle
- [05.3-01]: Third compliance slot prefers EF (NP/avgHR — San Millán) over IF (NP/FTP — Coggan) — EF is the more informative trend signal for endurance athletes; IF only shown when avgHR absent and NP present
- [05.4-01]: Per-day narratives computed on every /pmc call, not cached — deterministic pure-function calls over O(days) entries; caching would add language-aware invalidation complexity for zero wall-clock benefit
- [05.4-01]: Intensity thresholds fixed at 45/75/110 TSS/h with absolute-TSS>=120 'big' override — matches coaching intuition where a 5-hour Z2 day at ~25 TSS/h is still a 'big' day physiologically even though the per-hour rate is easy
- [05.4-01]: v1 ships narrative only on total PMC series; per_sport sub-series keep narrative=None — users hover the total chart; per-sport narratives would triple narrator work with no v1 UX signal
- [05.4-01]: uPlot tooltip via cursor-idx bridge (hooks.setCursor -> React state -> absolute overlay), not canvas paint — keeps tooltip stylable with CSS vars and Tailwind, accessible, responsive without hand-coding canvas text metrics. Reusable pattern for future uPlot charts (EfficiencyTrend, IntensityDistribution)
- [05.4-01]: Jargon discipline enforced as parametrized tests (not runtime scrubber) — templates are hand-written + deterministic; the ban list runs against every intensity x language x activity_count combo at CI time so the simple-mode contract cannot regress silently
- [05.4-01]: Primary-sport detection uses longest single activity of the day (not first started, not highest TSS) — matches the athlete's own mental model of 'today's workout' when a ride + short brick are both logged
- [05.4-01]: Activity window fetch piggybacks on the PMC date range — one extra grouped SQL per /pmc call, no N+1, no new endpoint. Helper: pmc_narratives.fetch_daily_activity_summaries(db, user_id, since, until)
- [05.4-01]: PMCEntry.narrative is a response-only field (no migration) — computed on read; language toggle doesn't require cache invalidation server-side because narratives don't persist

### Pending Todos

- Legal review needed: consent record retention period after account deletion (before public launch)
- Production deployment: use non-superuser PostgreSQL role for full RLS enforcement (coach user is superuser in dev)
- Consider adding source field to athlete PATCH route FTP history append — currently FTP endpoint has source but PATCH route doesn't (mixed history format)
- IMMEDIATE: Restart Docker Desktop (daemon became unresponsive during 03-01 execution due to disk full); then run `cd backend && docker compose up -d db && alembic upgrade head` to apply c1f8a3d9e2b7 migration
- Coach chat rate limiter: move from in-memory deque to Redis when deploying behind multiple uvicorn workers
- Production readiness: provision ANTHROPIC_API_KEY env var before launch so /coach/* endpoints use Claude rather than the rule-based fallback
- Future: expose a /coach/metrics-trend endpoint so frontend AdvancedMetricsStrip can light up decoupling + durability tiles (currently placeholder)
- Future: add "typecheck": "tsc -p tsconfig.app.json --noEmit" to frontend/package.json — root-level `tsc --noEmit` is a no-op and could hide errors

### Blockers/Concerns

- IMMEDIATE: Docker daemon unresponsive (disk was 100% full during 03-01 execution). Restart Docker Desktop, then run `alembic upgrade head` to apply garmin_credentials migration.
- Garmin Connect Developer Program requires business entity approval -- apply immediately to unblock Phase 3
- Yazio has no official API -- run spike to validate before Phase 8 commits to integration
- [RESOLVED 01-01] TimescaleDB hypertable decision -- decided: activities/daily_metrics will be hypertables from day 1 (done in 01-02 migration)
- [RESOLVED 01-02] AthleteProfile + ConsentRecord relationships -- activated in Phase 2 as planned

## Session Continuity

Last session: 2026-04-20
Stopped at: Phase 5.4 COMPLETE — PMC hover narratives shipped end-to-end. New service pmc_narratives.py with pure-function build_pmc_narrative(entry, prev_entry, activity, language) + classify_intensity(tss, duration_min) + fetch_daily_activity_summaries(db, user_id, since, until). PMCEntry schema gains optional narrative field; /training-load/pmc accepts language query param and returns total-series entries with narratives attached (per_sport narrative=None in v1). Frontend: fetchPMC signature extended, usePMC reads language from useLanguage() context and includes it in React Query key, PMCChart bridges uPlot's hooks.setCursor into React state and renders a 280px-max-width HoverTooltip overlay with date eyebrow + CTL/ATL/TSB pips + narrative paragraph. 60 parametrized unit tests lock the simple-mode jargon contract (FTP/TSS/CTL/ATL/TSB/EF/VI/NP/IF/RPE/Z1-Z7/Coggan/Banister/Seiler/Friel/Mujika/polarized/San Millán all banned across every intensity x language x activity_count combo) and the <=140-char tooltip invariant. Plan described the chart as Recharts (from 04-02) but 04.5 migrated it to uPlot — reconciled via overlay pattern. 319/319 backend tests green (259 pre-existing + 60 new); tsc + build clean. Commits 36f3a88..a0f024f (4 task commits).
Resume file: None
Next: 06 (training-plan-generation) — narrator layer (build_pmc_narrative) is now reusable for per-day plan summaries with the same (entry, prev_entry, activity, language) signature. The uPlot setCursor->React state overlay pattern is the template for EfficiencyTrend + IntensityDistribution tooltips when those need richer per-point context. Phase 5.x foundations (templates, periodization, language routing, post-ride grading, per-day narrator) give the plan generator the full stack.
Pending: Provision ANTHROPIC_API_KEY in production before launch; migrate chat rate limiter to Redis when scaling to multiple workers; expose /coach/metrics-trend endpoint so AdvancedMetricsStrip can show real decoupling + durability values; hook today_available_minutes to the calendar's free-slot field (Phase 6 work) instead of weekly_hours/7; consider server-side language routing for /coach/why + /coach/transparency if Phase 6 needs it (currently rewritten client-side via simpleEvidenceFor); wire advanced_metrics.compute_activity_metrics decoupling result back into Activity.raw_data.decoupling_pct so PostRideReview can surface the Pw:HR drift band; retrospective yesterday-morning review (generate for yesterday when user opens app next morning with no session today); extend narrator to per-sport sub-series when PMC chart exposes per-sport hover interaction
