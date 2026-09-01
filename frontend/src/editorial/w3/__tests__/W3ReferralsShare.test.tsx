import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/**
 * Sharing an invite.
 *
 * The card is the persuasion and the link is the door, but neither may cost
 * the rider the invite: a canvas that fails — no 2d context, a tainted
 * portrait, an out-of-memory export — must fall back to the text-and-URL path
 * the button had before, not to nothing.
 */

const renderInviteCard = vi.fn()
const sharePoster = vi.fn()
const shareTextOrCopy = vi.fn()

vi.mock('../w3share', () => ({
  renderInviteCard: (...a: unknown[]) => renderInviteCard(...a),
  sharePoster: (...a: unknown[]) => sharePoster(...a),
  shareTextOrCopy: (...a: unknown[]) => shareTextOrCopy(...a),
}))
vi.mock('../../../hooks/useReferrals', () => ({
  useMyReferrals: () => ({ data: { code: 'RIDR7X', active_count: 0, active: [], completed_count: 0, completed: [] } }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 5, email: 'jannis@example.com', display_name: 'jannis' } }),
}))
vi.mock('../../../hooks/useGarage', () => ({
  useGarage: () => ({ data: { rider: { image_base64: 'data:image/png;base64,AAA' }, bike: null } }),
  GARAGE_KEY: ['garage'],
}))
vi.mock('../../../hooks/useAchievements', () => ({
  useAchievements: () => ({ data: { all_time: { km: 2312.5, rides: 62 } } }),
}))
vi.mock('../../../hooks/useWallet', () => ({
  useWallet: () => ({ data: { balance: 126000 } }),
}))

const { default: W3ReferralsPage } = await import('../W3ReferralsPage')

const draw = () => render(<MemoryRouter><W3ReferralsPage /></MemoryRouter>)
const shareButton = () => screen.getByText(/Teilen|teilen|Einladen|Code/i).closest('button')
  ?? screen.getAllByRole('button')[1]

beforeEach(() => {
  renderInviteCard.mockReset(); sharePoster.mockReset(); shareTextOrCopy.mockReset()
  renderInviteCard.mockResolvedValue({ blob: new Blob(['x']), dataUrl: 'data:image/png;base64,x' })
  sharePoster.mockResolvedValue('shared')
  shareTextOrCopy.mockResolvedValue('shared')
})
afterEach(cleanup)

describe('the invite goes out as a card', () => {
  it('builds it from the rider\'s own portrait, handle and numbers', async () => {
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(renderInviteCard).toHaveBeenCalled())

    const d = renderInviteCard.mock.calls[0][0] as {
      avatarUrl: string | null; handle: string; code: string
      stats: { v: string; l: string }[]
    }
    expect(d.avatarUrl).toBe('data:image/png;base64,AAA')
    expect(d.handle).toBe('@jannis')
    expect(d.code).toBe('RIDR7X')
    expect(d.stats.map((s) => s.l)).toEqual(['RIDECOINS', 'GESAMT', 'FAHRTEN'])
    expect(d.stats[1].v).toBe('2.313 km')
    expect(d.stats[2].v).toBe('62')
  })

  it('sends the link alongside the image, because a picture cannot be tapped', async () => {
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(sharePoster).toHaveBeenCalled())
    const caption = sharePoster.mock.calls[0][1] as string
    expect(caption).toContain('RIDR7X')
    expect(caption).toMatch(/https?:\/\//)
  })
})

describe('a failed card never costs the rider the invite', () => {
  it('falls back to text when the render rejects', async () => {
    renderInviteCard.mockRejectedValue(new Error('no 2d context'))
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(shareTextOrCopy).toHaveBeenCalled())
    expect(sharePoster).not.toHaveBeenCalled()
  })

  it('falls back to text when the canvas produced no blob', async () => {
    renderInviteCard.mockResolvedValue({ blob: null, dataUrl: '' })
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(shareTextOrCopy).toHaveBeenCalled())
  })

  it('falls back to text when the share sheet itself fails', async () => {
    sharePoster.mockResolvedValue('failed')
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(shareTextOrCopy).toHaveBeenCalled())
  })

  it('does not fall back when the card actually went out', async () => {
    draw()
    fireEvent.click(shareButton()!)
    await waitFor(() => expect(sharePoster).toHaveBeenCalled())
    expect(shareTextOrCopy).not.toHaveBeenCalled()
  })
})
