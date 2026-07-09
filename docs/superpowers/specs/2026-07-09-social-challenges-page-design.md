# Social — Team Efforts, Challenges & Fair Comparison — Design

**Date:** 2026-07-09
**Status:** Design proposed, pending implementation
**Author:** product research + design pass
**Goal:** Give the app a dedicated **Social** surface — a fourth top-level tab — where an
athlete competes in challenges, races their crew, compares fairly against peers, and
duels head-to-head. It must be **demoable today on single-user data** (via a "compete
against your past self" mode + the existing crew scaffold), and it must never nudge an
athlete past the adaptive/HRV safety limits the coach already enforces.

---

## 0. Design principles (the spine of every decision below)

1. **Fair before fun.** Raw watts/TSS/distance punish lighter, slower, or newer athletes.
   Every comparison leads with a *relative* metric (%FTP, W/kg, % of your own ring,
   improvement rate, consistency) so a beginner can plausibly win. This is the single
   biggest lesson from both Apple Fitness (points = % of *your* rings, not absolute
   calories — a person with modest goals can beat a fitter one; *macworld.com/article/673405*)
   and from cyclists' complaints about Strava (KOM rewards only absolute top-end speed;
   comparing to pros "is not energizing — it is embarrassing"; *smartico.ai/blog-post/gamification-in-fitness*).

2. **Credibility is the whole game.** An unverified leaderboard is worse than none.
   Strava's loudest grievance is cheating — it removed **2.3M e-bike rides + 1.6M
   vehicle-logged activities** and restored ~293k athletes to rightful top-10 spots in one
   2024 ML pass (*bikerumor.com/strava-uses-new-machine-learning-models-to-catch-cheaters*).
   We sidestep this: scores come from the same trusted pipeline that computes TSS/CTL, and
   we compare within opt-in crews (no open global boards to game).

3. **Consistency is a first-class win condition.** Not everyone can be fastest, but anyone
   can show up. Strava's Local Legends (most efforts over a rolling 90 days, *regardless of
   pace*; *support.strava.com/hc/en-us/articles/360043099552*) and Peloton's "Club Peloton"
   (points for *presence and commitment, explicitly not output or rank*;
   *onepeloton.com/blog/what-is-club-peloton*) prove a consistency podium keeps slower
   athletes engaged. We already have a `StreakStrip` — Social makes it competitive.

4. **The coach outranks the competition. Always.** This app's differentiator vs. Strava is
   that it is a *coach*. The adaptive engine (HRV ±0.5 SD band, escalate-on-adaptation,
   ACWR soft guardrail — see `AdaptiveDirectiveCard`, commit 5fb9eb7) can tell an athlete
   to rest. When it does, Social must **suppress every "catch the leader" nudge, freeze the
   streak for free, and reframe rest as the winning move.** Peer-reviewed work is explicit
   that unbalanced competition drives "anxiety, burnout, or pushing users beyond safe
   physical limits" (*ncbi.nlm.nih.gov/pmc/articles/PMC10453885*). We refuse to be that app.

5. **No dark patterns.** No confirmshaming ("You made your crew sad"), no manufactured
   urgency, no infinite comparison, no guilt notifications. Harry Brignull's taxonomy is now
   legally enforceable under the EU DSA and US FTC (*en.wikipedia.org/wiki/Dark_pattern*).
   We use loss aversion honestly (real streaks, forgiving repairs) and never weaponize it.

---

## 1. Page purpose & MECE section structure

New tab **`social`** (route `?tab=social`), rendered by `SocialTab`, following the exact
`PillarSection` pattern used by `TodayTab` (numbered chip · serif title · italic guiding
question, staggered spring reveal keyed off `index`).

Four MECE pillars — each answers exactly one question, no overlap:

| # | Eyebrow / Title | Italic guiding question | Resolves |
|---|-----------------|-------------------------|----------|
| **1** | **This Week's Challenge** | *"What's the game this week — and am I winning it?"* | The active weekly challenge: type, my points, my rank, time left, the one action that moves me up. |
| **2** | **The Crew** | *"How does my squad stack up — and am I pulling my weight?"* | Team standings (Squad Cup), my contribution to the team total, invite/manage. |
| **3** | **Where I Stand** | *"Fairly — not just fastest — how do I compare?"* | The fair-comparison board: %FTP / W/kg band, improvement rate, consistency vs. cohort (or vs. past self in solo mode). |
| **4** | **Duels & Honors** | *"Who did I beat, and what have I earned?"* | Head-to-head duels (same-ride VS, past-self VS) + badges/awards case. |

German copy (the app is bilingual — see `useLocale`): ① *Diese Woche* — "Was ist das Spiel
diese Woche — und gewinne ich es?"  ② *Die Crew* — "Wie schlägt sich mein Team — und trage
ich meinen Teil bei?"  ③ *Wo ich stehe* — "Fair — nicht nur am schnellsten — wie schneide
ich ab?"  ④ *Duelle & Auszeichnungen* — "Wen habe ich geschlagen, und was habe ich verdient?"

A **coach-safety banner** sits *above pillar 1* whenever the adaptive engine prescribes
recovery (see §5). It is not a pillar; it is a guardrail that changes the whole page's tone.

---

## 2. The comparison model (fairness math)

The core rule: **never rank on a raw absolute.** Each comparable dimension has a
relative formula. All are computable from data the app already holds (`AthleteProfile`:
`ftp_watts`, `weight_kg`, `date_of_birth`; `usePowerProfile`: `wkg_curve`, `peaks_wkg`;
`Activity.tss`; PMC/CTL).

### 2.1 Daily "Ring" score (the Apple mechanic, coach-safe)
The atom of every challenge. Each day an athlete earns:

```
ring_pct(day)   = clamp(0, DAILY_CAP, daily_TSS / adaptive_daily_target)
ring_points(day)= round(ring_pct × 100)          # 0..150
```

- `adaptive_daily_target` is **not** a flat number. It is the coach's *prescribed* load for
  that day (from the adaptive engine / planned workout), falling back to
  `max(30, round(weekly_hours_available × 70 / 7))` then to 70 — the exact ladder already in
  `crew_score._daily_target_tss`. This is the crucial fairness twist over Apple: your ring
  target is **your** coach-set target, so a 4 h/week athlete and a 15 h/week athlete both
  "close their ring" at 100% by doing *their own* prescribed day.
- `DAILY_CAP = 1.5` (150 pts): one monster day can't carry the week (already in code). This
  also **quietly discourages overreaching** — there is zero competitive reward for going past
  150% of your prescribed load.
- On a coach-mandated **rest day, the ring target is the rest itself**: resting closes the
  ring (100 pts). Training through a red day *loses* you the recovery ring. Competition and
  coaching point the same direction — this is the ethical keystone.

### 2.2 Effort quality — %FTP / W/kg bands (cross-athlete fairness)
For "who's fitter" comparisons, never show raw watts. Show:

```
wkg_ftp        = ftp_watts / weight_kg
band           = Coggan/Allen power-profile bucket
                 (Untrained→Fair→Moderate→Good→Very Good→Excellent→Exceptional→World Class),
                 gender- and duration-aware (5s / 1min / 5min / FTP)
```

Reference bands to encode (men FTP W/kg; use the app's existing gender-aware profiling from
`usePowerProfile.phenotype`): untrained <2.0, recreational ~3.3–3.7, strong amateur 3.8–4.4,
pro >6.0 (women scale ~-0.5 to -1.0; *trainingpeaks.com/blog/power-profiling*,
*zwiftinsider.com/rider-categorization-based-on-ftp*). Display the **band label**, not the
number-vs-number, so a Cat-D rider is celebrated as "Good, climbing toward Very Good" rather
than shamed against a Cat-A. This mirrors Zwift's A/B/C/D matchmaking and running's
age-grading (Age-Graded % = standard_time / your_time × 100; *marathonhandbook.com/age-grade-calculator*),
both of which exist precisely so different bodies compete fairly.

### 2.3 Improvement rate (the comeback metric — beginners' home turf)
The dimension where a newcomer beats a plateaued veteran:

```
improvement_rate = (CTL_now - CTL_28d_ago) / CTL_28d_ago          # % fitness gain / 4wk
ftp_delta_pct    = (ftp_now - ftp_90d_ago) / ftp_90d_ago          # % threshold gain / 90d
```

A rider at 2.5 W/kg gaining 8%/month outranks a stagnant 4.5 W/kg rider on the
*Rising* board. "Adaptive systems that compare users against personal bests rather than
global averages maintain healthy motivation" (*smartico.ai*). This is our answer to the
"comparing to pros is demotivating" complaint.

### 2.4 Consistency (the show-up podium)
```
adherence_pct  = planned_days_completed / planned_days               # 7d and 28d
current_streak = consecutive days meeting ring target (rest counts)  # from StreakStrip
frequency      = sessions in rolling 28d                             # Local-Legend style
```
Rest days that the coach prescribed **count as met** — you cannot lose a streak by
following your coach. Streak *freezes* (see §4) protect illness/travel.

### 2.5 The fairness selector
Pillar 3 exposes a segmented control: **Effort · Rising · Consistent**. Same crew, three
ranked lenses. Nobody is bottom of all three — the design guarantees multiple podiums so
"everyone wins somewhere," the explicit non-toxicity goal.

---

## 3. The challenge model

A **Challenge** is a scored competition over a window, across a set of participants
(crew, or solo-vs-past-self). Types:

| Type | Scoring | Window | Fairness lens |
|------|---------|--------|---------------|
| **Ring Week** (default) | Σ `ring_points` (§2.1), cap 150/day → max ~1050 | 7d, resets Mon 00:00 local | Relative to *your* coach target — already shipped as Squad Cup |
| **Consistency Streak** | Longest / current streak of ring-closed days | rolling 28d | Pure show-up; rest counts |
| **Climb Rush** | Σ elevation gain, but ranked as **% of your own 28d-avg climbing** | 7d | Relative to self → flatland riders included |
| **Volume Build** | Σ TSS as **% of prescribed weekly load** | 7d | Relative to coach target |
| **Rising** | improvement_rate (§2.3) leaderboard | 28d | Beginners' board |

Design rules distilled from research:
- **Points = percent of *your* target**, never absolute output — the Apple insight applied
  everywhere (*androidpolice.com/how-to-use-apple-watch-competitions*).
- **Daily reset + daily cap** so a bad day isn't fatal and every morning is a fresh, bounded
  sprint — Apple's stickiness mechanic (*xda-developers.com/apple-watch-competitions*).
- **Endowed progress:** never render an empty 0% bar on Monday. Seed the week's progress bar
  with last week's carry-over context and a stated reason ("You start ahead — your 3-week
  consistency puts you at tier 2"). Nunes & Drèze: a pre-filled card lifted completion
  **19% → 34%**, but only *with a stated reason* (*coglode.com/nuggets/endowed-progress-effect*).
- **Teams beat 1v1 for non-toxicity.** Cumulative crew total means a slow rider still
  contributes meaningfully ("team challenges foster community without toxic rivalries";
  *games.themindstudios.com/post/sport-gamification*). 1v1 duels are opt-in flavor (Pillar 4),
  not the backbone.

### How teams work
Reuse the shipped crew system verbatim (`crews`, `crew_memberships`, `crew_invites`; up to 8
riders; invite-by-email token; **only training outputs shared — never body data**, already
enforced in `CrewTab` copy). The team's Squad Cup score is Σ members' Ring-Week scores; the
**crew total** and **your % contribution** are the headline of Pillar 2.

---

## 4. Dopamine mechanics — and the dark patterns we refuse

Each mechanic is tied to the ethical constraint. Format: **Mechanic → why it works → the line
we will not cross.**

| Mechanic (include) | Behavioral basis | Ethical guardrail (do NOT cross) |
|--------------------|------------------|----------------------------------|
| **Count-up hero score** (`useCountUp`) | Variable-reward payoff; the Strava-recap signature | Only on genuine change; never fake-inflate |
| **Confetti on rank-up / ring-close / badge** (`Confetti`) | Peak-end celebration | Fires on *real* milestones only; respects reduced-motion (already no-ops) |
| **Streak with freeze/repair** | Loss aversion (losses loom ~2× gains; Kahneman/Tversky) + don't-break-the-chain | **Auto-freeze on coach rest days & illness.** No "you'll lose your 40-day streak!" guilt push. Duolingo's streak-anxiety backlash is the anti-pattern (*screenwiseapp.com/guides/duolingo-streaks-and-anxiety-in-kids*) |
| **Endowed-progress week bar** | Head-start motivation (Nunes & Drèze) | Always with a stated, truthful reason; never an arbitrary fake head start |
| **"One session closes the gap" nudge** | Fogg B=MAP — reduce friction, make the next action tiny & clear (already in CrewTab) | **Nudge is gated on adaptive readiness.** If HRV/ACWR says rest, the nudge is replaced by "Rest is today's win — your ring closes by recovering" |
| **Badges / honors case** | Collectible progress markers (Apple medals, Peloton tiers) | Earned by consistency & improvement, *not* only by beating others — multiple paths so nobody is shut out |
| **Multiple podiums (Effort/Rising/Consistent)** | Competence + hope; segment the field | Guarantees everyone leads somewhere; no single brutal ranking |
| **Positive micro-signals (kudos / "chapeau")** | Social validation (Strava: 14B+ kudos/yr) | Positive-only; no downvotes, no public shaming |

**Explicitly avoided dark patterns:** confirmshaming, manufactured/false urgency, infinite
global leaderboards, guilt notifications, pay-to-see-your-own-rank (Strava's documented
trust-eroder — *road.cc/content/news/strava-year-sport-now-only-subscribers*), and any nudge
that competes with the coach's recovery call.

### The coach-safety interlock (the most important spec in this doc)
A single hook, `useAdaptiveGate()` (wraps `useAdaptive`), returns `{ mode: 'go' | 'ease' |
'rest', reason }`. Every competitive nudge, count-up-to-catch-leader, and streak-pressure
string is wrapped:

```
if (gate.mode === 'rest') → suppress "catch the leader"; show recovery reframe; freeze streak
if (gate.mode === 'ease') → soften ("hold position — a light spin keeps your ring"); no push to overreach
if (gate.mode === 'go')   → full competitive copy
```

This is the app's ethical signature: **competition can never outrank the athlete's
physiology.**

---

## 5. Data model — what's real vs. what's needed

### Already shipped (reuse as-is)
- Tables: `crews`, `crew_memberships`, `crew_invites` (`backend/app/models/crew.py`).
- Service: `crew_score.py` — Ring-Week math, local-tz day boundaries, daily target ladder.
- API: `GET /crews/me`, `POST /crews`, `DELETE /crews/{id}`, `DELETE /crews/me/membership`,
  invite/accept/revoke, `GET /crews/me/standings` → `StandingsResponse`
  (`{ crew_id, week_start, week_end, daily_target_tss, standings: [{user_id, handle, is_you,
  weekly_score, weekly_tss, daily_pct[7]}] }`).
- Hooks: `useMyCrew`, `useCrewStandings`, `useCreateCrew`, invite/leave/disband; `useCrew`
  back-compat shim.
- Fitness inputs for fairness: `usePowerProfile` (`wkg_curve`, `peaks_wkg`, `phenotype`,
  gender-aware bands), `AthleteProfile` (`ftp_watts`, `weight_kg`, `date_of_birth`), PMC/CTL
  via `usePMC`, adaptive state via `useAdaptive`.
- Same-ride duel: fully specified in `2026-07-06-ride-compare-duel-design.md`
  (`GET /activity-debrief/{id}/compare`) — Pillar 4 reuses it.

### Needed for the full vision (net-new)
1. **Challenge tables** (thin — most math is derived on read, like standings):
   - `challenges` — `id, crew_id (nullable → solo), type, starts_at, ends_at, created_by`.
   - `challenge_participants` — `challenge_id, user_id, joined_at`.
   *(MVP can skip these entirely — Ring Week is derivable from the current ISO week + crew,
   exactly as Squad Cup does today. Add the tables only when non-default challenge types or
   custom windows ship.)*
2. **Fair-comparison endpoint** `GET /crews/me/comparison?lens=effort|rising|consistent` →
   ranked rows of `{ user_id, handle, is_you, band?, wkg_ftp?, improvement_rate?,
   adherence_pct?, streak? }`. A new `crew_compare.py` service, structured like `crew_score`,
   reading each member's profile + power profile + CTL. **Privacy:** returns bands/relative %
   only — never body weight, never raw FTP of others (only relative W/kg band).
3. **Badges** `awards` table — `user_id, kind, earned_at, meta`. Kinds: `ring_week_win`,
   `streak_7/30/100`, `most_improved`, `perfect_week`, `comeback`. (Can start client-derived,
   persist later.)
4. **Adaptive gate** — no new table; `useAdaptiveGate` derives from existing `useAdaptive`.

### The pragmatic MVP data story (demoable TODAY, single user)
- **Solo "vs. past self" is the default when `crew == null`.** Pillar 1 races *this week's
  Ring score* against *last week's* (both computable from `useActivitiesRange` +
  `crew_score` math already in `CrewTab`). Pillar 3 compares your current band/CTL/streak
  against your 28-days-ago self. Pillar 4 offers a "You vs. Past You" duel on your best ride.
  Zero peers required — fully alive on one user's real data.
- **Crew standings** render live the moment a second athlete joins (already wired); pending
  invitees show `PENDING` with zero, truthfully (existing behavior).
- **No simulated fake rivals.** Credibility principle (§0.2): we never fabricate opponents.
  The solo-vs-past-self mode is genuinely motivating and honest ("beat last week's score" —
  the existing `solo_laps_copy` string already ships this idea).

---

## 6. Component list & routing integration

### Routing (three small edits)
- `DashboardPage.tsx`: add `'social'` to `TabId`; `resolveTab` returns `'social'` for
  `case 'social'` (and alias the legacy `'crew'` → `'social'`); add
  `case 'social': return <SocialTab />`; add `{ id: 'social', label: t('tab_social') }` to
  the `tabs` array (desktop `SegmentedTabs`).
- `MobileBottomNav.tsx`: add a fourth item `{ id: 'social', labelKey: 'tab_social', icon:
  <Users size={20}/> }` (lucide `Users` or `Trophy`); extend `TabId` + `resolveActive`.
  Note: four items still fit a phone bottom bar (each `flex-1`).
- i18n: add `tab_social` ("Social" / "Social") plus the challenge/comparison strings to
  `i18n/strings`.

### New components (`frontend/src/components/social/`, mirroring `components/report/` and
`components/dashboard/` conventions — small, single-purpose, CSS-var styled)

| Component | Role | Reuses |
|-----------|------|--------|
| `tabs/SocialTab.tsx` | Orchestrator: 4 `PillarSection`s + `CoachSafetyBanner`; solo/crew branch | `PillarSection`, `useAdaptiveGate` |
| `CoachSafetyBanner.tsx` | Rest/ease reframe strip above Pillar 1 (§4 interlock) | `useAdaptive` |
| `ChallengeHero.tsx` | Pillar 1: challenge name, count-up score, rank, countdown, endowed-progress week bar, gated "closes the gap" nudge | `useCountUp`, `Confetti`, `useCrewStandings`, `Countdown` (extract from CrewTab) |
| `WeekRings.tsx` | 7-day ring/bar strip (generalize CrewTab's `WeekBars`; add ring visual) | — |
| `CrewStandings.tsx` | Pillar 2: team total, your % contribution, `StandingRow`s | extract/lift `StandingRow`, `RankBadge` from CrewTab |
| `CrewInviteCard.tsx` | invite-by-email + share link (lift from CrewTab) | `useInviteToCrew` |
| `FairnessBoard.tsx` | Pillar 3: Effort/Rising/Consistent segmented board | `SegmentedTabs`, `usePowerProfile`, new `useCrewComparison` |
| `BandChip.tsx` | Coggan band label chip ("Good · climbing to Very Good") | — |
| `DuelStrip.tsx` | Pillar 4: same-ride VS (ride-compare spec) + You-vs-Past-You | `useRideCompare` |
| `HonorsCase.tsx` | Pillar 4: badge/award grid | `AchievementBadges` pattern |
| `SoloVsPastSelf.tsx` | Solo-mode replacement for standings when `crew == null` | `useActivitiesRange` |

New hooks: `useAdaptiveGate.ts`, `useCrewComparison.ts` (+ `api/socialCompare.ts`).
Existing `CrewTab.tsx` becomes a thin re-export of `SocialTab` (or is deleted once
`?tab=crew` aliases `social`).

### Visual treatment (matches the editorial "executive brief" aesthetic)
- Cards: `--color-paper-2` on `--color-paper`, `20–22px` radius, `1px --color-rule` borders,
  `paper-grain` texture — as CrewTab already does.
- Accents: **forest** (`--color-forest-2`) for "you"/positive, **amber** (`#FFD60A`) for the
  leader/trophy glow (`box-shadow: 0 0 16px rgba(255,214,10,.08) inset`), **bad** red never
  used for rank (no shaming color).
- Serif italic (`Fraunces` / `var(--font-serif)`) for guiding questions and the challenge
  headline; `num-display` / `num-mono` for scores — consistent with CrewTab & PillarSection.
- Motion: `PillarSection` staggered spring reveal; `useCountUp` (1100ms ease-out cubic) on
  hero numbers only; `Confetti` on rank-up / ring-close / badge; all gated by
  `useReducedMotion`. `WeekRings` bars animate height with the existing
  `cubic-bezier(.22,1,.36,1)` 500ms.

---

## 7. Phased MVP plan

**Phase 0 — Ship the tab (demoable today, single user, no backend work).**
1. Add `social` routing (DashboardPage + MobileBottomNav + i18n).
2. Build `SocialTab` with all four `PillarSection`s.
3. Pillar 1 `ChallengeHero` in **solo vs. past-self** mode (this-week vs. last-week Ring
   score) — pure client math already living in CrewTab; add endowed-progress bar + count-up +
   confetti on beating last week.
4. Pillar 2 = lift the existing Squad Cup `CrewStandings` + invite card (already server-backed
   via `useCrewStandings`), with solo fallback `SoloVsPastSelf`.
5. Pillar 3 `FairnessBoard` in **solo** mode: your band (from `usePowerProfile.phenotype` /
   `wkg_curve`) + improvement rate (CTL delta) + consistency streak — all vs. your past self.
6. Pillar 4: `HonorsCase` from client-derived badges + `DuelStrip` reusing the shipped
   ride-compare endpoint when a crew-mate rode the same ride; else "You vs. Past You."
7. Wire `useAdaptiveGate` + `CoachSafetyBanner` from day one — the safety interlock is not a
   later polish; it ships in Phase 0.

*Result: a complete, honest, striking Social page running on one athlete's real data.*

**Phase 1 — Crew comparison backend.** `crew_compare.py` + `GET /crews/me/comparison`;
`FairnessBoard` gains real cross-member Effort/Rising/Consistent boards.

**Phase 2 — Challenge types & persistence.** `challenges` / `challenge_participants` tables;
Climb Rush / Volume Build / Rising as selectable challenges with custom windows; `awards`
table for durable badges + notifications (respecting the no-guilt rule).

**Phase 3 — Head-to-head duels & seasons.** Opt-in 1v1 Ring duels, monthly "seasons" with a
tiered honors case (Bronze→Legend, Peloton-style, presence-weighted), positive micro-signals
(kudos/"chapeau").

---

## 8. Verification checklist
- [ ] Fairness: a low-W/kg, high-improvement synthetic athlete ranks #1 on the *Rising* board.
- [ ] Safety: with adaptive `mode === 'rest'`, all "catch the leader" copy is suppressed and
      the streak does not break.
- [ ] Solo mode: with `crew == null`, all four pillars render meaningfully on one user's data.
- [ ] No dark patterns: no guilt string, no fake urgency, no rank behind a paywall, reduced-
      motion fully honored.
- [ ] Privacy: comparison endpoint never leaks another member's weight or raw FTP (bands only).
- [ ] Visual: renders cleanly desktop + mobile in the dark editorial theme (screenshot both).

---

### Sources (inline above; key references)
Apple Fitness Competitions mechanics: macworld.com/article/673405, xda-developers.com/apple-watch-competitions,
androidpolice.com/how-to-use-apple-watch-competitions, support.apple.com/guide/watch/share-your-activity.
Strava: support.strava.com/hc/en-us/articles/360043099552 (Local Legends),
bikerumor.com/strava-uses-new-machine-learning-models-to-catch-cheaters, road.cc/content/news/strava-year-sport-now-only-subscribers,
ncbi.nlm.nih.gov/pmc/articles/PMC10453885 (competition harms), cyclist.co.uk/news/strava-could-create-obsessive-tendencies.
Fair comparison: trainingpeaks.com/blog/power-profiling (Coggan bands), zwiftinsider.com/rider-categorization-based-on-ftp (A/B/C/D),
marathonhandbook.com/age-grade-calculator (age-grading), onepeloton.com/blog/what-is-club-peloton (presence-based),
smartico.ai/blog-post/gamification-in-fitness, games.themindstudios.com/post/sport-gamification.
Dopamine/ethics: behaviormodel.org (Fogg B=MAP), nirandfar.com/how-to-manufacture-desire (Hooked variable reward),
coglode.com/nuggets/endowed-progress-effect (Nunes & Drèze), en.wikipedia.org/wiki/Loss_aversion,
screenwiseapp.com/guides/duolingo-streaks-and-anxiety-in-kids (streak anxiety), en.wikipedia.org/wiki/Dark_pattern (Brignull).
