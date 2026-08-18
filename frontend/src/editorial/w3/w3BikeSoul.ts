/**
 * W3 · What makes a bike YOURS.
 *
 * THE PROBLEM THIS SOLVES. The garage showed a catalogue photograph: every
 * rider with a Rostlaube saw identical pixels, nothing on it was evidence that
 * anyone had ever ridden it, and it only changed on the rare day someone bought
 * something. A product shot sitting next to your training data — not made of
 * it. So it earned no attachment: no wow, no belonging, and no reason to look
 * at it twice.
 *
 * THE PRINCIPLE. The bike should be MADE OF the rider's training. Everything in
 * here is derived from facts the app already has — the clock, recent rides,
 * whether today is a training day — so the same bike looks different in
 * February at 6am than it does after a wet 90km in October, and different again
 * for a rider who has been off it for a fortnight.
 *
 * HONESTY RULES, unchanged from everywhere else:
 *  - No fact is invented. `km` is null until the activity feed has actually
 *    answered; it renders as an em dash rather than a hopeful zero.
 *  - Grime is a function of REAL riding. A bike that has not moved cannot be
 *    dirty, so a rider who has done nothing sees a clean bike and is told so —
 *    that absence is the motivating signal, and it must not be faked with
 *    decorative dirt.
 *
 * Pure module: no React, no network, no clock reads except the one passed in,
 * so every value here is testable and deterministic.
 */

/** How the garage is lit, from the real hour of day. */
export type BikeLight = 'dawn' | 'day' | 'dusk' | 'night'

/** What the bike is doing with itself today. */
export type BikeStance = 'ready' | 'rested' | 'idle'

export interface BikeSoul {
  /** Kilometres behind this rider, or null while unknown. */
  km: number | null
  /** 0…1. How much road is still on it — drives the grime overlay's opacity. */
  grime: number
  light: BikeLight
  stance: BikeStance
  /** One honest line. Never scolds; an idle bike is an invitation, not a debt. */
  line: string
}

/** Local hour → the light in the room. The bands are deliberately generous:
 *  the point is that a 6am rider and a 9pm rider see different garages, not
 *  that the gradient tracks the sun. */
export function lightAt(now: Date): BikeLight {
  const h = now.getHours()
  if (h < 5) return 'night'
  if (h < 9) return 'dawn'
  if (h < 17) return 'day'
  if (h < 21) return 'dusk'
  return 'night'
}

/**
 * The grade laid over the bike's own studio backdrop.
 *
 * These are overlays, not replacements: the art keeps its shape and its
 * lighting, and this only tints the room around it. That is what lets a single
 * static photograph read as "the same bike, this morning".
 */
export const LIGHT_WASH: Record<BikeLight, { tint: string; vignette: number }> = {
  // Low warm sun through a doorway.
  dawn: { tint: 'linear-gradient(160deg, #FFB02026 0%, transparent 58%)', vignette: 0.28 },
  // Flat, neutral, honest — the default the art was rendered in.
  day: { tint: 'linear-gradient(180deg, #FFFFFF0A 0%, transparent 60%)', vignette: 0.18 },
  // The long gold of an evening ride.
  dusk: { tint: 'linear-gradient(200deg, #FF8A0033 0%, transparent 62%)', vignette: 0.34 },
  // Cold, quiet, one lamp on.
  night: { tint: 'linear-gradient(180deg, #6B8CFF1F 0%, #00000033 70%)', vignette: 0.46 },
}

/**
 * How dirty the bike is, from real riding in the last week.
 *
 * Distance does most of it; wet rides do far more per kilometre, which is why
 * `wetKm` is weighted roughly triple. Capped below 1 so even a filthy bike
 * stays readable — this is patina, not a mud texture pasted over the product.
 */
export function grimeFrom(km7d: number | null, wetKm7d = 0): number {
  if (km7d == null || km7d <= 0) return 0
  const dirty = km7d + wetKm7d * 2
  return Math.min(0.82, dirty / 320)
}

/** Training state → what the bike is doing. `hasSessionToday` is the plan,
 *  `rodeToday` is the fact, `daysSinceRide` is how cold it has gone. */
export function stanceFrom(
  { rodeToday, hasSessionToday, daysSinceRide }:
  { rodeToday: boolean; hasSessionToday: boolean; daysSinceRide: number | null },
): BikeStance {
  if (rodeToday) return 'rested'
  if (hasSessionToday) return 'ready'
  if (daysSinceRide != null && daysSinceRide >= 6) return 'idle'
  return 'ready'
}

/** The line under the name. German, plain, and never a telling-off. */
export function soulLine(stance: BikeStance, grime: number, daysSinceRide: number | null): string {
  if (stance === 'rested') return 'Heute gefahren. Es darf jetzt stehen.'
  if (stance === 'idle') {
    const d = daysSinceRide ?? 0
    return d >= 14 ? 'Seit zwei Wochen sauber. Das lässt sich ändern.'
      : `Seit ${d} Tagen nicht bewegt.`
  }
  if (grime > 0.4) return 'Trägt die letzte Woche noch am Rahmen.'
  if (grime > 0.08) return 'Ein bisschen Straße klebt noch dran.'
  return 'Sauber und bereit.'
}

/** One call, everything the hero needs. */
export function bikeSoul(input: {
  now: Date
  km: number | null
  km7d: number | null
  wetKm7d?: number
  rodeToday: boolean
  hasSessionToday: boolean
  daysSinceRide: number | null
}): BikeSoul {
  const grime = grimeFrom(input.km7d, input.wetKm7d ?? 0)
  const stance = stanceFrom(input)
  return {
    km: input.km,
    grime,
    light: lightAt(input.now),
    stance,
    line: soulLine(stance, grime, input.daysSinceRide),
  }
}
