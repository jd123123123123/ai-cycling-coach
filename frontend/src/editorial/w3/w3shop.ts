import { BIKES, BIKE_BY_ID, TIERS, bikeArt, type BikeTier } from './w3bikes'
import { PARTS, PART_BY_ID, SLOTS, partArt, type PartSlot } from './w3parts'
import type { Loadout } from '../../api/shop'

/**
 * W3 · One catalogue over both ladders.
 *
 * Ownership is a single flat list of ids server-side — `garage_items` doesn't
 * care whether a row is a bike or a saddle — so the client needs one lookup
 * that can answer "what IS this id" for anything in that list. Without it every
 * surface ends up doing `BIKE_BY_ID.get(id) ?? PART_BY_ID.get(id)` inline, and
 * they drift the first time a third kind of item appears.
 *
 * THIS IS ALSO THE FORWARD SEAM. Seasons, rarity, bundles and level gates are
 * all deliberately absent today — the economy has no data for them and the pen
 * screens that show them are fixtures. When they arrive they become fields on
 * `ShopItem` and a filter here; no view has to learn a second catalogue shape.
 *
 * Prices in this module are for DISPLAY ONLY. The server charges from its own
 * mirror of these catalogues (`backend/app/services/w3catalog.py`) and a buy
 * request carries an id and nothing else, so a tampered price here changes what
 * a rider is shown, never what they are charged.
 */

export type ItemKind = 'bike' | 'part'

export interface ShopItem {
  id: string
  name: string
  kind: ItemKind
  /** RideCoin. 0 = granted, never purchasable. */
  price: number
  blurb: string
  /** Bikes only. */
  tier?: BikeTier
  /** Parts only — which of the four slots it fills. */
  slot?: PartSlot
  /** Static WebP, shipped with the app. */
  art: string
  /** The literal description this item's art was generated from — and the same
   *  one the server hands the image model when it composes a BUILD (this bike,
   *  wearing these parts). A part without it cannot be described, so it would
   *  render as though it were never fitted. */
  prompt: string
}

const bikeItem = (b: (typeof BIKES)[number]): ShopItem => ({
  id: b.id, name: b.name, kind: 'bike', price: b.price, blurb: b.blurb,
  tier: b.tier, art: bikeArt(b.id), prompt: b.prompt,
})
const partItem = (p: (typeof PARTS)[number]): ShopItem => ({
  id: p.id, name: p.name, kind: 'part', price: p.price, blurb: p.blurb,
  slot: p.slot, art: partArt(p.id), prompt: p.prompt,
})

export const SHOP_BIKES: ShopItem[] = BIKES.map(bikeItem)
export const SHOP_PARTS: ShopItem[] = PARTS.map(partItem)

/** Every purchasable or grantable thing, by id. */
export const ITEM_BY_ID = new Map<string, ShopItem>(
  [...SHOP_BIKES, ...SHOP_PARTS].map((i) => [i.id, i]),
)

export function itemById(id: string | null | undefined): ShopItem | null {
  if (!id) return null
  return ITEM_BY_ID.get(id) ?? null
}

/**
 * How a piece of catalogue art must be fitted into its frame.
 *
 * THE TWO LADDERS WERE RENDERED DIFFERENTLY and it is not cosmetic. Part art is
 * transparent (alpha 0 in every corner), so a saddle composites straight onto
 * the dark UI and must be `contain`ed or it gets cropped. Bike art is NOT
 * transparent: each bike carries its own opaque light-grey studio backdrop,
 * and the exact grey differs per render (sampled: 180–221 across the ladder),
 * so no single stage colour can ever match them all.
 *
 * `cover` is what makes that a non-problem instead of a paint-matching
 * exercise: the bike's own backdrop is stretched to the frame's edges and
 * becomes the stage, so there is no seam to match. The bikes sit centred in
 * their square source frames, which is why cropping to a landscape frame is
 * safe — it eats backdrop, never the bike.
 */
export function artFit(item: Pick<ShopItem, 'kind'>): 'cover' | 'contain' {
  return item.kind === 'bike' ? 'cover' : 'contain'
}

/** Bikes grouped in ladder order, cheapest tier first. Empty tiers are dropped
 *  rather than rendered as an empty heading. */
export function bikesByTier(): { tier: BikeTier; label: string; note: string; items: ShopItem[] }[] {
  return TIERS
    .map((t) => ({ ...t, items: SHOP_BIKES.filter((b) => b.tier === t.tier).sort((a, b) => a.price - b.price) }))
    .filter((g) => g.items.length > 0)
}

/** Parts grouped by slot, in the order the four slots are always listed. */
export function partsBySlot(): { slot: PartSlot; label: string; note: string; items: ShopItem[] }[] {
  return SLOTS
    .map((s) => ({ ...s, items: SHOP_PARTS.filter((p) => p.slot === s.slot).sort((a, b) => a.price - b.price) }))
    .filter((g) => g.items.length > 0)
}

/** The id the rider is actually wearing in a slot. A null slot means the bike's
 *  own stock part, which is the honest answer for a rider who has bought
 *  nothing — never a pretend upgrade. */
export function equippedInSlot(loadout: Loadout | undefined, slot: PartSlot): string | null {
  if (!loadout) return null
  return loadout[slot] ?? null
}

/** Is this item the one currently worn/ridden? */
export function isEquipped(loadout: Loadout | undefined, item: ShopItem): boolean {
  if (!loadout) return false
  if (item.kind === 'bike') return loadout.bike === item.id
  return item.slot ? loadout[item.slot] === item.id : false
}

export { BIKE_BY_ID, PART_BY_ID, bikeArt, partArt }
export type { BikeTier, PartSlot }
