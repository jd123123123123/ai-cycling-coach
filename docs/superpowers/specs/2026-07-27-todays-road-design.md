# Today's Road — design

*2026-07-27. The Today tab's hero becomes a WebGL landscape whose shape is the day's
prescribed session, whose ground level is the athlete's Critical Power, and whose light
is the projected W′-balance. Frontend-only.*

---

## 1. Why

`docs/competitive-analysis-2026-07.md` §3 names five cross-cutting gaps in the market.
This design attacks two of them — "fun grounded in physiology" and "whole-life awareness
at the decision surface" — through a gap none of the research names explicitly:

**No product renders the prescription as terrain.**

- Gentler Streak's Activity Path (Apple Design Award) draws the *past* as a landscape,
  and it is HR-fuzzy.
- Zwift and FulGaz render terrain, but only the road's, and only while pedalling.
- Every engine (TrainerRoad, Xert, JOIN, Athletica) renders the workout as a bar chart
  of blocks that athletes demonstrably skim.
- Wellness apps structurally cannot do this: it requires power.

**And W′ — cycling's one genuinely unique physiological currency — is invisible before
the ride.** `wbal_trace.py` exists but is retrospective: it traces the most-depleting
*completed* ride. Nothing tells an athlete how today's session will spend their matches.

## 2. The organizing concept: the CP waterline

> Ground level is Critical Power. Everything above CP is a climb that burns W′.
> Everything below is a descent that refills it.

This is not decoration and not a metaphor — it is the W′-balance differential model
rendered as gravity. A 5×4' @ 320 W session becomes five real climbs with valleys
between them, and the valleys are visibly where the matches come back.

The concept is what makes the terrain informative rather than a prettier bar chart. If
CP is unknown, the waterline must not be drawn (see §6).

## 3. Scope

**Frontend-only. No backend work.** Verified against the codebase:

- `ResolvedBlock` (`frontend/src/api/coach.ts:23`) already carries `duration_s`,
  `target_watts_low/high`, `target_pct_ftp`, `zone`, `rpe`, and the structured-set
  on/off fields.
- `cp_watts` and `w_prime_j` already reach the client via the power-profile /
  debrief payloads (`frontend/src/hooks/usePowerProfile.ts`,
  `frontend/src/api/debrief.ts:57`).

The W′-balance projection is therefore a pure client-side function over data the Today
tab already fetches. No new endpoint, no new model, no migration.

## 4. Architecture

One WebGL context, one RAF loop, behind the whole page:

```
TodayTab
 └ <TodayRoad>            fixed fullscreen canvas, z-0
    ├ sky pass            existing readiness-aura shader (state-keyed u_aura)
    ├ terrain pass        heightfield sampled from a 1D data texture
    └ rider + W′ light    glow at u_travel, dimmed by projected W′bal
 └ cards                  z-1, translucent glass over the GL layer
```

Whole-page treatment (the road reads through the entire Today tab, not just the hero),
but the cost stays bounded to a single context and a single loop. Separate canvases per
card were rejected: N GL contexts on a phone is a battery and context-limit problem.

### Why raw WebGL 1, not three.js / OGL / WebGPU

The effect is a fullscreen fragment shader over a single triangle. A scene graph would
add roughly 150 KB gzipped that nothing in this design uses. `ShaderCanvas.tsx` already
implements the reduced-motion freeze, `IntersectionObserver` pause, and DPR cap that
this needs. WebGPU is not worth a second code path in 2026-07 for one surface.

### Data transport

The road uploads as a **1D data texture** (RGBA, one texel per sample, width ≤ 512):

| channel | meaning |
|---|---|
| R | `watts / cp` — normalized height; 1.0 is the waterline |
| G | `zone / 7` — terrain tint |
| B | `wbal / wPrime` — remaining matches at this point, 0..1 |
| A | `blockIndex / blockCount` — for scrub → block mapping |

The shader performs **no physiology**. It draws what the texture says. All physics lives
in the pure module (§5), which is where it can be tested.

## 5. Modules

Each unit has one purpose and a defined interface.

### `frontend/src/utils/roadProfile.ts` — pure, no React

```ts
export interface RoadSample { t: number; watts: number; zone: number; wbal: number; blockIndex: number }
export interface RoadProfile {
  samples: RoadSample[]
  cp: number | null
  wPrime: number | null
  /** Lowest wbal reached across the session, null when cp/wPrime unknown. */
  minWbal: number | null
  totalDurationS: number
}

export function buildRoadProfile(
  blocks: ResolvedBlock[],
  power: { cp: number | null; wPrime: number | null },
): RoadProfile
```

Responsibilities:

- Expand structured sets. A `30×15/45s` block is one `ResolvedBlock` but physically 30
  reps of `on_s` at `target_watts_*` alternating with `off_s` at `off_watts_*`. Each rep
  becomes real terrain spikes — this is the case where the road is dramatically more
  legible than a block list.
- Resample to ≤ 512 evenly-spaced samples, always preserving the global W′bal minimum
  (same rule `wbal_trace.downsample` already applies: the deepest point is the headline
  and must never be smoothed away).
- Integrate W′-balance forward with the differential model, mirroring
  `backend/app/services/w_balance.py` so the projection and the post-ride trace agree.
- When `cp` or `wPrime` is null: still emit samples with `watts` and `zone`, set `wbal`
  to null-equivalent and `minWbal` to null. Never substitute a default CP.

Depends on: the `ResolvedBlock` type only. Testable with plain arrays.

### `frontend/src/components/dashboard/today/TodayRoad.tsx`

Owns the GL layer, the data-texture upload, and scrub gestures. Consumes a `RoadProfile`
and a `FlagshipState`; emits scrub position via callback. Contains no physiology and no
block parsing.

### `frontend/src/components/dashboard/today/RoadReadout.tsx`

DOM, not GL. Renders the interval at the current scrub position: duration, watt range,
zone, RPE, and remaining matches. Accessible text — this is what a screen reader gets,
since the canvas is `aria-hidden`.

### `frontend/src/shaders/todays-road.glsl`

Design-provenance source, matching the existing `readiness-aura.glsl` convention: the
runtime copy lives inline in the canvas component because the app compiles shaders from
strings. Any divergence between the two is documented in the file header.

## 6. Data honesty

Follows the established rule: honest "—" wherever the data is absent, never a fabricated
value.

| Condition | Behaviour |
|---|---|
| CP and W′ known | Waterline drawn, matches readout live |
| CP or W′ unknown | Terrain still renders from relative watts. **No waterline, no matches readout, no battery.** Readout shows "—" for matches. |
| No `interval_structure` but a planned duration and target exists | Gentle rolling road derived from duration + target watts, no invented intervals |
| No plan at all | Bare horizon, honest copy, no road |

## 7. The six faces

Derived from the existing `flagshipState()` in `TodayTab.tsx` — no new state machine.

| State | Landscape |
|---|---|
| `ready` | Prescribed terrain, green sky |
| `controlled` | Prescribed terrain, amber sky |
| `rest` | Flat road, low sun, road ahead unlit — the terrain deliberately *not* being ridden |
| `planned-rest` | Calm flat valley, blue sky, no waterline |
| `post` | The road actually ridden, from the real power stream when available; flat "done" landscape when not |
| `pending` | Bare horizon, grey, honest "readiness not in yet" copy |

Sky colours come from the existing `flagshipColors()`. No new palette.

## 8. Degradation and performance

- `prefers-reduced-motion` → time uniform freezes at a pleasant phase (existing
  `ShaderCanvas` contract, WCAG 2.3.3). The road stays scrubbable; only ambient drift stops.
- **No WebGL** → static SVG elevation profile. Still shows the terrain, the waterline,
  and stays scrubbable. The information survives; only the atmosphere is lost.
- Offscreen → RAF paused via `IntersectionObserver` (existing contract).
- `devicePixelRatio` capped at 1.5 for the terrain pass (the aura pass keeps its cap of 2).
- Scrub updates the readout through a ref + rAF coalesce, not React state per pointer
  event.

Target viewport is 390×844. Desktop is a sanity check only.

## 9. Testing

- `roadProfile.test.ts` — pure-function coverage: structured-set expansion, resampling
  preserves the W′bal minimum, null-CP path emits no wbal, W′bal recovery in
  sub-CP valleys, empty-blocks path.
- `flagshipState` / `flagshipColors` already have coverage; extend for the road's
  terrain-mode mapping.
- Component test: `TodayRoad` renders the SVG fallback when `getContext('webgl')`
  returns null.
- Verification is via `tsc`, `vitest`, `lint`, and build — not a browser.

## 10. Explicitly out of scope

- Any backend change. If forward W′bal later needs server-side persistence, that is a
  separate spec.
- 3D route/GPS terrain. The road is the *workout*, not a map.
- Applying the treatment to tabs other than Today.
- three.js, OGL, or a WebGPU code path.
