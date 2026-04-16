# Pitfalls Research

**Domain:** AI-powered cycling/multi-sport training platform
**Researched:** 2026-04-16
**Confidence:** MEDIUM-HIGH (most pitfalls verified via multiple sources; Yazio-specific items are LOW confidence due to lack of official documentation)

## Critical Pitfalls

Mistakes that cause rewrites, safety incidents, or project failure.

### Pitfall 1: AI Coaching Gives Dangerous Training Advice

**Severity:** CRITICAL -- safety risk to users

**What goes wrong:**
The AI coach recommends training that could injure users: pushing through pain that signals injury, prescribing intensity far above safe levels for the athlete's fitness, recommending return-to-training too quickly after illness/injury, or ignoring contraindications (e.g., "do VO2max intervals" when HRV shows the athlete is deeply fatigued or sick). LLMs are especially prone to sounding authoritative while hallucinating specific training prescriptions.

**Why it happens:**
Claude is a general-purpose LLM, not a certified sports scientist. It will generate plausible-sounding training advice that may violate exercise physiology principles. Without explicit guardrails, it has no concept of "this recommendation could hurt someone." Users trust AI authority and may follow dangerous advice without questioning it.

**How to avoid:**
- Hard-coded safety constraints that the AI cannot override: maximum TSS/day caps relative to CTL, mandatory rest after illness indicators, intensity ceilings based on recovery status
- System prompt guardrails: explicit instructions to never recommend training through pain, never dismiss injury symptoms, always recommend medical consultation for injury/illness
- Output validation layer: post-process AI responses to flag/block recommendations that violate safety rules (e.g., prescribing >1.5x normal TSS, interval work when TSB < -30)
- Disclaimers on every training recommendation: "This is not medical advice. Listen to your body."
- Store and audit AI recommendations for safety review

**Warning signs:**
- AI suggests "push through" language in any context
- Recommendations that ignore negative recovery indicators (low HRV, poor sleep, high resting HR)
- AI prescribes workouts that exceed the athlete's recent training history by large margins
- No safety disclaimers appearing in AI output

**Phase to address:**
Phase 1 (AI coaching foundation) -- safety constraints must be in place before any user sees AI-generated training advice. This is not a "nice to have" for later phases.

---

### Pitfall 2: Garmin Connect API Access Blocked for Non-Business Use

**Severity:** CRITICAL -- blocks core functionality

**What goes wrong:**
The Garmin Connect Developer Program is explicitly "for business use only." Personal projects, hobby projects, and individual developers are not eligible. Applying without a legitimate business entity results in rejection. Teams build the entire platform assuming Garmin API access, then get denied. The alternative -- unofficial libraries like `python-garminconnect` or `garth` -- are fragile and break regularly when Garmin changes authentication or Cloudflare rules.

**Why it happens:**
Garmin gates their API behind a business approval process. The FAQ states: "Access to the Garmin Connect Developer Program is free to approved business developers." There is no hobbyist tier. Developers assume they can just sign up and start building, but Garmin reviews applications and can decline in their "sole discretion."

**How to avoid:**
- **Option A (recommended):** Register a legitimate business entity (LLC, GmbH, etc.) before applying. The program is free -- no licensing fees -- but requires a business identity. Prepare a professional application describing the platform's value proposition.
- **Option B (fallback):** Build the initial version using unofficial access via `python-garminconnect` (now maintained by community after `garth` deprecation), but treat this as explicitly temporary. The unofficial path requires: Playwright-based browser authentication to bypass Cloudflare, session token caching, and constant maintenance when Garmin changes their auth flow.
- **Architecture requirement:** Abstract the Garmin data layer behind an interface so you can swap between official API and unofficial scraping without rewriting the application.
- Rate limits for official API: Evaluation keys get 100 requests/partner/minute and 200 requests/user/day. Production keys get 6000 each. Design sync schedules within these limits.

**Warning signs:**
- Application to Garmin Developer Program is rejected or pending for weeks
- Unofficial library stops working after Garmin auth changes (has happened multiple times: Issues #127, #213, #332, #337 on python-garminconnect)
- Cloudflare blocks requests with 429 or 403 errors
- `garth` library deprecated (confirmed: maintainer announced deprecation in 2026)

**Phase to address:**
Phase 0 (pre-development) -- apply for Garmin Developer Program immediately. Build Phase 1 with unofficial access as a bridge, but plan the official migration. The API access decision affects the entire architecture.

---

### Pitfall 3: Nutrition Recommendations Trigger Eating Disorders

**Severity:** CRITICAL -- mental health safety risk

**What goes wrong:**
The platform integrates Yazio nutrition data and provides AI-driven fueling recommendations. This can trigger or exacerbate eating disorders by: obsessive calorie tracking enabled by automation, AI recommending caloric deficits that are too aggressive, focusing on weight loss as a proxy for performance, or providing macro targets that create unhealthy relationships with food. Research from Harvard School of Public Health found AI tools can offer harmful advice on eating disorders. A 2024 systematic review confirmed that diet/fitness app use is associated with disordered eating, body image concerns, and compulsive exercise.

**Why it happens:**
Performance-focused athletes are already at elevated risk for disordered eating (especially in endurance sports where power-to-weight ratio matters). AI models trained on general nutrition data tend to default to weight-loss framing. Calorie-tracking apps have been flagged by dietitians as ED triggers for years, and adding AI automation lowers the barrier to obsessive monitoring.

**How to avoid:**
- Frame all nutrition advice as "fueling for performance" never "calorie restriction for weight loss"
- Never recommend caloric deficits without explicit user request and prominent warnings
- Include ED screening questions during onboarding (e.g., SCOFF questionnaire)
- Provide option to hide calorie numbers and show only qualitative guidance ("you need more carbs before this ride")
- Hard-code minimum calorie floors: AI cannot recommend below BMR-based minimums
- Add prominent resource links (National Eating Disorders Association, etc.)
- System prompt: explicitly instruct AI to never suggest restrictive eating, never use shame language about food choices, and to recommend professional help if ED indicators appear in conversation

**Warning signs:**
- AI output includes language like "you ate too much," "cut calories," or weight-loss framing
- Users asking the AI obsessive questions about exact calorie counts
- Macro recommendations that result in sub-1500 kcal/day for active athletes
- No ED disclaimer or resources visible in the nutrition UI

**Phase to address:**
Phase where nutrition integration is built. Safety constraints must ship with the feature, not after. Consider having the nutrition feature reviewed by a registered dietitian before launch.

---

### Pitfall 4: Yazio Data Access is Unreliable and Potentially Impossible

**Severity:** CRITICAL -- may block nutrition feature entirely

**What goes wrong:**
Yazio has no official public API. The only documentation is a community reverse-engineered Swagger spec from 2020 (6 years old, 10 commits total, last activity July 2020). CORS restrictions block browser-based access. Endpoints may have changed or been removed entirely. There is no guarantee of stability, no versioning, no developer support. Building a core feature on this foundation is building on sand.

**Why it happens:**
Yazio is a consumer app focused on its own mobile experience. Unlike Garmin (which has a developer program), Yazio has shown no interest in third-party integrations. Developers assume "it has an API" because someone documented endpoints years ago.

**How to avoid:**
- **Validate Yazio access immediately** before committing to the integration. Spend a spike (1-2 days) testing whether the reverse-engineered endpoints still work.
- **Design the nutrition integration as pluggable:** define a NutritionProvider interface that Yazio implements, so you can swap to alternatives (MyFitnessPal API, Cronometer API, manual entry, or CSV import).
- **Fallback plan:** If Yazio API is dead, implement manual nutrition logging or CSV/export import as the v1 nutrition source. Users can export Yazio data manually.
- **Do not build the periodization engine with a hard dependency on real-time nutrition data.** Nutrition should enhance recommendations, not be required for them.

**Warning signs:**
- Yazio endpoints return 401/403/404 during spike testing
- CORS blocks prevent server-side access (though server-to-server calls should bypass CORS)
- Response formats don't match the 2020 Swagger spec
- No community activity on Yazio API repos

**Phase to address:**
Phase 0 or early Phase 1 -- validate Yazio access as a spike before planning any nutrition features. This is a go/no-go decision point.

---

### Pitfall 5: Multi-Sport Training Load Comparison (Apples-to-Oranges TSS)

**Severity:** CRITICAL -- leads to overtraining or undertraining

**What goes wrong:**
The platform combines cycling, running, and gym training under a single load management model (CTL/ATL/TSB). But TSS variants are not equivalent across sports:
- Power-based TSS (cycling) is highly accurate
- rTSS (running pace-based) is moderately accurate
- hrTSS (heart-rate-based, used for gym/general) is significantly less accurate, especially for high-intensity or variable efforts
- Strength training stress is poorly captured by any TSS variant -- heart rate doesn't reflect local muscular fatigue

Equal TSS does not mean equal fatigue. A TSS of 100 from easy endurance riding requires fundamentally different recovery than TSS 100 from threshold intervals. Combining these naively produces misleading CTL/ATL/TSB numbers that either overestimate or underestimate total training stress.

**Why it happens:**
TrainingPeaks popularized the CTL/ATL/TSB model and developers copy it without understanding its limitations. The model was designed for single-sport (cycling with power meter). Extending it to multi-sport requires careful handling that most implementations skip.

**How to avoid:**
- Track sport-specific load separately: cycling CTL, running CTL, gym load -- do not blend into one number without understanding the tradeoffs
- Weight TSS by sport-specific multipliers (running is harder on the body per TSS point than cycling due to eccentric loading)
- Use hrTSS only for steady-state efforts; flag it as "estimated" for interval/strength work
- Consider TRIMP or Banister impulse-response models as alternatives to TSS for non-cycling activities
- Display confidence indicators on load calculations: "high confidence" for power-based, "estimated" for HR-based
- Re-test FTP/threshold every 6-8 weeks -- outdated thresholds invalidate all downstream metrics

**Warning signs:**
- Combined TSB shows "fresh" but athlete is actually buried from running volume
- Gym sessions showing suspiciously low TSS despite being genuinely hard
- CTL climbing but athlete performance declining (wrong stress attribution)
- Athletes report feeling much more/less tired than the numbers suggest

**Phase to address:**
Training load engine phase. This is a core algorithm decision. Get it wrong and the entire coaching logic is compromised. Recommend building cycling-only first, then carefully adding running and gym with separate tracking.

---

## High-Severity Pitfalls

### Pitfall 6: .FIT File Generation Incompatibilities

**Severity:** HIGH

**What goes wrong:**
Generated .FIT workout files don't work on target Garmin devices, or produce garbled data. Common issues:
- Garmin Connect's workout builder limits workouts to 50 steps, though the FIT spec itself doesn't enforce this -- but older devices may not handle >50 steps
- FIT profile versions drift: devices ship with newer profiles (21.147, 21.150) while the SDK is at 21.141, creating forward-compatibility gaps
- Workout files cannot be uploaded via Garmin's upload API (it only accepts Activity files) -- must be synced via Garmin Connect web/app or USB sideloading
- Missing required messages (file_id, workout, workout_step) cause silent failures
- Incorrect field types or enum values cause device crashes or ignored workouts

**Why it happens:**
The FIT format is a binary protocol with strict message definitions. Small errors (wrong field type, missing CRC, incorrect message order) produce files that are technically invalid but may parse on some devices and fail on others. The SDK documentation is sparse and the protocol is complex.

**How to avoid:**
- Use the official Garmin FIT SDK (available for Python) rather than hand-rolling binary encoding
- Validate generated files with the FIT SDK's validator tool before serving to users
- Test on actual target devices (Garmin Edge series, Forerunner series) -- emulators are insufficient
- Keep workouts under 50 steps for maximum compatibility
- Implement a "workout simplification" algorithm that merges similar adjacent steps when the workout exceeds step limits
- Version-pin your FIT SDK and track Garmin profile version updates

**Warning signs:**
- "Workout failed to load" errors on Garmin devices
- Workouts that appear on the device but have wrong power/HR targets
- Files that work on Edge 1040 but fail on Edge 530
- FIT validator tool reports errors in generated files

**Phase to address:**
Workout export phase. Build a comprehensive test suite with known-good FIT files as reference. Test on multiple device generations.

---

### Pitfall 7: Periodization Engine Too Rigid or Too Reactive

**Severity:** HIGH

**What goes wrong:**
Two failure modes:
1. **Too rigid:** The plan ignores life events. Athlete gets sick for a week, and the system either resumes the exact plan where it left off (inappropriate) or forces a restart (frustrating). Real athletes miss sessions, travel, get injured -- rigid plans break immediately.
2. **Too reactive:** The plan changes every day based on the latest data point. Athlete has one bad night of sleep and the system scraps the week's plan. This prevents progressive overload because the system never commits to a training block long enough for adaptation.

**Why it happens:**
Rigidity comes from treating the periodization plan as a fixed schedule rather than a set of principles. Reactivity comes from giving every data input equal weight in decision-making. Both represent a failure to model the difference between normal variation (one bad sleep) and meaningful signals (three consecutive days of declining HRV).

**How to avoid:**
- Separate the "strategic layer" (mesocycle structure, weekly TSS targets, periodization phase) from the "tactical layer" (daily workout selection, intensity adjustment)
- The strategic layer should only change for significant events: illness >2 days, injury, major life disruption, FTP breakthrough
- The tactical layer adapts daily based on recovery indicators but stays within the strategic framework
- Implement "plan deviation tolerance": allow +/-15% TSS deviation from weekly targets before triggering a replan
- Track "plan adherence" metrics so the AI can say "you've missed 3 of 5 sessions this week, let's adjust the rest of the week" rather than replanning the whole mesocycle

**Warning signs:**
- Users complain the plan "doesn't adapt" or "always changes"
- CTL trajectory doesn't match the periodization phase goals
- Athletes feel like the system doesn't understand their constraints
- Frequent full-plan recalculations that confuse users

**Phase to address:**
Periodization engine phase. This is architecture-level: define the strategic vs. tactical layer boundary early.

---

### Pitfall 8: Health/Fitness Data Privacy Violations (GDPR)

**Severity:** HIGH -- legal/regulatory risk

**What goes wrong:**
The platform stores heart rate, HRV, sleep data, body composition, nutrition data, and training history. Under GDPR, this is "special category" personal data (health data) requiring explicit consent, purpose limitation, and enhanced security. Violations carry fines up to 4% of annual turnover or 20M EUR. Additionally, the EU's European Health Data Space (EHDS) regulation entered into force March 2025, adding new requirements.

**Why it happens:**
Developers treat fitness data like regular app data. But HRV, resting heart rate, sleep patterns, and nutrition intake can reveal health conditions. GDPR Article 9 classifies this as health data requiring explicit consent (not just "I agree to ToS") and legitimate processing grounds.

**How to avoid:**
- Implement explicit, granular consent for each data type: "We will access your Garmin sleep data to provide recovery recommendations. [Consent]"
- Purpose limitation: only collect data you actively use for features. Don't vacuum all Garmin data "just in case"
- Data minimization: aggregate/anonymize where possible. Store daily summaries, not every heart rate sample, unless the feature requires it
- Right to deletion: implement a "delete all my data" function that actually works (including backups, logs, AI conversation history)
- Data portability: allow users to export all their data
- Encryption at rest and in transit for all health data
- If serving EU users, you likely need a DPO (Data Protection Officer) designation and a DPIA (Data Protection Impact Assessment)

**Warning signs:**
- No consent flow beyond "accept terms of service"
- Health data stored in plaintext
- No data deletion mechanism
- Garmin/Yazio tokens stored without encryption
- Data retention with no expiration policy

**Phase to address:**
Phase 1 (user accounts/auth). Privacy-by-design must be baked in from the start, not retrofitted.

---

## Moderate Pitfalls

### Pitfall 9: Stale FTP Invalidates All Training Metrics

**What goes wrong:**
All power-based training zones, TSS calculations, and workout targets depend on FTP (Functional Threshold Power). If FTP is outdated, every derived metric is wrong. An athlete whose FTP improved from 250W to 270W but hasn't retested will have workouts that are too easy and TSS numbers that underestimate actual stress. Conversely, an overtrained athlete with declining FTP will get workouts that are too hard.

**Prevention:**
- Track FTP history and flag when last test was >6-8 weeks ago
- Implement FTP estimation from ride data (Garmin provides FTP estimates; also consider using critical power models from ride power curves)
- Alert users when estimated FTP diverges significantly from their set FTP
- AI coach should proactively suggest FTP tests at appropriate training phases

**Phase to address:** Training load engine phase.

---

### Pitfall 10: OAuth Token Management for Multiple Services

**What goes wrong:**
Managing OAuth tokens for Garmin (OAuth 2.0 PKCE) and potentially Yazio across multiple users creates complexity: tokens expire, refresh fails silently, users revoke access without the app knowing, and rate limits interact with token refresh. If using unofficial Garmin access, session tokens are even more fragile (Cloudflare challenges, login rate limits of "too many requests").

**Prevention:**
- Implement robust token refresh with exponential backoff
- Handle all OAuth error states explicitly (expired, revoked, rate-limited)
- Queue data sync operations and retry with backoff on 429 errors
- Notify users when their connection is broken and needs re-authentication
- Store tokens encrypted, never in plaintext or logs
- Note: Garmin is migrating from OAuth 1 to OAuth 2 by 12/31/2026 -- build exclusively on OAuth 2.0 PKCE

**Phase to address:** Data integration phase.

---

### Pitfall 11: Social/Gamification Feature Causes Harm Instead of Motivation

**What goes wrong:**
Leaderboards and competition features create toxic dynamics: faster athletes dominate, slower athletes feel shame, injured athletes feel FOMO pressure to train through pain, and excessive gamification causes "gamification burnout" (confirmed by 2025 research from Frontiers in Psychology). The research shows an S-shaped relationship: moderate gamification helps, but beyond a threshold, additional features cause information overload and emotional exhaustion. Competition elements specifically can cause "social overload" and privacy concerns.

**Prevention:**
- Use Self-Determination Theory (SDT) as the design framework: support autonomy, competence, and relatedness -- not extrinsic rewards and pressure
- Normalize relative achievements: "your best effort" not "rank vs. others"
- Opt-in competition only (never default-on leaderboards)
- Time-limited challenges instead of permanent rankings
- Private by default: users choose what to share
- Progress framing: "you improved 5%" not "you're ranked 47th"
- Limit gamification feature density: research shows diminishing and then negative returns from adding more badges/achievements/streaks
- Never show training data that could enable unhealthy comparison (e.g., don't show others' calorie intake)

**Phase to address:** Social/gamification phase. Conduct user research before building. This is where "research-driven" design from the PROJECT.md requirements pays off.

---

### Pitfall 12: AI Context Window Cost Explosion

**What goes wrong:**
Each coaching interaction requires context: the user's training history, current metrics, plan state, recent conversations, knowledge base references. Without prompt caching, costs scale linearly with context size times number of interactions. A single user asking 5 questions/day with 20K tokens of context = 100K input tokens/day = significant cost at scale.

**Prevention:**
- Use Claude's prompt caching (noted in PROJECT.md constraints) to cache the static portions: knowledge base, user profile, training plan
- Structure the context as: [cached: knowledge base + user profile + plan] + [dynamic: recent metrics + conversation]
- Implement conversation summarization: compress old conversation turns rather than including full history
- Pre-compute daily summaries of training state so the AI doesn't need raw activity data in context
- Set token budgets per interaction and monitor costs per user

**Phase to address:** AI coaching phase. Design the context architecture before building the chat interface.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding training zones (Coggan 7-zone) | Quick implementation | Cannot support Seiler 3-zone, polarized, or custom zone models | Never -- use configurable zone system from start |
| Storing all Garmin data as raw JSON blobs | Fast to implement sync | Cannot query, aggregate, or analyze efficiently; schema changes break things | Early prototype only, migrate within weeks |
| Single combined CTL for all sports | Simpler model | Misleading training load, incorrect TSB, bad recommendations | Never for a coaching platform |
| Skipping FIT file validation | Faster workout export | Users get corrupt files, bad device experience, support burden | Never |
| Using unofficial Garmin API without abstraction layer | Faster to start | Rewrite required when migrating to official API or when unofficial breaks | Only if data layer is properly abstracted |
| Synchronous Garmin data sync in request/response | Simpler architecture | Slow page loads, timeout errors, API rate limit hits | Never for multi-user |

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Garmin Connect API | Assuming you can upload workout .FIT files via the upload API | Upload API only accepts Activity files. Workouts must go through Garmin Connect's workout creation endpoints (Training API) or manual sideloading |
| Garmin Connect API | Polling for new data on every page load | Use Garmin's push notification system (webhook/ping) in the official API; for unofficial, schedule background sync every 15-30 min |
| Garmin Connect API | Not handling the OAuth 1 to OAuth 2 migration | Build exclusively on OAuth 2.0 PKCE. OAuth 1 retirement is 12/31/2026 |
| Yazio | Assuming the 2020 reverse-engineered API still works | Spike-test first. Plan for manual entry / CSV import as fallback |
| Yazio | Making browser-side API calls | CORS blocks browser requests. Must proxy through your backend server |
| Claude API | Sending raw training data as context | Pre-compute summaries and structured data. Send "CTL: 85, ATL: 92, TSB: -7, last 3 workouts: ..." not raw FIT file data |
| Claude API | No output validation | Always validate AI-generated workout prescriptions against safety rules before showing to user |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Recalculating CTL/ATL from full activity history on every request | Slow dashboard loads | Calculate incrementally: store yesterday's CTL/ATL, apply today's TSS with exponential decay formula | >30 days of data per user |
| Storing every Garmin data point (per-second HR, power) | Database bloat, slow queries | Store activity summaries + power curve data. Keep raw data in cold storage or don't store at all | >100 activities per user |
| Generating FIT files synchronously on HTTP request | Request timeouts, poor UX | Generate async, return download link or push notification when ready | >10 concurrent users |
| Full AI context rebuild per message | High latency, high cost | Cache stable context segments, only rebuild dynamic portions | >5 messages/day/user |
| Fetching all user data from Garmin on every sync | Rate limit exhaustion | Track last sync timestamp, only fetch new/updated data | >50 users with eval API keys |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing Garmin/Yazio OAuth tokens in plaintext | Token theft enables access to user's health data on Garmin | Encrypt tokens at rest with per-user keys. Use secure credential storage (vault, encrypted DB columns) |
| Logging AI conversation content with health data | Log files contain sensitive health discussions | Redact or exclude health data from application logs. Separate conversation storage with access controls |
| No rate limiting on AI coaching endpoint | Cost attacks: malicious user sends thousands of messages | Per-user rate limits on AI interactions (e.g., 50 messages/day) |
| Exposing other users' training data via API | Privacy violation, potential GDPR breach | Strict per-user data isolation at the query/ORM level. Never rely solely on frontend to filter |
| Storing training/health data without encryption | Data breach exposes sensitive health information | Encrypt health data at rest. Use field-level encryption for the most sensitive fields (HRV, body weight, nutrition) |

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Overwhelming dashboard with every metric | Information overload, decision paralysis | Show 3-5 key metrics on the morning view. Details on drill-down. Lead with "what should I do today?" |
| Showing raw TSS/CTL/ATL numbers without context | Numbers mean nothing to most athletes | Show trend arrows, color-coded zones (green/yellow/red), plain language ("you're carrying moderate fatigue") |
| Requiring manual data entry for body metrics | Users stop logging after a week | Auto-sync everything possible from Garmin. Only ask for data you can't get automatically |
| Rigid workout display without modification options | Athlete can't adapt workout to real conditions | Allow quick modifications: "I only have 30 min" / "I don't have a trainer" / "make it easier" via AI chat |
| Showing other users' better numbers by default | Shame, discouragement, toxic comparison | Default to personal progress view. Opt-in social comparisons. Celebrate consistency, not just performance |
| Notification spam about training recommendations | Users disable notifications, miss important alerts | Minimal notifications: one morning briefing + critical alerts only (injury risk, connection broken) |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Garmin data sync:** Often missing error recovery for partial sync failures -- verify that a failed activity fetch doesn't block sleep/HRV data fetch
- [ ] **FIT workout export:** Often missing device compatibility testing -- verify files work on at least 3 different Garmin device generations
- [ ] **Training load model:** Often missing handling of "zero days" (rest days with no data) -- verify CTL/ATL decay correctly on rest days rather than staying flat
- [ ] **AI coaching chat:** Often missing safety validation layer -- verify AI output is checked against safety rules before display, not just relying on system prompt
- [ ] **Periodization engine:** Often missing "re-entry" logic after time off -- verify the plan intelligently scales back after 3+ missed days rather than resuming at full load
- [ ] **Nutrition integration:** Often missing the "no data" state -- verify the platform works well without nutrition data rather than showing broken/empty states
- [ ] **Social features:** Often missing privacy controls -- verify users can hide specific activities, metrics, or their entire profile from others
- [ ] **User deletion:** Often missing complete data removal -- verify that deleting an account removes all data including: AI conversation history, cached Garmin data, social interactions, and analytics events

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| AI gives dangerous advice | MEDIUM | Add immediate safety filter. Review all past AI conversations for harmful advice. Notify affected users. Add safety test suite. |
| Garmin unofficial API breaks | LOW-MEDIUM | Swap to backup data source or pause sync. Notify users their data may be stale. Push for official API approval. |
| FIT files incompatible with devices | LOW | Fix generation code. Re-generate and re-distribute affected workouts. Add device-specific test suite. |
| Training load model is wrong | HIGH | Recalculate all historical load data. Adjust all active plans. Communicate to users that metrics have been corrected. |
| Yazio API stops working | LOW | Switch to manual entry or CSV import fallback. Notify users about alternative nutrition tracking. |
| GDPR violation discovered | HIGH | Engage legal counsel immediately. File breach notification within 72 hours if data exposed. Implement missing controls. Audit all data processing. |
| Eating disorder incident | HIGH | Remove harmful content immediately. Review and strengthen nutrition safety guardrails. Consider adding professional review of nutrition features. |
| Social feature causes harm | MEDIUM | Disable problematic feature. Gather user feedback. Redesign with behavioral psychology input. Re-launch with opt-in only. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Dangerous AI advice | AI coaching (Phase 1) | Safety test suite passes; manual review of 100 sample interactions |
| Garmin API access blocked | Pre-development (Phase 0) | Developer Program application approved OR abstraction layer tested with unofficial fallback |
| Nutrition/ED trigger | Nutrition integration phase | Nutrition UI reviewed by health professional; no weight-loss framing in any output |
| Yazio API unreliable | Pre-development spike | Spike test confirms endpoints work OR fallback plan documented and implemented |
| Multi-sport TSS errors | Training load engine | Sport-specific load tracked separately; accuracy validated against TrainingPeaks for sample data |
| FIT file incompatibility | Workout export phase | Files validated with FIT SDK tool; tested on 3+ Garmin device models |
| Plan rigidity/reactivity | Periodization engine | Strategic vs. tactical layer separated; test scenarios for missed days, illness, travel |
| GDPR violations | Phase 1 (auth/accounts) | DPIA completed; explicit consent flows implemented; deletion tested end-to-end |
| Social feature harm | Social/gamification phase | User research conducted; SDT framework applied; opt-in only verified |
| AI cost explosion | AI coaching phase | Prompt caching implemented; per-user cost monitoring in place; token budgets enforced |
| Stale FTP | Training load engine | FTP staleness alert implemented; auto-detection from ride data working |
| OAuth token management | Data integration phase | Token refresh tested; error states handled; encrypted storage verified |

## Sources

- [Garmin Connect Developer Program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/) -- HIGH confidence (official)
- [Garmin FIT SDK Documentation](https://developer.garmin.com/fit/) -- HIGH confidence (official)
- [Garmin FIT Workout File Types](https://developer.garmin.com/fit/file-types/workout/) -- HIGH confidence (official)
- [python-garminconnect Issues #127, #213, #332, #337](https://github.com/cyberjunky/python-garminconnect) -- HIGH confidence (direct observation of breakage)
- [Garth deprecation discussion](https://github.com/matin/garth/discussions/222) -- HIGH confidence (maintainer announcement)
- [TrainingPeaks TSS/CTL/ATL documentation](https://help.trainingpeaks.com/hc/en-us/articles/204071944-Training-Stress-Scores-TSS-Explained) -- HIGH confidence (official)
- [TrainingPeaks: TSS vs hrTSS](https://www.trainingpeaks.com/learn/articles/training-with-tss-vs-hrtss-whats-the-difference/) -- HIGH confidence (official)
- [Garmin 50-step workout limit forum](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/303108/50-step-workout-limit) -- MEDIUM confidence (community + verified)
- [Harvard: AI tools offer harmful eating disorder advice](https://hsph.harvard.edu/news/artificial-intelligence-tools-offer-harmful-advice-on-eating-disorders/) -- HIGH confidence (academic)
- [Frontiers in Psychology: S-shaped gamification impact](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1671543/full) -- HIGH confidence (peer-reviewed)
- [GDPR Advisor: Wearable Technology](https://www.gdpr-advisor.com/gdpr-and-wearable-technology-protecting-personal-health-data/) -- MEDIUM confidence (specialized legal source)
- [saganos/yazio_public_api](https://github.com/saganos/yazio_public_api) -- LOW confidence (unofficial, last updated 2020)
- [Athletech News: Dark Side of AI Fitness Apps](https://athletechnews.com/dark-side-of-ai-fitness-apps-personal-trainers-warn/) -- MEDIUM confidence (industry publication)
- [Garmin OAuth 2.0 PKCE specification](https://developerportal.garmin.com/sites/default/files/OAuth2PKCE_1.pdf) -- HIGH confidence (official)
- [Daniel-Vitanza/Garmin-Strength-Training-Fit-File-Generator](https://github.com/Daniel-Vitanza/Garmin-Strength-Training-Fit-File-Generator) -- MEDIUM confidence (community, confirms 50-step limit workaround)
- [Uphill Athlete: TrainingPeaks Metrics](https://uphillathlete.com/aerobic-training/trainingpeaks-metrics-ctl-tss/) -- MEDIUM confidence (coaching authority)

---
*Pitfalls research for: AI-powered cycling/multi-sport training platform*
*Researched: 2026-04-16*
