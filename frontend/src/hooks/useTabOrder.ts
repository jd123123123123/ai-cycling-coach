import { useMemo } from 'react'
import { reconcileLayout } from '../utils/reconcileLayout'
import { useTabLayouts, useUpdateTabLayouts } from './useTabLayouts'
import type { CardDef, CardPref, ResolvedCard } from '../components/dashboard/cardRegistry'

/**
 * Resolve a tab's cards (order + visibility) and expose a persist() that
 * writes just this tab's entry back, preserving every other tab's layout.
 */
export function useTabOrder(
  tabId: string,
  registry: CardDef[],
): { resolved: ResolvedCard[]; persist: (next: CardPref[]) => void } {
  const { data } = useTabLayouts()
  const update = useUpdateTabLayouts()

  const saved = data?.layouts?.[tabId]
  const resolved = useMemo(() => reconcileLayout(saved, registry), [saved, registry])

  const persist = (next: CardPref[]) => {
    const layouts = { ...(data?.layouts ?? {}), [tabId]: next }
    update.mutate({ layouts })
  }

  return { resolved, persist }
}
