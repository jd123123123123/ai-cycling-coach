import { useCallback } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface ListNavControl<K> {
  selected: K | null
  select: (key: K) => void
  clear: () => void
}

/**
 * The keyboard half of the shared "scrub to read" interaction model, for
 * every CATEGORICAL chart in this build — Bars, ZoneRows, WeekRail,
 * PeakRows, RangeRow, LiveRing, RouteOptions all wire this onto their one
 * focusable container. `keys` is the chart's own tappable order — pass only
 * the PRESENT items (a `missing()` block/day/zone is never in the list), so
 * keyboard navigation can never land on a value there is nothing to read.
 *
 * Left/Up move to the previous item, Right/Down to the next (clamped at the
 * ends — Home/End are the dedicated way to jump there, arrows don't wrap),
 * Home/End jump straight to the first/last item, and Escape clears. Every
 * one of those goes through the SAME `select`/`clear` a tap already uses
 * (`useTapHighlight`), so a screen reader and a fingertip land in the exact
 * same state — never a second, parallel "keyboard selection."
 *
 * Takes any `{selected, select, clear}` — `useTapHighlight<K>()`'s own
 * return shape already satisfies this structurally, no adapter needed.
 */
export function useListNav<K>(keys: readonly K[], control: ListNavControl<K>) {
  return useCallback((e: ReactKeyboardEvent) => {
    if (keys.length === 0) return
    const i = control.selected == null ? -1 : keys.indexOf(control.selected)
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault()
        control.select(keys[i === -1 ? keys.length - 1 : Math.max(0, i - 1)])
        return
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault()
        control.select(keys[i === -1 ? 0 : Math.min(keys.length - 1, i + 1)])
        return
      case 'Home':
        e.preventDefault()
        control.select(keys[0])
        return
      case 'End':
        e.preventDefault()
        control.select(keys[keys.length - 1])
        return
      case 'Escape':
        e.preventDefault()
        control.clear()
        return
      default:
        return
    }
    // `useTapHighlight()` returns a fresh object every render (it's not
    // itself memoized), so depending on the whole `control` object here is
    // no less stable than depending on its individual fields would be —
    // and it's what the React Compiler's own dependency inference expects
    // (`react-hooks/preserve-manual-memoization`), so it stays this way
    // rather than fighting the compiler over a memoization win that was
    // never real to begin with.
  }, [keys, control])
}
