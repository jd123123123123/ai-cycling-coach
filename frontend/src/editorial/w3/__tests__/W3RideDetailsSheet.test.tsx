import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const fetchRideDetails = vi.fn()
const saveRideDetails = vi.fn()
const uploadRidePhoto = vi.fn()
const deleteRidePhoto = vi.fn()

vi.mock('../../../api/rideDetails', () => ({
  fetchRideDetails: (...a: unknown[]) => fetchRideDetails(...a),
  saveRideDetails: (...a: unknown[]) => saveRideDetails(...a),
  uploadRidePhoto: (...a: unknown[]) => uploadRidePhoto(...a),
  deleteRidePhoto: (...a: unknown[]) => deleteRidePhoto(...a),
}))

const { default: W3RideDetailsSheet } = await import('../W3RideDetailsSheet')

/**
 * The editor behind the Strava moment.
 *
 * Every write here is its own on purpose — the failure mode of a batch is
 * losing all of it, and a rider who picks three photos, writes a paragraph and
 * hits a dead network must not lose the photos too. Most of these tests are
 * about what survives a failure.
 */

const photo = (id: number) => ({ id, url: `/activities/9/photos/${id}`, width: 800, height: 600 })
const file = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  fetchRideDetails.mockReset().mockResolvedValue({ id: 9, title: 'Abendrunde', description: 'Schön war es', photos: [photo(1)] })
  saveRideDetails.mockReset().mockResolvedValue({ id: 9, title: '', description: '', photos: [] })
  uploadRidePhoto.mockReset().mockResolvedValue(photo(2))
  deleteRidePhoto.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

const draw = (over: Partial<React.ComponentProps<typeof W3RideDetailsSheet>> = {}) =>
  render(<W3RideDetailsSheet activityId={9} open onClose={() => {}} {...over} />)

describe('opening it', () => {
  it('loads what the ride already has', async () => {
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    expect(screen.getByDisplayValue('Schön war es')).toBeTruthy()
  })

  it('fetches nothing while closed', () => {
    draw({ open: false })
    expect(fetchRideDetails).not.toHaveBeenCalled()
  })

  it('says so when the ride will not load', async () => {
    fetchRideDetails.mockRejectedValue(new Error('offline'))
    draw()
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})

describe('photos', () => {
  it('uploads the moment one is chosen — no save button in between', async () => {
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    const input = document.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [file()] } })
    await waitFor(() => expect(uploadRidePhoto).toHaveBeenCalledWith(9, expect.any(File)))
  })

  it('UPLOADS ONE AT A TIME, because the server caps photos per ride', async () => {
    // Six parallel posts would each read a count that was true when it started.
    let inFlight = 0
    let maxInFlight = 0
    uploadRidePhoto.mockImplementation(async () => {
      inFlight += 1; maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return photo(9)
    })
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file('a.jpg'), file('b.jpg'), file('c.jpg')] },
    })
    await waitFor(() => expect(uploadRidePhoto).toHaveBeenCalledTimes(3))
    expect(maxInFlight).toBe(1)
  })

  it('NAMES A REFUSED UPLOAD rather than saying something went wrong', async () => {
    uploadRidePhoto.mockRejectedValue({
      response: { data: { detail: 'Höchstens 6 Fotos pro Fahrt' } },
    })
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file()] } })
    await waitFor(() => expect(screen.getByText('Höchstens 6 Fotos pro Fahrt')).toBeTruthy())
  })

  it('stops after the first refusal instead of throwing the rest at it', async () => {
    uploadRidePhoto.mockRejectedValue({ response: { data: { detail: 'zu groß' } } })
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.change(document.querySelector('input[type="file"]')!, {
      target: { files: [file('a.jpg'), file('b.jpg'), file('c.jpg')] },
    })
    await waitFor(() => expect(screen.getByText('zu groß')).toBeTruthy())
    expect(uploadRidePhoto).toHaveBeenCalledTimes(1)
  })

  it('PUTS A PHOTO BACK when the delete fails', async () => {
    // Optimistic removal must not become a silent loss.
    deleteRidePhoto.mockRejectedValue(new Error('nope'))
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.click(screen.getByLabelText('Foto entfernen'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.getByLabelText('Foto entfernen')).toBeTruthy()
  })
})

describe('the words', () => {
  it('saves on blur, not on a button', async () => {
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    const box = screen.getByDisplayValue('Schön war es')
    fireEvent.change(box, { target: { value: 'Über den Pass' } })
    fireEvent.blur(box)
    await waitFor(() => expect(saveRideDetails).toHaveBeenCalledWith(9, {
      title: 'Abendrunde', description: 'Über den Pass',
    }))
  })

  it('writes nothing when nothing was typed', async () => {
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.blur(screen.getByDisplayValue('Schön war es'))
    expect(saveRideDetails).not.toHaveBeenCalled()
  })

  it('says so when the text will not save', async () => {
    saveRideDetails.mockRejectedValue(new Error('offline'))
    draw()
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    const box = screen.getByDisplayValue('Schön war es')
    fireEvent.change(box, { target: { value: 'neu' } })
    fireEvent.blur(box)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
  })
})

describe('finishing', () => {
  it('tells the caller only when something actually landed', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    draw({ onSaved, onClose })
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.click(screen.getByText('Fertig'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSaved).not.toHaveBeenCalled()   // nothing was changed
  })

  it('refetches the feed once a photo has landed', async () => {
    const onSaved = vi.fn()
    draw({ onSaved })
    await waitFor(() => expect(screen.getByDisplayValue('Abendrunde')).toBeTruthy())
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file()] } })
    await waitFor(() => expect(uploadRidePhoto).toHaveBeenCalled())
    fireEvent.click(screen.getByText('Fertig'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
  })
})
