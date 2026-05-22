# App Structure Redesign — Moment-First Navigation

**Date:** 2026-05-22
**Status:** Design — pending implementation plan
**Scope:** Top-level information architecture, tab semantics, experience-level mechanics, Sunday-planning ritual

---

## 1. Problem

The current app exposes four tabs (`Today · Train · Trends · Crew`) that mix surfaces by content type rather than by user moment. Three concrete consequences:

1. **Coach is hidden.** The product is called *AI Cycling Coach*, but the chat surface lives behind a submenu — users miss the central value prop.
2. **The post-ride moment has no home.** `PostRideReview` exists as a component but is scattered across Today/Activities/Calendar.
3. **The Sunday-planning ritual is unmodeled.** Research (Gollwitzer/Sheeran on implementation intentions) shows a ~2× adherence lift when users commit to a concrete next-week intention; nothing in the current IA triggers or captures this.

Additional friction sources validated against `.planning/research/`:

- TrainingPeaks-style jargon (CTL/ATL/TSB, polarized distribution) bounces beginners.
- Garmin-style "Body Battery" verdicts without visible inputs erode trust (athlete-pain-points §8).
- `Crew` as its own top-level tab is over-prominent for a coaching app, but underplayed as a retention moat in research (Stragier 2022, Peloton pack-effect).
- Pro users see "PMC/FTP/VO2 in nicer chrome" — no real differentiator vs. TrainingPeaks / Intervals.icu. Tier-1 differentiators (durability, aerobic decoupling, Z2-drift) are commercially absent and scientifically validated.

## 2. Goals & Non-Goals

**Goals**
- Each top-level tab maps to a distinct user *moment*, not a content category.
- A single experience-level mechanism that scales the app from first-time rider to data-driven athlete without forking the codebase.
- A first-class Sunday-planning ritual that captures one explicit intention per week.
- Coach is a primary surface, not a submenu.

**Non-Goals**
- No backend data model overhaul. This redesign is an IA + component-reshuffling exercise; existing components are reused with new homes.
- No new authentication / onboarding rewrite. We add two onboarding questions; the rest stays.
- No social-graph rebuild. Crew gets a dedicated page but uses existing crew APIs.

## 3. Top-Level Architecture

### 3.1 Tabs

```
Today  ·  Ride  ·  Progress  ·  Coach
```

Crew is reachable via a strip in Today (`/crew` route remains). The desktop tab strip and `MobileBottomNav` reflect the four tabs above.

### 3.2 Tab Anatomy

#### 🌅 Today *(Morning Moment)*

Scroll order:

1. **ReadinessHero** — verdict (Ready / Push / Hold). **Tap opens a Contributors-Sheet** showing HRV, sleep, load, strain as the inputs that produced the verdict. (Anti-Garmin: transparency = trust.)
2. **CoachBrief** — 1–2 sentences in plain language, AI-generated, explaining the verdict and today's prescription.
3. **TodayPlanCard** — today's workout, hero-sized.
4. **MorningCheckin** — collapsible once completed.
5. **CrewStrip** — glance only: who rode today, pack rivals. Tap → `/crew` page.
6. **TomorrowChip** — small chip (not card), closes the loop on "why today?" without competing with the Sunday moment.
7. **StreakStrip** — bottom, motivation layer.

**Removed from Today:** `PolarizedDistribution`, `LastWeekRecap`, `WeeklySportMetrics`, `PMCCompact` — these belong in Progress.

#### 🚴 Ride *(Pre / Post / Rest — context-aware)*

Three states resolved client-side based on (a) today's plan and (b) whether a ride was synced today:

- **Pre-Ride** (workout scheduled, not yet ridden): `PrescribedWorkoutCard` (large), `IntervalRibbon`, `WorkoutExportRow` (Garmin/Wahoo/Zwift), "What will this do for you?" coach blurb, recent-rides strip beneath.
- **Post-Ride** (ride synced today): `PostRideReview` (large), strain vs. target, impact on form (CTL/TSB delta), "how tomorrow follows" coach blurb.
- **Rest-Day** *(new — currently the tab is empty)*: 3-day workout preview, "why this rest is doing work" coach blurb, optional active-recovery suggestion.

#### 📈 Progress *(Weekly Recap + Body, Pro-aware)*

**All users see:**
1. *Diese Woche / This Week* — `WeekStrip`, `ComplianceStrip`, `LastWeekRecap`, `WeeklyChallenge` detail.
2. *Was wurde besser? / What Got Better* — identity-recap of PRs, longest ride, peak power, streak. Prevents an empty Easy-mode tab.
3. *Dein Körper / Your Body* — `HRVTrend`, sleep, regeneration. Easy-mode shows "recovery good/bad" framing; Pro-mode shows ms / RHR / sleep stages.

**Pro-mode adds:**
4. *Form & Fitness* — `PMCChart`, `RampRate`, `FTPEstimate`, `VO2MaxEstimate`, `IntensityDistribution`, `PolarizedDistribution`.
5. *Durability (new)* — late-ride power decay trend (last-30-min vs. first-30-min power normalized for matched intensity windows). Surface as a single trend line across the last N rides.
6. *Aerobic Decoupling / Z2-Drift (new)* — HR drift vs. power over ride duration for Z2 rides; presented as a per-ride percentage with a trend.

#### 💬 Coach *(Chat + Sunday Mode)*

**Default state:**
- `CoachChat` (primary surface)
- `PatternInsight`, `PersonalInsights`, `DidYouKnow` as passive coach output beneath the chat.
- Quick-action chips: "Warum mein Verdict?" · "Was bringt mir die nächste Woche?" · "Wo bin ich besser geworden?"

**Sunday Mode** (triggered by a Sunday-evening push, also reachable any time via "Plan next week" chip):
1. Recap of the just-finished week (what hit the plan, what didn't, one observation).
2. Preview of next week's prescribed structure.
3. **One concrete intention** captured from the user (text + optional day/time). Stored as an implementation intention and surfaced in Today's verdict next week ("you wanted to ride Z2 today").

#### Crew (page, not tab)

`/crew` — pack overview, weekly goals, rivals, kudos, activity feed of the crew. Reached via tap on the Today CrewStrip.

## 4. Experience Level (Easy ↔ Pro)

### 4.1 Setting it

Two onboarding questions added after profile setup:

- **Q1 — Goal:** open-ended ("first 100 km", "FTP +20 W", "survive the climbs this summer"). Stored as `athlete_profile.goal_text`. Used by the coach as context.
- **Q2 — Experience level:** "How deep do you want to go on the data?" → `Just ride` (Easy) / `Show me the metrics` (Pro). Stored as `athlete_profile.experience_level`. Default = Easy.

### 4.2 What it affects

| Surface | Easy | Pro |
|---|---|---|
| Verdict label | "Frisch / Mittel / Müde" | "TSB +5 / Ready" |
| Workout copy | "45 min easy spin, chat-pace" | "45 min Z2, 65–75 % FTP, 200–230 W" |
| Interval ribbon | "3× hard chunk with rest" | "3× 8min @ 105 % FTP, 4min recovery" |
| Progress §4–6 | hidden | visible |
| Body section | "recovery good/bad" | ms, RHR, sleep stages |
| Coach voice | analogies & images | precise numbers & terms |
| Z-distribution / polarized | hidden | visible |

### 4.3 Mechanics

- Single flag `experience_level: 'easy' | 'pro'` on `athlete_profile`, propagated via context.
- Components render variants by reading the flag — no parallel code path.
- **Easy hides presentation, never data.** Any metric is tappable → opens an explanatory coach-sheet that introduces the concept.
- **Per-section override** (Settings → Display depth): per-section flags (`form`, `body`, `workout_detail`) can be flipped independently. Defaults follow the global flag. Stored as a JSON column or three nullable booleans on `athlete_profile`.

## 5. Sunday-Planning Ritual

| When | What | Where |
|---|---|---|
| Sun 18:00 local | Push: "How was your week?" | Tapping opens Coach → Sunday Mode |
| 3 steps | Recap → Preview → 1 Intention | Sequential, ~90 sec total |
| Outcome | One concrete training intention for the upcoming week | Stored; surfaced in next week's Today verdict ("you wanted to ride Z2 today") |

Push opt-out lives in Settings. The Sunday Mode surface is also reachable any time via a chip in the Coach tab — push is a trigger, not the only door.

## 6. New & Reshuffled Components

**New components**
- `ContributorsSheet` — drawer opened from `ReadinessHero` tap. Shows HRV trend, sleep, load, strain as verdict inputs.
- `RideRestDayPanel` — fills the Rest-Day state in the Ride tab.
- `WhatGotBetter` — identity-framed recap for Easy-mode Progress.
- `DurabilityTrend` — Pro-mode Progress section (late-ride power decay).
- `AerobicDecouplingTrend` — Pro-mode Progress section (HR drift vs. power on Z2 rides).
- `SundayPlanFlow` — three-step flow in Coach tab.

**Reshuffled**
- `PolarizedDistribution`, `LastWeekRecap`, `WeeklySportMetrics`, `PMCCompact` → Progress.
- `PostRideReview` → primary citizen of Ride tab (post-state).
- `PrescribedWorkoutCard` + `WorkoutExportRow` + `IntervalRibbon` → Ride tab (pre-state).
- `CoachChat` → Coach tab as the primary surface.

**Retired or demoted**
- `DashboardTabs` (today/week/form segmented control) — replaced by the four top-level tabs.
- The standalone `Activities` and `Calendar` pages are deep-link surfaces only; their entry points move to the Ride tab (recent activity strip) and a calendar chip in Progress.

## 7. Backend Changes

Minimal:

- `athlete_profile`: add `experience_level enum('easy','pro') default 'easy'`, `goal_text text`, `display_overrides jsonb` (or three nullable booleans).
- New table `week_intentions`: `(athlete_id, iso_week, text, target_day, target_time, created_at, completed_at)` — Sunday-planning output.
- New endpoint `GET /api/progress/durability` and `GET /api/progress/decoupling` — pre-computed trend series for the Pro Progress sections, derived from existing activity-stream data.
- No changes to crew, biometrics, daily-metrics, or coach-service contracts.

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Newbies feel patronized by Easy default | Onboarding asks goal + level explicitly; per-section override; Easy framing is identity-affirming ("Just ride") not skill-deficit |
| Ride tab feels empty on rest days | Rest-Day state with 3-day preview and active-recovery suggestion |
| Sunday push is ignored | Coach-tab chip provides a non-push door; the recap is valuable on its own |
| Durability/Decoupling computations require stream data not all users have | Sections render an empty-state explaining the prerequisite; show only when ≥3 qualifying rides exist |
| Per-section override adds settings complexity | Hidden under "Display depth" in Settings, not surfaced in onboarding |

## 9. Out of Scope (for this redesign)

- Workout creation UI / plan generation algorithm changes.
- Crew social-graph features beyond the existing API.
- Notification system overhaul (Sunday push uses whatever push infrastructure exists; if none, the chip becomes the sole entry until push lands).
- Theme / visual-design changes — this is structural.

## 10. Open Questions for Implementation Plan

1. Does push infrastructure exist? If not, Sunday Mode ships chip-only first.
2. Are durability/decoupling pre-computed on activity ingestion, or computed on-demand for Pro users? (Recommend on-ingestion for cached read-paths.)
3. Migration path for existing users: do all become Easy by default, or does a one-time prompt let them self-select?

These resolve during the writing-plans phase.
