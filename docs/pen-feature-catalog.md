# pencil-new.pen — Feature Catalog & Build Tracker

Full 1:1 rebuild of `pencil-new.pen` (9 screens) on real Garmin/backend data.
Status: ☐ todo · ◐ partial · ☑ done. DoD = Definition of Done per module.

## ✅ STRICT 1:1 REBUILD (screenshot-driven, card-by-card against the .pen trees)
Every screen rebuilt directly from its .pen Content-frame node tree (fetched via pencil
`batch_get`), card list matched top-to-bottom, order + labels + colors 1:1. No invented
cards; my earlier extras removed. Data-honesty rule where the .pen shows a card Garmin
can't fill: render the card STRUCTURE with a graceful "—"/"not recorded" note, never fake.
- Today (OwSbv) — 8 cards. Train (jX7qE) — 7 cards. Recovery (UxTuN) — 16 cards (7 partly
  "—": sleep-need/quality/stages, vitals trends SpO₂/skin-temp/resp, behaviors — no Garmin feed).
- Load&Form (BIXRn) — 11 cards. History (dd8j8) — 7 cards. Social (UW6SW) — 8 cards
  (Segments = honest empty; no GPS-segment data).
- Ride (eOR1S) — 11 cards (route = GPS placeholder; cadence/weather dropped = no data).
- Run (S8hDu) — 10 cards (runs have zero streams → splits/HR-zones/dynamics/fuel/weather/shoe
  all honest "not recorded"; VO₂ race-predictor is real via Riegel).
- Workout Detail (PloPg) — 8 cards (interval-profile bars + %FTP fixed: target_pct_ftp is a
  fraction, ×100 for display + chart scale).
Tokens: .pen hex → CSS vars (paper/paper-2/surface-2/3/rule/ink/ink-2/muted/accent/recovery/
strain/stand/amber/move/exercise). Fonts Sora(num-display)/Inter. All screenshot-verified at 5180.

## ✅ COMPLETION (all 9 screens built 1:1, real data, type-clean, screenshot-verified)
1. **Today** ☑ — greeting, race chip, recovery ring + 3-color sub-scores, coral workout, load (CTL/ATL/TSB), activity rings (move/exercise/steps), metrics, streak.
2. **Train** ☑ — sport toggle, plan block, week strip, coral WOD, upcoming, power zones.
3. **Recovery** ☑ — hero ring, drivers, metrics, 7-day bars, sleep+battery, stress, baseline trends, month calendar, recommendation. (SpO₂/skin-temp/respiratory/behaviors omitted — no Garmin data.)
4. **Load & Form** ☑ — /load-form drill-down: TSB gauge, weekly load, ACWR, intensity/sport split, fitness signals, monotony, trajectory, recommendation.
5. **History** ☑ — replaced old report: filters, summary, month calendar, weekly bars, PRs, recent list → analysis.
6. **Social** ☑ — replaced old: filter chips, 6-metric battle scorecard (you vs rival), leaderboard, challenges.
7. **Ride Analysis** ☑ — /activities/:id/ride: header, summary, route+elevation, power hero, zones, curve, HR, climbs, fuel, coach insights.
8. **Run Analysis** ☑ — /activities/:id/run: header, pace hero, splits, HR zones, VO₂/race predictor, coach; basic-summary fallback when no streams.
9. **Workout Detail** ☑ — /workout/today: hero, interval profile, structure, targets, fueling, devices, coral Start.

Nav ☑ 5-tab bottom bar (Today·Train·Recovery·History·Social). Old top segmented-tabs removed. New primitives: MetricCard, ScoreRing, ActivityRings.
App on localhost:5180. Every rebuilt file type-clean (remaining tsc errors are pre-existing tech debt in untouched files).

### Card-completeness + interactivity pass (verified via Playwright, 0 console errors)
- Today: added Strain-adjacent tappability — Recovery card → `?tab=recovery`, workout Details/Start → `/workout/today`, Load footer → `/load-form`.
- Recovery: added **Strain Target** gauge (0–21), **Sleep Quality** grid (score/consistency/RHR/HRV/battery), **Recovery Balance** (7-day trend read).
- Train: added **Cross-training** card (N of 2 strength sessions/week, Add → `/workout/today`).
- Social: rebuilt to full stacked page — jump chips, 6-metric Wochenduell scorecard, Crew leaderboard, kJ load leaders, Challenges (Last-Push 0/800 TSS, active-days), Crew feed, club card.
- Interactivity confirmed end-to-end: Today workout → Workout Detail; History activity rows → Ride/Run Analysis (`/activities/:id/ride|run`); Belastung&Form → `/load-form`.

---
### Original per-module tracker (reference)

**Global DoD:** WHOOP tokens (Sora/Inter, `--color-*`), 24px cards, exact `.pen`
colors per module, real data (no fabrication; omit only truly-unavailable
Garmin fields with a graceful state), type-clean, screenshot-verified.

**Nav (TabBar):** Today · Train · Recovery · History · Social (coral active).
Drill-downs: Ride Analysis, Run Analysis, Workout Detail. StatusBar = skipped
(device-mockup frame, not app UI).

---

## 1. Today  ◐  (OwSbv)
- ☑ Greeting header — DoD: greeting + date. ☐ avatar + weather chip (no weather API → omit weather, keep avatar optional)
- ☑ Race chip — goal event + days (goal_trajectory)
- ☑ Recovery card — ring + Readiness pill + 3-color sub-scores (Recovery green / Form blue / Sleep teal)
- ☑ Workout card — coral gradient, prescribed workout, interval ribbon, coral Start
- ☑ Load card — Fitness blue / Fatigue amber / Form green + CTL/ATL/TSB codes
- ☑ Activity rings — Move/Exercise/Steps (red/lime/teal)
- ☑ Metrics row — Resting HR (move) / HRV (green) / Body Battery (blue)
- ☑ Streak card — 7-day dots

## 2. Train  ☑  (jX7qE)
- ☑ Sport toggle · Plan card · Week strip · Workout-of-day (coral) · Upcoming · Power zones · (cross-train optional)

## 3. Recovery  ◐  (UxTuN)
- ☑ Recovery hero ring · ☑ Recovery drivers (icon rows) · ☑ Metric row · ☑ 7-day bars · ☑ Sleep + Body Battery · ☑ Stress monitor · ☑ Recommendation
- ☐ Baseline Trends (HRV/RHR 14-day mini charts) · ☐ Strain Target gauge (0–21) · ☐ Recovery Calendar (month grid)
- ✗ Sleep stages / SpO₂ / skin-temp / respiratory / behaviors — no Garmin data (omit)

## 4. Load & Form  ☑  (BIXRn)  → shown under History/Analyze
- ☑ Form hero (TSB gauge) · Weekly load · Injury/ACWR · Intensity split · Sport split · Fitness signals · Monotony/strain · Trajectory · Recommendation

## 5. History  ☐  (dd8j8)  ← currently shows OLD report; REPLACE
- ☐ Header + filter chips (All/Ride/Run/Strength)
- ☐ Summary card (period totals: distance, time, load, elevation, sessions)
- ☐ Calendar card (month grid, per-day activity dots)
- ☐ Heatmap card (contribution-style grid)
- ☐ Trend card (weekly volume bars)
- ☐ PR card (Fastest 5K, Longest Ride, Biggest Climb, Max 20-min Power)
- ☐ Recent list (activity rows → open Ride/Run Analysis)

## 6. Social  ☐  (UW6SW)  ← currently OLD Social; REPLACE
- ☐ Header + filter chips (Battles/Segments/Challenges/Feed)
- ☐ Battle hero (crew face-off, 6-metric weekly scorecard, W/kg-normalized)
- ☐ Leaderboard (crew ranking rows)
- ☐ Segments (segment leaderboards) — ✗ no segment data → adapt/omit
- ☐ Challenges (July Climbing, 10-day streak)
- ☐ Feed (crew activity) — ✗ limited crew data → adapt
- ☐ Club card

## 7. Ride Analysis  ☐  (eOR1S)  ← per-ride detail (replaces/augments debrief)
- ☐ Ride header (title, subtitle) · Summary strip (Distance/Moving/Elevation/TSS)
- ☐ Route card (map + elevation profile bars)
- ☐ Power hero (NP big + Avg/Max/IF/VI grid)
- ☐ Power zones (Z1–Z7 time) · Power curve (best avg power bars)
- ☐ Heart rate (avg/max + HR-zone bar + decoupling)
- ☐ Cadence · Climb speed (VAM) grids
- ☐ Fuel card (kJ/carbs) · Segments · Coach insights (coral)

## 8. Run Analysis  ☐  (S8hDu)  ← per-run detail
- ☐ Header + stats · Pace hero
- ☐ Splits (per-km rows, fastest/slowest highlighted)
- ☐ Heart rate (zones + bottom stats) · Run dynamics (cadence/GCT/vert-osc/ratio/stride) — ✗ Garmin run-dynamics may be absent → show available, omit rest
- ☐ VO₂ predictor (predicted race times) · Fueling · Environment · Shoe mileage · Coach insights (coral)

## 9. Workout Detail  ☐  (PloPg)  ← Today/Train workout → tap → detail
- ☐ Hero · Interval profile chart · Structure (warm-up/repeat block/cool-down steps)
- ☐ Targets card · Fueling card · Devices card · Start CTA

## Cross-cutting
- ☐ Remove old top chrome (EN/DE + sync + settings) → relocate to a minimal header/settings entry
- ☐ Wire nav: History→new, per-activity rows → Ride/Run Analysis, workout cards → Workout Detail
