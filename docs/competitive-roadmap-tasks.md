# Competitive Roadmap — Prioritized Task List

*July 2026. Derived from `docs/competitive-analysis-2026-07.md`. Adversarially reviewed (fact-check, code-claim verification against the repo, completeness, strategy skepticism) and corrected — file anchors below are verified. Each task: why (research anchor), what (concrete scope), where (verified file anchors). Quality bar per project memory: every frontend change rendered, screenshotted desktop+mobile, critiqued, iterated.*

Priority key: **P0** = unlock built value / foundation (small, high-leverage). **P1** = signature differentiators. **P2** = depth & coverage.

> **Cutline (stated up front to avoid the Athletica failure mode — strong engine, half-finished product):**
> **Fall release = all of P0 + P1.1–P1.5.** P1.6–P1.9 ride along only if free. All of P2 is post-October, except P2.1 Season Wrapped, which descopes to a *static* season summary if the P1.3 recap machinery isn't done by early September.

---

## P0 — Unlock what's built + foundation

### P0.1 Wire the coach-safety interlock into the live app ✅ SHIPPED (July 18)
- **Why:** The analysis's "no competitor has this" claim is only true in code: `useAdaptiveGate.ts` and `CoachSafetyBanner.tsx` are imported by nothing, `DuelArena`/`PowerArena` are unmounted, and the backend nudge path (`api/crews.py` `send_nudge`) applies no physiology check — trash-talk nudges send regardless of rest state. The ethical signature must actually ship before we can market it.
- **What:** Mount the gate in `SocialTab` (suppress/mute competition copy + challenge CTAs when directive = rest/deload, show the calm banner instead); add the physiology check to the backend nudge send path (block or soften when recipient is in rest/deload, with honest copy); decide fate of unmounted `DuelArena`/`PowerArena` (fold or delete).
- **Where:** `frontend/src/hooks/useAdaptiveGate.ts`, `components/social/CoachSafetyBanner.tsx`, `components/social/tabs/SocialTab.tsx`, `backend/app/api/crews.py:718`.

### P0.2 Forgiving streaks + athlete status ✅ SHIPPED (July 18)
- **Why:** Gentler Streak's most-quoted emotional hook *in reviews* ("so caring", "unique"); our live streak (TodayTab week-dots) = raw activity presence = the guilt mechanic they killed. Retention research: "streaks as gentle continuity, not ransom."
- **What:** Streak counts *adherence to the plan* — planned rest days count; a status (healthy / sick / injured / life happens / taper) pauses without breaking, and feeds the plan (sick → auto-deload via the adaptive engine). Flame gets a "paused" state with honest copy ("Streak alive — you rested when the plan said rest. That's the skill."). Consolidate the two divergent implementations: the live one is `TodayTab.tsx:178-201` (week-dots + streak memo); the unmounted `StreakStrip.tsx` has different 3-goal-chain semantics — delete or explicitly resurrect, don't leave both.
- **Where:** `TodayTab.tsx:178-201`, `StreakStrip.tsx` (decide), new status field (day-log or profile), `adaptive_readiness.py` hook-in, `i18n/strings.ts` EN/DE.

### P0.3 Recovery ETA — "fully fresh by Thursday" ✅ SHIPPED (July 18)
- **Why:** A top item on Bevel's own feedback board that they haven't shipped. Honest scope (verified): the forward TSB simulator **does not exist yet** — `performance_projection.py` projects eFTP (not TSB) and `pmc_service.py` is historical-only; nearest prior art is the single-point `tsb_projected_at_goal` heuristic in `goal_trajectory.py:263-274`.
- **What:** New forward-PMC function in `pmc_service.py`: EWMA CTL/ATL recurrence rolled forward under the planned week's per-day `target_tss` (exists in `api/weeks.py`); uncertainty band from historical planned-vs-actual TSS variance. Card on Today (post-hard-session + rest states) and Recovery: "Fresh by Thursday; racing-sharp Saturday" + mini TSB-forward curve. Budget 2–3 days, not hours.
- **Where:** `pmc_service.py` (new), `api/weeks.py` (planned TSS), new `RecoveryEtaCard`, TodayTab states, RecoveryTab.

### P0.4 "Why this?" inputs + one-tap alternates (choice architecture) ✅ SHIPPED (July 18)
- **Why:** The #1 cross-cutting gap (black boxes vs. horoscopes) *plus* the research's choice prescription: Gentler Streak's "Go Gentler" grammar is state → empathetic headline → **2–3 concrete options**; Bevel's weak point is score-without-prescription. Our brief already computes alternates and `workout_modifier.py` applies rails-safe swaps — nothing surfaces them.
- **What:** On the Today workout card: (a) expandable "Why this?" showing the 2–4 specific inputs ("48h load 132 TSS · HRV −8% vs baseline · 141 days to Maratona") + optional citation chip ("Seiler 80/20"); (b) 2 rails-safe alternates ("45-min version / indoor / gentler") with one-tap swap through the existing modifier path. Verified anchor: the live adaptation disclosure is the inline "What changed & why" block at `TodayTab.tsx:580-590` (NOT `AdaptiveDirectiveCard`, which is orphaned — delete or mount it consciously).
- **Where:** `TodayTab.tsx:580-590`, `coach_service.py` brief payload (alternates already exist), `workout_modifier.py`, `/coach/why`.

### P0.5 Insights section — curated resurrection (P0.1-lite) + AI-FTP framing ✅ SHIPPED (July 18)
- **Why:** The orphaned analytics cards overstate the hiddenness — `/load-form` already shows injury-risk/ACWR (`LoadFormView.tsx:404`), monotony (`:555`), fitness signals (`:197`), trajectory (`:247`). Curate the *truly missing*, don't resurrect wholesale. And TR's most-loved feature (AI FTP detection) is capability we have but don't frame.
- **What:** One "Insights" section (on Analyze/HistoryTab or BikeProgressView): the 4–5 genuinely missing cards — PMC chart, TID/polarized distribution (this mounts `UncertainValue`, currently fully unsurfaced), efficiency trend, VO₂max estimate, form-progress panel — each meeting the engaging-surface bar. Add the FTP confidence card: "FTP 240 W — detected from your rides, no test day. Confidence: high (38 rides)" (honest when shaky; the AI-FTP +10% fiasco is the cautionary tale). Link power users to `/dashboards` ("build any chart by asking" — a differentiator no competitor has). Then **delete the remaining orphans unharvested** (`AnalyzeTab`, `TrendsTab`, `ReportTab`, `CrewTab`, `WeekTab`, `WorkoutsTab`, orphaned cards) — git history keeps them.
- **Where:** donors `components/dashboard/tabs/{AnalyzeTab,TrendsTab,ReportTab}.tsx`; recipients `HistoryTab.tsx` / `BikeProgressView.tsx`; `api/ftp.py`.

### P0.6 Data-foundation hardening  ⚠ strategic, start immediately
- **Why:** The entire watts-anchored strategy sits on an unofficial reverse-engineered Garmin client (`garmin_client.py`: SSO fallback chain, TLS fingerprint impersonation, rate-limit bans). For a paid product this is existential; approval for official programs takes weeks — the application must start before feature work.
- **What:** (a) Apply to Garmin's official Connect Developer / Health API program now; (b) generic FIT-file upload endpoint as universal fallback (works for every head unit, also de-risks Wahoo/Apple gaps); (c) sync-health surface: last successful sync per source, per-activity ingest status, visible failure + retry, notification on silent breakage (SettingsPage TODO + `GarminSyncedBanner`).
- **Where:** `garmin_client.py` (unchanged; this is additive), new FIT upload in backend, `SettingsPage.tsx`, `GarminSyncedBanner`.

---

## P1 — Signature differentiators

### P1.1 "The Road" — forward-looking load corridor ✅ SHIPPED (July 18)
- **Why:** Gentler Streak's Activity Path is the best load viz in consumer fitness; ours can be honest physics (CTL ramp-rate envelope + TSB bounds + the actual planned week) and bike-native (drawn like a route profile). Directly answers "playful AND more insightful." Apple's ADA rationale explicitly cited their *bidirectional* nudge — ours must warn at both band edges.
- **What:** One hero viz: past 21 days + today + 10 days ahead. Corridor = safe-load envelope; line = rolling actual; the ahead segment consumes P0.3's forward-PMC simulator with the planned week; key days marked; position-in-band → verbal state reusing readiness tiers; tap future day → that day's workout (route exists). Top-of-band warns overreaching, bottom warns detraining. Desktop+mobile, reduced-motion safe, EN/DE.
- **Where:** new `TheRoadCard` on Today (absorbing the PMC sparkline), `pmc_service` forward fn + `api/weeks.py`.

### P1.2 Breakthrough moments ✅ SHIPPED (July 18 — v1: Today card; recap + share-card integration ride with P1.3)
- **Why:** Xert proved physiology-triggered celebration is the category's only real fun; their failures (jargon, missed detections) define our bar. **Data caveat (verified):** `get_activity_details` caps at `maxChartSize=10000` (`garmin_client.py:223`) → rides >~2h45m return downsampled streams; sprint-duration PBs computed from mixed-resolution streams will misfire.
- **What:** Detection service over per-ride CP/W′ + power curve: v1 restricted to **durations ≥60 s** (downsampling-safe); short-duration PBs only from Garmin's per-activity summary max-power fields. Sampling resolution is an explicit input to the confidence gate — never celebrate dirty data (Xert's missed-breakthrough grumbling killed the magic). On detection: celebration card on debrief + Today (confetti exists), plain-language explanation ("Your 5-min power beat everything in 90 days — the ceiling moved"), **shareable image card** (this is also the acquisition channel — quality matters).
- **Where:** new `backend/app/services/breakthrough_detector.py`, `power_curve.py`, `activity_streams` fields, `DebriefHero`, `TodayTab`, `lib/confetti.ts`.

### P1.3 Weekly recap story
- **Why:** Gentler Streak's recaps + a "Wrapped" being a top Bevel board item prove the ritual; retention research: "apps that own [reflection + planning] own the athlete."
- **What:** Monday-morning animated story (4–6 swipeable panels): load vs plan, best moment (breakthrough/PB/duel), consistency, insight of the week ("Z2 discipline improved decoupling 2.1%→1.4%"), next week's shape. Self-referential only; **shareable image export as a first-class deliverable**; EN/DE.
- **Where:** new `WeeklyRecapStory` route + Monday Today entry card; data from `period_report`, `session_report`, crew/duel results, P1.2 detections.

### P1.4 Absorb-and-replan (promoted from P2 — was mis-scoped as a stub-finish)
- **Why:** JOIN silently absorbing a group ride and re-planning is **the single most-praised adaptive behavior in the research**; rigid plans and guilt are the most hated. A manual "re-plan" button under-serves it.
- **What:** On sync, detect an unplanned or longer/harder-than-planned ride → automatically reshuffle the remaining week via `weekly_plan_llm.py` + `enforce_week_rails` → non-guilt disclosure card: "Great group ride — 82 TSS banked. Thursday's threshold moved to Friday." **Audit the compliance letter-grades so an unplanned ride is never graded as failure** ("overcooked" shaming a group ride violates the whole thesis). The "coming soon" stubs live on an unmounted card (`PrescribedWorkoutCard` inside never-mounted `CoachBrief`) — this is new work, not stub-finishing.
- **Where:** `garmin_sync_service.py` (trigger), `weekly_plan_llm.py`, `ride_matching.py`/`ride_compliance.py` (grade audit), new disclosure card on Today/Train.

### P1.5 Morning brief push — the ritual delivery vehicle
- **Why (critique find):** Bevel's 8-opens/day ritual is *manufactured* by proactive check-ins/widgets. We have an excellent Today page and nothing that summons the athlete to it. This is the delivery vehicle for P0.3, P0.4, P1.1.
- **What:** PWA web-push morning brief: readiness + one heroLine + deep link straight to Today (every push must deep-link to the exact card it describes — Bevel's dead-link notifications are a repeated gripe); quiet-hours + rest-day aware (a rest-day push says rest, gently); app badging; PWA install prompt at the right moment (after first "wow", not first visit).
- **Where:** backend push service (new; APScheduler exists), service worker in `frontend/public/`, settings opt-in.

### P1.6 Illness early-warning, anxiety-safe
- **Why (critique find):** `readiness_detector.py` (ILLNESS > OVERREACHING on ln(RMSSD) baselines, Plews/Altini) is built and surfaced nowhere. Oura's lesson: warmth without context creates *health anxiety* — surfacing needs deliberate calm design.
- **What:** Calm, input-showing card: "HRV and RHR moved together overnight — often early fatigue or illness. Today became Z1. Feeling fine? Dismiss." Non-diagnostic language, one-tap dismiss, inputs always visible; Confirm → sets P0.2 status → auto-deload. Never push-notify illness suspicion; it waits on Today.
- **Where:** `readiness_detector.py` (wired via `api/weeks.py`), new card on Today/Recovery, P0.2 status integration.

### P1.7 Coach voices v1 — two voices, honestly scoped
- **Why:** Bevel's most differentiated UX idea — but they afford 4 voices because an LLM restyles copy at runtime; our praised heroLines are hand-written deterministic EN+DE variants, and 4 voices = 4× hand-authoring tax on every future string.
- **What:** v1 = two voices by polishing what exists: rename simple/technical → **Analyst** (watts & CIs) / **Compañero** (warm), apply the voice param to LLM-generated brief/debrief narratives server-side (`coach_service.py` already forks on tone). heroLines, notifications, i18n stay single-voice. Voice picker in settings + onboarding. A third voice (Directeur Sportif) only if v1 proves retention. Rails unchanged — voice styles wording, never prescriptions.
- **Where:** `coach_service.py` (`_simple_*`/`_technical_*` → voice), profile field, settings/onboarding.

### P1.8 Event-terrain countdown
- **Why:** Moat candidate 2. Nobody plans toward *terrain*. Verified anchor: `BikeProgressView.tsx` has an Event Prediction card (current vs projected finish time, ~line 703); climbing analysis (VAM, W/kg, HC/1–4) + mountain-specificity exist in backend.
- **What:** Upgrade the Today race chip + Train plan card into an event block: "Maratona dles Dolomites — 141 days. 3,800 m climbing. Projected finish improving. Climb readiness: Cat-2 legs today; the Giau needs one more build block." Tie workouts to the event ("today's 4×8 = the Campolongo, twice"). Include the fueling requirement for long mountain days ("the Maratona needs ~90 g/h; your longest rides average 52 g/h" — `fueling_analysis.py` is live but debrief-only).
- **Where:** `goal_trajectory.py`, `climbing_analysis.py`, `performance_projection.py`, `fueling_analysis.py` → new `EventCountdownCard` on Today + Train.

### P1.9 Ride story: matches burned
- **Why:** Differentiator 3; W′bal drama is cycling-native and buried in debrief-only `matchbook.py`.
- **What:** In every powered ride analysis: "You burned 4 matches. The big one: 620 W for 40 s at km 72 — it cost 8 min of recovery glide." Timeline chips; weekly aggregate feeds the recap. Plus carbs/hour-vs-demand line (fueling carve-out — *analysis*, never diet logging).
- **Where:** `matchbook.py`, `wbal_trace.py`, `fueling_analysis.py` → `RideAnalysisView`/`DebriefView` `RideStory`; weekly recap.

---

## P2 — Depth, coverage (post-October)

### P2.1 Season Wrapped — extends P1.3 machinery (km, climbing meters = "3.2 Everests", breakthroughs, duel record, identity arc). **Descope to a static summary if recap machinery is late** — a beautiful static page in October beats an animated one in December.
### P2.2 Journal + RPE override — notes/photos/RPE per session; RPE disagreement flags fatigue and corrects the load model. `session_report.py`, HistoryTab, DebriefView.
### P2.3 Achievements: mount AND persist — `AchievementBadges.tsx` is localStorage-only **and unmounted** (verified); scope = re-mount on a reachable surface + backend table.
### P2.4 Energy today curve — Bevel Energy-Bank analogue from morning readiness + session W′/TSS drain; honest "—" without intraday data.
### P2.5 Menstrual cycle opt-in — activate the built-but-dead `menstrual_adjustment.py` by adding the profile field + opt-in flow (GDPR consent infra exists).
### P2.6 Workout export, honestly — `workout_export.py` already produces .zwo/.erg/.mrc (verified): surface it in WorkoutDetailView + a "get it onto your head unit" guide. True Garmin device push **only after** P0.6's official-API approval — `garmin_client.py` is read-only; do not schedule push against the scraper.
### P2.7 Apple Health & Wahoo honesty sweep — Apple Health ingestion is *already automated* via the Auto Health Export webhook (`api/apple_health.py`, verified): audit payload coverage/frequency/error visibility instead of rebuilding. Wahoo: configure server OAuth or hide the onboarding option — advertising a dead integration is the exact Bevel 1-star wound. Sweep all surfaces for advertised-but-stubbed promises.
### P2.8 Crew feed, interlock-aware — lightweight: crew rides, breakthrough/recap share cards land here, kudos-style reactions; celebration prompts muted when recipient should rest. **Only invest once there's user mass** — until then share cards point outward (Strava/WhatsApp), not inward.
### P2.9 Crew quality challenges — templates tied to training quality ("Z2 discipline week"), not volume. Mount `BandChip.tsx` (W/kg bands, "Good, climbing" framing — currently unmounted). Same user-mass caveat.
### P2.10 Cold-start backfill moment — onboarding computes from Garmin history: "We read your last 90 days: FTP ~242 W (high confidence), CTL 54. Your first brief is ready." Day-one wow; avoids a first Today full of honest "—".
### P2.11 Data export / openness — FIT/CSV of activities + computed metrics, or one-way Intervals.icu push. "Your data is yours."
### P2.12 Individualized Banister τ — resurrect `impulse_response.py` (dead, test-only) to personalize P0.3/P1.1 projections; the literal implementation of "learns how YOU respond" that Bevel gets praised for claiming.

---

## Explicitly not doing (and why)

- **Global leaderboards / vs-pros comparisons** — demoralizing (retention research); W/kg bands + crews only.
- **Loot mechanics, arbitrary badges, login streaks** — celebration must be earned physiologically.
- **LLM free-generation insights without model grounding** — Strava horoscope trap; keep rails + deterministic state.
- **Visible AI metering** — cuts against ritual formation (Bevel meters via credit packs; we won't).
- **Nutrition logging / strength-library depth / biological age** — Bevel's breadth-over-depth trap. (Carve-out: in-ride *fueling analysis* is bike-native, already built, and ships in P1.8/P1.9.)
- **In-ride execution mode (ERG screens, live intervals)** — head units execute (P2.6 export/push); we own the before (plan/brief) and after (debrief/story). Avoids JOIN's worst UX gripes and sharpens positioning.
- **A mascot** — grounded wit in copy is our personality carrier; revisit only if the app still feels cold after the P1 wave.
- **ACWR-as-injury-oracle / RL plan generation** — per training-science memory: hype to avoid.

## Sequencing

P0 order: **P0.1 (interlock) → P0.2 (streaks) → P0.3 (recovery ETA) → P0.4 (why + alternates) → P0.5 (Insights curation) — with P0.6's Garmin application filed on day one** (approval lead time runs in parallel). Then P1.1–P1.3 share celebration/recap infrastructure — build P1.2's detector before P1.3 so recaps feature breakthroughs. P1.4 and P1.5 are independent and high-retention; P1.6–P1.9 fill as capacity allows. Release framing: P0 wave = "the app got deeper and kinder"; P1 wave = "the app became a place you want to be every morning."
