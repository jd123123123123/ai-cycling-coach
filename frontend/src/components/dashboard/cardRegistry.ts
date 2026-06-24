import type { ReactNode } from 'react'

/** Saved per-card preference (order is implied by array position). */
export interface CardPref {
  id: string
  hidden: boolean
}

/** A card a tab can render. `id` is a stable slug; `label` shows in the editor. */
export interface CardDef {
  id: string
  label: string
  render: () => ReactNode
}

/** A registry card merged with its resolved visibility, in display order. */
export type ResolvedCard = CardDef & { hidden: boolean }
