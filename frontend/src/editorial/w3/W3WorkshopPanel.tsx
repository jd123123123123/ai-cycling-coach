import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useComponentMethods, useDeclareComponent, useMeasureComponent, useReplaceComponent,
  useSeedComponent, useServiceComponent, useSetMethod, useWorkshop,
} from '../../hooks/useWorkshop'
import W3Workshop from './W3Workshop'
import W3LoadError from './W3LoadError'
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
  const navigate = useNavigate()
  const { data: workshop, isLoading, isError, refetch, isFetching } = useWorkshop()
  const service = useServiceComponent()
  const seed = useSeedComponent()
  const declare = useDeclareComponent()
  const method = useSetMethod()
  const measure = useMeasureComponent()
  const replace = useReplaceComponent()
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

  // The chain's life clock. Same busy contract as the four writes above: the
  // row is answering, and `onSettled` clears it whether or not the write stuck.
  const onMeasure = (componentId: string, measuredPct: number) => {
    setBusyId(componentId)
    measure.mutate({ componentId, measuredPct }, { onSettled: () => setBusyId(null) })
  }

  const onReplace = (componentId: string) => {
    setBusyId(componentId)
    replace.mutate({ componentId }, { onSettled: () => setBusyId(null) })
  }

  // A FAILED FETCH IS NOT A SERVICED BIKE. Without this the panel fell into
  // W3Workshop's skeleton and left a permanent grey box, so a broken read was
  // indistinguishable from a slow one.
  if (isError && !workshop) {
    return (
      <W3LoadError
        title="Die Werkstatt lädt nicht"
        detail="Wir konnten den Zustand deiner Teile gerade nicht abrufen. Nichts ist verloren — das ist nur die Verbindung."
        onRetry={() => void refetch()}
        retrying={isFetching}
      />
    )
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
      onMeasure={onMeasure}
      onReplace={onReplace}
      onFindShops={() => navigate('/e/w3-shops')}
      methods={{ chain: chainMethods ?? [] }}
      onDismissResult={() => setLastResult(null)} />
  )
}
