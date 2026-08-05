import type { ReactNode } from 'react'
import type { DayState } from './state/dayState'
import { CopyLocaleProvider } from './i18n/useCopy'
import './tokens.css'

/** States with a pen-verified --e-photo-tint-* token (Task 10.5). A state
 *  without its own plate work yet (Resting, Evening) falls back to Rest's
 *  tint rather than referencing an undefined custom property. */
const PHOTO_TINT_STATES: readonly DayState[] = ['rest', 'training', 'trained']

/**
 * The EDITORIAL II shell. Owns the page ground, the 390-wide column, the safe
 * areas, and the portal target every bottom sheet mounts into. It also binds
 * --st-active and --e-ground so components reference one accent/ground pair
 * instead of branching on the day state themselves.
 *
 * Ground fill and horizontal layout are pen-verified against the seven
 * flagship frames (RYP0r Rest, x4AxA5 Training, LdBJ4 Trained, h54Rs Resting,
 * KYS6e Evening, J5FV6 Session Detail): none of them paints the neutral
 * --e-bg — every one paints its OWN background, tinted toward that state's
 * accent (see --g-* in tokens.css). The tint is the mood system, not
 * decoration. None of the root frames carries horizontal padding of its own
 * either — every section pads itself 24px. The pen has no safe-area concept
 * (its StatusBar is baked-in mockup content), so `env(safe-area-inset-*)` is
 * the real-device translation of that intent.
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
        '--e-ground': `var(--g-${state})`,
        '--e-photo-tint': `var(--e-photo-tint-${PHOTO_TINT_STATES.includes(state) ? state : 'rest'})`,
        background: 'var(--e-ground)',
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
      <CopyLocaleProvider>
        {children}
        <div id="editorial-sheet-root" />
      </CopyLocaleProvider>
    </div>
  )
}
