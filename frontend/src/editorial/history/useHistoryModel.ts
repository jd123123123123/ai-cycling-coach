import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchActivitiesRange, type ActivityRead } from '../../api/dashboard'
import { usePMC } from '../../hooks/usePMC'
import { usePowerProfile } from '../../hooks/usePowerProfile'
import { bucketByMonth, monthKey, type MonthBucket } from './monthBuckets'
import { buildHistoryModel } from './buildHistoryModel'
import type { ArchiveDeckModel } from '../archive/ArchiveDeckView'

/** How far back the deck can look. Two years is enough for "#2 of 17 months"
 *  to mean something without asking the API for a career. */
export const HISTORY_MONTHS = 24

/**
 * Every ride in the window, fetched in one-year slices.
 *
 * `/activities` caps at `limit=500` and returns no pagination cursor, so a
 * single 24-month request would silently truncate for anyone riding more than
 * ~20 times a month — and a truncated list does not merely lose rides, it
 * corrupts the RANK, which is the one number the archive leans on hardest.
 * Yearly slices keep every request comfortably under the cap.
 */
async function fetchWindow(monthsBack: number): Promise<ActivityRead[]> {
  const end = new Date()
  const start = new Date(end.getFullYear(), end.getMonth() - monthsBack + 1, 1)

  const slices: Promise<ActivityRead[]>[] = []
  let cursor = new Date(start)
  while (cursor < end) {
    const sliceEnd = new Date(cursor.getFullYear() + 1, cursor.getMonth(), 0)
    const to = sliceEnd < end ? sliceEnd : end
    slices.push(fetchActivitiesRange(new Date(cursor), to).then((r) => r.activities))
    cursor = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1)
  }

  const pages = await Promise.all(slices)
  // Slices are half-open by construction, but a server that treats a bound as
  // inclusive would double-count a ride into two months. De-dupe by id.
  const byId = new Map<number, ActivityRead>()
  for (const page of pages) for (const a of page) byId.set(a.id, a)
  return [...byId.values()]
}

export interface HistoryData {
  buckets: MonthBucket[]
  /** The model for `key`, or null when that month holds no rides. */
  model: ArchiveDeckModel | null
  /** Newest month that actually has rides — the deck's landing page. */
  latestKey: string | null
  isLoading: boolean
  isError: boolean
}

/**
 * The History deck's data.
 *
 * Follows the same shape as `useMorningWrapModel`: hooks and fetching live
 * here, the view takes a finished model as a prop, and every figure is built
 * by a pure function that can be tested without a network. Components never
 * reach for data themselves — `isolation.test.ts` enforces that.
 */
export function useHistoryModel(key: string | null): HistoryData {
  const activities = useQuery({
    queryKey: ['editorial', 'history', 'activities', HISTORY_MONTHS],
    queryFn: () => fetchWindow(HISTORY_MONTHS),
  })
  // 365 is the endpoint's own ceiling, so a month older than a year has no PMC
  // to show. That chapter says so rather than drawing a flat line.
  const pmc = usePMC(365)
  const power = usePowerProfile()

  const buckets = useMemo(
    () => bucketByMonth(activities.data ?? []),
    [activities.data],
  )

  const latestKey = buckets[0]?.key ?? null
  const active = key ?? latestKey ?? monthKey(new Date())

  const model = useMemo(
    () => buildHistoryModel({
      buckets,
      key: active,
      pmc: pmc.data?.entries ?? [],
      mmpCurve: power.data?.mmp_curve ?? null,
    }),
    [buckets, active, pmc.data, power.data],
  )

  return {
    buckets,
    model,
    latestKey,
    // Only the ride list gates the screen. PMC and the power curve each feed
    // exactly one chapter, and those chapters already say so when empty —
    // blocking the whole deck on them would hide four working chapters behind
    // one slow request.
    isLoading: activities.isLoading,
    isError: activities.isError,
  }
}
