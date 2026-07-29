/**
 * CoachRead — what the chapter's numbers mean, in sentences.
 *
 * Purple is the app's established "this is the coach talking, not a
 * measurement" signal (pen Coach's Read, node qyeQT). Keeping it visually
 * distinct from evidence cards is what lets a reader skip interpretation and
 * go straight to data, or the reverse.
 *
 * ── Why the ground is dark, not a purple wash ──
 * This card's first real home is Heute, which paints a full-screen WebGL
 * readiness aura behind everything. A translucent 12 % purple (#8B5CF612) let
 * that aura through: on the light faces — planned-rest #3E9BFF, ready #16E08A
 * — the card became pale lavender carrying near-white body text and a #C4B5FD
 * eyebrow that disappeared outright. TodayTab's own coach card hit this and
 * fixed it by mixing the same 12 % purple into a DARK ground and moving the
 * purple identity to the border, the orb and the eyebrow, where it reads. That
 * fix lives here now, so every chapter inherits it instead of rediscovering it.
 */
import { Link } from 'react-router-dom'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface CoachReadProps {
  eyebrow: string
  body: string
  to?: string
  /** Renders the coach's gradient orb with this glyph inside. Omit for no orb. */
  icon?: LucideIcon
  children?: React.ReactNode
}

export default function CoachRead({ eyebrow, body, to, icon: Icon, children }: CoachReadProps) {
  const inner = (
    <div
      data-coach-read
      className="flex gap-3 rounded-[24px] p-4"
      style={{
        background: 'color-mix(in srgb, #8B5CF6 12%, #0A0C0FCC)',
        border: '1px solid #8B5CF659',
        backdropFilter: 'blur(10px)',
      }}
    >
      {Icon ? (
        <div
          data-coach-orb
          className="shrink-0 grid place-items-center rounded-full"
          style={{
            width: 38, height: 38,
            background: 'linear-gradient(45deg, #8B5CF6, #59C3FF)',
            boxShadow: '0 0 12px #8B5CF666',
          }}
        >
          <Icon size={20} strokeWidth={2} style={{ color: '#FFFFFF' }} />
        </div>
      ) : null}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="eyebrow" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: '#C4B5FD' }}>{eyebrow}</span>
          {to ? <ChevronRight size={16} className="shrink-0" style={{ color: '#C4B5FD' }} /> : null}
        </div>
        <p style={{ fontSize: 13.5, fontWeight: 500, color: '#FFFFFFF2', lineHeight: 1.4 }}>{body}</p>
        {children}
      </div>
    </div>
  )
  return to ? <Link to={to} className="hover-card block">{inner}</Link> : inner
}
