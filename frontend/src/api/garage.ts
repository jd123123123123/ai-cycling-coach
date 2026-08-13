import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Garage — the rider's digitalised rider figure and bike, and the composed
// rider-on-bike hero for a ride. Backend: app/api/garage.py.
//
// Renders persist server-side, so `fetchGarage()` is the one honest answer to
// "does this rider have a bike?" — the question every add-your-bike empty state
// keys off. Absent means absent: a null slot is never papered over with a stock
// image.
// ──────────────────────────────────────────────────────────────────────

export type GarageKind = 'rider' | 'bike'

export interface GarageAsset {
  kind: GarageKind
  name: string | null          // "Specialized Allez" — real, from the vision pass
  description: string | null   // the literal analysis; the input to every later render
  image_base64: string | null  // data:image/png;base64,… — the stored collectible
}

export interface Garage {
  rider: GarageAsset | null
  bike: GarageAsset | null
}

export interface AssetRenderResult {
  name: string | null
  description: string | null
  prompt: string
  image_base64: string | null
  status: 'ok' | 'image_model_unavailable' | string
  saved: boolean               // true once this render IS the rider's garage asset
}

/** Why a ride has no composed hero yet — drives what the ride screen offers. */
export type SceneStatus =
  | 'ok'
  | 'not_generated'            // ready to compose
  | 'needs_rider'              // send them to the avatar studio first
  | 'needs_bike'               // send them to the bike studio first
  | 'image_model_unavailable'
  | string

export interface RideScene {
  activity_id: number
  image_base64: string | null
  training_context: string | null
  prompt: string | null
  status: SceneStatus
}

export async function fetchGarage(): Promise<Garage> {
  const res = await apiClient.get<Garage>('/garage')
  return res.data
}

/** Analyse a photo, render the collectible, and keep it as this garage slot.
 *  Slow (vision + image model) — the caller owns the waiting state. */
export async function renderAsset(kind: GarageKind, photoBase64: string): Promise<AssetRenderResult> {
  const res = await apiClient.post<AssetRenderResult>('/garage/asset/render', {
    photo_base64: photoBase64, kind,
  }, { timeout: 180_000 })
  return res.data
}

export async function deleteAsset(kind: GarageKind): Promise<void> {
  await apiClient.delete(`/garage/asset/${kind}`)
}

/** The cheap read: a ride's cached hero, or the reason there isn't one. Never
 *  generates, so it's safe to call on every ride-screen open. */
export async function fetchRideScene(activityId: number): Promise<RideScene> {
  const res = await apiClient.get<RideScene>(`/garage/scene/${activityId}`)
  return res.data
}

/** Compose (and cache) the hero for one ride. Slow and paid — call it once, on
 *  an explicit intent, never on mount. */
export async function renderRideScene(activityId: number): Promise<RideScene> {
  const res = await apiClient.post<RideScene>(`/garage/scene/${activityId}`, undefined, { timeout: 180_000 })
  return res.data
}
