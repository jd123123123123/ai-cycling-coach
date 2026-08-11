import { useMemo } from 'react'
import { useDailyMetrics } from '../../hooks/useDailyMetrics'
import { usePMC } from '../../hooks/usePMC'
import { present, missing, type Value } from './value'
import type { MorningWrapModel } from '../morning/model'
import type { SignalReading } from '../components/SignalRow'
import type { SleepStage } from '../components/Hypnogram'
import type { DailyMetric } from '../../api/dashboard'

/**
 * The Morning Wrap, from the athlete's own Garmin data.
 *
 * What Garmin actually gives us, and what it does not:
 *
 *   available  sleep_score · sleep stages (deep/rem/light/awake totals) ·
 *              hrv_overnight_avg · resting_hr · respiration avg/low/high ·
 *              spo2 · training_readiness · body_battery wake/now ·
 *              recovery_time_hours · CTL/ATL/TSB from the PMC
 *
 *   NOT stored  skin temperature — no column exists on DailyMetric, so the
 *              pen's fourth signal is withheld rather than substituted.
 *              A per-minute hypnogram — only stage TOTALS are stored, so the
 *              night is drawn as four ordered blocks and never as an invented
 *              minute-by-minute trace.
 *
 * Every band below is the athlete's own trailing-30-day range, not a
 * population norm: "outside your range" has to mean outside *yours* or the
 * whole screen is a lie.
 */

const DAY = 86_400_000

/** The rider's own range: the 10th–90th percentile of their last 30 days, so
 *  one freak night does not widen the band it is meant to be judged against. */
function band(values: number[]): { low: number; high: number } | null {
  const v = values.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (v.length < 7) return null
  const at = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]
  return { low: round1(at(0.1)), high: round1(at(0.9)) }
}

function round1(n: number): number { return Math.round(n * 10) / 10 }

function place(value: number, b: { low: number; high: number }): SignalReading['position'] {
  if (value > b.high) return 'above'
  if (value < b.low) return 'below'
  return 'in'
}

function signed(n: number, unit = ''): string {
  const r = round1(n)
  if (r === 0) return `Flat${unit}`
  return `${r > 0 ? '+' : '−'}${Math.abs(r)}${unit}`
}

function hm(seconds: number): string {
  return `${Math.floor(seconds / 3600)} h ${String(Math.round((seconds % 3600) / 60)).padStart(2, '0')}`
}

export interface MorningWrapInputs {
  /** Trailing 30 days, most recent last. */
  metrics: DailyMetric[]
  pmc: { ctl: number; atl: number; tsb: number }[]
  firstName: string | null
  streakDays: number | null
  isLoading: boolean
}

export function buildMorningWrapModel(input: MorningWrapInputs): MorningWrapModel {
  const { metrics, pmc, firstName, streakDays } = input
  const today = metrics.length > 0 ? metrics[metrics.length - 1] : null
  const prior = metrics.slice(0, -1)

  const NO_SYNC = 'No wearable reading synced yet today.'
  const NO_HISTORY = 'Not enough history yet to know your usual range.'

  // ---- the night ---------------------------------------------------------
  const sleep = today?.sleep_detail ?? null
  const stages: Value<SleepStage[]> =
    sleep && sleep.deep_s != null && sleep.rem_s != null && sleep.light_s != null
      ? present([
        { key: 'deep', label: 'Deep', seconds: sleep.deep_s },
        { key: 'rem', label: 'REM', seconds: sleep.rem_s },
        { key: 'light', label: 'Light', seconds: sleep.light_s },
        { key: 'awake', label: 'Awake', seconds: sleep.awake_s ?? 0 },
      ])
      : missing('Garmin recorded no sleep stages for last night.')

  // Only TOTALS are stored, never a per-minute trace — so the night is drawn
  // as four ordered blocks. Fabricating a hypnogram from totals would be
  // inventing the one thing the chart claims to show.
  const hypnogram: Value<{ stage: SleepStage['key']; minutes: number }[]> =
    'value' in stages
      ? present(stages.value.map((s) => ({ stage: s.key, minutes: Math.round(s.seconds / 60) })))
      : missing('Garmin stores nightly totals, not a minute-by-minute trace.')

  const sleepScore: Value<{ score: number; context: string }> =
    today?.sleep_score != null
      ? present({
        score: today.sleep_score,
        context: (() => {
          const scores = prior.map((m) => m.sleep_score).filter((n): n is number => n != null)
          if (scores.length === 0) return 'First night on record'
          const best = Math.max(...scores)
          return today.sleep_score >= best ? 'Your best night on record' : `Your usual is ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}`
        })(),
      })
      : missing('Garmin recorded no sleep score for last night.')

  // ---- the four signals, each against the rider's own band ---------------
  const hrvBand = band(prior.map((m) => m.hrv_status).filter((n): n is number => n != null))
  const rhrBand = band(prior.map((m) => m.resting_hr).filter((n): n is number => n != null))
  const respBand = band(prior.map((m) => m.sleep_detail?.respiration_avg).filter((n): n is number => n != null))
  const spo2Band = band(prior.map((m) => m.sleep_detail?.spo2_avg).filter((n): n is number => n != null))

  const hrvToday = today?.hrv_status ?? null
  const priorHrv = prior.length > 0 ? prior[prior.length - 1].hrv_status : null
  const priorRhr = prior.length > 0 ? prior[prior.length - 1].resting_hr : null

  const signals: Value<SignalReading>[] = [
    hrvToday != null && hrvBand
      ? present({
        key: 'hrv', label: 'HRV', value: round1(hrvToday), unit: 'ms',
        delta: priorHrv != null ? signed(hrvToday - priorHrv) : '—',
        band: hrvBand, position: place(hrvToday, hrvBand),
        outsideIsGood: true,
        note: describeHrv(hrvToday, hrvBand),
      })
      : missing(hrvToday == null ? 'No overnight HRV recorded.' : NO_HISTORY),

    today?.resting_hr != null && rhrBand
      ? present({
        key: 'rhr', label: 'Resting HR', value: today.resting_hr, unit: 'bpm',
        delta: priorRhr != null ? signed(today.resting_hr - priorRhr) : '—',
        band: rhrBand, position: place(today.resting_hr, rhrBand),
        // a LOW resting HR is the good direction
        outsideIsGood: today.resting_hr < rhrBand.low,
        note: describeRhr(today.resting_hr, rhrBand),
      })
      : missing(today?.resting_hr == null ? 'No resting heart rate recorded.' : NO_HISTORY),

    today?.sleep_detail?.respiration_avg != null && respBand
      ? present({
        key: 'resp', label: 'Respiratory rate', value: round1(today.sleep_detail.respiration_avg), unit: '/min',
        delta: '—', band: respBand, position: place(today.sleep_detail.respiration_avg, respBand),
        outsideIsGood: false,
        note: place(today.sleep_detail.respiration_avg, respBand) === 'in'
          ? 'Held steady all night. No sign of anything your body is fighting.'
          : 'Outside your usual overnight range — worth watching if it holds.',
      })
      : missing(today?.sleep_detail?.respiration_avg == null ? 'No overnight respiration recorded.' : NO_HISTORY),

    today?.sleep_detail?.spo2_avg != null && spo2Band
      ? present({
        key: 'spo2', label: 'Blood oxygen', value: round1(today.sleep_detail.spo2_avg), unit: '%',
        delta: '—', band: spo2Band, position: place(today.sleep_detail.spo2_avg, spo2Band),
        outsideIsGood: false,
        note: place(today.sleep_detail.spo2_avg, spo2Band) === 'in'
          ? 'Steady through the night, in line with your normal.'
          : 'Below your usual overnight range. One night is not a trend.',
      })
      : missing(today?.sleep_detail?.spo2_avg == null ? 'No overnight blood-oxygen reading.' : NO_HISTORY),
  ]

  const outside = signals.filter((s) => 'value' in s && s.value.position !== 'in').length
  const readable = signals.filter((s) => 'value' in s).length

  // ---- fitness / fatigue / form -----------------------------------------
  const last = pmc.length > 0 ? pmc[pmc.length - 1] : null
  const form: MorningWrapModel['form'] = last
    ? present({
      fitness: Math.round(last.ctl),
      fatigue: Math.round(last.atl),
      form: Math.round(last.tsb),
      note: last.tsb > 10
        ? 'Anything over +10 is race-ready.'
        : last.tsb < -20
          ? 'Deep in the hole — this is the cost side of the ledger.'
          : 'Fitness and fatigue are close. This is a working week, not a taper.',
      series: pmc.slice(-42).map((d) => ({ ctl: d.ctl, atl: d.atl })),
    })
    : missing('Not enough training history for a form curve yet.')

  return {
    dateLabel: present(new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })),
    streakDays: streakDays != null ? present(streakDays) : missing('No streak recorded yet.'),
    greeting: present(firstName ? `Good morning,\n${firstName}.` : 'Good morning.'),
    sleepScore,
    // Garmin stores no bedtime/wake clock times on DailyMetric — only durations.
    sleepWindow: sleep?.total_s != null
      ? present({ lightsOut: [hm(sleep.total_s), 'asleep'], asleep: [String(sleep.awake_count ?? 0), 'wake-ups'], awake: [today?.body_battery != null ? String(today.body_battery) : '—', 'battery at wake'] })
      : missing('No sleep duration recorded for last night.'),
    stages,
    hypnogram,
    nightClaim: sleep?.deep_s != null && sleep.total_s
      ? present(`${hm(sleep.deep_s)} of deep sleep out of ${hm(sleep.total_s)} — ${Math.round((sleep.deep_s / sleep.total_s) * 100)}% of the night doing repair work.`)
      : missing('Nothing measured overnight, so there is nothing to read into.'),

    brief: today
      ? present({
        readiness: {
          value: today.training_readiness ?? 0,
          delta: '',
          band: (() => {
            const b = band(prior.map((m) => m.training_readiness).filter((n): n is number => n != null))
            return b ? `Your 30-day band: ${b.low}–${b.high}` : 'Building your 30-day band'
          })(),
        },
        tiles: [
          { label: 'HRV', value: hrvToday != null ? String(Math.round(hrvToday)) : '—', unit: 'ms', sub: hrvBand ? `Usual ${hrvBand.low}–${hrvBand.high}` : 'No band yet', tone: 'accent' },
          { label: 'Resting HR', value: today.resting_hr != null ? String(today.resting_hr) : '—', unit: 'bpm', sub: rhrBand ? `Usual ${rhrBand.low}–${rhrBand.high}` : 'No band yet', tone: 'accent' },
          { label: 'Form', value: last ? (last.tsb > 0 ? `+${Math.round(last.tsb)}` : String(Math.round(last.tsb))) : '—', sub: 'Fitness − fatigue', tone: 'accent' },
          { label: 'Body battery', value: today.body_battery != null ? String(today.body_battery) : '—', sub: 'At wake', tone: 'ink' },
          { label: 'Sleep', value: sleep?.total_s != null ? hm(sleep.total_s) : '—', sub: today.sleep_score != null ? `Scored ${today.sleep_score}` : 'Not scored', tone: 'ink' },
        ],
      })
      : missing(NO_SYNC),

    call: today?.training_readiness != null
      ? present({
        agree: `${readable - outside} of ${readable} signals inside your range`,
        claim: today.training_readiness >= 70 ? 'The body is ready. Spend it well.' : 'Hold back today. The signals are asking for it.',
        reason: `Readiness ${today.training_readiness}${today.recovery_time_hours ? `, with ${today.recovery_time_hours} h of recovery still on the clock` : ''}.`,
        prescription: today.recovery_time_hours && today.recovery_time_hours > 12 ? 'Easy or off until recovery clears' : 'Cleared for the session as planned',
      })
      : missing('The coach withholds a call until a fresh reading lands.'),

    signalsClaim: readable === 0
      ? missing('No overnight signals to read.')
      : present(outside === 0
        ? 'Every signal sat inside your normal range.'
        : `${outside} of ${readable} signals broke your range.`),
    signals,

    standClaim: last ? present(last.tsb > 10 ? 'Fresher than your training has been in weeks.' : 'This is where the work is landing.') : missing('Not enough history to place today yet.'),
    standBody: present('Fitness is what you have built. Fatigue is what it cost. Form is what is left over.'),
    form,

    todayClaim: present('What today asks of you.'),
    todayBody: missing('The rest-day assignment is not generated from Garmin data yet.'),
    tasks: missing('No structured day plan generated yet.'),
    tomorrow: missing("Tomorrow's session comes from the plan, not from Garmin."),
    close: missing('Nothing to close on until the day plan exists.'),
    quote: missing('No quote for this morning.'),
  }
}

function describeHrv(v: number, b: { low: number; high: number }): string {
  if (v > b.high) return `${Math.round(((v - b.high) / b.high) * 100)}% above your 30-day band — a strong overnight read.`
  if (v < b.low) return `${Math.round(((b.low - v) / b.low) * 100)}% under your usual floor. Worth a light day.`
  return 'Sitting inside your usual overnight range.'
}

function describeRhr(v: number, b: { low: number; high: number }): string {
  if (v < b.low) return `Under your usual ${b.low}. The heart settled early and stayed there.`
  if (v > b.high) return `Above your usual ${b.high}. Often the first sign of a cost not yet paid.`
  return 'Inside your usual overnight range.'
}

/** The hook. Pulls the trailing 30 days and the PMC, and shapes them. */
export function useMorningWrapModel(firstName: string | null, streakDays: number | null): MorningWrapModel {
  const end = new Date()
  const start = new Date(end.getTime() - 30 * DAY)
  const metricsQuery = useDailyMetrics(start, end)
  const pmcQuery = usePMC()

  return useMemo(() => buildMorningWrapModel({
    metrics: (metricsQuery.data ?? []) as DailyMetric[],
    pmc: (pmcQuery.data ?? []) as { ctl: number; atl: number; tsb: number }[],
    firstName,
    streakDays,
    isLoading: metricsQuery.isLoading || pmcQuery.isLoading,
  }), [metricsQuery.data, pmcQuery.data, metricsQuery.isLoading, pmcQuery.isLoading, firstName, streakDays])
}
