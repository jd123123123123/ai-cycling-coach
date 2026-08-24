/**
 * The calendar facts a monthly challenge needs, from its period string alone.
 *
 * Pure and separate from the screen because both of these are quietly easy to
 * get wrong — month lengths vary, February is a special case twice over, and a
 * period that is not the current month has no "today" in it at all.
 */

/** How many days the period has, and where today sits in it (1-based).
 *
 *  `todayIndex` is 0 when the period is not the current month: a strip for a
 *  past month must not mark a day as today, and one for a future month has no
 *  today to mark. */
export function monthFacts(period: string, now: Date = new Date()): {
  days: number
  todayIndex: number
} {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return { days: 0, todayIndex: 0 }
  // Day 0 of the NEXT month is the last day of this one — the standard trick,
  // and the one that gets February right in a leap year without a table.
  const days = new Date(y, m, 0).getDate()
  const todayIndex =
    now.getFullYear() === y && now.getMonth() + 1 === m ? now.getDate() : 0
  return { days, todayIndex }
}

/** "noch 9 Tage" — what is left of the month, in the rider's language.
 *
 *  Null outside the current month, because "noch 9 Tage" about a month that
 *  ended in March is a lie with a number in it. */
export function daysLeftLabel(period: string, now: Date = new Date()): string | null {
  const { days, todayIndex } = monthFacts(period, now)
  if (todayIndex <= 0) return null
  const left = days - todayIndex
  if (left <= 0) return 'letzter Tag'
  return left === 1 ? 'noch 1 Tag' : `noch ${left} Tage`
}
