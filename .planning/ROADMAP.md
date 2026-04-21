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
- [ ] **Phase 7: Periodization + Workout Generation** - AI-built mesocycles, daily adaptation, and structured workouts
- [ ] **Phase 8: Nutrition Integration** - Manual nutrition logging, fueling advice, and nutrition-aware adaptation
- [ ] **Phase 9: Social + Gamification** - Friends, rivals, streaks, events, activity feed, and social AI nudges

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
- [ ] 06-01-PLAN.md — Analytical tool-use backend: tool registry + aggregate services + /coach/chat tool-use loop with deterministic fallback
- [ ] 06-02-PLAN.md — Workout modification tool with rails-gated template cascades and append-only audit
- [ ] 06-03-PLAN.md — Chat UI upgrades: tool-use lifecycle indicators, WorkoutModifiedCard, AnalyticalAnswerCard, Tools Used transparency
- [ ] 06-04-PLAN.md — Multi-turn context + undo_last_modification tool with compensating audit

### Phase 7: Periodization + Workout Generation
**Goal**: The AI builds and adapts multi-week training plans with structured workouts, dynamically adjusting daily sessions based on athlete state
**Depends on**: Phase 6
**Requirements**: TRAIN-04, TRAIN-05, TRAIN-06
**Success Criteria** (what must be TRUE):
  1. AI generates a multi-week periodized mesocycle (base/build/peak/recovery) aligned to the user's goal event and current fitness
  2. System adapts the daily plan based on sleep, HRV, body battery, nutrition, and recent training load — swapping or modifying today's session
  3. AI generates structured workouts with specific power/pace targets for cycling, running, and gym sessions
  4. Generated workouts respect current FTP/threshold values and use appropriate interval structures
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

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

### Phase 9: Social + Gamification
**Goal**: Users can connect with friends, track rivals, join events, and stay motivated through research-driven engagement mechanics
**Depends on**: Phase 5
**Requirements**: SOCIAL-01, SOCIAL-02, SOCIAL-03, SOCIAL-04, SOCIAL-05, SOCIAL-06, COACH-09
**Success Criteria** (what must be TRUE):
  1. User earns smart streaks that count plan adherence (rest days continue the streak, not break it)
  2. User can give kudos on completed activities with a single tap
  3. User can add friends and see an activity feed of their completed workouts (auto-generated summaries)
  4. User can designate 1-3 rivals and receives weekly rival reports comparing training
  5. User can create and join group ride/run events with location, time, and participant list
**Plans**: TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

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
| 7. Periodization + Workout Generation | 0/TBD | Not started | - |
| 8. Nutrition Integration | 0/TBD | Not started | - |
| 9. Social + Gamification | 0/TBD | Not started | - |

---
*Roadmap created: 2026-04-16*
*Last updated: 2026-04-20*
