import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, EASE } from './w3tokens'

/**
 * A month, drawn as the days that actually moved the number.
 *
 * WHY THIS AND NOT A PROGRESS BAR. "Rode four enormous days" and "rode every
 * single day" are different months, and a percentage renders them identically
 * — while the difference is the thing a rider is actually proud of, and the
 * thing that predicts whether they finish. One column per day, its height the
 * share of that day against the month's biggest, is the whole shape of how the
 * target is being met.
 *
 * It also reuses the language the app already speaks: `Deine Woche` draws seven
 * day tiles with a load tick, and this is that idiom stretched to a month. A
 * rider who has read one has read the other.
 *
 * AN EMPTY PAST DAY IS A SLOT, NOT A GAP. It is drawn — dim, full height's
 * worth of nothing — because a month with holes in it is information, and a
 * strip that simply omitted the quiet days would draw a flattering lie.
 *
 * Today carries the acid; days still to come are quieter than an empty past
 * day, because one of those is a failure and the other is an opportunity.
 */

export interface W3MonthStripProps {
  /** One number per day of the period, oldest first. */
  days: number[]
  /** 1-based index of today within the period; ≤ 0 hides the marker. */
  todayIndex: number
  /** Drawn height of the strip. */
  height?: number
  /** Set when the target is already met — the whole strip goes acid. */
  completed?: boolean
}

export default function W3MonthStrip({
  days, todayIndex, height = 64, completed = false,
}: W3MonthStripProps) {
  const reduce = useReducedMotion()
  if (days.length === 0) return null

  const peak = Math.max(...days, 0)
  // A month with nothing in it must not divide by zero, and must not draw a
  // full-height row of ones either.
  const share = (v: number) => (peak > 0 ? v / peak : 0)
  const moved = days.filter((d) => d > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: '100%' }}>
      <div
        role="img"
        aria-label={`${moved} von ${days.length} Tagen haben gezählt`}
        style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height, width: '100%' }}>
        {days.map((v, i) => {
          const isToday = i + 1 === todayIndex
          const isFuture = todayIndex > 0 && i + 1 > todayIndex
          const s = share(v)
          // A day that counted is never thinner than 3px: at 1/40th of the
          // month's peak it would otherwise vanish, and a day that happened
          // must not look like a day that did not.
          const h = v > 0 ? Math.max(3, Math.round(s * height)) : 2
          const hue = v > 0
            ? (completed ? T.acid : isToday ? T.acid : T.acidDeep)
            : isFuture ? T.d1 : T.heroOff
          return (
            <motion.div
              key={i}
              initial={reduce ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: EASE, delay: Math.min(i, 31) * 0.012 }}
              style={{
                flex: 1, minWidth: 0, height: h, borderRadius: 2,
                transformOrigin: 'bottom',
                background: hue,
                // Today gets an edge rather than a brighter fill: on a day the
                // rider has not ridden yet there is nothing to make brighter.
                boxShadow: isToday ? `0 0 0 1px ${T.acid}` : undefined,
                opacity: v > 0 ? 1 : isFuture ? 0.5 : 0.85,
              }} />
          )
        })}
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: T.quiet, fontFamily: FONT,
      }}>
        {moved} VON {days.length} TAGEN HABEN GEZÄHLT
      </span>
    </div>
  )
}
