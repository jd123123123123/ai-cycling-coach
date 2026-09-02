import { apiClient } from './client'

/**
 * The details a rider adds after a ride syncs — the Strava moment.
 *
 * A ride arrives from Garmin with numbers and no story: a device-written title,
 * a distance, a track. The photo and the sentence are the part only the rider
 * can supply, and they are what turns a row of figures into something a crew
 * stops scrolling for.
 *
 * Backend: `app/api/ride_details.py`. Photos are served through the app rather
 * than a static mount — a ride photo is shown to crew-mates, and a URL that
 * worked for anyone who guessed an id would make it public to everybody.
 */

export interface RidePhoto {
  id: number
  /** Same-origin path, already authorised: `/activities/{id}/photos/{id}`. */
  url: string
  width: number | null
  height: number | null
}

export interface RideDetails {
  id: number
  title: string | null
  description: string | null
  photos: RidePhoto[]
}

export async function fetchRideDetails(activityId: number): Promise<RideDetails> {
  const res = await apiClient.get<RideDetails>(`/activities/${activityId}/details`)
  return res.data
}

/**
 * Only the fields present are written. Omitting `title` leaves the device's
 * title alone; sending "" is the rider clearing it — the editor needs both to
 * be possible from the same form.
 */
export async function saveRideDetails(
  activityId: number,
  patch: { title?: string | null; description?: string | null },
): Promise<RideDetails> {
  const res = await apiClient.patch<RideDetails>(`/activities/${activityId}/details`, patch)
  return res.data
}

export async function uploadRidePhoto(activityId: number, file: File): Promise<RidePhoto> {
  const body = new FormData()
  body.append('file', file)
  // No explicit Content-Type: the browser has to set the multipart boundary,
  // and naming the header here strips it and the upload arrives unparseable.
  const res = await apiClient.post<RidePhoto>(`/activities/${activityId}/photos`, body)
  return res.data
}

export async function deleteRidePhoto(activityId: number, photoId: number): Promise<void> {
  await apiClient.delete(`/activities/${activityId}/photos/${photoId}`)
}
