/**
 * NextChapter — the handoff that closes the loop.
 *
 * Every chapter ends by naming the next one, and the last one points back at
 * the first. Four pages with a stated order and an explicit exit read as a
 * document; four pages that just stop read as a menu.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { nextChapter, type ChapterId } from '../../utils/seasonArc'
import { CHAPTER_TITLES } from './ChapterBar'

export interface NextChapterProps {
  from: ChapterId
  de: boolean
}

export default function NextChapter({ from, de }: NextChapterProps) {
  const to = nextChapter(from)
  const title = de ? CHAPTER_TITLES[to].de : CHAPTER_TITLES[to].en
  return (
    <Link
      to={`/dashboard?tab=${to}`}
      className="flex items-center justify-between gap-2 rounded-full px-4 py-3"
      style={{ background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-accent) 35%, transparent)' }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--color-accent)' }}>
        {de ? 'WEITER' : 'NEXT'} — {title}
      </span>
      <ChevronRight size={16} style={{ color: 'var(--color-accent)' }} />
    </Link>
  )
}
