import { apiClient } from './client'

/**
 * The riding rhythm — one fact (how much did this rider ride) at three zooms.
 *
 * The Fahrten dock used to derive its season total and its twelve monthly bars
 * client-side from a year of activity rows, which meant the panel could only
 * ever answer at ONE grain: whatever the fetch window happened to be. Asking
 * the server for the three windows instead is both cheaper (three summaries
 * rather than a year of rides) and honest at every zoom — a month bucket knows
 * its own rides, hours and metres of climbing rather than having them
 * reverse-engineered from a normalised bar height.
 *
 * Backend: GET /activities/rhythm.
 */

/** One bar of one grain. `start` is the ISO date the bucket opens on. */
export interface RhythmBucket {
  start: string
  km: number
  rides: number
  hours: number
  elevation_m: number
}

/** One window, plus the buckets it is drawn as. */
export interface RhythmGrain {
  /** The server's own name for the window — "2026", "Letzte 30 Tage", … */
  label: string
  km: number
  rides: number
  hours: number
  elevation_m: number
  buckets: RhythmBucket[]
}

/**
 * season = the calendar year to date, drawn as its twelve months.
 * month  = the last 30 days, drawn as the ISO weeks covering exactly that.
 * week   = the last 7 days, drawn as those seven days.
 *
 * EVERY GRAIN'S BARS SPAN ITS OWN WINDOW, and the bucket count therefore is
 * NOT fixed: the month grain is five weeks on most days and six on a Monday,
 * when the window opens mid-week and the first bar is that week's tail. Render
 * however many buckets arrive — a hard-coded count would silently drop one.
 *
 * The rule behind that is worth keeping: a grain's totals are the sum of its
 * own bars. Twelve weekly bars under a thirty-day headline would have been a
 * quarter's riding beneath a month's number.
 *
 * `label` is the server's, and it is German and names the real window —
 * "Letzte 30 Tage", not "September", because the 30-day figure is not
 * September's. Print it rather than composing one here.
 */
export interface ActivityRhythm {
  season: RhythmGrain
  month: RhythmGrain
  week: RhythmGrain
}

export async function fetchActivityRhythm(): Promise<ActivityRhythm> {
  const res = await apiClient.get<ActivityRhythm>('/activities/rhythm')
  return res.data
}
