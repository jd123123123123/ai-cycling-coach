# Roadmap: AI Cycling Coach

## Overview

This roadmap delivers an AI-powered multi-sport training platform in 9 phases, progressing from foundational infrastructure through pure computation, data ingestion, visualization, AI coaching (split into core and deep capabilities), periodization, nutrition, and finally social/gamification. The structure follows strict dependency ordering: the training engine is pure math built first with synthetic data, Garmin data feeds it, the dashboard visualizes it, and AI coaching interprets it. Nutrition is independent and designed as an enhancement. Social features come last because they need an established user base and carry the highest risk of harm if rushed.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation + Auth** - Multi-user accounts, athlete profiles, GDPR-compliant data architecture
- [x] **Phase 2: Training Engine** - Pure computation for TSS, CTL/ATL/TSB, zones, and FTP tracking
- [x] **Phase 3: Garmin Data Integration** - Sync activities and biometrics from Garmin with swappable abstraction layer
- [x] **Phase 4: Dashboard + Visualization** - Body status, PMC charts, training calendar, and workout previews
- [x] **Phase 5: AI Coaching Core** - Daily brief, chat interface, safety guardrails, and training recommendations
- [ ] **Phase 6: AI Deep Coaching** - On-demand analysis and workout modification via conversation
- [x] **Phase 6.1: UI Overhaul — Apple-disciplined editorial redesign (INSERTED)** - Segmented dashboard tabs, bento grid, side sheets, sticky readiness bar, command palette, spring motion tokens, applied through the editorial visual voice
- [x] **Phase 6.2: Whoop-grade redesign of untouched surfaces (INSERTED)** - Sharpen the editorial system across auth pages, Garmin connect, PMC chart, polarized distribution, week strip, recent activities, sync button, and trends/week tabs. Reclaim amber for caution-only, consolidate zone palettes, codify number presentation utilities, deprecate `.serif-caps` as a third numeral idiom.
- [ ] **Phase 7.0: Periodization engine + week view shell** - Friel macrocycle + Issurin block mesocycles + Seiler weekly TID, week-view tab, weekly preface rationale
- [x] **Phase 7.05: One-Screen Truth — subtractive Whoop redesign (INSERTED)** - Today: 6 widgets → 3 primitives (state / trajectory / prescription). Week: 14 elements → 8 minimal pills + tap-to-expand SideSheet. Honesty layer (`<UncertainValue>` for thin data). Bike/Run sport-filtered version. **Negative bundle delta target.**
- [ ] **Phase 7.06: Activity detail with streams (INSERTED)** - Click a bike/run from RecentActivities → SideSheet shows headline values (NP/IF/TSS/EF/work/elev) + time-series graphs (HR, power+FTP%, elevation/incline, pace). Backend `Activity.sample_streams` + `GET /activities/{id}/streams` endpoint extends Garmin sync. Honesty rail: empty-state for missing streams.
- [ ] **Phase 7.1: Readiness-driven daily adaptation** - HRV-SWC-gated multi-signal adapter, soft-swap → hard-deload tier system, audit trail extension
- [ ] **Phase 7.2: Rationale + taper/race polish** - Per-day rationale generation, Bosquet/Mujika taper, template library expansion 12 → ~30
- [ ] ~~**Phase 7: Periodization + Workout Generation**~~ — split into 7.0/7.1/7.2 (research 2026-05-04)
- [ ] **Phase 8: Nutrition Integration** - Manual nutrition logging, fueling advice, and nutrition-aware adaptation
- [ ] **Phase 9: Social + Retention Rituals** - Packs (4-12 training partners), user-chosen rivals, morning/post-ride/Sunday rituals, consistency streaks, pack-kudos — all grounded in Self-Determination Theory (autonomy/competence/relatedness); explicit dark-pattern ban list (no global leaderboards, no streak ransom, no variable-ratio rewards, no guilt copy)

## Phase Details

### Phase 1: Foundation + Auth
**Goal**: Users can create accounts, set up athlete profiles with training goals, and have their data fully isolated from other users
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03
**Success Criteria** (what must be TRUE):
  1. User can create an account with email/password and log in across browser sessions
  2. User can set up athlete profile with FTP, weight, zones, and weekly availability
  3. User can set training goals (target FTP, target event date, weekly hours)
  4. Two different users see only their own data with no cross-contamination
  5. GDPR consent flow is presented at signup and user can request data deletion
**Plans**: 4 plans

Plans:
- [x] 01-01-PLAN.md -- Backend scaffold, Docker, async DB, User model, JWT auth endpoints
- [x] 01-02-PLAN.md -- Athlete profiles, consent records, goals CRUD, RLS, hypertables
- [x] 01-03-PLAN.md -- React frontend scaffold, auth UI, session management
- [x] 01-04-PLAN.md -- Frontend consent flow, profile setup, end-to-end verification

### Phase 2: Training Engine
**Goal**: The system can compute accurate per-sport training load metrics, track fitness/fatigue/form, and calculate power/pace zones from athlete data
**Depends on**: Phase 1
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-07, TRAIN-08
**Success Criteria** (what must be TRUE):
  1. System calculates correct TSS for cycling (power-based), running (pace-based), and gym (HR-based) from activity data
  2. System computes CTL, ATL, and TSB using EWMA and displays per-sport training load without naively combining sports
  3. Power zones (Coggan 7-zone) and pace zones (Seiler 3-zone) are auto-calculated from current FTP/threshold
  4. FTP history is stored with timestamps and progression is visible as a timeline
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md — TDD: Sports science pure functions (TSS, NP, CTL/ATL/TSB, zones)
- [x] 02-02-PLAN.md — Activity ORM model, CRUD API with auto-TSS calculation
- [x] 02-03-PLAN.md — PMC endpoint, zone calculation API, FTP update with history

### Phase 3: Garmin Data Integration
**Goal**: The system automatically syncs real athlete data from Garmin Connect, feeding the training engine with activities and biometrics
**Depends on**: Phase 2
**Requirements**: DATA-01, DATA-02, DATA-04
**Success Criteria** (what must be TRUE):
  1. User can connect their Garmin account and activities sync automatically without manual intervention
  2. Sleep score, HRV, body battery, and training status are pulled from Garmin and stored per-user
  3. Synced activities flow through the training engine and update CTL/ATL/TSB automatically
  4. Garmin integration uses an abstraction layer that can swap the unofficial library for the official API without changing business logic
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md — GarminCredential + DailyMetric models, encryption, GarminProvider abstraction layer
- [x] 03-02-PLAN.md — Garmin data mapper, activity sync service, daily metrics sync service
- [x] 03-03-PLAN.md — REST API endpoints, APScheduler background sync, main.py integration

### Phase 4: Dashboard + Visualization
**Goal**: Users have a beautiful daily touchpoint showing their body status, training load history, calendar, and workout details at a glance
**Depends on**: Phase 3
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. User sees a morning dashboard with sleep score, HRV, body battery, and readiness displayed clearly
  2. PMC chart shows CTL/ATL/TSB over time with interactive hover revealing daily values
  3. Training calendar displays week and month views with planned vs completed workouts and supports drag-drop rearrangement
  4. User can preview a workout's interval structure with power/pace targets before executing it
  5. All dashboard views are usable on mobile phones without horizontal scrolling or broken layouts
**Plans**: 4 plans

Plans:
- [x] 04-01-PLAN.md — Backend /daily-metrics endpoint, React Query setup, DashboardShell + BodyStatusCard
- [x] 04-02-PLAN.md — PMC chart (Recharts) with sport filter + custom tooltip
- [x] 04-03-PLAN.md — PlannedWorkout model + CRUD API, training calendar with drag-drop rescheduling
- [x] 04-04-PLAN.md — Workout interval preview modal + mobile-responsive audit across all dashboard surfaces

### Phase 5: AI Coaching Core
**Goal**: Users receive AI-powered daily training recommendations and can chat with an intelligent coach, with safety guardrails preventing dangerous advice
**Depends on**: Phase 4
**Requirements**: COACH-01, COACH-02, COACH-03, COACH-08
**Success Criteria** (what must be TRUE):
  1. Dashboard shows a morning daily brief with body status summary and a personalized training recommendation
  2. Recommendation offers multiple options (rest, easy, moderate, push) with reasoning based on current body state
  3. User can open a chat interface and have a coaching conversation with streaming responses
  4. AI refuses to recommend training through injury, does not suggest overtraining, and never gives ED-triggering nutrition advice
  5. Safety guardrails enforce hard-coded TSS caps relative to CTL and intensity ceilings based on recovery state
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — Coach backend: advanced_metrics, safety_rails, coach_service (Claude tool-use + rule-based fallback), endpoints, migration
- [x] 05-02-PLAN.md — Coach UI: CoachBrief + CoachChat streaming drawer + WhyAmITired causal modal + TransparencyDrawer

### Phase 6: AI Deep Coaching
**Goal**: Users can ask analytical questions and modify workouts through natural conversation, getting the depth of a real coaching relationship
**Depends on**: Phase 5
**Requirements**: COACH-04, COACH-05
**Success Criteria** (what must be TRUE):
  1. User can ask "why am I tired?" and receive an analysis referencing their actual sleep, HRV, training load, and nutrition data
  2. User can ask "analyze my last 4 weeks" and receive a structured summary of training patterns, load progression, and recovery trends
  3. User can modify workouts via chat ("I only have 45 min", "make it harder", "swap to indoor") and see the updated workout reflected
**Plans**: 4 plans

Plans:
- [ ] 06-01-PLAN.md — Analytical tool-use backend: tool registry (incl. nutrition stub) + aggregate services + /coach/chat tool-use loop with deterministic fallback
- [ ] 06-02-PLAN.md — Workout modification tool with rails-gated template cascades and append-only audit
- [ ] 06-03-PLAN.md — Chat UI upgrades: tool-use lifecycle indicators, WorkoutModifiedCard, AnalyticalAnswerCard, Tools Used transparency
- [ ] 06-04-PLAN.md — Multi-turn context + undo_last_modification tool with compensating audit

**Wave Structure (sequential — shared file ownership on coach_tools.py / coach_prompt.py / api/coach.py / schemas/coach.py):**

| Wave | Plans | Depends On | Notes |
|------|-------|------------|-------|
| 1 | 06-01 | — | Backend tool registry + tool-use loop + SSE endpoint contract |
| 2 | 06-02 | 06-01 | Adds modify_planned_workout tool to registry + rails matrix + audit |
| 3 | 06-03 | 06-01, 06-02 | Frontend consumes stable SSE contract; no backend changes |
| 4 | 06-04 | 06-03 | Multi-turn context + undo tool + explicit-ftp-param design |

### Phase 6.1: UI Overhaul — Apple-disciplined editorial redesign (INSERTED)
**Goal**: Reduce scrolling, answer "should I train today, and how hard?" above the fold, drill into detail via side sheets not new routes, and unify transparency UX — all while preserving the editorial visual voice (amber/forest/paper, serif numerals, masthead).
**Depends on**: Phase 6
**Requirements**: DASH-01, DASH-05 (refines)
**Success Criteria** (what must be TRUE):
  1. Above-the-fold of Today view contains only ReadinessHero + PrescribedWorkoutCard + mini WeekStrip (nothing else in top 600px viewport)
  2. Dashboard offers Today / Week / Trends / Plan segmented tabs — each view fits its core question without scrolling past one screen on a 1440×900 window
  3. Activity row click, biometrics detail, and chart-expand all use a unified SideSheet primitive (no new routes, preserves dashboard scroll/filter state)
  4. Sticky 56px readiness summary appears when the user scrolls past ReadinessHero
  5. Cmd+K command palette navigates to any week, activity, or coach question in ≤2 keystrokes
  6. Spring-physics motion tokens and Apple Intelligence gradient land as Tailwind theme additions; editorial amber/forest palette preserved throughout
**Plans**: 3 plans

**Wave Structure (sequential — shared file ownership on DashboardShell / DashboardPage / ReadinessHero / CoachChat):**

| Wave | Plans | Depends On | Notes |
|------|-------|------------|-------|
| 1 | 06.1-01 | — | Tailwind v4 @theme extensions (radii/shadows/blur/easing/AI gradient) + motion.ts springs map + SideSheet/SegmentedTabs/BentoGrid primitives. No dashboard surfaces touched. |
| 2 | 06.1-02 | 06.1-01 | Today/Week/Trends/Plan segmented tabs + component relocations + IconRail + StickyReadinessBar + first SideSheet consumers (RecentActivities row, ReadinessHero contributors) + 4 new route shells (/calendar /activities /coach /settings). |
| 3 | 06.1-03 | 06.1-01, 06.1-02 | CommandPalette (cmdk) + unified ContributorsSheet (merges TransparencyDrawer + WhyAmITired + biometrics, preserves 06-03 chatToolUseLog live-subscription) + AI gradient on CoachChat streaming + SyncStatusPill + chart Apple-polish pass on PMC/Polarized/Intensity. |

Plans:
- [ ] 06.1-01-PLAN.md — Tokens + primitives (SideSheet, SegmentedTabs, BentoGrid, Tailwind theme extensions, motion.ts springs, AI gradient utility)
- [ ] 06.1-02-PLAN.md — Dashboard restructure (segmented tabs, component relocations, IconRail, StickyReadinessBar, SideSheet consumers, 4 new route shells)
- [ ] 06.1-03-PLAN.md — Polish + power (CommandPalette, unified ContributorsSheet, AI gradient on CoachChat, SyncStatusPill, chart polish on PMC + Polarized + Intensity)

**Notes**: Scope derived from `.planning/research/REDESIGN-BRIEF.md` §5 P0+P1. P2 polish items (View Transitions, DynamicPill, weekly recap ritual, density toggle) defer to optional Phase 6.2. Design-direction choice = Path B: editorial voice + Apple structural discipline. Frontend-only — no backend changes. Bundle budget: ≤ +10% over 534 KB gzipped baseline (cmdk is the only new dep, ~4 KB).

### Phase 6.2: Whoop-grade redesign of untouched surfaces (INSERTED)
**Goal**: Apply Whoop-grade visual discipline (dominant-numeral hierarchy, monochrome surface + reclaimed amber-as-caution-only, codified number presentation, single zone palette) to every dashboard surface and entry-point page that the today-runthrough did not already redo, so a logged-out → onboarding → dashboard flow feels like one app instead of two.
**Depends on**: Phase 6.1, today-runthrough (commits af026eb..418d4f5)
**Requirements**: DASH-01, DASH-05 (extends 6.1 across all surfaces)
**Success Criteria** (what must be TRUE):
  1. Auth pages (LoginPage, RegisterPage) and GarminConnectPage use the same paper/rule/forest/ink token system as the dashboard — no Tailwind light-mode color literals remain (`bg-gray-50`, `text-blue-600`, etc. eliminated)
  2. Amber appears ONLY on caution/warning surfaces (rule-mark, alert states); decorative amber eyebrows in CoachBrief, PMCChart, RecentActivities are gone
  3. PolarizedDistribution and WeekStrip render via shared `--color-zone-N` tokens; no inline RGBA color literals remain in either component
  4. Number presentation utilities (`utils/format.ts` for dominant-numeral + tiny-unit, `utils/delta.ts` for sign-disciplined polarized accent, `<Sparkline>` primitive shared across surfaces) exist and are consumed by every numeric-rendering component
  5. `.serif-caps` class is removed from the codebase; Fraunces is reserved for `.num-display` only
  6. Bundle gzipped size ≤ +5% over post-today-runthrough baseline; no new dependencies beyond what the redesign strictly requires

**Notes**: Scope derived from `.planning/phases/06.2-whoop-grade-redesign/06.2-RESEARCH.md` (~600-line design language doc). Frontend-only — zero backend changes. Reference apps: Whoop, Strava, Athletica, Intervals.icu (observed, not fetched). Explicit rejected directions: no neumorphism, no decorative gradients/glow, no gamification badges, no dark-mode-only — sharpen the existing system, don't replace it.

### Phase 7: Periodization + Workout Generation
**Goal**: The AI builds and adapts multi-week training plans with structured workouts, dynamically adjusting daily sessions based on athlete state
**Depends on**: Phase 6
**Requirements**: TRAIN-04, TRAIN-05, TRAIN-06
**Success Criteria** (what must be TRUE):
  1. AI generates a multi-week periodized mesocycle (base/build/peak/recovery) aligned to the user's goal event and current fitness
  2. System adapts the daily plan based on sleep, HRV, body battery, nutrition, and recent training load — swapping or modifying today's session
  3. AI generates structured workouts with specific power/pace targets for cycling, running, and gym sessions
  4. Generated workouts respect current FTP/threshold values and use appropriate interval structures
**Plans**: Split into 7.0 / 7.1 / 7.2 per .planning/phases/07-periodization-workout-generation/07-RESEARCH.md §10.

#### Phase 7.0: Periodization engine + week view shell
**Goal**: Friel macrocycle + Issurin block mesocycles + Seiler weekly TID, week-view tab, weekly preface rationale.
**Depends on**: Phase 6.2
**Plans**: 5 plans in 4 waves
Plans:
- [ ] 07.0-PLAN-01.md — AthleteProfile target_event_date/type/priority migration + ProfileSetupPage form fields
- [ ] 07.0-PLAN-02.md — MesocyclePlan model + mesocycle_generator service (Friel/Issurin/Seiler) + tests
- [ ] 07.0-PLAN-03.md — Weekly rationale generator (rule-based, language-aware) + jargon-discipline tests
- [ ] 07.0-PLAN-04.md — GET /weeks/current endpoint + useCurrentWeek React Query hook
- [ ] 07.0-PLAN-05.md — WeekTab redesign (WeekPreface + DayPlanCard) + visual checkpoint

#### Phase 7.05: One-Screen Truth — subtractive Whoop redesign
**Goal**: Subtractive redesign. Above 600px viewport on Today, athlete sees only 3 primitives (state / trajectory / prescription). Week tab collapses 14 elements to 8 minimal pills + analytics drawer. Bike/Run adopt same layout. Honesty layer ({UncertainValue}) refuses to fabricate numbers when data is thin. Hard rail: negative bundle delta vs current HEAD.
**Depends on**: Phase 7.0
**Plans**: 5 plans in 4 waves
Plans:
- [ ] 07.05-PLAN-01.md — UncertainValue primitive + confidence.ts utility (no consumers; foundation)
- [ ] 07.05-PLAN-02.md — Today tab subtractive collapse: 3 primitives + TrajectorySentence + delete DailyInsight/KpiStripCompact/BodyBriefing
- [ ] 07.05-PLAN-03.md — Week tab subtractive collapse: 1 preface + 7 minimal pills + SideSheet detail + analytics drawer
- [ ] 07.05-PLAN-04.md — SportTab (Bike + Run) adopt 3-primitive layout reusing TrajectorySentence + UncertainValue
- [ ] 07.05-PLAN-05.md — Bundle audit (git worktree, negative delta required) + 7-rail check + visual checkpoint

#### Phase 7.1: Daily readiness-driven adaptation (planned)
Vesterinen SWC gate + multi-signal voting → today's session swap. Estimated 3-4 plans.

#### Phase 7.2: Rationale LLM polish + taper / race-prep (planned)
LLM-polished per-week and per-day rationales (replacing Plan 03 deterministic) + Mujika taper countdown + template library expansion (12→~30). Estimated 3-4 plans.

### Phase 8: Nutrition Integration
**Goal**: Users can log nutrition and receive fueling advice that integrates with training recommendations
**Depends on**: Phase 5
**Requirements**: DATA-03, COACH-06, COACH-07
**Success Criteria** (what must be TRUE):
  1. User can manually log meals with calories, macros, and timing as a fallback for Yazio integration
  2. AI provides pre-training fueling recommendations based on the planned workout (e.g., "high carb day, aim for 3g/kg before intervals")
  3. AI adjusts training intensity when nutrition data shows the athlete is under-fueled
**Plans**: TBD

Plans:
- [ ] 08-01: TBD

### Phase 9: Social + Retention Rituals
**Goal**: Serious athletes keep showing up because the app helps them *become who they want to be*, not because it exploits them. Relatedness via small packs, competence via visible progress, autonomy via choices with rationale. Grounded in `.planning/research/retention-psychology.md`.

**Depends on**: Phase 5 (needs brief + chat), Phase 6.1 (needs the structural UI surfaces)
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04, SOCIAL-05, SOCIAL-06, COACH-09

**Research anchors:**
- `.planning/research/retention-psychology.md` — 12 mechanisms, dark-pattern bans, rituals, citations
- `.planning/research/REDESIGN-BRIEF.md` §6 — concrete ruleset specifically for Phase 9
- `.planning/research/competitor-pain-points.md` Theme D — "the social feed is decaying" + what actually works

**Success Criteria** (what must be TRUE):
  1. **Pack (not feed)**: user joins or creates a pack of 4–12 training partners; sees *their* activity only, chronological (never algorithmic), opt-in per-ride share
  2. **Kudos**: one-tap affirmation on any ride in the pack, no daily limit on free tier, no push-spam (batched daily digest at most)
  3. **Rivals**: user chooses 1–3 rivals by user search (not auto-suggest); weekly side-by-side shows volume + PRs filtered by user's age/FTP-per-kg cohort; no global rank number ever
  4. **Consistency streak**: streak tracks *plan check-ins and Sunday planning*, NOT workout completion — rest days, recovery weeks, travel, illness never break it; streak freezes earned by use (never purchased); no ransom notifications
  5. **Morning ritual < 60s**: dashboard Today tab delivers readiness + prescribed session + one subjective check-in tap at the fire-moment of the athlete's alarm/coffee cue
  6. **Post-ride reflection**: one prompt ("easier / as expected / harder — one sentence why") fires automatically after each synced activity; answers feed adaptive planning (3× "harder" → auto-propose deload)
  7. **Sunday planning ritual**: weekly recap + next-week preview + one user-declared intention; optionally publishable to pack as a commitment device
  8. **Identity framing**: onboarding captures "what kind of cyclist are you becoming" (climber/endurance/racer/all-rounder/commuter-athlete); milestone and weekly-recap copy references *identity*, not just numbers
  9. **Autonomy support**: every AI prescription ships with a *why* + *skip* + *modify* affordance; copy audits show zero guilt/shame language; loss-framing used ONLY for genuine overtraining/injury warnings (never routine reminders)
  10. **Data integrity as foundation**: leaderboard/rival submissions require power-meter or HR-strap validation; outliers flagged; no indoor/outdoor mixing in comparisons

**Anti-Goals (hard-banned — do not ship, revisit only after explicit reconsideration):**
- Global leaderboards ranking 1..N
- Streak ransom notifications ("Don't lose your N-day streak!")
- Variable-ratio slot-machine rewards (random chests, mystery badges, confetti for trivial acts)
- FOMO / social-pressure pushes ("3 friends worked out today, did you?")
- Guilt copy / passive-aggressive mascot
- Algorithmic feed
- Non-consensual auto-share of activities
- Identity flattery on empty ("pro" / "elite" badges for new users)
- Global all-time leaderboards of any kind (cohort-filtered only; see §3)
- AI-generated activity content in social surfaces
- Paywalling export-my-data or retroactively paywalling previously-free features

**Plans** (3 plans, suggested breakdown — revisit at `/gsd:plan-phase 09`):
- [ ] 09-01: Pack data model + membership + opt-in per-ride share + kudos primitive + chronological pack feed
- [ ] 09-02: Rivals (user-chosen, cohort-filtered comparisons), consistency streak tracking plan-adherence/Sunday-planning (NOT completion), streak freezes
- [ ] 09-03: Ritual surfaces — morning <60s, post-ride reflection prompt feeding adaptive plan, Sunday planning card with pack-shareable intention; identity framing pass across onboarding + weekly recap copy

**Audience discipline note**: serious athletes (WHOOP/Garmin/TrainerRoad alumni) have seen every gamification trick. The competitive moat for this audience is **honesty + insight + autonomy**, not hooks. If a proposed feature is indistinguishable from Strava/Duolingo mechanics, reject it.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
Note: Phases 8 and 9 depend on Phase 5 (not on each other) and can execute in parallel if desired.

| Phase | Plans Complete | Status | Completed |
|-------|---------------|--------|-----------|
| 1. Foundation + Auth | 4/4 | Complete | 2026-04-16 |
| 2. Training Engine | 3/3 | Complete | 2026-04-16 |
| 3. Garmin Data Integration | 3/3 | Complete | 2026-04-19 |
| 4. Dashboard + Visualization | 4/4 | Complete | 2026-04-19 |
| 5. AI Coaching Core | 2/2 | Complete (awaiting live UAT) | 2026-04-20 |
| 6. AI Deep Coaching | 0/TBD | Not started | - |
| 6.1. UI Overhaul (INSERTED) | 3/3 | Complete (awaiting live UAT) | 2026-04-22 |
| 6.2. Whoop-grade redesign (INSERTED) | 6/6 | Complete (6/6 must-haves verified, +2.66% bundle) | 2026-05-04 |
| 7. Periodization + Workout Generation | 0/TBD | Not started | - |
| 8. Nutrition Integration | 0/TBD | Not started | - |
| 9. Social + Gamification | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-16*
*Last updated: 2026-04-22*
