import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// useDayState reaches into two live-data hooks (useActivitiesRange,
// useTodaySession) to compute `derived` — mocked here so this test exercises
// the browsing primitive itself (preview/isPreviewing/setOverride) without a
// QueryClient or a backend, the same "no network in a unit test" pattern
// the rest of editorial/__tests__ follows.
vi.mock('../../hooks/useActivitiesRange', () => ({
  useActivitiesRange: () => ({ data: { activities: [] } }),
}))
vi.mock('../../hooks/useTodaySession', () => ({
  useTodaySession: () => ({ isActiveTrainingDay: false }),
}))

import { useDayState } from '../state/useDayState'

const STORAGE_KEY = 'editorial.dayState'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useDayState browsing (preview)', () => {
  it('preview overlays `state` and flips `isPreviewing`, WITHOUT writing the stored override', () => {
    const { result } = renderHook(() => useDayState())
    expect(result.current.isPreviewing).toBe(false)

    act(() => result.current.preview('evening'))

    expect(result.current.state).toBe('evening')
    expect(result.current.isPreviewing).toBe(true)
    // The one thing that matters: browsing never touches the athlete's real,
    // persisted day. setOverride is the only path that does that.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('preview(null) clears the overlay and returns to the real (derived/stored) state', () => {
    const { result } = renderHook(() => useDayState())
    const real = result.current.state

    act(() => result.current.preview('trained'))
    expect(result.current.state).toBe('trained')

    act(() => result.current.preview(null))
    expect(result.current.state).toBe(real)
    expect(result.current.isPreviewing).toBe(false)
  })

  it('setOverride — unlike preview — DOES write the stored override', () => {
    const { result } = renderHook(() => useDayState())

    act(() => result.current.setOverride('resting'))

    expect(result.current.state).toBe('resting')
    expect(result.current.isPreviewing).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('a preview overlays even a real stored override — browsing away from a real change still does not erase it', () => {
    const { result } = renderHook(() => useDayState())
    act(() => result.current.setOverride('resting'))
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    act(() => result.current.preview('evening'))
    expect(result.current.state).toBe('evening')
    // The real override written a moment ago is untouched in storage.
    expect(localStorage.getItem(STORAGE_KEY)).toContain('resting')

    act(() => result.current.preview(null))
    expect(result.current.state).toBe('resting')
  })
})
