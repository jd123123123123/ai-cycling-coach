/**
 * PostRideReview — the "mindblowingly good" fold-1 card that replaces the
 * prescribed-workout card when the athlete has already trained today.
 *
 * Visual anatomy (matches the plan spec):
 *   1. Header row: TODAY'S RIDE eyebrow + grade pill (colored + labeled)
 *   2. Headline — large Fraunces display italic, matches the grade tone
 *   3. Compliance trio — Duration · Effort · EF (or IF) with ✓/↑/↓ band chips
 *   4. Physiological read — 2-3 sentences
 *   5. Goal trajectory — one-line projection with ▸ lede
 *   6. What's next — the nudge, same ▸ lede treatment
 *
 * Motion:
 *   Stagger fade + y-offset on mount: trio → paragraphs (~150ms each).
 *
 * Simple-mode adaptations:
 *   - Grade label translated ("Perfect" → "Perfect", "Overcooked" → "Too much")
 *   - Metric labels use plain-English names ("Effort points" not "TSS")
 *   - Delta chips read in plain English ("+13% over target" not "+13% over TSS")
 *   - Third metric slot shows "Heart-to-power ratio" label instead of "EF"
 *
 * Cognitive-deload principle: only the extremes get a visual kicker.
 *   - perfect: subtle pulse/glow on the grade pill ("earned")
 *   - overcooked: small warning micro-copy below the pill
 *   - okay / strong / undercooked: no extra decoration
 */
import { motion } from 'motion/react'
import type { CompliancePair, PostRideReview as PostRideReviewType } from '../../api/coach'
import type { CoachLanguage } from '../../contexts/LanguageContext'
import { complianceDirectionText, gradeLabel } from '../../utils/coachLanguage'

type Grade = PostRideReviewType['grade']

// ─── Grade palette (paper colours) ────────────────────────────────────────

const GRADE_PALETTE: Record<
  Grade,
  { fg: string; bg: string; border: string }
> = {
  perfect: {
    fg: '#ffffff',
    bg: '#7c9e7e',
    border: 'rgba(124, 158, 126, 0.6)',
  },
  strong: {
    fg: '#ffffff',
    bg: '#b5874f',
    border: 'rgba(181, 135, 79, 0.6)',
  },
  okay: {
    fg: 'var(--color-ink)',
    bg: 'var(--color-paper-2)',
    border: 'var(--color-rule)',
  },
  overcooked: {
    fg: '#ffffff',
    bg: '#c4614c',
    border: 'rgba(196, 97, 76, 0.6)',
  },
  undercooked: {
    fg: '#ffffff',
    bg: '#9b8a6b',
    border: 'rgba(155, 138, 107, 0.6)',
  },
}

// ─── Band chip (✓ match · ↑ over · ↓ under) ───────────────────────────────

function BandChip({
  pair,
  simpleMode,
  overLabel,
}: {
  pair: CompliancePair | null | undefined
  simpleMode: boolean
  overLabel: string
}) {
  if (!pair) return null
  const symbol = pair.band === 'match' ? '✓' : pair.band === 'over' ? '↑' : '↓'
  const tone =
    pair.band === 'match'
      ? 'var(--color-forest)'
      : pair.band === 'over'
        ? '#c4614c'
        : '#9b8a6b'
  const delta = pair.delta_pct.toFixed(0)
  const sign = pair.delta_pct > 0 ? '+' : ''
  const copy = simpleMode
    ? complianceDirectionText(pair.band, overLabel)
    : `${symbol} ${sign}${delta}% vs target`
  return (
    <span
      className="num-mono text-[11px] leading-tight"
      style={{ color: tone }}
    >
      {copy}
    </span>
  )
}

// ─── One compliance cell (Duration · TSS · EF) ────────────────────────────

function MetricCell({
  label,
  value,
  unit,
  target,
  band,
  simpleMode,
  overLabel,
  delay,
}: {
  label: string
  value: string
  unit?: string
  target?: string
  band?: CompliancePair | null
  simpleMode: boolean
  overLabel: string
  delay: number
}) {
  return (
    <motion.div
      className="flex flex-col gap-1.5 min-w-0"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      <span className="eyebrow" style={{ color: 'var(--color-muted)' }}>
        {label}
      </span>
      <span
        className="num-mono leading-none"
        style={{
          fontSize: 'clamp(22px, 2.4vw, 28px)',
          color: 'var(--color-ink)',
        }}
      >
        {value}
        {unit && (
          <span
            className="ml-1 num-mono"
            style={{ fontSize: '0.6em', color: 'var(--color-muted)' }}
          >
            {unit}
          </span>
        )}
      </span>
      {target && (
        <span
          className="num-mono text-[11px]"
          style={{ color: 'var(--color-muted)' }}
        >
          {target}
        </span>
      )}
      {band && (
        <BandChip pair={band} simpleMode={simpleMode} overLabel={overLabel} />
      )}
    </motion.div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────

interface Props {
  review: PostRideReviewType
  language: CoachLanguage
}

export default function PostRideReview({ review, language }: Props) {
  const simpleMode = language === 'simple'
  const palette = GRADE_PALETTE[review.grade]

  // Duration — always shown
  const durationValue = `${Math.round(review.duration.actual)}`
  const durationTarget = `target ${Math.round(review.duration.target)}`

  // TSS / Effort points — always shown
  const tssValue = `${Math.round(review.tss.actual)}`
  const tssTarget = `target ${Math.round(review.tss.target)}`

  // Third slot — EF (preferred) or IF, with simple-mode label swap
  const hasEf = typeof review.ef === 'number'
  const hasIf = review.intensity_factor != null
  const thirdSlot = hasEf
    ? {
        label: simpleMode ? 'Heart-to-power ratio' : 'EF',
        value: (review.ef as number).toFixed(2),
        unit: undefined,
        target: typeof review.variability_index === 'number'
          ? `pace ${review.variability_index.toFixed(2)}`
          : undefined,
        band: null as CompliancePair | null,
      }
    : hasIf && review.intensity_factor
      ? {
          label: simpleMode ? 'Effort intensity' : 'IF',
          value: review.intensity_factor.actual.toFixed(2),
          unit: undefined,
          target: `target ${review.intensity_factor.target.toFixed(2)}`,
          band: review.intensity_factor,
        }
      : null

  // Grade-pill perfect-glow animation
  const isPerfect = review.grade === 'perfect'
  const isOvercooked = review.grade === 'overcooked'

  return (
    <motion.div
      className="paper-grain rounded-[18px] p-5 sm:p-6 flex flex-col gap-4 min-w-0"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-rule)',
        boxShadow: '0 10px 30px -22px rgba(20, 24, 17, 0.35)',
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header row — eyebrow + grade pill */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-forest)' }}
          >
            {simpleMode ? 'Today · you rode' : "Today's ride"}
          </span>
          <h3
            className="num-display leading-tight dashboard-break-words"
            style={{
              fontSize: 'clamp(22px, 3vw, 30px)',
              color: 'var(--color-ink)',
              fontStyle: 'italic',
              fontVariationSettings: '"opsz" 96, "SOFT" 30',
            }}
          >
            {review.headline}
          </h3>
          {isOvercooked && (
            <span
              className="eyebrow text-[11px] mt-0.5"
              style={{ color: '#c4614c' }}
            >
              Extra recovery tonight.
            </span>
          )}
        </div>

        <motion.div
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium whitespace-nowrap"
          style={{
            color: palette.fg,
            backgroundColor: palette.bg,
            border: `1px solid ${palette.border}`,
          }}
          initial={isPerfect ? { scale: 0.92 } : { scale: 1 }}
          animate={
            isPerfect
              ? {
                  scale: [1, 1.04, 1],
                  boxShadow: [
                    `0 0 0px 0px ${palette.border}`,
                    `0 0 12px 2px ${palette.border}`,
                    `0 0 0px 0px ${palette.border}`,
                  ],
                }
              : { scale: 1 }
          }
          transition={
            isPerfect
              ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
              : { duration: 0.3 }
          }
        >
          <span className="eyebrow" style={{ color: palette.fg, opacity: 0.85 }}>
            Grade
          </span>
          <span>{gradeLabel(review.grade, language)}</span>
        </motion.div>
      </div>

      {/* Compliance trio */}
      <div
        className="grid gap-4 pt-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          borderTop: '1px solid var(--color-rule)',
        }}
      >
        <MetricCell
          label={simpleMode ? 'Time' : 'Duration'}
          value={durationValue}
          unit="min"
          target={durationTarget}
          band={review.duration}
          simpleMode={simpleMode}
          overLabel={simpleMode ? 'longer than planned' : 'over target'}
          delay={0.0}
        />
        <MetricCell
          label={simpleMode ? 'Effort points' : 'TSS'}
          value={tssValue}
          target={tssTarget}
          band={review.tss}
          simpleMode={simpleMode}
          overLabel={simpleMode ? 'harder than planned' : 'over target'}
          delay={0.12}
        />
        {thirdSlot && (
          <MetricCell
            label={thirdSlot.label}
            value={thirdSlot.value}
            unit={thirdSlot.unit}
            target={thirdSlot.target}
            band={thirdSlot.band}
            simpleMode={simpleMode}
            overLabel={simpleMode ? 'above target' : 'over target'}
            delay={0.24}
          />
        )}
      </div>

      {/* Physiological read */}
      <motion.p
        className="text-[14px] sm:text-[15px] leading-relaxed dashboard-break-words pt-3"
        style={{
          color: 'var(--color-ink-2)',
          maxWidth: '62ch',
          borderTop: '1px solid var(--color-rule)',
        }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.36, ease: 'easeOut' }}
      >
        {review.physiological_read}
      </motion.p>

      {/* Goal trajectory */}
      <motion.div
        className="flex gap-2.5 pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.48, ease: 'easeOut' }}
      >
        <span
          className="inline-block w-[3px] rounded-sm flex-shrink-0"
          style={{ backgroundColor: 'var(--color-forest)' }}
          aria-hidden
        />
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-forest)' }}
          >
            {simpleMode ? 'Where this points' : 'Goal trajectory'}
          </span>
          <p
            className="text-[14px] leading-relaxed dashboard-break-words"
            style={{ color: 'var(--color-ink-2)', maxWidth: '62ch' }}
          >
            {review.goal_trajectory}
          </p>
        </div>
      </motion.div>

      {/* Next-session nudge */}
      <motion.div
        className="flex gap-2.5 pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.6, ease: 'easeOut' }}
      >
        <span
          className="inline-block w-[3px] rounded-sm flex-shrink-0"
          style={{ backgroundColor: 'var(--color-amber)' }}
          aria-hidden
        />
        <div className="flex flex-col gap-1 min-w-0">
          <span
            className="eyebrow"
            style={{ color: 'var(--color-amber)' }}
          >
            {simpleMode ? "What's next" : 'Next session'}
          </span>
          <p
            className="text-[14px] leading-relaxed dashboard-break-words"
            style={{ color: 'var(--color-ink-2)', maxWidth: '62ch' }}
          >
            {review.next_session_nudge}
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}
