/**
 * Shared interval_structure schema for PlannedWorkout.
 *
 * Stored in `planned_workouts.interval_structure` as JSONB. Phase 7 extends
 * with pacing/cadence/HR zone targets; additive only — never rename or remove fields.
 *
 * Example (4x4 VO2max + warmup/cooldown, FTP-anchored):
 * {
 *   intervals: [
 *     { duration_seconds: 600,  power_target_pct_ftp: 55,  zone: 2 },  // warmup
 *     { duration_seconds: 240,  power_target_pct_ftp: 115, zone: 5 },  // effort 1
 *     { duration_seconds: 180,  power_target_pct_ftp: 55,  zone: 2 },  // recovery
 *     { duration_seconds: 240,  power_target_pct_ftp: 115, zone: 5 },
 *     { duration_seconds: 180,  power_target_pct_ftp: 55,  zone: 2 },
 *     { duration_seconds: 240,  power_target_pct_ftp: 115, zone: 5 },
 *     { duration_seconds: 180,  power_target_pct_ftp: 55,  zone: 2 },
 *     { duration_seconds: 240,  power_target_pct_ftp: 115, zone: 5 },
 *     { duration_seconds: 600,  power_target_pct_ftp: 50,  zone: 1 },  // cooldown
 *   ]
 * }
 */
export interface Interval {
  /** Duration of this block in seconds. Required, must be > 0. */
  duration_seconds: number
  /** Target power as a percentage of FTP (0-200+). Null for non-power workouts (running without power meter, gym). */
  power_target_pct_ftp: number | null
  /** Coggan 7-zone (1..7). For gym/recovery, 1 or 2 is acceptable. */
  zone: 1 | 2 | 3 | 4 | 5 | 6 | 7
}

export interface IntervalStructure {
  intervals: Interval[]
}

/**
 * Coggan 7-zone color palette. Tailwind-compatible hex values.
 * Zone 1 (active recovery) -> cool gray, Zone 7 (neuromuscular) -> red-orange.
 */
export const POWER_ZONE_COLORS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> = {
  1: '#9ca3af', // gray-400 — Active Recovery  (<55% FTP)
  2: '#60a5fa', // blue-400 — Endurance       (56-75%)
  3: '#34d399', // emerald-400 — Tempo        (76-90%)
  4: '#facc15', // yellow-400 — Threshold     (91-105%)
  5: '#fb923c', // orange-400 — VO2max        (106-120%)
  6: '#ef4444', // red-500 — Anaerobic        (121-150%)
  7: '#b91c1c', // red-700 — Neuromuscular    (>150%)
}

export const POWER_ZONE_LABELS: Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string> = {
  1: 'Z1 Recovery',
  2: 'Z2 Endurance',
  3: 'Z3 Tempo',
  4: 'Z4 Threshold',
  5: 'Z5 VO2max',
  6: 'Z6 Anaerobic',
  7: 'Z7 Neuromuscular',
}

/** Classify a %FTP value into a Coggan zone. Null %FTP -> Z2 fallback. */
export function zoneFromPctFtp(pct: number | null): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  if (pct == null) return 2
  if (pct < 55)   return 1
  if (pct <= 75)  return 2
  if (pct <= 90)  return 3
  if (pct <= 105) return 4
  if (pct <= 120) return 5
  if (pct <= 150) return 6
  return 7
}
