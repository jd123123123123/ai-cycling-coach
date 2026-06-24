import type { CardDef, CardPref, ResolvedCard } from '../components/dashboard/cardRegistry'

/**
 * Merge a saved layout with the current registry.
 *
 * - Saved entries whose id still exists keep their order + hidden flag.
 * - Registry cards missing from `saved` are inserted at their default index
 *   (relative to already-placed cards), so a newly-shipped card lands near
 *   where the code placed it rather than at the bottom.
 * - Saved ids no longer in the registry are dropped.
 *
 * `saved` undefined/empty → the registry's default order, all visible.
 */
export function reconcileLayout(
  saved: CardPref[] | undefined,
  registry: CardDef[],
): ResolvedCard[] {
  const byId = new Map(registry.map((def, defaultIndex) => [def.id, { def, defaultIndex }]))

  const order: { id: string; hidden: boolean }[] = (saved ?? [])
    .filter((p) => byId.has(p.id))
    .map((p) => ({ id: p.id, hidden: p.hidden }))

  const present = new Set(order.map((o) => o.id))

  registry.forEach((def, defaultIndex) => {
    if (present.has(def.id)) return
    let pos = 0
    for (let k = 0; k < order.length; k++) {
      const di = byId.get(order[k].id)!.defaultIndex
      if (di < defaultIndex) pos = k + 1
    }
    order.splice(pos, 0, { id: def.id, hidden: false })
    present.add(def.id)
  })

  return order.map((o) => {
    const { def } = byId.get(o.id)!
    return { ...def, hidden: o.hidden }
  })
}
