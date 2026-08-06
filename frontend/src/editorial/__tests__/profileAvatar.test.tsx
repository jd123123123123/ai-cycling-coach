import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import ProfileAvatar from '../components/ProfileAvatar'

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>)

afterEach(cleanup)

describe('ProfileAvatar', () => {
  it('links to /profile', () => {
    wrap(<ProfileAvatar avatarUrl={null} initial="J" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/profile')
  })

  it('renders the image when avatar_url is set', () => {
    wrap(<ProfileAvatar avatarUrl="https://example.com/me.jpg" initial="J" />)
    const img = screen.getByRole('link').querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/me.jpg')
  })

  it('falls back to the initial when avatar_url is null — the DashboardHeaderBar behaviour', () => {
    wrap(<ProfileAvatar avatarUrl={null} initial="J" />)
    expect(screen.getByRole('link').querySelector('img')).toBeNull()
    expect(screen.getByText('J')).toBeTruthy()
  })
})
