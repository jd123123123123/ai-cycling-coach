import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { MOTION_DURATION_MS, MOTION_EASE, prefersReducedMotion } from '../motion/useReveal'

/**
 * The one bottom-sheet primitive both day-state sheets share. Transcribed
 * from mBvke's `Sheet`/`Scrim` (NfM70/li7WR) and tEnIQ's (pLofn/zhHoN) —
 * both frames agree on every value here, so it lives once:
 *
 *  - Scrim: full-bleed rectangle, `var(--e-scrim)` (#04060ACC, the literal
 *    from both li7WR and zhHoN) plus a 14px `background_blur` effect,
 *    transcribed as `backdrop-filter: blur(14px)`.
 *  - Sheet panel: `cornerRadius: [30,30,0,0]` (top corners only — literal
 *    on both NfM70 and pLofn), `stroke: #FFFFFF1F` on the top edge only
 *    (`var(--e-rule)`, already tokenised), `padding: [14,24,36,24]`
 *    (top/right/bottom/left, identical on both frames).
 *
 * Portals into `#editorial-sheet-root` (EditorialRoot's portal target, per
 * Task 5) rather than rendering inline, so it always paints above the page
 * content regardless of where the trigger (DayRail's action pill) lives in
 * the tree.
 *
 * Motion: "rises rather than pops" (owner's ruling on chart motion, applied
 * here to the sheet's own entrance) — the panel starts translated fully off
 * the bottom edge and animates to `translateY(0)` over
 * `MOTION_DURATION_MS`/`MOTION_EASE`, the same primitives every chart's
 * mount animation uses (`motion/useReveal.ts`). `prefers-reduced-motion`
 * skips the transition entirely and paints the final state on the first
 * frame — this is a mount animation, not a viewport-entry one, so
 * `useReveal`'s `IntersectionObserver` machinery doesn't apply; only its
 * duration/easing constants and its reduced-motion guard are reused.
 *
 * Behaviour: closes on scrim click and on Escape, traps Tab focus inside
 * the panel while open, locks background scroll, and focuses the panel on
 * open so Escape/Tab work immediately. A closed sheet (`open: false`)
 * renders nothing — no `[data-sheet]` node in the DOM at all, not just a
 * hidden one.
 */
export interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** CSS colour value for the panel background — each sheet passes its own
   *  literal token (see tokens.css's Task 13 block); defaults to the
   *  current day-state ground so the primitive is still usable standalone. */
  panelBackground?: string
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

export default function Sheet({ open, onClose, children, panelBackground }: SheetProps) {
  const [reduced] = useState(prefersReducedMotion)
  const [risen, setRisen] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // `reduced` already short-circuits the transform in render (see below), so
  // there is nothing for this effect to do in that case — no direct setState
  // call in the effect body; the only sets happen inside the rAF callback
  // and the cleanup, both of which the "set-state-in-effect" lint rule treats
  // as external-system boundaries rather than a synchronous render cascade.
  useEffect(() => {
    if (!open || reduced) return
    const id = requestAnimationFrame(() => setRisen(true))
    return () => {
      cancelAnimationFrame(id)
      setRisen(false)
    }
  }, [open, reduced])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null
  const portalEl = document.getElementById('editorial-sheet-root')
  if (!portalEl) return null

  return createPortal(
    <div data-sheet style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div
        data-sheet-scrim
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--e-scrim)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        style={{
          position: 'relative',
          width: '100%',
          background: panelBackground ?? 'var(--e-ground)',
          borderTopLeftRadius: 30,
          borderTopRightRadius: 30,
          borderTop: '1px solid var(--e-rule)',
          padding: '14px 24px 36px 24px',
          display: 'flex',
          flexDirection: 'column',
          transform: reduced || risen ? 'translateY(0)' : 'translateY(100%)',
          transition: reduced ? undefined : `transform ${MOTION_DURATION_MS}ms ${MOTION_EASE}`,
        }}
      >
        {children}
      </div>
    </div>,
    portalEl,
  )
}
