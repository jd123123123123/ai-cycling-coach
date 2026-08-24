import { apiClient } from './client'

/**
 * The rider's lifetime bests. Backend: `services/rider_records`.
 *
 * A record with no qualifying ride comes back NULL rather than as a zero — the
 * profile omits it instead of printing a personal best of nothing, which is the
 * one number a celebration screen must never show.
 */
export interface RiderRecord {
  key: string
  value: number
  unit: string
  activity_id: number | null
  /** The ride it came from. "212 km" is a number; "212 km, Harzrunde" is a memory. */
  title: string | null
  at: string | null
}

export type RiderRecords = Record<string, RiderRecord | null>

export async function fetchRecords(): Promise<RiderRecords> {
  const res = await apiClient.get<RiderRecords>('/achievements/records')
  return res.data
}
