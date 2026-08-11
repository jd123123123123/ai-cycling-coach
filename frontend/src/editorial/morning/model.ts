import type { SleepStage } from '../components/Hypnogram'
import type { SignalReading } from '../components/SignalRow'
import type { DayTask } from '../components/DayTimeline'
import type { Value } from '../data/value'

/**
 * The Morning Wrap's view model.
 *
 * Unchanged from the scrolling version this deck replaced — the redesign is
 * a change of FORM, not of what the screen is allowed to claim. Every field
 * is still a `Value<T>`, so a chapter whose evidence is missing renders its
 * frame and says why rather than inventing a number.
 */
/** Which glyph fronts a tile. A key, not a component, so the model stays free
 *  of React imports and one metric always draws the same mark everywhere. */
export type MetricGlyph = 'hrv' | 'cardiac' | 'form' | 'load' | 'sleep'

/**
 * One tile of the brief.
 *
 * `label`/`value`/`unit`/`sub` were the whole tile. That made a 2×2 grid of
 * four small paragraphs — everything in it had to be READ, and a rider
 * scanning at 06:32 does not read, they glance. The rest of these fields exist
 * so the tile can be decoded before language: a glyph says which metric, an
 * arrow and its colour say which way and whether that is good, and the spark
 * says whether today is a blip or a trend.
 */
export interface MetricTile {
  label: string
  value: string
  unit?: string
  /** The delta, as the athlete would say it — "+12", "−28% on plan". */
  sub: string
  tone?: 'accent' | 'ink'
  glyph?: MetricGlyph
  /** Which way the reading moved, and whether that direction is the good one
   *  for THIS metric — resting HR falling is good, HRV falling is not. */
  dir?: 'up' | 'down' | 'flat'
  good?: boolean
  /** Trailing week, oldest first. Fewer than two points draws nothing. */
  spark?: number[]
  /** One sentence, revealed on tap. Depth is opt-in; the grid stays scannable. */
  note?: string
}

export interface MorningWrapModel {
  dateLabel: Value<string>
  streakDays: Value<number>
  greeting: Value<string>
  sleepScore: Value<{ score: number; context: string }>
  sleepWindow: Value<{ lightsOut: [string, string]; asleep: [string, string]; awake: [string, string] }>
  stages: Value<SleepStage[]>
  hypnogram: Value<{ stage: SleepStage['key']; minutes: number }[]>
  nightClaim: Value<string>

  brief: Value<{
    readiness: { value: number; delta: string; band: string }
    tiles: MetricTile[]
  }>
  call: Value<{ agree: string; claim: string; reason: string; prescription: string }>

  signalsClaim: Value<string>
  signals: Value<SignalReading>[]

  standClaim: Value<string>
  standBody: Value<string>
  form: Value<{ fitness: number; fatigue: number; form: number; note: string; series: { ctl: number; atl: number }[] }>

  todayClaim: Value<string>
  todayBody: Value<string>
  tasks: Value<DayTask[]>

  tomorrow: Value<{ when: string; away: string; title: string; cost: string }>
  close: Value<{ kicker: string; claim: string; body: string; cta: string }>
  quote: Value<{ text: string; attribution: string }>
}
