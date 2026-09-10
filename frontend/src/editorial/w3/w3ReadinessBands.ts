/** These are W3's existing score boundaries, not medical or training gates.
 * Illness, injury, the daily decision and the saved plan still take priority. */
export const READINESS_BANDS = [
  { from: 0, to: 30, label: 'Pause', word: 'Ruhe', hue: 'bad' },
  { from: 30, to: 45, label: 'Vorsicht', word: 'Locker', hue: 'warn' },
  { from: 45, to: 65, label: 'Locker', word: 'Solide', hue: 'mid' },
  { from: 65, to: 80, label: 'Bereit', word: 'Bereit', hue: 'training' },
  { from: 80, to: 100, label: 'Intensiv', word: 'Topfit', hue: 'acid' },
] as const

export function readinessBand(score: number) {
  return READINESS_BANDS.find(b => score < b.to) ?? READINESS_BANDS[4]
}
