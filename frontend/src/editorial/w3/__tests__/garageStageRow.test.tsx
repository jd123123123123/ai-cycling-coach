import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import W3GarageLane from '../W3GarageLane'
import { backdropArt } from '../w3backdropArt'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    delete p.initial; delete p.animate; delete p.exit; delete p.transition; delete p.whileInView; delete p.viewport
    return <div {...p}>{children}</div>
  } }),
}))
vi.mock('framer-motion', () => ({
  useReducedMotion: () => true,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => {
    const p: Record<string, unknown> = { ...rest }
    delete p.initial; delete p.animate; delete p.exit; delete p.transition; delete p.whileInView; delete p.viewport
    return <div {...p}>{children}</div>
  } }),
}))

const props = {
  workshop: null,
  onOpenWorkshop: () => {},
  onOpenGear: () => {},
  onOpenShop: () => {},
}

afterEach(cleanup)

/**
 * `W3StageRail` — the in-garage way to change the room — is mounted NOWHERE,
 * while `W3TodayStage`'s comment claims it "is still wired there". So the only
 * path to the backdrop picker was a list at the foot of the shop. This pins the
 * row that replaces it.
 */
describe('garage · the room the bike is standing in', () => {
  it('names the current room, so the rider can see it without leaving the garage', () => {
    render(<W3GarageLane {...props} stage={{ id: 'dawn_road', name: 'Morgengrauen' }} onOpenStages={() => {}} />)
    expect(screen.getByText('Kulisse')).toBeTruthy()
    expect(screen.getByText('Morgengrauen')).toBeTruthy()
  })

  it('opens the picker in one tap', () => {
    const onOpenStages = vi.fn()
    render(<W3GarageLane {...props} stage={{ id: 'night_road', name: 'Nachtstraße' }} onOpenStages={onOpenStages} />)
    fireEvent.click(screen.getByText('Kulisse'))
    expect(onOpenStages).toHaveBeenCalledOnce()
  })

  it('draws nothing at all while the read is in flight, rather than naming a stage nobody chose', () => {
    render(<W3GarageLane {...props} stage={null} onOpenStages={() => {}} />)
    expect(screen.queryByText('Kulisse')).toBeNull()
  })
})

describe('backdropArt · every room has a face', () => {
  it('gives each shipped stage its own art', () => {
    const ids = [
      'studio_black', 'starter_road', 'night_road', 'dawn_road', 'mountain_pass',
      'coast_road', 'rain_road', 'gravel_track', 'winter_road', 'velodrome',
    ]
    const seen = new Set(ids.map((id) => backdropArt(id).css))
    // Ten distinct rooms, ten distinct pictures — a picker where two tiles look
    // identical is the text list again with extra steps.
    expect(seen.size).toBe(ids.length)
    for (const id of ids) expect(backdropArt(id).mood.length).toBeGreaterThan(0)
  })

  it('falls back rather than rendering an empty tile for a stage it has never heard of', () => {
    const art = backdropArt('place:some-col-added-on-the-server')
    expect(art.css.length).toBeGreaterThan(0)
    expect(art.mood).toBe('Ort')
  })
})
