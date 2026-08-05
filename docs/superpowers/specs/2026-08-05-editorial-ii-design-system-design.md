# EDITORIAL II — a second design system, switchable at runtime

**Date:** 2026-08-05
**Source of truth:** `~/Downloads/pencil-new.pen`, frames prefixed `Flagship · … · EDITORIAL II`
**Status:** approved design, ready for planning

## Goal

Build a complete second design system as a 1:1 transcription of the pen's EDITORIAL II
flagship screens, mounted alongside the existing app so either can be used at any moment.
No existing page, component, hook, or endpoint is deleted or modified.

## Scope

**In:** Today (five day-states), Session Detail, both bottom sheets, the EDITORIAL II
token set, the shared component library, the day-state machine, and the data adapters
that feed every value the pen displays.

**Out:** the Train / Recovery / History / Social tabs. The TabBar is built 1:1 and is
visually complete, but those four destinations render an honest "not in this design
system yet" plate. They are not designed in the pen and will not be invented here.

## Source frames

| Pen node | Name | Height |
|---|---|---|
| `RYP0r` | Flagship · Rest · EDITORIAL II | 2142 |
| `x4AxA5` | Flagship · Training · EDITORIAL II | 2581 |
| `LdBJ4` | Flagship · Trained · EDITORIAL II | 2977 |
| `h54Rs` | Flagship · Resting · EDITORIAL II | 1604 |
| `KYS6e` | Flagship · Evening · EDITORIAL II | 2564 |
| `J5FV6` | Flagship · Session Detail · EDITORIAL II | 2670 |
| `mBvke` | Flagship · Switch Day Type · EDITORIAL II | 844 |
| `tEnIQ` | Flagship · Back To Session Done · EDITORIAL II | 844 |
| `DbOfI` | ◆ SYSTEM · Rest Editorial (component library) | — |

Shared pen components: `vrvl9` StatusBar, `G6TmH` TabBar, `uKzuZ` DayRail,
`rYYq3` SecHead V5, `kdOT0` NavHeader.

All frames are 390 wide. Mobile is the only target; desktop is a sanity check only.

## Transcription method

1:1 means transcribed, not approximated. For each frame, before writing its component:

1. `Get(<frameId>, {depth: N, resolveInstances: true, resolveVariables: false})` to read
   the real node tree — padding, gap, font size, weight, letter spacing, fill, corner
   radius, stroke, effect.
2. Write the React component from that tree, mapping pen properties to CSS directly
   (`padding` → padding, `gap` → gap, `fill` → color/background, `$e-acid` → `var(--e-acid)`).
3. Render at 390×844 and compare against `get_screenshot` of the same node.

Do not eyeball a card spec from a screenshot. The pen tree is the specification.

## Architecture

```
frontend/src/editorial/
  tokens.css               EDITORIAL II custom properties
  EditorialRoot.tsx        shell: scroll container, sheet portal, safe areas
  state/
    dayState.ts            DayState type, derive(), override storage
    useDayState.ts         hook: derived | overridden, plus dev picker
  data/
    useTodayModel.ts       one view-model per day-state, from shared hooks
    useSessionModel.ts     Session Detail view-model
    value.ts               Value<T> — the honest-dash primitive
  components/
    StatusBar.tsx  DayRail.tsx  SecHead.tsx  MetricTrack.tsx  Bars.tsx
    Verdict.tsx  InsightStrip.tsx  WeekRail.tsx  TomorrowBand.tsx
    TabBar.tsx  Sheet.tsx  Ledger.tsx  ZoneRows.tsx  PeakRows.tsx
    RangeRow.tsx  StatTile.tsx  PMCChart.tsx  DayMark.tsx
  pages/
    TodayPage.tsx          hero + rail + strip + sections per state
    SessionDetailPage.tsx
    NotInThisSystem.tsx     honest plate for the four undesigned tabs
```

Routes, added to `App.tsx` without touching any existing route:

- `/e/today` → `TodayPage`
- `/e/session/:id` → `SessionDetailPage`

Both are wrapped in the existing `ProtectedRoute checkOnboarding`.

The switch is a persisted preference, `localStorage["designSystem"] = "v4" | "editorial2"`,
read at the root redirect so `/` lands on `/dashboard` or `/e/today`. A `?ds=editorial2`
query parameter sets it, so either system is reachable in one URL without digging
through settings.

`api/` and `hooks/` are shared and read-only from this tree. `editorial/` imports from
them; nothing in the existing app imports from `editorial/`. That one-way dependency is
what makes the system deletable and keeps the old app provably unaffected.

## Tokens

Verbatim from the pen document's variables.

```
--e-bg     #08090C      page ground
--e-ink    #FFFFFF      primary type
--e-mid    #8A9099      secondary type
--e-lo     #4A5058      tertiary type
--e-quiet  #767D87      captions
--e-acid   #C8FF00      the one accent
--e-rule   #FFFFFF1F    hairlines
--e-glass  #FFFFFF0F    the rare fill
--e-cool   #6B8CFF      informational
--e-warn   #FF9F1C      caution
--e-bad    #FF4D4D      alarm
```

Day-state accents, one per Today state:

```
--st-rest #C8FF00   --st-training #2BE68F   --st-trained #FF5E00
--st-resting #00E5FF   --st-evening #7B5CFF
```

Metric hues, used only on their own metric:

```
--m-hrv #00E5FF   --m-sleep #ED29FF   --m-cardiac #FF47B2
--m-load #FF5E00  --m-form #A8D400    --m-fatigue #7099EB
```

Depth ramp `--d-1 #FFFFFF14` through `--d-4`. Status ramp `--s-good #2BE68F`,
`--s-mid #FFB020`, `--s-low #FF4356`. Type: Sora for display numerals and statements,
Inter for body and labels.

These are scoped under `.editorial-root` so they cannot leak into the existing app.

## Day-state machine

`DayState = 'rest' | 'training' | 'trained' | 'resting' | 'evening'`

Derivation, evaluated in order:

| # | Condition | State |
|---|---|---|
| 1 | local time ≥ 21:00 | `evening` |
| 2 | a cycling activity was recorded today | `trained` |
| 3 | a session is planned for today and not completed | `training` |
| 4 | local time ≥ 11:00 | `resting` |
| 5 | otherwise | `rest` |

Rule 4 carried a "no session planned" guard in the first draft. It is redundant
and, read literally, wrong: rules 2 and 3 have already returned for a ridden
session and for a pending one, so anything reaching rule 4 has nothing left on
today's menu — including a session marked complete without a recorded ride.
That day reads Resting, not Rest. Ruled 2026-08-05.

The 21:00 threshold is taken from the pen's own clocks: the Trained frame reads 19:24
and the Evening frame reads 21:40, so a completed ride still shows Trained through the
evening and only hands over to the wind-down screen late. Evening subsumes Trained —
its `01 Today` section carries the ride.

A user override, set by the pen's two bottom sheets, wins over derivation and is stored
per ISO date so it expires naturally at midnight. The sheets are the real override
mechanism, exactly as designed: "Switch Day Type" swaps Rest ⇄ Training, "Back To Session
Done" returns Resting → Trained. A dev-only picker (behind the same flag as `/design-lab`)
previews all five without changing stored state.

## Screen structure

Every Today state shares this spine, in order:

```
StatusBar → Hero → Insight Strip → numbered sections → Tomorrow Band → TabBar
```

Pen-verified 2026-08-05: the Day Rail is nested inside the Hero rather than being
its sibling, and Resting carries no Insight Strip. Each frame also paints its own
ground, tinted toward its state accent — the neutral `--e-bg` is used by none of
them (`--g-rest #0A0B05`, `--g-training #05100A`, `--g-trained #120B05`,
`--g-resting #051012`, `--g-evening #0A0816`).

The Hero varies by state but always runs: Meta row (date · streak) → statement or
session name → the big numeral → metric track with delta → context (bars, conditions,
climb, or week rail) → verdict prose → Day Mark.

Sections per state:

| State | 01 | 02 | 03 |
|---|---|---|---|
| Rest | Why | Absorbing | Trajectory |
| Training | Recovery | The Session | Trajectory |
| Trained | The Session | The Cost | Trajectory |
| Resting | Right Now | Trajectory | — |
| Evening | Today | Tonight | Tomorrow |

Session Detail runs: Nav → Hero (numeral, claim, stats, profile) → 01 The Blocks →
02 How To Ride It → Quote Plate → 03 The Payoff → 04 Where To Ride It → CTA rules.

## Data map

Every value the pen displays, and where it comes from. All hooks and endpoints already
exist; none are modified.

### Backed today

| Pen element | Source |
|---|---|
| Date meta "WED 22 JUL" | local date |
| Streak "12 DAYS" | `useStreak` |
| Readiness numeral, ▲ vs yesterday | `daily_metrics.training_readiness`, prior day |
| HRV value, unit, delta, range band | `daily_metrics.hrv_overnight_avg`; 30-day range from `useDailyMetrics` |
| Resting HR, delta, range band | `daily_metrics.resting_hr`, same range basis |
| Sleep total, delta, range band | `daily_metrics.sleep_total_s` |
| Sleep composition deep/REM/light/awake | `sleep_deep_s`, `sleep_rem_s`, `sleep_light_s`, `sleep_awake_s` |
| Fitness / Fatigue / Form tiles and 42-day chart | `usePMC` |
| Absorption band, "clear Thu 17:30", hours run/remaining | `daily_metrics.recovery_time_hours` + `useRecoveryEta` |
| Session target watts, work, IF, TSS, block bars | `usePlannedWorkouts` + `useTodaySession` |
| Verdict prose, "What this changes" | `useCoachBrief` (`/coach/brief`, `/coach/why`) |
| Ridden distance, kJ, avg HR, NP, duration | `Activity` columns |
| Peak power rows and "% of season best" | `usePowerProfile` (`mmp_curve`, `peaks`) |
| Conditions temperature and wind | `useTodayWeather` |
| Route name, "ridden 9×", ramps, distance, ascent | `/routes` + `rehearsal/route_history` |
| Tomorrow Band session and unlock time | `usePlannedWorkouts` (next day) |

### To verify during build

These have a plausible source that must be confirmed against real data before the
section is written. If the source does not deliver, the section renders honest dashes.

- Per-block plan-vs-ridden deltas (the +1 / −1 / −2 / +3 row) — `useStreamAnalysis` splits
- Time-in-HR-zone breakdown with bpm bounds — `useStreamAnalysis` + `useTrainingZones`
- Evening's hourly energy-out curve — `useIntradayDay`
- Sunset time for Session Detail conditions — weather service

### Missing-data rule

The frame always stays. A value with no reading renders `—` in its designed slot, and
the section carries one quiet line saying why, in the calm register already established
for health signals:

```
HRV
ABOVE RANGE                    —  ms

No wearable reading since Tue.
```

Sections are never hidden and never silently filled with plausible numbers. This is
enforced by a single `Value<T>` primitive — `{ value: T } | { missing: string }` — that
every adapter returns and every display component knows how to render. A component that
receives a raw number instead of a `Value` is a bug, not a shortcut.

The existing `utils/readinessGate.ts` rule still applies: a stale wearable reading
withholds the verdict and dates the measurement rather than asserting a number.

## One deliberate departure from the pen

Session Detail's primary CTA reads "SEND WORKOUT TO GARMIN" with the sub-line
"Structured intervals and route to your Edge". There is no Garmin push path in this
backend — the app exports. The button keeps the pen's exact geometry, type, and rule
structure, but its label and sub-line state what actually happens. This matches the
resolution already reached for the V4 route rehearsal page. Everything else is
transcribed as designed.

## Build order

Deliberately front-loads the hardest screen so the shared component set is proven early,
and defers the most data-hungry one.

1. Tokens, `EditorialRoot`, StatusBar, TabBar, DayRail, SecHead, the `Value` primitive,
   and the route/switch wiring. Ends with an empty but correctly framed `/e/today`.
2. **Trained** (2977px, five sub-sections) — the widest component test: Big Four tiles,
   plan-vs-ridden, peak power rows, HR zones, "What It Changes", the Cost band, the
   Trajectory chart.
3. **Rest** and **Training** — mostly reuse, adds sleep composition, absorption band,
   session preview bars, conditions.
4. **Resting** — smallest, adds the live rings and the wake-to-now track.
5. **Session Detail** — blocks table, rules, payoff chart, route section, CTA.
6. Both bottom sheets and the day-state override storage.
7. **Evening** — energy curve, ledger, sleep target. Built last because it is the most
   likely to render dashes, and that should be a known outcome rather than a surprise.

## Verification

Per project rules: no Playwright. Each screen is gated by `tsc -b`, the production
build, vitest, and lint. Visual verification is a single rendered frame at 390×844
compared against `get_screenshot` of the corresponding pen node — one render per screen
before building on it, not a browser session per change.

The old app is verified untouched by confirming `editorial/` has no inbound imports and
that no file outside `editorial/` changed except `App.tsx` (route registration) and the
root redirect.
