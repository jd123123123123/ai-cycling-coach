export const MORNING_GATE_ID = 'morning'

/**
 * The briefing opens BEFORE the other gates on a launch where several are
 * eligible. The delay is the priority (see `w3gates`): shortest wins, and on a
 * morning the sheet about today outranks the housekeeping.
 *
 * It is still a beat rather than zero — a sheet that is already there when the
 * screen paints reads as a page, not as something handed to you.
 */
export const MORNING_OPEN_DELAY_MS = 600

/** From this hour, local. Earlier than most alarms; a 04:30 gravel start is a
 *  morning by any definition a rider would use. */
export const MORNING_FROM_HOUR = 4
/**
 * Up to but not including this hour, local.
 *
 * A greeting that says "Guten Morgen" at 16:00 is a bug the rider can read, so
 * the briefing simply does not appear in the afternoon. A rider who only ever
 * opens the app after lunch never sees one — which is right: by then the Today
 * screen is a better answer than a summary of it, and it is one tap away.
 */
export const MORNING_UNTIL_HOUR = 12

export function isMorning(now: Date): boolean {
  const h = now.getHours()
  return h >= MORNING_FROM_HOUR && h < MORNING_UNTIL_HOUR
}

/**
 * The "already read" key, keyed on the LOCAL calendar day.
 *
 * Local and not UTC: the day this is about is the rider's, and a UTC key rolls
 * over mid-evening for anyone west of Greenwich — they would get tomorrow's
 * briefing tonight and nothing in the morning.
 *
 * It expires by itself at midnight, which is why this belongs in localStorage
 * rather than sessionStorage: "I have read today's" has to survive a reload and
 * a second tab, and must not survive the night.
 */
export function morningDayKey(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `ridr.morning.${y}-${m}-${d}`
}
