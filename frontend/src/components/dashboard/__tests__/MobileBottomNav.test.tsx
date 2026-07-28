import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MobileBottomNav, { resolveActive } from '../MobileBottomNav'
import { LocaleProvider } from '../../../contexts/LocaleContext'

afterEach(cleanup)

const at = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <LocaleProvider><MobileBottomNav /></LocaleProvider>
  </MemoryRouter>,
)

describe('MobileBottomNav', () => {
  it('offers exactly the four chapters', () => {
    at('/dashboard?tab=today')
    expect(screen.getAllByRole('button')).toHaveLength(4)
  })

  it('no longer offers a Social tab', () => {
    at('/dashboard?tab=today')
    expect(screen.queryByLabelText('Social')).toBeNull()
  })

  it('marks the current chapter and only that one', () => {
    at('/dashboard?tab=body')
    const current = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'page')
    expect(current).toHaveLength(1)
    expect(current[0].getAttribute('aria-label')).toMatch(/K.rper|Body/)
  })

  it('lights nothing on a route that is not a chapter', () => {
    at('/coach')
    expect(screen.getAllByRole('button').every((b) => !b.getAttribute('aria-current'))).toBe(true)
  })
})

describe('resolveActive — old links must not break', () => {
  it('maps the retired tab ids onto their new chapter', () => {
    expect(resolveActive('recovery')).toBe('body')
    expect(resolveActive('analyze')).toBe('history')
    expect(resolveActive('trends')).toBe('history')
    expect(resolveActive('progress')).toBe('history')
    expect(resolveActive('train')).toBe('plan')
    expect(resolveActive('workouts')).toBe('plan')
  })

  it('keeps crew links resolving to a real chapter instead of dropping them', () => {
    expect(resolveActive('social')).toBe('history')
    expect(resolveActive('crew')).toBe('history')
  })

  it('defaults to today for anything unknown', () => {
    expect(resolveActive(null)).toBe('today')
    expect(resolveActive('nonsense')).toBe('today')
  })
})
