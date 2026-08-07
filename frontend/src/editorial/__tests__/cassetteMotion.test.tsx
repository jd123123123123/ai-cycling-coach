import { renderHook, act, cleanup } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useCountUp } from '../motion/useCountUp'
import { useChainShift, CHAIN_SHIFT_STORAGE_KEY } from '../motion/useChainShift'

afterEach(cleanup)

describe('useCountUp', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('passes a missing target straight through', () => {
    const { result } = renderHook(() => useCountUp(null, 600))
    expect(result.current).toBeNull()
  })

  it('lands exactly on the target', () => {
    const { result } = renderHook(() => useCountUp(74, 600))
    act(() => { vi.advanceTimersByTime(1200) })
    expect(result.current).toBe(74)
  })
})

describe('useChainShift', () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('does not animate the first time it ever runs', () => {
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.index).toBe(3)
    expect(result.current.isShifting).toBe(false)
  })

  it('remembers today, so a second mount on the same day is still', () => {
    renderHook(() => useChainShift(3, '2026-08-07'))
    act(() => { vi.advanceTimersByTime(2000) })
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.isShifting).toBe(false)
    expect(result.current.index).toBe(3)
  })

  it('shifts from yesterday cog to today cog on a new day', () => {
    window.localStorage.setItem(
      CHAIN_SHIFT_STORAGE_KEY,
      JSON.stringify({ date: '2026-08-06', index: 6 }),
    )
    const { result } = renderHook(() => useChainShift(3, '2026-08-07'))
    expect(result.current.index).toBe(6)
    expect(result.current.isShifting).toBe(true)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current.index).toBe(3)
    expect(result.current.isShifting).toBe(false)
  })

  it('persists today so the shift cannot replay', () => {
    window.localStorage.setItem(
      CHAIN_SHIFT_STORAGE_KEY,
      JSON.stringify({ date: '2026-08-06', index: 6 }),
    )
    renderHook(() => useChainShift(3, '2026-08-07'))
    act(() => { vi.advanceTimersByTime(1000) })
    const stored = JSON.parse(window.localStorage.getItem(CHAIN_SHIFT_STORAGE_KEY) ?? '{}')
    expect(stored).toEqual({ date: '2026-08-07', index: 3 })
  })

  it('stays still when there is no verdict to shift to', () => {
    const { result } = renderHook(() => useChainShift(null, '2026-08-07'))
    expect(result.current.index).toBeNull()
    expect(result.current.isShifting).toBe(false)
  })
})
