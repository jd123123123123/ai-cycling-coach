import { useCallback, useState } from 'react'

export interface TapHighlight<K> {
  selected: K | null
  /** Select `key`; tapping the already-selected key clears the selection — tapping away restores. */
  toggle: (key: K) => void
  isSelected: (key: K) => boolean
  /** True for every OTHER key once something is selected — the "siblings drop to --d-2" half of the rule. */
  isDimmed: (key: K) => boolean
}

/**
 * Mobile's answer to hover: the touched bar/point/segment lifts to
 * `var(--st-active)`, its siblings drop to `var(--d-2)`, and its exact value
 * surfaces. A second tap on the same element restores everything — there is
 * no separate "clear" gesture to teach.
 */
export function useTapHighlight<K = number>(): TapHighlight<K> {
  const [selected, setSelected] = useState<K | null>(null)

  const toggle = useCallback((key: K) => {
    setSelected((prev) => (prev === key ? null : key))
  }, [])

  const isSelected = useCallback((key: K) => selected !== null && selected === key, [selected])
  const isDimmed = useCallback((key: K) => selected !== null && selected !== key, [selected])

  return { selected, toggle, isSelected, isDimmed }
}
