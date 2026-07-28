import { apiClient, API_BASE_URL, getAccessToken } from './client'

// ──────────────────────────────────────────────────────────────────────
// Types — mirror app/api/crew_events.py (EventRead, AttendeeRead, …)
// ──────────────────────────────────────────────────────────────────────

export type RsvpStatus = 'going' | 'maybe' | 'out'

// Short free-form tag on the event. The backend accepts any ≤32-char string;
// these are the four the V3 Social screen offers in its create form.
export type EventKind = 'sunrise_ride' | 'chaingang' | 'group_ride' | 'race'

export interface EventAttendee {
  user_id: number
  handle: string
  status: RsvpStatus
}

export interface CrewEvent {
  id: number
  crew_id: number
  creator_user_id: number
  creator_handle: string
  name: string
  kind: string
  starts_at: string // ISO
  description: string | null
  meeting_point: string | null
  created_at: string

  // RSVP roll-up
  counts: { going: number; maybe: number; out: number }
  going_count: number
  my_status: RsvpStatus | null
  attendees: EventAttendee[]

  // Tour metadata (present even when no tour → has_tour false, rest null)
  has_tour: boolean
  tour_filename: string | null
  tour_distance_m: number | null
  tour_elevation_m: number | null
  tour_polyline: [number, number][] | null // [[lat, lng], …]
  // Route profile for the elevation chart: [[cumulative_distance_m, ele_m], …],
  // downsampled server-side. Empty/null when the GPX carried no elevation —
  // many route-only exports don't, and the chart says so rather than drawing a
  // flat line that looks like a measurement.
  tour_profile: [number, number][] | null
  tour_descent_m: number | null
  tour_max_grade_pct: number | null
  // Named GPX waypoints, for map pins. Null when the file carried none —
  // unnamed cue points are dropped server-side, since an unlabelled pin is
  // noise and the label is the whole value.
  tour_waypoints: { name: string; lat: number; lng: number; sym?: string | null; desc?: string | null }[] | null
}

// ── Ride weather (GET /crews/me/events/{id}/weather) ──────────────────
// Decoration on a page that must render without it: `available` is false for an
// event with no route (no coordinates to ask about) or one outside the forecast
// horizon, and the card hides rather than inventing a forecast.
export interface EventWeatherHour {
  time: string
  temp_c: number | null
  wind_kmh: number | null
  wind_dir_deg: number | null
  precip_prob_pct: number | null
  weather_code: number | null
}

export interface EventWeather {
  available: boolean
  window_start: string | null
  window_end: string | null
  hourly: EventWeatherHour[]
  sunrise: string | null
}

export async function fetchEventWeather(eventId: number): Promise<EventWeather> {
  const res = await apiClient.get<EventWeather>(`/crews/me/events/${eventId}/weather`)
  return res.data
}

export interface CreateEventInput {
  name: string
  kind: EventKind
  starts_at: string // ISO
  description?: string | null
  meeting_point?: string | null
}

// Partial edit — only the present fields change (mirrors EventUpdate).
export interface UpdateEventInput {
  name?: string
  kind?: EventKind
  starts_at?: string // ISO
  description?: string | null
  meeting_point?: string | null
}

// ──────────────────────────────────────────────────────────────────────
// Endpoint wrappers — all crew-scoped under /crews/me/events
// ──────────────────────────────────────────────────────────────────────

export async function fetchCrewEvents(includePast = false): Promise<CrewEvent[]> {
  const res = await apiClient.get<CrewEvent[]>('/crews/me/events', {
    params: includePast ? { include_past: true } : undefined,
  })
  return res.data
}

export async function createCrewEvent(input: CreateEventInput): Promise<CrewEvent> {
  const res = await apiClient.post<CrewEvent>('/crews/me/events', input)
  return res.data
}

export async function fetchCrewEvent(eventId: number): Promise<CrewEvent> {
  const res = await apiClient.get<CrewEvent>(`/crews/me/events/${eventId}`)
  return res.data
}

export async function updateCrewEvent(
  eventId: number,
  patch: UpdateEventInput,
): Promise<CrewEvent> {
  const res = await apiClient.patch<CrewEvent>(`/crews/me/events/${eventId}`, patch)
  return res.data
}

export async function rsvpCrewEvent(
  eventId: number,
  status: RsvpStatus,
): Promise<CrewEvent> {
  const res = await apiClient.post<CrewEvent>(`/crews/me/events/${eventId}/rsvp`, { status })
  return res.data
}

export async function uploadCrewEventTour(
  eventId: number,
  file: File,
): Promise<CrewEvent> {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<CrewEvent>(`/crews/me/events/${eventId}/tour`, form)
  return res.data
}

// Download the raw GPX for an event and trigger a browser save. Uses fetch with
// the in-memory bearer token (mirrors the blob download pattern in api/coach.ts)
// so the httpOnly-cookie + Authorization auth still applies.
export async function downloadCrewEventTour(
  eventId: number,
  filename: string | null,
): Promise<void> {
  const token = getAccessToken()
  const res = await fetch(`${API_BASE_URL}/crews/me/events/${eventId}/tour`, {
    method: 'GET',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error(`tour download failed: ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `tour-${eventId}.gpx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
