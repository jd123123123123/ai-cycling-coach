import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'

export interface Scrub<T extends HTMLElement> {
  /** Attach to the element whose own rendered width is the x-axis `positions` are percentages of. */
  ref: React.RefObject<T | null>
  /** The nearest point currently being read, or null when nothing has been touched (or it's been cleared). */
  index: number | null
  select: (index: number) => void
  clear: () => void
  /** A ready-made onClick for a chart that ALSO exposes one dedicated element
   *  per point (FatigueCurve's two marks): a tap toggles that point exactly
   *  like `useTapHighlight.toggle` does — selects it if it wasn't the
   *  current reading, clears it if it already was. Unused by charts (like
   *  PMCChart) that have no per-point element to hang a click on — the
   *  overlay's own pointer/keyboard handling is the only entry point there. */
  tapToggle: (index: number) => () => void
  /** Every field below is spread onto the interactive element as its own
   *  named prop (never nested under a `bind` object) — the React Compiler's
   *  ref-safety lint treats a hook's whole return value as "ref-tainted"
   *  once ANY field on it is a ref, and flags every property-chain access
   *  off that same object (`scrub.bind.onPointerDown`) as an unsafe render-
   *  time ref read, even though these are plain callbacks. Keeping them
   *  flat, alongside `ref` itself, lets a caller destructure everything in
   *  one const at the top — `const { ref, tabIndex, onPointerDown, ... } =
   *  useScrub(...)` — the exact same "destructure once, use bare locals in
   *  JSX" shape `useReveal`/`useTapHighlight` already use everywhere else in
   *  this tree, and the one the linter is satisfied by. */
  tabIndex: 0
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerMove: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerCancel: (e: ReactPointerEvent) => void
  onKeyDown: (e: ReactKeyboardEvent) => void
}

/**
 * Scrub-to-read: the shared primitive behind requirement 1 of the chart-
 * interaction brief for CONTINUOUS charts (PMCChart's 42-day line, Fatigue-
 * Curve's now/neutral pair) — touch or drag across the plot and the nearest
 * point's marker follows the finger; release leaves the last-read point
 * visible; a pointerdown OUTSIDE the bound element clears it.
 *
 * `positions` is each selectable point's horizontal position as a 0-100
 * percentage of the bound element's OWN rendered width — PMCChart's evenly
 * spaced days and FatigueCurve's two real (unevenly spaced) marks both fit
 * the same contract; nearest-point lookup is a linear scan, which is fine at
 * these sizes (a couple of points to a few dozen).
 *
 * Pointerdown selects immediately BY DEFAULT (a plain tap reads a value on
 * contact, it doesn't require a drag first) — pass `selectOnPointerDown:
 * false` for a chart (FatigueCurve) that ALSO hangs its own click-to-toggle
 * handler (`tapToggle`) off individual point elements, so a plain tap is
 * driven by the element's own `click` event instead of the container's
 * `pointerdown` (both firing would race: `pointerdown` always precedes
 * `click` for the same gesture, so if it already selected the point,
 * `tapToggle`'s very next `click` would immediately toggle it back off).
 * Pointermove ALWAYS keeps reading while the pointer stays down, regardless
 * of that option — real pointer-capture drag, so the gesture keeps tracking
 * even once the finger leaves the element's own box; this is the actual
 * "drag across and the marker follows your finger" gesture either way.
 * Pointerup/pointercancel just release capture — the selection itself is
 * untouched, which is what "release leaves the last-read point visible"
 * means.
 *
 * Keyboard is the exact same state machine: ArrowLeft/Up moves back one
 * point, ArrowRight/Down moves forward one, Home/End jump to the ends,
 * Escape clears — never a second, parallel "keyboard cursor."
 */
export function useScrub<T extends HTMLElement>(positions: number[], options?: { selectOnPointerDown?: boolean }): Scrub<T> {
  const selectOnPointerDown = options?.selectOnPointerDown ?? true
  const [index, setIndex] = useState<number | null>(null)
  const ref = useRef<T | null>(null)
  const dragging = useRef(false)
  const count = positions.length

  const select = useCallback((i: number) => {
    if (count === 0) return
    setIndex(Math.max(0, Math.min(count - 1, i)))
  }, [count])

  const clear = useCallback(() => setIndex(null), [])

  const nearestIndex = useCallback((clientX: number): number | null => {
    const el = ref.current
    if (!el || count === 0) return null
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return null
    const pct = ((clientX - rect.left) / rect.width) * 100
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < count; i++) {
      const d = Math.abs(positions[i] - pct)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    return best
  }, [positions, count])

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    dragging.current = true
    const target = e.target as Element & { setPointerCapture?: (id: number) => void }
    target.setPointerCapture?.(e.pointerId)
    if (!selectOnPointerDown) return
    const nearest = nearestIndex(e.clientX)
    if (nearest != null) setIndex(nearest)
  }, [nearestIndex, selectOnPointerDown])

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragging.current) return
    const nearest = nearestIndex(e.clientX)
    if (nearest != null) setIndex(nearest)
  }, [nearestIndex])

  const endDrag = useCallback((e: ReactPointerEvent) => {
    dragging.current = false
    const target = e.target as Element & { releasePointerCapture?: (id: number) => void }
    target.releasePointerCapture?.(e.pointerId)
  }, [])

  const tapToggle = useCallback((i: number) => () => {
    setIndex((prev) => (prev === i ? null : i))
  }, [])

  const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (count === 0) return
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        setIndex((prev) => (prev == null ? count - 1 : Math.max(0, prev - 1)))
        return
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        setIndex((prev) => (prev == null ? 0 : Math.min(count - 1, prev + 1)))
        return
      case 'Home':
        e.preventDefault()
        setIndex(0)
        return
      case 'End':
        e.preventDefault()
        setIndex(count - 1)
        return
      case 'Escape':
        e.preventDefault()
        setIndex(null)
        return
      default:
        return
    }
  }, [count])

  // "Tapping outside clears it" — only listens while something IS selected,
  // so an untouched chart never pays for a document-wide listener.
  useEffect(() => {
    if (index == null) return
    const onDocPointerDown = (e: PointerEvent) => {
      const el = ref.current
      if (!el) return
      if (e.target instanceof Node && !el.contains(e.target)) setIndex(null)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [index])

  return {
    ref,
    index,
    select,
    clear,
    tapToggle,
    tabIndex: 0,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown,
  }
}
