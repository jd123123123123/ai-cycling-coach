import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import GpxRehearseCard from '../GpxRehearseCard'
import type { AthleteProfile } from '../../../types/athlete'

const createRehearsal = vi.fn()
const updateProfile = vi.fn()

vi.mock('../../../api/rehearsal', () => ({
  createRehearsal: (...args: unknown[]) => createRehearsal(...args),
}))
vi.mock('../../../api/athletes', () => ({
  updateProfile: (...args: unknown[]) => updateProfile(...args),
}))

const GPX = '<?xml version="1.0"?><gpx version="1.1"></gpx>'

/** jsdom's File has no .text() in this environment — give it one. */
function gpxFile(name = 'maratona.gpx', body = GPX): File {
  const file = new File([body], name, { type: 'application/gpx+xml' })
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(body) })
  return file
}

function renderCard(profile?: Partial<AthleteProfile>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/plan']}>
        <Routes>
          <Route
            path="/plan"
            element={<GpxRehearseCard profile={profile as AthleteProfile | undefined} de={false} />}
          />
          <Route path="/rehearse/:id" element={<span data-testid="landed">rehearsal</span>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('GpxRehearseCard', () => {
  beforeEach(() => {
    createRehearsal.mockReset()
    updateProfile.mockReset()
  })
  afterEach(cleanup)

  it('reads the file client-side and lands on the rehearsal', async () => {
    createRehearsal.mockResolvedValue({ id: 91 })
    const { container } = renderCard()
    pick(container, gpxFile())

    await waitFor(() => expect(screen.getByTestId('landed')).toBeTruthy())
    expect(createRehearsal).toHaveBeenCalledWith(
      expect.objectContaining({ source_kind: 'gpx', gpx: GPX, name: 'maratona' }),
    )
    // The course is not saved against the event unless asked.
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('writes the target-event course when asked, before rehearsing', async () => {
    createRehearsal.mockResolvedValue({ id: 92 })
    updateProfile.mockResolvedValue({})
    const { container } = renderCard()
    fireEvent.click(container.querySelector('input[type="checkbox"]')!)
    pick(container, gpxFile())

    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ target_event_gpx: GPX }))
    await waitFor(() => expect(screen.getByTestId('landed')).toBeTruthy())
  })

  it('says so and does not navigate when saving the course fails', async () => {
    updateProfile.mockRejectedValue(new Error('nope'))
    const { container } = renderCard()
    fireEvent.click(container.querySelector('input[type="checkbox"]')!)
    pick(container, gpxFile())

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(createRehearsal).not.toHaveBeenCalled()
    expect(screen.queryByTestId('landed')).toBeNull()
  })

  it('offers the stored target-event course only once one exists', async () => {
    createRehearsal.mockResolvedValue({ id: 93 })
    const { unmount } = renderCard({ has_target_event_route: false })
    expect(screen.queryByText(/target-event course/i)).toBeNull()
    unmount()

    renderCard({ has_target_event_route: true })
    fireEvent.click(screen.getByText(/target-event course/i))
    await waitFor(() =>
      expect(createRehearsal).toHaveBeenCalledWith(
        expect.objectContaining({ source_kind: 'target_event' }),
      ),
    )
  })
})
