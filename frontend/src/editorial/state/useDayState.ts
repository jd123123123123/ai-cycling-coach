import { useMemo } from 'react'
import { readOverride, type DayState } from './dayState'

/** Placeholder body — Task 7 wires the real derivation from live facts. */
export function useDayState(): { state: DayState } {
  const state = useMemo<DayState>(() => readOverride(new Date()) ?? 'rest', [])
  return { state }
}
