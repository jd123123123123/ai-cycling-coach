import { useState } from 'react'
import { useServiceComponent, useWorkshop } from '../../hooks/useWorkshop'
import W3Workshop from './W3Workshop'
import type { ServiceResult } from '../../api/workshop'

/**
 * W3 · the workshop, wired. Drop `<W3WorkshopPanel />` into the garage.
 *
 * Owns exactly three things — the read, the mutation, and the celebration that
 * survives the mutation settling — so `W3Workshop` can stay a pure function of
 * its props and be rendered from a preview route with fixtures.
 *
 * `lastResult` is held HERE rather than read from `mutation.data` because the
 * payday banner has to outlive the mutation's own lifecycle: react-query resets
 * `data` when the next mutation starts, which would tear the banner away the
 * instant a rider serviced a second component — exactly when they are most
 * likely to be tapping.
 */
export default function W3WorkshopPanel() {
  const { data: workshop, isLoading } = useWorkshop()
  const service = useServiceComponent()
  const [lastResult, setLastResult] = useState<ServiceResult | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onService = (componentId: string) => {
    setBusyId(componentId)
    service.mutate(componentId, {
      onSuccess: (result) => setLastResult(result),
      // A failed service must not leave a row spinning forever. The workshop
      // is unchanged on the server, so the next read simply re-agrees with it.
      onSettled: () => setBusyId(null),
    })
  }

  return (
    <W3Workshop
      workshop={workshop ?? null}
      loading={isLoading}
      busyId={busyId}
      lastResult={lastResult}
      onService={onService}
      onDismissResult={() => setLastResult(null)} />
  )
}
