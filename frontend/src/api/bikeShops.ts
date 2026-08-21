import { apiClient } from './client'

// ──────────────────────────────────────────────────────────────────────
// Bike-shop finder — GET /workshop/nearby.
//
// Distinct from `api/workshop.ts`, which is the rider's OWN workshop (their
// components, their Service Bonus). This one answers the other question: where
// is the nearest place that can fix the bike, and is it open right now.
//
// Bike shops, places that fix bikes without being shops, and the unattended
// 24/7 public repair stations, all from OpenStreetMap via Overpass (see the
// backend service for why not Google Places). Coordinates are optional:
// without them the backend falls back to the last plausible GPS point.
// ──────────────────────────────────────────────────────────────────────

export interface WorkshopServices {
  repair: boolean
  repair_only: boolean
  retail: boolean
  rental: boolean
  second_hand: boolean
  diy: boolean
  pump: boolean
  chain_tool: boolean
  cleaning: boolean
  charging: boolean
}

export interface Workshop {
  osm_type: string
  osm_id: number
  /** shop = bike shop · service = fixes bikes but isn't one · station = public tool stand */
  kind: 'shop' | 'service' | 'station'
  name: string | null
  lat: number
  lng: number
  distance_m: number
  /** Eight-point compass label from the athlete's position. */
  direction: string
  address: string | null
  phone: string | null
  website: string | null
  opening_hours: string | null
  /** Today's spans, e.g. "10:00-13:00, 14:00-18:00" — null when unknown. */
  todays_hours: string | null
  /** null means "the opening_hours string is outside the parseable subset" —
   *  the UI shows the raw string rather than guessing closed. */
  open_now: boolean | null
  brands: string | null
  services: WorkshopServices
}

export interface NearbyWorkshops {
  available: boolean
  reason?: 'no_location' | 'none_found'
  origin: { lat: number; lng: number; source: 'device' | 'last_ride' } | null
  radius_m?: number
  shops: Workshop[]
  stations: Workshop[]
  open_now_count?: number
  attribution: string
}

export async function fetchNearbyWorkshops(params: {
  lat?: number
  lng?: number
  radiusM?: number
}): Promise<NearbyWorkshops> {
  const res = await apiClient.get<NearbyWorkshops>('/workshop/nearby', {
    params: {
      ...(params.lat != null && params.lng != null ? { lat: params.lat, lng: params.lng } : {}),
      ...(params.radiusM ? { radius_m: params.radiusM } : {}),
    },
  })
  return res.data
}
