import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import DashboardHeaderBar from '../DashboardHeaderBar'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { AuthProvider } from '../../../contexts/AuthContext'

afterEach(cleanup)

describe('DashboardHeaderBar crew entry', () => {
  it('offers a labelled crew entry now that Social has no tab', () => {
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter><AuthProvider><LocaleProvider><DashboardHeaderBar /></LocaleProvider></AuthProvider></MemoryRouter>
      </QueryClientProvider>,
    )
    const crew = screen.getByLabelText(/Crew/i)
    expect(crew.getAttribute('href')).toBe('/dashboard?tab=social')
  })
})
