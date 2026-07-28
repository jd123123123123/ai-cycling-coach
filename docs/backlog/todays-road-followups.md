# Today's Road — follow-ups

*Deferred findings from the July 2026 build (spec `docs/superpowers/specs/2026-07-27-todays-road-design.md`,
plan `docs/superpowers/plans/2026-07-27-todays-road.md`). Everything the final pre-merge review
ruled must-fix was fixed before merge; this is the residue it ruled safe to defer.*

## Unverified — the honest caveat

**No frame of this feature has ever been rendered or looked at**, by a human or a tool. Every
verification was static: typecheck, unit tests, and code review. The following are cheap to
check by eye on a phone once, and nothing else can settle them:

- Is the terrain legible behind ~12 blurred cards at 390×844?
- Does the sticky `RoadHud` pill collide with the sticky readiness bar? (`RoadHud` uses
  `top: 8`; `stickyBar` sits at z-30 above it.)
- Does the page still scroll at 60 fps with a dozen `backdrop-filter` layers over a live
  WebGL canvas? Because the road wrapper is `position: fixed; inset: 0`, `ShaderCanvas`'s
  `IntersectionObserver` pause — its stated battery contract — **can never fire on Today**.
  Stacked backdrop-filters over animating content is the classic mobile-Safari jank pattern.
- Does the horizon land somewhere flattering?

## Feature gaps

- **`'ridden'` mode is unreachable.** `TodayTab` hardcodes `hasRidden: false`, so spec §7's
  post-ride face (the road you actually rode, from the real power stream) does not exist;
  `flat-done` stands in. Shader index 1 and its `roadMode` test assert a branch production
  cannot reach. Wiring it needs stream fetching the Today tab does not currently do.
- **No keyboard or assistive-tech path to the scrub.** The canvas is `aria-hidden`, `RoadReadout`
  is static text with no `aria-live`, and the only affordance is a pointer drag. A keyboard,
  switch, or screen-reader user can read the *first* interval and nothing else — WCAG 2.1.1.
  A `role="slider"` plus arrow-key handling on `RoadHud` would close it.
- **Synthesized steady road renders dead flat.** `roadProfile.ts`'s comment claims the shader's
  fbm grain supplies relief, but that fbm is applied to *colour*, never to height. Spec §6 asked
  for a "gentle rolling road"; a constant-power block draws a straight horizontal line.
- **Glass coverage is incomplete.** The V3 planned-rest card (`TodayTab.tsx`) and
  `BreakthroughCelebration.tsx` still paint solid `--color-paper-2`. The rest card is the hero of
  exactly the state whose landscape is a calm valley, so it reads as an opaque slab over it.

## Correctness / consistency

- **No-CP peak lands exactly on the waterline row.** With CP unknown both `packRoadTexture` and
  `roadSvgPath` fall back to `ref = peak`, so `h` maxes at 0.5 — precisely `HORIZON`, the row that
  means "Critical Power" when CP *is* known. One pixel line, two meanings. It also squashes the
  road into the lower half of the relief band, making a VO₂ session and a recovery ride the same
  shape.
- **Duplicated aura sky, now drifted much further (updated 2026-07-28).** `FRAG_ROAD`
  re-implements `FRAG_AURA`'s sky by hand with a different uv flip, bloom centre and bottom
  falloff. On a blockless flat-mode day the backdrop silently swaps from `readiness-aura.glsl`
  to this drifted copy. Nothing pins them.
  The aura has since been rebuilt as contained emission on a true-dark base (tight core at
  `vec2(0.5,0.42)`, vignette, film grain, falloff to `u_bg`). The road's copy still carries the
  OLD pastel wash — `smoothstep(1.02, 0.0, r)`, a highlight lifted 60 % toward white, and a
  bottom falloff floored at `0.58` so it never reaches `u_bg`. Confirmed present in the shipped
  bundle. Latent only because the road is kill-switched; **re-enabling the road without porting
  the new sky would visibly regress the Today background** to the washed-out version on every
  road day. Port `FRAG_AURA`'s sky into `FRAG_ROAD` (or better: extract one shared `sky()`
  function so they cannot drift a third time) as part of any road revival.
- **Flat-mode terrain presence hangs off an irrelevance.** `hasRoad` gates on
  `samples.length > 0`, but `surfaceAt` discards the profile entirely in flat modes — so a
  planned-rest day shows bare sky or a flat valley depending on whether the plan happens to
  carry a block.
- **Height normalization implemented twice** (`packRoadTexture` and `roadSvgPath`) — GL and SVG
  can drift.
- **Scrub/readout desync after a profile change.** `DashboardShell` resets its `travel` to 0 on
  profile identity change; `TodayRoad`'s internal `travel` has no equivalent reset, so the readout
  jumps to 0:00 while the GL marker stays mid-session.
- **`mmss()` prints `185:00`** for a 3 h ride instead of `3:05:00`.
- **Texture A channel is packed but never sampled**; its packing matches neither its own comment
  nor spec §4. Scrub→block resolution is pure JS.
- **`u_dataW` lookup and upload survive** in `ShaderCanvas` though no shader declares it.
- **`MAX_SECONDS` truncation is client-only.** A >6 h session's road omits the tail, so the
  forward projection and a >6 h backend trace would disagree.
- **SVG fallback draws no rider marker**, so scrub position is invisible there.

## Testing debt

The suite protects the pure functions well and leaves the integration to code review — which is
exactly the split that failed twice during the build (a never-mounted readout, a scrub gesture
that could not receive pointer events).

- **No GL-path coverage at all.** Every `TodayRoad` component test mocks `getContext → null`.
  Texture upload, the `roadRemountKey` contract, `u_travel` reaching the GPU, and whether the
  shader compiles are all unverified by any test. The reduced-motion scrub fix and the
  shader info-log fix both shipped on code reading alone.
- **`DashboardShell.test.tsx` never renders `DashboardShell`** — it exercises `isOnCardOrControl`
  on synthetic fixtures. "The delegated scrub reaches TodayRoad" and "cards stay tappable" remain
  code-review-only.
- **jsdom's accessible-name computation is more lenient than real browsers.** It does not
  implement ARIA's name-prohibited rule, so `getByLabelText` assertions here can pass while a real
  screen reader announces nothing. This already bit once on `RoadReadout`. Treat every a11y
  assertion in this repo as unproven.
- **`isOnCardOrControl` rests on an unenforced invariant**: that every dashboard card paints its
  background via inline `style`, never a Tailwind `bg-*` class. A future card using `bg-*` without
  `data-glass-card` silently becomes scrub-start territory, and because the shell takes pointer
  capture, that card's click would be retargeted to `<main>` and lost.
- Three phase-06.1 PENDING component-test stubs (`CommandPalette`, `SegmentedTabs`, `SideSheet`)
  are excluded in `vite.config.ts`. The jsdom + testing-library infra they were waiting for now
  exists; activating them is unclaimed work.
- Structured-set length is never cross-checked against `duration_s`; violating upstream data would
  yield a road of the wrong length.

## Housekeeping

- `PlanTab.tsx` has write-only state (`const [, setZoneMode]` with an effect that only writes it),
  left by the typecheck-baseline cleanup.
- `touch-action: pan-y pinch-zoom` on all of `<main>` also disables horizontal panning for
  descendants that don't override it; `ContributorsSheet` has `overflow-x-auto` blocks inside main.
- Repo-wide `eslint .` is red at baseline (~128 errors) for `react-refresh/only-export-components`,
  `react-hooks/preserve-manual-memoization` and `react-hooks/set-state-in-effect`. This feature
  added 4, all in those same pre-existing categories, from exporting pure functions for testability.
- The road and aura backdrops position differently — road is `position: fixed` (viewport, doesn't
  scroll), aura is `position: absolute` inside `<main>` (scrolls with content). Switching states
  changes whether the backdrop parallaxes.
