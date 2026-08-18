import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import {
  SHOP_BIKES, SHOP_PARTS, ITEM_BY_ID, itemById, bikesByTier, partsBySlot,
  isEquipped, equippedInSlot, artFit, type ShopItem,
} from '../w3/w3shop'
import { STARTER_BIKE_ID } from '../w3/w3bikes'
import { STOCK_PARTS, SLOTS } from '../w3/w3parts'
import { stateOf } from '../w3/W3ShopView'
import { purchaseError } from '../w3/W3ShopPage'
import type { Loadout } from '../../api/shop'

const loadout = (over: Partial<Loadout> = {}): Loadout => ({
  bike: STARTER_BIKE_ID, frame: null, wheels: null, bars: null, saddle: null, ...over,
})
const item = (id: string): ShopItem => {
  const found = itemById(id)
  if (!found) throw new Error(`fixture asked for a catalogue item that does not exist: ${id}`)
  return found
}

// ── The catalogue ───────────────────────────────────────────────────────────
describe('the catalogue', () => {
  it('has no id collisions across bikes and parts', () => {
    // Ownership is ONE flat id namespace server-side (`garage_items.item_id`),
    // so a bike and a part sharing an id would mean buying one grants the other.
    const ids = [...SHOP_BIKES, ...SHOP_PARTS].map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ITEM_BY_ID.size).toBe(ids.length)
  })

  it('gives every item a name, a blurb and a non-negative price', () => {
    for (const i of [...SHOP_BIKES, ...SHOP_PARTS]) {
      expect(i.name.trim(), `${i.id} name`).not.toBe('')
      expect(i.blurb.trim(), `${i.id} blurb`).not.toBe('')
      expect(i.price, `${i.id} price`).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(i.price), `${i.id} price is whole RideCoin`).toBe(true)
    }
  })

  it('has exactly one free bike, and it is the starter everyone is granted', () => {
    const free = SHOP_BIKES.filter((b) => b.price === 0)
    expect(free.map((b) => b.id)).toEqual([STARTER_BIKE_ID])
  })

  it('has a real, free stock part for every slot', () => {
    // `ensure_starter` grants exactly these; a missing or priced one would mean
    // a new rider either lands with an empty slot or is charged for standard kit.
    for (const slot of SLOTS.map((s) => s.slot)) {
      const stock = itemById(STOCK_PARTS[slot])
      expect(stock, `stock part for ${slot}`).not.toBeNull()
      expect(stock!.price).toBe(0)
      expect(stock!.slot).toBe(slot)
    }
  })

  it('groups every item exactly once — no filter silently drops one', () => {
    const grouped = [...bikesByTier(), ...partsBySlot()].flatMap((g) => g.items).map((i) => i.id)
    expect(grouped.slice().sort()).toEqual([...SHOP_BIKES, ...SHOP_PARTS].map((i) => i.id).sort())
  })

  it('fits bike art with cover and part art with contain', () => {
    // Bikes carry an opaque studio backdrop that differs per render, so `cover`
    // makes that backdrop the stage; parts are transparent and must not crop.
    expect(artFit({ kind: 'bike' })).toBe('cover')
    expect(artFit({ kind: 'part' })).toBe('contain')
  })

  it('returns null for an unknown id rather than throwing', () => {
    expect(itemById('carbon-unicorn')).toBeNull()
    expect(itemById(null)).toBeNull()
    expect(itemById(undefined)).toBeNull()
  })
})

// ── What the rider is wearing ───────────────────────────────────────────────
describe('isEquipped / equippedInSlot', () => {
  it('reads the bike from the loadout', () => {
    expect(isEquipped(loadout(), item(STARTER_BIKE_ID))).toBe(true)
    expect(isEquipped(loadout({ bike: 'steel-fixie' }), item(STARTER_BIKE_ID))).toBe(false)
  })

  it('reads a part from its own slot only', () => {
    const worn = loadout({ bars: 'bars-lime' })
    expect(isEquipped(worn, item('bars-lime'))).toBe(true)
    expect(isEquipped(worn, item('bars-white'))).toBe(false)
    expect(equippedInSlot(worn, 'bars')).toBe('bars-lime')
  })

  it('treats an empty slot as stock, never as some other part', () => {
    const bare = loadout()
    expect(equippedInSlot(bare, 'saddle')).toBeNull()
    expect(isEquipped(bare, item('saddle-lime'))).toBe(false)
  })

  it('reports nothing equipped when the loadout has not loaded', () => {
    expect(isEquipped(undefined, item(STARTER_BIKE_ID))).toBe(false)
    expect(equippedInSlot(undefined, 'frame')).toBeNull()
  })
})

// ── The state one item is in for one rider ──────────────────────────────────
describe('stateOf', () => {
  const fixie = item('steel-fixie')       // 550 RC
  const owned = (...ids: string[]) => new Set(ids)

  it('ranks equipped above owned', () => {
    expect(stateOf(fixie, owned('steel-fixie'), loadout({ bike: 'steel-fixie' }), 9999)).toBe('equipped')
  })

  it('ranks owned above affordable', () => {
    expect(stateOf(fixie, owned('steel-fixie'), loadout(), 9999)).toBe('owned')
  })

  it('is affordable at exactly the price', () => {
    expect(stateOf(fixie, owned(), loadout(), fixie.price)).toBe('affordable')
    expect(stateOf(fixie, owned(), loadout(), fixie.price - 1)).toBe('tooExpensive')
  })

  it('never calls something affordable while the balance is unknown', () => {
    // A null balance is "we could not read the wallet" — offering a buy button
    // against it would promise a purchase the server may refuse with a 402.
    expect(stateOf(fixie, owned(), loadout(), null)).toBe('tooExpensive')
  })
})

// ── Turning a failed purchase into a sentence ───────────────────────────────
describe('purchaseError', () => {
  const fixie = item('steel-fixie')
  const axios = (status: number) =>
    new AxiosError('failed', 'ERR', undefined, undefined, {
      status, data: {}, statusText: '', headers: {}, config: { headers: {} },
    } as never)

  it('says how much is missing on a 402, with the real arithmetic', () => {
    expect(purchaseError(axios(402), fixie, 200)).toBe('Dir fehlen noch 350 RideCoin.')
  })

  it('falls back to a plain sentence on a 402 with no balance to subtract', () => {
    expect(purchaseError(axios(402), fixie, null)).toBe('Dafür reicht dein Guthaben nicht.')
  })

  it('explains a 409 as already owned', () => {
    expect(purchaseError(axios(409), fixie, 9999)).toMatch(/gehört dir bereits/i)
  })

  it('explains a 404 as gone', () => {
    expect(purchaseError(axios(404), fixie, 9999)).toMatch(/gibt es nicht mehr/i)
  })

  it('gives a retryable sentence for a network failure or a 500', () => {
    expect(purchaseError(new Error('network down'), fixie, 9999)).toMatch(/noch einmal/i)
    expect(purchaseError(axios(500), fixie, 9999)).toMatch(/noch einmal/i)
  })
})
