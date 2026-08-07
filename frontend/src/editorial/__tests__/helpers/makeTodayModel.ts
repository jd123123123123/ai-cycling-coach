// frontend/src/editorial/__tests__/helpers/makeTodayModel.ts
/**
 * A `TodayModel` fixture parameterised by `state`/`readinessScore`, for
 * tests that need to render `TodayView` across all five day states without
 * hand-rolling a full model each time. Built by copying the 'trained'
 * fixture that already lives in `visualHarness.test.tsx` (the most complete
 * of the five) and folding in the fields the other four states' fixtures
 * additionally carry (`week`, `energyOut`, `bodyBattery`) so every state
 * renders cleanly regardless of which one is requested — same `as
 * TodayModel` assertion the harness fixtures already rely on to skip fields
 * a given state's own render path never reads.
 *
 * Carries the two fields Task 5 added to `TodayModel`
 * (`readiness90DaySeries`, `missedYesterday`) — the harness fixtures predate
 * that task and needed the same two fields backfilled (see this directory's
 * sibling `visualHarness.test.tsx`).
 *
 * Also carries `weekLoad`/`phaseContext` (Task 2's week-load budget and
 * phase-context line) as honest `Value`s — Task 9's `KetteStrip` reads
 * `weekLoad` directly off the model, and this fixture previously omitted
 * both fields entirely behind the `as TodayModel` cast below, which made
 * `weekLoad` `undefined` for any test mounting `TodayView` through this
 * helper. Given real present values here, not a second cast or a
 * neutralised default — a plan that "exists" with a real spent/planned pair
 * is what most fixture callers actually want, and a test that specifically
 * needs the missing arm still overrides it per-call.
 */
import { present, missing } from '../../data/value'
import type { PmcPoint, TodayModel } from '../../data/useTodayModel'
import type { DayState } from '../../state/dayState'

function buildPmcSeries(days: number): PmcPoint[] {
  const out: PmcPoint[] = []
  for (let i = 0; i < days; i++) {
    const t = i / (days - 1)
    out.push({
      date: `2026-06-${String((i % 28) + 1).padStart(2, '0')}`,
      ctl: 44 + t * 24 + Math.sin(i / 3) * 1.5,
      atl: 40 + t * 30 + Math.sin(i / 2) * 3,
      tsb: (44 + t * 24) - (40 + t * 30),
    })
  }
  return out
}

// Ninety readings, spread across a wide but plausible readiness range —
// enough for `cogIndexFromReadiness` to take its percentile branch
// (`MIN_SERIES_FOR_PERCENTILE`, 14) rather than its coarse decile fallback.
const READINESS_90_DAY_SERIES = Array.from({ length: 90 }, (_, i) => 40 + ((i * 7) % 55))

export function makeTodayModel(overrides: {
  state: DayState
  readinessScore?: number
  /** When set, `readiness` is the missing arm carrying this exact reason
   *  instead of a present score — for tests exercising the "reason must
   *  appear somewhere on screen, exactly once or twice" contract. */
  readinessMissingReason?: string
}): TodayModel {
  const score = overrides.readinessScore ?? 74
  return {
    state: overrides.state,
    dateLabel: present('MI 22 JUL'),
    streakDays: present(13),
    readiness: overrides.readinessMissingReason != null
      ? missing(overrides.readinessMissingReason)
      : present({ score, deltaVsYesterday: 8 }),
    readinessGate: 'fresh',
    readinessGateHeadline: null,
    readiness90DayBest: present(Math.max(...READINESS_90_DAY_SERIES)),
    readiness90DaySeries: present(READINESS_90_DAY_SERIES),
    missedYesterday: missing('Gestern war kein Fahrtag geplant.'),
    bodyBattery90DayHigh: present(97),
    hrv: present({ value: 68, unit: 'ms', delta: 4, band: { low: 52, high: 74, position: 'above' } }),
    restingHr: present({ value: 46, unit: 'bpm', delta: -2, band: { low: 44, high: 55, position: 'in' } }),
    recentRestingHr: present([
      { date: '2026-07-17', bpm: 49 }, { date: '2026-07-18', bpm: 48 },
      { date: '2026-07-19', bpm: 51 }, { date: '2026-07-20', bpm: 47 },
      { date: '2026-07-21', bpm: 48 }, { date: '2026-07-22', bpm: 46 },
      { date: '2026-07-23', bpm: 46 },
    ]),
    sleep: present({ totalS: 27000, deepS: 4800, remS: 5400, lightS: 15600, awakeS: 1200 }),
    pmc: present({ fitness: 68, fatigue: 58, form: -2, series: buildPmcSeries(42) }),
    recovery: present({ hoursRemaining: 26, clearAtLabel: 'Fr 09:00' }),
    bodyBattery: present({ wake: 88, now: 91 }),
    session: present({
      title: 'Threshold', targetWatts: 285, workKj: null, intensityFactor: 0.91, tss: 98,
      blocks: [
        { label: 'Warm-up', minutes: 12, watts: 180 },
        { label: 'Block 1', minutes: 12, watts: 285 },
        { label: 'Cool-down', minutes: 10, watts: 120 },
      ],
    }),
    ride: present({ activityId: 1, distanceM: 52400, kj: 1148, avgHr: 151, np: 296, durationS: 6420 }),
    zones: present([
      { name: 'Z1', lowBpm: 0, highBpm: 124, seconds: 1320 },
      { name: 'Z2', lowBpm: 124, highBpm: 141, seconds: 1440 },
      { name: 'Z3', lowBpm: 142, highBpm: 152, seconds: 1080 },
      { name: 'Z4', lowBpm: 153, highBpm: 163, seconds: 2340 },
      { name: 'Z5', lowBpm: 164, highBpm: Infinity, seconds: 240 },
    ]),
    peaks: present([
      { duration: '5s', watts: 812, percentOfSeasonBest: null },
      { duration: '1min', watts: 468, percentOfSeasonBest: null },
      { duration: '5min', watts: 328, percentOfSeasonBest: null },
      { duration: '12min', watts: 288, percentOfSeasonBest: null },
    ]),
    planVsRidden: missing('This ride was not matched to its plan.'),
    verdict: present({
      headline: 'Die Arbeit ist auf dem Konto.',
      body: 'Sauber eingefahren. Alles ab hier ist Absorption.',
    }),
    whatThisChanges: present({
      onYou: { claim: 'Deine 12-Minuten-Decke steigt auf 288 W', detail: 'Schwellenreferenz aktualisiert.' },
      onThePlan: { claim: 'Donnerstags VO2-Ziele steigen um 10 W', detail: 'Morgen bleibt locker.' },
    }),
    conditions: present({ tempC: 19, windKmh: 12, windFrom: null }),
    tomorrow: present({ title: 'Lockere Runde', detail: 'Fünfundvierzig Minuten, locker.', unlockLabel: present('05:00') }),
    week: [
      { letter: 'M', tss: present(64) }, { letter: 'D', tss: present(48) }, { letter: 'M', tss: present(12) },
      { letter: 'D', tss: missing('Keine Fahrt erfasst.') }, { letter: 'F', tss: present(24) },
      { letter: 'S', tss: present(68) }, { letter: 'S', tss: present(44) },
    ],
    energyOut: missing('Kein stündlicher Energieverbrauch für heute verfügbar.'),
    weekLoad: present({ spent: 256, planned: 340 }),
    phaseContext: present({ phase: 'Build', daysToEvent: 21, eventType: 'road_race' }),
    isLoading: false,
  } as TodayModel
}
