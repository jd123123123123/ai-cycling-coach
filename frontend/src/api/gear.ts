import { apiClient } from './client'

// The equipment catalogue — what the rider can buy, owns, and is wearing.
// Backend: app/api/garage.py (`/garage/gear`), catalogue in
// app/services/earn_modifiers.py.
//
// NOTHING HERE IS EVER FREE. Every item has a price and `gear.buy` is the only
// path to ownership. There is deliberately no `claim` and no `grant`.

export type GearRarity = 'common' | 'rare' | 'legendary'

export interface GearItem {
  id: string
  name_de: string
  /** One of the five slots. One item per slot may be worn. */
  slot: string
  slot_label: string
  rarity: GearRarity
  /** Percentage points added to base earn WHEN THE RIDE MATCHES. */
  pct: number
  price_rc: number
  /** The firing rule, in the rider's language. */
  why: string
  /** One line of character — the reason the item is fun rather than a stat. */
  flavour_de: string
  owned: boolean
  equipped: boolean
  /** Whether the rider could buy it right now. Unaffordable items are shown,
   *  not hidden: an item you cannot yet buy is a goal. */
  affordable: boolean
}

export interface Gear {
  items: GearItem[]
  balance: number
  /** slot id → label. Comes from the server so the client never hard-codes
   *  the slot names or their order. */
  slots: Record<string, string>
}

/** Static art, generated once by `backend/scripts/generate_gear_art.py` and
 *  shipped from `public/`. An item looks the same for everybody, so this is
 *  never a per-rider render. */
export const gearArt = (id: string) => `/w3/gear/${id}.webp`

export async function fetchGear(): Promise<Gear> {
  const res = await apiClient.get<Gear>('/garage/gear')
  return res.data
}

export async function buyGear(itemId: string): Promise<Gear> {
  const res = await apiClient.post<Gear>(`/garage/gear/buy/${itemId}`)
  return res.data
}

export async function equipGear(itemId: string): Promise<Gear> {
  const res = await apiClient.post<Gear>(`/garage/gear/equip/${itemId}`)
  return res.data
}

export async function unequipGear(itemId: string): Promise<Gear> {
  const res = await apiClient.post<Gear>(`/garage/gear/unequip/${itemId}`)
  return res.data
}
