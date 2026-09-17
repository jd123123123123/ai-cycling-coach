import { describe, expect, it } from 'vitest'
import { buildTodayModel, compassPoint, type TodayModelInputs } from '../data/useTodayModel'
import { isPresent } from '../data/value'
import type { WeekResponse } from '../../api/weeks'
import type { DailyMetric } from '../../api/dashboard'

const base = (over: Partial<TodayModelInputs> = {}): TodayModelInputs => ({
  now: new Date(2026, 6, 22, 9, 0),
  state: 'rest',
  snapshot: { body_battery: { wake: null, now: null, now_at: null }, stress: { wake: null, now: null, now_at: null },
    hrv_overnight_avg: 68, training_readiness: 74, recovery_time_hours: 11,
    generated_at: '2026-07-22T06:00:00', cached: false },
  yesterdayMetric: null, todayMetric: null, streak: null, pmc: null, recoveryEta: null,
  session: null, brief: undefined, weather: null, activitiesToday: [], health: null,
  tomorrowWorkout: null, isLoading: false,
  ...over,
})

// ---- Thin local helpers for the reward-layer fields (Task 5) --------------
const buildModel = (over: Partial<TodayModelInputs> = {}) => buildTodayModel(base(over))

const emptyMetric: DailyMetric = {
  id: 0, user_id: 0, date: null, recorded_at: '', sleep_score: null, hrv_status: null,
  body_battery: null, resting_hr: null, stress_level: null, steps: null, weight_kg: null,
  source: null, sleep_detail: null, vo2max: null, training_readiness: null, recovery_time_hours: null,
}

const emptyWeekPlan: WeekResponse = {
  week_start: '2026-07-20', week_end: '2026-07-26', language: 'simple', preface: '',
  meso_block: {
    phase: 'Grundlage 1', block_position: 'accumulation', block_index_in_meso: 0,
    weekly_tss_target: 0, days_to_event: null, target_event_type: null, hours_note: null,
    progression: null,
  },
  projection: null, readiness: null, plan_changes: null, days: [],
  planned_tss_total: null, missed_yesterday: null,
}

describe('buildTodayModel', () => {
  it('formats the date meta in German by default — EDITORIAL II ships in German', () => {
    const m = buildTodayModel(base())
    // de-DE's own short weekday/month via Intl, not a hand-written array —
    // "MI 22 JULI" (Node's ICU has no 3-letter German month abbreviation
    // for July; "Juli" already IS the short form).
    expect(m.dateLabel).toEqual({ value: 'MI 22 JULI' })
  })

  it('formats the date meta in English when locale is explicitly en', () => {
    const m = buildTodayModel(base({ locale: 'en' }))
    expect(m.dateLabel).toEqual({ value: 'WED 22 JUL' })
  })

  it('carries readiness and its delta against yesterday', () => {
    const m = buildTodayModel(base({
      yesterdayMetric: { training_readiness: 66 } as never,
    }))
    expect(m.readiness).toEqual({ value: { score: 74, deltaVsYesterday: 8 } })
  })

  it('reports a null delta when yesterday has no reading — not zero', () => {
    const m = buildTodayModel(base())
    expect(isPresent(m.readiness) && m.readiness.value.deltaVsYesterday).toBeNull()
  })

  it('marks HRV missing with a dated reason when the snapshot has none', () => {
    const m = buildTodayModel(base({
      snapshot: { ...base().snapshot!, hrv_overnight_avg: null },
    }))
    expect(isPresent(m.hrv)).toBe(false)
    expect(m.hrv).toHaveProperty('missing')
  })

  it('reads sleep stages from sleep_detail, not from flat columns', () => {
    const m = buildTodayModel(base({
      todayMetric: { sleep_detail: { total_s: 27000, deep_s: 4800, rem_s: 5400, light_s: 15600, awake_s: 1200 } } as never,
    }))
    expect(isPresent(m.sleep) && m.sleep.value.deepS).toBe(4800)
  })

  it('never invents a session when none is planned', () => {
    expect(isPresent(buildTodayModel(base()).session)).toBe(false)
  })

  it('marks whatThisChanges missing when the brief has neither adaptations nor a post-ride review', () => {
    const m = buildTodayModel(base({
      brief: { adaptations: null, post_ride_review: null } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(false)
    expect(m.whatThisChanges).toEqual({ missing: 'Der Coach hat sich zu dieser Fahrt noch nicht geäußert.' })
  })

  it('splits whatThisChanges into the ON YOU and ON THE PLAN claims from real fields', () => {
    const m = buildTodayModel(base({
      brief: {
        adaptations: { summary: 'Thursday VO2 targets rise 10 W', changes: [] },
        post_ride_review: { physiological_read: 'Threshold moves to 288 W', goal_trajectory: 'trending up', next_session_nudge: 'Tomorrow stays easy.' },
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(true)
    if (isPresent(m.whatThisChanges)) {
      expect(m.whatThisChanges.value.onYou.claim).toBe('Threshold moves to 288 W')
      expect(m.whatThisChanges.value.onThePlan.claim).toBe('Thursday VO2 targets rise 10 W')
    }
  })

  // ---- Real-data audit (2026-08-06): the readiness gate -------------------
  // `utils/readinessGate.ts` imported, not reimplemented — see that
  // module's own doc comment for why 'pending' and 'stale' need different
  // copy and why `trainedToday`/`sidelined` must suppress the gate.
  describe('readiness gate', () => {
    it('withholds a stale reading (3+ days) with a dated headline and detail, even when the snapshot still carries a number', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0), // Wed 22 Jul
        snapshot: { ...base().snapshot!, training_readiness: 74 },
        recentMetrics: [{ date: '2026-07-19', hrv_status: 65 } as never], // 3 days ago
      }))
      expect(m.readinessGate).toBe('stale')
      expect(m.readinessGateHeadline).toBe('Seit 3 Tagen keine Nacht-Werte')
      expect(isPresent(m.readiness)).toBe(false)
      expect(m.readiness).toEqual({ missing: 'Letzte Messung 19. Juli. Der Trainingsplan gilt trotzdem.' })
    })

    it('withholds a pending reading (within 2 days) with calm copy, no day named', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        snapshot: { ...base().snapshot!, training_readiness: 74 },
        recentMetrics: [{ date: '2026-07-21', hrv_status: 65 } as never], // yesterday
      }))
      expect(m.readinessGate).toBe('pending')
      expect(m.readinessGateHeadline).toBe('Nacht-Werte stehen noch aus')
      expect(isPresent(m.readiness)).toBe(false)
      expect(m.readiness).toEqual({
        missing: 'Deine Bereitschaft erscheint, sobald die Uhr die Nacht hochgeladen hat. Der Plan unten steht schon.',
      })
    })

    it('pending and stale produce genuinely different copy', () => {
      const stale = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        recentMetrics: [{ date: '2026-07-19', hrv_status: 65 } as never],
      }))
      const pending = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        recentMetrics: [{ date: '2026-07-21', hrv_status: 65 } as never],
      }))
      expect(stale.readinessGateHeadline).not.toBe(pending.readinessGateHeadline)
      expect((stale.readiness as { missing: string }).missing).not.toBe((pending.readiness as { missing: string }).missing)
    })

    it('trainedToday (a ride logged today) suppresses the gate — the ride is fresher evidence', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        snapshot: { ...base().snapshot!, training_readiness: 74 },
        recentMetrics: [{ date: '2026-07-19', hrv_status: 65 } as never], // would otherwise be stale
        activitiesToday: [{ id: 1, sport: 'cycling' } as never],
      }))
      expect(m.readinessGate).toBe('stale') // the freshness verdict itself is unchanged...
      expect(isPresent(m.readiness)).toBe(true) // ...but the withhold is suppressed
      if (isPresent(m.readiness)) expect(m.readiness.value.score).toBe(74)
    })

    it('sidelined (self-reported illness/injury) suppresses the gate', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        snapshot: { ...base().snapshot!, training_readiness: 74 },
        recentMetrics: [{ date: '2026-07-19', hrv_status: 65 } as never],
        session: { sidelined: true } as never,
      }))
      expect(isPresent(m.readiness)).toBe(true)
    })

    it('gate is "fresh" and readiness is present when today has its own overnight record', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        snapshot: { ...base().snapshot!, training_readiness: 74 },
        recentMetrics: [{ date: '2026-07-22', hrv_status: 65 } as never], // today
      }))
      expect(m.readinessGate).toBe('fresh')
      expect(m.readinessGateHeadline).toBeNull()
      expect(isPresent(m.readiness)).toBe(true)
    })

    it('gate is "none" (no wearable, ever) rather than withholding with sync-style copy', () => {
      const m = buildTodayModel(base({
        now: new Date(2026, 6, 22, 9, 0),
        snapshot: { ...base().snapshot!, training_readiness: null },
        recentMetrics: [],
      }))
      expect(m.readinessGate).toBe('none')
      expect(m.readinessGateHeadline).toBeNull()
      expect(isPresent(m.readiness)).toBe(false)
      expect(m.readiness).toEqual({ missing: 'Noch keine Bereitschaftsmessung.' })
    })
  })

  // ---- Real-data audit (2026-08-06): whatThisChanges never duplicates -----
  // the same sentence under both ON YOU and ON THE PLAN. Reproduces the real
  // account's exact state: a brief with `adaptations` but an empty
  // `changes` array and no post-ride review yet (today's plan hasn't been
  // ridden) — the old fallback let `onYou` silently borrow `onThePlan`'s own
  // `adaptations.summary`, printing the identical sentence under both
  // labels.
  it('whatThisChanges never duplicates the plan summary under ON YOU when there is nothing distinct to say about the athlete yet', () => {
    const m = buildTodayModel(base({
      brief: {
        adaptations: { summary: 'Signals steady since yesterday — the plan follows the periodized build.', changes: [] },
        post_ride_review: null,
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(false)
  })

  it('whatThisChanges DOES populate ON YOU from a real per-signal change, distinct from the plan summary', () => {
    const m = buildTodayModel(base({
      brief: {
        adaptations: {
          summary: 'Signals steady since yesterday — the plan follows the periodized build.',
          changes: [{ signal: 'hrv', direction: 'down', detail: 'HRV dipped 6% this week.', action: 'Ease tomorrow.', principle: 'Absorb before adding.', severity: 'ease' }],
        },
        post_ride_review: null,
      } as never,
    }))
    expect(isPresent(m.whatThisChanges)).toBe(true)
    if (isPresent(m.whatThisChanges)) {
      expect(m.whatThisChanges.value.onYou.claim).toBe('HRV dipped 6% this week.')
      expect(m.whatThisChanges.value.onThePlan.claim).toBe('Signals steady since yesterday — the plan follows the periodized build.')
      expect(m.whatThisChanges.value.onYou.claim).not.toBe(m.whatThisChanges.value.onThePlan.claim)
    }
  })

  it('unlockLabel is missing even when tomorrow itself is present — no time-of-day source exists', () => {
    const m = buildTodayModel(base({
      tomorrowWorkout: { title: 'Recovery Spin', description: 'Forty-five minutes, easy.' } as never,
    }))
    expect(isPresent(m.tomorrow)).toBe(true)
    if (isPresent(m.tomorrow)) {
      expect(isPresent(m.tomorrow.value.unlockLabel)).toBe(false)
      expect(m.tomorrow.value.unlockLabel).toEqual({ missing: 'Keine Startzeit für morgen geplant.' })
    }
  })

  it('ride.kj is missing (not estimated from calories) when average_power is null', () => {
    const m = buildTodayModel(base({
      activitiesToday: [{ id: 1, sport: 'cycling', average_power: null, duration_seconds: 3600 } as never],
    }))
    expect(isPresent(m.ride)).toBe(true)
    if (isPresent(m.ride)) expect(m.ride.value.kj).toBeNull()
  })
})

describe('weekLoad and phaseContext', () => {
  const weekPlan = {
    planned_tss_total: 420,
    meso_block: { phase: 'Grundlage 1', days_to_event: 121, target_event_type: 'Marathon' },
  } as unknown as WeekResponse

  it('sums the present days against the plan total', () => {
    // base()'s `now` is Wed 22 Jul 2026, so the current Mon-Sun week is
    // 2026-07-20..26. Real PMC entries for three of those seven days; the
    // other four days get no entry at all (genuinely missing, not a zero).
    // A fourth entry sits on 2026-07-27 — one day PAST the current week —
    // to prove the sum is scoped to the seven matched days, not every
    // entry the fixture happens to carry.
    const model = buildTodayModel(base({
      weekPlan,
      pmc: {
        entries: [
          { date: '2026-07-20', ctl: 50, atl: 45, tsb: 5, tss: 64 }, // Mon, in week
          { date: '2026-07-21', ctl: 50, atl: 45, tsb: 5, tss: 48 }, // Tue, in week
          { date: '2026-07-24', ctl: 50, atl: 45, tsb: 5, tss: 24 }, // Fri, in week
          { date: '2026-07-27', ctl: 50, atl: 45, tsb: 5, tss: 999 }, // next Mon, OUTSIDE the week
        ],
      } as never,
    }))
    expect(isPresent(model.weekLoad)).toBe(true)
    if (!isPresent(model.weekLoad)) return
    expect(model.weekLoad.value.planned).toBe(420)
    // Hand-computed literal — only the three in-week days' real tss, typed
    // out — NOT re-derived from model.week.reduce(...), which would just
    // check the implementation against itself.
    expect(model.weekLoad.value.spent).toBe(136)
    // The fourth entry (999 TSS, dated one day past the week) is
    // deliberately large: if the implementation ever summed every PMC
    // entry instead of only the seven matched, dated days, spent would
    // land near 1135, not 136 — this assertion would catch that.
    expect(model.weekLoad.value.spent).toBeLessThan(999)
  })

  it('withholds the meter rather than inventing a denominator', () => {
    const model = buildTodayModel(base({
      weekPlan: { ...weekPlan, planned_tss_total: null } as unknown as WeekResponse,
    }))
    expect(isPresent(model.weekLoad)).toBe(false)
  })

  it('is missing entirely when there is no week plan', () => {
    const model = buildTodayModel(base({ weekPlan: null }))
    expect(isPresent(model.weekLoad)).toBe(false)
    expect(isPresent(model.phaseContext)).toBe(false)
  })

  it('carries the phase even when the athlete has no target event', () => {
    const model = buildTodayModel(base({
      weekPlan: {
        ...weekPlan,
        meso_block: { phase: 'Grundlage 1', days_to_event: null, target_event_type: null },
      } as unknown as WeekResponse,
    }))
    expect(isPresent(model.phaseContext)).toBe(true)
    if (!isPresent(model.phaseContext)) return
    expect(model.phaseContext.value.phase).toBe('Grundlage 1')
    expect(model.phaseContext.value.daysToEvent).toBeNull()
  })
})

describe('compassPoint', () => {
  it('rounds a bearing to the German compass point the wind blows FROM', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(45)).toBe('NO')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(315)).toBe('NW')
  })

  it('rounds to the nearest point rather than truncating', () => {
    expect(compassPoint(23)).toBe('NO')
    expect(compassPoint(22)).toBe('N')
  })

  it('wraps past 360 and normalises a negative bearing', () => {
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(350)).toBe('N')
    expect(compassPoint(-45)).toBe('NW')
  })

  it('has no reading rather than a default heading', () => {
    expect(compassPoint(null)).toBeNull()
    expect(compassPoint(undefined)).toBeNull()
    expect(compassPoint(Number.NaN)).toBeNull()
  })
})

describe('reward-layer fields', () => {
  it('exposes the 90-day readiness series, not just its max', () => {
    const model = buildModel({
      ninetyDayMetrics: [
        { ...emptyMetric, training_readiness: 61 },
        { ...emptyMetric, training_readiness: null },
        { ...emptyMetric, training_readiness: 78 },
      ],
    })
    expect(isPresent(model.readiness90DaySeries)).toBe(true)
    // `base()`'s default snapshot carries `training_readiness: 74` (today's
    // reading) — the trailing 74 here is not fixture noise. It is the same
    // fold-in `readiness90DayBest` relies on (see that field's own comment):
    // today's own reading is deliberately included so a personal best set
    // TODAY is never reported as "off" a best that excludes it. Do not
    // "fix" this back to `[61, 78]`.
    expect(isPresent(model.readiness90DaySeries) && model.readiness90DaySeries.value).toEqual([61, 78, 74])
  })

  it('withholds the series rather than returning an empty array', () => {
    // Also nulls out today's own reading (present in `base()`'s default
    // snapshot) — otherwise the fold-in exercised by the test above would
    // leave a single-entry series here instead of a genuinely empty one.
    const model = buildModel({
      ninetyDayMetrics: [],
      snapshot: { ...base().snapshot!, training_readiness: null },
    })
    expect(isPresent(model.readiness90DaySeries)).toBe(false)
  })

  it("reports yesterday's skipped session when the plan says one was missed", () => {
    const model = buildModel({
      weekPlan: {
        ...emptyWeekPlan,
        missed_yesterday: {
          date: '2026-08-06', title: 'Threshold 4x8', title_de: 'Schwelle 4×8',
          target_tss: 98, template_id: null, category: 'bike', is_quality: true,
        },
      },
    })
    expect(isPresent(model.missedYesterday)).toBe(true)
    expect(isPresent(model.missedYesterday) && model.missedYesterday.value.title).toBe('Schwelle 4×8')
  })

  it('has no missed session when the plan carries none', () => {
    const model = buildModel({ weekPlan: { ...emptyWeekPlan, missed_yesterday: null } })
    expect(isPresent(model.missedYesterday)).toBe(false)
  })
})

describe('Bereitschaft: der eigene Rechner springt ein, wo die Uhr nichts liefert', () => {
  /**
   * In der Produktion gemessen: ein Fahrer mit 93 Tagen Ruhepuls und 0 Tagen
   * `training_readiness` -- seine Uhr liefert Garmins proprietaeres Feld
   * ueberhaupt nicht. Die Kachel sagte ihm 93 Tage lang "Noch keine Messung",
   * waehrend `GET /readiness/decision` ihn mit 72 bewertete und "Schlaf 3,2 h,
   * dein Schnitt ist 6,8 h" als Treiber nannte.
   */
  it('nimmt Garmins Wert, wo es ihn gibt', () => {
    const m = buildTodayModel(base({
      snapshot: { training_readiness: 54 } as never,
      decisionReadiness: 72,
    }))
    expect(isPresent(m.readiness) && m.readiness.value.score).toBe(54)
  })

  it('faellt auf den eigenen Wert zurueck, wo die Uhr nichts liefert', () => {
    const m = buildTodayModel(base({
      snapshot: { training_readiness: null } as never,
      decisionReadiness: 72,
    }))
    expect(isPresent(m.readiness) && m.readiness.value.score).toBe(72)
  })

  it('bleibt ehrlich leer, wenn beide Quellen schweigen', () => {
    const m = buildTodayModel(base({
      snapshot: { training_readiness: null } as never,
      decisionReadiness: null,
    }))
    expect(isPresent(m.readiness)).toBe(false)
  })

  it('zeigt KEINE Tagesdifferenz, wenn heute und gestern aus verschiedenen Quellen kommen', () => {
    // Sonst misst die Subtraktion nicht die Veraenderung des Fahrers, sondern
    // den Abstand zweier Messverfahren.
    const m = buildTodayModel(base({
      snapshot: { training_readiness: null } as never,
      decisionReadiness: 72,
      yesterdayMetric: { date: '2026-09-16', training_readiness: 60 } as never,
    }))
    expect(isPresent(m.readiness) && m.readiness.value.deltaVsYesterday).toBeNull()
  })
})
