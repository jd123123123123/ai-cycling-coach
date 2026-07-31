import { useCallback, useEffect, useRef, useState } from 'react'

/** How long the whole route takes to play, regardless of its length. */
const PLAYBACK_MS = 5500

const SEEN_KEY = 'rehearsal.played'

/**
 * useRehearsalPlayback — the "film once, then a tool" rule.
 *
 * The first time an athlete opens a given rehearsal, a marker rides the route:
 * the map dot moves, the profile cursor sweeps, the W′ trace drains and the
 * readout counts up. It runs once, it is skippable by touching anything, and
 * every later visit to the SAME rehearsal opens straight into the scrubbable
 * tool with no waiting.
 *
 * That split matters because this page has two jobs that pull opposite ways.
 * Seeing yourself blow up on the Giau is worth five seconds of anticipation the
 * first time. Checking your target watts for the fourth time is not — and a
 * page that replays its intro on every visit turns the useful job into a chore.
 *
 * Which rehearsals have played is kept in localStorage, so it survives a reload
 * and does not depend on React state that a remount would clear. A storage
 * failure (private mode, quota) degrades to "play it", never to a crash.
 */
export function useRehearsalPlayback({
  rehearsalId,
  count,
  enabled,
}: {
  rehearsalId: number
  /** Number of segments; playback walks 0 → count-1. */
  count: number
  /** False while loading, or when there is nothing worth playing. */
  enabled: boolean
}) {
  const [playIdx, setPlayIdx] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const frame = useRef<number | null>(null)
  const started = useRef(false)

  const stop = useCallback(() => {
    if (frame.current != null) cancelAnimationFrame(frame.current)
    frame.current = null
    setPlaying(false)
    setPlayIdx(null)
  }, [])

  const run = useCallback(() => {
    if (count < 2) return
    if (frame.current != null) cancelAnimationFrame(frame.current)
    setPlaying(true)
    // Timestamps come from rAF itself rather than Date.now(), so the sweep
    // stays smooth if the tab is throttled and resumes rather than jumping.
    let t0: number | null = null
    const step = (t: number) => {
      if (t0 == null) t0 = t
      const progress = Math.min(1, (t - t0) / PLAYBACK_MS)
      setPlayIdx(Math.round(progress * (count - 1)))
      if (progress < 1) {
        frame.current = requestAnimationFrame(step)
      } else {
        frame.current = null
        setPlaying(false)
        // Hand the cursor back rather than leaving it parked at the finish —
        // a stuck marker on the last segment reads as a frozen page.
        setPlayIdx(null)
      }
    }
    frame.current = requestAnimationFrame(step)
  }, [count])

  useEffect(() => {
    if (!enabled || started.current || count < 2) return
    if (!Number.isFinite(rehearsalId)) return
    started.current = true

    // Respect the OS setting: an unrequested five-second animation is exactly
    // what reduced-motion exists to prevent.
    const reduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) return

    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
      if (!Array.isArray(seen)) seen = []
    } catch {
      seen = []
    }
    if (seen.includes(String(rehearsalId))) return

    try {
      // Written BEFORE playing, so a reload mid-film does not replay it.
      localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, String(rehearsalId)].slice(-50)))
    } catch {
      // No storage: the film plays every visit. Annoying, not broken.
    }

    // Started on the next frame rather than inline: kicking off the animation
    // synchronously inside the effect sets state during commit and cascades an
    // extra render of the whole page before the first frame is even drawn.
    const kickoff = requestAnimationFrame(() => run())
    return () => cancelAnimationFrame(kickoff)
  }, [enabled, count, rehearsalId, run])

  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current)
  }, [])

  return { playIdx, playing, skip: stop, replay: run }
}
