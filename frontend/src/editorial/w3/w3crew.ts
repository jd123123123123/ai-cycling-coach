/**
 * The crew screens' shared vocabulary: the Week / Month / Season window and the
 * per-rider board tints. Plain module (no components) so the tabs component can
 * stay a component-only file.
 *
 * The period feeds `GET /crews/me/standings?period=…` directly: week → `week`,
 * month → `month`, season → `year`. The server names the row totals
 * `weekly_score` / `weekly_tss` for back-compat, but they are the totals for
 * the SELECTED window — so nothing here is ever labelled "weekly" unless the
 * rider is actually looking at a week.
 */

export type W3Period = 'week' | 'month' | 'year'

export const W3_PERIODS: { key: W3Period; label: string }[] = [
  { key: 'week', label: 'WOCHE' },
  { key: 'month', label: 'MONAT' },
  { key: 'year', label: 'SAISON' },
]

/** "Woche" | "Monat" | "Saison" — the noun, for prose. */
export const periodWord = (p: W3Period) => (p === 'year' ? 'Saison' : p === 'month' ? 'Monat' : 'Woche')
/** "diese Woche" | "diesen Monat" | "diese Saison" (adverbial accusative). */
export const thisPeriod = (p: W3Period) => (p === 'month' ? 'diesen Monat' : `diese ${periodWord(p)}`)

/** Per-rider board colours, in board order (rank 1 first). */
export const AVATAR_TINTS = ['#B9A7EE', '#A7D8EE', '#EEC7A7', '#A7EEC0', '#EEA7D2', '#EED7A7', '#A7C4EE', '#D2A7EE']
/** The dark end of a tint gradient. */
export const TINT_BASE = '#16131F'

const MONTHS = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ']

/** ISO yyyy-mm-dd → local Date (no tz shift from `new Date('yyyy-mm-dd')` UTC parsing). */
function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Inclusive day count of the real window, or null when the server didn't send bounds. */
export function windowDays(startISO?: string | null, endISO?: string | null): number | null {
  const a = parseISO(startISO), b = parseISO(endISO)
  if (!a || !b) return null
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

/** "10.–16. AUG" / "28. JUL – 3. AUG" — the real window, never a guess. */
export function windowChip(startISO?: string | null, endISO?: string | null): string {
  const a = parseISO(startISO), b = parseISO(endISO)
  if (!a || !b) return ''
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
  return sameMonth
    ? `${a.getDate()}.–${b.getDate()}. ${MONTHS[b.getMonth()]}`
    : `${a.getDate()}. ${MONTHS[a.getMonth()]} – ${b.getDate()}. ${MONTHS[b.getMonth()]}`
}

/** The left/right edge captions for a bucket strip. */
export function windowEdges(startISO?: string | null, endISO?: string | null): { left: string; right: string } | null {
  const a = parseISO(startISO), b = parseISO(endISO)
  if (!a || !b) return null
  return { left: `${a.getDate()}. ${MONTHS[a.getMonth()]}`, right: `${b.getDate()}. ${MONTHS[b.getMonth()]}` }
}

export interface BucketMeta {
  /** What ONE `daily_pct` bucket actually covers. */
  unit: 'day' | 'week' | 'month'
  one: string       // "Tag"
  many: string      // "Tagen"
  daysPerBucket: number
}

/**
 * The server downsamples each rider's per-day points into ≤14 buckets: ≤14 days
 * pass through as days, a month collapses to ~weekly buckets, a season to 12
 * monthly-ish ones. So a bucket only means "a day" some of the time — derive it
 * from the REAL window length and bucket count rather than from the period name
 * (a season opened on Jan 3rd is still three day-buckets).
 */
export function bucketMeta(days: number | null, buckets: number): BucketMeta {
  const per = days && buckets > 0 ? days / buckets : 1
  if (per <= 1.5) return { unit: 'day', one: 'Tag', many: 'Tagen', daysPerBucket: per }
  if (per <= 12) return { unit: 'week', one: 'Woche', many: 'Wochen', daysPerBucket: per }
  return { unit: 'month', one: 'Monat', many: 'Monaten', daysPerBucket: per }
}
