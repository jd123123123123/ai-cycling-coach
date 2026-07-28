# Dashboard storyline — four chapters on one season arc

**Date:** 2026-07-28
**Status:** approved (design), implementation not started

## The problem

The app has six bottom-nav tabs (Heute · Training · Fortschritt · Erholung ·
Verlauf · Social), 35 routes, and 4 299 lines across four tab components. There
is a lot of detail and no through-line: nothing tells the reader "this is the
storyline behind it."

Two measurable causes, not opinions.

**1. No fact has one home.** The same content is rendered on three surfaces, so
no page owns a chapter of the story:

| fact | rendered on |
|---|---|
| Power profile / Leistungsprofil | `PlanTab`, `HistoryTab`, `/progress/bike` |
| Fitness & Frische (CTL/ATL/TSB) | `TodayTab`, Fortschritt |
| Week load / Wochenlast | `TodayTab`, `PlanTab` |
| Readiness score + drivers | `TodayTab`, `RecoveryTab` |

**2. The design file never settled the nav either.** `component/TabBar` in
`pencil-new.pen` declares five tabs (Today · Train · Recovery · History ·
Social) and *every* V4 frame overrides Social to `enabled: false`. The V4
frames separately relabel tabs 2–4 as Ride · Coach · Progress. The app shipped a
sixth tab that exists in neither version.

## Decisions taken

Four decisions were made explicitly and are not open for re-litigation during
implementation:

1. **Restructure the nav**, not just the page interiors. Six tabs → four.
2. **The storyline is the season arc toward the target event.** Every chapter
   answers "am I going to be ready?" from a different angle.
3. **A persistent chapter bar on all four pages** — the element that makes four
   pages read as one document.
4. **Social is woven into the chapters it belongs to**, not a peer tab. The crew
   stack is NOT cut; it stops competing for a nav slot.

## The pattern

Borrowed wholesale from `V4 · Ride Recap` (node `fSuFJ`), which works because it
is a narrative arc with tinted roles rather than a card pile: MapHero → Effort
Moment (amber, glowing) → Coach's Read (purple) → Power Curve → Climb Replay →
Week Complete → Zones → Telemetry → Impact → Kudos → Story Preview → Share.

Place → moment → meaning → evidence → consequence → share.

Every chapter uses the same six slots in the same order:

| slot | role | visual identity |
|---|---|---|
| ChapterBar | where you are in the story | persistent; 4 dots + phase + week-in-block + countdown |
| Chapter Hero | the one number this chapter is about | full-bleed, its own ground |
| The Moment | the single most notable thing right now | amber `#FFD166` gradient + outer glow — **exactly one per page** |
| Coach's Read | what it means, in prose | purple `#8B5CF614` fill, `#8B5CF63D` stroke |
| Evidence | detail, descending depth | `$surface`, `#FFFFFF14` stroke |
| Next chapter → | hands off, closes the loop | coral `$accent`, one per page |

The repetition is the structure. By the second chapter the reader knows where to
look for the verdict, where to look for the reason, and where the detail starts.

Colours are existing tokens, not new ones: amber = achievement, purple =
coach/AI, plain surface = evidence, coral = action.

## The four chapters

### 1 · HEUTE — „Was mache ich heute?"

The decision.

- **Hero** — the verdict (`VO₂ steht an`) + readiness ring
- **Moment** — today's session
- **Read** — the coach's why
- **Evidence** — weather window, drivers, momentum cues, missed-yesterday, rest
  card, session review
- **Next** — → Plan
- **Tail** — `/workout/today`, `/coach`, and `/activities/:id/recap` for the ride
  just finished

`/workout/:date` for any day other than today belongs to Plan, and
`/activities/:id/recap` for any ride other than the most recent belongs to
Verlauf. Same routes, different chapter of origin — the route is shared, the
entry point is owned.

Loses: Diese Woche → Plan. Fitness & Frische → Verlauf. Wohin das führt → Plan.
`MorningHealthCard` → Körper. Weekly Wrapped surface → Verlauf (the time-boxed
banner stays; see Exceptions).

### 2 · PLAN — „Wo das hingeht"

The arc between now and the event.

- **Hero** — countdown + phase arc (`Aufbau · W3/6 · 130 Tage`)
- **Moment** — the next key session in the block
- **Read** — why this block looks like this
- **Evidence** — week strip, week-load target, block structure, weeks left,
  **crew rides inline on the calendar**
- **Next** — → Körper
- **Tail** — `/calendar`, `/season`, `/plan/import`, `/workouts/builder`,
  `/workouts/builder/:id`, `/crew-event/:id`, `/routes`, `/climbs`

### 3 · KÖRPER — „Kann ich das tragen?"

The constraint.

- **Hero** — readiness ring (full version; Heute only quotes it)
- **Moment** — the one driver currently limiting readiness
- **Read** — what to do about it
- **Evidence** — sleep stages, HRV / RHR / respiration / skin temp, body
  battery, strain, 30-day recovery calendar, recovery ETA, morning health
- **Next** — → Verlauf
- **Tail** — `/recovery/trends`, `/garmin/connect`

### 4 · VERLAUF — „Hat es funktioniert?"

The proof. Closes the loop back to Heute.

- **Hero** — FTP then → now → forecast
- **Moment** — the PR or the FTP jump
- **Read** — is the build working
- **Evidence** — Fitness & Frische, power curve, season progress, distance this
  month, streak/consistency grid, recent activities, personal records,
  **kudos + crew rank**, Weekly Wrapped
- **Next** — → Heute
- **Tail** — `/progress/bike`, `/power-profile`, `/activities`, `/achievements`,
  `/recap/week`, `/wrapped`, `/activities/:id/*`

## De-duplication

This table is the part that actually creates the storyline. Each fact gets one
owner; the other surfaces either lose it or keep a one-line quote that links to
the owner.

| fact | one owner | what changes elsewhere |
|---|---|---|
| Power profile | Verlauf | `PlanTab`'s copy deleted |
| Fitness & Frische | Verlauf | leaves Heute — this closes the open question raised in the Jul 2026 Today-tab review |
| Week load target | Plan | Heute shows only today's slice |
| Readiness score + drivers | Körper | Heute keeps the one-line input to the verdict |
| Wohin das führt | Plan | removed from Heute |
| Weekly Wrapped surface | Verlauf | see Exceptions |

**Exceptions, stated so they are not read as violations:**

- The Weekly Wrapped *banner* stays on Heute. It is a time-boxed nudge ("your
  week is ready"), not a surface. The surface it links to lives in Verlauf.
- Heute quoting the readiness state word is not duplication. The verdict is
  unreadable without it, and the stale-wearable gate (`utils/readinessGate.ts`)
  still governs whether any readiness claim is made at all.

## New modules

New directory `frontend/src/components/narrative/`:

- `ChapterBar.tsx` — persistent strip: four dots (chapter position), phase +
  week-in-block, countdown, chapter name. Identical position on all four pages.
- `ChapterHero.tsx` — full-bleed hero frame taking a headline, a support line
  and optional ring/graphic slot.
- `MomentCard.tsx` — the amber gradient + glow card. Renders at most one per
  page by contract.
- `CoachRead.tsx` — purple prose card.
- `NextChapter.tsx` — coral handoff row.

New pure module `frontend/src/utils/seasonArc.ts`, unit-tested like every other
`utils/*.ts` in the codebase:

```ts
export type Phase = 'base' | 'build' | 'peak' | 'taper' | 'race' | 'off'
export type ChapterId = 'today' | 'plan' | 'body' | 'history'

export interface SeasonArc {
  phase: Phase
  /** 1-based week within the current block, and the block's length. */
  weekInBlock: number
  blockWeeks: number
  /** Days until the target event, null when none is booked. */
  daysToEvent: number | null
  /** True when there is no event and the arc is a rolling fallback. */
  synthesized: boolean
}
```

**No-event fallback is mandatory.** With no target event booked, the arc falls
back to a rolling six-week block derived from training history and sets
`synthesized: true`, so the ChapterBar never renders blank and never implies a
countdown that does not exist. This follows the existing house rule that a
synthesized value must announce itself (cf. the synthesized-zone default and the
`extrapolated` flag in `utils/fatiguedPacing.ts`).

`TodayTab.tsx` is 1 660 lines. Its hero, moment and coach blocks become the
shared components above — the file-size reduction is a consequence of the
restructure, not a separate refactor.

## Phases

Each phase is independently shippable and independently verifiable.

**Phase 1 — spine and nav.**
`seasonArc.ts` + tests, the five narrative components, `MobileBottomNav` six
tabs → four, Social woven into Plan and Verlauf, crew avatar-stack entry in the
header. Redirects from the retired tab ids so no existing link 404s.

**Phase 2 — chapters 1 and 3.**
Heute and Körper rebuilt on the kit, with their half of the de-duplication
table. These two are the most-used surfaces, so they go first.

**Phase 3 — chapters 2 and 4.**
Plan and Verlauf rebuilt, `/progress/bike` folded into Verlauf's tail, the
remaining de-duplication applied.

## Risks

- **Cutting Social from the nav reduces crew discoverability.** The crew stack
  was kept deliberately against a council recommendation to cut it. Mitigation:
  crew rides inline in Plan's calendar, kudos and crew rank in Verlauf's
  evidence, and a crew avatar-stack in the header. If crew engagement turns out
  to matter more than a four-chapter nav, restoring a fifth slot is a
  one-component change — `MobileBottomNav` is the only place tab identity lives.
- **Four chapters is fewer buckets than the content currently occupies.** The
  de-duplication table is what makes it fit. If a card resists placement, that
  is a signal the card is duplicated or unowned, not a signal to add a tab.
- **`TodayTab.tsx` at 1 660 lines is the largest edit surface.** Phase 2 touches
  it heavily. The narrative components must exist and be verified in phase 1
  first, so phase 2 is substitution rather than invention.

## Out of scope

- Any change to what the coach *says*. This restructures where things live, not
  the recommendation logic.
- Desktop layouts. Mobile-only remains the priority; 390×844 is the target
  viewport and desktop is a sanity check.
- The four dead page files found while surveying (`LiftProgressView`,
  `LoadFormView`, `RunAnalysisView`, `RunProgressView` — leftovers from the
  bike-only cut, none routed in `App.tsx`). Deleting them is correct but is not
  part of this work. `RideAnalysisView` is unrouted **on purpose** (it is the
  recap's embedded tail) and must not be swept up with them.

## Verification

Per phase, matching the discipline already used in this codebase:

- `npx tsc -b --noEmit` clean.
- `npx vitest run` — full suite green; `seasonArc.ts` gets its own test file
  covering each phase, the block-boundary arithmetic, and the no-event
  `synthesized` fallback.
- `npx eslint` on touched files, compared against the pre-change output so
  pre-existing findings are not mistaken for new ones.
- A rendered frame at 390×844 for every chapter, with real scroll offsets
  measured — not a static read of JSX order. The Jul 2026 Today's Road
  regression passed every static gate and still shipped wrong.
- Railway deploy verified by byte-comparing served assets against the local
  build, not by trusting the deploy status.
