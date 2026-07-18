# Our App — Feature Inventory (competitive-analysis baseline, July 2026)

*Produced by a very-thorough codebase sweep. File anchors cited throughout.*

Stack: React 19 + Vite + TypeScript + TanStack Query + `motion/react` frontend (`frontend/src`); FastAPI + SQLAlchemy async + Alembic + APScheduler backend (`backend/app`); Anthropic Claude (Opus 4.8 for briefs/debrief, Sonnet 4.6 for chat). Fully bilingual EN/DE (`frontend/src/i18n/strings.ts`). PWA.

## 1. Surfaces (pages / routes / tabs)

Routing in `frontend/src/App.tsx`. All app routes lazy-loaded, gated by `ProtectedRoute checkOnboarding`.

**Auth / onboarding funnel**
- `/login`, `/register`; `/consent` (GDPR gate, `api/consent.py` + RLS); `/profile-setup`.
- `/onboarding` (`components/onboarding/OnboardingWizard.tsx`, 1046 L) — 8-step wizard: Welcome, Connect data (Garmin/Wahoo/Apple Health), You (DOB, max/rest HR), Zones (est. FTP + power/HR zones), Availability, Goal, Intensity, Review. Wahoo step shows "isn't configured on this server yet… (coming soon)" when unconfigured (`OnboardingWizard.tsx:601`).

**Main dashboard** — `/dashboard` (`pages/DashboardPage.tsx`), 5-tab orchestrator via `?tab=`. Shell: sticky `StickyReadinessBar`, `GarminSyncedBanner`, `MobileBottomNav`, Cmd+K `CommandPalette` → `CoachChat` portal, `LocaleSwitch`, `SyncButton`.

- **Today** (`tabs/TodayTab.tsx`, 810 L) — flagship. Readiness hero (gradient/glow keyed to readiness color, `ScoreRing` /100, decision pill, personalized one-liner). **Moment-adaptive metric row** switches by wall-clock + whether trained: morning→overnight recovery (HRV Δ / Sleep / RHR / on-deck TSS), post→session wrap-up (Duration / TSS / IF / letter Grade A+–F), evening→wind-down. Momentum chips (streak flame + 7-day CTL trend). Race chip (goal + days-to-go). `SessionReviewCard`. Rest-day card. Coral Workout card with "What changed & why" adaptation disclosure (signal ↑/↓ · action · detail · principle). Training-Load card (CTL/ATL/TSB + mini 7-day PMC sparkline) → `/load-form`. Streak weekday dots.
- **Train/Plan** (`tabs/PlanTab.tsx`, 988 L) — sport toggle (bike/run/all), plan card, `WeekStrip`, coral workout-of-day with interval-profile bars, upcoming, Power/Pace/HR zone tables, cross-training/strength.
- **Recovery** (`tabs/RecoveryTab.tsx`, 636 L) — ~16 cards: readiness ring, HRV, RHR, sleep (stages gracefully "—"), body battery, SpO₂/skin-temp/respiration ("—" where Garmin feed absent), behavior journal placeholder.
- **Analyze** (routes to `tabs/HistoryTab.tsx`, 913 L) — month summary, month calendar, consistency heatmap, weekly-load trend, personal records, recent activities; generative per-activity SVG thumbnails. Filter chips (all/cycling/running/gym).
- **Social** (`components/social/tabs/SocialTab.tsx`, 1397 L) — see §4.

**Routed drill-downs** (self-contained)
`/load-form` (711 L), `/activities/:id/ride` (953 L), `/activities/:id/run`, `/activities/:id/debrief` (`DebriefHero`/`KeyReads`/`CompareDuel`/`RideStory`/`BreakdownPanels`/`DebriefPlan`), `/activities/:id/session-report`, `/workout/:date` & `/workout/today`, `/recovery/trends`, `/progress/run|bike|lift`, `/calendar`, `/activities`, `/coach`, `/settings`, `/profile`, `/dashboards` (custom chart workspace with natural-language chart generation), `/garmin/connect`.

## 2. Coaching intelligence

**Daily brief engine** — `backend/app/services/coach_service.py` (~3500 L). `build_snapshot` assembles profile + PMC + HRV/RHR/sleep trends + 14-day activity summary → `generate_brief` (Claude Opus) picks a workout from a **12-template whitelist** and writes rationale. Hard server-side rails: watts re-derived from FTP (LLM cannot dictate watts), duration ±15%, safety rails run AFTER LLM and downgrade over-prescriptions, `_rule_based_brief` full fallback. Prompt caching (~80% token savings). Brief output: `prescribed_workout` (+`why_this_workout`), `adaptations` (signal/direction/action/detail/principle), `post_ride_review` (grade perfect/strong/okay/overcooked/undercooked), `verdict`, `tomorrow_plan`, `regeneration`, `outlook`, alternates. Two tones: `_simple_*` vs `_technical_*`. Knowledge base injected as cached prefix (`services/coach_knowledge.py` — HRV/rHR/sleep thresholds, Banister, ACWR, Seiler TID, citation-backed).

**Plan generation / adaptation**
- Deterministic 4-week periodization: `services/mesocycle_generator.py` (Friel phase from target event + CTL, Issurin 3:1, Seiler TID, %FTP blocks only, idempotent).
- LLM personalization: `services/weekly_plan_llm.py` — per-day template from whitelist + rationale; `enforce_week_rails` re-imposes every invariant server-side (rest stays rest, duration ±20%, week TSS ≤110% target).
- Workout modification via chat tool-use: `services/workout_modifier.py` (766 L) — "I only have 45 min" / "make it harder" / "swap to indoor". Precedence `injury_flag > intensity_ceiling > user intent`; `rails_downgraded` surfaced with human reason; append-only audit; undo tool.
- `services/adaptive_readiness.py` — autoregulation engine. Morning HRV vs 4-week rolling lnRMSSD baseline ±0.5 SD (Nuuttila 2022 / Javaloyes 2019): 5 directives rest/deload/hold/push/ESCALATE. Exposed at `/coach/adaptive`; surfaced by `AdaptiveDirectiveCard`.

**Readiness / freshness**
- `services/readiness_score.py` — 0–100 composite of 6 weighted signals (hrv, rhr, sleep, tsb, acwr, body_battery), each cited. Optional bounded menstrual nudge post-blend.
- `services/readiness_detector.py` — illness/overreaching detector on ln(RMSSD) rolling baseline + SWC (Plews/Altini); priority ILLNESS > OVERREACHING > AMBER > GREEN.
- Frontend readiness derived identically across Today + Recovery (`utils/metrics.ts` — single snapshot source to avoid two look-alike numbers disagreeing).

**Session rating / review** — `services/session_report.py`, `ride_compliance.py`, `ride_matching.py` (matches actual ride to planned), `workout_comparison.py`. Letter grades, compliance strips.

**Race debrief** — `services/race_debrief.py` aggregates most science modules; surfaced via `/activities/:id/debrief`. Achievement-first framing.

**Transparency** — `/coach/why`, `/coach/transparency` endpoints; `plan_change_explainer.py`, `weekly_rationale.py`, `adaptation_explainer.py`. Frontend `useWhyTired`, `WorkoutModifiedCard`, `AnalyticalAnswerCard`.

**Chat coach** — `services/coach_tools.py` tool registry (fetch_pmc_window, fetch_recovery_trend, fetch_recent_activities, fetch_ftp_history, fetch_planned_workout, modify_planned_workout, undo_last_modification), strict user_id security, streaming.

**Event / terrain awareness** — first-class `target_event_date/type/priority` (race|fondo|audax|maintenance, A/B/C) on `models/athlete_profile.py`; `services/climbing_analysis.py` (VAM, W/kg, HC/1/2/3/4 categories), `ride_segmentation.py`, mountain-specificity + climbing templates (tests `test_mountain_specificity.py`, `test_climbing_template.py`).

**Science modules** (`backend/app/services/`) — pure, citation-heavy:

| Module | Live? | Wired via |
|---|---|---|
| `critical_power.py` (CP + W′) | LIVE | activity_analysis, wko_power_model, power profile |
| `w_balance.py` / `wbal_trace.py` (Skiba) | LIVE | `/analytics/wbal-trace`, race_debrief |
| `durability.py` (fatigue resistance, decoupling) | LIVE | activity_analysis, race_debrief |
| `tid_optimizer.py` + `tid_assessment.py` (Seiler) | LIVE | `/analytics`, period_report |
| `power_phenotype.py` (sprinter/pursuiter/TTist) | LIVE | detailed_power_profile |
| `power_curve.py` / `wko_power_model.py` | LIVE / partial | wko only via race_debrief |
| `performance_projection.py` (Banister w/ confidence bands) | LIVE | `api/weeks.py` |
| `goal_trajectory.py` (Mujika taper) | LIVE | coach_service, period_report, form_progress |
| `quadrant_analysis.py`, `efficiency_metrics.py`, `matchbook.py`, `fueling_analysis.py`, `pacing_analysis.py` | LIVE-but-only-in-debrief | all feed `race_debrief.py` only |
| `menstrual_adjustment.py` | **GATED/DEAD** — no cycle field on athlete_profile, so delta always None |
| `impulse_response.py` (individualized Banister τ) | **DEAD** — test-only |

## 3. Data

**Sources**
- **Garmin** — primary. `garmin_client.py`, `garmin_sync_service.py`, `garmin_details_parser.py`, `intraday_sync_service.py`. Encrypted token store. APScheduler syncs every 4h for all `sync_enabled` users.
- **Wahoo** — OAuth flow complete in code (`api/wahoo.py`), but onboarding admits "not configured on this server yet (coming soon)."
- **Apple Health** — thinnest: manual `/setup` + `/sync` (`api/apple_health.py`) — export/shortcut ingestion, not live.

**Computed metrics** — CTL/ATL/TSB (`pmc_service.py`, `training_load.py`, `advanced_metrics.py`: zone_distribution, hrv_trend, rhr_trend, sleep_debt, why_am_i_tired), NP/IF/TSS, power curve/MMP, CP & W′, VO₂max estimate, efficiency factor, FTP estimation & history (`api/ftp.py`), monotony/strain, ACWR, ramp rate. Streams ingested + enriched (`stream_ingestion.py`, per-ride CP/W′ on `activity_streams`; backfill script exists).

**Caching** — `coach_briefs` table (`COACH_BRIEF_CACHE_HOURS = 24*365` — effectively cache-forever/invalidate-on-change; ⚠️ `coach_service.py` docstring still claims "6-hour TTL"). `period_report_cache` + `race_debrief_cache`. TanStack Query client-side. Weather via `weather_client.py`.

## 4. Social / gamification

Backend genuinely built (`api/crews.py`, `services/crew_score.py`, models crew/crew_challenge/crew_nudge + migrations).

**Live** (`SocialTab.tsx`, real hooks):
- **Weekly Battle / Duel** — you vs rival across 6 real weekly metrics (`useDuel`, `crew_score.py` "Squad Cup" math: `min(1.5, daily_TSS/target)×100`/day, TZ-boundaried). `DuelArena.tsx`, `PowerArena.tsx`, `debrief/CompareDuel.tsx`.
- **Crew leaderboard** — normalized, period toggle, W/kg banding (`BandChip.tsx` — Cat-D framed positively as "Good, climbing").
- **Challenges** — create/delete (metric/period); confetti on completion once-per-challenge.
- **Nudges** — send/receive/mark-read.
- **Member finder / invites** — discover, connect, accept/decline/revoke.
- **Coach-safety interlock** — `useAdaptiveGate.ts`: adaptive engine collapses 5 directives into go/ease/rest; **competition copy suppressed when physiology says recover** (`CoachSafetyBanner.tsx`). Described in-code as "the app's ethical signature."
- **Streaks** — `StreakStrip.tsx`, Today streak dots (real activity presence).
- **Achievements** — `AchievementBadges.tsx`: first-time milestones from activity+PMC history, **localStorage-only v0**, unlocked-only (no punishment), NEW badge <7 days, one-time toast.

**Stubbed / honest-empty:** GPS segment leaderboards and kudos feed render real structure with "—"/empty notes.

## 5. Tone & playfulness

Deliberately witty, self-aware, always grounded in a real signal. Deterministic variant picking by `today.getDate() % n` (stable per-day). Examples (`TodayTab.tsx` heroLine):
- "You banked the work and HRV's humming (+6%) — go be gloriously lazy."
- "Rest day. Your legs just sent a thank-you note — do nothing, brilliantly."
- "Legs are loaded — go make [workout] regret nothing."
- "Heads-up: HRV's dragging its feet — keep [workout] chill, hero mode can wait."
- DE mirror strings equally playful ("die HRV brummt", "sei nett zu dir und bleib horizontal").

From `i18n/strings.ts`: "Plan nailed. This is how fitness compounds." · "Solo laps are training. Racing friends is compounding interest." · "Tired is data. One easy day here saves two forced rest days later."

**Delight/animation:** `lib/confetti.ts` (dependency-free, reduced-motion-safe) on challenge completion + achievement unlock; `FormProgressPanel` celebrate glow; `ActivityRings`, `ScoreRing`, `useCountUp` count-ups, staggered reveals, `motion/react` with universal `useReducedMotion` guards. `DidYouKnow.tsx` fun facts.

**Empty/uncertain states are a designed system:** `DASH = '—'`, `UncertainValue.tsx`, `utils/confidence.ts`; docstrings explicitly forbid fabricating values.

## 6. Gaps, dead ends & unfinished

- **ORPHANED deep-analytics surface (biggest finding).** `AnalyzeTab.tsx` (polished narrative Report + collapsible charts) is imported by **zero** files — `DashboardPage` routes `?tab=analyze` to `HistoryTab` instead. Consequently `TrendsTab.tsx`, `ReportTab.tsx`, and **every rich analytics card only they import** — `CriticalPowerCard`, `WBalanceTraceCard`, `PMCChart`, `VO2MaxEstimate`, `EfficiencyTrend`, `TrainingDistributionCard`, `PolarizedDistribution`, `InjuryRiskCard`, `TrajectoryCard`, `FormProgressPanel`, `LoadFormHero`, `PaceZonesCard`, `MonotonyStrainCard`, `FitnessSignalsCard`, `PersonalBests`, `CalendarHeatmap` — are **unreachable from the main nav**. (The underlying CP/W′/PMC/TID data still surfaces through `LoadFormView`/`RideAnalysisView`/`DebriefView`, so it's a wiring/duplication gap, not missing capability.)
- **Orphaned tab components:** `CrewTab.tsx` (654 L, legacy), `WeekTab.tsx`, `WorkoutsTab.tsx` — imported by nobody.
- **Dead science modules:** `impulse_response.py` (test-only). `menstrual_adjustment.py` gated — no cycle field on profile.
- **Thin integrations:** Wahoo server-unconfigured; Apple Health manual-only.
- **Explicit "Coming soon" UI:** `push_to_garmin_soon` ("push workout to Garmin"), `replan_tomorrow_soon` ("re-plan from tomorrow") — stubbed buttons.
- **Open TODOs** (06.1/06.2 waves): `CalendarPage` (view toggles), `SettingsPage` (sync-status pill, density), `CoachPage` (thin shell), `ActivitiesPage` (filters/search). `WorkoutModifiedCard` — "backend does not yet ship `blocks`."
- **Test infra pending:** `components/ui/__tests__/*` marked "PENDING — test infrastructure not yet installed."
- **Stale doc drift:** `config.py` cache constant vs docstring.
- **Achievements have no persistence backend** (localStorage v0).
- **Graceful "—" wherever Garmin lacks a feed:** sleep stages, SpO₂, skin temp, respiration, behavior journal, GPS segments, kudos feed — intentional honesty, but unfinished data coverage.
- ~150 root-level screenshot PNGs from iterative visual QA; `session-report-mockup.html` stray at repo root.
