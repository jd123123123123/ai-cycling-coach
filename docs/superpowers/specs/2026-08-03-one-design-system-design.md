# One Design — unifying 35 pages into a single interactive, illustrated, rewarding system

Date: 2026-08-03
Status: approved direction, implementation in waves

## Goal

Every page and subpage reads as one app: one shell, one nav, one motion
language. On top of that base, a data-driven illustration layer and an earned
reward layer make the app fun to open and rewarding to obey — without ever
fighting the coaching.

## Decisions taken (user, 2026-08-03)

1. **Layer delight onto the calm base.** The paper/ink editorial system built in
   Phases 6.1/6.2/7.05 stays as the resting state. Delight lives in arrivals,
   achievements and transitions — not in a repaint. The data stays legible and
   trustworthy.
2. **Illustrations are generative and coded.** No asset pipeline, no external
   images. Scenes are drawn from the athlete's own data.
3. **The reward loop rewards plan adherence, rest included.** A prescribed rest
   day is a win and keeps the streak alive.
4. **Sequencing is system-first.** Primitives, then the daily journey, then a
   sweep of the long tail.

## What is actually broken today

Measured, not assumed:

- Design tokens are healthy: 191 of 255 components use `var(--color-*)`; only 2
  use a raw Tailwind palette. **Colour is not the problem.**
- Structure is the problem: **only 6 of 35 pages render `MobileBottomNav`**, and
  only 14 touch `DashboardShell`. The other pages have bespoke chrome, so the
  app loses its nav and its identity as soon as you leave the dashboard.
- There is **no illustration system**: 2 SVG files in the entire frontend.
- Delight primitives already exist but are unused off-dashboard:
  `CelebrationOverlay`, `Confetti`, `StreakBreakOverlay`, `ShaderCanvas`,
  `narrative/*`, and `motion/react` in 36 files.

## Architecture

### 1. `AppShell` — the backbone

**Constraint discovered during exploration:** `DashboardShell` cannot be the
universal shell. It is Today-specific — it owns `TodayRoad`, `RoadHud`,
`AuraContext`, a delegated pointer-scrub listener, and an *unenforced* invariant
that no card may paint its surface with a Tailwind `bg-*` class (violating it
silently swallows taps). Mounting 21 foreign pages on it would be a bug farm.

So `AppShell` is a new, thin primitive:

- safe-area insets and the standard page gutter
- one `PageHeader`: title, optional back chevron, optional trailing action
- the existing `MobileBottomNav`, rendered from one place
- scroll restoration

**Amended after implementation.** The plan said `DashboardShell` would be
refactored to *compose* `AppShell`. It was not, deliberately: `DashboardShell`'s
`<main>` is the element its delegated pointer-scrub listener is attached to, and
moving that element inside another component would either relocate the listener
or add a wrapper between the shell and the node it takes pointer capture on —
both of which risk the documented, unenforced tap-swallowing invariant for no
user-visible gain.

Instead the two shells **share their layout constants by convention**:
`max-w-md mx-auto px-4 pb-28`, `gap-6`, `paper-grain`. That agreement is what
makes a page look identical on either shell, and it is asserted only by the
comment in each file. If they drift, the app splits back into two designs.

**Nav model:** the existing four chapters — Today · Plan · Body · History — from
`utils/seasonArc`. This is deliberately NOT redesigned: it is `.pen`-derived, its
active-state logic is already honest (a tab only lights on its own surface), and
`resolveActive` keeps old `?tab=` links working. Everything outside those four is
a pushed sub-page: back chevron, shared `PageTransition`, no new tab slot.

### 2. `Scene` — the illustration engine

One primitive, `<Scene kind={...} data={...} />`, three kinds:

- **`sky`** — readiness and time of day as a gradient with the warm sunrise bloom
  already approved for the Today aura
- **`terrain`** — route, elevation or week load as a drawn ridgeline, building on
  `RouteSketch` and the existing elevation-profile drawing code
- **`field`** — zone distribution as a coloured landscape

Shared rules:

- palette comes from the existing tokens; no new colours
- deterministic from an `athlete + date` seed, so a scene is stable across
  reloads rather than reshuffling on every render
- `prefers-reduced-motion` disables animation, never the drawing
- canvas/SVG only — no external assets, nothing that trips the CSP
- **one Scene per screen**, to protect the bundle and the frame budget

**Governing rule:** a Scene renders real data or it renders its honest empty
state. It never decorates with invented data. This is the same discipline as the
stale-wearable rule — an illustration that implies a measurement the athlete
never took is exactly the failure this codebase already refuses elsewhere.

### 3. `Moment` — the reward layer

`useMoments()` derives earned events from data already on the client:

- prescribed session executed
- **prescribed rest day honoured**
- target zone held
- adherence streak extended
- PR, FTP gain, plan week completed

Rendered through the existing `CelebrationOverlay` / `Confetti`, plus a
`MomentCard` for the quieter ones.

**The load-bearing rule:** the streak counts *adherence*, not activity. A rest
day the coach prescribed keeps it alive. This is what stops the dopamine loop
from contradicting the readiness ring on the mornings that matter most.
`StreakBreakOverlay` is re-pointed at adherence rather than activity.

Every moment is earned from real data. No fabricated encouragement.

### 4. Motion

Existing `motion.ts` springs and the existing `PageTransition` crossfade — which
is opacity-only for a documented reason (any transform/filter on an ancestor
would break the `position: fixed` nav). Scenes inherit the scrub interaction
already used by `HoverBars` and the Today road.

## Rollout

- **Wave 1 — primitives only.** `AppShell`, `PageHeader`, `Scene`, `useMoments`,
  `MomentCard`. No page changes, so nothing can regress.
- **Wave 2 — the daily journey.** Today → Workout → Recap → Week → Achievements.
- **Wave 3 — the sweep.** The remaining pages onto the spine.

Each wave is rendered and screenshotted at 390×844 before it is called done.

## Risks

- **Bundle.** A canvas Scene per screen can regress the budget. One per screen,
  measured each wave.
- **`DashboardShell`'s unenforced invariant.** The refactor must not introduce a
  `bg-*` card surface. Nothing in the type system guards this.
- **Sequencing against Phase 10.** Phase 10 exists to verify and screenshot the
  V4 surfaces; this redesign churns those same surfaces. Resolution: fold Phase
  10's visual criterion (SC5) into Wave 2's verification. The data and physiology
  criteria (SC2–SC4) are independent of the redesign and still need doing.

  **VI = 1.007 flag WITHDRAWN — not a defect.** It was raised on the assumption
  that the simulator holds power through descents. Checked against the stored
  result: the model *does* vary power with gradient (129 W mean below −6%,
  202 W on 6–9% ramps). The route simply spends **89% of its time climbing at
  ≥3% and 4% descending** — the descent is fast, so it occupies almost no time,
  and a route that is essentially one long steady climb genuinely has VI ≈ 1.00,
  the same as a hill-climb TT. Reported `avg`, `NP` and `VI` all reproduce
  exactly from the segments. The original flag reasoned from distance share
  (10 km of 26 km) rather than time share, which is the mistake to avoid
  repeating on the remaining physiology checks.

## Non-goals

- No repaint of the editorial palette or type.
- No redesign of the four-chapter nav.
- No new engagement mechanic that rewards volume over adherence.
