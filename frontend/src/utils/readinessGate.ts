// ── Readiness freshness gate — ONE source of truth for "can we show a score?" ─
//
// Background. The readiness-timing fix (Jul 2026) correctly refused to present
// yesterday's morning sync as today's readiness: at local midnight the training
// day rolls over but the athlete hasn't slept yet, so there is no overnight
// signal for the new day. Today rendered a calm "no overnight data yet" state.
//
// Two defects shipped with it, both visible on 2026-07-27:
//
//  1. The gate lived only in TodayTab. RecoveryTab resolved the same canonical
//     score with no gate at all — so Today said "no overnight data" while
//     Recovery, one tab away, showed a confident green 70 with HRV / RHR / sleep
//     tiles implying they were measured last night. Two answers, same day, for
//     the app's single most important number.
//
//  2. The gate could not tell "the sync hasn't landed yet this morning" (hours
//     old, resolves itself, nothing to do) from "the watch hasn't produced an
//     overnight record in a week" (days old, needs a sync). Both got the same
//     "your readiness updates after you sleep" copy — which is reassuring and
//     correct in the first case, and misleading and unactionable in the second.
//
// This module answers both: one function, imported by every surface that shows
// readiness, that reports WHY a score is or isn't trustworthy today.

/** Age in whole days beyond which a missing overnight record stops being "the
 *  morning sync hasn't landed" and starts being "your watch isn't syncing".
 *  1 = yesterday's record still counts as a pending morning; 2+ days is stale. */
export const STALE_AFTER_DAYS = 2

export type ReadinessGate =
  /** Today's own overnight record exists — show the score, no caveat. */
  | 'fresh'
  /** No overnight record for today, but a recent one (within STALE_AFTER_DAYS).
   *  The normal pre-sync morning window: resolves itself, no action needed. */
  | 'pending'
  /** No overnight record for STALE_AFTER_DAYS+ — the wearable link is the
   *  problem, not the hour of day. Needs a sync, and any score built on data
   *  this old must not be presented as today's. */
  | 'stale'
  /** No overnight record at all, ever. Athlete has no wearable — the honest
   *  empty state, never a pending promise about a sync that will never come. */
  | 'none'

export interface OvernightMetric {
  date?: string | null
  sleep_score?: number | null
  hrv_status?: number | null
  resting_hr?: number | null
}

/** True when the row carries any overnight signal (as opposed to a daytime-only
 *  row that exists but says nothing about the night). */
function hasOvernightSignal(m: OvernightMetric): boolean {
  return m.sleep_score != null || m.hrv_status != null || m.resting_hr != null
}

/** Whole days between two yyyy-MM-dd keys (a − b). Parsed as UTC midnights so
 *  the arithmetic can't be shifted by the runner's timezone; both inputs are
 *  athlete-local day keys, so the offsets cancel. */
export function dayKeyDiff(a: string, b: string): number | null {
  const pa = Date.parse(`${a}T00:00:00Z`)
  const pb = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(pa) || Number.isNaN(pb)) return null
  return Math.round((pa - pb) / 86_400_000)
}

export interface ReadinessFreshness {
  gate: ReadinessGate
  /** yyyy-MM-dd of the freshest row carrying an overnight signal, or null. */
  lastOvernightKey: string | null
  /** Whole days from that row to today. 0 = today, 1 = yesterday. null if none. */
  ageDays: number | null
}

/** Classify how fresh the athlete's overnight data is, relative to their
 *  current local day. `todayKey` is the athlete-local yyyy-MM-dd. */
export function readinessFreshness(
  metrics: OvernightMetric[] | null | undefined,
  todayKey: string,
): ReadinessFreshness {
  let lastOvernightKey: string | null = null
  let bestAge: number | null = null
  for (const m of metrics ?? []) {
    if (!m.date || !hasOvernightSignal(m)) continue
    const age = dayKeyDiff(todayKey, m.date)
    // Guard against clock skew / future-dated rows: a negative age would
    // otherwise win the "freshest" comparison and mask real staleness.
    if (age == null || age < 0) continue
    if (bestAge == null || age < bestAge) {
      bestAge = age
      lastOvernightKey = m.date
    }
  }
  if (bestAge == null) return { gate: 'none', lastOvernightKey: null, ageDays: null }
  if (bestAge === 0) return { gate: 'fresh', lastOvernightKey, ageDays: 0 }
  return {
    gate: bestAge >= STALE_AFTER_DAYS ? 'stale' : 'pending',
    lastOvernightKey,
    ageDays: bestAge,
  }
}

/** Whether a surface must withhold the readiness score. True for both the
 *  pending morning and the stale-wearable case — in neither does the number
 *  describe today — but callers should branch on the gate for copy, because
 *  "wait for your sleep" and "your watch hasn't synced in a week" are different
 *  messages and only the second has an action attached.
 *
 *  Two escapes keep the gate from firing where it would be wrong:
 *  `trainedToday` (the post-ride review card owns the hero, and the ride itself
 *  is fresher evidence than any overnight record) and `sidelined` (the
 *  self-reported illness/injury card carries its own explanation). */
export function withholdReadiness(opts: {
  gate: ReadinessGate
  trainedToday: boolean
  sidelined: boolean
}): boolean {
  if (opts.trainedToday || opts.sidelined) return false
  return opts.gate === 'pending' || opts.gate === 'stale'
}
