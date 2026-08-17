import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { T, FONT, grow, Kicker, DASH } from './w3tokens'

/**
 * W3 · Score card — the big-number card the pen uses for a 0-100 judgement.
 *
 * Extracted from W3Today's readiness block so the SAME element can grade a
 * finished ride (execution score) as well as the morning's readiness. It owns
 * the pen's shape — huge numeral, kicker + word, optional signed note, an
 * optional right-hand aside, and the acid charge-meter — and nothing about
 * WHICH score it is showing.
 *
 * Honesty: a null `score` prints the dash and an EMPTY meter. The component
 * never invents a fill, never rounds a missing value to zero, and never
 * supplies its own copy — every string is passed in by the caller from real
 * data.
 *
 * Callers:
 *  · Today / readiness — score = readiness 0-100, label "Bereitschaft",
 *    word = the tier word, note = the day-over-day delta, aside = the RideCoin
 *    multiplier, context = the rest-day reconciliation line.
 *  · Ride review (not wired here — those files belong to other agents right
 *    now) — score = Number(vm.execScore), total = Number(vm.execTotal),
 *    label "Ausführung", word = a short verdict word, context = the AI
 *    verdict headline + body, aside = { label: 'KI-URTEIL', value: vm.aiModel }.
 */

export interface W3ScoreAside {
  label: string
  value: string
  /** Small print under the value — why the value is what it is. Null → absent. */
  caption?: string | null
  icon?: ReactNode
}

export interface W3ScoreCardProps {
  /** The score itself. Null renders "—" and an empty meter — never a zero. */
  score: number | null
  /** Denominator. When > 0 the card prints "/ total" and drives the meter with
   *  score/total. Defaults to 100 (a percentage-style score, no denominator
   *  printed). */
  total?: number | null
  /** Whether to print the "/ total" denominator beside the number. */
  showTotal?: boolean
  label: string
  word: string | null
  /** A small signed kicker under the word (e.g. "+4 ggü. gestern"). */
  note?: { text: string; favourable: boolean } | null
  accent?: string
  aside?: W3ScoreAside | null
  /** Slot under the meter — where a caller reconciles the score with the day
   *  (rest-day framing) or attaches a verdict. */
  context?: ReactNode
  onClick?: () => void
  ariaLabel?: string
}

/** The charge-meter — a row of bars filled in proportion to the real score.
 *  An honest gauge: no score → no bars, not a half-full default. */
export function W3ChargeMeter({ fill, accent = T.acid }: { fill: number | null; accent?: string }) {
  const reduce = useReducedMotion()
  const N = 18
  const filled = fill == null ? 0 : Math.max(0, Math.min(N, Math.round(fill * N)))
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 26, width: '100%' }}>
      {Array.from({ length: N }).map((_, i) => {
        const on = i < filled
        return (
          <motion.div key={i}
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={grow(i * 0.03)}
            style={{ flex: 1, height: 26, transformOrigin: 'bottom', borderRadius: 3, background: on ? accent : T.surface2, boxShadow: on ? `0 0 10px ${accent}55` : 'none' }} />
        )
      })}
    </div>
  )
}

export default function W3ScoreCard({
  score, total = 100, showTotal = false, label, word, note = null,
  accent = T.acid, aside = null, context = null, onClick, ariaLabel,
}: W3ScoreCardProps) {
  const denom = total != null && total > 0 ? total : null
  const fill = score != null && denom != null ? Math.max(0, Math.min(1, score / denom)) : null
  const Tag = onClick ? 'button' : 'div'

  return (
    <Tag
      {...(onClick ? { onClick, 'aria-label': ariaLabel } : {})}
      style={{
        width: '100%', padding: '18px 18px 16px', borderRadius: 22, background: T.surface,
        border: `1px solid ${T.stroke}`, display: 'flex', flexDirection: 'column', gap: 14,
        cursor: onClick ? 'pointer' : 'default', fontFamily: FONT, textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flex: 'none' }}>
            <span style={{ fontSize: 68, fontWeight: 700, letterSpacing: -3, lineHeight: 0.82, color: score != null ? accent : T.quiet, textShadow: score != null ? `0 0 26px ${accent}66` : 'none' }}>
              {score ?? DASH}
            </span>
            {showTotal && denom != null && (
              <span style={{ fontSize: 15, fontWeight: 700, color: T.quiet, paddingBottom: 6, flex: 'none' }}>/ {denom}</span>
            )}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <Kicker>{label}</Kicker>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: T.ink, minWidth: 0 }}>{word ?? DASH}</span>
            {note && (
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: -0.1, color: note.favourable ? accent : T.mid }}>
                {note.text}
              </span>
            )}
          </div>
        </div>
        {aside && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', minWidth: 0 }}>
            <Kicker>{aside.label}</Kicker>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {aside.icon}
              <span style={{ fontSize: 17, fontWeight: 700, color: T.ink }}>{aside.value}</span>
            </div>
            {aside.caption && (
              <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.3, color: T.quiet, textAlign: 'right', maxWidth: 140 }}>
                {aside.caption}
              </span>
            )}
          </div>
        )}
      </div>

      <W3ChargeMeter fill={fill} accent={accent} />

      {context}
    </Tag>
  )
}
