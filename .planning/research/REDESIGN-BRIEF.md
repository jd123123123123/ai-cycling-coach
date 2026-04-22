# Redesign Brief: Apple-like 2027 Cycling Coach

*Synthesizes `ui-reduce-scroll-patterns.md`, `competitor-pain-points.md`, `apple-2027-design-language.md`, `retention-psychology.md`. Maps findings to existing components. Produces prioritized action list.*

---

## 0. Design-direction decision required first

The current dashboard uses an **editorial/newspaper aesthetic** — "The Coach · Daily · est. 2026", amber/forest/paper palette, serif numerals, masthead + dateline + colophon. The request is "Apple-like 2027" — Liquid Glass, SF Pro, system accent palette, spring physics. **These do not coexist.**

Three viable paths. Pick one before execution starts:

| Path | What it means | Pro | Con |
|---|---|---|---|
| **A. Full pivot to Apple 2027** | Adopt the semantic color tokens, SF Pro stack, Liquid Glass materials, spring motion, segmented-tab dashboard. Retire the editorial masthead. | Matches the brief literally. Familiar to serious athletes. Strongest forward-looking signal. | Throws away the distinctive editorial voice — most fitness apps already lean "Apple-like." Risk: we become one of many. |
| **B. Keep editorial voice, adopt Apple motion/structure** | Keep amber/forest palette and newspaper typography. Adopt Apple's *structure* (segmented tabs, bento, side sheets, command palette, spring motion) but render in the editorial style. | Distinctive — no other coach looks like this. Retains identity. Borrows Apple's discipline without copying its skin. | Not literally "Apple-like." More design risk (custom direction is harder to nail). |
| **C. Hybrid: Apple chrome + editorial canvas** | Apple-style glass nav, chat, and controls; editorial typography + amber palette for content surfaces. | Best of both — glassy chrome reads modern, content reads premium-editorial. | Fussy. Requires strong typography/material discipline to avoid feeling schizophrenic. |

**My recommendation: B.** Serious athletes have seen every flavor of Apple-skinned fitness app. The editorial direction is already working and is genuinely differentiated. Steal Apple's *structural* discipline (bento, segmented tabs, side sheets, springs, palette) and apply it through the existing editorial identity. The brief's "Apple-like" should be read as "Apple-disciplined," not "Apple-skinned."

If you disagree: pick A or C and I'll rescope the execution plan. All three paths use the same structural research; the difference is the visual skin. **Rest of this brief assumes we agree on Path B unless you say otherwise.**

---

## 1. The competitive whitespace (anchor everything here)

From `competitor-pain-points.md` Theme F: **"The coach isn't there."**

- WHOOP: gives strain numbers, no daily prescription.
- Oura: readiness score + one-line tip, no *what to do*.
- Garmin: shows training status, no "what to do at 7am tomorrow."
- TrainingPeaks: requires a human coach.

Every dashboard decision serves: **"Should I train today, and how hard?"** Everything below the fold earns its spot by contributing to or refining that answer. This is also Apple Fitness / WHOOP's above-the-fold discipline (`ui-reduce-scroll-patterns.md` §9).

---

## 2. Dashboard rework — before/after

### Today (current state)

Four vertical folds: Hero → KPI strip → PMC+Activities → 4 collapsible sections (Biometrics, Intensity+Efficiency, Heatmap, TrainingCalendar). Users still scroll 3+ screens to see the week. Everything lives on one page.

### Proposed (Path B)

Shell stays roughly the same (masthead + chat drawer) but gains:

1. **Left icon rail (56px)** — 5 destinations: Today, Calendar, Activities, Coach, Settings. Replaces any pressure to add nav elsewhere.
2. **Dashboard = segmented control** at page top: `Today / Week / Trends / Plan`. Same URL, 4 filtered compositions.
3. **Sticky 56px summary strip** appears when user scrolls past the hero: `[Readiness 82] [Today: Z2 endurance, 1h30] [Streak 12d]`.
4. **Bento grid** replaces vertical stack for tier-2 cards.
5. **Side sheets** (540–640px right drawer) for all detail drill-ins. No new routes except complex edit flows.
6. **Cmd+K command palette** for power users.

### Segmented compositions

| Tab | Contents |
|---|---|
| **Today** (default) | `ReadinessHero` + `PrescribedWorkoutCard` + mini `WeekStrip` + `CoachBrief` nudge + `DailyInsight`. Fits in ~900px. |
| **Week** | Full `WeekStrip` + `ComplianceStrip` + `PolarizedDistribution` + `WeeklySportMetrics` + `LastWeekRecap`. Bento. |
| **Trends** | `PMCChart` (full) + `IntensityDistribution` + `EfficiencyTrend` + `CalendarHeatmap` + FTP history. Bento. |
| **Plan** | `TrainingCalendar` (the existing one, becomes the main content of its tab). |

Result: 30 components, zero removed, but each view shows ~8–12 at a time. No view requires scrolling to answer its core question.

---

## 3. Component-level action map

| Component | Action | Why |
|---|---|---|
| `ReadinessHero` | Keep. Add count-up spring (`spring-gentle`, 1.2s). Add interpretation line ("Primed / Hold back / Recover"). Add 1-tap "why?" → side sheet with contributors. | Owns the hero slot; needs a *verb* (Apple watch-complication pattern) + transparency (Theme B). |
| `PrescribedWorkoutCard` | Keep in Today tab. Add `Swap`, `Skip`, `Modify` inline actions. Show *one-line why* above the workout. | Autonomy support (SDT §1 retention) + the "so what" layer (Theme F). |
| `WeekStrip` | Keep. Show mini version in Today (7 dots), full version in Week tab (7 activity rings with day letters). | Watch complication hierarchy (`apple-2027` §4). |
| `KpiStripCompact` | **Demote.** Move below the fold on Today; don't show on other tabs. Each KPI opens its detail in a side sheet. | Not hero-worthy. Contributes to density without answering the core question. |
| `PMCChart` | Move to Trends tab as primary tile. Remove inline expand; full detail in side sheet. Apply Apple chart rules (no gridlines, gradient fill, draw-on animation). | Right home is Trends; Apple chart polish (`apple-2027` §3.3). |
| `RecentActivities` | Keep in Today tab (3 rows only) + full list in Activities page. **Row click → side sheet, not new route.** | Preserves dashboard context (`ui-reduce-scroll` §1, §6). |
| `IntensityDistribution`, `PolarizedDistribution` | Move to Week tab. Retire any inline accordion. Expand = side sheet. | Scroll-jump prevention (NN/G rule). |
| `EfficiencyTrend`, `CalendarHeatmap` | Move to Trends tab. Keep as-is visually except Apple chart polish. | Tab belonging. |
| `TrainingCalendar` | Becomes the Plan tab. Drag-and-drop (TrainingPeaks pattern users love). | Competitor research §TrainingPeaks. |
| `CoachBrief`, `CoachChat` | Keep. Chat opens as right-side panel with full-screen toggle. Apple Intelligence gradient on input when AI is composing. Reuse multi-turn context + undo from 06-04. | Chat is the differentiator (Theme F). |
| `StreakCard` | Reframe: track **planning/check-in consistency**, not workout completion. Add freezes. Never use guilt copy. | §3 retention — Duolingo anti-pattern. |
| `ComplianceStrip`, `LastWeekRecap`, `DailyInsight`, `ReadinessContributors`, `WeeklySportMetrics` | Keep — these are exactly the right unit of progressive disclosure. Place them in Week/Today bento per table §2. | Already good; just need the right home. |
| `BiometricsDetail` | Convert from full-page section to side sheet opened from `ReadinessHero` contributors tap. | Progressive disclosure level 2. |
| `TransparencyDrawer`, `WhyAmITired` | Fold into the new "why this?" side sheets — unify the transparency surface. | Theme B: one contributors UX, not several. |
| `WorkoutPreview`, `WorkoutPreviewModal`, `IntervalRibbon` | Keep. Called from Plan tab row click → side sheet. | Already the right pattern. |
| `PostRideReview` | Promote. Auto-appears after new activity syncs. Add one-line reflection prompt ("Easier / as expected / harder — why?"). Used as fuel for adaptive planning. | Retention §Post-Ride Reflection ritual. |

### New components needed

1. **`SegmentedTabs`** — Today/Week/Trends/Plan switcher at dashboard top (pill, glass material, spring-snappy transition).
2. **`StickyReadinessBar`** — 56px sticky that appears on scroll past hero.
3. **`BentoGrid`** — 12-col asymmetric grid wrapper with standard cell sizes (1×1, 2×1, 2×2).
4. **`SideSheet`** — right-drawer primitive (540–640px desktop, full-screen mobile). One component replaces all per-component modals.
5. **`CommandPalette`** — Cmd+K using `cmdk` lib. Actions: navigate to week, jump to activity, change today's plan, ask coach.
6. **`IconRail`** — 56px left sidebar with 5 destinations.
7. **`DynamicPill`** — Dynamic-Island-style docked pill for ambient status (syncing, AI thinking).
8. **`ContributorsSheet`** — unified "why this?" drawer (readiness contributors, prescription rationale, etc).

---

## 4. Design tokens to add (Tailwind config)

From `apple-2027-design-language.md`, regardless of Path B:

- **Radii:** xs 6, sm 10, md 14, lg 20, xl 28, 2xl 36, pill 9999.
- **Shadows:** shadow-1..4 + glass-rim (see research doc §1.5).
- **Backdrop blur:** 10/20/30/40/50 → ultra-thin → ultra-thick materials.
- **Motion tokens:** spring-smooth/snappy/interactive/gentle/bouncy (response+damping pairs → Framer Motion stiffness+damping).
- **Duration ladder:** 120 / 250 / 400 / 750 / 1000ms.
- **Easing:** apple-default, apple-decel, apple-accel.
- **Apple Intelligence gradient:** for coach chat + AI surfaces. Preserve the amber/forest palette for content; iridescent only for AI-acting surfaces.

On Path B, the semantic color tokens stay editorial (amber/forest/paper). On Path A, swap for Apple system palette.

---

## 5. Prioritized execution plan

### P0 — Quick wins (≤1 week, high-ROI)

1. **Design-tokens pass.** Add radii, shadows, blur, motion, Apple Intelligence gradient to Tailwind config. *Foundational; everything else depends on it.* (~1 day)
2. **Sticky `StickyReadinessBar`** on scroll past hero. (~0.5 day)
3. **Side-sheet primitive.** One `SideSheet` component; wire `RecentActivities` row click + `BiometricsDetail` to use it. (~1 day)
4. **Kill inline-expand on PMC/Intensity/Polarized charts.** Replace with "Expand" icon → side sheet. (~0.5 day)
5. **Above-the-fold audit.** Ensure top 600px on Today = ReadinessHero + PrescribedWorkoutCard + mini WeekStrip. Demote KPI strip. (~0.5 day)
6. **`PrescribedWorkoutCard` — inline Swap/Skip/Modify + one-line why.** (~1 day — needs backend wiring for swap/skip)
7. **Spring motion on count-ups + card opens.** Ship Framer Motion spring tokens. (~0.5 day)

### P1 — Structural (1–3 weeks)

8. **`SegmentedTabs` + Today/Week/Trends/Plan views.** (~3 days)
9. **`BentoGrid` primitive + Week/Trends compositions.** (~3 days)
10. **`IconRail` left sidebar + 5 destinations.** Route separation for Calendar, Activities pages. (~2 days)
11. **`CommandPalette` (Cmd+K).** (~2 days)
12. **Unified `ContributorsSheet`** replacing `TransparencyDrawer` + `WhyAmITired`. (~1 day)
13. **Chart polish pass** — apply Apple rules to all charts (no gridlines, gradient fill, draw-on animation). (~2 days)
14. **Explicit sync status** — top-right pill with last-synced timestamps per provider (Theme E). (~1 day)

### P2 — Polish / delight (1–2 weeks)

15. **View Transitions API** on card → sheet drill-ins. (~2 days)
16. **`DynamicPill`** for ambient status. (~2 days)
17. **`PostRideReview` auto-trigger + reflection prompt.** (~2 days)
18. **Density toggle in Settings.** (~0.5 day)
19. **Apple Intelligence gradient on `CoachChat` input when composing.** (~0.5 day)
20. **Weekly recap email / in-app card** ("Strava Year-in-Sport"-style ritual). (~3 days)

### P3 — Phase 9 (Social + Psychology-driven retention) — separate plan

See §6 below — this deserves its own phase plan, not wedged in here.

---

## 6. Phase 9 specifics (friends + retention, informed by psychology research)

Hard rules, from `retention-psychology.md`:

**Must ship:**
- **Packs (4–12 users)** as the social unit — not a global feed.
- **Kudos-style low-cost affirmation** (Strava primitive, proven in Stragier 2022).
- **Rival system:** user-chosen 1–3 rivals, side-by-side weekly volume/PR. Peloton Here & Now pattern.
- **Pack-visible public goals** as a commitment device (self-chosen stakes).
- **Sunday planning ritual** — last week recap + next week preview + one intention, optionally pack-visible.
- **Morning check-in < 60 seconds** = the real retention driver. Own this moment.
- **Post-ride reflection prompt** — one sentence. Feeds adaptive planning.
- **Identity framing** in milestones ("you just completed your 100th base-building ride — that's what patient athletes do").
- **Cohort-filtered comparisons only** (age, FTP/kg band, training hours/week).

**Must refuse (hard ban list):**
- Global leaderboards 1–N.
- Streak ransom notifications.
- Variable-ratio slot-machine rewards (random badges, mystery chests, confetti).
- FOMO notifications ("3 friends worked out today…").
- Guilt copy ("You haven't logged a ride in 4 days").
- Fake social proof.
- Non-consensual auto-share of rides.
- Identity flattery on empty ("pro" badges on new users).
- Algorithmic feed.

**Streaks:** if we do them, track *planning/check-in consistency*, not workout completion. With freezes, auto-pauses, and zero guilt.

**Data-integrity as foundation:** power-meter/HR validation, outlier flagging, no leaderboard submissions without required sensor fidelity. Serious athletes bail the moment data trust breaks (Theme B).

---

## 7. Mistakes we must not repeat (from competitor research)

Direct carry-over checklist (do not ignore any):

- Long homogeneous scrolling list of metric tiles → one hero insight at top.
- More than 3 top-level nav destinations on mobile → icon rail + 5 max, rest via palette.
- Composite score without contributors view → every score has one.
- Score that persists when it contradicts user-reported state → let users flag + retrain.
- Free feature retroactively paywalled → never.
- Charge for data export → never.
- Algorithmic feed → chronological, pack-scoped, opt-in.
- Desktop-only core features → mobile-first.
- Redesign that loses color semantics → preserve green/amber/red consistently.
- Cycling as "generic workout" → power, NP, IF, VI, cadence, indoor/outdoor as first-class.
- Silent sync failure → explicit sync status pill with per-provider timestamp.
- Notifications without user-controlled quiet hours → 1/day default at user-chosen time.
- Jargon in onboarding (CTL/ATL/TSB/HRV) → plain-English layer.
- Hide beta feedback → show what changed based on user input.
- AI-generated content polluting social surfaces → never.

---

## 8. Recommended phase structure

**Insert a new decimal phase between current active work and Phase 9:**

- **Phase 6.5 — UI Overhaul (Apple-disciplined editorial redesign)** — P0 + P1 + P2 from §5 above. ~3–4 weeks estimated. Split into 3 plans: tokens+primitives / segmented-dashboard+bento / polish+command-palette.
- **Phase 9 — Social + Psychology-driven retention** — existing phase, updated with §6 rules.

Leave Phases 7 (Periodization) and 8 (Nutrition) untouched — they're substrate for retention to work, and they don't block a UI-skin rework.

---

## 9. What I need from you to proceed

1. **Design-direction choice:** A, B, or C from §0. (I recommend B.)
2. **Scope confirmation:** P0+P1+P2 as one Phase 6.5, or split P0 as a quicker 6.5 and P1+P2 as 6.6?
3. **Any of §3's component moves you disagree with?** Easier to argue now than to rewrite code.
4. **Phase 9 green-light on hard-ban list in §6** — some teams want "streaks but opt-in", etc. Worth stating your own conviction.

Once you answer these, I'll run `/gsd:insert-phase` to create Phase 6.5 with a proper PLAN.md, and we'll be ready to execute.
