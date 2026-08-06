import { useCallback, useState } from 'react'

export interface TapHighlight<K> {
  selected: K | null
  /** Select `key`; tapping the already-selected key clears the selection — tapping away restores. */
  toggle: (key: K) => void
  /** Set the selection directly, regardless of what was selected before —
   *  the keyboard's own primitive (`useListNav` and `useScrub` both drive
   *  this, never `toggle`, since an arrow key always MOVES the selection
   *  rather than toggling it off). */
  select: (key: K) => void
  /** Clear the selection outright — `Escape`'s own primitive. */
  clear: () => void
  isSelected: (key: K) => boolean
  /** True for every OTHER key once something is selected — the "siblings drop to --d-2" half of the rule. */
  isDimmed: (key: K) => boolean
}

/**
 * Mobile's answer to hover: the touched bar/point/segment lifts to
 * `var(--st-active)`, its siblings drop to `var(--d-2)`, and its exact value
 * surfaces. A second tap on the same element restores everything — there is
 * no separate "clear" gesture to teach.
 *
 * `select`/`clear` (Task: chart interaction) are the same state's keyboard
 * face: `useListNav` composes on top of this hook to give every categorical
 * chart (Bars, ZoneRows, WeekRail, PeakRows, RangeRow, LiveRing,
 * RouteOptions) arrow-key/Home/End/Escape parity with the exact same
 * `selected` a tap produces — never a second, parallel selection state.
 */
export function useTapHighlight<K = number>(): TapHighlight<K> {
  const [selected, setSelected] = useState<K | null>(null)

  const toggle = useCallback((key: K) => {
    setSelected((prev) => (prev === key ? null : key))
  }, [])

  const select = useCallback((key: K) => setSelected(key), [])
  const clear = useCallback(() => setSelected(null), [])

  const isSelected = useCallback((key: K) => selected !== null && selected === key, [selected])
  const isDimmed = useCallback((key: K) => selected !== null && selected !== key, [selected])

  return { selected, toggle, select, clear, isSelected, isDimmed }
}
