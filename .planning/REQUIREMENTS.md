# Requirements: AI Cycling Coach

**Defined:** 2026-04-16
**Core Value:** All your body data combined with sports science into one intelligent coach that tells you exactly what to do today and adapts when life happens.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Platform & Data

- [ ] **PLAT-01**: User can create account with email/password and set up athlete profile (FTP, weight, zones, weekly hours)
- [ ] **PLAT-02**: User can set training goals (target FTP, target event with date, weekly availability)
- [ ] **PLAT-03**: Multi-user architecture with isolated data per athlete
- [ ] **DATA-01**: System syncs activities from Garmin Connect automatically (via unofficial python-garminconnect library for prototype)
- [ ] **DATA-02**: System syncs sleep score, HRV, body battery, and training status from Garmin
- [ ] **DATA-03**: User can manually log nutrition (calories, macros, meal timing) as Yazio fallback
- [ ] **DATA-04**: Garmin data abstraction layer that can swap unofficial library for official API later

### Training Engine

- [x] **TRAIN-01**: System calculates per-sport TSS (power-based cycling, pace-based running, HR-based gym)
- [x] **TRAIN-02**: System tracks CTL (fitness), ATL (fatigue), TSB (form) with PMC visualization
- [x] **TRAIN-03**: System tracks power/pace zones (Coggan 7-zone and Seiler 3-zone models)
- [ ] **TRAIN-04**: AI builds multi-week periodized mesocycles (base/build/peak/recovery) based on goals
- [ ] **TRAIN-05**: System adapts daily plan based on sleep, HRV, body battery, nutrition, and recent training load
- [ ] **TRAIN-06**: AI generates structured workouts with power/pace targets for cycling, running, and gym
- [x] **TRAIN-07**: System manages combined training load across cycling, running, and gym (tracked per-sport, not naively combined)
- [x] **TRAIN-08**: FTP tracking with history timeline and progression visualization

### AI Coaching

- [ ] **COACH-01**: Dashboard shows morning daily brief with body status + training recommendation with options
- [ ] **COACH-02**: Recommendation offers multiple options (rest, easy, moderate, push through) based on body state
- [ ] **COACH-03**: Chat interface for full coaching conversation powered by Claude API
- [ ] **COACH-04**: User can ask analytical questions ("why am I tired?", "analyze my last 4 weeks")
- [ ] **COACH-05**: User can modify workouts via chat ("I only have 45 min", "make it harder", "swap to indoor")
- [ ] **COACH-06**: AI provides pre-training fueling recommendations based on planned workout
- [ ] **COACH-07**: AI adjusts training recommendations based on nutrition data ("you're under-fueled, reduce intensity")
- [ ] **COACH-08**: Safety guardrails prevent dangerous recommendations (overtraining, pushing through injury, ED-triggering nutrition advice)
- [ ] **COACH-09**: AI uses social context as motivational lever ("your rival trained 3x this week")

### Dashboard & UI

- [ ] **DASH-01**: Body status dashboard with sleep score, HRV, body battery, readiness at a glance
- [ ] **DASH-02**: PMC chart showing CTL/ATL/TSB over time with interactive hover
- [ ] **DASH-03**: Training calendar with week/month view, planned vs completed, drag-drop rearrangement
- [ ] **DASH-04**: Workout preview visualization (interval blocks with power/pace targets before execution)
- [ ] **DASH-05**: Mobile-responsive design usable on phones

### Social & Gamification

- [ ] **SOCIAL-01**: Smart streaks that count plan adherence (rest days continue the streak)
- [ ] **SOCIAL-02**: Kudos on completed activities (low-friction positive reinforcement)
- [ ] **SOCIAL-03**: Add friends and see their training activity
- [ ] **SOCIAL-04**: Designate 1-3 rivals whose training you track with weekly rival reports
- [ ] **SOCIAL-05**: Create group ride/run events with location, time, and join functionality
- [ ] **SOCIAL-06**: Activity feed showing friends' completed workouts (auto-generated, not user-created content)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Workout Export

- **FIT-01**: Generate .FIT workout files with power/pace targets for Garmin devices
- **FIT-02**: Auto-push workouts to Garmin Connect via API (shows up on device automatically)
- **FIT-03**: Manual .FIT download as fallback

### Official Integrations

- **INTEG-01**: Migrate from unofficial Garmin library to official Garmin Connect Developer API
- **INTEG-02**: Yazio integration (or alternative nutrition tracking API like FatSecret)

### Knowledge & Intelligence

- **KNOW-01**: Updateable knowledge base with training science research papers
- **KNOW-02**: RAG-powered AI coaching with citations ("Based on Seiler 2010...")
- **KNOW-03**: AI scenario planning ("what if I trained 5 days instead of 4?")

### Advanced Gamification

- **GAME-01**: Accountability partnerships (paired athletes, Habitica-style party damage)
- **GAME-02**: Training quests / narrative arcs (multi-week journeys with unlockable chapters)
- **GAME-03**: Team challenges with boss battles (cooperative group goals)
- **GAME-04**: Variable reward training insights (surprise achievements, deep physiology insights)
- **GAME-05**: Recovery credit system (earn credits by sleeping well, spend on harder blocks)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Swimming / triathlon training | Cycling-primary platform with running + gym support |
| Real-time ride tracking | Garmin already does this; analyze post-ride instead |
| Virtual riding world (Zwift clone) | Different product category; focus on being the BRAIN |
| Complex manual plan building UI | Chat-based plan modification instead; TrainingPeaks already does drag-drop intervals |
| Leaderboards ranked by training volume | Incentivizes overtraining; rank by consistency/adherence instead |
| Daily push notification spam | Max 2/day; smart notifications only |
| Heart rate zone-only training | Power-first for cycling, HR as secondary; RPE as fallback |
| Social media-style content creation | Auto-generated activity summaries, not user-created posts |
| Mobile native app | Responsive web for v1; native app deferred |
| Payment / subscription billing | No monetization in v1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 8 | Pending |
| DATA-04 | Phase 3 | Pending |
| TRAIN-01 | Phase 2 | Complete |
| TRAIN-02 | Phase 2 | Complete |
| TRAIN-03 | Phase 2 | Complete |
| TRAIN-04 | Phase 7 | Pending |
| TRAIN-05 | Phase 7 | Pending |
| TRAIN-06 | Phase 7 | Pending |
| TRAIN-07 | Phase 2 | Complete |
| TRAIN-08 | Phase 2 | Complete |
| COACH-01 | Phase 5 | Pending |
| COACH-02 | Phase 5 | Pending |
| COACH-03 | Phase 5 | Pending |
| COACH-04 | Phase 6 | Pending |
| COACH-05 | Phase 6 | Pending |
| COACH-06 | Phase 8 | Pending |
| COACH-07 | Phase 8 | Pending |
| COACH-08 | Phase 5 | Pending |
| COACH-09 | Phase 9 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 4 | Pending |
| SOCIAL-01 | Phase 9 | Pending |
| SOCIAL-02 | Phase 9 | Pending |
| SOCIAL-03 | Phase 9 | Pending |
| SOCIAL-04 | Phase 9 | Pending |
| SOCIAL-05 | Phase 9 | Pending |
| SOCIAL-06 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after roadmap creation*
