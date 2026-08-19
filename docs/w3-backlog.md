# W3 backlog — read from the running app, not from the code

Written 2026-08-19 by walking `/e/w3-*` at 390×844 and measuring the DOM.
Three voices: **AM** = amateur (5–8 h/week, wants to know what to do today),
**PRO** = experienced racer (wants the numbers and the mechanism), **UX** =
designer bar set by WHOOP / Strava / Gentler Streak.

Ordered by value per unit of risk. Items marked ✅ are done in this branch.

---

## Done in this pass

- ✅ **Readiness gauge read as a streak tracker.** 16-of-18 lit bars sat under
  "17 Tage Streak", so the eye counted days. Hairline added. (`8c4523b`)
- ✅ **Action button covered the gauge on load.** 320px hero box around 246px of
  art pushed the meter to y=685 against a FAB at y=684. (`8c4523b`)
- ✅ **The lower half now arrives as you scroll.** Four sections reveal once.
  Note: `whileInView` was a verified no-op here — see "Known-broken" below.
  (`1fae58f`)
- ✅ **Handle printed twice in one viewport.** (`1fae58f`)
- ✅ **Scroll ended on three dashes.** Collapsed to one honest empty state.
  (`fcc856a`)
- ✅ **"Warum diese Einheit" was prose, and repeated its own conclusion.**
  Figures lifted to 26px, shared consequence stated once, real bar on the one
  row that owns two real numbers. (`af6e9f5`)

---

## P0 — known-broken, cheap, affects everyone

### 1. ✅ `whileInView` resolves immediately — migrated to `useInView`
**UX.** **Proven on Today only:** four wrappers sat at `opacity: 1`, no
transform, at `scrollTop: 0`, with tops at y=2224+, while a hand-rolled
IntersectionObserver on the *same element* correctly reported
`isIntersecting: false, ratio: 0`. Not reduced-motion, no `MotionConfig`, and it
still resolved instantly with an unconditional `initial`.

Scope correction — my first pass over-claimed "app-wide". The real usages were
**three**, not four: `W3SessionView`'s hit was a *comment* saying it
deliberately uses mount animation, not a usage. The three real sites
(`W3ChallengesView` ×2, `W3RideCelebrateView` ×1) are migrated to the
`useInView` hook in `w3tokens.tsx`, which is the mechanism proven to work.

**Not directly observed as broken on their own routes.** The challenges fixture
renders every gauge above the fold, and the celebrate fixture rendered no zone
bars, so neither preview could show the armed state. The migration is justified
by the Today measurement plus the fact that the same API drives them — but it
is inference, not a second observation. If you want it nailed down: give those
previews a fixture tall enough to push a gauge below 844px, then assert the
bar is at `scaleX(0)` before scrolling.

### 2. Rest days show a workout card's chrome with no workout
**AM.** On a rest day the plan still renders session furniture. Confirm what
`/e/w3-today` does when `day.rest` is true and there are no blocks — the
eleven-bar phantom was fixed (`209ec86`), but the surrounding card should be a
deliberate rest composition, not a session card with empty slots.

---

## P1 — the numbers a cyclist actually opens the app for

### 3. There is no power-duration curve anywhere
**PRO.** This is the single most-missed artefact for any trained cyclist. CP
and W′ services already exist (`science-engine-modules`), so the data is there.
A log-x curve with the rider's own bests at 5s / 1min / 5min / 20min / 60min,
this season against last, is the highest-value chart this app does not have.

### 4. Load is a number, never a shape
**PRO/AM.** CTL/ATL/TSB exist in `W3TodayStatus` as a 90-day curve, which is
good. But the *weekly* view has no ramp visualisation — the thing that tells you
whether you are building or digging a hole. A 6-week ramp bar (planned vs
actual TSS, with the 8%/week ceiling drawn as a line) makes the coach's central
constraint visible instead of stated in prose.

### 5. Intervals have no execution graph after the ride
**PRO.** `4 × 8 Schwelle` shows a target profile before the ride. After it,
show the same profile with actual overlaid — where each interval landed against
its band. This is the single most re-opened screen in TrainingPeaks/Xert.

### 6. ◐ Sleep and HRV are cited but never plotted
**AM.** "HRV liegt 14 % über dem Schnitt" — over *what* average, and trending
how? WHOOP's whole product is the baseline band with today's reading on it.

**Half done.** `W3RecoveryNudge`'s sparkline drew each signal's `series` but
omitted the `baseline` it is judged against — a shape with no level. The
baseline is now a dashed rule, folded into the scaling domain so it stays in
the box on exactly the mornings this card exists for (today outside the recent
range). 3 tests.

**Still open:** that card only appears when `level !== 'none'` — it is an
illness/downturn early-warning, not an always-on trend. A general HRV trend
needs a series endpoint of its own; the data exists (`DailyMetric.hrv_status`,
30-day window already assembled in `api/health.py`), but nothing serves it
outside the warning payload.

---

## P2 — redundancy and things to delete

### 7. Two heroes compete in the first viewport
**UX.** The bike hero (248px) and the identity card both sit above the
readiness score — the thing the app exists to tell you. On WHOOP the score is
the first pixel you see. Consider demoting the bike to the Garage tab and
letting Today open on readiness.

### 8. `ONBOARDING_BIKE_RC` pays for a dead flow
**Delete.** 150 RC is granted for "digitalise your bike in the studio", a
surface that is no longer a tab. It now pays for a dead end. Either repoint it
at the shop or remove it. *(Live in production — real economy impact.)*

### 9. The bike studio is orphaned
**Delete or promote.** `/e/w3-bike-studio` is reachable by URL with nothing
linking to it.

### 10. One silhouette for 26 bikes
**UX.** A time-trial bike draws like a tourer, so the ladder's top rung is a
repaint of the bottom rung. Either 3–4 silhouettes (road / TT / gravel / city)
or stop selling the difference as progression.

### 11. Parts are sold before they can be seen
**AM.** The item sheet no longer previews a part on your bike (a render per
browse is too expensive). Until compositing is instant, consider not selling
cosmetics whose effect is invisible at the moment of purchase.

---

## P3 — motion and craft

### 12. Nothing celebrates a completed interval
**AM.** The strongest habit loop in Gentler Streak is the moment of completion.
There is a ride celebration; there is nothing at the *set* level.

### 13. The charge meter is the only signature motion
**UX.** It is good — a staggered fill that reads as charging. It is also the
only orchestrated moment on Today. The reveal work added arrival; the app still
lacks a single memorable animation that belongs to *cycling* (a cadence pulse, a
chain-link progress, a wheel that completes).

### 14. Reduced motion is handled inconsistently
Some components branch on `useReducedMotion()`, the new `Reveal` reads
`matchMedia` directly. One helper, one behaviour.

---

## Testing notes

- `/e/w3-*-preview` routes render from fixtures and need no auth — this is the
  fastest way to see a surface. **But** self-fetching sections
  (`W3WhyToday`, `W3TodayStatus`, `W3TodayRank`, `W3TodayProgress`) do not
  render there, because their queries 401. Those need either a logged-in
  session or a component test.
- Measure the DOM. Three of the six fixed items above were invisible to the eye
  and obvious in `getBoundingClientRect()`.
