import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Garage } from '../../../api/garage'
import W3SetupGate from '../W3SetupGate'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    for (const k of ['initial','animate','exit','transition','whileInView','viewport','layout','layoutId']) delete p[k]
    return <div {...p}>{children}</div>
  } }),
}))

let garage: Garage | undefined
let garageLoading = false
vi.mock('../../../hooks/useGarage', () => ({
  useGarage: () => ({ data: garage, isLoading: garageLoading }),
}))
vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, isLoading: false }),
}))

const asset = (kind: 'rider' | 'bike') => ({
  kind, name: null, description: null, image_base64: `data:image/webp;base64,AA`,
})

/** The sheet opens on a timer, so every case has to run it forward. */
function openAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><W3SetupGate /></MemoryRouter>)
  act(() => { vi.advanceTimersByTime(1200) })
}

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  garage = { rider: null, bike: null }
  garageLoading = false
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('what the setup gate asks for', () => {
  /**
   * THE BUG THIS EXISTS FOR. The gate read only `garage.rider`, so a rider who
   * had made a rider and no bike was never asked again by anything — while the
   * Today hero went on reporting `needs_bike` in their machine's place. A
   * screen that knows something is missing next to a prompt that never fires is
   * this repo's signature defect, and it had it too.
   */
  it('asks for the bike when the rider is made and the bike is not', () => {
    garage = { rider: asset('rider'), bike: null }
    openAt('/e/w3-today')
    expect(screen.getByText('Dein Rider hat noch kein Rad')).toBeTruthy()
  })

  it('asks for the rider first when both are missing', () => {
    openAt('/e/w3-today')
    expect(screen.getByText('Der Sattel ist noch leer')).toBeTruthy()
    expect(screen.queryByText('Dein Rider hat noch kein Rad')).toBeNull()
  })

  it('says there are two steps only when there really are two', () => {
    /** The counter rides in the EYEBROW, not in the fine print. In the frame it
     *  was a third sentence inside 10.5px quiet text and read as boilerplate. */
    openAt('/e/w3-today')
    expect(screen.getByText(/1 VON 2/)).toBeTruthy()
    cleanup(); sessionStorage.clear()
    // One step from done: a counter here would invent a step they already did.
    garage = { rider: asset('rider'), bike: null }
    openAt('/e/w3-today')
    expect(screen.queryByText(/1 VON 2/)).toBeNull()
  })

  it('stays shut when the garage is complete', () => {
    garage = { rider: asset('rider'), bike: asset('bike') }
    openAt('/e/w3-today')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays shut while the garage is still resolving', () => {
    /** Otherwise a cold start asks every rider for a rider they already have —
     *  `undefined` data is "not known yet", not "not made". */
    garage = undefined
    garageLoading = true
    openAt('/e/w3-today')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never fires on the studio it would send them to', () => {
    openAt('/e/w3-bike-studio')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('never fires on a design preview', () => {
    openAt('/e/w3-today-preview')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('how often it asks', () => {
  it('remembers per subject, so "Später" on the rider does not silence the bike', () => {
    /** ONE FLAG FOR BOTH HALVES WOULD BE THE NAG-OR-SILENCE BUG: dismissing the
     *  rider would also swallow the bike ask for the whole session, and a rider
     *  who then made their rider would never be asked for the machine. */
    openAt('/e/w3-today')
    expect(sessionStorage.getItem('w3.setupGate.rider')).toBe('1')
    expect(sessionStorage.getItem('w3.setupGate.bike')).toBeNull()

    cleanup()
    garage = { rider: asset('rider'), bike: null }
    openAt('/e/w3-today')
    expect(screen.getByText('Dein Rider hat noch kein Rad')).toBeTruthy()
  })

  it('does not ask twice in one session', () => {
    openAt('/e/w3-today')
    expect(screen.getByRole('dialog')).toBeTruthy()
    cleanup()
    openAt('/e/w3-today')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
