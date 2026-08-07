// frontend/src/editorial/components/cassetteScale.ts
/**
 * The cassette's scale. The cog the chain sits on is the gear your body can
 * push today, and it is ranked against YOUR OWN 90 days — not an absolute
 * score. "You can push the 11" has to mean "the top of your range"; a fixed
 * threshold would borrow someone else's physiology.
 */
export const COG_TEETH = [11, 13, 15, 17, 19, 21, 24, 28, 32, 34] as const

/** Below this many usable readings, a percentile is noise. */
export const MIN_SERIES_FOR_PERCENTILE = 14

const LAST = COG_TEETH.length - 1

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

/** Share of the series at or below `value`. Empty series → 0. */
export function percentileRank(value: number, series: number[]): number {
  if (series.length === 0) return 0
  const atOrBelow = series.filter((v) => v <= value).length
  return atOrBelow / series.length
}

export function cogIndexFromReadiness(
  readiness: number,
  series: number[],
): { index: number; basis: 'percentile' | 'decile' } {
  if (series.length >= MIN_SERIES_FOR_PERCENTILE) {
    const p = percentileRank(readiness, series)
    return { index: clamp(Math.round((1 - p) * LAST), 0, LAST), basis: 'percentile' }
  }
  const decile = LAST - Math.floor(clamp(readiness, 0, 100) / 10)
  return { index: clamp(decile, 0, LAST), basis: 'decile' }
}

/** Half-width in px, linear in tooth count: 11t → 34, 34t → 118. */
export function cogHalfWidth(index: number): number {
  const teeth = COG_TEETH[clamp(index, 0, LAST)]
  const t = (teeth - COG_TEETH[0]) / (COG_TEETH[LAST] - COG_TEETH[0])
  return Math.round(34 + t * 84)
}
