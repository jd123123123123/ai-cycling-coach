import type { CustomBlock } from '../../api/customWorkouts'
import { blockDuration } from '../../api/customWorkouts'
import type { W3Block } from './W3Sections'

/**
 * WHAT A RIDER WITHOUT A PLAN BUILDS INSTEAD — a real structured workout,
 * composed from two taps.
 *
 * Today prints a prescribed session because a plan prescribed one. With no
 * plan there is nothing to prescribe, and the app must not invent a session
 * and present it as coaching. So the screen stops suggesting and starts
 * ASKING: what do you feel like, and how long have you got.
 *
 * The answer is composed here, and it is composed out of the SAME block model
 * the workout builder writes and the .zwo export reads
 * (`api/customWorkouts.ts` → `POST /custom-workouts`). Nothing here is a
 * mock-up of a workout: every shape below is a list of `CustomBlock`s that can
 * be saved, scheduled for today, opened in the editor, and exported to Zwift.
 * `%FTP` throughout — absolute watts are materialised server-side from the
 * athlete's own FTP at schedule/export time, exactly as the builder does it.
 *
 * These are SHAPES, not prescriptions, and the distinction is the whole point:
 * "6 × 4 min at 108 %" is a description of what the rider just asked for. It
 * carries no claim that today is the day for it — that claim needs a plan, and
 * the rider has told us they don't have one.
 */

export type W3Feel = 'locker' | 'tempo' | 'intervalle' | 'berge' | 'oeffnen'

export interface W3FeelChoice {
  key: W3Feel
  /** The button's word — what the rider feels like, in their language. */
  label: string
  /** What that turns into, stated as structure rather than as benefit. */
  sub: string
}

/** The five, in rising intensity — the row reads as a dial, not as a menu. */
export const W3_FEELS: W3FeelChoice[] = [
  { key: 'locker', label: 'Locker rollen', sub: 'Ein Block im Grundlagenbereich' },
  { key: 'tempo', label: 'Tempo', sub: 'Lange Blöcke knapp unter der Schwelle' },
  { key: 'berge', label: 'Berge', sub: 'Achtminüter an der Schwelle' },
  { key: 'intervalle', label: 'Intervalle', sub: 'Kurz und hart über der Schwelle' },
  { key: 'oeffnen', label: 'Öffnen', sub: 'Drei Spitzen, dann ausrollen' },
]

/** The four the rider actually has. Minutes, because that is how a free
 *  evening is measured — nobody has "1.5 h", they have "bis acht". */
export const W3_MINUTES = [45, 60, 90, 120] as const
export type W3Minutes = (typeof W3_MINUTES)[number]

interface Shape {
  /** Work interval: seconds on, seconds off, %FTP on, %FTP off. */
  on_s: number
  off_s: number
  on_pct: number
  off_pct: number
  /** Fixed rep count, or null to fill the middle with as many as fit. */
  reps: number | null
  /** Warm-up and cool-down at full length, trimmed on a short session. */
  wu: number
  cd: number
  name: string
}

const SHAPES: Record<W3Feel, Shape | null> = {
  // Nothing to interval — the middle is one endurance block, which is what
  // "locker rollen" means and the only honest way to render it.
  locker: null,
  tempo: { on_s: 600, off_s: 300, on_pct: 0.88, off_pct: 0.55, reps: null, wu: 10, cd: 8, name: 'Tempo' },
  berge: { on_s: 480, off_s: 240, on_pct: 1.0, off_pct: 0.55, reps: null, wu: 12, cd: 8, name: 'Berge' },
  intervalle: { on_s: 240, off_s: 240, on_pct: 1.08, off_pct: 0.5, reps: null, wu: 12, cd: 8, name: 'Intervalle' },
  // The one fixed-rep shape: an opener is three efforts by definition. Making
  // it scale with the slider would turn a 15-minute activation into an hour of
  // sprints under a word that promises the opposite.
  oeffnen: { on_s: 60, off_s: 180, on_pct: 1.15, off_pct: 0.55, reps: 3, wu: 10, cd: 8, name: 'Öffnen' },
}

const ENDURANCE_PCT = 0.62
/** Below this, a trailing endurance block is padding, not a block. */
const MIN_FILLER_MIN = 5

export interface ComposedWorkout {
  name: string
  blocks: CustomBlock[]
}

/**
 * The composition itself. Warm-up and cool-down are trimmed proportionally on
 * a short session so 45 minutes does not arrive as 18 minutes of ramps around
 * a single interval; whatever the shape does not spend is returned to the
 * rider as endurance, so the workout lasts as long as the button they pressed.
 */
export function composeWorkout(feel: W3Feel, minutes: number): ComposedWorkout {
  const shape = SHAPES[feel]
  const base = shape ?? { wu: 8, cd: 5, name: 'Locker rollen' }
  // Trim the ends, never past their share of a short ride.
  const wu = Math.min(base.wu, Math.round(minutes * 0.2))
  const cd = Math.min(base.cd, Math.round(minutes * 0.15))
  const middle = Math.max(0, minutes - wu - cd)

  const blocks: CustomBlock[] = [
    { type: 'warmup', duration_s: wu * 60, from_pct: 0.5, to_pct: 0.75 },
  ]

  let spent = 0
  if (shape && middle > 0) {
    const cycle = (shape.on_s + shape.off_s) / 60
    const fits = Math.floor(middle / cycle)
    const reps = shape.reps != null ? Math.min(shape.reps, Math.max(1, fits)) : Math.max(1, fits)
    // A single rep of a shape that only makes sense in a set is still honest —
    // it is what fits — so it is drawn rather than silently upgraded.
    blocks.push({
      type: 'interval',
      reps,
      on_s: shape.on_s,
      off_s: shape.off_s,
      on_pct: shape.on_pct,
      off_pct: shape.off_pct,
    })
    spent = reps * cycle
  }

  // WHATEVER THE SHAPE DID NOT SPEND GOES BACK TO THE RIDER, and this is the
  // whole reason: a rep length that does not divide the middle silently ate it.
  // `berge · 60 min` spent 12 + 3×12 + 8 and returned a 56-minute workout under
  // a button that said 60 — four minutes short, on the one number the rider
  // chose explicitly. Above the filler threshold the remainder becomes its own
  // endurance block; below it, it lengthens the cool-down, because a two-minute
  // block is a token and a two-minute-longer wind-down is a wind-down.
  const rest = Math.max(0, Math.round(middle - spent))
  let cdMin = cd
  if (rest >= MIN_FILLER_MIN) {
    blocks.push({ type: 'steady', duration_s: rest * 60, power_pct: ENDURANCE_PCT })
  } else {
    cdMin += rest
  }

  blocks.push({ type: 'cooldown', duration_s: cdMin * 60, from_pct: 0.6, to_pct: 0.4 })

  return { name: `${base.name} · ${minutes} min`, blocks }
}

/**
 * The composed blocks as `IntervalBars` wants them — the same bar strip a
 * planned session draws on Today, so a self-built workout is shown in the
 * app's own handwriting rather than in a second visual dialect.
 *
 * `w` is a fraction of the tallest bar: 150 %FTP is the ceiling, which keeps a
 * VO2 rep and an endurance block on ONE scale. Normalising per workout instead
 * would draw a recovery ride's 62 % at full height.
 */
const BAR_CEILING = 1.5

export function composedBars(blocks: CustomBlock[]): W3Block[] {
  const bars: W3Block[] = []
  const h = (pct: number) => Math.max(0.08, Math.min(1, pct / BAR_CEILING))
  const pctLabel = (pct: number) => `${Math.round(pct * 100)}% FTP`
  for (const b of blocks) {
    if (b.type === 'interval') {
      const reps = b.reps ?? 0
      for (let i = 0; i < reps; i++) {
        bars.push({ w: h(b.on_pct ?? 0), work: true, label: `${reps} × ${Math.round((b.on_s ?? 0) / 60)} min · ${pctLabel(b.on_pct ?? 0)}` })
        bars.push({ w: h(b.off_pct ?? 0), work: false, label: `Pause ${Math.round((b.off_s ?? 0) / 60)} min` })
      }
      continue
    }
    if (b.type === 'steady' || b.type === 'freeride') {
      const pct = b.power_pct ?? ENDURANCE_PCT
      bars.push({ w: h(pct), work: pct >= 0.85, label: `${Math.round(blockDuration(b) / 60)} min · ${pctLabel(pct)}` })
      continue
    }
    // A ramp is one bar at its own midpoint — drawing warm-up as a staircase
    // would give the quietest part of the session the most marks on the strip.
    const mid = ((b.from_pct ?? 0.5) + (b.to_pct ?? 0.75)) / 2
    bars.push({
      w: h(mid),
      work: false,
      label: `${b.type === 'cooldown' ? 'Ausfahren' : 'Einfahren'} ${Math.round(blockDuration(b) / 60)} min`,
    })
  }
  return bars
}
