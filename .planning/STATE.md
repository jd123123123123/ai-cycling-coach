# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-16)

**Core value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.
**Current focus:** Phase 6.1 Wave 3 COMPLETE. 06.1-03 shipped CommandPalette (Cmd+K via cmdk), ContributorsSheet (unified Why-this? drawer merging Contributors/Rationale/Tools-Used; 240ms session-reset; chatToolUseLog live-subscription), retired TransparencyDrawer + WhyAmITired + coach/TransparencyDrawer shim, AI gradient on CoachChat input while streaming, SyncStatusPill masthead freshness indicator, Apple chart polish (PMC uPlot gradient fills + draw-on animation, PolarizedDistribution gradient bars, IntensityDistribution radial gradients + draw-on). Bundle: 569.29 KB gzipped (+6.6% over 534 KB baseline). All 6 Phase 6.1 success criteria verified. Phase 6.1 COMPLETE — ready for Phase 6.2 (DynamicPill, View Transitions, density toggle).

## Current Position

Phase: 6.1 of 9 (UI Overhaul — Apple-disciplined editorial redesign) — ALL 3 WAVES COMPLETE
Plan: 06.1-03 complete (3 tasks; 3 atomic feat commits + 1 metadata commit; vite build green; editorial --color-* palette unchanged; bundle +6.6% over 534 KB baseline)
Status: Phase 6.1 COMPLETE. Waves 1+2+3 all shipped. CommandPalette (Cmd+K, cmdk), ContributorsSheet (unified Why-this? with chatToolUseLog 06-03 invariant preserved), TransparencyDrawer + WhyAmITired retired, AI gradient on CoachChat input, SyncStatusPill masthead freshness, Apple chart polish (PMC/Polarized/Intensity). All 6 phase success criteria verified.
Last activity: 2026-04-22 -- Completed 06.1-03-PLAN.md (CommandPalette + ContributorsSheet + SyncStatusPill + chart polish)

Progress: [██████████████░░] ~90% (Phases 1-6 + 6.1 complete; Phases 6.2, 7, 8, 9 remaining)

## Performance Metrics

**Velocity:**
- Total plans completed: 16
- Average duration: ~50 min
- Total execution time: ~13.0 hours

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
| 06-ai-deep-coaching | 4 (all 4 waves complete) | ~270 min | ~68 min |

**Recent Trend:**
- Last 5 plans: 130 min, 95 min, 55 min, 70 min, 50 min
- Trend: 06-04 at ~50min vs 60-min estimate — came in under because the multi-turn work was already 80% done (useChatStream already sent messages[] in toBackendHistory; backend already threaded them via working_messages). Task 1 reduced to adding MAX_CONTEXT_TURNS constant + slice call + 4 integration tests. Task 2 required more substance: new revert_from_audit in workout_modifier (compensating write with append-only audit), new _handle_undo_last_modification (60-min window + already-undone JSONB check), chat_modification prompt extension, 10 new tests across 2 files, Undo footer UI with language-aware copy + click-guard, CoachChat latest-modification backward scan. 3 atomic commits + metadata. Backend tests now 466/466 (was 452 before this plan).

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
- [06-01]: Authenticated user_id is the ONLY accepted identity in tool_use dispatcher — `user_id`/`uid`/`owner_id`/`userId` keys are stripped from tool_input before handler call. LLM cannot spoof identity
- [06-01]: 5 read-only tools cover Phase 6 analytical surface: fetch_pmc_window, fetch_recovery_trend, fetch_recent_activities, fetch_ftp_history, fetch_planned_workout. Write tools (workout modification) are 06-02's scope, explicitly out of 06-01
- [06-01]: Defense-in-depth clamps on numeric tool inputs — recovery days [1,90], activity limit [1,50] enforced inside dispatcher even though schemas advertise the same range. LLM cannot bypass via raw integer overflow
- [06-01]: run_tool_use_loop hard-caps at max_iterations=5 — after that returns "Analysis exceeded tool-use budget" instead of spinning. Safety net against runaway LLM
- [06-01]: dispatch_tool exceptions become is_error=True tool_result blocks (never raise) — Claude can self-correct on the next turn. Tool failures never crash the loop
- [06-01]: Tool descriptions are LOAD-BEARING — they explicitly name the question patterns each tool answers ("last N weeks" → pmc_window, "why am I tired?" → recovery_trend) so Claude picks well on turn 1. Investment here pays on every call
- [06-01]: system_prompt_for_language(language, context='brief') returns the EXACT prior strings (default context='brief') so /coach/brief prompt cache hashes are preserved. context='chat_analytical' is a new cache entry, not a modification of the old one
- [06-01]: Fallback regex order: last_N_weeks BEFORE why_tired — "why am I tired in the last 2 weeks" routes to the specific range summary, not the generic rationale
- [06-01]: Fallback why-tired path reuses _rule_based_brief rationale verbatim — the answer matches /coach/brief's fallback tone exactly, no new narrative infra
- [06-01]: Fallback last-N-weeks summary uses plain-English direction language in simple mode (building→"fitness has been climbing", overreaching→"digging a deep hole"); technical mode cites Banister by name + raw numbers
- [06-01]: run_tool_use_loop returns str; generate_analytical_chat_stream chunks the result to ~20-char SSE deltas — synchronous-tools-before-stream pattern per Anthropic docs. UI still feels streaming even though tools finish pre-stream
- [06-01]: /coach/chat no longer 503s without ANTHROPIC_API_KEY — streams the deterministic fallback instead. Matches the 05-01 invariant "every LLM path has a rule-based fallback"
- [06-01]: pmc_window_summary slices compute_user_pmc output rather than rewriting EWMA math — single source of truth stays in pmc_service. Slicing by date with ISO-string conversion at the boundary
- [06-01]: recovery_trend_summary flag thresholds — low_hrv @ ≤-10% vs 28d baseline, sleep_debt @ ≥5 short nights in window, rhr_elevated @ ≥+5% vs 28d baseline. Matches advanced_metrics.why_am_i_tired convention
- [06-01]: FTP trend label thresholds — ±2% over 30d → improving/declining/stable. Tighter than PMC's ±1.5 because FTP is a deliberate test/measurement, not an EWMA
- [06-01]: fetch_planned_workout returns the actual PlannedWorkout ORM shape ({id, title, sport, scheduled_date, target_duration_seconds, description, blocks: interval_structure}), not the plan's aspirational template_id/target_tss shape — the Phase 4 schema doesn't carry template_id/target_tss. Phase 7 may extend
- [06-01]: generate_analytical_chat_stream is a new function, not a mutation of coach_chat_stream — keeps the old 05.x path available for any future non-analytical chat surface and makes 06-01's addition clearly reversible
- [06-02]: Template cascades ordered by INTENSITY CATEGORY, NOT raw TSS — z2_long_180 (135 TSS) is not "harder" than tempo_3x10 (70 TSS). Rank ladder: rest=0 < recovery=1 < endurance=2 < tempo=3 < sweet_spot=4 < threshold=5 < vo2=6. Endurance templates grouped by volume before the intensity ladder begins at tempo_3x10. Monotonicity asserted by test_harder_cascade_monotonic_intensity
- [06-02]: Write-tool ValueError → {success: False, reason: ...} (NEVER raises) — keeps Claude's tool-use loop healthy; mirrors 06-01's is_error recovery but at a softer severity because the LLM can correct the input on the next turn. Only unknown tool_name still raises (dispatch_tool contract)
- [06-02]: Already-trained-today guard lives in the TOOL HANDLER (_handle_modify_planned_workout), NOT in apply_modification — the modifier stays pure (no DB coupling); handler's guard fires BEFORE calling the modifier; on rejection NO PW mutation and NO audit row (mirrors resolve_and_prescribe's post_ride override)
- [06-02]: Rails context sourced from latest CoachBrief.evidence.rails_context (more accurate intensity_ceiling than profile alone). Profile-only fallback when no brief. Injury_flag ALWAYS sourced from profile (real-time state overrides stale brief's flag)
- [06-02]: PlannedWorkout.template_id added as NULLABLE — legacy rows stay valid; modifier falls back to z2_endurance_60 when null. Avoids a backfill migration
- [06-02]: blocks_source column — 'ai_prescribed' (default) / 'user_modified' (post-mutation). Marker for future undo affordance in 06-04; rejected modifications do NOT flip the flag (no audit row either)
- [06-02]: Audit row verdict='modification' + model_used='tool-use-modify' — distinguishes modification rows from AI-brief rows in the same coach_briefs table. /coach/brief cache query filters on prescribed_workout.isnot(None) so modification rows are invisible to the brief path
- [06-02]: evidence.modification carries rails_context_at_time snapshot — post-hoc explainability even if profile flips injury_flag later
- [06-02]: chat_modification prompt context SEPARATE from chat_analytical — /coach/chat analytical-only queries keep their warm cache; modification queries break to a new cache entry. Alternative of always-embedding the write tool would have invalidated existing chat_analytical caches across all users
- [06-02]: _cascade_toward_duration stays within category when shorten/lengthen exceed the ±15% tolerance band — shortening a Z2 session stays in the Z2 family (just shorter); going outside the category would confuse the user
- [06-02]: Mocked DB tests inspect SQL text to route queries (planned_workouts / activities / athlete_profiles / coach_briefs) — works cleanly without a live Docker/Postgres; every ORM interaction still exercises the real SELECT statement. Production smoke must re-run with Docker up to verify TimescaleDB-specific cast(Activity.started_at, Date) semantics
- [06-03]: Backend tool_use_start / tool_use_result frames ship as SSE `event:` lines (not a new `type:` value in existing JSON data) — 05-02 clients that ignore unknown event: lines still work; new clients route on event type. Fully backward-compatible SSE extension
- [06-03]: run_tool_use_loop (str return) UNCHANGED; added run_tool_use_loop_events async generator alongside — preserves all 13 existing tests without modification. Trading tiny loop-body duplication for zero regression risk
- [06-03]: generate_analytical_chat_stream now consumes run_tool_use_loop_events and emits tool_use_start/result frames during the loop (was previously tools-then-stream). Frontend UI can render "Analyzing..." intermediate state — previously impossible because no frame was sent until tools finished
- [06-03]: Inline tool cards live in messages[] as role='tool' synthetic entries (not a separate collection) — renders in chronological order next to assistant narration, matches the user's mental model of chat history. toBackendHistory strips role='tool' before sending so tool cards are UI-only artefacts
- [06-03]: Module-singleton (frontend/src/lib/chatToolUseLog.ts) bridges CoachChat → TransparencyDrawer without lifting state to the shell — preserves the 05-02 ephemeral-chat-inside-CoachChat invariant. Subscribe/snapshot pattern, not context
- [06-03]: Write-tool success side-effects (React Query invalidation of planned-workouts + coach-brief + onModification callback) live inside useChatStream's tool_use_result handler, not in the caller — single source of truth; new write tools just need to pick their invalidation keys here
- [06-03]: IntervalRibbon reused directly (not extracted to shared path) — existing dashboard/IntervalRibbon is already language-aware with zero dashboard coupling; extraction would be cosmetic churn
- [06-03]: TEMPLATE_LABELS hand-mapped in WorkoutModifiedCard (12 templates × simple/technical) — backend template names aren't yet exposed via API; hand-map is pragmatic for this scope. Unknown template_id falls back to key-to-title-case humanization so a new backend template renders readably without a frontend release
- [06-03]: Flash "Workout updated" acknowledgement inline (2.4s forest bar below drawer header), NOT sonner — one-off toast isn't worth a new dependency in a bundle-sensitive area. Revisit if 06-04+ needs more toast surfaces
- [06-03]: TransparencyDrawer ToolsUsedSection subscribes while open — live updates mean opening the drawer mid-conversation shows tools as they fire (transparency, not replay)
- [06-03]: Session reset fires 240ms after drawer close (post-slide-animation) — wiping state synchronously on close caused a flash of empty-state copy during fade-out
- [06-03]: useChatStream stores tool result as Record<string, unknown>; cards cast narrowly at render time — keeps the hook generic so new backend tools don't require hook changes, just a new render branch in CoachChat's ToolBubble dispatch
- [06-03]: modify_planned_workout success=false (already-trained-today / rails-rejection) renders a friendly ack card (not a modification card) — preserves user trust by not falsely claiming success
- [06-04]: MAX_CONTEXT_TURNS=10 exported from useChatStream — five full user/assistant exchanges fits follow-up context without prompt-cache churn; client-side deterministic truncation; backend trusts the client (stateless server, matches 05-02 ephemeral-chat invariant)
- [06-04]: Undo eligibility window = 60 min server-side even though UI affordance (latest-card-only) already enforces session-scoping client-side — defence-in-depth so a stale drawer cannot reach back into a prior session's modification
- [06-04]: Undo flows through chat (LLM narrates "Undo that" intent, calls undo_last_modification), NOT a direct /coach/undo API — single protocol for every PlannedWorkout mutation, uniform SSE frames, uniform React Query invalidation, uniform Tools Used transparency entries
- [06-04]: Undo re-materialises blocks at CURRENT FTP, not the FTP at modification time — if athlete tested FTP between modify and undo, restored watts reflect the new FTP. Matches 05-01's server-side watts authority (blocks always derive from today's FTP, never frozen)
- [06-04]: Append-only undo audit — revert_from_audit INSERTs new verdict='modification_undo' row with evidence.modification_undo.{original_audit_id, reverted_from, restored_to, date}; original verdict='modification' row is NEVER mutated; double-undo detected via second SELECT on original_audit_id (JSONB astext comparison), no status column needed
- [06-04]: model_used='tool-use-undo' on undo audit rows — distinct from 06-02's 'tool-use-modify' so future analytics can split modification vs undo queries cleanly ("how often do users undo their modifications?")
- [06-04]: revert_from_audit(audit_row, db, ftp_w) — explicit ftp_w parameter (plan's signature omitted it). Keeps workout_modifier's DB coupling minimal (PlannedWorkout + CoachBrief only — AthleteProfile stays isolated to the coach_tools handler layer)
- [06-04]: Undo preserves CURRENT indoor flag (does not restore from before snapshot) — indoor is a per-session user preference, not a modification-driven field; reverting it would surprise-toggle outdoor on users who toggled after modifying
- [06-04]: Chat_modification prompt explicitly forbids calling undo + modify in the same response — pick one based on intent. Prevents audit-row racing + user confusion when the drawer renders both a reverted card and a new modification card back-to-back
- [06-04]: Undo button click-guard is LOCAL (WorkoutModifiedCard.undoClicked) — private per-card state flips on first click and disables button permanently for that card's lifetime. Parent doesn't need per-card tracking; card remounts on session reset
- [06-04]: Tool cards (role='tool') filtered at BOTH ends — frontend's toBackendHistory drops them before send AND backend's run_tool_use_loop working_messages loop drops anything not in ('user','assistant'). Defence-in-depth so a future bug in either side doesn't leak synthetic UI messages into the Anthropic payload
- [06.1-01]: Vitest + @testing-library/react NOT installed — test stubs created as PENDING files with commented-out assertions; activating requires npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom + vite.config.ts test block + src/test-setup.ts importing @testing-library/jest-dom
- [06.1-01]: springs map uses precomputed stiffness/damping pairs (not raw response/damping fractions) — numbers come from k=(2π/response)² and c=2×ζ×√k so components stay declarative; formula documented in motion.ts comment for future tokens
- [06.1-01]: SideSheet left-edge radius uses CSS clamp(0px, calc((100vw - 767px) * 9999), var(--radius-xl)) — eliminates a JS matchMedia listener; renders --radius-xl on ≥768px viewports, 0px below
- [06.1-01]: BentoGrid mobile reflow via module-level injected <style data-id="bento-grid-responsive"> targeting [data-bento-cell] — keeps primitive self-contained without Tailwind breakpoint coupling
- [06.1-01]: Pre-existing TS errors in 7 untracked files (DailyInsight, WeeklySportMetrics, PolarizedDistribution, PrescribedWorkoutCard, ReadinessContributors, focusBadge, LastWeekRecap) are not Wave 1 regressions; vite build succeeds; should be resolved during Wave 2 when those files are modified
- [06.1-02]: DashboardShell API changed from hero/kpiStrip/pmc/collapsedSections slots to children+stickyBar+tabs — new multi-page shell usage pattern; all pages now use <DashboardShell> without old slot props
- [06.1-02]: Tab URL persistence: useSearchParams ?tab= URL param + replace:true prevents back-button accumulation; valid values: today|week|trends|plan; default: 'today'
- [06.1-02]: ReadinessHero data-testid="readiness-hero" is PERMANENT — IntersectionObserver target for StickyReadinessBar; must survive all future ReadinessHero edits including Wave 3 ContributorsSheet refactor
- [06.1-02]: ReadinessHero→SideSheet→BiometricsDetail wiring is TEMPORARY — Wave 3 ContributorsSheet replaces it; see 06.1-02-SUMMARY.md for exact replacement instructions
- [06.1-02]: StickyReadinessBar reads React Query via same hooks as ReadinessHero — zero new fetches (deduplication); graceful no-op when readiness-hero testid absent (Task 1 state)
- [06.1-02]: WeekStrip variant prop: 'full' (default) | 'mini' (7-dot compact ≤64px, dot-click → ?tab=plan via useSearchParams)
- [06.1-02]: TrendsTab PMCChart wrapped in maxHeight:320px container — non-invasive cap; no PMCChart internal changes; Wave 3 chart polish pass should adjust
- [06.1-03]: TransparencyDrawer + WhyAmITired fully retired — ContributorsSheet absorbs all three surfaces; coach/TransparencyDrawer shim deleted (zero consumers confirmed via grep)
- [06.1-03]: uPlot PMC draw-on animation via canvas.style.opacity fade (not clip-based left-to-right reveal) — uPlot's draw pipeline is not cleanly interruptible; opacity fade delivers equivalent impact with zero frame overhead
- [06.1-03]: SyncStatusPill click navigates to /settings — simple and extensible; per-provider endpoint deferred to future phase
- [06.1-03]: ActivityRead type extended with max_hr + date fields — both exist in backend schema; absence was causing TS errors in new Wave-2 untracked components

### Roadmap Evolution

- Phase 6.1 inserted after Phase 6 (2026-04-22): UI Overhaul — Apple-disciplined editorial redesign. Driven by REDESIGN-BRIEF.md synthesizing 4 research tracks (ui-reduce-scroll-patterns, competitor-pain-points, apple-2027-design-language, retention-psychology). Scope = P0+P1 from brief §5. Design-direction path = B (editorial voice, Apple structural discipline). Run /gsd:plan-phase 06.1 to break into plans.

### Pending Todos

- Legal review needed: consent record retention period after account deletion (before public launch)
- Production deployment: use non-superuser PostgreSQL role for full RLS enforcement (coach user is superuser in dev)
- Consider adding source field to athlete PATCH route FTP history append — currently FTP endpoint has source but PATCH route doesn't (mixed history format)
- IMMEDIATE: Restart Docker Desktop (daemon became unresponsive during 03-01 execution due to disk full); then run `cd backend && docker compose up -d db && alembic upgrade head` to apply c1f8a3d9e2b7 migration
- Coach chat rate limiter: move from in-memory deque to Redis when deploying behind multiple uvicorn workers
- Production readiness: provision ANTHROPIC_API_KEY env var before launch so /coach/* endpoints use Claude rather than the rule-based fallback
- Future: expose a /coach/metrics-trend endpoint so frontend AdvancedMetricsStrip can light up decoupling + durability tiles (currently placeholder)
- Future: add "typecheck": "tsc -p tsconfig.app.json --noEmit" to frontend/package.json — root-level `tsc --noEmit` is a no-op and could hide errors
- [RESOLVED 06-04]: multi-turn memory + undo affordance shipped. MAX_CONTEXT_TURNS=10 client-side slice in toBackendHistory. undo_last_modification tool + revert_from_audit + append-only modification_undo audit row + Undo button on latest WorkoutModifiedCard.
- Before production cutover: restart Docker, run `alembic upgrade head` to apply b9c4d1e8f2a3 (planned_workout modification fields), smoke-test `/coach/chat` via curl with a modification intent AND visit the chat drawer in a browser to see the WorkoutModifiedCard render live
- Docker daemon still unresponsive (carried from 03-01) — test execution moved to local python3.13 venv at backend/.venv. Every DB interaction in new code is mocked in unit tests so no live DB required. Before deploying, restart Docker and run integration smoke via `docker compose exec backend pytest` + `curl -N /coach/chat`
- Frontend node_modules/.bin empty on this machine (individual packages present in node_modules/typescript/bin + node_modules/vite/bin) — worked around by invoking bin files directly. Fresh `npm ci` would fix but wasn't run inside plan execution. Harmless for code; just tooling ergonomics.

### Blockers/Concerns

- IMMEDIATE: Docker daemon unresponsive (disk was 100% full during 03-01 execution). Restart Docker Desktop, then run `alembic upgrade head` to apply garmin_credentials migration.
- Garmin Connect Developer Program requires business entity approval -- apply immediately to unblock Phase 3
- Yazio has no official API -- run spike to validate before Phase 8 commits to integration
- [RESOLVED 01-01] TimescaleDB hypertable decision -- decided: activities/daily_metrics will be hypertables from day 1 (done in 01-02 migration)
- [RESOLVED 01-02] AthleteProfile + ConsentRecord relationships -- activated in Phase 2 as planned

## Session Continuity

Last session: 2026-04-22 — Phase 6.1 Wave 3 COMPLETE (06.1-03-PLAN.md)
Stopped at: Phase 6.1 ALL 3 WAVES COMPLETE. Wave 3 commits: (1) bccae39 feat(06.1-03): CommandPalette (Cmd+K) + initialDraft prop on CoachChat [prior executor]. (2) b4ffb08 feat(06.1-03): ContributorsSheet + retire TransparencyDrawer/WhyAmITired + SyncStatusPill + AI-gradient chat input. (3) df39755 feat(06.1-03): Apple chart polish on PMC + Polarized + Intensity + Wave 3 ship-green. Build: vite build green (569.29 KB gzipped, +6.6% over 534 KB baseline). Editorial --color-* palette unchanged (19 variables). cmdk only new dep.
Resume file: None
Next: Phase 6.2 (DynamicPill, View Transitions, density toggle, weekly-recap ritual). Token vocabulary stable from 6.1 — safe to consume in 6.2.
Pending: Per-provider sync endpoint (SyncStatusPill currently single-provider); WeekStrip URL-driven week selection for CommandPalette "Last/This/Next week" items; test infra install (vitest + @testing-library/react) to activate CommandPalette.test.tsx stubs; Provision ANTHROPIC_API_KEY in production before launch; migrate chat rate limiter to Redis when scaling past one uvicorn worker; expose /coach/metrics-trend endpoint so AdvancedMetricsStrip can show real decoupling + durability values; restart Docker daemon + `alembic upgrade head` (b9c4d1e8f2a3) + smoke-test `/coach/chat` with modification intent before production deploy; Fresh `npm ci` in frontend to fix empty .bin directory ergonomics.
