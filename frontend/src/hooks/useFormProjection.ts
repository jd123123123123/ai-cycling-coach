import { useQuery } from '@tanstack/react-query'
import { fetchFormProjection, type FormProjection } from '../api/formProjection'

/**
 * The individually-fitted form projection.
 *
 * No `language` in the key, unlike `usePMC`: this endpoint returns numbers and
 * resolved codes, and every sentence on the card is composed client-side. A
 * language toggle changes nothing the server would send back differently.
 *
 * The fit is a grid search over the athlete's whole history — it is expensive
 * and it changes at most once a day (a new near-maximal effort has to land
 * first), so it is cached for an hour rather than refetched on every mount.
 */
export function useFormProjection(horizonDays = 42) {
  return useQuery<FormProjection>({
    queryKey: ['form-projection', horizonDays],
    queryFn: () => fetchFormProjection(horizonDays),
    staleTime: 60 * 60 * 1000,
  })
}
