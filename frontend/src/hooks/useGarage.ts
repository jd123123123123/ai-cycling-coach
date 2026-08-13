import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchGarage, fetchRideScene, renderAsset, renderRideScene,
  type Garage, type GarageKind, type RideScene,
} from '../api/garage'

export const GARAGE_KEY = ['garage'] as const

/**
 * The rider's garage — their digitalised rider figure and bike.
 *
 * This is the surface that answers "does this rider have a bike?". It is read
 * by the Today hero and the ride hero, so it's cached generously: a collectible
 * only changes when the rider deliberately re-renders one, and that path
 * invalidates this key itself.
 */
export function useGarage() {
  return useQuery<Garage>({
    queryKey: GARAGE_KEY,
    queryFn: fetchGarage,
    staleTime: 10 * 60 * 1000,
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
 * A ride's composed hero, read from the cache only. Safe on every ride-screen
 * open: it never triggers a render, it just reports whether one exists and, if
 * not, why (`needs_rider` / `needs_bike` / `not_generated`).
 */
export function useRideScene(activityId: number | null | undefined) {
  return useQuery<RideScene>({
    queryKey: ['garage', 'scene', activityId],
    queryFn: () => fetchRideScene(activityId as number),
    enabled: activityId != null,
    staleTime: 60 * 60 * 1000,
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
