import { format, parseISO } from 'date-fns'
import type { MesoBlockContext } from '../../api/weeks'
import type { CoachLanguage } from '../../contexts/LanguageContext'

interface WeekPrefaceProps {
  preface: string
  mesoBlock: MesoBlockContext
  weekStart: string
  weekEnd: string
  language: CoachLanguage
}

const PHASE_LABEL: Record<string, string> = {
  base: 'Base', build1: 'Build', build2: 'Build', build: 'Build',
  peak: 'Peak', race_prep: 'Race prep', maintenance: 'Maintenance',
  recovery: 'Recovery', taper: 'Taper',
}

function humanPhase(phase: string): string {
  return PHASE_LABEL[phase] ?? phase
}

/** Extract the first sentence from a paragraph (≤140 chars). */
function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]*[.!?]/)
  const sentence = match ? match[0].trim() : text.trim()
  return sentence.length > 140 ? sentence.slice(0, 137) + '…' : sentence
}

/**
 * WeekPreface — Phase 7.05 "One-Screen Truth" edition.
 *
 * Collapsed to a single-sentence weekly intent + mesocycle eyebrow.
 * No h1, no multi-paragraph, no dominant numeral.
 * Tightened to px-5 py-4 (was p-6).
 */
export default function WeekPreface({
  preface,
  mesoBlock,
  weekStart,
  weekEnd,
  language: _language,
}: WeekPrefaceProps) {
  let dateRange = ''
  try {
    const start = parseISO(weekStart)
    const end = parseISO(weekEnd)
    dateRange = `${format(start, 'EEE d')} – ${format(end, 'EEE d')}`
  } catch {
    dateRange = `${weekStart} – ${weekEnd}`
  }

  const blockNum = mesoBlock.block_index_in_meso + 1
  const eyebrow = `${humanPhase(mesoBlock.phase).toUpperCase()} · WEEK ${blockNum} · ${dateRange}`

  const sentence = firstSentence(preface)

  // Race-week chip
  const daysToEvent = mesoBlock.days_to_event
  const showRaceChip = daysToEvent != null && daysToEvent <= 35
  const isRaceWeek = daysToEvent != null && daysToEvent <= 7
  const eventType = mesoBlock.target_event_type ?? 'event'

  return (
    <div
      className="rounded-xl px-5 py-4 border"
      style={{
        backgroundColor: 'var(--color-paper-2)',
        borderColor: 'var(--color-rule)',
      }}
    >
      {/* Mesocycle eyebrow */}
      <p className="eyebrow mb-2" style={{ color: 'var(--color-muted)' }}>
        {eyebrow}
      </p>

      {/* One-sentence intent — max 2 lines */}
      <p
        className="text-[14px] leading-snug"
        style={{
          color: 'var(--color-ink-2)',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        {sentence}
      </p>

      {/* Race chip */}
      {showRaceChip && (
        <p className="eyebrow mt-2" style={{ color: 'var(--color-coral)' }}>
          {isRaceWeek ? 'RACE WEEK' : `${daysToEvent} days to ${eventType}`}
        </p>
      )}
    </div>
  )
}
