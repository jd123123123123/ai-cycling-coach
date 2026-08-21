import { useEffect, useState } from 'react'

/**
 * How far the hero's bottom panel is open, 0 → 1, from the page's own scroll.
 *
 * ONE PANEL THAT GROWS, rather than a compact panel with a second band beneath
 * it. The band was a separate surface, which meant a second edge where its
 * colour had to stop — and the whole point of reading the stage's ground colour
 * is that the screen should have no edges to hide. Folding the detail INTO the
 * panel removes the surface, and scrolling becomes the gesture that asks "why
 * that number" instead of a jump to another card.
 *
 * The first 130 px of travel opens it fully: far enough that a stray flick does
 * not trigger it, short enough that the answer is there before the hero leaves.
 *
 * Shared because every screen in the room needs the same gesture to mean the
 * same thing, and because two copies of a scroll listener drift in exactly the
 * way a rider notices — one panel opening a little sooner than the other.
 */
const RUNWAY_PX = 130

export function useDockOpenness(runway = RUNWAY_PX): number {
  const [open, setOpen] = useState(0)
  useEffect(() => {
    const onScroll = () => setOpen(Math.min(1, window.scrollY / runway))
    onScroll()
    // Passive: this never calls preventDefault, and saying so keeps the
    // listener off the scroll's critical path.
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [runway])
  return open
}
