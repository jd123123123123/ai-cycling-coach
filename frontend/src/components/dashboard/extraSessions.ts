/**
 * ExtraSessions — pure derivation for the "Zusätzliche Einheiten" / "Extra
 * sessions" card (mounted on the Today tab, below ThisWeekCard). The app plans
 * ONE bike session per day; athletes also do OTHER sessions — a second ride the
 * same day, a gym session, a run, padel/tennis, etc. This module surfaces those
 * non-primary sessions and accounts for the load they add.
 *
 * "Additional" = every activity that is NOT the primary planned bike session of
 * its day. Concretely, per local day:
 *   • the FIRST cycling activity (earliest) is the primary planned ride → excluded
 *   • every other activity that day is additional — a 2nd+ ride, or any
 *     non-cycling session (gym / run / padel-or-other).
 *
 * Load is honest: TSS/hrTSS is summed where computable (HR-bearing sessions now
 * carry hrTSS after the load fix), and a session with no computable load is
 * counted and shown duration-only, never with a fabricated number. The weekly
 * total already INCLUDES these sessions (deriveThisWeek sums every sport), so
 * the added load is expressed as a SHARE of the window total, not additive.
 *
 * No React here so the math is unit-testable in the node vitest environment.
 */
import { localDayKey } from '../../utils/loadMetrics'

export interface ExtraActivity {
  started_at?: string | null
  date?: string | null
  sport?: string | null
  tss?: number | null
  duration_seconds?: number | null
  average_hr?: number | null
  title?: string | null
}

/** Bucketed kind for icon + label. `ride` here always means a *secondary* ride
 *  (the primary bike session is excluded before bucketing). */
export type ExtraKind = 'ride' | 'gym' | 'run' | 'other'

export interface ExtraSession {
  kind: ExtraKind
  sport: string
  title: string | null
  dayKey: string
  startedAt: string | null
  durationSec: number | null
  /** Computed TSS/hrTSS, or null when no load could be honestly computed. */
  tss: number | null
  averageHr: number | null
}

export interface ExtraSessionsModel {
  /** Additional sessions in the window, newest first. */
  sessions: ExtraSession[]
  /** Count of additional sessions. */
  count: number
  /** Summed load of the additional sessions with a computable TSS (rounded). */
  extraTss: number
  /** How many additional sessions carry a computable load. */
  withLoad: number
  /** How many additional sessions have NO computable load (duration-only). */
  withoutLoad: number
  /** Total activity load in the window (all sports, incl. primary) — rounded. */
  windowTss: number
  /** extraTss ÷ windowTss as a percent, or null when the window has no load. */
  sharePct: number | null
  /** Per-kind counts, for the compact breakdown chips. */
  byKind: Record<ExtraKind, number>
}

function kindOf(sport: string | null | undefined): ExtraKind {
  switch ((sport ?? '').toLowerCase()) {
    case 'cycling': return 'ride'
    case 'gym': return 'gym'
    case 'running': return 'run'
    default: return 'other'
  }
}

function tsOf(a: ExtraActivity): string | null {
  return a.started_at ?? a.date ?? null
}

/**
 * Derive the additional-sessions model over a rolling window ending today.
 * `windowDays` counts today + (windowDays − 1) prior days (default 7).
 * `today` is injectable for deterministic tests.
 */
export function deriveExtraSessions(
  activities: ExtraActivity[] | undefined | null,
  today: Date = new Date(),
  windowDays = 7,
): ExtraSessionsModel {
  const acts = activities ?? []

  // Window lower bound: start-of-day, (windowDays − 1) days before today.
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (windowDays - 1))

  const inWindow = acts.filter((a) => {
    const ts = tsOf(a)
    if (!ts) return false
    return new Date(ts).getTime() >= start.getTime()
  })

  // Window total load (all sports, incl. the primary ride) — the denominator
  // the added-load share is measured against.
  const windowTss = Math.round(inWindow.reduce((s, a) => s + (a.tss ?? 0), 0))

  // Group by local day, then pick the day's primary bike session (earliest
  // cycling activity). Everything else that day is "additional".
  const byDay = new Map<string, ExtraActivity[]>()
  for (const a of inWindow) {
    const k = localDayKey(tsOf(a) ?? 0 as unknown as string)
    const list = byDay.get(k) ?? []
    list.push(a)
    byDay.set(k, list)
  }

  const sessions: ExtraSession[] = []
  for (const [dayKey, list] of byDay) {
    const sorted = [...list].sort(
      (x, y) => new Date(tsOf(x) ?? 0).getTime() - new Date(tsOf(y) ?? 0).getTime(),
    )
    // Primary = first cycling activity of the day (the planned bike session).
    const primaryIdx = sorted.findIndex((a) => (a.sport ?? '').toLowerCase() === 'cycling')
    sorted.forEach((a, i) => {
      if (i === primaryIdx) return // the planned ride — not additional
      sessions.push({
        kind: kindOf(a.sport),
        sport: (a.sport ?? 'other').toLowerCase(),
        title: a.title ?? null,
        dayKey,
        startedAt: tsOf(a),
        durationSec: a.duration_seconds ?? null,
        tss: a.tss ?? null,
        averageHr: a.average_hr ?? null,
      })
    })
  }

  // Newest first.
  sessions.sort((x, y) => new Date(y.startedAt ?? 0).getTime() - new Date(x.startedAt ?? 0).getTime())

  const withLoad = sessions.filter((s) => s.tss != null).length
  const withoutLoad = sessions.length - withLoad
  const extraTss = Math.round(sessions.reduce((s, x) => s + (x.tss ?? 0), 0))
  const sharePct = windowTss > 0 ? Math.round((extraTss / windowTss) * 100) : null

  const byKind: Record<ExtraKind, number> = { ride: 0, gym: 0, run: 0, other: 0 }
  for (const s of sessions) byKind[s.kind] += 1

  return {
    sessions,
    count: sessions.length,
    extraTss,
    withLoad,
    withoutLoad,
    windowTss,
    sharePct,
    byKind,
  }
}
