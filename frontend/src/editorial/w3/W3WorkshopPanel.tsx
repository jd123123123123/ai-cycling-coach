import { useState } from 'react'
import {
  useComponentMethods, useDeclareComponent, useSeedComponent, useServiceComponent,
  useSetMethod, useWorkshop,
} from '../../hooks/useWorkshop'
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
  const seed = useSeedComponent()
  const declare = useDeclareComponent()
  const method = useSetMethod()
  // Only the chain has methods today. Asking per component would be six
  // requests for five empty answers, so this asks about the one that has them
  // and everything else simply renders no picker.
  const { data: chainMethods } = useComponentMethods('chain')
  const [lastResult, setLastResult] = useState<ServiceResult | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Every one of the three writes marks the same row busy, because from the
  // rider's side they are the same gesture — the row is answering. `onSettled`
  // rather than `onSuccess` throughout: a failed write must not leave a row
  // disabled forever, and the server is unchanged, so the next read re-agrees.
  const onService = (componentId: string, proofImage?: string | null) => {
    setBusyId(componentId)
    service.mutate({ componentId, proofImage }, {
      onSuccess: (result) => setLastResult(result),
      onSettled: () => setBusyId(null),
    })
  }

  const onSeed = (componentId: string, lastServiceOn: string) => {
    setBusyId(componentId)
    seed.mutate({ componentId, lastServiceOn }, { onSettled: () => setBusyId(null) })
  }

  const onDeclare = (componentId: string, owned: boolean) => {
    setBusyId(componentId)
    declare.mutate({ componentId, owned }, { onSettled: () => setBusyId(null) })
  }

  const onMethod = (componentId: string, m: string) => {
    setBusyId(componentId)
    method.mutate({ componentId, method: m }, { onSettled: () => setBusyId(null) })
  }

  return (
    <W3Workshop
      workshop={workshop ?? null}
      loading={isLoading}
      busyId={busyId}
      lastResult={lastResult}
      onService={onService}
      onSeed={onSeed}
      onDeclare={onDeclare}
      onMethod={onMethod}
      methods={{ chain: chainMethods ?? [] }}
      onDismissResult={() => setLastResult(null)} />
  )
}
