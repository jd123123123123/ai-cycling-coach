import { apiClient } from './client'

/**
 * GET /analytics/weekly-recap — the LAST COMPLETED week (Mon–Sun), assembled
 * server-side by `services/weekly_recap.build_weekly_recap`.
 *
 * This is the ONE producer of the weekly plan-vs-actual story, and it is the
 * same aggregation `weekly_wrapped` builds on. Everything on it is real:
 *
 *  - `totals` / `prev_totals` — summed from the athlete's own activities,
 *    bucketed by ATHLETE-LOCAL day (not UTC).
 *  - `planned_tss` — `planned_week_total()` over the week's stored
 *    PlannedWorkout rows, incl. dual-sport secondary sessions. `null` (never 0)
 *    when the week carried no plan the estimator could resolve.
 *  - `ctl_delta` — CTL at week end minus CTL at week start, from the real PMC
 *    series. `null` when either endpoint is missing.
 *  - `breakthroughs` — physiology-grounded PBs detected inside the week
 *    (power-curve PBs, eFTP shifts), already localized. May be empty.
 *  - `best_ride` — the week's biggest ride by TSS, or null.
 *
 * Nothing here is a fixture and nothing is inferred client-side: a field the
 * data can't back arrives as null, and the surface renders "—" or drops the
 * panel entirely.
 */

export interface WeeklyRecapTotals {
  sessions: number
  hours: number
  km: number
  tss: number
  active_days: number
}

export interface WeeklyRecapBreakthrough {
  headline: string
  detail: string
}

export interface WeeklyRecapBestRide {
  activity_id: number
  title: string | null
  date: string | null
  tss: number
  km: number
  hours: number
}

export interface WeeklyRecap {
  week_start: string            // ISO yyyy-mm-dd (Monday)
  week_end: string              // ISO yyyy-mm-dd (Sunday)
  totals: WeeklyRecapTotals
  prev_totals: WeeklyRecapTotals
  planned_tss: number | null
  ctl_delta: number | null
  breakthroughs: WeeklyRecapBreakthrough[]
  best_ride: WeeklyRecapBestRide | null
  streak: { days: number; paused: boolean }
}

export async function fetchWeeklyRecap(locale: 'en' | 'de' = 'de'): Promise<WeeklyRecap> {
  const res = await apiClient.get<WeeklyRecap>('/analytics/weekly-recap', {
    params: { locale },
  })
  return res.data
}
