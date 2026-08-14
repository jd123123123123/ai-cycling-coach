import { useMemo } from 'react'
import { useActivitiesRange } from '../../hooks/useActivitiesRange'
import { useWallet } from '../../hooks/useWallet'
import type { ActivityRead } from '../../api/dashboard'

/**
 * W3 · the rider's REAL lifetime numbers, in ONE place.
 *
 * The "AVATAR UNLOCKED" reveal (`W3AvatarOnboardPage`) and the BIKER profile
 * (`W3BikerPage`) show the same facts about the same rider — so they must be
 * the same arithmetic. This module owns it; the screens only own their copy.
 *
 * Everything here is derived from real rides (`/activities`) and the real
 * RideCoin wallet (`/rewards/wallet`). Nothing is invented: with no rides the
 * numbers are zero and every caller renders an explicit "—".
 *
 * NOTE (follow-up): `W3AvatarOnboardPage` still computes these inline. It is
 * mid-flight in another branch — once that lands it should import
 * `useRiderLifetime` from here and keep only its German copy.
 */

/** RideCoin per level. Levels are IN-APP progression: everyone starts at 1. */
export const XP_PER_LEVEL = 500
/** How far back the lifetime window reaches (the activities API is ranged). */
export const LIFETIME_SEASONS = 6

const EVEREST_M = 8849
const EARTH_KM = 40075
const KCAL_PER_PIZZA = 850

export interface RiderLifetime {
  /** False until the activities read resolves — callers show a quiet skeleton. */
  loaded: boolean
  rides: number
  distKm: number
  saddleH: number
  elevM: number
  longestKm: number
  avgSpeedKmh: number
  kcal: number
  /** elevation ÷ Mount Everest — the raw metres made meaningful. */
  everest: number
  /** kcal ÷ one pizza. */
  pizzas: number
  /** distance ÷ the equator. */
  earthLaps: number
  /** Full years since the first recorded ride (0 when there are none). */
  years: number
  /** Calendar year of the first recorded ride. */
  firstYear: number | null
  garminSynced: boolean
  /** Riding character, from the rides themselves. */
  role: 'Rookie' | 'Climber' | 'Rouleur' | 'Rider'
  rideCoin: number
  level: number
  /** 0..1 progress through the current level. */
  levelPct: number
  toNextLevel: number
}

export const EMPTY_LIFETIME: RiderLifetime = {
  loaded: false, rides: 0, distKm: 0, saddleH: 0, elevM: 0, longestKm: 0,
  avgSpeedKmh: 0, kcal: 0, everest: 0, pizzas: 0, earthLaps: 0, years: 0,
  firstYear: null, garminSynced: false, role: 'Rookie',
  rideCoin: 0, level: 1, levelPct: 0, toNextLevel: XP_PER_LEVEL,
}

/** Pure reducer over the rider's cycling activities + their RideCoin balance. */
export function computeRiderLifetime(
  activities: ActivityRead[] | undefined,
  rideCoinBalance: number | null | undefined,
  loaded: boolean,
): RiderLifetime {
  const cyc = (activities ?? []).filter((a) => a.sport === 'cycling')
  const rides = cyc.length
  const distKm = cyc.reduce((s, a) => s + (a.distance_meters ?? 0), 0) / 1000
  const saddleH = cyc.reduce((s, a) => s + (a.duration_seconds ?? 0), 0) / 3600
  const elevM = cyc.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0)
  const kcal = cyc.reduce((s, a) => s + (a.calories ?? 0), 0)
  const longestKm = cyc.reduce((m, a) => Math.max(m, (a.distance_meters ?? 0) / 1000), 0)
  const avgSpeedKmh = saddleH > 0 ? distKm / saddleH : 0

  const earliest = cyc.reduce<number | null>((m, a) => {
    const t = new Date(a.started_at).getTime()
    return Number.isFinite(t) && (m == null || t < m) ? t : m
  }, null)
  const years = earliest ? Math.max(1, Math.floor((Date.now() - earliest) / (365.25 * 864e5))) : 0

  // Riding character (real): lots of vertical → Climber, fast → Rouleur.
  const elevPerKm = distKm > 0 ? elevM / distKm : 0
  const role: RiderLifetime['role'] = rides === 0 ? 'Rookie'
    : elevPerKm >= 12 ? 'Climber'
      : avgSpeedKmh >= 30 ? 'Rouleur' : 'Rider'

  // Level — in-app progression only. Lifetime riding fills the STATS, never
  // the level; the level is what you earned inside the app.
  const rideCoin = Math.max(0, rideCoinBalance ?? 0)
  const level = 1 + Math.floor(rideCoin / XP_PER_LEVEL)
  const intoLevel = rideCoin % XP_PER_LEVEL

  return {
    loaded,
    rides, distKm, saddleH, elevM, longestKm, avgSpeedKmh, kcal,
    everest: elevM / EVEREST_M,
    pizzas: Math.round(kcal / KCAL_PER_PIZZA),
    earthLaps: distKm / EARTH_KM,
    years,
    firstYear: earliest ? new Date(earliest).getFullYear() : null,
    garminSynced: cyc.some((a) => (a.source ?? '').toLowerCase().includes('garmin')),
    role,
    rideCoin,
    level,
    levelPct: intoLevel / XP_PER_LEVEL,
    toNextLevel: XP_PER_LEVEL - intoLevel,
  }
}

/** The hook both the reveal and the profile read their lifetime facts from. */
export function useRiderLifetime(): RiderLifetime {
  const [from, to] = useMemo(() => {
    const start = new Date()
    start.setFullYear(start.getFullYear() - LIFETIME_SEASONS)
    return [start, new Date()] as const
  }, [])
  const { data: acts, isSuccess } = useActivitiesRange(from, to)
  const { data: wallet } = useWallet()
  return useMemo(
    () => computeRiderLifetime(acts?.activities, wallet?.balance, isSuccess),
    [acts, wallet, isSuccess],
  )
}

/** "12.4K" / "184" — big counts without the noise. */
export function compactNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n))
}
