/**
 * W3 · the crew ride feed's own formatters.
 *
 * Their own `.ts` module rather than exports from `W3CrewFeed.tsx`, for the
 * same reason `w3surfaces.ts` exists: a file that exports components AND
 * functions trips `react-refresh/only-export-components` on every one of them.
 * A pure module is exempt from the rule and testable on its own.
 *
 * Named `w3rideFeed` and not `w3crewFeed`: macOS is case-insensitive, so that
 * name and `W3CrewFeed.tsx` are the SAME path to the filesystem and TypeScript
 * refuses the program outright (TS1149).
 */
import { DASH } from './w3tokens'

const nf = new Intl.NumberFormat('de-DE')

export function km(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return DASH
  const v = m / 1000
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 100 ? 1 : 0 })} km`
}

export function hm(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m) || m <= 0) return DASH
  return `${nf.format(Math.round(m))} hm`
}

export function dur(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return DASH
  const mins = Math.round(sec / 60)
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} h`
}

/**
 * "gerade eben" / "vor 3 Std" / "gestern" / "12. Aug".
 *
 * FLOOR, not round, on the way up each unit: `Math.round` turns 23 h 40 min
 * into "vor 24 Std", a duration that does not exist in a scale whose next
 * word is "gestern".
 */
export function ago(iso: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return DASH
  const min = Math.floor((now - t) / 60_000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.floor(h / 24)
  if (d === 1) return 'gestern'
  if (d < 7) return `vor ${d} Tagen`
  return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}
