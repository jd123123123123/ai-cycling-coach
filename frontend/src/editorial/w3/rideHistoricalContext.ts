import type { ActivityRead, PMCResponse } from '../../api/dashboard'

/** Match the calendar used to display this ride; never substitute today's date. */
export function rideCalendarDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function ridePmcWindow(pmc: PMCResponse | undefined, iso: string | null | undefined) {
  const day = rideCalendarDate(iso)
  const current = day ? pmc?.entries.find(entry => entry.date === day) ?? null : null
  if (!current || !day) return { current: null, previous: null }
  const previousDate = new Date(`${day}T12:00:00`)
  previousDate.setDate(previousDate.getDate() - 7)
  const previousDay = rideCalendarDate(previousDate.toISOString())
  return { current, previous: pmc?.entries.find(entry => entry.date === previousDay) ?? null }
}

/** Only facts that already existed when the selected ride started. */
export function rideYearActivities(activities: ActivityRead[], iso: string | null | undefined) {
  const day = rideCalendarDate(iso)
  if (!day || !iso) return []
  const cutoff = new Date(iso).getTime()
  const year = day.slice(0, 4)
  return activities.filter(activity => activity.sport === 'cycling'
    && rideCalendarDate(activity.started_at)?.startsWith(year)
    && new Date(activity.started_at).getTime() <= cutoff)
}

/** API pacing percentages use 0–100, including values below one percent. */
export function rideZoneDose(percent:number,movingSeconds:number){
  const bounded=Math.max(0,Math.min(100,percent))
  return {percent:bounded,minutes:bounded/100*movingSeconds/60}
}
