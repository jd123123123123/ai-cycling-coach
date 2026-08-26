import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { CrewRide, CrewRideComment } from '../../../api/crewRides'

// The network, replaced. Everything below is about what the section DOES with
// what the server said — never about reaching a server.
const fetchCrewRideComments = vi.fn()
const postCrewRideComment = vi.fn()
vi.mock('../../../api/crewRides', () => ({
  fetchCrewRides: vi.fn(async () => []),
  fetchCrewRideComments: (id: number) => fetchCrewRideComments(id),
  postCrewRideComment: (id: number, text: string) => postCrewRideComment(id, text),
}))
const toggleReaction = vi.fn()
vi.mock('../../../api/crewReactions', async (orig) => ({
  ...(await orig<typeof import('../../../api/crewReactions')>()),
  toggleReaction: (input: unknown) => toggleReaction(input),
}))

import { W3CrewFeedView, FEED_VISIBLE } from '../W3CrewFeed'
import { ago, km, hm, dur } from '../w3rideFeed'

afterEach(cleanup)
beforeEach(() => {
  fetchCrewRideComments.mockReset().mockResolvedValue([])
  postCrewRideComment.mockReset()
  toggleReaction.mockReset()
})

const ride = (over: Partial<CrewRide> = {}): CrewRide => ({
  id: 1, user_id: 6, handle: 'luca', display_name: 'luca',
  title: 'Alpenrand', started_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
  distance_m: 82_400, elevation_gain_m: 1210, duration_seconds: 3 * 3600 + 14 * 60,
  sport: 'cycling', tss: 188, avg_power_w: 214, avg_hr: 141, calories: 2100,
  is_mine: false, reactions: { counts: {}, mine: [] }, comment_count: 0,
  ...over,
})

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>)
}

describe('the honest formatters', () => {
  it('gives a dash rather than a zero for a figure the ride does not have', () => {
    expect(km(null)).toBe('—')
    expect(km(0)).toBe('—')
    expect(hm(null)).toBe('—')
    expect(dur(0)).toBe('—')
  })

  it('formats distance, climbing and time the way riders say them', () => {
    expect(km(82_400)).toBe('82,4 km')
    expect(km(142_000)).toBe('142 km')   // past 100 the tenth is noise
    expect(hm(1210)).toBe('1.210 hm')
    expect(dur(48 * 60)).toBe('48 min')
    expect(dur(3 * 3600 + 14 * 60)).toBe('3:14 h')
  })

  it('floors each unit, so 23 h 40 min is never "vor 24 Std"', () => {
    const now = Date.parse('2026-08-26T12:00:00Z')
    const back = (ms: number) => new Date(now - ms).toISOString()
    expect(ago(back(30_000), now)).toBe('gerade eben')
    expect(ago(back(42 * 60_000), now)).toBe('vor 42 Min')
    expect(ago(back(23 * 3600_000 + 40 * 60_000), now)).toBe('vor 23 Std')
    expect(ago(back(25 * 3600_000), now)).toBe('gestern')
    expect(ago(back(4 * 86_400_000), now)).toBe('vor 4 Tagen')
  })
})

describe('W3CrewFeed', () => {
  it('renders NOTHING without a crew ride — the invitation belongs to the rank card above', () => {
    const { container } = wrap(<W3CrewFeedView rides={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows who rode, what they rode, and how big the conversation is', () => {
    wrap(<W3CrewFeedView rides={[ride({ comment_count: 3 })]} />)
    expect(screen.getByText('@luca')).toBeTruthy()
    expect(screen.getByText('Alpenrand')).toBeTruthy()
    expect(screen.getByText('82,4 km · 1.210 hm · 3:14 h')).toBeTruthy()
    expect(screen.getByLabelText('Kommentare öffnen (3)')).toBeTruthy()
  })

  it("names the rider's own ride 'Du' rather than their handle", () => {
    wrap(<W3CrewFeedView rides={[ride({ is_mine: true, handle: 'jannis' })]} />)
    expect(screen.getByText('Du')).toBeTruthy()
    expect(screen.queryByText('@jannis')).toBeNull()
  })

  it('stays a glance: it shows the newest few and counts the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => ride({ id: i + 1, title: `Fahrt ${i + 1}` }))
    wrap(<W3CrewFeedView rides={many} />)
    expect(screen.getByText('9 FAHRTEN')).toBeTruthy()
    expect(screen.getAllByText(/^Fahrt \d$/).length).toBe(FEED_VISIBLE)
    // …and says so, rather than quietly counting nine and drawing four.
    expect(screen.getByText(`+ ${9 - FEED_VISIBLE} WEITERE IN DER CREW`)).toBeTruthy()
  })

  it('offers no "more" link when the crew fits in the card', () => {
    wrap(<W3CrewFeedView rides={[ride()]} />)
    expect(screen.queryByText(/WEITERE IN DER CREW/)).toBeNull()
  })

  it('opens the detail in place, and dashes what the ride never measured', async () => {
    wrap(<W3CrewFeedView rides={[ride({ tss: null, avg_power_w: null })]} />)
    fireEvent.click(screen.getByText('Alpenrand'))

    expect(screen.getByText('Ø PULS')).toBeTruthy()
    expect(screen.getByText('141')).toBeTruthy()
    // No power meter on the ride → two honest dashes, not two zeroes. (The
    // one "0" on screen is the comment badge, where zero is the true count.)
    expect(screen.getAllByText('—').length).toBe(2)
    expect(screen.getByText('TSS').parentElement?.textContent).toBe('TSS—')
    expect(screen.getByText('Ø WATT').parentElement?.textContent).toBe('Ø WATT—')
    // The open card must ADD facts, never repeat the collapsed line's.
    expect(screen.queryByText('HÖHE')).toBeNull()
    // The climbing appears once, in the collapsed meta line — the open tile
    // adds calories instead of printing the same metres again.
    expect(document.body.textContent?.match(/1\.210 hm/g)?.length).toBe(1)
    expect(screen.getByText('KCAL').parentElement?.textContent).toBe('KCAL2.100')
    await waitFor(() => expect(fetchCrewRideComments).toHaveBeenCalledWith(1))
  })

  it('does not fetch a thread nobody opened', () => {
    wrap(<W3CrewFeedView rides={[ride(), ride({ id: 2, title: 'Feierabend' })]} />)
    expect(fetchCrewRideComments).not.toHaveBeenCalled()
  })

  it('keeps one ride open at a time', () => {
    wrap(<W3CrewFeedView rides={[ride(), ride({ id: 2, title: 'Feierabend' })]} />)
    fireEvent.click(screen.getByText('Alpenrand'))
    expect(screen.getAllByLabelText('Kommentar schreiben').length).toBe(1)
    fireEvent.click(screen.getByText('Feierabend'))
    expect(screen.getAllByLabelText('Kommentar schreiben').length).toBe(1)
  })

  it('shows the thread the server sent, and marks the rider’s own lines', async () => {
    const comments: CrewRideComment[] = [
      { id: 1, activity_id: 1, user_id: 6, handle: 'luca', display_name: 'luca', text: 'Brutal am Schluss.', created_at: new Date().toISOString(), is_mine: false },
      { id: 2, activity_id: 1, user_id: 5, handle: 'jannis', display_name: 'jannis', text: 'Nächstes Mal komm ich mit.', created_at: new Date().toISOString(), is_mine: true },
    ]
    fetchCrewRideComments.mockResolvedValue(comments)
    wrap(<W3CrewFeedView rides={[ride({ comment_count: 2 })]} />)
    fireEvent.click(screen.getByText('Alpenrand'))

    await screen.findByText('Brutal am Schluss.')
    expect(screen.getByText('Nächstes Mal komm ich mit.')).toBeTruthy()
    expect(screen.getByText('Du')).toBeTruthy()
  })

  it('writes a comment, clears the box, and appends it without a refetch', async () => {
    postCrewRideComment.mockResolvedValue({
      id: 9, activity_id: 1, user_id: 5, handle: 'jannis', display_name: 'jannis',
      text: 'Stark.', created_at: new Date().toISOString(), is_mine: true,
    })
    wrap(<W3CrewFeedView rides={[ride()]} />)
    fireEvent.click(screen.getByText('Alpenrand'))

    const box = screen.getByLabelText('Kommentar schreiben') as HTMLInputElement
    fireEvent.change(box, { target: { value: 'Stark.' } })
    fireEvent.click(screen.getByLabelText('Kommentar senden'))

    await waitFor(() => expect(postCrewRideComment).toHaveBeenCalledWith(1, 'Stark.'))
    expect(box.value).toBe('')
    await screen.findByText('Stark.')
    expect(fetchCrewRideComments).toHaveBeenCalledTimes(1)  // opened once, never re-polled
  })

  it('refuses to send a box holding only spaces', () => {
    wrap(<W3CrewFeedView rides={[ride()]} />)
    fireEvent.click(screen.getByText('Alpenrand'))
    fireEvent.change(screen.getByLabelText('Kommentar schreiben'), { target: { value: '   ' } })
    fireEvent.click(screen.getByLabelText('Kommentar senden'))
    expect(postCrewRideComment).not.toHaveBeenCalled()
  })

  it('reacts optimistically — the count moves before the server answers', async () => {
    toggleReaction.mockResolvedValue({ target_type: 'ride', target_id: 1, counts: { '🔥': 1 }, mine: ['🔥'], toggled_on: true })
    wrap(<W3CrewFeedView rides={[ride()]} />)

    fireEvent.click(screen.getByLabelText('Reagieren'))
    fireEvent.click(screen.getByLabelText('Mit 🔥 reagieren'))

    expect(screen.getByText('1')).toBeTruthy()
    await waitFor(() =>
      expect(toggleReaction).toHaveBeenCalledWith({ targetType: 'ride', targetId: 1, emoji: '🔥' }))
  })

  it('seeds the chips from the roll-up the feed already carried', () => {
    wrap(<W3CrewFeedView rides={[ride({ reactions: { counts: { '💪': 2 }, mine: ['💪'] } })]} />)
    const chip = screen.getByLabelText('Mit 💪 reagieren')
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(chip.textContent).toContain('2')
  })
})
