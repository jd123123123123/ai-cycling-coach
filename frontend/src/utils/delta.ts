/**
 * delta.ts — polarized accent tone system for the 06.2 token system.
 *
 * Maps numeric percent-changes to semantic tones, then to CSS var() strings.
 * Thresholds from research doc §2.4.3.
 *
 * No external dependencies.
 */

export type DeltaTone = 'muted' | 'forest-2' | 'forest' | 'amber' | 'alert'

/**
 * toneFromPct — maps a percent change to a semantic tone.
 *
 * Thresholds:
 *   |Δ| < 3           → 'muted'    (noise, no signal)
 *   3..10 in good dir → 'forest-2' (positive signal)
 *   >10  in good dir  → 'forest'   (strong positive)
 *   3..10 in bad dir  → 'amber'    (caution)
 *   >10  in bad dir   → 'alert'    (negative signal)
 *
 * @param pctChange  Percent change (e.g. +12 = up 12%). null/undefined/NaN → 'muted'.
 * @param direction  'good' = positive is good (e.g. HRV up); 'bad' = positive is bad (e.g. RHR up).
 */
export function toneFromPct(
  pctChange: number | null | undefined,
  direction: 'good' | 'bad',
): DeltaTone {
  if (pctChange == null || !isFinite(pctChange)) return 'muted'
  const abs = Math.abs(pctChange)
  if (abs < 3) return 'muted'
  const positive = pctChange >= 0
  const isGood = direction === 'good' ? positive : !positive
  if (abs > 10) return isGood ? 'forest' : 'alert'
  return isGood ? 'forest-2' : 'amber'
}

/**
 * tokenForTone — returns the CSS var() string for a DeltaTone.
 *
 * @example
 * tokenForTone('forest-2') // 'var(--color-forest-2)'
 * tokenForTone('muted')    // 'var(--color-muted)'
 */
export function tokenForTone(tone: DeltaTone): string {
  switch (tone) {
    case 'forest':   return 'var(--color-forest)'
    case 'forest-2': return 'var(--color-forest-2)'
    case 'amber':    return 'var(--color-amber)'
    case 'alert':    return 'var(--color-alert)'
    case 'muted':    return 'var(--color-muted)'
  }
}
