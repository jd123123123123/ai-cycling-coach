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
import { Bike, Footprints, Dumbbell } from 'lucide-react'
import type {
  ActivityWrapup,
  CompliancePair,
  PostRideReview as PostRideReviewType,
  RideGrade,
} from '../../api/coach'
import type { CoachLanguage } from '../../contexts/LanguageContext'
import { complianceDirectionText, gradeLabel } from '../../utils/coachLanguage'
import { formatSigned } from '../../utils/format'
import { useT } from '../../contexts/LocaleContext'

type Grade = NonNullable<PostRideReviewType['grade']>

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
  const copy = simpleMode
    ? complianceDirectionText(pair.band, overLabel)
    : `${symbol} ${formatSigned(pair.delta_pct, 0)}% vs target`
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

// ─── Multi-activity helpers (Step 3) ──────────────────────────────────────

const SPORT_ICON: Record<string, React.ReactNode> = {
  cycling: <Bike size={14} strokeWidth={1.8} />,
  running: <Footprints size={14} strokeWidth={1.8} />,
  gym: <Dumbbell size={14} strokeWidth={1.8} />,
}

function formatHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  if (h <= 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const COMPLIANCE_CHIP_TONE: Record<RideGrade, { fg: string; bg: string }> = {
  perfect: { fg: '#ffffff', bg: '#7c9e7e' },
  strong: { fg: '#ffffff', bg: '#b5874f' },
  okay: { fg: 'var(--color-ink)', bg: 'var(--color-paper-2)' },
  overcooked: { fg: '#ffffff', bg: '#c4614c' },
  undercooked: { fg: '#ffffff', bg: '#9b8a6b' },
}

function ActivityRow({
  activity,
  index,
  language,
}: {
  activity: ActivityWrapup
  index: number
  language: CoachLanguage
}) {
  const icon = SPORT_ICON[activity.sport] ?? SPORT_ICON.cycling
  const tssLabel = language === 'simple' ? 'pts' : 'TSS'
  const tssDisp =
    typeof activity.tss === 'number' ? Math.round(activity.tss) : null
  const durDisp =
    typeof activity.duration_minutes === 'number'
      ? formatHM(activity.duration_minutes)
      : null
  const distDisp =
    typeof activity.distance_km === 'number' && activity.distance_km > 0
      ? `${activity.distance_km.toFixed(1)} km`
      : null
  const grade = activity.compliance_grade ?? null
  const chipTone = grade ? COMPLIANCE_CHIP_TONE[grade] : null

  return (
    <motion.div
      className="flex items-center gap-3 py-3"
      style={{ borderTop: index === 0 ? 'none' : '1px solid var(--color-rule)' }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.08 + index * 0.06, ease: 'easeOut' }}
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded-full shrink-0"
        style={{
          width: 28,
          height: 28,
          backgroundColor: 'var(--color-paper-2)',
          border: '1px solid var(--color-rule)',
          color: 'var(--color-ink-2)',
        }}
      >
        {icon}
      </span>
      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
        <span
          className="text-[13px] leading-tight truncate"
          style={{ color: 'var(--color-ink)', fontWeight: 500 }}
          title={activity.title}
        >
          {activity.title}
        </span>
        <span
          className="num-mono text-[11px] leading-tight"
          style={{ color: 'var(--color-muted)' }}
        >
          {[durDisp, distDisp].filter(Boolean).join(' · ') || '—'}
        </span>
      </div>
      {tssDisp != null && (
        <span
          className="num-mono inline-flex items-baseline gap-1 rounded-full px-2.5 py-1 shrink-0"
          style={{
            backgroundColor: 'var(--color-paper-2)',
            border: '1px solid var(--color-rule)',
            color: 'var(--color-ink)',
            fontSize: 12,
          }}
        >
          <span style={{ fontWeight: 600 }}>{tssDisp}</span>
          <span style={{ color: 'var(--color-muted)', fontSize: 10 }}>
            {tssLabel}
          </span>
        </span>
      )}
      {grade && chipTone && (
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 shrink-0"
          style={{
            backgroundColor: chipTone.bg,
            color: chipTone.fg,
            border: '1px solid var(--color-rule)',
            fontSize: 10.5,
            letterSpacing: '0.04em',
            fontWeight: 500,
          }}
        >
          {gradeLabel(grade, language)}
        </span>
      )}
    </motion.div>
  )
}

function MultiActivityReview({
  review,
  language,
}: {
  review: PostRideReviewType
  language: CoachLanguage
}) {
  const t = useT()
  const totals = review.totals ?? {
    tss: review.tss?.actual ?? 0,
    duration_minutes:
      typeof review.duration?.actual === 'number'
        ? Math.round(review.duration.actual)
        : 0,
    distance_km: 0,
    count: review.activities?.length ?? 0,
  }
  const activities = review.activities ?? []
  const tssDisp = Math.round(totals.tss || 0)
  const durDisp = formatHM(totals.duration_minutes || 0)
  const eyebrow = language === 'simple' ? t('today_you_trained_eyebrow') : t('todays_sessions_eyebrow')

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
      {/* Stacked summary header — count · TSS · duration */}
      <div className="flex flex-col gap-1.5">
        <span className="eyebrow" style={{ color: 'var(--color-forest)' }}>
          {eyebrow}
        </span>
        <h3
          className="num-display leading-tight"
          style={{
            fontSize: 'clamp(22px, 3vw, 30px)',
            color: 'var(--color-ink)',
            fontStyle: 'italic',
            fontVariationSettings: '"opsz" 96, "SOFT" 30',
          }}
        >
          <span className="num-mono" style={{ fontStyle: 'normal' }}>
            {totals.count}
          </span>{' '}
          sessions ·{' '}
          <span className="num-mono" style={{ fontStyle: 'normal' }}>
            {tssDisp}
          </span>{' '}
          {language === 'simple' ? 'pts' : 'TSS'} ·{' '}
          <span className="num-mono" style={{ fontStyle: 'normal' }}>
            {durDisp}
          </span>
        </h3>
      </div>

      {/* Per-row mini-cards */}
      <div
        className="flex flex-col pt-2"
        style={{ borderTop: '1px solid var(--color-rule)' }}
      >
        {activities.map((a, i) => (
          <ActivityRow
            key={`${a.title}-${i}`}
            activity={a}
            index={i}
            language={language}
          />
        ))}
      </div>

      {/* Combined narrative */}
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

      {/* Tomorrow setup (next-session nudge) */}
      <motion.div
        className="flex gap-2.5 pt-3"
        style={{ borderTop: '1px solid var(--color-rule)' }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.48, ease: 'easeOut' }}
      >
        <span
          className="inline-block w-[3px] rounded-sm flex-shrink-0"
          style={{ backgroundColor: 'var(--color-amber)' }}
          aria-hidden
        />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="eyebrow" style={{ color: 'var(--color-amber)' }}>
            {language === 'simple' ? t('tomorrow_short_label') : t('tomorrow_setup_label')}
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

// ─── Main component ──────────────────────────────────────────────────────

interface Props {
  review: PostRideReviewType
  language: CoachLanguage
}

export default function PostRideReview({ review, language }: Props) {
  // Step 3 — branch on activity count. >=2 sessions render a stacked summary
  // header + per-row mini cards with per-ride compliance chips. <=1 keeps the
  // existing single-session UI exactly as it was.
  const activitiesCount = review.activities?.length ?? 0
  if (activitiesCount >= 2) {
    return <MultiActivityReview review={review} language={language} />
  }

  // Single-session fallback — `grade` is required for this layout. If it's
  // ever null (defensive against bad payloads) we render the multi-activity
  // shell anyway since totals + the single activity row still read cleanly.
  if (!review.grade) {
    return <MultiActivityReview review={review} language={language} />
  }

  const simpleMode = language === 'simple'
  const t = useT()
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
            {simpleMode ? t('today_you_rode_eyebrow') : t('todays_ride_simple_eyebrow')}
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
              {t('extra_recovery_tonight')}
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
            {simpleMode ? t('where_this_points_label') : t('goal_trajectory_label')}
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
            {simpleMode ? t('whats_next_label') : t('next_session_label')}
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
