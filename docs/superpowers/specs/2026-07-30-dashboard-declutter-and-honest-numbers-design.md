# Dashboard declutter & honest numbers — design

Date: 2026-07-30
Status: approved (user, 2026-07-30)

Nine changes across Today, Körper, Verlauf, Plan and the ride-analysis page.
They split into two groups that happen to have been asked for together:

- **Declutter (1–5):** remove a header block, promote the two things the athlete
  actually reads to the top, and stop Today carrying cards that belong on other
  chapters.
- **Honest numbers (6–8):** three surfaces render fabricated or mismatched
  values. Each has a located root cause, not a styling complaint.

Explicit non-goal: no visual redesign of anything not listed. The glass-card
language, the readiness aura and the ring stay exactly as they are.

---

## 1 · Remove ChapterBar from every page

`components/narrative/ChapterBar.tsx` renders a chapter block (four dots, phase,
week-in-block, event countdown, `KAPITEL n — TITLE`) at the top of four tabs.

**Delete** the component, its test, and all five mount sites:

| File | Line (at spec time) |
|---|---|
| `components/dashboard/tabs/TodayTab.tsx` | import 60, mount 1104 |
| `components/dashboard/tabs/PlanTab.tsx` | import 28, mounts 485 and 521 |
| `components/dashboard/tabs/HistoryTab.tsx` | import 40, mount 418 |
| `components/dashboard/tabs/RecoveryTab.tsx` | import 32, mount 552 |
| `components/narrative/__tests__/ChapterBar.test.tsx` | whole file |

**`CHAPTER_TITLES` must survive.** `components/narrative/NextChapter.tsx:11`
imports it from `ChapterBar`. Move the constant into
`utils/seasonArc.ts` (which already owns `CHAPTERS`, `chapterIndex`,
`phaseLabel`, `ChapterId`) and repoint `NextChapter`. `narrativeKit.test.tsx`
covers `NextChapter` and must still pass unchanged.

`hooks/useSeasonArc.ts` stays — PlanTab uses the arc for its own content. Each
tab's now-unused `arc` local must be removed only where nothing else reads it;
do not blanket-delete the hook call without checking each tab.

**Decision (user):** the season anchor is dropped entirely, not relocated.
Today's header already prints `Rennen in N Tagen`, and the Plan tab states phase
and block position in fuller form. No replacement UI is built.

`MobileBottomNav.tsx:30` asserts `CHAPTERS.length === TABS.length` and mentions
ChapterBar only in an error string — leave the assertion, fix the wording.

---

## 2 · Promote "Was dahinter steckt" and "Mein Coach" to the ring

### Current order on Today

ring → gate kicker → session kicker → session card → weather → **drivers** →
**CoachRead** → momentum.

The coach's read and the signal breakdown render roughly 1.7 screens below the
ring at 390 px.

### Target order

ring → **contributors trigger** → **CoachRead** → session → weather → drivers →
momentum.

`CoachRead` moves unchanged — it is already a shared component
(`components/narrative/CoachRead.tsx`) used by other chapters. This is a pure
JSX move within `TodayTab.tsx`.

### The contributors surface is a redesign, not a move

`components/dashboard/ContributorsSheet.tsx` (483 lines, title
`Was dahintersteckt`) is **orphaned** — nothing imports it. It was built as a
640 px `SideSheet`. Mounting it as-is violates the project rule that reviving an
orphaned component means redesigning it for where it now lives.

Build instead:

- **Trigger row** under the ring: the two strongest readiness contributors as
  compact chips (label + value + direction), plus a `Was dahinter steckt`
  affordance. Uses the existing chip styling from the drivers row so no new
  visual language is introduced.
- **Tap opens the full sheet**, ported from `SideSheet` (width 640) to the
  mobile bottom-sheet pattern already used elsewhere in the app. The sheet's
  *content* — the section tabs, the contributor list, the rationale, the tools
  section — is reused as-is; only its container and width change.
- Contributor selection reuses the values already computed in `TodayTab` for
  the drivers row (`hrvNow`, `restingHr`, `sleepScore`, `tsb`, `score`), so the
  trigger row and the sheet can never disagree.

When readiness is withheld (`readinessPending`), the trigger row renders
nothing — consistent with the ring's medallion state and the stale-wearable
gate in `utils/readinessGate.ts`. Do not show contributors for a score that is
being withheld.

---

## 3 · "Diese Woche" becomes expandable

`components/dashboard/ThisWeekCard.tsx`.

**Collapsed (default):** card title, the pace sentence (`paceLine`), the large
compliance `%`, and the horizontal progress bar.

**Expanded:** additionally the three stats row (TSS erledigt / Einheiten / TSS
übrig) and the seven Mon→Sun day dots.

- Toggle is the card header; the whole header row is the hit target.
- State persists in `localStorage` under a single key so it survives navigation
  and reload.
- A chevron indicates state and rotates on toggle.
- Expanded region gets `aria-expanded` / `aria-controls` on the trigger and is
  removed from the tree when collapsed (not merely hidden), so collapsed content
  is not read by screen readers.

`deriveThisWeek` in `components/dashboard/thisWeek.ts` is **not** touched. The
existing "no plan data yet this week" branch stays in the collapsed region,
since it replaces the progress bar.

---

## 4 · Fitness & Frische moves to Körper

Move `<FitnessFreshnessCard />` out of `TodayTab.tsx` (import line 25) and mount
it in `components/dashboard/tabs/RecoveryTab.tsx`.

Rationale (user decision): CTL/ATL/TSB answers "can I take it", which is
Körper's question, and Körper is already where every body signal was
consolidated. The component itself is unchanged.

---

## 5 · Zusätzliche Einheiten: today on Today, history on Verlauf

`components/dashboard/ExtraSessionsCard.tsx` currently shows a rolling **7-day**
window of non-primary sessions with their load share, mounted on Today.

**On Today:** only sessions logged **today**. When there are none, the card
renders `null` — no empty state, no "keine zusätzlichen Einheiten" line. Today
should not carry a card whose only message is that nothing happened.

**On Verlauf (`HistoryTab.tsx`):** the existing rolling 7-day breakdown with TSS
contribution and share-of-total-load, unchanged.

Implementation: `deriveExtraSessions` in `components/dashboard/extraSessions.ts`
gains a window parameter (or a same-day filter applied by the caller — the plan
decides which is cleaner). The load math is unchanged and its node unit tests
must still pass; add cases for the same-day window.

---

## 6 · Plans must show heart rate, cadence and correct watts

### Root cause

`adaptIntervals` in `components/dashboard/DayPlanCard.tsx:42` maps
`IntervalBlockOut[]` → `ResolvedBlock[]` and hardcodes four fields:

```ts
cadence_low: null,
cadence_high: null,
target_hr_low: null,
target_hr_high: null,
```

`IntervalRibbon.tsx` renders cadence (lines 157–175, 239–242) and HR correctly
**when given real values** — it is not the culprit. Any plan day rendered
through this adapter therefore *can never* display HR or cadence, which is the
reported "sometimes not displayed": it depends entirely on which path built the
blocks.

### The watts bug in the same function

```ts
target_watts_low:  Math.round(pct * 200 * 0.95),
target_watts_high: Math.round(pct * 200 * 1.05),
```

`200` is a hardcoded FTP. Every prescribed wattage on this path is wrong for any
athlete whose threshold is not exactly 200 W. User approved fixing this in the
same pass, since it is the same function inventing values instead of reading
real ones.

### Fix

- Read `cadence_low/high` and `target_hr_low/high` from `IntervalBlockOut` when
  the backend supplies them; fall back to `null` only when genuinely absent.
- Scale watts off the athlete's real threshold (`usePowerProfile` →
  `threshold_watts`), which `TodayTab` already reads for the header chip.
- When no threshold is available, render an honest `—` for watts rather than a
  fabricated range. Percent-of-FTP and zone still render.
- `Segment ${i + 1}` naming stays unless the payload carries a real name.

**Verify first:** confirm which fields `IntervalBlockOut` actually carries
before writing the mapping. If the backend does not send cadence/HR at all, the
fix is a backend addition and the plan must say so rather than mapping fields
that do not exist.

---

## 7 · History thumbnails show the real route

### Current behaviour

`ActivityThumb` in `components/dashboard/tabs/HistoryTab.tsx:72` renders a
**procedurally generated** "intensity terrain" ridge: `fnv1a` hashes the
activity id, seeds `mulberry32`, and draws a deterministic random ridge. The
comment calls it a stand-in for the route line. It is decorative noise, which is
why the colour gradient reads as arbitrary — it encodes nothing.

### Target

Draw the ride's **actual GPS track** as an SVG line, reusing the normalization
in `pages/ExploreRoutesView.tsx:43` (`RouteSketch`) — project lat/lng into the
box, preserve aspect ratio, no tiles. `components/social/RouteMini.tsx` is the
same pattern at chip scale; extract one shared component rather than adding a
third copy.

**Decision (user):** SVG route line, no map tiles. Satellite imagery would need
a tile provider, and the Maptoolkit attribution blocker in
`docs/deploy-runbook-2026-07-p0.md` is still unresolved.

### Backend dependency

Per-activity polylines are currently available **only** through the per-ride
stream analysis endpoint (`backend/app/api/activities.py:179`) — one request per
ride, unusable for a list. `/routes` returns polylines but clustered by route,
not keyed by activity.

Add a **downsampled polyline (≤48 points)** to the activity list payload,
derived from cached streams. Rides with no GPS (indoor/virtual) carry `null`
and render a neutral placeholder — never a generated ridge.

This is the only backend change in this spec.

---

## 8 · Anstiege: two defects making the numbers wrong

Both in `components/debrief/BreakdownPanels.tsx`.

### 8a · The headline pairs mismatched populations

```ts
const merged  = mergeClimbs(climbs)
const notable = merged.filter((c) => c.distance_m >= 300 || c.elev_gain_m >= 30)…
const totalAscent = climbs.reduce((s, c) => s + c.elev_gain_m, 0)   // ← raw
```

`notable.length` counts merged climbs above threshold; `totalAscent` sums
**every raw fragment**, including the ones just filtered out. The headline
`"5 Anstiege, 840 Hm"` therefore reports elevation from climbs that are not in
the list.

**Fix:** sum ascent over the same climbs the headline counts (`notable`).

### 8b · Bridged climbs overstate gradient and understate VAM

In `mergeClimbs` (line 29), when two segments are bridged across a gap:

```ts
const dist = cur.distance_m + nx.distance_m               // gap distance EXCLUDED
const dur  = nx.start_s + nx.duration_s - cur.start_s     // gap duration INCLUDED
avg_grade_pct: (gain / dist) * 100
vam_m_per_h:   gain / (dur / 3600)
```

Gradient is computed over a distance that omits the connecting gap, while VAM is
computed over a duration that includes it. The two figures on one table row
describe different spans: gradient reads too steep, VAM too low.

**Fix:** carry the gap distance into `dist` so grade and VAM describe the same
segment. If gap distance is not derivable from the `Climb` payload, compute both
over the gap-excluded span instead — the requirement is that the two agree, not
which span is chosen. State the choice in a comment.

### Scope

The `≥ 300 m or ≥ 30 m` notability filter, the 6-row cap, the `+ N kleinere
Anstiege` line and the 90-second bridge threshold are all **unchanged**. This is
a correctness fix, not a retuning of climb detection.

---

## Testing

- **Unit (vitest, node env):** `mergeClimbs` bridging arithmetic (8b), total
  ascent population (8a), `deriveExtraSessions` same-day window (5),
  `adaptIntervals` mapping incl. the no-threshold `—` path (6).
- **Component:** `ThisWeekCard` collapsed/expanded content and persistence (3);
  contributors trigger hidden while readiness is withheld (2); `ActivityThumb`
  placeholder for a null polyline (7).
- **Regression:** `narrativeKit.test.tsx` must pass after `CHAPTER_TITLES`
  moves (1). Full suite is 649 tests across 61 files and is currently green —
  it must stay green.
- **Visual:** render Today, Körper, Verlauf, Plan and a ride-analysis page at
  390×844 and confirm by eye. Per project rule, render before declaring any
  visual item done — static gates passed on a previous surface that still
  shipped wrong.

## Sequencing

1, 4, 5 and 3 are independent and can land in any order. 2 should follow 1 (both
rewrite the top of `TodayTab`). 6, 7 and 8 are independent of everything else; 7
is gated on its backend change.
