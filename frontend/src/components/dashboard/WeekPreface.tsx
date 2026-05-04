import { format, parseISO } from 'date-fns'
import { RevealCascade } from './RevealCascade'
import type { MesoBlockContext } from '../../api/weeks'
import type { CoachLanguage } from '../../contexts/LanguageContext'
import { formatHours } from '../../utils/format'

interface WeekPrefaceProps {
  preface: string
  mesoBlock: MesoBlockContext
  weekStart: string
  weekEnd: string
  language: CoachLanguage
}

const PHASE_LABEL: Record<string, string> = {
  base:         'Base',
  build1:       'Build',
  build2:       'Build',
  build:        'Build',
  peak:         'Peak',
  race_prep:    'Race prep',
  maintenance:  'Maintenance',
  recovery:     'Recovery',
  taper:        'Taper',
}

function humanPhase(phase: string): string {
  return PHASE_LABEL[phase] ?? phase
}

/**
 * WeekPreface — top-of-week rationale card.
 *
 * Shows the coach's weekly preface paragraph, the mesocycle block context,
 * and race-aware chip when an event is within 35 days.
 *
 * Hard rails:
 * - No new color literals. All colors via existing CSS custom properties.
 * - No new dependencies. Only date-fns (already in tree), RevealCascade, format util.
 */
export default function WeekPreface({
  preface,
  mesoBlock,
  weekStart,
  weekEnd,
  language,
}: WeekPrefaceProps) {
  const technical = language === 'technical'

  // Format date range eyebrow: "Week of Mon DD – Sun DD"
  let dateRange = ''
  try {
    const start = parseISO(weekStart)
    const end = parseISO(weekEnd)
    dateRange = `${format(start, 'EEE d')} – ${format(end, 'EEE d')}`
  } catch {
    dateRange = `${weekStart} – ${weekEnd}`
  }

  const blockNum = mesoBlock.block_index_in_meso + 1
  const blockLabel = technical ? `Block ${blockNum} of 4` : `Week ${blockNum} of 4`
  const eyebrow = `Week of ${dateRange} · ${humanPhase(mesoBlock.phase)} · ${blockLabel}`

  // Dominant numeral — TSS in technical, approximate hours in simple
  const dominantNum = technical
    ? mesoBlock.weekly_tss_target.toFixed(0)
    : (() => {
        // Z2-equivalent hours estimate: TSS / 50; clamp to nearest .5
        const raw = mesoBlock.weekly_tss_target / 50
        const clamped = Math.round(raw * 2) / 2
        return formatHours(clamped * 3600)
      })()

  const dominantUnit = technical ? 'TSS' : 'target'

  // Race-week chip
  const daysToEvent = mesoBlock.days_to_event
  const showRaceChip = daysToEvent != null && daysToEvent <= 35
  const isRaceWeek = daysToEvent != null && daysToEvent <= 7
  const eventType = mesoBlock.target_event_type ?? 'event'

  return (
    <RevealCascade animation="card-enter" durationMs={400}>
      <div
        className="rounded-xl p-6 border"
        style={{
          backgroundColor: 'var(--color-paper-2)',
          borderColor: 'var(--color-rule)',
        }}
      >
        {/* Eyebrow strip */}
        <p
          className="eyebrow mb-3"
          style={{ color: 'var(--color-muted)' }}
        >
          {eyebrow}
        </p>

        {/* Dominant numeral row */}
        <div className="flex items-baseline gap-2 mb-4">
          <span
            className="num-display"
            style={{
              fontSize: 'clamp(28px, 3.6vw, 40px)',
              lineHeight: 1,
              color: 'var(--color-ink)',
              fontVariationSettings: '"opsz" 144',
            }}
          >
            {dominantNum}
          </span>
          {technical && (
            <span
              className="eyebrow"
              style={{ color: 'var(--color-muted)' }}
            >
              {dominantUnit}
            </span>
          )}
        </div>

        {/* Preface paragraph */}
        <p
          className="text-[15px] leading-relaxed"
          style={{ color: 'var(--color-ink-2)', maxWidth: '72ch' }}
        >
          {preface}
        </p>

        {/* Race-week chip */}
        {showRaceChip && (
          <div className="mt-3">
            {isRaceWeek ? (
              <span
                className="eyebrow"
                style={{ color: 'var(--color-coral)' }}
              >
                RACE WEEK
              </span>
            ) : (
              <span
                className="eyebrow"
                style={{ color: 'var(--color-coral)' }}
              >
                {daysToEvent} days to {eventType}
              </span>
            )}
          </div>
        )}
      </div>
    </RevealCascade>
  )
}
