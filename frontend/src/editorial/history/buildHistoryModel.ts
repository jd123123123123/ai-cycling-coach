import type { ActivityRead, PMCEntry } from '../../api/dashboard'
import type { ArchiveDeckModel } from '../archive/ArchiveDeckView'
import type { Ride } from '../archive/charts/RideScatter'
import type { CurvePoint } from '../archive/charts/PowerCurve'
import type { PmcDay } from '../archive/charts/FitnessForm'
import { bestOtherMonth, rankByKm, type MonthBucket } from './monthBuckets'

export interface HistoryInputs {
  buckets: MonthBucket[]
  /** The month being read. */
  key: string
  /** Trailing PMC, any length; filtered to the month here. */
  pmc: PMCEntry[]
  /** All-time mean-maximal power, seconds -> watts. */
  mmpCurve: Record<string, number> | null
  now?: Date
}

const hours = (s: number) => Math.round(s / 360) / 10

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** The month's stand-out ride: the one that cost the most. Ties break toward
 *  distance, so a long day beats a short sharp one at equal load. */
function epicOf(activities: ActivityRead[]): ActivityRead | null {
  if (activities.length === 0) return null
  return activities.reduce((best, a) => {
    const la = a.tss ?? 0
    const lb = best.tss ?? 0
    if (la !== lb) return la > lb ? a : best
    return (a.distance_meters ?? 0) > (best.distance_meters ?? 0) ? a : best
  })
}

function toRides(activities: ActivityRead[]): Ride[] {
  return activities.map((a) => ({
    key: String(a.id),
    km: Math.round((a.distance_meters ?? 0) / 10) / 100,
    climbM: Math.round(a.elevation_gain_m ?? 0),
    load: Math.round(a.tss ?? 0),
    label: a.title ?? undefined,
    date: a.started_at.slice(0, 10),
  }))
  // A ride with no distance cannot be placed on a distance axis; dropping it
  // is honest, plotting it at zero is not.
  .filter((r) => r.km > 0)
}

/** The nine durations a cyclist actually reads, where we have them. */
const CURVE_SECONDS = [5, 15, 30, 60, 300, 480, 1200, 1800, 3600]

function toCurve(mmp: Record<string, number> | null): CurvePoint[] {
  if (!mmp) return []
  return CURVE_SECONDS
    .map((seconds) => ({ seconds, watts: Math.round(mmp[String(seconds)] ?? 0) }))
    .filter((p) => p.watts > 0)
}

function monthPmc(pmc: PMCEntry[], year: number, month: number): PmcDay[] {
  return pmc
    .filter((e) => {
      const d = new Date(`${e.date}T00:00:00`)
      return d.getFullYear() === year && d.getMonth() === month
    })
    .map((e) => ({ ctl: e.ctl, tsb: e.tsb }))
}

/**
 * Real rides in, the archive deck's model out.
 *
 * Every figure below is measured. Where the data genuinely is not there — a
 * per-month power curve needs per-activity curves the API does not expose, and
 * the projection band has no backend at all — the chapter says so in its own
 * words and its chart is passed an empty series, which every archive chart
 * already renders as nothing. That is the house rule: withhold the claim WITH
 * its evidence, never keep the sentence and drop the proof.
 *
 * The prose is composed from the numbers rather than fetched from the AI
 * endpoints. A verdict assembled from figures on the same screen can never
 * contradict them, which a separately-generated sentence can and eventually
 * will.
 */
export function buildHistoryModel(input: HistoryInputs): ArchiveDeckModel | null {
  const { buckets, key, pmc, mmpCurve } = input
  const b = buckets.find((x) => x.key === key)
  if (!b) return null

  const rank = rankByKm(buckets, key)
  const best = bestOtherMonth(buckets, key)
  const epic = epicOf(b.activities)
  const rides = toRides(b.activities)
  const curve = toCurve(mmpCurve)
  const days = monthPmc(pmc, b.year, b.month)

  const movingH = hours(b.movingSeconds)
  const hard = b.activities.filter((a) => (a.tss ?? 0) >= 100).length
  const perWeek = Math.round((b.rides / 4.35) * 10) / 10

  const rankText = rank && rank.of > 1 ? `#${rank.rank} of ${rank.of} months` : 'First month on record'

  // The open goal only exists while it is still winnable — a finished month
  // chasing a target it already missed is a reproach, not a goal.
  const isCurrent = b.year === (input.now ?? new Date()).getFullYear() && b.month === (input.now ?? new Date()).getMonth()
  const toBeat = best && best.km > b.km ? best.km - b.km : 0
  const inMonth = new Date(b.year, b.month + 1, 0).getDate()
  const daysLeft = isCurrent ? inMonth - (input.now ?? new Date()).getDate() : 0
  const openGoal =
    isCurrent && best && toBeat > 0 && daysLeft > 0
      ? {
          label: `${Math.round(toBeat)} km to your biggest month ever`,
          sub: `${b.km} of ${best.km} km`,
          right: `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`,
          pct: Math.min(100, Math.round((b.km / Math.max(best.km, 1)) * 100)),
        }
      : null

  const peak5 = curve.find((p) => p.seconds === 300)?.watts ?? null

  return {
    scope: 'History',
    period: b.label,

    answer: {
      claim: b.rides === 0
        ? 'You did not ride this month.'
        : `${b.label.split(' ')[0]} cost you ${b.load} points across ${b.rides} rides.`,
      support: rank && rank.of > 1
        ? `${b.km} km and ${b.climbM.toLocaleString('en-GB')} m of climbing — your ${ordinal(rank.rank)} biggest month of the ${rank.of} on record.`
        : `${b.km} km and ${b.climbM.toLocaleString('en-GB')} m of climbing.`,
    },

    openGoal,

    wentIn: {
      hero: String(b.km),
      unit: 'km',
      rank: rankText,
      verdict: `${b.rides} ${b.rides === 1 ? 'ride' : 'rides'}, and ${hard === 0 ? 'none' : `only ${hard}`} of them hard.`,
      rides,
      highlightKey: epic ? String(epic.id) : null,
      soWhat: b.rides > 0
        ? `That is ${perWeek} rides a week. ${b.restDays} ${b.restDays === 1 ? 'day' : 'days'} off the bike.`
        : 'Nothing went in this month.',
      stats: [
        [b.climbM.toLocaleString('en-GB'), 'm climbed'],
        [`${movingH} h`, 'moving'],
        [String(b.restDays), 'rest days'],
      ],
    },

    cameOut: {
      hero: peak5 != null ? String(peak5) : '—',
      unit: 'watts at 5 min',
      // Honest scope: this curve is every ride you have ever recorded, not this
      // month's. A per-period curve needs per-activity power curves the API
      // does not return, so the label says what it is rather than implying a
      // comparison that was never computed.
      rank: 'all-time best',
      verdict: curve.length > 1
        ? 'Your best ever at every duration, across all your rides.'
        : 'No power data recorded yet, so there is no curve to draw.',
      current: curve,
      previous: [],
      highlightSeconds: 300,
      soWhat: curve.length > 1
        ? 'A month-on-month comparison needs per-ride power curves, which are not stored yet.'
        : 'Ride with a power meter and this fills in.',
      stats: curve.length > 1
        ? ([[String(curve.find((p) => p.seconds === 60)?.watts ?? '—'), '1 min'],
            [String(curve.find((p) => p.seconds === 1200)?.watts ?? '—'), '20 min'],
            [String(curve.find((p) => p.seconds === 3600)?.watts ?? '—'), '60 min']] as [string, string][])
        : [],
    },

    cost: {
      hero: days.length > 0 ? String(Math.round(days[days.length - 1].ctl)) : '—',
      unit: 'fitness',
      rank: days.length > 0 ? `${Math.round(days[days.length - 1].tsb) > 0 ? '+' : ''}${Math.round(days[days.length - 1].tsb)} form` : '',
      verdict: days.length > 1
        ? `Fitness ${Math.round(days[days.length - 1].ctl) >= Math.round(days[0].ctl) ? 'rose' : 'fell'} from ${Math.round(days[0].ctl)} to ${Math.round(days[days.length - 1].ctl)} across the month.`
        : 'Not enough days on record to draw the month.',
      days,
      soWhat: `${b.restDays} rest ${b.restDays === 1 ? 'day' : 'days'} paid for ${b.load} points of load.`,
      stats: [[String(b.load), 'load'], [String(b.rides), 'rides'], [String(b.restDays), 'rest days']],
    },

    setsUp: {
      // No projection backend exists. Rather than draw a forecast we cannot
      // stand behind, the chapter states what it can and the chart draws
      // nothing.
      verdict: best && b.km >= best.km
        ? 'Your biggest month on record. The next one starts from a higher base.'
        : `Your base for next month: ${b.km} km and ${Math.round(b.load)} points in the bank.`,
      actual: [],
      projLow: [],
      projHigh: [],
      conditions: [
        [`${perWeek}/wk`, 'rides held'],
        [`${movingH} h`, 'time on the bike'],
        [rankText, 'against your record'],
      ],
    },

    close: {
      headline: b.rides > 0 ? 'What this month bought you' : 'A month off',
      figure: String(b.km),
      unit: 'km ridden',
      footline: rank && rank.of > 1
        ? `Your ${ordinal(rank.rank)} biggest month of ${rank.of}.`
        : 'Your first month on record.',
      nextGoal: openGoal ?? {
        label: best ? `Your best month is ${best.km} km` : 'Keep riding',
        right: best ? best.label : '',
        sub: `${b.km} km this month`,
        pct: best ? Math.min(100, Math.round((b.km / Math.max(best.km, 1)) * 100)) : 0,
      },
    },

    contents: [
      { n: '01', title: 'What went in', value: `${b.km} km`, tone: 'gold' },
      { n: '02', title: 'What came out', value: peak5 != null ? `${peak5} W` : '—', tone: 'ink' },
      { n: '03', title: 'What it cost', value: days.length > 0 ? `${Math.round(days[days.length - 1].ctl)} fitness` : '—', tone: 'ink' },
      { n: '04', title: 'What it sets up', value: rankText, tone: 'cool' },
    ],
  }
}
