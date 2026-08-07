# Today · the Cassette and the reward layer

**Date:** 2026-08-07
**Status:** approved in brainstorming, ready for a plan
**Surface:** `/e/today`, all five day states
**Design system:** EDITORIAL II, evolved (not replaced)

## Why

EDITORIAL II reads beautifully in print logic and weakly on a phone at arm's
length. Rendered at 390×844, the failure is specific and repeatable across all
five states:

1. The hero is a large number with **no body** — nothing to feel before you read.
2. Below the hero every row carries the same visual weight, so scanning requires
   reading.
3. No chart highlights anything. Grey bars are drawn, not argued.
4. There is no elevation, so grouping is done by whitespace alone.
5. Nothing moves, so nothing rewards.

The goal is a Today that a rider opens *because opening it feels good*, without
the app lying to earn that feeling.

## Decisions already taken

| Decision | Choice |
| --- | --- |
| Relationship to EDITORIAL II | **Evolve it.** Keep the day-state hue, section rhythm, German voice, and the honest-missing rule. Add the reward layer on top. |
| Authoring loop | **Code-first.** Design in React against real data, render at 390×844, screenshot, critique, iterate. `pencil-new.pen` is the archive of what EDITORIAL II was transcribed from; new work is not back-ported. |
| Hero object | **The Cassette.** Not a gauge — every fitness app has a ring. |
| Mechanics in bounds | Celebration on real achievement; streak with honest rules; progressive unlock; crew comparison; **guilt/broken-streak framing and XP** (owner decision, 2026-08-06). |
| Mechanics out | Manufactured countdowns and scarcity with no physiological basis. |
| Behaviours targeted | Morning open (peak 1), post-ride payoff (peak 2), streak (the thread between them), deep exploration (earned by tapping). |

**The one guard rail on guilt:** it attaches to things the rider *chose* — a
skipped planned session, an unlogged check-in — never to the physiological
verdict. An app that shames a low-HRV rest day contradicts its own coaching.

## 1. The Cassette

### Geometry

Ten cogs in side profile, symmetric about a vertical axle, tooth counts
`[11, 13, 15, 17, 19, 21, 24, 28, 32, 34]` top to bottom. Cog half-width is
linear in tooth count (11t → 34px, 34t → 118px). Row pitch 26px. Total block
268px tall inside the 390 column.

Three visual registers:

- **Out of reach today** — cogs above the chain: `#FFFFFF1F`, present but off.
- **Available** — cogs below the chain: a `#FFFFFF7A → #FFFFFF2E` ramp downward,
  so the eye reads a descending ladder rather than a stack of equal bars.
- **The chain** — a solid accent rect on the active cog, `rx` fully rounded,
  with a glow, plus a thin accent path descending from the top right and
  wrapping onto that cog.

> **Implementation note learned the hard way:** the glow filter must use
> `filterUnits="userSpaceOnUse"` with an explicit region, and the lit cog must
> be a `<rect>`, not a `<line>`. A horizontal line has a zero-height bounding
> box, which collapses an `objectBoundingBox` filter region and silently erases
> the element.

### Semantics

**The cog is the gear your body can push today.** Small cog (11) = loaded and
fresh, you can turn the big gear. Big cog (34) = survival.

The mapping is **percentile against the rider's own 90 days**, not an absolute
score:

```
values = ninetyDayReadinessValues        // already computed in useTodayModel
p      = percentileRank(todayReadiness, values)   // 0..1
index  = clamp(round((1 - p) * 9), 0, 9)          // 0 = the 11t
```

Self-referential is the honest choice: "you can push the 11" means "the top of
your own range", not a number borrowed from someone else's physiology. With
fewer than 14 usable readiness values in the window, fall back to absolute
deciles (`index = clamp(9 - floor(r / 10), 0, 9)`) and say so in the caption.

**The 90-day best** renders as a thin accent line plus a caret on its own cog,
labelled `BEST 13`. It is a position you can watch yourself approach, not a stat
you read. Only a real new best moves it.

### Per day state

| State | What the cassette shows | Caption |
| --- | --- | --- |
| `rest` | Today's ceiling | "Heute geht das 17er." |
| `training` | Today's ceiling, with the planned session's gear demand marked | same, plus the session's cog as a faint tick |
| `trained` | What is **left** after the session | "Nach der Einheit bleibt das 28er." |
| `resting` | Today's ceiling, no session context | "Heute geht das 17er." |
| `evening` | What is left, plus tomorrow's projection as a ghost | "Morgen wieder das 19er, wenn du schläfst." |

### The honest cases

- **Stale wearable** — the cassette renders with every cog hollow, no chain, no
  verdict word, and the date of the last real measurement. The gauge refuses to
  guess. This routes through the existing `utils/readinessGate.ts`; it is not a
  second gate.
- **No readiness at all** — the hero collapses to the day's claim in type, with
  one quiet line saying why. No empty cassette skeleton.
- **Post-ride before the next sync** — when a ride lands, the chain drops by the
  session's *recorded* cost and the caption carries `geschätzt`. It settles to
  the measured value at the next wearable sync. We never present the estimate as
  a measurement.

## 2. The Bento

A two-column grid under the hero. **Size and colour are earned by the coach's
actual reasoning, so the layout changes shape day to day.**

- The metric the reasoning keys off gets a **double-height tile**; the other two
  or three are single. The ranking comes from the reason string the coach
  already produces, not a fixed order.
- **Exactly one tile is ever accented** — accent fill, dark ink. Every other tile
  is `--e-glass` on a 1px rule. One accent per screen means the eye always knows
  where to land first.
- Every tile carries a chart whose **shape matches the metric's nature**:
  continuous signals → sparkline; daily totals → bars; in-range signals → a
  dot-band showing the rider's personal band with today's dot inside or outside.
- **The universal chart rule: exactly one point is highlighted, everything else
  is neutral.** Today's point in accent with its value on a badge; the rest at
  `--d-2`. A record gets a ★. This single rule is the largest difference between
  the current charts and the references.
- **Tap expands the tile in place** into the full chart with scrub — depth earned
  by curiosity, surface stays three numbers. Reuses the existing `useScrub` and
  `useReveal` motion hooks.
- **Missing data keeps its dignity**: label, em-dash at value scale, one quiet
  line saying why. Never a zeroed chart, never a flat line pretending to be data.

## 3. Motion contract

| Moment | Motion | Budget |
| --- | --- | --- |
| **The morning shift** | Chain travels from yesterday's cog to today's, one sprocket at a time, click + haptic per step | 90ms per sprocket, max 900ms |
| Hero numeral | Counts 0 → value, easing out, finishing **with** the chain | matches the shift's own duration |
| Cog light-up | The landed cog's glow fades in last, so the number arrives *because* the chain arrived | 200ms |
| Tiles | Stagger in, 40ms apart | 320ms each |
| Sparklines | Draw left→right after their tile lands | 500ms |
| **The drop** | On ride upload the chain falls down the cassette to what's left | 900ms, ease-in |
| **The record** | `BEST` marker shifts up one or more cogs with a bloom, and holds | 700ms |

Rules: each of these fires **once per day per event**, never on scroll-back —
this is what keeps them events rather than wallpaper. `prefers-reduced-motion`
resolves every one of them instantly, with no exceptions and no fade
substitutes.

## 4. Die Kette — streak, XP, and the break

The metaphor pays for the streak for free: **the chain is the streak.** Thirteen
days is thirteen links.

- **Rest days never break it.** Rest is prescribed work.
- **A skipped planned session breaks it**: the hero shows a snapped link, the
  count restarts, and the copy names what was skipped. This is the guilt
  mechanic, expressed in the app's own object rather than a red banner.
- **XP accrues from planned load actually completed** — `weekLoad.spent` against
  `weekLoad.planned`, both already in the model. Junk miles cannot farm it,
  because unplanned load does not count toward the weekly target.
- The week strip shows `4 von 5 Einheiten` and `640 / 800 XP` on one row above a
  ten-segment bar: filled, target, empty.

## 5. Celebration

A record is **a gear you could not reach before**. When a peak power beats the
90-day curve, the `BEST` marker shifts up the cassette, blooms, and stays there.
No confetti — a permanent, visible ladder. Only a real record moves it, so it
can never lie.

Records come from `peaks` / the MMP curve already in the model.

## Data

Everything the hero needs already exists in `useTodayModel`'s output:
`readiness`, `readiness90DayBest`, `streakDays`, `hrv`, `restingHr`,
`recentRestingHr`, `sleep`, `pmc`, `session`, `peaks`, `weekLoad`.

The percentile mapping needs the 90-day readiness *series*, which today is a
local (`ninetyDayReadinessValues`, built from the `ninetyDayMetrics` input and
collapsed to a single `Math.max`). Exposing that array on the model is an
additive change to an already-computed value — no new query, no backend work.

**One dependency to verify during planning:** whether "a planned session was
skipped" is derivable from the current week plan plus completed activities on
the client, or needs a backend field. The chain-break rule cannot ship on a
guess.

## Non-goals

- No new design system. EDITORIAL II's tokens, spine and voice stay.
- No back-porting any of this into `pencil-new.pen`.
- Desktop layouts. Verification is 390×844; desktop is a sanity check only.
- Session Detail, Recap, and the analysis surfaces — they inherit these
  primitives in a later pass, not this one.

## Verification

Per state (`rest`, `training`, `trained`, `resting`, `evening`) plus the stale
and no-data cases: render through the existing visual harness, screenshot at
390 wide, and check against this spec. A state is not done until its frame has
been looked at. Type-check and the existing editorial test suite must stay
green, including the isolation test that proves EDITORIAL II tokens cannot leak.
