import type { ReactNode } from 'react'
import type { DayState } from './state/dayState'
import './tokens.css'

/**
 * The EDITORIAL II shell. Owns the page ground, the 390-wide column, the safe
 * areas, and the portal target every bottom sheet mounts into. It also binds
 * --st-active so components reference one accent variable instead of branching
 * on the day state themselves.
 *
 * Ground fill and horizontal layout are pen-verified against frame `RYP0r`
 * (Flagship · Rest · EDITORIAL II): the root frame carries no horizontal
 * padding of its own — every section pads itself 24px — and its background
 * is the `--e-bg` token. The pen has no safe-area concept (its StatusBar is
 * baked-in mockup content), so `env(safe-area-inset-*)` is the real-device
 * translation of that intent.
 */
export default function EditorialRoot({
  state = 'rest',
  children,
}: {
  state?: DayState
  children: ReactNode
}) {
  return (
    <div
      className="editorial-root"
      style={{
        // @ts-expect-error — custom property on an inline style is valid CSS
        '--st-active': `var(--st-${state})`,
        background: 'var(--e-bg)',
        color: 'var(--e-ink)',
        fontFamily: 'var(--e-body)',
        minHeight: '100dvh',
        width: '100%',
        maxWidth: 390,
        margin: '0 auto',
        position: 'relative',
        overflowX: 'hidden',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {children}
      <div id="editorial-sheet-root" />
    </div>
  )
}
