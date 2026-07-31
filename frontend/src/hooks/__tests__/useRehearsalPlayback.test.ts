import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import { useRehearsalPlayback } from '../useRehearsalPlayback'

const SEEN_KEY = 'rehearsal.played'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useRehearsalPlayback', () => {
  it('plays the fly-through the first time a rehearsal is opened', async () => {
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 7, count: 100, enabled: true }),
    )
    await waitFor(() => expect(result.current.playing).toBe(true))
    await waitFor(() => expect(result.current.playIdx).not.toBeNull())
  })

  it('does not play again on a later visit to the same rehearsal', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(['7']))
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 7, count: 100, enabled: true }),
    )
    // Give it the frames it would have used to start.
    await new Promise((r) => setTimeout(r, 40))
    expect(result.current.playing).toBe(false)
    expect(result.current.playIdx).toBeNull()
  })

  it('still plays a DIFFERENT rehearsal the athlete has not seen', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(['7']))
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 8, count: 100, enabled: true }),
    )
    await waitFor(() => expect(result.current.playing).toBe(true))
  })

  it('records the rehearsal as played, so a reload mid-film does not replay it', async () => {
    renderHook(() => useRehearsalPlayback({ rehearsalId: 7, count: 100, enabled: true }))
    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')).toContain('7'),
    )
  })

  it('honours prefers-reduced-motion', async () => {
    // jsdom ships no matchMedia at all — which is also why the hook feature-
    // detects it rather than calling it straight.
    vi.stubGlobal(
      'matchMedia',
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          media: q,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    )
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 9, count: 100, enabled: true }),
    )
    await new Promise((r) => setTimeout(r, 40))
    expect(result.current.playing).toBe(false)
  })

  it('waits until there is something to play', async () => {
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 7, count: 0, enabled: false }),
    )
    await new Promise((r) => setTimeout(r, 40))
    expect(result.current.playing).toBe(false)
    // Nothing was recorded either, so the film is still owed once it loads.
    expect(localStorage.getItem(SEEN_KEY)).toBeNull()
  })

  it('skip stops the film and hands the cursor back', async () => {
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 7, count: 100, enabled: true }),
    )
    await waitFor(() => expect(result.current.playing).toBe(true))
    result.current.skip()
    await waitFor(() => expect(result.current.playing).toBe(false))
    expect(result.current.playIdx).toBeNull()
  })

  it('replay starts it again after it has been seen', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify(['7']))
    const { result } = renderHook(() =>
      useRehearsalPlayback({ rehearsalId: 7, count: 100, enabled: true }),
    )
    await new Promise((r) => setTimeout(r, 40))
    expect(result.current.playing).toBe(false)
    result.current.replay()
    await waitFor(() => expect(result.current.playing).toBe(true))
  })
})
