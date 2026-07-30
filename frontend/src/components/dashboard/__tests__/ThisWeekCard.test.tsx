import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../../hooks/useActivitiesRange', () => ({
  useActivitiesRange: () => ({ data: { activities: [] } }),
}))
vi.mock('../../../hooks/useCurrentWeek', () => ({
  useCurrentWeek: () => ({ data: null }),
}))
vi.mock('../../../contexts/LocaleContext', () => ({
  useLocale: () => ({ locale: 'de' }),
}))

import ThisWeekCard from '../ThisWeekCard'

describe('ThisWeekCard', () => {
  beforeEach(() => localStorage.clear())
  afterEach(cleanup)

  it('hides the stats row and day dots until expanded', () => {
    render(<ThisWeekCard />)
    expect(screen.getByText('Diese Woche')).toBeTruthy()
    expect(screen.queryByText('TSS erledigt')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /diese woche/i }))
    expect(screen.getByText('TSS erledigt')).toBeTruthy()
  })

  it('remembers the expanded state across remounts', () => {
    const { unmount } = render(<ThisWeekCard />)
    fireEvent.click(screen.getByRole('button', { name: /diese woche/i }))
    unmount()

    render(<ThisWeekCard />)
    expect(screen.getByText('TSS erledigt')).toBeTruthy()
  })
})
