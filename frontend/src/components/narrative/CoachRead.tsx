/**
 * CoachRead — what the chapter's numbers mean, in sentences.
 *
 * Purple is the app's established "this is the coach talking, not a
 * measurement" signal (pen Coach's Read, node qyeQT). Keeping it visually
 * distinct from evidence cards is what lets a reader skip interpretation and
 * go straight to data, or the reverse.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface CoachReadProps {
  eyebrow: string
  body: string
  to?: string
  children?: React.ReactNode
}

export default function CoachRead({ eyebrow, body, to, children }: CoachReadProps) {
  const inner = (
    <div
      className="flex flex-col gap-2 rounded-[24px] p-4"
      style={{ background: '#8B5CF612', border: '1px solid #8B5CF63D' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#B79DFF' }}>{eyebrow}</span>
        {to ? <ChevronRight size={16} style={{ color: '#B79DFF' }} /> : null}
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--color-ink)' }}>{body}</p>
      {children}
    </div>
  )
  return to ? <Link to={to} className="block">{inner}</Link> : inner
}
