# Feature Research

**Domain:** AI-powered multi-sport training platform (cycling-primary with running and strength)
**Researched:** 2026-04-16
**Confidence:** MEDIUM-HIGH (competitive landscape well-documented; gamification psychology well-researched; .FIT specifics need SDK verification)

## Competitive Landscape

Before categorizing features, here is what each major competitor offers and where they focus:

| Platform | Core Strength | Pricing | Notable Gap |
|----------|--------------|---------|-------------|
| **TrainerRoad** | ML-adaptive structured training, Plan Builder, AI FTP Detection, fatigue prediction | ~$20/mo | No nutrition, minimal social, indoor-focused |
| **Xert** | Continuous fitness modeling (no FTP tests), Forecast AI, XATA advisor | ~$13-20/mo | Complex UI, steep learning curve |
| **Intervals.icu** | Free analytics powerhouse, open API, coach tools, annual plan builder (2026) | Free/supporter | No AI coaching, no workout generation, analytics-only |
| **TrainingPeaks** | Coach-athlete marketplace, WKO5 integration, gold-standard planning | ~$10-20/mo | Not adaptive, requires coach or self-knowledge |
| **Wahoo SYSTM** | 4DP profiling, video content, multi-sport (yoga/mental), Zwift integration | ~$15/mo | Limited outdoor, content-focused not coaching |
| **Garmin Coach** | On-device adaptive plans, uses all Garmin biometrics, free with device | Free | Limited customization, basic AI |
| **Strava** | Social network for athletes, segments/KOM, clubs, 135M+ users | Free/$12/mo | Not a training platform, no coaching |
| **JOIN Cycling** | AI coaching with natural language plan adjustments | ~$15/mo | Cycling-only, limited ecosystem |
| **Athletica.ai** | Multi-sport AI, HIIT science integration, integrates with intervals.icu | ~$25/mo | Newer, smaller community |

**Key insight:** No single platform combines body metrics (sleep/HRV/recovery) + nutrition tracking + AI coaching conversation + periodized training + .FIT export + social/gamification. This is a genuine gap.

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing any of these and athletes will immediately look elsewhere.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Activity history & analytics** | Every platform shows past activities with charts. Athletes need to see CTL/ATL/TSB (fitness/fatigue/form), power curves, heart rate trends | MEDIUM | PMC chart (Performance Management Chart) is the lingua franca. Use Coggan's model (CTL=42d, ATL=7d exponential weighted) |
| **Power zone display** | Athletes think in zones (Z1-Z7 Coggan, or 3-zone Seiler). Must show current zones based on FTP | LOW | Auto-calculate from FTP. Support both Coggan 7-zone and Seiler 3-zone models |
| **Training calendar** | Visual week/month view with planned vs completed workouts. Drag-drop rearrangement | MEDIUM | Calendar is the primary planning interface. Show planned TSS vs actual TSS per week |
| **Structured workout player/viewer** | View workout structure visually (power profile graph with intervals). Even if executing on Garmin, athletes want to preview | LOW-MEDIUM | Show interval blocks with target power, duration, cadence. Visual preview before sending to device |
| **.FIT workout export** | Garmin users expect workouts to appear on their device ready to execute | HIGH | Must support: warmup, cooldown, active intervals, rest, repeat blocks, power targets (absolute W and %FTP), HR targets, cadence targets, open/lap-button steps. See .FIT details section below |
| **FTP tracking & history** | FTP is the central metric for cycling. Must track over time with chart showing progression | LOW | Auto-detect from Garmin or manual entry. Show FTP history timeline |
| **Multi-sport support** | Running + strength are expected complements to cycling training | MEDIUM | Running: pace zones, HR zones. Strength: exercise library, sets/reps. Must manage combined training load |
| **User accounts & profiles** | Multi-user with personal data, preferences, goals | LOW | Auth, profile, goal setting (target event, target FTP, weekly hours available) |
| **Data sync from wearables** | Automatic pull from Garmin Connect without manual upload | MEDIUM | Garmin Connect API OAuth2, polling for new activities, sleep, HRV, body battery, training status |
| **Mobile-responsive UI** | Athletes check training plans on phones constantly | MEDIUM | Responsive web is acceptable for v1 but must be genuinely usable on mobile |
| **Rest day recommendations** | Every serious platform tells you when to rest based on fatigue | LOW-MEDIUM | Based on TSB (Training Stress Balance), Garmin training status, and sleep quality |

### Differentiators (Competitive Advantage)

Features that set this product apart. These are the reasons athletes would switch from existing platforms.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Unified body status dashboard** | No platform combines sleep score + HRV + body battery + nutrition + training load into one "how am I doing right now" view. This is the killer feature | MEDIUM | Morning glanceable view: "You slept 7.2h (good), HRV elevated (recovered), ate 2400cal yesterday (slightly under for interval day). Recommendation: GO - do today's threshold intervals." |
| **Conversational AI coach (Claude)** | TrainerRoad adapts silently. This product lets you ASK WHY and NEGOTIATE. "Why am I tired?" "Can I do this workout shorter?" "What should I eat before today's ride?" | HIGH | Must have deep context: full training history, current body state, nutrition, upcoming plan. Use prompt caching. This is the "world-class coach" experience |
| **Nutrition-aware training adaptation** | No training platform integrates calorie/macro data to adjust workout intensity. "You only ate 1800cal yesterday, reducing today's interval targets by 10%" | MEDIUM | Yazio integration for actual intake data. Pre-workout fueling advice. Post-workout recovery nutrition. This is genuinely novel in the market |
| **AI-adaptive periodization with life context** | TrainerRoad adapts to workout performance. This product adapts to sleep, nutrition, stress, AND workout performance simultaneously | HIGH | Combine Garmin biometrics (sleep, HRV, body battery) + nutrition data + training performance. Multi-signal adaptation is genuinely superior to single-signal |
| **Social gamification with behavioral psychology** | Strava has social. This product has DESIGNED engagement using SDT, Octalysis, and habit formation research. See gamification section below | HIGH | This is the long-term retention moat. Must be research-driven, not copied |
| **AI uses social context as motivational lever** | "Your rival completed 3 threshold sessions this week. You've done 1." No platform weaponizes social data for coaching motivation | MEDIUM | Requires: friend/rival system + AI access to comparative data. Powerful for competitive athletes |
| **.FIT workout auto-push to Garmin** | Most platforms require manual sync. Auto-push means wake up, see recommendation, workout is already on your Garmin Edge | MEDIUM | Garmin Connect API workout upload. Reduces friction from "see plan" to "execute plan" |
| **Knowledge base with citations** | AI coach references actual studies: "Based on Seiler 2010, your polarized distribution should be 80/20" | MEDIUM | RAG system or structured knowledge base. Builds trust. No other consumer platform does this |

### Innovation Opportunities (Novel Approaches Not Yet in Market)

These go beyond what any current platform offers. High risk, high reward.

| Feature | Innovation | Complexity | Behavioral Science Basis |
|---------|-----------|------------|--------------------------|
| **Accountability partnerships** | Paired athletes who commit to each other's goals. Miss a planned workout and your partner gets notified. Habitica-style "damage to the party" | MEDIUM | SDT Relatedness + Loss Aversion (Octalysis Core Drive 8). Team-based accountability increases adherence 65%+ per exercise psychology research |
| **Training quests / narrative arcs** | Multi-week challenges framed as journeys: "The FTP Crucible: 8-week threshold block." Completing phases unlocks next chapter. Progress bar shows narrative progress alongside physiological progress | MEDIUM | Octalysis Core Drive 1 (Epic Meaning) + Core Drive 2 (Accomplishment). Duolingo's course completion model applied to mesocycles |
| **Variable reward training insights** | After completing a workout, occasionally unlock a "deep insight" about your physiology: "Your power at VO2max has improved 4% in 3 weeks. Here's what that means for your race." Not every time — variable schedule | LOW-MEDIUM | Variable ratio reinforcement schedule (B.F. Skinner). Duolingo uses this with bonus XP and chest rewards. Unpredictability drives engagement (Octalysis Core Drive 7) |
| **Rival system (beyond friends)** | Designate 1-3 "rivals" whose training you track. AI coach uses rival data for motivation. Weekly "rival report" showing comparative progress | MEDIUM | Social comparison theory (Festinger 1954). Competition drives performance in athletes. Strava segments prove this works but it's per-ride — this makes it longitudinal |
| **Recovery credit system** | Earn "recovery credits" by sleeping well, eating properly, taking rest days. Spend credits to unlock harder training blocks. Gamifies the recovery process which athletes typically skip | LOW-MEDIUM | Octalysis Core Drive 4 (Ownership). Reframes rest from "not training" to "earning capacity to train harder." Addresses the #1 mistake amateur athletes make |
| **Streak with smart breaks** | Unlike Duolingo's rigid streaks, this streak system counts "adherence to plan" — including rest days. Taking a prescribed rest day CONTINUES the streak. Missing a planned hard day breaks it | LOW | Addresses Duolingo's biggest criticism (punishing rest). Loss aversion still drives behavior but aligned with healthy training principles |
| **Team challenges with boss battles** | Groups of 3-5 athletes collectively accumulate training load to "defeat" a shared challenge (e.g., "Climb Mont Ventoux: accumulate 5000m of elevation this month as a team"). Borrowed from Habitica's quest system | MEDIUM | Habitica proves cooperative RPG mechanics work for habit formation. SDT Relatedness. Team failure creates positive peer pressure |

### Anti-Features (Deliberately NOT Building)

Features that seem good but create problems. These are explicit "no" decisions.

| Feature | Why Requested | Why Problematic | What to Do Instead |
|---------|---------------|-----------------|-------------------|
| **Real-time ride tracking / live activity** | "I want my coach to see my ride live" | Massive infrastructure cost (WebSocket/streaming), battery drain, Garmin already does this. Solving a problem that doesn't need solving | Analyze completed activities post-ride. AI coach reviews within minutes of upload |
| **Virtual riding world (Zwift clone)** | "Add a 3D world to ride in" | This is a completely different product category. Enormous engineering effort for graphics/physics engine | Integrate WITH Zwift via .ZWO export (future). Focus on being the BRAIN, not the legs |
| **AI-generated training plans from scratch without user input** | "Just tell me what to do, I don't want to set goals" | Plans without goals are generic and useless. No accountability | Require minimal input: target event/date, weekly hours, current FTP. Then AI takes over |
| **Leaderboards ranked by training volume** | "Show who trained the most hours" | Incentivizes overtraining and junk miles. Rewards quantity over quality. Dangerous for health | Leaderboards by consistency (% plan adherence), improvement rate, or recovery quality |
| **Daily push notification spam** | "Remind me constantly" | Notification fatigue destroys engagement. Users disable notifications within 2 weeks | Smart notifications only: morning daily brief, missed planned workout (1 gentle nudge), rival activity (if opted in). Max 2/day |
| **Heart rate zone-only training** | "Not everyone has a power meter" | HR lag, cardiac drift, heat/caffeine effects make HR unreliable for intervals. Building around HR creates inferior training | Support HR as secondary metric and for running, but power-first for cycling. RPE (Rate of Perceived Exertion) as fallback |
| **Copying Strava's social feed exactly** | "Make a social feed with posts and comments" | Creates content creation pressure. Athletes don't want another social media feed to maintain | Auto-generated activity summaries. Social interaction through kudos/comments on completed workouts, not user-created content |
| **Complex manual plan building UI** | "Let me drag individual intervals around" | TrainingPeaks already does this. Power users will use TP. Our athletes want AI to handle complexity | Chat-based plan modification: "Make Tuesday's workout harder" or "I can only train 3 days next week." AI rebuilds the plan |

## Gamification Deep Dive: Behavioral Psychology Framework

### Theoretical Foundation

Three frameworks inform the gamification design:

**1. Self-Determination Theory (SDT) — Deci & Ryan**
Sustained motivation requires satisfying three psychological needs:
- **Autonomy**: Athlete chooses goals, adjusts plans, picks workout timing. AI suggests, athlete decides
- **Competence**: Clear progress feedback, achievable challenges that stretch ability, mastery paths
- **Relatedness**: Connection to other athletes, accountability, shared experiences

**2. Octalysis Framework (Yu-kai Chou) — 8 Core Drives**
Balanced engagement uses both "White Hat" (feel-good) and "Black Hat" (urgent) drives:

| Core Drive | Application in Platform | Type |
|-----------|------------------------|------|
| 1. Epic Meaning & Calling | "Train for your first century ride" — framing training as a heroic journey | White Hat |
| 2. Development & Accomplishment | Progression levels per power zone, milestone badges, FTP history showing improvement | White Hat |
| 3. Empowerment of Creativity | Chat-based plan customization, "what if I trained 5 days instead of 4?" scenario planning | White Hat |
| 4. Ownership & Possession | Recovery credits, training streak, personal bests collection, avatar/profile customization | White Hat |
| 5. Social Influence & Relatedness | Rival system, team challenges, accountability partnerships, kudos | - |
| 6. Scarcity & Impatience | "Unlock threshold training block after completing base phase" — earned progression | Black Hat |
| 7. Unpredictability & Curiosity | Variable reward insights after workouts, surprise achievements, AI "did you know" coaching moments | Black Hat |
| 8. Loss & Avoidance | Streak maintenance, rival getting ahead notifications, accountability partner damage | Black Hat |

**Design principle:** Lean heavily on White Hat drives (1-4) for long-term satisfaction. Use Black Hat drives (6-8) sparingly for short-term engagement hooks. Over-indexing on Black Hat creates anxiety and churn (Duolingo's streak criticism).

**3. Habit Loop (Nir Eyal's Hooked Model + BJ Fogg)**
- **Trigger**: Morning push notification with daily brief ("Good morning. You slept well. Today's workout: 4x8min sweet spot")
- **Action**: Open app, review recommendation (must be <30 seconds to value)
- **Variable Reward**: Insight about progress, social update, achievement unlocked
- **Investment**: Log how workout felt, review tomorrow's plan, check rival progress

### Engagement Mechanics Ranked by Impact

Based on cross-platform evidence:

| Mechanic | Evidence of Impact | Implementation Priority |
|----------|-------------------|------------------------|
| **Streaks (smart, plan-adherent)** | Duolingo: 7-day streakers are 3.6x more likely to complete goals. Modified to reward rest days | P1 — v1 launch |
| **Kudos / high-fives on activities** | Strava: 14B+ kudos given. Social validation is the #1 retention driver. Low-friction positive reinforcement | P1 — v1 launch |
| **Progress visualization** | Universal across all successful platforms. PMC chart, FTP timeline, zone progression levels | P1 — v1 launch |
| **Rivalry / social comparison** | Strava segments: KOM/QOM drives enormous engagement. Longitudinal rival tracking is the innovation | P2 — post-launch |
| **Accountability partnerships** | Exercise psychology: training with a partner increases adherence 65%+. Habitica quest damage mechanic | P2 — post-launch |
| **Team challenges** | Peloton: socially engaged members work out 15% more. Strava clubs: 3.5x retention | P2 — post-launch |
| **Achievement badges** | Peloton/Strava: milestone badges provide accomplishment hits. Over-saturating devalues them — keep rare | P2 — post-launch |
| **Narrative quests** | Habitica proves RPG framing works for habit formation. Novel in cycling space | P3 — future |
| **Variable reward insights** | B.F. Skinner variable ratio schedule. Duolingo bonus XP/chests | P3 — future |

## .FIT Workout File Capabilities

Based on Garmin FIT SDK documentation research (confidence: MEDIUM — SDK docs couldn't be fully fetched, based on forum posts and developer references):

### Supported Workout Step Types (Intensity)
- `WARMUP` — Pre-workout warm-up period
- `ACTIVE` — Main working interval
- `REST` — Rest between intervals
- `RECOVERY` — Active recovery
- `COOLDOWN` — Post-workout cool-down
- `INTERVAL` — Structured interval step (newer addition)

### Supported Duration Types
- `TIME` — Fixed time (e.g., 8 minutes)
- `DISTANCE` — Fixed distance (e.g., 5km)
- `CALORIES` — Until X calories burned
- `OPEN` — Manual lap button press to advance
- `REPEAT_UNTIL_STEPS_COMPLETE` — Repeat block X times
- `REPEAT_UNTIL_TIME` — Repeat until total time reached
- `REPEAT_UNTIL_DISTANCE` — Repeat until total distance reached
- `REPEAT_UNTIL_CALORIES` — Repeat until calorie target
- Various HR and power thresholds as duration triggers

### Supported Target Types
- `POWER` — Absolute watts or percentage of FTP (0-1000 range = %FTP)
- `HEART_RATE` — Absolute BPM or percentage of max HR
- `CADENCE` — Target RPM range
- `SPEED` — Target speed range
- Power and HR zone-based targets (zone 1-7)

### Repeat Block Structure
Workouts support nested repeat blocks: "Repeat steps 3-5 four times" is encodable. This enables standard interval structures like:
- Warmup > [Interval + Rest] x N > Cooldown
- Warmup > [Build + Sustain + Recovery] x N > Cooldown

### Implementation Notes
- FIT SDK available in Java, C#, C++. For Python, use the `fitdecode` or `garmin-fit-sdk` packages
- Workout files are binary FIT format, not text-based
- Garmin Connect API can upload workouts directly to user's account (appears on device at next sync)
- Maximum workout steps vary by device (Edge 530/830/1030: ~50 steps typical, some models support more)
- **Strength training workouts** are also encodable as FIT files with exercise name, sets, reps, weight targets

## Nutrition Integration Analysis

### Current State of Nutrition in Training Platforms

| Platform | Nutrition Feature | Integration |
|----------|------------------|-------------|
| TrainerRoad | None | No nutrition awareness |
| Xert | None | No nutrition awareness |
| Intervals.icu | None | No nutrition awareness |
| TrainingPeaks | Basic food logging | Manual entry, not connected to training adaptation |
| Wahoo SYSTM | None | No nutrition awareness |
| Garmin Connect | Basic food logging | Manual, not adaptive |
| Strava | None | No nutrition awareness |

**Key finding:** Nutrition-aware training adaptation is a genuine whitespace. No major training platform adjusts workout prescriptions based on actual nutritional intake data.

### Nutrition Integration Design

**Data sources:**
- Yazio API (availability TBD — may need scraping or CSV import as fallback)
- Manual calorie/macro logging as fallback
- Garmin Connect body composition data

**Nutrition-training interactions to implement:**
1. **Pre-workout fueling check**: "Today's workout requires ~800kcal. You've logged 400kcal so far. Consider eating before your session"
2. **Carb periodization guidance**: "Tomorrow is a high-intensity day. Aim for 6-8g/kg carbs today" 
3. **Recovery nutrition**: "You burned 1200kcal in today's ride. Prioritize 1.6g/kg protein and 1g/kg carbs within 2 hours"
4. **Adaptation dampening**: If consistently under-fueled, AI reduces training intensity to prevent overtraining
5. **Weight/body composition tracking**: Correlate nutrition trends with performance trends

## Feature Dependencies

```
[Garmin OAuth + Data Sync]
    |
    +---> [Activity History & Analytics]
    |         |
    |         +---> [Training Load Model (CTL/ATL/TSB)]
    |         |         |
    |         |         +---> [Rest Day Recommendations]
    |         |         +---> [AI Adaptive Periodization]
    |         |                   |
    |         |                   +---> [.FIT Workout Generation]
    |         |                   |         |
    |         |                   |         +---> [Auto-push to Garmin]
    |         |                   |
    |         |                   +---> [Conversational AI Coach]
    |         |                             |
    |         |                             +---> [Knowledge Base + Citations]
    |         |
    |         +---> [FTP Tracking & Zones]
    |         +---> [Power Zone Display]
    |
    +---> [Body Status Dashboard]
              |
              +---> [Sleep/HRV/Body Battery Display]
              +---> [Daily Training Recommendation]

[User Accounts + Auth]
    |
    +---> [Profile & Goals]
    |         |
    |         +---> [Training Calendar]
    |
    +---> [Social: Friends/Rivals]
              |
              +---> [Kudos/Comments on Activities]
              +---> [Rival System]
              +---> [Accountability Partners]
              +---> [Team Challenges]
              +---> [Streaks]

[Yazio / Nutrition Data]
    |
    +---> [Nutrition Dashboard]
              |
              +---> [Nutrition-Aware Training Adaptation]
              +---> [Pre/Post Workout Fueling Advice]
```

### Dependency Notes

- **Garmin OAuth is the foundation** — nothing works without activity and biometric data flowing in
- **Training load model must exist before AI coaching** — the AI needs CTL/ATL/TSB context to make recommendations
- **FTP must be tracked before .FIT generation** — workout targets are defined as %FTP
- **User accounts before social** — obvious but social features are blocked on auth
- **Nutrition integration is independent** — can be added to any phase after basic dashboard exists
- **AI coach is the integration layer** — it consumes ALL other features' data to provide recommendations

## MVP Definition

### Launch With (v1)

Minimum viable product to validate the core value proposition: "unified body data + AI coaching."

- [ ] **Garmin OAuth + data sync** — Pull activities, sleep, HRV, body battery, FTP, training status
- [ ] **Body status dashboard** — Morning view of current state with glanceable readiness assessment
- [ ] **Training load model** — CTL/ATL/TSB calculated from activities, displayed as PMC chart
- [ ] **Power zone display** — Auto-calculated from FTP (Coggan 7-zone)
- [ ] **Daily training recommendation** — AI suggests today's workout based on body state + training plan
- [ ] **Conversational AI coach** — Chat interface with Claude, full context of training + body data
- [ ] **Basic periodization** — Multi-week plan structure (base/build/peak) with manual or AI-generated plan
- [ ] **Training calendar** — Week/month view of planned and completed workouts
- [ ] **.FIT workout generation** — Generate structured cycling workouts exportable as .FIT
- [ ] **User accounts** — Auth, profile, goals, multi-user architecture

### Add After Validation (v1.x)

Features to add once core coaching loop is working and users confirm value.

- [ ] **.FIT auto-push to Garmin** — Eliminate manual download step
- [ ] **Yazio/nutrition integration** — Pull actual intake data, enable nutrition-aware coaching
- [ ] **Running + strength workouts** — Multi-sport support in plans and .FIT generation
- [ ] **Streaks (smart, plan-adherent)** — First gamification mechanic
- [ ] **Friends + kudos** — Basic social layer
- [ ] **Knowledge base with citations** — AI references studies when explaining recommendations
- [ ] **AI-adaptive plan modification** — Plan auto-adjusts based on sleep, nutrition, performance signals

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Rival system** — Designated rivals with comparative tracking
- [ ] **Accountability partnerships** — Paired commitment mechanics
- [ ] **Team challenges / boss battles** — Cooperative group challenges
- [ ] **Narrative quests** — RPG-style training journey framing
- [ ] **Variable reward insights** — Occasional surprise training analysis
- [ ] **Recovery credit system** — Gamified recovery
- [ ] **Advanced nutrition periodization** — Carb cycling, race-week fueling plans
- [ ] **Forecast AI (Xert-style)** — Predict future FTP based on planned training

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Garmin data sync | HIGH | MEDIUM | P1 |
| Body status dashboard | HIGH | LOW-MEDIUM | P1 |
| AI coaching chat | HIGH | HIGH | P1 |
| Training load model (PMC) | HIGH | MEDIUM | P1 |
| .FIT workout generation | HIGH | MEDIUM | P1 |
| Training calendar | HIGH | MEDIUM | P1 |
| Power zones + FTP tracking | HIGH | LOW | P1 |
| Daily recommendation | HIGH | MEDIUM | P1 |
| Basic periodization engine | HIGH | HIGH | P1 |
| User accounts + auth | HIGH | LOW-MEDIUM | P1 |
| .FIT auto-push to Garmin | MEDIUM | MEDIUM | P2 |
| Nutrition integration (Yazio) | HIGH | MEDIUM-HIGH | P2 |
| Smart streaks | MEDIUM | LOW | P2 |
| Friends + kudos | MEDIUM | LOW-MEDIUM | P2 |
| Multi-sport (running/strength) | MEDIUM | MEDIUM | P2 |
| Knowledge base + citations | MEDIUM | MEDIUM | P2 |
| Rival system | MEDIUM | MEDIUM | P3 |
| Accountability partners | MEDIUM | MEDIUM | P3 |
| Team challenges | LOW-MEDIUM | HIGH | P3 |
| Narrative quests | LOW | HIGH | P3 |
| Recovery credit system | LOW-MEDIUM | LOW-MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch — validates core value proposition
- P2: Should have — adds nutrition + social layer that differentiates
- P3: Nice to have — advanced gamification, builds long-term retention moat

## Competitor Feature Analysis

| Feature | TrainerRoad | Xert | Intervals.icu | Garmin Coach | Our Approach |
|---------|-------------|------|---------------|-------------|-------------|
| Adaptive plans | ML-based, workout performance only | Continuous fitness model, XATA advisor | None (manual) | Biometric-based (sleep, HRV) | Multi-signal: biometrics + nutrition + performance + social |
| AI coaching | None (silent adaptation) | None | None | Basic on-device | Full conversational AI with Claude, deep reasoning |
| Nutrition integration | None | None | None | Basic food log | Yazio integration, nutrition-aware adaptation |
| .FIT export | Yes (indoor) | Yes | Yes (via workout builder) | Native | Yes + auto-push to Garmin |
| Social features | Forums only | None | None | Garmin Connect (basic) | Research-driven gamification (SDT + Octalysis) |
| Body metrics dashboard | None | None | Wellness data (basic) | Full (on device) | Unified dashboard combining all data sources |
| Plan builder | Automated with event targeting | Automated with 120-day periodization | Annual plan builder (2026 beta) | Automated adaptive | AI-powered with conversational modification |
| FTP detection | AI FTP Detection (no test needed) | Continuous estimation | eFTP, Morton's 3P models | From activities | Pull from Garmin + validate with AI analysis |
| Multi-sport | Cycling only | Cycling only | Multi-sport | Running, cycling, strength, tri | Cycling + running + strength |
| Knowledge base | Blog/podcast | Blog | Forum | Help articles | Structured, citable, AI-accessible research base |

## Sources

### Competitive Landscape (MEDIUM confidence — based on official product pages and review sites)
- [TrainerRoad Adaptive Training](https://www.trainerroad.com/adaptive-training)
- [TrainerRoad AI Features](https://www.trainerroad.com/blog/what-is-trainerroad-ai-get-faster-with-predictive-cycling-training/)
- [TrainerRoad Review 2026 — CyclistsHub](https://www.cyclistshub.com/trainerroad-review/)
- [Xert Adaptive Training Advisor](https://www.baronbiosys.com/training-with-the-xert-adaptive-training-advisor/)
- [Xert Outcome-Driven Training Plans](https://www.baronbiosys.com/outcome-driven-training-plans/)
- [Intervals.icu](https://www.intervals.icu/)
- [Intervals.icu Annual Training Plan Builder](https://forum.intervals.icu/t/annual-training-plan-builder/122085)
- [Wahoo SYSTM Review 2026](https://www.cyclistshub.com/wahoo-systm-review/)
- [Garmin Coach Overview](https://www.garmin.com/en-US/garmin-coach/overview/)
- [Garmin Coach Expansion](https://garminrumors.com/garmin-expands-garmin-coach-with-adaptive-running-cycling-and-strength-training-plans/)

### .FIT File Specification (MEDIUM confidence — SDK site CSS-only, relied on forum posts and developer references)
- [Garmin FIT SDK Workout File Types](https://developer.garmin.com/fit/file-types/workout/)
- [Garmin FIT SDK Cookbook — Encoding Workouts](https://developer.garmin.com/fit/cookbook/encoding-workout-files/)
- [Garmin FIT SDK Overview](https://developer.garmin.com/fit/overview/)
- [FIT SDK Forum — Workout Step Intensity Types](https://forums.garmin.com/developer/fit-sdk/f/discussion/244073/what-are-the-new-workoutstep-intensity-types)
- [Intervals.icu Workout Builder — Garmin Step Types](https://forum.intervals.icu/t/workout-builder-garmin-step-type-intensity/20104)

### Gamification & Behavioral Psychology (MEDIUM-HIGH confidence — academic and established frameworks)
- [Strava Gamification Analysis — StriveCloud](https://www.strivecloud.io/blog/app-engagement-strava)
- [Strava Gamification Case Study — Trophy](https://trophy.so/blog/strava-gamification-case-study)
- [Strava Year in Sport 2025](https://business.strava.com/resources/year-in-sport-brands-2025)
- [Yu-kai Chou Octalysis Framework](https://yukaichou.com/gamification-examples/octalysis-gamification-framework/)
- [Top 10 Gamification in Fitness — Yu-kai Chou](https://yukaichou.com/gamification-analysis/top-10-gamification-in-fitness/)
- [Duolingo Case Study 2025 — Young Urban Project](https://www.youngurbanproject.com/duolingo-case-study/)
- [Duolingo Streak & Habit Research — Duolingo Blog](https://blog.duolingo.com/how-duolingo-streak-builds-habit/)
- [Peloton Club Loyalty Program](https://www.pelobuddy.com/club-peloton-info/)
- [Habitica — Gamify Your Life](https://habitica.com/)
- [SDT in Fitness Apps — Frontiers in Psychology](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2026.1752995/full)
- [Digital Behavior Change for Habit Formation — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11161714/)

### Nutrition Integration (MEDIUM confidence — limited training platform integration exists)
- [Best Nutrition Tracking Apps 2026 — ROUVY](https://rouvy.com/blog/best-apps-for-nutrition-tracking)
- [YAZIO vs MyFitnessPal Comparison](https://yourappland.com/yazio-vs-myfitnesspal-which-nutritio-app-is-better/)

### AI Coaching Landscape (MEDIUM confidence — rapidly evolving market)
- [Athletica.ai](https://athletica.ai/)
- [AI Endurance](https://aiendurance.com/en)
- [Adaptive AI Coaches 2025-2026 — AppStory](https://www.appstory.org/blog/adaptive-ai-fitness-coaches/)
- [Building AI Training Coach with Intervals.icu MCP](https://mrgeorgegray.com/blog/intervals-icu-mcp)

---
*Feature research for: AI-powered multi-sport training platform*
*Researched: 2026-04-16*
