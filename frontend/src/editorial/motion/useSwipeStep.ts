import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/**
 * Horizontal swipe → "move one step" gesture, pointer events only (no
 * gesture library, per the owner's ruling on mobile interaction). Shared by
 * anything that lets the athlete page through an ordered list by dragging
 * left/right — today: the Day Rail's own browsing feature (tap OR swipe to
 * read another Today state, `pages/TodayView.tsx`).
 *
 * `steps` is the ordered list to page through, `current` is where the
 * gesture starts from, and `onSelect` fires with the neighbour in the
 * direction of the swipe. A swipe left moves forward (next step), a swipe
 * right moves back — matching how a horizontal rail of steps reads
 * left-to-right. A swipe past either end of `steps` is a deliberate no-op,
 * not a wrap-around: "even if it says LIGHTS OUT, I want to go back" reads
 * one step at a time, it doesn't cycle.
 *
 * The vertical-delta check (`Math.abs(dx) < Math.abs(dy)`) keeps an
 * ordinary vertical scroll gesture from being misread as a horizontal swipe
 * — this hook never calls `preventDefault`, so scrolling is untouched
 * either way, but a mostly-vertical drag still shouldn't flip a step.
 */
const SWIPE_THRESHOLD_PX = 40

export function useSwipeStep<T>(
  steps: readonly T[],
  current: T,
  onSelect: (next: T) => void,
): {
  onPointerDown: (e: ReactPointerEvent) => void
  onPointerUp: (e: ReactPointerEvent) => void
  onPointerCancel: () => void
} {
  const start = useRef<{ x: number; y: number } | null>(null)

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY }
  }, [])

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const origin = start.current
    start.current = null
    if (!origin) return
    const dx = e.clientX - origin.x
    const dy = e.clientY - origin.y
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return

    const index = steps.indexOf(current)
    if (index === -1) return
    const nextIndex = dx < 0 ? index + 1 : index - 1
    if (nextIndex < 0 || nextIndex >= steps.length) return
    onSelect(steps[nextIndex])
  }, [steps, current, onSelect])

  const onPointerCancel = useCallback(() => {
    start.current = null
  }, [])

  return { onPointerDown, onPointerUp, onPointerCancel }
}
