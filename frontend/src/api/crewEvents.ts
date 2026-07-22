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
}

export interface CreateEventInput {
  name: string
  kind: EventKind
  starts_at: string // ISO
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
