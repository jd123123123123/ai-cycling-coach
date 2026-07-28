/**
 * Pure helpers for ClimbList (components/debrief/ClimbList.tsx). Split out so
 * the component file exports only a component — the repo's react-refresh rule —
 * while the thresholds stay unit-testable.
 */
/** Gradient → colour, on the same cool→hot logic the rest of the app uses for
 *  effort. Thresholds are the ones cyclists actually feel: under 4% is a drag,
 *  4–7% is a climb, 7–10% hurts, over 10% is a wall. */
export function gradeColor(pct: number): string {
  if (pct < 4) return '#38B6FF'
  if (pct < 7) return '#16E08A'
  if (pct < 10) return '#FFB020'
  return '#FA1E55'
}

/** Steepest gradient the bar scales against. Above this the bar is simply full —
 *  a 20% ramp and a 24% ramp are both "as steep as it gets" to a rider. */
const GRADE_FULL_PCT = 15

export function gradeBarFrac(pct: number): number {
  return Math.max(0.04, Math.min(1, pct / GRADE_FULL_PCT))
}

/** Human category badge. 'uncat' is deliberately rendered as nothing rather
 *  than as the string "uncat", which means nothing to a rider. */
export function categoryLabel(category: string | null | undefined): string | null {
  const c = (category ?? '').trim().toLowerCase()
  if (!c || c === 'uncat' || c === 'none') return null
  if (c === 'hc') return 'HC'
  if (/^[1-4]$/.test(c)) return `Kat. ${c}`
  return c.toUpperCase()
}
