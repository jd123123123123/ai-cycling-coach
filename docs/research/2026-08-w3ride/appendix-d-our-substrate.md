# Reward-Layer Substrate Inventory — ai-cycling-coach

Repo root (worktree): `/Users/jannisdeters/Downloads/ai-cycling-coach/.claude/worktrees/cassette`
Branch: `cassette-reward-layer` · HEAD `2c96669` · Date of inventory: 2026-08-11

**Headline:** this app is *not* greenfield for gamification. There is already a
server-side forgiving streak, a persisted server-detected achievement catalog,
a queued celebration engine with confetti + haptics, an honest-progress meter,
a weekly Wrapped story, and an explicit written guardrail list of banned
mechanics. The interesting question is not "can we build a reward layer" but
"which of the competitor's mechanics survive contact with the existing
honesty contract."

---

## 0. PRIOR WORK: the Cassette spec + plan, and what happened to it

### The two documents

- Spec: `/Users/jannisdeters/Downloads/ai-cycling-coach/.claude/worktrees/cassette/docs/superpowers/specs/2026-08-07-today-cassette-reward-layer-design.md` (254 lines)
- Plan: `/Users/jannisdeters/Downloads/ai-cycling-coach/.claude/worktrees/cassette/docs/superpowers/plans/2026-08-07-today-cassette-reward-layer.md` (1661 lines, 9 tasks)

### What the spec committed to

| Spec § | Commitment |
| --- | --- |
| Decisions table (`:26-33`) | Evolve EDITORIAL II, don't replace. Code-first authoring (React against real data, screenshot at 390×844). Hero object = **the Cassette**, explicitly "not a gauge — every fitness app has a ring". |
| `:31` | **In bounds:** celebration on real achievement, streak with honest rules, progressive unlock, crew comparison, **guilt framing and XP** (owner decision 2026-08-06). **Out:** manufactured countdowns/scarcity with no physiological basis. |
| `:35-37` | **The one guard rail on guilt** — guilt attaches only to things the rider *chose* (skipped planned session, unlogged check-in), never to the physiological verdict. "An app that shames a low-HRV rest day contradicts its own coaching." |
| §0 `:39-66` | The photographic Cover stays; cassette added below it. The cassette carries **no numeral** (corrected mid-implementation after a rendered frame showed the readiness printed twice). |
| §1 `:68-123` | Ten cogs `[11,13,15,17,19,21,24,28,32,34]`, readiness→gear by **percentile against the rider's own 90 days**, fallback to absolute deciles below 14 usable values. Marker = the athlete's **median** ("DEIN SCHNITT"), corrected down from "90-day best" which was unimplementable (percentile of the max is always 1.0). |
| §1 `:136-149` | Honest cases: stale wearable → hollow cogs via existing `utils/readinessGate.ts`; no readiness → hero collapses to type; **no estimated post-ride drop** — only measured readiness. |
| §2 `:151-173` | The Bento: 2-col grid, size/colour **earned by the coach's actual reasoning**; exactly one accented tile; **the universal chart rule — exactly one point highlighted, everything else neutral**; tap-expands in place. |
| §3 `:175-190` | Motion contract w/ budgets. Rules: each fires **once per day per event**, never on scroll-back; `prefers-reduced-motion` resolves all instantly. |
| §4 `:192-206` | **Die Kette** — the chain IS the streak. Rest days never break it. A **skipped planned session** breaks it (the guilt mechanic, in the app's own object). **XP accrues from planned load actually completed** (`weekLoad.spent`/`weekLoad.planned`) so junk miles can't farm it. Ten-segment bar. |
| §5 `:208-219` | Celebration = "a gear you could not reach before" (peak power beating the 90-day curve). No confetti. **Amended:** deferred to the Recap pass. |
| Data `:222-238` | Everything needed already in `useTodayModel`. `WeekResponse.missed_yesterday` already carries yesterday's planned-but-unridden ride — no backend work needed for the chain-break rule. |

### Implementation status — VERIFIED AGAINST CODE + GIT

The plan was **executed in full, then the hero was deliberately deleted.**

Commits (newest last), `git log`:

```
8ffe876 fix(cassette): kill the one-frame flash in useCountUp...
a363768 feat(cassette): the hero, and the reading it refuses to guess
b05ec6a fix(cassette): marker tracks the typical reading, not an unmovable best
74eaeb8 feat(cassette): expose the readiness series and yesterday's skipped session
18b1f48 fix(cassette): let readiness90DaySeries fold in today's reading
e9fd5ee feat(cassette): Today leads with the gear you can push, in all five states
3c5bdd5 fix(cassette): drop the hero's own numeral — the cog is the reading
c238f2f fix(cassette): give the typical-reading marker its own label
e4f682f fix(cassette): the rider always sees why the cassette went dark
4ab48de feat(bento): a tile whose chart argues one point instead of drawing seven
59b3b5f fix(bento): the accented tile's dark ink now comes from a token...
50e0e74 feat(bento): the grid reshapes around whatever the coach actually reasoned from
e7686e0 fix(bento): explicit matchTerms...
fdf3e8e feat(kette): the chain is the streak, and a skipped session snaps it
a46e5db refactor(bento): 01 ERHOLUNG is deleted...
a2ef071 feat(bento): charts that carry a reference, not lines that carry nothing
c171bf7 feat(today): the photograph, then the numbers -- the cassette is gone   <-- REVERSAL
```

**`c171bf7` (2026-08-08) is the load-bearing reversal.** Its message:

> Owner ruling: a cog standing in for a body asked the reader to translate, and
> they shouldn't have to. **People didn't get it.**
> …Deletes CassetteHero, Cassette, cassetteScale, their tests and their ten copy
> keys rather than leaving them unmounted.

Deleted by that commit: `Cassette.tsx` (200 L), `CassetteHero.tsx` (149 L),
`cassetteScale.ts` (55 L), and 5 test files (`cassette.test.tsx`,
`cassetteHero.test.tsx`, `cassetteMotion.test.tsx`, `cassetteScale.test.ts`,
`cassetteToday.test.tsx`). Replaced by `BigNumbers.tsx` (140 L).

#### What SURVIVED the reversal (still live in `main`-line code)

| Plan task | Artifact | Status |
| --- | --- | --- |
| Task 1/2/4 (cassette scale, SVG, hero) | — | **DELETED** |
| Task 3 (motion hooks) | `frontend/src/editorial/motion/useCountUp.ts`, `frontend/src/editorial/motion/useChainShift.ts` | `useCountUp` **live** (used by `morning/MorningDeckView.tsx:182-183`, `morning/FormBlock.tsx:88-90`). `useChainShift.ts:29` is **ORPHANED — zero consumers.** |
| Task 5 (model fields) | `frontend/src/editorial/data/useTodayModel.ts` — `readiness90DaySeries` (`:99`, built `:476`), `missedYesterday` (`:106`, built `:484-492`) | **LIVE** |
| Task 6 (mount in Today) | `TodayView.tsx` | reverted to Cover + `BigNumbers` (`TodayView.tsx:1169` comment records the removal) |
| Task 7 (BentoTile) | `frontend/src/editorial/components/BentoTile.tsx` | **LIVE** |
| Task 8 (BentoGrid) | `frontend/src/editorial/components/BentoGrid.tsx` | **LIVE** |
| Task 9 (Die Kette) | `frontend/src/editorial/components/KetteStrip.tsx` | **LIVE, mounted at `TodayView.tsx:1705`** |

`KetteStrip.tsx` is the single most important surviving artifact — it *is* the
shipped streak+XP UI. See §1 below.

#### Explicitly deferred by the plan (`:1656-1661`)

- Session Detail and Recap inherit the primitives in a later pass.
- **The record bloom** — moved to the Recap pass (the BEST marker became the median, so the record needs its own signal). Never built.
- **Tap-to-expand on a tile** — `onExpand` seam exists in Task 7; wiring to the scrubbable chart deferred.
- **An estimated post-ride drop (`geschätzt`)** — cut on honesty grounds.

**Conclusion for the caller:** do not re-propose a cassette hero. The visual
metaphor was tried, shipped, and killed by owner ruling for comprehension
reasons. The *mechanics* the spec introduced (chain-as-streak, XP from planned
load, one-highlighted-point charts, once-per-day motion) all survived and are
the live contract.

---

## 1. Streaks & adherence — ALREADY BUILT, SERVER-SIDE

### Backend

**Service:** `backend/app/services/streak.py` (221 lines) — the whole thing is
worth reading; its docstring `:1-17` is the definition of record.

Streak semantics (`streak.py:4-12`):

| Day | Effect |
| --- | --- |
| trained day | counts, streak grows |
| planned rest day, not trained | **counts** — "resting on a rest day IS the plan" |
| sick / injured / break status day | **pauses** — neither counts nor breaks |
| planned session skipped, no status | **breaks** |
| no plan row + not trained | breaks (legacy activity-presence rule) |
| **today** | never breaks (may simply not be logged yet) — `streak.py:124-125` |

Key symbols:
- `LOOKBACK_DAYS = 60` (`streak.py:30`), `PAUSE_STATES = {"sick","injured","break"}` (`:31`)
- `_REST_TEMPLATE_IDS = {"rest_day"}` (`:36`) and `_is_rest_planned()` (`:39-43`) — matches `template_id == "rest_day"` or a title containing `"rest day"`/`"ruhetag"`. Note `recovery_60` etc. are *real spins* — skipping those breaks the streak.
- `build_streak(db, user_id, today=None) -> dict` (`:46`). Returns `{streak, consistency:{met,planned}, paused, status, week:[{date,state}×7], break_day}` (`:161-172`).
- Athlete-timezone-bound: `athlete_time.set_athlete_tz_from_profile(profile)` at `:54` so a 22:30 Berlin ride belongs to the local day.
- `day_state(d)` (`:98-108`) → `trained | rest | paused | missed | unplanned`.
- `break_day` (`:116, :127`) — the most recent past day that broke the streak; the anchor for repair.
- Weekly consistency (`:149-159`): planned *training* days met / planned this week. Planned rest days never enter the denominator; paused days drop out unless trained anyway.
- `repair_streak(db, user_id, prior_break_day, today=None)` (`:175-220`) — backlog 03·C2 one-tap morning-after repair. Honest by construction: a sync only ADDS activities, so a break can only move earlier or vanish. Returns `repaired=True/reason="restored"` or `repaired=False/reason="nothing_to_repair"`.
- Athlete status lives in `AthleteProfile.goals["athlete_status"] = {"state","since"}`, set via `PUT /athletes/me/status`.

**Endpoints** — `backend/app/api/athletes.py`:
- `GET /athletes/me/streak` → `my_streak` (`:91-102`) → `build_streak`
- `POST /athletes/me/streak/repair` → `repair_my_streak` (`:127-163`), response model `StreakRepairResult` (`:120`)
- `PUT /athletes/me/status` (athlete status, drives the pause)

Also consumed by `backend/app/services/coach_service.py:3717-3722` (imports `streak._is_rest_planned` so rest semantics are shared) and by `weekly_recap`/`weekly_wrapped` (streak state inside the week — `api/analytics.py:475`).

### Frontend

- **Hook:** `frontend/src/hooks/useStreak.ts` — `useStreak()` (react-query key `['athlete','streak']`, 5-min staleTime), `useRepairStreak()`. Type `StreakWithConsistency = StreakRead & { consistency?: WeekConsistency | null }` — tolerant read shape, never a fabricated 0/0.
- **API client:** `frontend/src/api/athletes.ts` — `getStreak`, `repairStreak`, `setAthleteStatus`, types `StreakRead`, `StreakRepairResult`, `AthleteState`.
- **Editorial surface (the shipped one):** `frontend/src/editorial/components/KetteStrip.tsx`, mounted `frontend/src/editorial/pages/TodayView.tsx:1705`.
  - Props `KetteStripProps { streakDays: Value<number>; weekLoad: Value<{spent,planned}>; missedYesterday: Value<{title,dateIso}> }` (`:34-38`)
  - Test ids: `kette`, `kette-broken`, `kette-count`, `kette-xp`, `kette-segment` (×10)
  - `SEGMENTS = 10` (`:40`); `filled` computed `:52-54` with clamping — a missing/zero/negative planned target yields 0 filled, never NaN, never a bar against an invented denominator.
  - **The break signal is `isPresent(missedYesterday)` and nothing else** (`:44`) — no second rule layered on top, never inferred from a low reading or a rest day.
  - Tone ruling recorded in the docstring `:15-19`: the break is **not softened**; guilt attaches only to a session the rider chose to skip.
  - Copy keys: `ketteHolds`, `ketteBroken`, `ketteXp` in `frontend/src/editorial/i18n/copy.ts`.
  - Tests: `frontend/src/editorial/__tests__/kette.test.tsx`
- **Dashboard surfaces:** `frontend/src/components/dashboard/tabs/TodayTab.tsx`, `TrainingLogStrip.tsx`, `tabs/HistoryTab.tsx` all read streak.
- **Streak break UX:** `frontend/src/components/celebration/StreakBreakWatcher.tsx` + `StreakBreakOverlay.tsx` (a *soft* card in the celebration queue, with the one-tap repair).

**The written rule** — `frontend/src/utils/moments.ts:1-19` is the manifesto:

> The streak counts ADHERENCE, not activity. … A conventional activity streak —
> Strava's, and the reason Gentler Streak exists — pays the athlete to ride on
> exactly the mornings this app's own readiness gate is telling them not to. …
> the reward layer actively bribing the user to ignore the coaching the rest of
> the product exists to deliver.

`MomentKind` (`moments.ts:21-29`): `session_as_prescribed | rest_honoured | zone_held | streak_extended | personal_record | ftp_gain | plan_week_complete`.

### Client-side streak milestones

`frontend/src/lib/celebration.ts`:
- `STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365]` (`:11`), `streakMilestone()` (`:14`)
- `streakDedupKey` (`:55`), `weeklyDedupKey` (`:58`), `pbDedupKey` (`:52`), `isoWeekKey` (`:66`)
- `STREAK_BREAK_MIN = 3` (`:89`), `detectStreakBreak` (`:152`), `hasGenuineBreakDay` (`:172`), `streakLastKey`/`readStoredStreak`/`writeStoredStreak` (`:92-108`), `localDateKey` (`:119`), `streakBreakDedupKey` (`:132`)

---

## 5. Existing progress / achievement-shaped surfaces — ALREADY BUILT

### 5a. The Achievements subsystem (persisted, server-detected)

**Model:** `backend/app/models/achievement.py`
- `class Achievement(Base)`, `__tablename__ = "achievements"` (`:26`)
- Columns: `id` BigInteger PK, `user_id` FK→`users.id` ON DELETE CASCADE indexed, `key` String(64), `unlocked_at` DateTime(tz), `context` JSONB, `created_at`
- `UniqueConstraint("user_id","key", name="uq_achievements_user_key")` (`:28`) — one unlock per (user, key)
- RLS-protected via `user_id`, "same pattern as race_debriefs / period_reports" (`:12`)
- Keys with a leading underscore (`_climb_scan`) are internal scan bookmarks, never returned by the API (`:9-10`)

**Service:** `backend/app/services/achievement_service.py` (563 lines)
- `@dataclass(frozen=True) class AchievementDef` (`:49-57`): `key, icon (lucide hint), title_en, title_de, detail_en, detail_de, unit`
- **`CATALOG: list[AchievementDef]` (`:60-150`) — 15 achievements:**

| key | icon | what |
| --- | --- | --- |
| `rides_10` / `rides_50` / `rides_100` | bike | ride-count milestones |
| `first_century` | trophy | first ride ≥100 km |
| `first_1000kj` | flame | first 1,000 kJ ride |
| `longest_ride` | route | longest ever — "a PB that keeps moving" |
| `first_cat_climb` | mountain | first Cat 4+ climb from altitude streams |
| `ctl_40` / `ctl_60` / `ctl_80` | trending-up | CTL crossings |
| `power_pb_60` / `_300` / `_1200` / `_3600` | zap | beat prior 90-day best by ≥2% |
| `eftp_up` | gauge | modelled eFTP up ≥5 W |

- `CATALOG_BY_KEY` (`:151`); target maps `_PB_DURATION_KEYS` (`:153`), `_CTL_TARGETS` (`:155`), `_RIDE_COUNT_TARGETS` (`:156`)
- Constants: `CLIMB_SCAN_KEY = "_climb_scan"` (`:41`), `CAT4_SCORE = 800.0` (`:42`), `FRESH_CREATED_DAYS = 7` / `FRESH_EVENT_DAYS = 14` (`:43-44`)
- Pure, DB-free detectors (unit-tested): `detect_ride_milestones(rides)` (`:169`), `detect_kj_milestone(...)` (`:208`), `detect_ctl_milestones(series)` (`:221`), `scan_ride_for_climbs(...)` (`:235`)
- `@dataclass(frozen=True) class RideRow` (`:161-167`): `id, started_at, distance_m, duration_s`
- `build_progress(...)` (`:274`) — honest in-progress numbers; `unlocked_value_label(...)` (`:331`)
- **`async def get_achievements(db, user_id, lang="en") -> dict` (`:356-563`)** — the orchestrator. Runs detectors incrementally (climb scan only touches unseen rides `:468`), persists new `Achievement` rows (`:479`), returns `{unlocked[], in_progress[], counts:{unlocked,total}, latest, all_time}` (`:509-551`)
- Depends on `pmc_service`, `breakthrough_detector.detect_breakthroughs`, `climbing_analysis.analyze_climbs`, `ride_segmentation.segment_ride` (`:36-39`)

**API:** `backend/app/api/achievements.py` — `GET /achievements/mine` → `get_mine` (`:22-43`), `lang` query param `en|de`, RLS via `get_db_for_user`. Docstring `:41`: **"Physiology + riding milestones only — no login streaks, no XP."**

**UI:** `frontend/src/pages/AchievementsView.tsx`, route `/achievements` (`frontend/src/App.tsx:282`).
Docstring `:1-13`: built against pen "V2 · Achievements" (YOpJB) but **"stripped of the mock's loot mechanics per product decision: physiology + riding milestones only — no XP, no levels, no login streaks."**
Card order: Header → hero ring (unlocked/total, gold) → trophy cabinet (grid, gold medals + real unlock dates) → next milestones (in-progress list with **honest progress bars**) → all-time tiles.

Legacy: `frontend/src/components/dashboard/AchievementBadges.tsx` (the localStorage-v0 the server model replaced).

### 5b. The Celebration engine (queued, deduped, honest)

`frontend/src/contexts/CelebrationContext.tsx` — docstring `:1-21` calls it
**"the app-wide 'micro-dopamine' reward engine."**
- Mounted once high in the tree (`App.tsx`); exposes imperative `celebrate` + `celebrateOnce` (localStorage-deduped so a real achievement fires **exactly once, ever**)
- **QUEUE, not last-writer-wins** — a ride can set a PB *and* close the weekly rhythm *and* hit a streak milestone in one tick; each enqueues, overlay renders the head, biggest-first drain
- Confetti + haptic fire when a card **becomes the head**, not at enqueue
- Respects localStorage dedup, `prefers-reduced-motion`, CSP safety
- `CelebrateOptions { kicker, value, unit, detail, rarity, … }`
- Uses `motion/react` `AnimatePresence`, lucide `Zap/Flame/Target/TrendingUp/Trophy`, `lib/confetti.fireConfetti`, `lib/haptics.hapticCelebrate`

Components (`frontend/src/components/celebration/`):
- `CelebrationOverlay.tsx` — types `CelebrationKind`, `CelebrationPayload`
- `CelebrationTriggers.tsx` — global data-driven watchers (`:1-11`): streak milestone via `useStreak`, weekly-rhythm-complete via consistency. Ride PBs fire locally from `RideRecapView`.
- `MomentCard.tsx`
- `StreakBreakOverlay.tsx` (type `StreakBreakContent`) + `StreakBreakWatcher.tsx`

Queue/priority primitives in `frontend/src/lib/celebration.ts`: `CELEBRATION_PRIORITY` (`:194`), `celebrationPriority` (`:203`), `QueueEntry`/`QueueState` (`:208-215`), `emptyQueue` (`:226`), `enqueueCelebration` (`:240`), `advanceCelebration` (`:259`), `prefersReducedMotion` (`:268`), `hasCelebrated`/`markCelebrated` (`:278-287`).

`frontend/src/components/dashboard/BreakthroughCelebration.tsx` — the P1.2 breakthrough card.

### 5c. Honest-progress meters (the anti-XP pattern)

`frontend/src/components/dashboard/LevelStripCard.tsx` — read the docstring, it's the design precedent:

> LevelStripCard — the "Arbeit im Sattel" lifetime-work meter, grounded honestly:
> REAL mechanical work (kJ over the last 90 days) climbing toward the next
> 5,000 kJ milestone. **No levels, no LVL badge, no XP vocabulary and no
> daily-streak flame (audit P1-11)** — competence feedback in physical units only.

- `KJ_PER_MILESTONE = 5000` (`:12`), pure `milestoneMeta(kj) -> {pct, toNext}` (`:15`), `milestoneLabel(toNext, de)` (`:25`)

`frontend/src/components/report/MilestoneStrip.tsx` — "Badge chips for streaks / PRs / load milestones. Renders nothing when empty." Consumes `Milestone` from `frontend/src/api/report.ts`. Icons flame/zap/trophy/award.

### 5d. Other progress-shaped surfaces

| Surface | Path |
| --- | --- |
| Weekly Wrapped (7 full-screen WebGL story cards) | `backend/app/services/weekly_wrapped.py` + `frontend/src/pages/WeeklyWrapped.tsx`, `frontend/src/components/wrapped/`; endpoint `GET /analytics/weekly-wrapped` (`api/analytics.py:452`) |
| Weekly Recap story | `backend/app/services/weekly_recap.py`, `GET /analytics/weekly-recap` (`api/analytics.py:467`), `frontend/src/pages/WeeklyRecapStory.tsx` |
| Breakthroughs | `backend/app/services/breakthrough_detector.py` — `detect_breakthroughs()` (`:63`), `_corroborated()` (`:47`), `_mmp_at()` (`:53`); `GET /analytics/breakthroughs` (`api/analytics.py:437`) |
| Form/progress judgement | `backend/app/services/form_progress.py` + `frontend/src/components/dashboard/FormProgressPanel.tsx`; schema `backend/app/schemas/form_progress.py` (`FormProgress`, `Marker`, `Signal`) |
| Goal trajectory (forward simulation to race day) | `backend/app/services/goal_trajectory.py` — day-by-day CTL/ATL EWMA roll under real planned workouts then synthesized weeks |
| Workout progression engine | `backend/app/schemas/workout_progression.py`, plan `docs/superpowers/plans/2026-06-25-workout-progression.md` |
| Period report (cached) | `backend/app/services/period_report.py`, `backend/app/models/period_report_cache.py` |
| Season stats / trends | `backend/app/services/season_trends.py`, `frontend/src/components/dashboard/SeasonStats.tsx`, `frontend/src/pages/SeasonView.tsx` |
| Power profile / phenotype ladders | `backend/app/services/athlete_power_profile.py`, `power_phenotype.py`, `detailed_power_profile.py`; `frontend/src/pages/PowerProfileView.tsx`, `BikeProgressView.tsx` |
| Race debrief | `backend/app/services/race_debrief.py`, `models/race_debrief_cache.py`, `frontend/src/pages/DebriefView.tsx` |
| Ride compare "duel" | `backend/app/services/ride_compare.py`, plan `docs/superpowers/plans/2026-07-06-ride-compare-duel.md` |

---

## 6. Training-science services (candidate "real" progression metrics)

All in `backend/app/services/`:

| Service | Key symbols |
| --- | --- |
| `critical_power.py` | `@dataclass CriticalPowerFit` (`:37`), `fit_critical_power(...)` (`:45`) |
| `w_balance.py` | `@dataclass WBalanceResult` (`:31`), `w_prime_balance_step(...)` (`:37`), `w_prime_balance(...)` (`:52`), `w_balance_summary(...)` (`:64`); trace in `wbal_trace.py` |
| `durability.py` | `@dataclass DurabilityResult` (`:27`), `_split_index_at_kj(...)` (`:34`), `durability_drop(...)` (`:49`), `aerobic_decoupling(...)` (`:80`) |
| `tid_assessment.py` | `compute_training_distribution(db, user_id)` (`:33`); optimizer in `tid_optimizer.py` |
| `pmc_service.py` | `get_daily_tss_by_sport` (`:46`), `_gap_fill_series` (`:92`), `_series_for` (`:110`), **`compute_user_pmc(...)` (`:135`)**, `get_zones(profile)` (`:202`), `project_pmc_forward(...)` (`:234`) |
| `training_load.py` | CTL/ATL EWMA (`update_ctl_atl`, referenced by `goal_trajectory.py`) |
| `readiness_score.py` | `ReadinessInputs` (`:55`), `ComponentScore` (`:89`), `ReadinessReport` (`:97`), components `_hrv_` (`:109`) `_rhr_` (`:137`) `_sleep_` (`:152`) `_tsb_` (`:180`) `_acwr_` (`:213`) `_body_battery_` (`:245`), `_ceiling_from_score` (`:273`), **`compute_readiness(inputs)` (`:292`)** |
| `breakthrough_detector.py` | see 5d |
| `adaptive_readiness.py`, `readiness_detector.py`, `morning_health_detector.py` | readiness/illness detection |
| `impulse_response.py` | Banister FFM — noted in roadmap P2.12 as **dead / test-only**, a resurrect candidate |
| `advanced_metrics.py`, `efficiency_metrics.py`, `quadrant_analysis.py`, `matchbook.py`, `cda_estimate.py`, `wko_power_model.py`, `power_curve.py` | supporting analytics |
| `plan_adaptation_engine.py`, `training_periodization.py`, `mesocycle_generator.py`, `plan_absorption.py` | planning/adaptation |

Endpoints: `backend/app/api/training_load.py`, `analytics.py` (18 routes, `:53-467`), `climbs.py`, `ftp.py`.

---

## 8. Notifications & scheduled jobs — EXISTS, CRON-DRIVEN

**`backend/app/scheduler.py`** defines four sweeps:

| Function | Line | What |
| --- | --- | --- |
| `run_all_user_syncs()` | `:33` | every user with `GarminCredential.sync_enabled=True` → `sync_user_garmin` |
| `run_hourly_plan_adaptation()` | `:66` | `plan_adaptation_engine.run_for_user` for every user with a plan row ≥ yesterday; signal-snapshot fingerprinted so it exits quietly on an unchanged hour |
| `run_brief_refresh_sweep()` | `:112` | coach-brief 4-trigger policy: local morning, local evening, missed planned session (the 4th, completed-workout, is inline in the Garmin sync). Deduped per athlete-local day. |
| `run_morning_push_briefs()` | `:151` | morning push |

`scheduler = AsyncIOScheduler(timezone="UTC")` (`:31`). **Important:** the
in-process APScheduler is no longer the production path.

These four are **also still registered in-process** in the FastAPI lifespan —
`backend/app/main.py:53-105` (`scheduler.add_job(run_all_user_syncs, "interval",
minutes=15, id="garmin_sync", coalesce=True, max_instances=1)` etc., then
`scheduler.start()` at `:101`). So there are **two** drive paths; the cron one is
the production truth.

**`backend/app/jobs/run_scheduled_jobs.py`** is the Railway cron entrypoint
(`python -m app.jobs.run_scheduled_jobs`, `*/15 * * * *`, config in
`backend/railway.cron.json`). Docstring `:1-21`:

> This replaces the in-process APScheduler that used to run from the FastAPI
> lifespan — that never fired reliably because Railway idles the web container
> between HTTP requests.

Runs the four sweeps sequentially in fixed order (`:41-46`), each in its own
try/except, always exits 0. All four are idempotent/deduped. Does NOT run
alembic (migrations owned by the web service's `start.sh`).

**→ This is the natural hook for any daily / period-end reward evaluation: add a
fifth sweep function to `scheduler.py` and one line to the `sweeps` list in
`run_scheduled_jobs.py`.**

**Push:** `backend/app/services/push_service.py` — Web Push via VAPID/`pywebpush`.
- `push_configured()` (`:34`) — true iff `settings.VAPID_PRIVATE_KEY` and `VAPID_PUBLIC_KEY`
- Subscriptions stored **in `AthleteProfile` JSON**, not their own table: `_push_state(profile)` (`:38`), `_save_push_state(...)` (`:44`), `add_subscription(...)` (`:51`), `remove_subscriptions(...)` (`:63`)
- `_send_to_sub(sub, payload)` (`:70`), **`send_user_push(...)` (`:90`)** — the generic primitive
- `run_morning_briefs(db)` (`:112`), `_morning_copy(...)` (`:154`)

**Push API:** `backend/app/api/push.py` — `GET /push/vapid-key` (`:42`), `POST /push/subscribe` (`:48`), `POST /push/unsubscribe` (`:60`), `POST /push/test` (`:70`); `_require_configured()` (`:28`).

**Gap:** push is **morning-only**. There is no post-ride push job. Backlog item
F1 is tagged `NEEDS-CHECK` precisely because the "just turn it on" premise is
half-true — `send_user_push` exists, the scheduled job does not.

**No email capability** was found (no SMTP/sendgrid/ses references).

---

## 4. User profile & identity — thin, but real

**`backend/app/models/user.py`** — `class User(Base)`, `__tablename__ = "users"`:
- `id`, `email` (unique, indexed), **`display_name: str|None` String(80)** ("Optional real display name; falls back to the email-derived handle when null"), **`avatar_url: str|None` Text** ("Small base64 `data:image/...;base64,...` URL … kept ≤~300 KB by the update endpoint; **never an external URL**"), `hashed_password`, `is_active`, `created_at`, `updated_at`
- Relationships: `athlete_profile` (1:1), `consent_records` (no cascade — anonymized), `activities`, `garmin_credential`, `wahoo_credential`, `coros_credential`, `daily_metrics`, `planned_workouts`, `daily_metric_samples`

**`backend/app/models/athlete_profile.py`** — the settings/identity bag:
- Physiology: `ftp_watts` (`:22`), `lthr_cycling` (`:23`), `running_threshold_pace_ms` (`:26`), `lthr_running` (`:27`), `max_heart_rate` (`:30`), `resting_heart_rate` (`:31`), `weight_kg` (`:32`), `date_of_birth` (`:33`)
- Preferences: `weekly_hours_available` (`:36`), `primary_sport` (`:37`), `secondary_sports` JSON (`:38`), `days_available` JSONB (`:52`), **`motivation_style` String(20) (`:57`)**, **`variety_dial` String(12) (`:61`)**, `experience_level` String(12) (`:65`), `hard_day_blackouts` JSONB (`:70`), `quiet_on_rest_days` bool (`:77`), `detail_level` String(10) (`:86`)
- **`goals: dict` JSON (`:90`)** — the catch-all; holds `athlete_status` (streak pause) and the push state
- Events: `target_event_date` (`:96`), `target_event_type` (`:97`), `target_priority` (`:98`), `target_event_gpx` Text (`:104`)
- History: `ftp_history` JSON (`:117`); `timezone` (`:123`); `injury_flag` (`:130`), `injury_note` (`:133`)

**Cosmetic / self-expressive surface today:** `display_name` + base64 `avatar_url`
only. `motivation_style` and `variety_dial` are tone dials, not cosmetics.
`frontend/src/editorial/components/ProfileAvatar.tsx` renders the avatar.
`frontend/src/pages/ProfileView.tsx`, `SettingsPage.tsx`, `ProfileSetupPage.tsx`.
There is **no** title/badge-on-profile, no theme/skin, no cosmetic unlock of any kind.

**Other user-owned config models:** `backend/app/models/user_dashboard.py`,
`backend/app/models/user_tab_layout.py` (reorderable card tabs — precedent for
per-user layout persistence).

---

## 9. Persistence conventions

- ORM style: SQLAlchemy 2.0 typed — `Mapped[...]` + `mapped_column(...)`, `from app.database import Base`. Postgres dialect types used directly (`JSONB` from `sqlalchemy.dialects.postgresql`).
- Table names: plural snake_case (`users`, `activities`, `achievements`, `daily_metrics`, `planned_workouts`).
- Constraint naming: `uq_<table>_<cols>` (e.g. `uq_achievements_user_key`, `achievement.py:28`).
- User scoping: every user-owned table carries `user_id` FK → `users.id` with `ondelete="CASCADE"` and `index=True`; **RLS is applied per-table** and requests go through `get_db_for_user` (`backend/app/dependencies.py`). System jobs use `async_session_maker` directly and intentionally bypass RLS (documented in `scheduler.py:9-12`), relying on explicit `WHERE user_id = …`.
- Migrations: Alembic in `backend/migrations/`. Run by the web service's `start.sh` (`alembic upgrade head`), **not** by the cron job.
- Model registration: `backend/app/models/__init__.py`.

*(Detailed migration head/chaining/RLS-policy pattern: see the Ingestion & Persistence appendix below.)*

---

## The written guardrails (read these before proposing any mechanic)

`docs/competitive-roadmap-tasks.md` — **"Explicitly not doing (and why)"** section:

- **Global leaderboards / vs-pros comparisons** — demoralizing (retention research); W/kg bands + crews only.
- **Loot mechanics, arbitrary badges, login streaks** — celebration must be earned physiologically.
- LLM free-generation insights without model grounding (the "Strava horoscope trap").
- Visible AI metering.
- Nutrition logging / strength-library depth / **biological age**.
- In-ride execution mode.
- A mascot.
- ACWR-as-injury-oracle / RL plan generation.

Relevant roadmap items still open: **P2.8** crew feed w/ kudos ("only invest once
there's user mass"), **P2.9** crew *quality* challenges + mount the unmounted
`BandChip.tsx`, **P2.10** cold-start backfill moment, **P2.12** resurrect
`impulse_response.py`.

### The pre-existing gamification backlog — already audited against the code

`docs/backlog/03-behavioral-dopamine.md` (390 lines, themes A–L, ~41 items) and
its forensic audit `docs/backlog/tagged/03-behavioral-dopamine-tagged.md` (60
lines) — **this is the single most useful document for the caller's question.**
Every item is already tagged NEW / NEEDS-CHECK / CONTRADICTS-DECISION with
file-level evidence. Summary counts (`tagged:51-54`): **NEW 39, NEEDS-CHECK 1
(F1 post-ride push), CONTRADICTS-DECISION 1 (D3 "mystery detector" — bans the
curiosity-gap/collection loot loop and reverses the deliberate
honest-transparency design of `AchievementsView`).**

Themes: A reward schedules/micro-dopamine · B progress & mastery loops
(incl. B2 mastery ladders as physiology W/kg bands, B4 "streak of quality") ·
C streak psychology (C1 freeze token — **no freeze logic exists**, C2 repair —
**built**, C3 milestone anticipation, C4 celebration variety) · D anticipation
& unlock · E celebration variety/personalization (**E2 cooldown/rate-limit does
not exist**) · F notifications · G social proof/light competition (**G1 kudos
not built**) · H identity/badges/levels (**H2 badge cabinet = built**) ·
I loss-aversion kindly · J rituals/countdowns · K share cards · L win-back.

Forensic notes (`tagged:56-60`): no item revives deliberately-removed code
(DuelArena/PowerArena/StreakStrip/CoachBrief stubs stay unmounted);
`MorningCheckin.tsx` is orphaned (localStorage-only, mounted nowhere).

Related research: `docs/research/2026-07-gentler-streak.md`,
`docs/research/2026-07-bevel.md`, `docs/research/2026-07-ai-coach-landscape.md`,
`docs/research/2026-07-our-app-inventory.md` (§4 "Social / gamification",
§6 "Gaps, dead ends & unfinished"), `docs/usability-audit-2026-07.md`
(P1-11 is the ruling that killed levels/XP vocabulary).

---

## 2. Activity / ride ingestion — and THE HOOK POINT

### 2a. `Activity` — `backend/app/models/activity.py`

- Table `activities` (`:20`). **TimescaleDB hypertable** partitioned on `started_at` (7-day chunks), created by raw SQL in migration `a076ea752213`, and **excluded from Alembic autogenerate** via `include_object` in `backend/migrations/env.py:41-58`.
- **Composite PK `(id, started_at)`** (`:28-31`) — `id` BigInteger with explicit `autoincrement=True` so `RETURNING id` is emitted.

| Column | Line | Type |
| --- | --- | --- |
| `id` | `:28` | BigInteger PK autoincrement |
| `started_at` | `:29` | DateTime(tz) PK (partition key) |
| `user_id` | `:34` | Integer FK `users.id` CASCADE |
| `sport` | `:39` | String(30) — `"cycling" \| "running" \| "gym"` |
| `duration_seconds` | `:44` | Integer |
| `distance_meters` | `:45` | Float |
| `elevation_gain_m` | `:49` | Float (migration `el7a2c9d3f4b`) |
| `tss` | `:52` | Float |
| `normalized_power` | `:55` | Float |
| `average_power` | `:56` | Float |
| `average_hr` / `max_hr` | `:59-60` | Integer |
| `calories` | `:63` | Integer |
| `title` | `:64` | String(200) |
| `source` | `:67` | String(50) — `manual/garmin/synthetic/coros/wahoo/apple_health/strength_log` |
| `external_id` | `:70` | String(100) — **the dedupe key** |
| `raw_data` | `:71` | JSON/JSONB blob |
| `created_at` | `:74` | DateTime(tz) |

**Not on the Activity row** (they live on `activity_streams`): **IF, kJ, cadence,
decoupling, CP/W′/eFTP**.

**No indexes or unique constraints are declared** — notably there is **no
`UniqueConstraint(user_id, external_id)`**. Dedupe is application-level
SELECT-then-skip only, so concurrent syncs could in principle double-insert.
RLS: `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY user_isolation` in
`backend/migrations/versions/a076ea752213_add_profiles_consent_and_rls.py:125-129`.

### 2b. `ActivityStream` — `backend/app/models/activity_stream.py`

Table `activity_streams` (`:30`), **one row per activity**, samples stored as
**JSON arrays** (not rows). PK is `activity_id` (`:32`, `autoincrement=False`);
**no FK to `activities`** (hypertable FK avoidance) — ownership via `user_id`
(`:33`) + RLS.

Columns: `streams` JSON (`:37`, aligned 1 Hz channel arrays), `mmp_curve` JSON
(`:38`, `{duration_s: watts}` — **the source of every power PB / breakthrough**),
`weather` JSON (`:39`), `has_gps` (`:40`), `normalized_power` (`:43`),
`decoupling_pct` (`:44`), **`total_kj` (`:45`)**, `cp_watts` (`:46`),
`w_prime_j` (`:47`), `eftp_watts` (`:48`), `created_at` (`:50`).

Channel list: `backend/app/services/stream_ingestion.py:27-42` — always
`power, heart_rate, cadence, altitude`; optional `latitude, longitude, speed,
grade_adjusted_speed, vertical_speed, distance, temperature`, cycling dynamics
(`right_balance, torque_effectiveness, pedal_smoothness, pco_left/right,
power_phase_*, stamina, stamina_potential, performance_condition`) and running
dynamics. Blob built by `build_streams_blob` (`stream_ingestion.py:45-52`).

### 2c. Daily metrics

**`DailyMetric`** — `backend/app/models/daily_metric.py`, table `daily_metrics`
(`:24`), hypertable on `recorded_at` (30-day chunks), composite PK
`(id, recorded_at)` (`:32-35`). **Uniqueness on `(user_id, date)` is app-layer
only** (documented `:19-22`; Timescale requires the partition column in unique
constraints).
- Core (`:45-52`): `sleep_score`, `hrv_status`, `body_battery`, `resting_hr`, `stress_level`, `steps`, `weight_kg`
- Wake-vs-now (`:58-67`): `body_battery_wake/now/now_at`, `stress_wake/now`, `hrv_overnight_avg`, **`training_readiness`**, `recovery_time_hours`
- Sleep vitals (`:74-86`, migration `f3a4b5c6d7e8`): `sleep_total_s/deep/light/rem/awake_s`, `sleep_awake_count`, `spo2_avg/low/high`, `respiration_avg/low/high`, `sleep_stress_avg`
- `source` (`:89`), `raw_data` JSON (`:92`)

**`DailyMetricSample`** — `backend/app/models/daily_metric_sample.py`, table
`daily_metric_samples` (`:27`), hypertable on `recorded_at` (7-day chunks),
**row-per-sample**: `metric_type` String(20) (`:41`, `body_battery|stress|hr|hrv`),
`value` Float (`:44`). Indexes + RLS in
`backend/migrations/versions/e5c8f4a1_add_daily_metric_samples.py:47-63`.

### 2d. The pipeline, and where a ride becomes durable

Trace: scheduler/API → `sync_user_garmin` → `sync_activities` →
`map_garmin_activity` → dedupe → **`create_activity`** → `_sync_activity_streams`
→ `ingest_activity_streams`.

- `backend/app/services/garmin_sync_service.py:524` `sync_user_garmin(db, credential)`; client at `:82`; initial 90d in 30d chunks (`:582-602`), incremental from `last_sync_at − 2h` (`:565`)
- `garmin_sync_service.py:126` `sync_activities(...)` — fetch (`:151`), profile once (`:161-173`)
- `backend/app/services/garmin_mapper.py:88` `map_garmin_activity(raw) -> ActivityCreate | None`; `GARMIN_SPORT_MAP` (`:24-35`); `external_id = str(activityId)` (`:175`); `extract_elevation_gain_m` (`:53`)
- **Dedupe:** `SELECT Activity WHERE user_id AND external_id` → skip if found — `garmin_sync_service.py:185-198` (SELECT-then-skip, *not* a DB upsert)

#### ⇒ **THE HOOK POINT**

**`backend/app/services/activity_service.py:227` `create_activity(db, user_id, data, profile)`**
- Activity constructed `:261-278`
- **`db.add(activity)` — `activity_service.py:280`**
- **`await db.flush()` — `:281`**, `db.refresh(activity)` — `:282`

`create_activity` **does not commit** (the docstring at
`garmin_sync_service.py:27` claiming otherwise is stale). Commit boundaries live
in the callers:

| Caller | Commit |
| --- | --- |
| Garmin sync | `garmin_sync_service.py:411`, `:616` (one transaction so the RLS `SET LOCAL` survives — `:200-201`) |
| Manual POST | `backend/app/api/activities.py:58` |
| Strength | `backend/app/api/strength.py:344` → commit `:348` |
| Apple Health | `backend/app/api/apple_health.py:150` |
| COROS | `backend/app/services/coros_service.py:342` (`_persist_activity`, dedupe `:330-340`) |
| Wahoo | `backend/app/services/wahoo_service.py:222` (`_persist_workout`, dedupe `:210-220`) |

**Post-create hooks that ALREADY exist inside `create_activity`** — these are the
precedent for adding an award hook:
- **Coach-brief invalidation** for that athlete-local day — `activity_service.py:284-304`, try/except-wrapped (non-fatal)
- **Route-rehearsal retro-match** (cycling only) — `activity_service.py:310-320` → `app.services.rehearsal.retro_match.attach_actual_if_matching`

**Post-create in the sync:** `_sync_activity_streams` (`garmin_sync_service.py:205`,
defined `:223`) → `ingest_activity_streams(..., commit=False)` (`:269`).
`backend/app/services/stream_ingestion.py:69` is a true hand-rolled upsert
(`db.get` → insert `:127` / field-wise update `:129-130`), backfills NP onto
`activities` (`:136-140`), commits/flushes (`:141-144`).

**Post-sync hooks in `sync_user_garmin`** (all best-effort):
`recompute_missing_tss` (`:624` → `activity_service.py:352`),
`backfill_missing_elevation` (`:636` → `activity_service.py:427`),
**`if total_activities > 0: absorb_new_activities`** (`:645-648` →
`plan_absorption.py:71`), `apply_weigh_ins` (`:653-656`),
**`if total_activities > 0: invalidate_coach_brief_cache`** (`:677-678`, fn `:493`),
`_refresh_period_report_cache` (`:687`, fn `:452`). Returns
`{"activities_synced", "metrics_days", "dates_touched"}` (`:691-695`).

> **Critical gap for a reward layer: NO achievement scan and NO push fires on a
> new activity.** Achievements are computed **lazily on read** —
> `GET /achievements/mine` → `achievement_service.get_achievements` detects,
> `db.add(Achievement(...))` (`:459`, `:475-482`), commits (`:497`). So a rider
> only "earns" a badge when they happen to open the Achievements page.

**Recommended insertion points for a post-commit award hook:**
`activity_service.py:320` (per-activity, pre-commit, alongside the existing
rehearsal hook) or `garmin_sync_service.py:677-678` (per-sync, post-commit,
gated on `total_activities > 0` — where the coach-brief bust already lives).

### 2e. Webhooks / manual triggers

- **Garmin has NO webhook.** `backend/app/api/garmin.py`: `POST /garmin/connect` (`:57`, initial sync `:96`), `DELETE /garmin/disconnect` (`:159`), `GET /garmin/status` (`:208`), **`POST /garmin/sync`** (`:238`, guards `sync_status == "syncing"` `:254`, calls `sync_user_garmin` `:265`)
- **Wahoo webhook exists:** `backend/app/api/wahoo.py:192` `POST /wahoo/webhook` — unauthenticated, resolves user from payload, light token check (`:206-209`), manual RLS via `_set_rls_user` (`:252`)
- COROS: `GET /coros/callback` (`api/coros.py:101`), `POST /coros/sync` (`:176`), `_set_rls_user` (`:215`). No push webhook.
- Apple Health: `POST /apple-health/sync` (`api/apple_health.py:113`), synthetic `external_id` (`:149`)
- Activities API: `backend/app/api/activities.py` — `POST /activities` (`:36`), `POST /activities/recompute-load` (`:66`), `GET /activities` (`:99`), `GET /activities/{id}` (`:161`), `DELETE` (`:189`), `GET /activities/{id}/stream-analysis` (`:217`), `GET|PUT /activities/{id}/rpe` (`:278`, `:303` — a real `pg_insert(...).on_conflict_do_update(constraint="uq_ride_feedback_user_activity")`, the one true upsert in the codebase and a good pattern to copy)

---

## 3. Crew / social — a leaderboard already ships

### 3a. Models

**`backend/app/models/crew.py`**
- `Crew` (`:36`) → `crews`: `id`, `name` String(60), `owner_user_id` FK CASCADE, `created_at`; rels `memberships`, `invites` delete-orphan (`:52-57`)
- `CrewMembership` (`:64`) → `crew_memberships`: `crew_id`, `user_id`, `joined_at`, `role` String(10) default `"member"` (`:85`). **`UniqueConstraint("user_id")` (`:92`) — one crew per athlete**, plus `(crew_id,user_id)` (`:93`)
- `CrewInvite` (`:98`) → `crew_invites`: `crew_id`, `inviter_user_id`, `invitee_email` (254, lowercased), `token` String(48) **unique** (`:117`), `status` default `"pending"`, `created_at`, `expires_at` (default +14d via `_invite_default_expiry` `:31`), `accepted_at`
- **Roles:** `owner | member | challenger` — the third is a *challenge opt-in flag* smuggled into the role column (`CHALLENGE_OPT_IN_ROLE`, `crew_score.py:40`). `_members_to_read` (`crews.py:107`) collapses non-owner to "member".

**`backend/app/models/crew_social.py`**
- `CrewMessage` (`:37`) → `crew_messages`; index `(crew_id, id)` (`:62`)
- `CrewReaction` (`:66`) → `crew_reactions`: `target_type` String(16) ∈ `message|crew_week|event|ride` (`:81`), `target_id` nullable (`:84`), `emoji` String(16); unique `(user_id,target_type,target_id,emoji)` (`:99`). **Documented gap `:95-98`:** Postgres NULL-distinct means `crew_week` rows aren't DB-deduped; only the API read-then-toggle protects it.

**`backend/app/models/crew_challenge.py`** — `CrewChallenge` (`:25`) → `crew_challenges`: `crew_id`, `creator_user_id`, `name` (120), `metric` String(20) ∈ `tss|distance_km|active_days|hours|kj|rides` (`:36`), `target` Float, `period` ∈ `week|custom` (`:40`), `starts_on`/`ends_on` Date, `created_at`, `archived` Bool.

**`backend/app/models/crew_event.py`** — `CrewEvent` (`:38`) → `crew_events`: `kind` ∈ `sunrise_ride|chaingang|group_ride|race` (`:54`), `starts_at`, `description`, `meeting_point`, cached GPX tour columns (`:64-82`). `CrewEventAttendee` (`:100`) → `crew_event_attendees`, `status` ∈ `going|maybe|out`, unique `(event_id,user_id)` (`:125`).

**`backend/app/models/crew_nudge.py`** — `CrewNudge` (`:16`) → `crew_nudges`: `from_user_id`, `to_user_id`, `text` (280), `created_at`, `read_at`.

**Crew tables intentionally have NO RLS** (`ce9f1a2b3c4d_add_crew_events.py:25`,
`f7a1c2b3d4e5_add_crew_social.py:26`). Cross-user activity reads in `crew_score.py`
work because the app role owns the tables and there is no `FORCE ROW LEVEL
SECURITY` anywhere — stated explicitly at
`backend/app/services/ride_matching.py:3-4`. **Authorization for cross-user data
is API-level only.**

### 3b. Endpoints — `backend/app/api/crews.py` (prefix `/crews`, `:52`)

| Route | Function | Line |
| --- | --- | --- |
| `GET /crews/discover` | `discover_members` | `:165` |
| `POST /crews/{id}/invites/by-user` | `invite_by_user` | `:198` |
| `GET /crews/me/duel` | `my_duel` | `:215` |
| `GET /crews/me` | `get_my_crew` | `:230` |
| `POST /crews` | `create_crew` | `:262` |
| `DELETE /crews/{id}` | `disband_crew` (owner) | `:298` |
| `DELETE /crews/me/membership` | `leave_crew` | `:315` |
| `POST /crews/{id}/invites` | `create_invite` — `token_urlsafe(32)` `:401`, 14d expiry | `:344` |
| `POST /crews/invites/{token}/accept` | `accept_invite` — validates status/expiry/**email match** `:449`; `options.join_challenges` → role `challenger` `:466` | `:425` |
| `POST /crews/invites/{id}/revoke` | `revoke_invite` | `:498` |
| **`GET /crews/me/standings`** | **`my_standings` — the leaderboard** (`period` = day\|week\|month\|year) | `:526` |
| `GET /crews/invites/incoming` | `incoming_invites` | `:599` |
| `POST /crews/invites/{id}/accept-mine` | `accept_incoming` | `:645` |
| `POST /crews/invites/{id}/decline` | `decline_incoming` | `:689` |
| **`POST /crews/connect`** | `connect_with_user` — one-shot discover→invite; auto-creates `"<Handle>'s crew"` `:724` | `:706` |
| `POST /crews/nudge` | `send_nudge` — deterministic line pick; **coach-safety interlock** swaps to `COACH_NUDGE_LINES` when recipient's directive is rest/deload `:818-828` | `:790` |
| `GET /crews/nudges/incoming` · `POST /crews/nudges/{id}/read` | | `:847` · `:875` |
| `POST /crews/challenges` · `GET /crews/challenges` · `DELETE /crews/challenges/{id}` | `create_challenge` · `list_challenges` · `archive_challenge` (soft, `archived=True` `:1068-1070`) | `:957` · `:1026` · `:1049` |

Other routers: `backend/app/api/crew_chat.py` (`POST/GET /crews/me/chat` `:101`/`:132`;
**`GET /crews/me/rides`** all-crew ride feed `:196`), `crew_events.py`
(create `:282`, list `:312`, get `:341`, patch `:354`, `POST /{id}/rsvp` `:397`,
tour upload/download `:429`/`:489`, weather `:530`), `crew_reactions.py`
(`POST /toggle` `:94`, `GET ""` `:152`).

Also leaderboard-shaped outside the crew routers:
`GET /analytics/activity-debrief/{activity_id}/compare` →
`get_activity_compare` (`backend/app/api/analytics.py:359`), backed by
`ride_compare.build_comparison` (`:142`) and `ride_matching.find_rival_ride` (`:57`).

### 3c. `backend/app/services/crew_score.py` — the scoring engine

**This is the existing "points" algorithm and it is already self-referential.**

`crew_standings_window` (`:506`, wrapper `crew_standings` `:643`):

```
per local day:  pts = round(min(1.5, dayTSS / daily_target) * 100)   # cap 150/day (:592-593)
window score  =  Σ day points                                        # sorted desc (:621)
```

`daily_target` is **per-rider and personal** — `personal_week_targets` (`:158`):
4-week (`TARGET_HISTORY_WEEKS`) average weekly TSS × 1.05
(`WEEKLY_TARGET_MARGIN`), floored at 60 (`WEEKLY_TARGET_FLOOR` `:31`), ÷ 7.
Active-days target = 4-week avg clamped 3..6, **never 7** (`:34-35`, `:199-205`).

Other symbols: `_downsample_points` (`:123`, ≤14 buckets), `_wkg_from_profile`
(`:448`), `_latest_vo2max_for_user` (`:483`) / `_extract_vo2max` (`:460`),
`weekly_rich_stats` (`:293` — tss, distance_km, hours, kj via `_activity_kj`
`:145`, rides, active_days, best_tss, ring_score, avg_if), `crew_duel` (`:410`),
`tss_at_same_point_last_week` (`:215` — honest early-week pace basis),
`challenge_value_for_user` (`:361`) + `CHALLENGE_METRICS` (`:358`),
`member_in_challenge` (`:256`), `display_handle` (`:50`) / `_handle_from_email` (`:43`).

`backend/app/services/crew_social.py` — no scoring: `ALLOWED_EMOJI` (`:26` — 🔥 💪 👏 🚀 🙌 ⚡), `TARGET_TYPES` (`:29`), `require_membership` (`:37`), `reaction_summaries` (`:52`), `reaction_summary` (`:100`).
`backend/app/services/crew_tour.py` — GPX parsing only: `parse_gpx` (`:332`) → `ParsedTour` (`:55`), caps `MAX_POLYLINE_POINTS=200` (`:22`), `MAX_PROFILE_POINTS=120` (`:25`), `MAX_WAYPOINTS=12` (`:29`).

### 3d. What is actually shared between users

Gated on shared crew membership (`_is_member`/`_user_membership`
`crews.py:60-71`; `crew_social.require_membership:37`; `crew_events._require_membership:178`).
Identity is always a `display_handle` (display_name or email local-part);
**raw emails are never returned for other users**.

- **Standings** (`crew_score.py:599-618`): handle, `weekly_score`, `weekly_tss`, `daily_pct` strip, `distance_km`, **`wkg`**, **`vo2max`**, `weekly_target_tss`, `daily_target_tss`
- **Duel** (`:341-355`): handle, tss, distance_km, hours, kj, rides, active_days, best_tss, ring_score, avg_if, targets. *Note the doc-comment at `:297` claims "only training outputs — never body data", but W/kg and VO2max in the standings path are body-derived — a live inconsistency.*
- **Rides feed** (`crew_chat.py:240-251`): activity id, handle, title, started_at, distance_m, elevation_gain_m, duration_seconds — then the detail page pulls full streams
- **Events** (`crew_events.py:95-149`), **chat** (`crew_chat.py:71-80`), **reactions**
- **Discover** (`crews.py:165`): handle + `in_crew` for **every active user in the app** — the only non-crew-scoped read; filters seed/test accounts via `_is_test_account` (`:152`)

### 3e. Frontend

API clients in `frontend/src/api/`: `crew.ts` (`fetchMyCrew:68`, `createCrew:73`,
`disbandCrew:78`, `leaveCrew:82`, `inviteToCrew:86`, `acceptCrewInvite:94`,
`revokeCrewInvite:99`, **`fetchCrewStandings:103`**, `discoverMembers:123`,
`inviteMemberByUser:130`, `fetchDuel:164`; types `StandingRow:38`,
`StandingsResponse:53`, `CrewPeriod:36`, `DuelStats:142`), `crewChat.ts`,
`crewRides.ts`, `crewEvents.ts`, `crewReactions.ts` (`CREW_EMOJIS:10`),
`connections.ts`, `challenges.ts`, `nudges.ts`, `compare.ts`.

Hooks: `frontend/src/hooks/useCrew.ts` (`useMyCrew:37`, `useCrewStandings:51`,
`useDuel:133`), `useCrewChat.ts`, `useCrewRides.ts`, `useCrewEvents.ts`,
`useCrewReactions.ts`, `useChallenges.ts`, `useConnections.ts`, `useNudges.ts`.

Components:
- **`frontend/src/components/social/tabs/SocialTab.tsx`** (2203 lines) — the Community screen, default export `:197`; views Crew + Duelle. In-file: `BattleCard:1252`, `InviteCard:1455`, `FindPeople:1498`, `PersonRow:1628`, `ChallengeRow:1655`, `NewChallengeForm:1694`, `CrewChallengeCard:1765`, `NudgeCard:1873`, `EventCard:1905`, `NewEventForm:2044`, `MiniStat:2125`, `EmptyCrew:2145`, `DuelEmptyState:2186`
- `frontend/src/components/social/tabs/CrewHighlights.tsx:58` — "Crew Week Highlights" digest with award tiles ("biggest week", "most consistent"), ride-of-the-week + crew-PR rows as honest locked/empty states
- `social/ReactionBar.tsx:14`, `social/MemberFinder.tsx:10`, `social/CoachSafetyBanner.tsx:84` (recovery interlock, rendered `SocialTab.tsx:475`), `social/RouteMini.tsx:17`, **`social/BandChip.tsx:61`** (Coggan/Allen W/kg band label — the roadmap P2.9 "unmounted BandChip"), `social/socialLogic.ts` (pure: `pickPersonalTargets:47`, `isEarlyWeek:87`, `duelColumnHeaders:107`, `buildConnectPayload:129`)
- `frontend/src/components/crew/RouteMap.tsx` (420 L), `crew/RouteProfile.tsx`

Pages: `frontend/src/pages/CrewEventDetailView.tsx:86` (route `/crew-event/:id`,
`App.tsx:229`), `frontend/src/pages/CrewRideDetailView.tsx:210` (route
`/crew-ride/:activityId`, `App.tsx:247`, with `ReactionBar targetType="ride"` `:414`).
Mounted from `frontend/src/pages/DashboardPage.tsx:63` (`social` tab) and `:64` (`crew` tab).

**There is already a full leaderboard UI** — `SocialTab.tsx:707-853`
("Crew Leaderboard / Crew-Rangliste" `:711`): Day/Week/Month/Year toggle
(`BOARD_PERIODS:67`), ranking-metric chips (`BOARD_METRICS:89` — `load`,
`distance`, `wkg`, `vo2max` live; `elev` and `pr5k` rendered disabled/"not
tracked yet"), client-side re-rank (`board` useMemo `:395-409`),
medal-coloured rank badges (`:806`), share-of-leader bar (`:810`), hover panel
RANK/LOAD/SCORE/ACTIVE/TARGET/TO-LEAD (`:836-841`), footnote "Points = share of
your own weekly target" (`:847`). `CrewChallengeCard:1765` has its own mini
leaderboard (`:1839`) sorted by value (`:1775-1777`).

> Note the tension with the written guardrail: global leaderboards are banned,
> but a **crew-scoped** one against **personal targets** already ships. That is
> the precedent for how competition is allowed to exist here.

### 3f. The challenge mechanic

- **Definition:** `POST /crews/challenges` (`crews.py:957`), body `ChallengeCreate` (`backend/app/schemas/crew_challenge.py:13`). `period="week"` with no dates → Mon–Sun in the creator's local tz (`:971-975`); custom needs explicit dates (`:976-980`)
- **Default target is never a fixed wall:** for `tss`/`active_days` an omitted target derives from the creator's own `personal_week_targets` scaled by `window_days / 7` (`crews.py:989-1007`). Other metrics 422 `missing_target`
- **Participation is opt-in, not automatic:** `member_in_challenge` (`crew_score.py:256`) admits only the creator, explicit `role == "challenger"` opt-ins, or members who joined before `challenge.created_at`
- **Scoring/completion:** `_serialize_challenge` (`crews.py:902`) computes `value = challenge_value_for_user(...)`, `pct = min(100, round(value/target*100))` (`:926`), `reached = value >= target` (`:932`), participants sorted desc (`:936`). **There is no server-side "completed" state or timestamp** — completion is derived per request, and the frontend persists a `readCelebrated`/`writeCelebrated` localStorage set (`SocialTab.tsx:147,156`) to fire confetti once
- **Lifecycle:** soft-archive only; any crew member may archive

---

## 7. Frontend design system

Two design systems coexist. **V4** = `components/` + `pages/` + `index.css`
`--color-*` tokens. **EDITORIAL II** = `frontend/src/editorial/`, `--e-*`/`--st-*`
tokens, mounted under `/e/*`. A localStorage preference decides which one `/`
lands on.

### 7a. Routing — `frontend/src/App.tsx`

- Shape (`:64-79`): `BrowserRouter` → `ScrollToTop` → `AuthProvider` → `LocaleProvider` → **`CelebrationProvider`** → `ErrorBoundary` → `AppRoutes`
- `AppRoutes` (`:87-319`) wraps `<Suspense fallback={<AppSplash/>}>` in `<PageTransition routeKey={location.pathname}>` (`:90-92`)
- Code-splitting: only `LoginPage`/`RegisterPage` eager (`:15-16`); everything else `lazyWithRetry(() => import(...))` (`:19-62`, helper `frontend/src/lib/lazyWithRetry.ts`)
- Guard: `frontend/src/components/ProtectedRoute.tsx`, with `checkOnboarding` for main-app routes

**`/e/*` EDITORIAL II routes** (all `ProtectedRoute checkOnboarding`):

| Path | Component | Import | Route |
| --- | --- | --- | --- |
| `/e/today` | `editorial/pages/TodayPage` | `App.tsx:57` | `:294` |
| `/e/session` · `/e/session/:id` | `editorial/pages/SessionDetailPage` | `:58` | `:299` · `:300` |
| `/e/morning` | `editorial/pages/MorningWrapPage` | `:61` | `:301` |
| `/e/archive` | `editorial/archive/ArchiveDeckPage` | `:60` | `:302` |
| `/e/history` | `editorial/history/HistoryPage` | `:62` | `:307` |
| `/e/:tab` | `editorial/pages/TabPlate` (catch-all stub → `NotInThisSystem`) | `:59` | `:308` |

**Ordering matters — `/e/history` must precede `/e/:tab`** (comment `App.tsx:303-306`).

Landing choice: `frontend/src/editorial/state/designSystem.ts` —
`DesignSystem = 'v4' | 'editorial2'` (`:6`),
`LANDING = { v4: '/dashboard', editorial2: '/e/today' }` (`:36-39`),
`resolveLandingPath(search)` (`:42-46`) honours `?ds=` and persists to
localStorage key `designSystem` (`:8`).

Selected V4 routes: `/dashboard` (`:124`), `/achievements` → `AchievementsView` (`:282`),
`/season` (`:281`), `/progress/bike` (`:288`), `/wrapped` (`:274`),
`/recap/week` (`:273`), `/activities/:id/recap` (`:234`), `/crew-event/:id` (`:226`),
`/crew-ride/:activityId` (`:243`), `/design-lab` (`:277`, unprotected), `/` →
`RootRedirect` (`:311`, fn `:328-331`), `*` → `/dashboard` (`:314`).

**Adding a new page idiomatically:**
1. `frontend/src/pages/MyView.tsx`, default-export rendering `<AppShell title=...>`
2. `const MyView = lazyWithRetry(() => import('./pages/MyView'))` next to the others (`App.tsx:19-54`)
3. `<Route path="/my" element={<ProtectedRoute checkOnboarding><MyView /></ProtectedRoute>} />` **before** the `/` and `*` catch-alls (`:311-314`)
4. Data via a `useQuery` hook in `frontend/src/hooks/` calling a typed fn in `frontend/src/api/`

For an EDITORIAL II page: put it in `frontend/src/editorial/pages/`, wrap in
`<EditorialRoot>`, register under `/e/...` **above** `/e/:tab`. Only `App.tsx`
may import from `editorial/` (enforced by `isolation.test.ts`).

### 7b. The AppShell spine — `frontend/src/components/shell/`

Only two files:
- **`AppShell.tsx`** — default export, props `AppShellProps` (`:30-66`): `children, title, subtitle, back (default true), onBack, action, scene, nav (default true), stickyHeader`. Layout classes copied verbatim from `DashboardShell`'s `<main>`: `paper-grain relative isolate mx-auto flex min-w-0 max-w-md flex-col gap-6 px-4 pb-28 pt-3` (`:102`, `pb-28` clears the nav pill). `scene` renders as a 320px full-bleed **top band** with a gradient mask (`:88-100`). `stickyHeader` pins at `top: env(safe-area-inset-top, 0px)` with negative 16px margins to reclaim the gutter (`:105-126`). Renders `<MobileBottomNav />` when `nav` (`:140`). **Doc comment `:5-29` is the explicit rationale for why AppShell ≠ DashboardShell** (DashboardShell owns `TodayRoad`, `RoadHud`, `AuraContext` and a delegated pointer-scrub listener).
- **`PageHeader.tsx`** — `PageHeaderProps` (`:21-30`); 40px circular back button (`:46-60`); `num-display` title stepping 26→22→19px by length (`:71-80`); subtitle 12px (`:82`); right-aligned `action` (`:86`)

Pages on AppShell (11): `DesignLabView`, `RideRecapView`, `WorkoutBuilderView`,
`CrewRideDetailView`, `WorkoutDetailView`, `LoadFormView` (archived), `DebriefView`,
`SessionReportView`, `SettingsPage`, `CrewEventDetailView`, `DashboardsPage`.
Pages on `DashboardShell` (13): `DashboardPage`, `ProfileView`, `PowerProfileView`,
`ExploreRoutesView`, `PlanImportView`, `ClimbCompanionView`, `SeasonView`,
`CalendarPage`, `RouteRehearsalView`, `CoachPage`, `ActivitiesPage`,
`BikeProgressView`, **`AchievementsView`**.

Nav: `frontend/src/components/dashboard/MobileBottomNav.tsx` — `TABS` = Today /
Plan / Body / History (`:17-22`), `resolveActive()` maps legacy `?tab=` (`:36-44`),
asserts parity with `CHAPTERS` from `frontend/src/utils/seasonArc.ts` (`:29-31`).
EDITORIAL II nav: `frontend/src/editorial/components/TabBar.tsx` (`tabsOf:22`, default `:56`).

### 7c. Tokens

**No `theme.ts`/`palette.ts` module** — tokens are CSS custom properties.

**V4** — `frontend/src/index.css` (503 lines, `:root`):
`--font-sans/serif/mono` (`:4-6`); `--color-paper #0A0C0F`, `--color-paper-2 #14181D`,
`--color-surface-2/3`, `--color-rule` (`:9-13`); `--color-ink`, `--color-ink-2`,
`--color-muted` (`:16-18`); `--color-accent #FF5A3C` (+`-soft`), `--color-forest`,
`--color-amber(-2/-soft)`, `--color-ink-blue`, `--color-alert`, `--color-gold(-soft)`,
`--color-violet(-soft)` (`:21-34`); `--color-zone-1..6` (`:36-41`) **redeclared as
`--color-zone-1..7` at `:56-62`** — later block wins; flagged as a possible defect;
`--color-recovery|strain|move|exercise|stand` (`:44-48`); `--color-good|caution|bad`
(`:51-53`); `--color-sport-bike|run|strength` (`:65-67`); `--radius-xs..2xl`,
`--radius-pill` (`:73-79`); `--shadow-1..4`, `--shadow-glass-rim` (`:82-86`);
`--blur-*` (`:89-93`); `--ease-apple-*`, `--ease-chart-draw`, `--ease-spring`
(`:96-100`); `--duration-micro..xlong` (`:103-107`). Utility classes:
`.paper-grain` (`:303`), `.num-display` (`:320`), `.num-mono` (`:327`),
`.eyebrow` (`:332`), `.hairline` (`:290`), `.ai-gradient` (`:165`), `.shimmer-bg` (`:232`).

**EDITORIAL II** — `frontend/src/editorial/tokens.css` (311 lines). Namespaces:
`--e-*` base, `--st-*` day-state accents, `--m-*` metric hues, `--d-*` depth ramp,
`--s-*` status, `--g-*` per-state grounds, `--t-*` type scale, `--ar-*` Archive deck.
- `--e-bg #08090C`, `--e-ink`, `--e-mid`, `--e-lo`, `--e-quiet`, **`--e-acid #C8FF00`**, `--e-rule`, `--e-glass`, `--e-cool`, `--e-warn`, `--e-bad` (`:6-16`)
- `--st-rest|training|trained|resting|evening` (`:19-23`), `--st-morning` (`:275`)
- `--m-hrv|sleep|cardiac|load|form|fatigue` (`:26-31`); `--d-1..d-4` (`:35-38`); `--s-good|mid|low` (`:41-43`)
- Alpha mixes off the active accent: `--st-a07/a12/a16/a28/a40` (`:61-65`), `--st-a26` (`:242`)
- Grounds `--g-*` (`:87-93`, `:276`), bound live via `--st-active` / `--e-ground` (`:98-99`, `:283-285`)
- Chart tokens: `--e-track-base`, `--e-track-band` (`:73-74`), `--e-bar-dim` (`:113`), `--e-bar-ghost(-dim)` (`:119-120`), `--e-baseline` (`:124`), `--e-zone-z2/z3` (`:127-128`), `--e-peak-track` (`:131`), `--e-hairline` (`:108`), `--e-rule-strong` (`:160`), `--e-hatch` (`:231`)
- Type scale: `--t-display 146px`, `--t-hero 42`, `--t-title 34`, `--t-lead 22`, `--t-body 15`, `--t-label 12`, `--t-micro 11` (`:210-216`)
- Archive palette `--ar-ground|lift|gold|gold-dim|gold-ghost|cool|cool-dim|ink|ink-2|quiet|rule|rule-soft` (`:299-310`)

**Scoping:** all editorial tokens are declared under `.editorial-root`, never
`:root`. `EditorialRoot` (`frontend/src/editorial/EditorialRoot.tsx:34-59`)
imports `./tokens.css` (`:4`), applies `className="editorial-root"`, sets
`--st-active` / `--e-ground` / `--e-photo-tint` inline from the day state
(`:38-41`), caps width at 390, pads `env(safe-area-inset-*)` (`:51-52`), and
renders the sheet portal target `#editorial-sheet-root` (`:57`).

**Isolation tests — the leak guard:**
`frontend/src/editorial/__tests__/isolation.test.ts` asserts (1) nothing outside
`editorial/` imports from `editorial/` **except `App.tsx`** (`:35-44`);
(2) `editorial/components/**` may not import hooks nor call `useTodayModel(`/
`useSessionModel(` — `components/ui/RouteSketch` is the one allowlisted outbound
import (`:46-63`); (3) **no raw hex colours** in editorial style values
(regex `#[0-9a-fA-F]{6}`, only `tokens.css`/`tokens.test.ts` exempt) (`:65-81`).
`frontend/src/editorial/__tests__/tokens.test.ts` asserts `.editorial-root`
scoping and `not.toMatch(/^:root/m)` (`:8-11`), plus the palette verbatim (`:13-28`)
and depth ramp (`:30-40`).

TS-side V4 helpers: `frontend/src/components/dashboard/surfaces.ts` —
`SurfaceTier = 'recessed' | 'card' | 'hero'` (`:46`), `surface(tier)` (`:62`),
`RIM` (`:42-43`); `frontend/src/components/dashboard/glassCard.ts` —
`supportsBackdropFilter()` (`:24`), `GLASS_PAPER_2` (`:33`), `GLASS_BLUR` (`:39`).

### 7d. Shared primitives

**`frontend/src/components/ui/`**: `ActivityRings.tsx:11` (+`RingSpec:5`),
`BentoGrid.tsx:56` / `BentoCell:88`, `CommandPalette:32`, **`Confetti.tsx:14`**,
`ExpandableCard:12`, `GlossarySheet:36`/`useGlossary:216`, `HoverBars:19`,
`MethodsDrawer:65`/`useMethods:262`, `MetricCard:8`, `RouteSketch:20`,
**`ScoreRing.tsx:57`**, `SegmentedTabs<T>:38`, `SideSheet:33`, `Sparkline:39`,
`StatValue:64` (+`resolveStatValue:37`, `StatDisplay:21`, `DASH:19`).

**`frontend/src/editorial/components/`** (~45 files) — the reward-relevant ones:
- **`BentoTile.tsx`** — `TileChart` union (`:12-37`: `spark | bars | band | deviation | stages`), `BentoTileProps` (`:39-57`), `TileChartView` (`:88`), default (`:353`). **The canonical editorial chart tile**, and the carrier of the one-highlighted-point rule.
- **`BentoGrid.tsx`** — `BentoEntry` (`:4`), **`rankTiles(entries, reason)` (`:88`)**, default (`:92`) — the reasoning-driven layout ranker
- **`StatTile.tsx`** — default `StatTile({label, value: Value<number|string>, unit, hideReason})` (`:37-47`), renders `data-stat-tile`. **The canonical stat tile.**
- **`LiveRing.tsx:71`** — the ring primitive
- `Bars.tsx` (`BarsBlock:7`), `SegmentedMeter.tsx`, `MetricTrack.tsx`, `PMCChart.tsx`, `FatigueCurve.tsx`, `Hypnogram.tsx`, `PeakRows.tsx`, `ZoneRows.tsx`, `RangeRow.tsx`, `DeltaRow.tsx`, `SignalRow.tsx`, `VerdictRow.tsx`
- **`KetteStrip.tsx`** (the streak strip), `InsightStrip.tsx`, `BigNumbers.tsx`, `Cover.tsx`, `ProfileAvatar.tsx`, `WeekRail.tsx`, `DayRail.tsx`, `Sheet.tsx`

**Canonical patterns:** V4 card = `surface(tier)` from `surfaces.ts` (+ `glassCard.ts`
for the translucent Today variant); V4 stat = `ui/StatValue.tsx` / `ui/MetricCard.tsx`.
EDITORIAL II card = `BentoTile`/`BentoGrid`; EDITORIAL II stat = `StatTile`.

### 7e. `frontend/src/editorial/` tree

```
editorial/
├── EditorialRoot.tsx     .editorial-root shell, --st-active/--e-ground binding, sheet portal
├── tokens.css            every --e-/--st-/--m-/--d-/--s-/--g-/--t-/--ar- token
├── components/           ~45 presentational components (NO hooks, NO data — enforced)
├── pages/                TodayPage, TodayView (105 KB layout), SessionDetailPage,
│                         MorningWrapPage, TabPlate, NotInThisSystem
├── data/                 useTodayModel.ts (42 KB), useSessionModel, useMorningWrapModel,
│                         value.ts (Value/present/missing), verdictSplit.ts, blocks.ts
├── state/                dayState.ts, useDayState.ts, designSystem.ts
├── motion/               useScrub, useChainShift (ORPHANED), useReveal, useListNav,
│                         useTapHighlight, useSwipeStep, useCountUp, touchTarget
├── i18n/                 copy.ts (42 KB), useCopy.ts (CopyLocaleProvider)
├── morning/              MorningDeckView, MorningPlate, MetricTiles, Claim, PeekStrip,
│                         DawnAura, ChapterRail, FormBlock, model.ts, fixture.ts, morning.css
├── archive/              ArchiveDeckPage/View, ScrollHint, archiveFixture, archive.css,
│                         charts/{FitnessForm,PowerCurve,Projection,RideScatter}
├── history/              HistoryPage, useHistoryModel, buildHistoryModel, monthBuckets
└── __tests__/            41 files + helpers/makeTodayModel.ts
```

`pages/TodayPage.tsx:29-66` is the container (`useDayState()`, `useTodayModel(state)`,
`useAuth()`, `useForceSync()`) handing everything to the **pure** `TodayView`.
`pages/MorningWrapPage.tsx:19-21` is deliberately not wrapped in `EditorialRoot`
(needs an exact 100dvh box) and is **still on `MORNING_WRAP_FIXTURE`, not live data**.

### 7f. Charts

`frontend/src/components/charts/` is **not** a primitives library — it is the
user-built dashboard chart system: `ChartCanvas.tsx:328`, `ChartBuilder.tsx:211`,
`ChartTextPrompt.tsx:11`, `DashboardCanvas.tsx:69`.

Actual primitives: V4 → `ui/Sparkline.tsx`, `ui/HoverBars.tsx`,
`ui/ActivityRings.tsx`, `ui/ScoreRing.tsx`, `dashboard/Sparkline.tsx`,
`dashboard/PMCChart.tsx`, `dashboard/IntervalRibbon.tsx`. EDITORIAL II →
`BentoTile.tsx` (inline SVG spark/bars/band/deviation/stages), `Bars.tsx`,
`SegmentedMeter.tsx`, `MetricTrack.tsx`, `PMCChart.tsx`, `FatigueCurve.tsx`,
`Hypnogram.tsx`, `PeakRows.tsx`, `LiveRing.tsx`. Archive →
`editorial/archive/charts/*`. Chart motion/interaction tests:
`editorial/__tests__/chartInteraction.test.tsx`, `chartMotion.test.tsx`.

### 7g. The visual harness (the project's review method)

**`frontend/src/editorial/__tests__/visualHarness.test.tsx`** (20 KB) — renders a
real screen from a hand-written fixture via `@testing-library/react`, then writes
**standalone HTML** to disk. **There is no screenshotting or image diffing** — it
is "write HTML, serve it, look at it".

- Gate: `const OUT = process.env.HARNESS_OUT` (`:18`); every case is `it.skipIf(!OUT)` (`describe` `:263`; cases `:264,267,270,273,276,279` — Trained, Rest, Training, Resting, Evening, Session Detail), so it is inert in the normal suite
- Usage (header `:7-11`): `HARNESS_OUT=/tmp/trained.html npx vitest run …`, then `python3 -m http.server 8971 --directory /tmp` (file:// is blocked in the browser tool), open at 390×844
- `writeHarness(name, model)` (`:57-73`) renders `<MemoryRouter><TodayView model={m} profile={…}/></MemoryRouter>`, `readFileSync`s `../tokens.css` (`:64`), emits a doctype page with Sora+Inter font links and `<style>*{box-sizing:border-box}html,body{…background:#000}${tokens}</style>` (`:67-72`)
- Note `:25-27`: the harness fixtures were backfilled with **Task 5's cassette hero fields** and exercise `MIN_SERIES_FOR_PERCENTILE` (14) — a live remnant of the cassette work
- Siblings: `archiveHarness.test.tsx` (greps `--ar-ground` out of tokens.css by regex `:27` rather than hardcoding a hex, to satisfy `isolation.test.ts`), `morningWrapHarness.test.tsx`, `sheetsHarness.test.tsx`

### 7h. API layer

- axios + TanStack Query v5 (`@tanstack/react-query ^5.99.2`, `axios ^1.15.0`, `react-router-dom ^7.14.1` — `frontend/package.json:18,20,31`). No SWR.
- `frontend/src/api/client.ts`: `BASE_URL` precedence `VITE_API_URL` → `''` in PROD → `http://localhost:8042` in dev (`:11-16`), re-exported as `API_BASE_URL` (`:27`); `apiClient = axios.create({ baseURL, withCredentials: true })` (`:47-50`); **access token in memory only, never localStorage** (`:29-38`); request interceptor attaches Bearer (`:53-61`); response interceptor refreshes on 401 and **queues parallel 401s** via `_failedQueue`/`processQueue` (`:64-79`, `:93-122`)
- Convention: one module per domain in `frontend/src/api/` (38 files), each exporting typed request fns + their interfaces
- Hooks: ~60 `use*.ts` in `frontend/src/hooks/`; canonical shape at `frontend/src/hooks/useDailyMetrics.ts:4-9`
- `frontend/src/lib/queryClient.ts:5-21`: `staleTime 60_000`, `gcTime 5*60_000`, `refetchOnWindowFocus: false`, no retry on 401/403/404 else 1, mutations `retry: false`
- Provider order `frontend/src/main.tsx:9-17`: `StrictMode` → `QueryClientProvider` → `LanguageProvider` → `App`

---

## 9b. Persistence — the concrete "how to add a table" pattern

- **44 migrations** in `backend/migrations/versions/`. Naming: `{revision_id}_{snake_case_slug}.py`, revision ids hand-picked hex-ish strings often with a mnemonic prefix (`el7a2c9d3f4b` elevation, `pa54170d1dab` plan adaptations, `rf9a1b2c3d4e` ride feedback, `f3d7a1c9b2e8` achievements).
- **Head revision: `8c7827401c0e`** (`8c7827401c0e_route_rehearsal_saved_flag.py`, `down_revision = 'b9d106ca0f6e'`). Single head; base `78e00c708669`. One merge revision exists: `7d54464d26a1_merge_sleep_vitals_achievements.py` with `down_revision = ('f3a4b5c6d7e8', 'f3d7a1c9b2e8')`.
- **Copy this file:** `backend/migrations/versions/c9d0e1f2a3b4_add_activity_streams.py` — docstring header (`:1-11`), `revision`/`down_revision`/`branch_labels`/`depends_on` (`:13-17`), `op.create_table(...)` with explicit `sa.Column`s + `sa.ForeignKeyConstraint(["user_id"],["users.id"], ondelete="CASCADE")` + `sa.PrimaryKeyConstraint` (`:22-44`), `op.create_index(op.f("ix_<table>_user_id"), ...)` (`:45-50`), then the **RLS block** (`:52-59`):

```python
op.execute("ALTER TABLE activity_streams ENABLE ROW LEVEL SECURITY;")
op.execute("""
    CREATE POLICY user_isolation ON activity_streams
        USING (user_id = current_setting('app.current_user_id', true)::INTEGER);
""")
```

  …and an exact-inverse `downgrade()` (drop policy → disable RLS → drop index → drop table) (`:62-66`).
- Same shape with a `UniqueConstraint` + JSONB: `backend/migrations/versions/f3d7a1c9b2e8_add_achievements.py:26-56` — **this is the closest analogue for any new reward table.**
- Hypertable variant (raw `CREATE TABLE` + `DO $$ … create_hypertable … $$` guarded on `pg_extension` + raw `CREATE INDEX`): `e5c8f4a1_add_daily_metric_samples.py:20-63`.
- **RLS convention:** every policy is named `user_isolation` and reads `current_setting('app.current_user_id', true)::INTEGER`. Applied per-request by `backend/app/dependencies.py:49` `get_db_for_user`: `int()`-coerced `SET LOCAL app.current_user_id` (`:68`) plus an `after_begin` listener `_reapply_rls` (`:70-73`) so the setting **survives multiple commits in one request** (needed by the Garmin sync), removed in `finally` (`:81`). Unauthenticated webhooks replicate it manually (`api/wahoo.py:252`, `api/coros.py:215`).
- `backend/app/database.py`: `class Base(AsyncAttrs, DeclarativeBase)` (`:14`), `engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)` (`:20`, must be `postgresql+asyncpg://`), `async_session_maker(expire_on_commit=False)` (`:26`), `get_db()` (`:29`, no RLS). Alembic runs sync via psycopg2 (`migrations/env.py:26-29`).

---

## The five biggest gaps for a reward layer

1. **Awards are pull, not push.** Nothing fires on ingestion. `create_activity` (`activity_service.py:280`) commits a ride and the only reactions are a coach-brief bust and a rehearsal match. `get_achievements` only detects when the user opens `/achievements`. There is no server-side "you just unlocked X" event, no unlock feed, and no notification.
2. **No period-end evaluation job.** The cron (`app/jobs/run_scheduled_jobs.py`) has four sweeps and none of them is a reward sweep. Weekly/monthly closes, streak-milestone detection and crew challenge completion are all computed on read, client-side, or not at all — `CrewChallenge` has **no completed state or timestamp** (`crews.py:902-936`), and completion is deduped in **localStorage** (`SocialTab.tsx:147,156`), so it doesn't survive a device switch.
3. **Push is morning-only.** `send_user_push` exists (`push_service.py:90`) but the only job is `run_morning_push_briefs`. There is no post-ride push (backlog F1, tagged `NEEDS-CHECK`), and **no email at all**. Subscriptions live in an `AthleteProfile` JSON blob, not a table.
4. **Nothing cosmetic or self-expressive to reward with.** Identity is `display_name` + a base64 `avatar_url` and that's it — no titles, themes, frames, or any unlockable surface. The bans on XP/levels/loot (`docs/competitive-roadmap-tasks.md`, `AchievementsView.tsx:1-5`, `LevelStripCard.tsx:1-7`) close the usual escape hatch, so a reward *currency* would need a genuinely new, physiology-grounded carrier.
5. **The streak lives in three half-connected places.** Server truth (`streak.py`), a client mirror in localStorage (`lib/celebration.ts:92-108` `readStoredStreak`/`writeStoredStreak`, needed for break detection), and two separate UIs (`KetteStrip` on `/e/today` vs `TodayTab`/`StreakBreakOverlay` on `/dashboard`). Celebration dedup is entirely localStorage (`hasCelebrated`/`markCelebrated`), so **unlocks do not survive a device switch** — the exact problem the `Achievement` table was created to fix, still unfixed for celebrations. Also: `useChainShift.ts` is orphaned, and there is no celebration cooldown/rate-limit (backlog E2).

