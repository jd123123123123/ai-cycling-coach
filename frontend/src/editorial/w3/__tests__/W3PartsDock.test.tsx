import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import W3PartsDock from '../W3PartsDock'
import type { Gear, GearItem } from '../../../api/gear'

vi.mock('motion/react', () => ({
  useReducedMotion: () => true,
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: () => ({ children, ...rest }: any) => {
    const p = { ...rest }; delete p.initial; delete p.animate; delete p.exit; delete p.transition
    return <div {...p}>{children}</div>
  } }),
}))

const item = (o: Partial<GearItem> & { id: string; slot: string }): GearItem => ({
  name_de: o.id, slot_label: o.slot, rarity: 'common', pct: 5, price_rc: 100,
  why: 'am Berg', flavour_de: '', owned: false, equipped: false, affordable: true, ...o,
})

const gear: Gear = {
  balance: 900,
  slots: { wheels: 'Laufräder', tyres: 'Reifen' },
  items: [
    item({ id: 'deep_carbon', slot: 'wheels', owned: true, equipped: true, pct: 9 }),
    item({ id: 'climbing_wheels', slot: 'wheels', owned: true, pct: 7 }),
    item({ id: 'aero_wheels', slot: 'wheels', pct: 11, price_rc: 4000, affordable: false }),
    item({ id: 'slicks', slot: 'tyres', owned: true, pct: 4 }),
  ],
}

afterEach(cleanup)

describe('Garage · the slot opens where it was tapped', () => {
  it('shows nothing until a slot is tapped', () => {
    render(<W3PartsDock gear={gear} onOpenWorkshop={() => {}} workshopBonus={null} />)
    expect(screen.queryByText('climbing_wheels')).toBeNull()
  })

  it('opens that slot inline, and only that slot', () => {
    render(<W3PartsDock gear={gear} onOpenWorkshop={() => {}} workshopBonus={null} />)
    fireEvent.click(screen.getByLabelText(/Laufräder/))
    expect(screen.queryByText('climbing_wheels')).not.toBeNull()
    // The other slot's item must not leak into this shelf.
    expect(screen.queryByText('slicks')).toBeNull()
  })

  it('equips from the shelf without navigating', () => {
    const onEquip = vi.fn()
    render(<W3PartsDock gear={gear} onOpenWorkshop={() => {}} workshopBonus={null} onEquip={onEquip} />)
    fireEvent.click(screen.getByLabelText(/Laufräder/))
    fireEvent.click(screen.getByLabelText('climbing_wheels — Anlegen'))
    expect(onEquip).toHaveBeenCalledWith('climbing_wheels')
  })

  it('offers exactly one verb per item, and none for what it cannot afford', () => {
    render(<W3PartsDock gear={gear} onOpenWorkshop={() => {}} workshopBonus={null} />)
    fireEvent.click(screen.getByLabelText(/Laufräder/))
    expect(screen.getByLabelText('deep_carbon — Abnehmen')).toBeTruthy()
    expect((screen.getByLabelText(/aero_wheels — /) as HTMLButtonElement).disabled).toBe(true)
  })

  it('tapping the open slot again closes the shelf', () => {
    render(<W3PartsDock gear={gear} onOpenWorkshop={() => {}} workshopBonus={null} />)
    fireEvent.click(screen.getByLabelText(/Laufräder/))
    expect(screen.queryByText('climbing_wheels')).not.toBeNull()
    // Re-queried: the motion mock rebuilds the node on re-render, so a handle
    // captured before the first click is stale by the second.
    fireEvent.click(screen.getByLabelText(/Laufräder/))
    expect(screen.queryByText('climbing_wheels')).toBeNull()
  })
})
