/**
 * MomentCard — the single most notable thing on this chapter right now.
 *
 * The amber ground and outer glow are lifted from Ride Recap's "Effort Moment"
 * (pen node Q4pCdz), whose whole job is to be the one block your eye lands on.
 * That only works if there is exactly ONE per page — `data-moment` makes a
 * second one detectable in tests rather than a thing reviewers must notice.
 */
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export interface MomentCardProps {
  eyebrow: string
  headline: string
  support?: string | null
  supportColor?: string
  to?: string
  children?: React.ReactNode
}

export default function MomentCard({ eyebrow, headline, support, supportColor, to, children }: MomentCardProps) {
  const body = (
    <div
      data-moment
      className="flex flex-col gap-3 rounded-[24px] p-[18px]"
      style={{
        background: 'linear-gradient(315deg, #2A1F0E 0%, #1A1410 50%, #241019 100%)',
        border: '1px solid #FFD1664D',
        boxShadow: '0 12px 32px #00000073, 0 0 60px 2px #FFD16633',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', color: '#FFD166' }}>{eyebrow}</span>
        {to ? <ChevronRight size={16} style={{ color: '#FFD166' }} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className="num-display" style={{ fontSize: 22, color: 'var(--color-ink)' }}>{headline}</span>
        {support ? <span style={{ fontSize: 13, color: supportColor ?? 'var(--color-muted)' }}>{support}</span> : null}
      </div>
      {children}
    </div>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}
