import { Bike, Heart, History, Users, Zap } from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'

type Tab = 'today' | 'train' | 'recovery' | 'history' | 'social'

const TABS: {
  id: Tab
  label: string
  icon: ComponentType<{ size?: number; color?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>
  padX: number
}[] = [
  { id: 'today', label: 'TODAY', icon: Zap, padX: 14 },
  { id: 'train', label: 'TRAIN', icon: Bike, padX: 14 },
  { id: 'recovery', label: 'RECOVERY', icon: Heart, padX: 14 },
  { id: 'history', label: 'HISTORY', icon: History, padX: 14 },
  { id: 'social', label: 'SOCIAL', icon: Users, padX: 12 },
]

/**
 * The bottom tab bar, transcribed from pen component G6TmH
 * (component/TabBar): 390x88, padding [0, 16], centered. The pill "Bar" is
 * fill_container x 60, cornerRadius 100 (pill), stroke width 1, padding
 * [6, 8], space-between, center-aligned; each tab is cornerRadius 100,
 * vertical, gap 3, padding [7, 14] (Social uses [7, 12]), centered; icons
 * 24x24, labels 10px/600 Inter.
 *
 * G6TmH is a shared component in the pen reused by several older,
 * non-EDITORIAL-II mockups (their instances override the labels to
 * "Ride"/"Coach"/"Progress" etc.) — its own, un-overridden colours are the
 * file's generic $bg/$text-primary/$text-tertiary/$accent/$border
 * variables, none of which are exact matches for an EDITORIAL II token:
 *   - $text-primary #FFFFFF is an exact match for --e-ink (unused here).
 *   - $bg #0A0C0F and the Bar's own #1A1F26E6 have no exact token; the Bar
 *     is rendered with var(--e-ground) so it reads as "near-black, blends
 *     with the page" without inlining an approximated hex.
 *   - $border #262C34 has no exact token; var(--e-rule) is used as the
 *     closest "faint boundary" semantic, even though it's a white-alpha
 *     hairline rather than a solid grey.
 *   - $text-tertiary #5C6570 has no exact token; var(--e-quiet) (#767D87)
 *     is used as the closest "muted foreground" semantic.
 * None of the EDITORIAL II flagship frames (RYP0r etc.) override the
 * active-tab colours on their TabBar instance — only a much later, unrelated
 * screen (History, idGLp) does, with its own ad-hoc yellow. Since the design
 * system's whole point is "one accent per day-state, referenced not
 * branched" (see EditorialRoot), the active tab here is painted with
 * var(--st-active) — the same accent already bound by EditorialRoot for
 * every other day-state-coloured element — rather than a fixed hue.
 */
export default function TabBar({ active }: { active: Tab }) {
  return (
    <div style={{ height: 88, padding: '0 16px', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          height: 60,
          background: 'var(--e-ground)',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--e-rule)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
          padding: '6px 8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        {TABS.map(({ id, label, icon: Icon, padX }) => {
          const isActive = id === active
          const color = isActive ? 'var(--st-active)' : 'var(--e-quiet)'
          return (
            <Link
              key={id}
              to={`/e/${id}`}
              aria-current={isActive ? 'page' : undefined}
              style={{
                borderRadius: 'var(--radius-pill)',
                background: isActive ? 'color-mix(in srgb, var(--st-active) 15%, transparent)' : 'transparent',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                padding: `7px ${padX}px`,
                justifyContent: 'center',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              <Icon size={24} color={color} aria-hidden="true" />
              <span
                style={{
                  fontFamily: 'var(--e-body)',
                  fontSize: 10,
                  fontWeight: 600,
                  color,
                }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
