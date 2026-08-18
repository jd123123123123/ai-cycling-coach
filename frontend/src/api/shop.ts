import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// The garage shop — what the rider OWNS and what they're WEARING.
//
// The catalogue itself (names, prices, blurbs, art) is static and lives in
// `editorial/w3/w3bikes.ts` + `w3parts.ts`, so browsing the shop costs no
// network at all. This module carries only the two things that are per-rider
// and therefore have to come from the server: ownership and the loadout.
//
// PRICES ON THE WIRE ARE NOT TRUSTED IN EITHER DIRECTION. The client never
// sends a price — `POST /shop/buy/{id}` takes an id and nothing else, and the
// server charges what ITS catalogue says. The `price` that comes back is what
// was actually debited, for the receipt line; it is never the input.
// ──────────────────────────────────────────────────────────────────────

/** The four cosmetic slots plus the bike itself. Mirrors the server's loadout
 *  columns; `null` means the rider is wearing the bike's own stock part. */
export interface Loadout {
  /** NULL until the rider claims their free first bike. This null is what the
   *  onboarding gate keys on, so it is load-bearing, not a defensive maybe. */
  bike: string | null
  frame: string | null
  wheels: string | null
  bars: string | null
  saddle: string | null
}

export interface Garage {
  balance: number
  /** Every owned item id — bikes and parts in one list, since ownership is one
   *  table server-side and the catalogue is what tells them apart. */
  owned: string[]
  loadout: Loadout
}

export interface PurchaseResult extends Garage {
  item_id: string
  /** What the server actually charged — the receipt, not the request. */
  price: number
}

// GET /shop — balance, owned ids, loadout. The server grants the free starter
// bike on first read, so a brand-new rider already owns something here.
export async function fetchGarage(): Promise<Garage> {
  const res = await apiClient.get<Garage>('/shop')
  return res.data
}

// POST /shop/buy/{item_id} — debit the wallet and take ownership, atomically.
// 402 = not enough RideCoin, 409 = already owned, 404 = no such item.
export async function buyItem(itemId: string): Promise<PurchaseResult> {
  const res = await apiClient.post<PurchaseResult>(`/shop/buy/${itemId}`)
  return res.data
}

// POST /shop/claim/{item_id} — take the free first bike. This is the ONE bike
// nobody pays for, and it can be claimed once ever: 409 once the rider owns any
// bike, 400 if the id is not a free starter bike (the server checks the price,
// so a client cannot claim its way to a 15,000 RC prototype), 404 if unknown.
export async function claimFirstBike(itemId: string): Promise<PurchaseResult> {
  const res = await apiClient.post<PurchaseResult>(`/shop/claim/${itemId}`)
  return res.data
}

// POST /shop/equip/{item_id} — wear something already owned. 409 = not owned.
export async function equipItem(itemId: string): Promise<{ loadout: Loadout }> {
  const res = await apiClient.post<{ loadout: Loadout }>(`/shop/equip/${itemId}`)
  return res.data
}
