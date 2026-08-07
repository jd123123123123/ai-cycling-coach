import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from './useReveal'

export const CHAIN_SHIFT_STORAGE_KEY = 'editorial.chainShift'
export const CHAIN_SHIFT_MS_PER_COG = 90
export const CHAIN_SHIFT_MAX_MS = 900

interface Stored { date: string; index: number }

function read(): Stored | null {
  try {
    const raw = window.localStorage.getItem(CHAIN_SHIFT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    return typeof parsed?.date === 'string' && typeof parsed?.index === 'number' ? parsed : null
  } catch { return null }
}

function write(value: Stored): void {
  try { window.localStorage.setItem(CHAIN_SHIFT_STORAGE_KEY, JSON.stringify(value)) } catch { /* private mode */ }
}

/**
 * The morning shift: the chain travels from yesterday's cog to today's, one
 * sprocket at a time. It fires ONCE PER DAY — the stored date is what keeps it
 * an event instead of wallpaper, and what stops it replaying on every
 * navigation back to Today.
 */
export function useChainShift(
  targetIndex: number | null,
  todayIso: string,
): { index: number | null; isShifting: boolean } {
  const stored = useRef<Stored | null>(read())
  const from = stored.current != null && stored.current.date !== todayIso ? stored.current.index : null
  const shouldShift =
    targetIndex != null && from != null && from !== targetIndex && !prefersReducedMotion()

  const [index, setIndex] = useState<number | null>(shouldShift ? from : targetIndex)
  const [isShifting, setIsShifting] = useState(shouldShift)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (targetIndex == null) { setIndex(null); setIsShifting(false); return }
    if (!shouldShift) {
      setIndex(targetIndex)
      setIsShifting(false)
      write({ date: todayIso, index: targetIndex })
      return
    }

    const step = from! < targetIndex ? 1 : -1
    const cogs = Math.abs(targetIndex - from!)
    const per = Math.min(CHAIN_SHIFT_MS_PER_COG, CHAIN_SHIFT_MAX_MS / Math.max(cogs, 1))
    let current = from!

    const advance = () => {
      current += step
      setIndex(current)
      if (current === targetIndex) {
        setIsShifting(false)
        write({ date: todayIso, index: targetIndex })
      } else {
        timer.current = window.setTimeout(advance, per)
      }
    }
    timer.current = window.setTimeout(advance, per)
    return () => { if (timer.current != null) window.clearTimeout(timer.current) }
    // `from`/`shouldShift` derive from a ref read once on mount, by design:
    // the shift is a mount-time event, not a reactive binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIndex, todayIso])

  return { index, isShifting }
}
