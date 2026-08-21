import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  buyPlace, fetchBackdrops, fetchDayScene, fetchGarage, fetchRideScene, fetchTodayStage, renameAsset, renderAsset, restyleAsset, renderDayScene, renderRideScene, renderTodayStage, selectBackdrop, type Backdrops, type DayPose, type DayScene, type Garage, type GarageKind, type RideScene, type TodayStage,
} from '../api/garage'

export const GARAGE_KEY = ['garage'] as const

/**
 * The rider's garage — their digitalised rider figure and bike.
 *
 * This is the surface that answers "does this rider have a bike?". It is read
 * by the Today hero, the ride hero, the top-bar avatar, the biker page, the
 * bike studio and the avatar gate — six call sites, ONE query. They all pass
 * this same module-level constant as the key, so react-query serves them from a
 * single cache entry and de-duplicates the in-flight request: the response is
 * fetched once per staleTime window no matter how many of them are on screen.
 *
 * That matters more here than anywhere else in the app, because the payload is
 * not JSON-shaped metadata — `/garage` inlines the rider and bike collectibles
 * as base64 WebP, roughly 43 KB each. Refetching it per component would put
 * ~90 KB on the wire for pixels the app is already holding.
 *
 * `gcTime` is pinned rather than left to the client default because the default
 * used to be SHORTER than this staleTime (5 min vs 10), which quietly defeated
 * the caching: with every observer unmounted the entry was evicted at 5 minutes
 * and the next screen re-downloaded both images despite the 10-minute promise.
 * A collectible only changes when the rider deliberately re-renders one, and
 * that path invalidates this key itself.
 */
export function useGarage() {
  return useQuery<Garage>({
    queryKey: GARAGE_KEY,
    queryFn: fetchGarage,
    staleTime: 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Render a photo into a collectible and keep it. Slow (vision + image model);
 *  the caller owns the waiting choreography. */
export function useRenderAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, photoBase64 }: { kind: GarageKind; photoBase64: string }) =>
      renderAsset(kind, photoBase64),
    onSuccess: (result) => {
      // Only a saved render changes the garage — a gated one leaves the
      // rider's existing bike exactly where it was.
      if (result.saved) qc.invalidateQueries({ queryKey: GARAGE_KEY })
    },
  })
}

/**
 * Re-render an existing asset in today's art direction.
 *
 * The garage AND the composed scenes are invalidated on success: Today's hero
 * and every ride picture were built from the old render and would otherwise go
 * on showing it.
 */
export function useRestyleAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kind: GarageKind) => restyleAsset(kind),
    onSuccess: (result) => {
      if (!result.saved) return
      qc.invalidateQueries({ queryKey: GARAGE_KEY })
      qc.invalidateQueries({ queryKey: TODAY_STAGE_KEY })
      qc.invalidateQueries({ queryKey: ['garage', 'scene'] })
    },
  })
}

/**
 * Name the rider's own bike (or rider figure).
 *
 * The garage is invalidated on success so every surface that prints the name —
 * the hero, the garage, the ride pages — picks it up without a reload. A
 * failure is deliberately silent: the field already shows what they typed and
 * the detected name is still there underneath, so there is nothing to warn
 * about and nothing lost.
 */
export function useRenameAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, name }: { kind: GarageKind; name: string }) => renameAsset(kind, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: GARAGE_KEY }) },
  })
}

/**
 * A ride's composed hero, read from the cache only. Safe on every ride-screen
 * open: it never triggers a render, it just reports whether one exists and, if
 * not, why (`needs_rider` / `needs_bike` / `not_generated`).
 */
export function useRideScene(activityId: number | null | undefined) {
  return useQuery<RideScene>({
    queryKey: ['garage', 'scene', activityId],
    queryFn: () => fetchRideScene(activityId as number),
    enabled: activityId != null,
    // Same reasoning as the garage: this returns an inlined base64 hero, and a
    // gcTime shorter than the staleTime would have evicted it long before it
    // went stale, re-downloading the image on every reopen of the ride.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Compose the hero for one ride. Explicit intent only — this is a slow, paid
 *  image-model call. The result is written straight into the scene cache so the
 *  screen switches over without a refetch. */
export function useRenderRideScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (activityId: number) => renderRideScene(activityId),
    onSuccess: (scene) => {
      qc.setQueryData(['garage', 'scene', scene.activity_id], scene)
    },
  })
}

/**
 * Today's hero for the day's pose, read from the cache only — the same contract
 * as `useRideScene`: safe on every Today open, never triggers a render, and
 * reports why there isn't one (`needs_rider` / `needs_bike` / `not_generated`).
 *
 * The key carries the pose because the server's cache does: one composed image
 * per pose per rider. Crossing from a rest day into a training day therefore
 * asks a DIFFERENT question rather than invalidating an answer, and the rest
 * scene is still there, already paid for, tomorrow morning.
 */
export function useDayScene(pose: DayPose | null | undefined) {
  return useQuery<DayScene>({
    queryKey: ['garage', 'scene', 'today', pose],
    queryFn: () => fetchDayScene(pose as DayPose),
    enabled: pose != null,
    // Inlined base64 image, like the garage read — see that hook for why gcTime
    // is pinned at least as long as staleTime.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}

/** Compose today's hero for one pose. Explicit intent only (a tap), slow and
 *  paid; the composed scene lands straight in the cache for that pose. */
export function useRenderDayScene() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pose: DayPose) => renderDayScene(pose),
    onSuccess: (scene) => {
      qc.setQueryData(['garage', 'scene', 'today', scene.pose], scene)
    },
  })
}


// ── Today's stage ───────────────────────────────────────────────────────────

export const TODAY_STAGE_KEY = ['garage', 'today'] as const
export const BACKDROPS_KEY = ['garage', 'backdrops'] as const

/**
 * The two pictures Today is built from, plus the stages the rider can swipe to.
 *
 * ONE QUERY FOR THE WHOLE SCREEN, matching the endpoint. The avatar and the
 * bike each depend on something the rider changes elsewhere — a helmet from the
 * shop, tyres from the garage, a stage from the gallery — and splitting them
 * across queries means a window where the screen shows last week's bike under
 * this morning's helmet.
 *
 * Same payload reasoning as `useGarage`: two inlined WebP renders, so `gcTime`
 * is pinned at least as long as `staleTime` or the entry is evicted early and
 * both images come down the wire again.
 */
export function useTodayStage() {
  return useQuery<TodayStage>({
    queryKey: TODAY_STAGE_KEY,
    queryFn: fetchTodayStage,
    staleTime: 10 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

/** Compose whatever this configuration is missing. Slow, paid, explicit — and
 *  idempotent, so a rider who taps it twice pays once. */
export function useRenderTodayStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: renderTodayStage,
    onSuccess: (stage) => qc.setQueryData(TODAY_STAGE_KEY, stage),
  })
}

/**
 * Switch the stage the bike stands in.
 *
 * OPTIMISTIC, because the switch really is instant server-side: it stores a
 * choice and returns the screen without rendering. Moving the selection in the
 * cache first means the swipe rail tracks the finger rather than the network,
 * and the response then replaces it with the truth — including the cached
 * picture for a stage the rider has stood in before.
 */
export function useSelectStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => selectBackdrop(id),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: TODAY_STAGE_KEY })
      const previous = qc.getQueryData<TodayStage>(TODAY_STAGE_KEY)
      if (previous) qc.setQueryData<TodayStage>(TODAY_STAGE_KEY, { ...previous, stage: id })
      return { previous }
    },
    onError: (_e, _id, ctx) => {
      // Put the rider back where they were. A failed switch that leaves the
      // rail pointing at a stage the server never accepted is worse than a
      // switch that visibly did not happen.
      if (ctx?.previous) qc.setQueryData(TODAY_STAGE_KEY, ctx.previous)
    },
    onSuccess: (stage) => qc.setQueryData(TODAY_STAGE_KEY, stage),
    onSettled: () => { void qc.invalidateQueries({ queryKey: BACKDROPS_KEY }) },
  })
}

/** The gallery: every place the app knows, whoever rode it, plus this rider's
 *  stamps and what they own. */
export function useBackdrops() {
  return useQuery<Backdrops>({
    queryKey: BACKDROPS_KEY,
    queryFn: fetchBackdrops,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
}

/** Buy a place. Refreshes the gallery AND the stage list, because a bought
 *  place immediately becomes something the rider can swipe to. */
export function useBuyPlace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => buyPlace(slug),
    onSuccess: (data) => {
      qc.setQueryData(BACKDROPS_KEY, data)
      void qc.invalidateQueries({ queryKey: TODAY_STAGE_KEY })
    },
  })
}
