/**
 * ThisWeek — pure derivation for the "Diese Woche" / "This Week" card shared by
 * the /load-form analysis screen (V3 · Load & Form, pen BIXRn) and the Today
 * tab (V3 · Today, pen OwSbv). Extracted so both surfaces show the SAME numbers
 * from the SAME real hooks (activities + current-week plan). No React here so
 * the math is unit-testable in the node vitest environment.
 */
import { localDayKey } from '../../utils/loadMetrics'

export interface ThisWeekActivity {
  started_at?: string | null
  date?: string | null
  tss?: number | null
}

export interface ThisWeekPlan {
  days?: { category?: string | null; date?: string | null; target_tss?: number | null }[]
  planned_tss_total?: number | null
}

export interface ThisWeekModel {
  /** Actual TSS logged in the current ISO week (rounded). */
  tss: number
  /** Number of activities logged in the current ISO week. */
  sessions: number
  /** 7 booleans Mon→Sun: did the athlete log an activity that day. */
  dayHas: boolean[]
  /** 0=Mon … 6=Sun for "today". */
  todayIdx: number
  /** Planned non-rest sessions this week, or null when no plan data. */
  plannedSessions: number | null
  /** Planned weekly TSS total, or null when no plan data. */
  plannedWeekTss: number | null
  /** Remaining planned TSS (never negative), or null when no plan data. */
  tssLeft: number | null
  /** Done ÷ planned, as a percent, or null when no plan data. */
  compliancePct: number | null
  /** True when the athlete has banked what the plan asked for THROUGH TODAY.
   *  Not "kept pace with the calendar" — see deriveThisWeek. */
  complianceOnPace: boolean
  /** Planned TSS scheduled Monday→today inclusive, or null without plan data.
   *  0 is meaningful and distinct from null: it means the plan asked for
   *  nothing yet this week. */
  plannedToDateTss: number | null
}

/** Monday-anchored ISO-week key (local calendar). */
export function isoWeekKey(d: Date): string {
  const day = (d.getDay() + 6) % 7
  const monday = new Date(d)
  monday.setDate(d.getDate() - day)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function dayKeyOf(a: ThisWeekActivity): string {
  return localDayKey(a.started_at ?? a.date ?? 0 as unknown as string)
}

/**
 * Derive the This-Week model from real activities + the current-week plan.
 * Mirrors LoadFormView's inline computation 1:1 so the two surfaces never
 * disagree. `today` is injectable for deterministic tests.
 */
export function deriveThisWeek(
  activities: ThisWeekActivity[] | undefined | null,
  weekPlan: ThisWeekPlan | undefined | null,
  today: Date = new Date(),
): ThisWeekModel {
  const acts = activities ?? []
  const todayIdx = (today.getDay() + 6) % 7
  const key = isoWeekKey(today)
  const inWeek = acts.filter((a) => isoWeekKey(new Date(a.started_at ?? a.date ?? 0)) === key)
  const tss = Math.round(inWeek.reduce((s, a) => s + (a.tss ?? 0), 0))

  const dayHas = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - (todayIdx - i))
    const dk = localDayKey(d)
    return inWeek.some((a) => dayKeyOf(a) === dk)
  })

  const days = weekPlan?.days ?? []
  const plannedSessions = days.filter((d) => d.category !== 'rest').length || null
  const plannedWeekTss = weekPlan?.planned_tss_total ?? null
  const tssLeft = plannedWeekTss != null ? Math.max(0, Math.round(plannedWeekTss - tss)) : null
  const compliancePct = plannedWeekTss != null && plannedWeekTss > 0
    ? Math.round((tss / plannedWeekTss) * 100)
    : null

  // On-pace is measured against what the PLAN scheduled through today, not
  // against how much of the calendar has elapsed.
  //
  // The old rule was `compliancePct >= (todayIdx + 1) / 7 * 100`, which assumes
  // training load is spread evenly Monday→Sunday. Real plans are not: this
  // athlete's Monday is a scheduled rest day. Doing exactly what the coach
  // asked — nothing — scored 0 % against a 14 % bar and greyed the card out,
  // so the app's own plan made the athlete look behind on the one day it had
  // told them to stay off the bike. That is the "guilt by default" pattern the
  // product explicitly rejects, and here it was also just wrong.
  //
  // Summing target_tss over the days dated up to and including today gives the
  // honest bar. Falls back to the calendar approximation only when the plan
  // rows carry no dates (older payloads).
  const todayKey = localDayKey(today)
  const datedDays = days.filter((d) => typeof d.date === 'string' && d.date)
  const plannedToDateTss = datedDays.length > 0
    ? Math.round(
        datedDays
          .filter((d) => (d.date as string) <= todayKey)
          .reduce((s, d) => s + (d.target_tss ?? 0), 0),
      )
    : null
  const complianceOnPace = plannedToDateTss != null
    // `>=` with a 0 target means a correctly-observed rest day counts as on
    // pace, which is the whole point.
    ? tss >= plannedToDateTss
    : compliancePct != null && compliancePct >= ((todayIdx + 1) / 7) * 100

  return {
    tss,
    sessions: inWeek.length,
    dayHas,
    todayIdx,
    plannedSessions,
    plannedWeekTss,
    tssLeft,
    compliancePct,
    complianceOnPace,
    plannedToDateTss,
  }
}
