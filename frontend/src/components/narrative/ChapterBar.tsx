/**
 * ChapterBar — the one element that makes four pages read as one document.
 *
 * Identical component, identical position, on all four chapters. It carries
 * where you are in the story (four dots + the chapter's own question) and where
 * the season is (phase, week in block, countdown). Without it the chapters are
 * four apps that happen to share a nav bar.
 *
 * It states a countdown only when a real event is booked. With none, it says
 * "Trainingsblock" and shows the phase — never a fabricated race date.
 */
import { CHAPTERS, chapterIndex, phaseLabel, type ChapterId, type SeasonArc } from '../../utils/seasonArc'

export const CHAPTER_TITLES: Record<ChapterId, { en: string; de: string }> = {
  today:   { en: 'WHAT DO I DO TODAY', de: 'WAS MACHE ICH HEUTE' },
  plan:    { en: 'WHERE THIS IS GOING', de: 'WO DAS HINGEHT' },
  body:    { en: 'CAN I TAKE IT',       de: 'KANN ICH DAS TRAGEN' },
  history: { en: 'DID IT WORK',         de: 'HAT ES FUNKTIONIERT' },
}

export interface ChapterBarProps {
  chapter: ChapterId
  arc: SeasonArc
  de: boolean
}

export default function ChapterBar({ chapter, arc, de }: ChapterBarProps) {
  const idx = chapterIndex(chapter)
  const title = de ? CHAPTER_TITLES[chapter].de : CHAPTER_TITLES[chapter].en
  const phase = phaseLabel(arc.phaseKey, de)
  // The week fraction needs BOTH halves to be true. One half is a fabrication.
  const weekFrac = arc.weekInBlock != null && arc.blockWeeks != null
    ? `W${arc.weekInBlock}/${arc.blockWeeks}`
    : null
  const countdown = !arc.synthesized ? `${arc.daysToEvent} ${de ? 'T' : 'D'}` : null
  const anchor = countdown ?? (de ? 'Trainingsblock' : 'Training block')

  const ariaLabel = [
    de ? `Kapitel ${idx + 1} von ${CHAPTERS.length}` : `Chapter ${idx + 1} of ${CHAPTERS.length}`,
    title.toLowerCase(),
    phase,
    weekFrac,
    countdown ? (de ? `${arc.daysToEvent} Tage bis zum Event` : `${arc.daysToEvent} days to the event`) : anchor,
  ].filter(Boolean).join(' · ')

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="flex flex-col gap-1.5 rounded-2xl px-3.5 py-2.5"
      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-rule)' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {CHAPTERS.map((c, i) => (
            <span
              key={c}
              data-chapter-dot={i === idx ? 'current' : 'other'}
              style={{
                width: i === idx ? 16 : 5,
                height: 5,
                borderRadius: 999,
                background: i === idx ? 'var(--color-accent)' : 'var(--color-rule)',
                transition: 'width 180ms ease',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-muted)' }}>
            {phase}{weekFrac ? ` · ${weekFrac}` : ''}
          </span>
          <span
            className="num-mono"
            style={{ fontSize: 11, fontWeight: 800, color: countdown ? 'var(--color-accent)' : 'var(--color-muted)' }}
          >
            {anchor}
          </span>
        </div>
      </div>
      <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFFFFF80' }}>
        {de ? `KAPITEL ${idx + 1}` : `CHAPTER ${idx + 1}`} — {title}
      </span>
    </div>
  )
}
