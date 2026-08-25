import { describe, it, expect } from 'vitest'
import { sortByRideWindow, windowSummary, type RidePhoto } from '../rideWindowPhotos'

/**
 * The rule under test is a refusal: a photo whose capture time we do not KNOW
 * is never claimed as being from the ride. `lastModified` is when the file
 * landed on disk, so a picture AirDropped tonight would otherwise be filed
 * under tonight's ride and printed beneath its numbers.
 */

const START = new Date(2026, 7, 23, 6, 41, 0)
const MOVING = 2 * 3600            // a two-hour ride

const fileAt = (name: string, ms: number) =>
  new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg', lastModified: ms })

describe('rideWindowPhotos · what counts as "from this ride"', () => {
  it('does not claim a photo whose time only comes from the filesystem', async () => {
    // lastModified sits squarely inside the ride, and it still must not count.
    const mid = START.getTime() + 60 * 60_000
    const [p] = await sortByRideWindow([fileAt('airdropped.jpg', mid)], START, MOVING)

    expect(p.takenAt).not.toBeNull()
    expect(p.exact).toBe(false)
    expect(p.duringRide).toBe(false)
  })

  it('keeps the photo on offer even when it cannot date it', async () => {
    const [p] = await sortByRideWindow([fileAt('screenshot.png', Date.now())], START, MOVING)
    expect(p.file.name).toBe('screenshot.png')
  })

  it('reads nothing out of a file that is not a JPEG', async () => {
    const [p] = await sortByRideWindow([fileAt('note.txt', Date.now())], START, MOVING)
    expect(p.exact).toBe(false)
  })
})

describe('rideWindowPhotos · what it tells the rider', () => {
  const photo = (o: Partial<RidePhoto>): RidePhoto => ({
    file: fileAt('x.jpg', 0), takenAt: null, exact: false, duringRide: false, ...o,
  })

  it('says nothing when nothing was picked', () => {
    expect(windowSummary([])).toBeNull()
  })

  it('counts the ones it can vouch for', () => {
    expect(windowSummary([
      photo({ exact: true, duringRide: true }),
      photo({ exact: true, duringRide: true }),
      photo({ exact: true }),
    ])).toBe('2 Bilder sind von dieser Fahrt')
  })

  it('separates "none matched" from "none could be read"', () => {
    expect(windowSummary([photo({ exact: true })]))
      .toBe('Keins davon wurde während dieser Fahrt aufgenommen')
    expect(windowSummary([photo({})]))
      .toBe('Keine Aufnahmezeit in diesen Bildern — du wählst selbst')
  })
})
