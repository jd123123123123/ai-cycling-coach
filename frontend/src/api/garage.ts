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

/**
 * The poses Today's hero can be in — mirrors `services/ride_scene.DAY_POSES`,
 * which the endpoint validates against (anything else is a 422).
 *
 * These are day-STATES, not dates: 'rest' is the avatar asleep on the bike,
 * 'hard' is it flat out. The server caches one composed image per pose per
 * rider, so a rider only ever pays for each of these once.
 */
export type DayPose = 'rest' | 'lazy' | 'endurance' | 'hard' | 'recovery' | 'trained' | 'evening'

export interface DayScene {
  pose: DayPose
  image_base64: string | null
  training_context: string | null
  prompt: string | null
  status: SceneStatus
}

/** The cheap read: today's cached hero for a pose, or the reason there isn't
 *  one. Never generates, so it is safe on every Today open. */
export async function fetchDayScene(pose: DayPose): Promise<DayScene> {
  const res = await apiClient.get<DayScene>('/garage/scene/today', { params: { pose } })
  return res.data
}

/** Compose (and cache) today's hero for one pose. Slow and paid — explicit
 *  intent only, never on mount. Re-posting a composed pose is free: the server
 *  returns the cached image rather than re-rendering. */
export async function renderDayScene(pose: DayPose): Promise<DayScene> {
  const res = await apiClient.post<DayScene>('/garage/scene/today', undefined, {
    params: { pose }, timeout: 180_000,
  })
  return res.data
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

/** Draw an existing asset again in the current art direction.
 *
 *  Needs no photograph: the vision pass's description is what the renderer was
 *  ever given, and it is stored — so the figure stays recognisably the same
 *  person and the bike stays the same bicycle, and only the treatment changes.
 *  Slow (a full image-model render), so it carries the same timeout as one. */
export async function restyleAsset(kind: GarageKind): Promise<AssetRenderResult> {
  const res = await apiClient.post<AssetRenderResult>(
    `/garage/asset/${kind}/restyle`, undefined, { timeout: 180_000 },
  )
  return res.data
}

/** Name the thing the rider owns. The vision pass guesses a name off the frame,
 *  and a guess about somebody's own bicycle is a default, not a decision. */
export async function renameAsset(kind: GarageKind, name: string): Promise<GarageAsset> {
  const res = await apiClient.patch<GarageAsset>(`/garage/asset/${kind}/name`, { name })
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

// ──────────────────────────────────────────────────────────────────────
// Today's stage — the avatar and the bike, exactly as the rider configured
// them. Backend: `GET /garage/today`.
//
// NO COMPOSED SCENE HERE, deliberately. Today draws two pictures the rider
// already owns — the bust above, the bike below — and never the slow
// rider-on-bike composition. `DayScene` above still serves the ride surfaces.
// ──────────────────────────────────────────────────────────────────────

/** One backdrop the rider owns and can swipe to. */
export interface Stage {
  id: string
  name: string
  /** True for a real place someone rode, false for a hand-written stage. */
  is_place: boolean
}

export interface TodayStage {
  /** The bust, wearing whatever is in the helmet and eyewear slots. */
  rider_image: string | null
  /** The bike, wearing its parts, standing in `stage`. */
  bike_image: string | null
  bike_name: string | null
  /** What the model was asked to change, so a build can be explained. */
  changes: string[]
  stage: string
  stages: Stage[]
  status: 'ok' | 'needs_assets' | string
}

/** The cheap read. Cached renders or the plain assets — never generates, so it
 *  is safe on every Today open. */
export async function fetchTodayStage(): Promise<TodayStage> {
  const res = await apiClient.get<TodayStage>('/garage/today')
  return res.data
}

/** Compose whichever of the two pictures this configuration is missing. Slow
 *  and paid; idempotent, so re-posting an already-composed configuration is
 *  free. Explicit intent only. */
export async function renderTodayStage(): Promise<TodayStage> {
  const res = await apiClient.post<TodayStage>('/garage/today/render', undefined, {
    timeout: 180_000,
  })
  return res.data
}

/** One place in the gallery — real locations riders have been. */
export interface Place {
  slug: string
  name: string
  plate_url: string | null
  price_rc: number
  /** Rode there. The gate money cannot open. */
  stamped: boolean
  rides: number
  owned: boolean
  selected: boolean
}

export interface Backdrop {
  id: string
  name_de: string
  unlock_de: string
  unlocked: boolean
  selected: boolean
}

export interface Backdrops {
  backdrops: Backdrop[]
  places: Place[]
  selected: string
  balance_rc: number
}

export async function fetchBackdrops(): Promise<Backdrops> {
  const res = await apiClient.get<Backdrops>('/garage/backdrops')
  return res.data
}

/** Switch stage. FREE AND INSTANT: it stores the choice and hands back the
 *  screen. A stage the rider has stood in before comes back with its picture
 *  already cached; a new one comes back with the plain bike until
 *  `renderTodayStage` composes it. */
export async function selectBackdrop(id: string): Promise<TodayStage> {
  const res = await apiClient.post<TodayStage>(
    `/garage/backdrops/${encodeURIComponent(id)}`,
  )
  return res.data
}

/** Spend RideCoin on a place this rider has a stamp for. 403 without the
 *  stamp, 402 without the coins — two gates, refused differently. */
export async function buyPlace(slug: string): Promise<Backdrops> {
  const res = await apiClient.post<Backdrops>(
    `/garage/places/${encodeURIComponent(slug.replace(/^place:/, ''))}/buy`,
  )
  return res.data
}
