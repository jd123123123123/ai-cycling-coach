import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'

/**
 * PageTransition — subtle, fast route-change crossfade.
 *
 * Wraps the routed content in an <AnimatePresence> keyed on the current
 * pathname. Each page dissolves into the next, giving navigation a modern,
 * native feel without turning the app into a carousel.
 *
 * ── Why a grid-stack crossfade (not mode="wait") ──────────────────────────
 * The app's chrome — MobileBottomNav and CoachFab — is `position: fixed` and
 * lives *inside* each routed page. With mode="wait" the outgoing page (which
 * owns the nav) fully unmounts before the incoming page mounts its own nav, so
 * the fixed bar visibly blinks out and back between two nav-bearing pages.
 *
 * Instead we render the outgoing and incoming pages into the SAME CSS-grid
 * cell (grid-area 1/1) so they overlap during the ~220 ms crossfade. At every
 * instant at least one page — and therefore at least one fully-opaque nav — is
 * mounted, so the bar never disappears; between two nav pages the two bars sit
 * pixel-aligned and simply cross-dissolve.
 *
 * ── Why opacity-only (no transform / blur / scale) ───────────────────────
 * A `transform` or `filter` on any ancestor establishes a containing block,
 * which would yank the fixed nav/FAB out of viewport space and make them lurch
 * mid-transition. Opacity is the only visual channel that never breaks
 * `position: fixed`, so the content dissolves while the fixed chrome stays
 * pinned — no reflow, no layout shift, no horizontal scrollbar. The grid
 * container is `position: static` with no transform for the same reason.
 *
 * ── Reduced motion (WCAG 2.3.3) ──────────────────────────────────────────
 * Collapses to a near-instant (60 ms) opacity swap.
 *
 * `initial={false}` suppresses the very first mount so the cold app load
 * doesn't flash-fade — only *subsequent* navigations animate. Lazy routes that
 * suspend show their AppSplash fallback inside the already-faded-in wrapper, so
 * the fallback never double-animates.
 */

const EASE_OUT = [0.22, 1, 0.36, 1] as const // native-feeling deceleration

export default function PageTransition({
  routeKey,
  children,
}: {
  routeKey: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()

  const transition = reduce
    ? { duration: 0.06, ease: 'linear' as const }
    : { duration: 0.22, ease: EASE_OUT }

  return (
    // Grid container: every page maps to the single 1/1 cell, so the outgoing
    // and incoming pages overlap instead of stacking (which would jump the
    // layout). Static position + no transform keeps fixed chrome pinned.
    <div style={{ display: 'grid', minWidth: 0 }}>
      <AnimatePresence initial={false}>
        <motion.div
          key={routeKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          style={{ gridArea: '1 / 1', minWidth: 0 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
