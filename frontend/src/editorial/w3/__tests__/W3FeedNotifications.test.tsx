import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, cleanup, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { IncomingNudge } from '../../../api/nudges'
import type { IncomingInvite } from '../../../api/connections'
import type { CrewMineResponse } from '../../../api/crew'

// The network, replaced. Every assertion below is about what the bell DOES
// with what the server said — never about reaching a server.
const fetchIncomingNudges = vi.fn<() => Promise<IncomingNudge[]>>()
const markNudgeRead = vi.fn<(id: number) => Promise<void>>()
vi.mock('../../../api/nudges', () => ({
  fetchIncomingNudges: () => fetchIncomingNudges(),
  markNudgeRead: (id: number) => markNudgeRead(id),
  sendNudge: vi.fn(),
}))

const fetchIncomingInvites = vi.fn<() => Promise<IncomingInvite[]>>()
const acceptIncomingInvite = vi.fn<(id: number) => Promise<unknown>>()
const declineIncomingInvite = vi.fn<(id: number) => Promise<void>>()
vi.mock('../../../api/connections', async (orig) => ({
  ...(await orig<typeof import('../../../api/connections')>()),
  fetchIncomingInvites: () => fetchIncomingInvites(),
  acceptIncomingInvite: (id: number) => acceptIncomingInvite(id),
  declineIncomingInvite: (id: number) => declineIncomingInvite(id),
}))

const fetchMyCrew = vi.fn<() => Promise<CrewMineResponse>>()
vi.mock('../../../api/crew', async (orig) => ({
  ...(await orig<typeof import('../../../api/crew')>()),
  fetchMyCrew: () => fetchMyCrew(),
}))

import W3FeedNotifications, { useFeedNotifications } from '../W3FeedNotifications'

// jsdom has no ResizeObserver and motion reaches for one.
if (!('ResizeObserver' in globalThis)) {
  ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

const IN_A_CREW: CrewMineResponse = {
  crew: { id: 7, name: 'Rasselbande', owner_user_id: 1, created_at: new Date().toISOString() } as CrewMineResponse['crew'],
  members: [],
  pending_invites: [],
}
const NO_CREW: CrewMineResponse = { crew: null, members: [], pending_invites: [] }

const nudge = (over: Partial<IncomingNudge> = {}): IncomingNudge => ({
  id: 1,
  from_handle: 'luca',
  text: 'Deine Wattzahl ruft an, sie will ihr Leben zurück.',
  created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  ...over,
})

const invite = (over: Partial<IncomingInvite> = {}): IncomingInvite => ({
  invite_id: 40,
  crew_id: 9,
  crew_name: 'Rasselbande',
  inviter_handle: 'mira',
  created_at: new Date(Date.now() - 30 * 60_000).toISOString(),
  ...over,
})

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const renderSheet = (props: { open: boolean; onClose?: () => void }) =>
  render(<W3FeedNotifications open={props.open} onClose={props.onClose ?? (() => {})} />, {
    wrapper: wrapper(),
  })

beforeEach(() => {
  fetchIncomingNudges.mockReset().mockResolvedValue([])
  markNudgeRead.mockReset().mockResolvedValue(undefined)
  fetchIncomingInvites.mockReset().mockResolvedValue([])
  acceptIncomingInvite.mockReset().mockResolvedValue(IN_A_CREW)
  declineIncomingInvite.mockReset().mockResolvedValue(undefined)
  fetchMyCrew.mockReset().mockResolvedValue(IN_A_CREW)
})
afterEach(cleanup)

// ── the number on the bell ──────────────────────────────────────────────────

describe('the bell counts both feeds', () => {
  it('adds unread nudges to pending invites', async () => {
    fetchIncomingNudges.mockResolvedValue([nudge({ id: 1 }), nudge({ id: 2 })])
    fetchIncomingInvites.mockResolvedValue([invite({ invite_id: 40 })])

    const { result } = renderHook(() => useFeedNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.count).toBe(3))
  })

  it('counts nothing when both feeds are empty', async () => {
    const { result } = renderHook(() => useFeedNotifications(), { wrapper: wrapper() })
    await waitFor(() => expect(fetchIncomingInvites).toHaveBeenCalled())
    expect(result.current.count).toBe(0)
  })
})

describe('a rider who is not in a crew', () => {
  it('never asks for nudges — a nudge can only come from a crew rival', async () => {
    fetchMyCrew.mockResolvedValue(NO_CREW)

    const { result } = renderHook(() => useFeedNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(fetchIncomingInvites).toHaveBeenCalled())
    expect(fetchIncomingNudges).not.toHaveBeenCalled()
    expect(result.current.count).toBe(0)
  })

  it('STILL counts an invite — the invite is what arrives before the crew exists', async () => {
    fetchMyCrew.mockResolvedValue(NO_CREW)
    fetchIncomingInvites.mockResolvedValue([invite()])

    const { result } = renderHook(() => useFeedNotifications(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.count).toBe(1))
    expect(fetchIncomingNudges).not.toHaveBeenCalled()
  })
})

describe('a feed the app cannot read', () => {
  it('is a bell with no dot, not a broken screen', async () => {
    // Every one of them down, including the crew itself.
    fetchMyCrew.mockRejectedValue(new Error('offline'))
    fetchIncomingInvites.mockRejectedValue(new Error('offline'))
    fetchIncomingNudges.mockRejectedValue(new Error('offline'))

    const { result } = renderHook(() => useFeedNotifications(), { wrapper: wrapper() })

    // Rendering at all is half the assertion: an error that reached the caller
    // would have thrown out of the hook.
    await waitFor(() => expect(fetchIncomingInvites).toHaveBeenCalled())
    expect(result.current.count).toBe(0)
  })
})

// ── the sheet ───────────────────────────────────────────────────────────────

describe('opening the sheet marks the nudges read', () => {
  it('does not touch the server while it is closed', async () => {
    fetchIncomingNudges.mockResolvedValue([nudge({ id: 1 }), nudge({ id: 2 })])

    renderSheet({ open: false })

    await waitFor(() => expect(fetchIncomingNudges).toHaveBeenCalled())
    expect(markNudgeRead).not.toHaveBeenCalled()
  })

  it('marks each visible nudge exactly once per open', async () => {
    fetchIncomingNudges.mockResolvedValue([nudge({ id: 1 }), nudge({ id: 2 })])

    const { rerender } = render(<W3FeedNotifications open onClose={() => {}} />, { wrapper: wrapper() })

    await waitFor(() => expect(markNudgeRead).toHaveBeenCalledTimes(2))
    expect(markNudgeRead.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2])

    // Re-rendering the OPEN sheet is not a second opening.
    rerender(<W3FeedNotifications open onClose={() => {}} />)
    await waitFor(() => expect(markNudgeRead).toHaveBeenCalledTimes(2))
  })

  it('keeps showing the nudges it just marked read', async () => {
    fetchIncomingNudges.mockResolvedValue([nudge({ id: 1, text: 'Rollentraining zählt auch.' })])

    renderSheet({ open: true })

    await waitFor(() => expect(markNudgeRead).toHaveBeenCalledTimes(1))
    // The server now returns nothing unread; the sheet must not blank out from
    // under the rider who is reading it.
    fetchIncomingNudges.mockResolvedValue([])
    expect(screen.getByText('Rollentraining zählt auch.')).toBeTruthy()
  })
})

describe('an invite in the sheet', () => {
  it('names who invited you, to what', async () => {
    fetchIncomingInvites.mockResolvedValue([invite({ inviter_handle: 'mira', crew_name: 'Rasselbande' })])

    renderSheet({ open: true })

    await waitFor(() => expect(screen.getByText('mira lädt dich zu Rasselbande ein')).toBeTruthy())
    expect(screen.getByText('Annehmen')).toBeTruthy()
    expect(screen.getByText('Ablehnen')).toBeTruthy()
  })

  it('leaves the list the moment it is declined', async () => {
    fetchIncomingInvites.mockResolvedValue([invite()])

    renderSheet({ open: true })
    await waitFor(() => expect(screen.getByText('Ablehnen')).toBeTruthy())

    fetchIncomingInvites.mockResolvedValue([])
    await act(async () => {
      fireEvent.click(screen.getByText('Ablehnen'))
    })

    expect(declineIncomingInvite).toHaveBeenCalledWith(40)
    await waitFor(() => expect(screen.queryByText('mira lädt dich zu Rasselbande ein')).toBeNull())
  })

  it('COMES BACK when the decline fails, and says what the server said', async () => {
    fetchIncomingInvites.mockResolvedValue([invite()])
    declineIncomingInvite.mockRejectedValue({
      response: { data: { detail: 'Diese Einladung ist abgelaufen.' } },
    })

    renderSheet({ open: true })
    await waitFor(() => expect(screen.getByText('Ablehnen')).toBeTruthy())

    await act(async () => {
      fireEvent.click(screen.getByText('Ablehnen'))
    })

    // Rolled back: the row is on screen again, carrying the server's own words
    // rather than a generic apology.
    await waitFor(() => expect(screen.getByText('Diese Einladung ist abgelaufen.')).toBeTruthy())
    expect(screen.getByText('mira lädt dich zu Rasselbande ein')).toBeTruthy()
    expect(screen.getByText('Ablehnen')).toBeTruthy()
  })

  it('accepts against the real endpoint', async () => {
    fetchIncomingInvites.mockResolvedValue([invite({ invite_id: 41 })])

    renderSheet({ open: true })
    await waitFor(() => expect(screen.getByText('Annehmen')).toBeTruthy())

    fetchIncomingInvites.mockResolvedValue([])
    await act(async () => {
      fireEvent.click(screen.getByText('Annehmen'))
    })

    expect(acceptIncomingInvite).toHaveBeenCalledWith(41)
  })
})

describe('nothing to report', () => {
  it('says so once, quietly', async () => {
    renderSheet({ open: true })
    await waitFor(() => expect(screen.getByText('Nichts Neues.')).toBeTruthy())
  })

  it('renders no dialog at all while closed', () => {
    const { container } = renderSheet({ open: false })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })
})

describe('the sheet can be left', () => {
  it('closes on Escape and on a backdrop press', async () => {
    const onClose = vi.fn()
    const { container } = renderSheet({ open: true, onClose })

    await waitFor(() => expect(container.querySelector('[role="dialog"]')).not.toBeNull())

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const backdrop = container.firstElementChild as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('is a bounded bottom sheet, not a full-page takeover', async () => {
    const { container } = renderSheet({ open: true })
    const panel = await waitFor(() => {
      const p = container.querySelector('[role="dialog"]') as HTMLElement | null
      expect(p).not.toBeNull()
      return p!
    })
    expect(panel.style.maxHeight).toContain('dvh')
    expect(panel.style.overflowY).toBe('auto')
    expect(panel.style.overscrollBehavior).toBe('contain')
  })
})
