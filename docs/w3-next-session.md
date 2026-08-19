# Start here next session

Branch `cassette-reward-layer`, clean, deployed. Live bundle `index-Da6cYPX9.js`
on both hosts. Backend 3186 / frontend 1314 green; the one red test is the
isolation gate at 23 files, which is real debt with a path to zero.

## Do these three, in this order

### 1. "Letzte Woche" as a Wrapped deck — the big one
Owner: *"geile Slides, viel Dopamin, Erfolge feiern, und zum Schluss ein Screen
zum Sharen mit den Freunden und der Zusammenfassung der Woche."*

Seam that already exists — do NOT rebuild these:
- `W3WeekRecapCard` (the Today entry point) and `/e/w3-week-review`
- `useWeekReviewVm` — one producer already shared by both
- `w3share.ts` — sharing helpers already written
- `W3RideCelebrateView` — the closest existing thing to the tone wanted:
  count-up, confetti, violet→lime settle, two-tone display type. Read it first;
  the vocabulary for "celebrate" is already defined there.

Shape: full-screen slides, one fact per slide, tap/swipe to advance, ending on a
shareable summary. The facts must come from the real recap payload — a Wrapped
deck that invents a stat is worse than no deck.

### 2. Rest day needs a composition, not a sentence
Root cause is fixed (today now asks the plan, `94e6e38`), so rest days no longer
draw interval beams. What renders instead is a moon icon, a heading and one
line. A rest day is a third of the training week and currently the emptiest
screen in the app. Show what recovery is *doing*: HRV trending back toward
baseline, the load being absorbed, what tomorrow gets because of it.
Data is there — `/health/morning-check` carries `series` + `baseline` per signal.

### 3. Hero images — a concept, not another crop
Owner: the heroes on Today AND ride detail are "alles andere als attraktiv,
witzig und animierend". Today's hero was bled to the edges with its name in
type (`ce2fdb5`), which helped and did not solve it: the art underneath is still
a catalogue render on a studio ground. Decide what that picture IS before
touching layout again. Note the ride-detail hero has the same problem and was
never looked at this session.

## Two traps that cost time this session

**Grep before building.** Three backlog items I wrote turned out to already
exist: the power-duration curve (built + served, unreachable from W3 — now
ported), the weekly load ramp (built AND one tap away via "Ganzer Plan"), and
the onboarding bike grant (correctly wired; only its comment was stale). The
failure mode in this repo is lost entry points and stale comments, not missing
capability.

**`whileInView` does not work here.** Measured: elements far below the fold sit
at their final value at scrollTop 0 while an IntersectionObserver on the same
node correctly reports `isIntersecting: false`. Use `useInView` from
`w3tokens.tsx` for anything scroll-triggered. All three former call sites are
migrated.

## Verifying UI

`/e/w3-*-preview` routes are unguarded and fixture-driven — fastest way to see a
surface. But self-fetching sections (`W3WhyToday`, `W3TodayStatus`,
`W3TodayRank`, `W3TodayProgress`) do NOT render there because their queries 401;
those need a component test or a logged-in session.
`W3AvatarOnboardPreview` now takes `?stage=intro&photo=0`.

Measure the DOM rather than eyeballing. Several defects this session were
invisible by eye and obvious in `getBoundingClientRect()` — the readiness gauge
sitting under the action button was a 27px overlap nobody had named.
