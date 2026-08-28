import { T } from './w3tokens'

/**
 * WHICH SKY IS BEHIND THE BIKE TODAY.
 *
 * One per day, cycling through `T.heroSkies` by the day of the year. Two
 * properties are the whole design and both matter:
 *
 *  · IT CHANGES DAILY, so the first screen of the app is not the same picture
 *    every morning for a rider who opens it every morning.
 *  · IT IS STABLE WITHIN THE DAY. A backdrop that shifted while somebody was
 *    looking at it would read as a bug, not as weather, so this is derived from
 *    the DATE and never from the clock.
 *
 * DERIVED, NOT RANDOM AND NOT STORED. `Math.random()` would change on every
 * re-render; a stored choice would need a migration and a cache to answer a
 * question the calendar already answers. The day of the year is the seed, and
 * seven skies against 365 days means the week is the visible cycle — a rider
 * notices "the app looks different on Saturdays" rather than "the app looks
 * random", which is a nicer thing to notice.
 */
export function skyFor(date: Date): readonly [string, string, string] {
  const start = Date.UTC(date.getFullYear(), 0, 0)
  const day = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start) / 86_400_000,
  )
  const skies = T.heroSkies
  // `% length` on a non-negative day is safe; the guard is for a Date that
  // failed to parse, which would otherwise index the array with NaN and paint
  // nothing at all.
  const i = Number.isFinite(day) ? ((day % skies.length) + skies.length) % skies.length : 0
  return skies[i]
}

/**
 * The sky as a paintable background.
 *
 * THE STOPS ARE PLACED AGAINST THE FLOOR LINE, and the first version was not.
 * `W3TodayStage.FLOOR` puts the horizon at 76.2% of the stage, and a gradient
 * that ran its warm band all the way to 100% buried the best part of the sky
 * behind the floor plate — the render came back a flat mauve wall with the
 * sunrise nowhere in it.
 *
 * So the glow peaks just ABOVE that line, at 72%, where there is still sky to
 * put it on, and then darkens again into the last few percent so the floor has
 * something to meet rather than a bright band running underneath it. That
 * final darkening is what reads as the ground shadowing the light — the same
 * thing a real horizon does.
 */
const FLOOR_LINE = 0.762

export function skyGradient(date: Date): string {
  const [zenith, upper, horizon] = skyFor(date)
  const glow = Math.round((FLOOR_LINE - 0.04) * 100)
  return [
    `linear-gradient(180deg`,
    `${zenith} 0%`,
    `${upper} 42%`,
    `${horizon} ${glow}%`,
    // Back down into the zenith at the very bottom: the floor plate is
    // composited on top of this and needs a dark edge to sit against.
    `${zenith} 100%)`,
  ].join(', ')
}
