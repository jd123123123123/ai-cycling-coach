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

/**
 * The state of the composed photograph of this build.
 *
 * `stock` — nothing bought is worn, so the picture IS the static catalogue art
 *           that ships with the app. Free and instant; there is nothing to wait
 *           for and nothing to render.
 * `ok`     — a composed photograph exists in `render`.
 * `pending`— one is being made (by this rider or by anyone else building the
 *           same bike). Show the plain bike meanwhile.
 * `none`   — a paid build that has never been asked for.
 * `failed` — the image model refused or was unavailable. The plain bike stands
 *           in, and asking again retries.
 */
export type RenderStatus = 'stock' | 'ok' | 'pending' | 'none' | 'failed'

export interface Garage {
  balance: number
  /** Every owned item id — bikes and parts in one list, since ownership is one
   *  table server-side and the catalogue is what tells them apart. */
  owned: string[]
  loadout: Loadout
  /** "<bike>|<frame>|<wheels>|<bars>|<saddle>", stock slots collapsed to "-".
   *  Null when the rider has no bike. Identical for every rider on the same
   *  build, which is why one render serves all of them. */
  build_key: string | null
  render_status: RenderStatus
  /** The composed build as a data URL, or null. Never a placeholder: when there
   *  is no render the surfaces fall back to the bike's own catalogue photo. */
  render: string | null
  /** Kilometres ridden since the worn bike was CLAIMED — not rider lifetime.
   *  The garage draws this on the frame, and a plate on the frame is a claim
   *  about that frame: lifetime distance would have a box-fresh bike announce
   *  thousands of kilometres it never turned a wheel for. `null` when no bike
   *  is worn, and the garage then draws no plate — "no bike" is not "0 km". */
  bike_km: number | null
}

export interface RenderResult {
  build_key: string | null
  status: RenderStatus
  render: string | null
}

// POST /shop/render — ask for the photograph of the current build.
// Cheap and instant for a stock build or one somebody already made; only a
// genuinely new combination starts an image-model call, and that runs in the
// background so this returns immediately.
export async function renderBuild(): Promise<RenderResult> {
  const res = await apiClient.post<RenderResult>('/shop/render')
  return res.data
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

// POST /shop/equip/{item_id} — wear something already owned. 409 = not owned.
export async function equipItem(itemId: string): Promise<{ loadout: Loadout }> {
  const res = await apiClient.post<{ loadout: Loadout }>(`/shop/equip/${itemId}`)
  return res.data
}
