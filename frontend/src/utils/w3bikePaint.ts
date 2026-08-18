/**
 * W3 · What every catalogue bike and part LOOKS like.
 *
 * WHY THIS LIVES OUTSIDE `editorial/`. That tree forbids raw hex in source, and
 * rightly: UI chrome must come from the token palette or the design system
 * drifts. But a bike's paint is not chrome — "celeste green", "oil-slick",
 * "burgundy" are CONTENT, the same kind of thing as a bike's name or its blurb,
 * and no sane token set contains them. Keeping them here makes that distinction
 * explicit and lets `editorial/` stay clean. (The dependency direction is the
 * legal one: editorial may import outward, never the reverse.)
 *
 * These values are read off the very prompts the bike art was generated from
 * (`w3bikes.ts` / `w3parts.ts`), so the drawn bike and the photographed one are
 * describing the same object rather than two unrelated inventions.
 */

export type WheelStyle = 'box' | 'tanwall' | 'deep' | 'disc' | 'fivespoke' | 'gold'
export type BarStyle = 'drop' | 'bullhorn' | 'aero' | 'flat'
export type SaddleStyle = 'standard' | 'leather' | 'carbon' | 'comfort'
export type FrameFinish = 'matte' | 'gloss' | 'chrome' | 'oilslick' | 'rust'

export interface BikeLook {
  frame: string
  finish: FrameFinish
  wheel: WheelStyle
  tan?: boolean
  bar: BarStyle
  tape: string
  saddle: SaddleStyle
  /** Overrides the shell colour of `saddle`. Without this, a lime saddle and a
   *  white one both collapse into `standard` and the purchase shows nothing. */
  saddleTint?: string
  splatter?: boolean
  basket?: boolean
  flames?: boolean
}

/** Shared materials — rims, rubber, hardware. Not per-bike, so they live once. */
export const MATERIAL = {
  // Rubber
  tyre: '#171717',
  tyreTan: '#C8A87A',
  tyreShadow: '#0D0D0D',
  // Rims, one per wheel style
  rimSilver: '#B8BCC2',
  rimPolished: '#C9CDD3',
  rimCarbon: '#1C1C1C',
  rimDisc: '#141414',
  rimSpoke: '#17171A',
  rimGold: '#C9A227',
  // Hardware
  spoke: '#9AA0A6',
  hub: '#2A2A2E',
  metal: '#8A9099',
  post: '#3A3A40',
  chain: '#8A9099',
  crank: '#6E7379',
  // Saddles
  saddleStd: '#141416',
  saddleComfort: '#232326',
  carbonShell: '#1A1A1D',
  leather: '#8A5A2B',
  leatherStitch: '#C9922F',
  // Finishes
  chromeHi: '#EDEFF2',
  chromeHi2: '#E6E8EB',
  chromeMid: '#9AA0A6',
  chromeLo: '#6E7379',
  slickA: '#7B5CFF',
  slickB: '#22D3C5',
  slickC: '#C9922F',
  rustMid: '#7A5B3A',
  rustLo: '#4A3A2A',
  glossShade: '#00000055',
  // Fun
  splatterA: '#C7212B',
  splatterB: '#1152D8',
  wicker: '#B9A184',
  flameHot: '#FF7A2F',
  flameCool: '#FFB020',
} as const

const BLACK = '#141416'
const WHITE = '#E9EAEC'

/** Every bike in the ladder, as parameters of the one drawing. */
export const BIKE_LOOK: Record<string, BikeLook> = {
  // ── Starter — rust, a crooked basket, and no dignity whatsoever ──────────
  rustbucket: { frame: '#6E7C86', finish: 'rust', wheel: 'box', bar: 'drop', tape: '#4A4A4A', saddle: 'standard', basket: true },

  // ── Steel ───────────────────────────────────────────────────────────────
  'steel-commuter': { frame: '#2F4A3A', finish: 'matte', wheel: 'box', bar: 'flat', tape: BLACK, saddle: 'standard' },
  'steel-fixie': { frame: '#1B1B1D', finish: 'matte', wheel: 'deep', bar: 'bullhorn', tape: WHITE, saddle: 'standard' },
  'steel-tourer': { frame: '#6B2233', finish: 'gloss', wheel: 'tanwall', tan: true, bar: 'drop', tape: '#8A5A2B', saddle: 'leather' },
  'steel-retro': { frame: '#8FD6C8', finish: 'gloss', wheel: 'box', bar: 'drop', tape: WHITE, saddle: 'standard' },
  'steel-gravel': { frame: '#C9B48A', finish: 'matte', wheel: 'tanwall', tan: true, bar: 'drop', tape: '#6B5B45', saddle: 'standard' },
  'steel-singlespeed': { frame: '#6E7379', finish: 'matte', wheel: 'box', bar: 'flat', tape: BLACK, saddle: 'standard' },

  // ── Alloy ───────────────────────────────────────────────────────────────
  'alloy-allez': { frame: '#2E6BD1', finish: 'gloss', wheel: 'box', tan: true, bar: 'drop', tape: BLACK, saddle: 'standard' },
  'alloy-crit': { frame: '#C7212B', finish: 'gloss', wheel: 'deep', bar: 'drop', tape: '#C7212B', saddle: 'standard' },
  'alloy-cx': { frame: '#7A7F85', finish: 'matte', wheel: 'box', bar: 'drop', tape: BLACK, saddle: 'standard' },
  'alloy-aero': { frame: '#C2C6CB', finish: 'gloss', wheel: 'deep', bar: 'aero', tape: BLACK, saddle: 'standard' },
  'alloy-climber': { frame: WHITE, finish: 'matte', wheel: 'box', bar: 'drop', tape: '#FF7A2F', saddle: 'standard' },
  'alloy-fitness': { frame: '#17171A', finish: 'matte', wheel: 'box', bar: 'flat', tape: BLACK, saddle: 'standard' },

  // ── Carbon ──────────────────────────────────────────────────────────────
  'carbon-endurance': { frame: '#1D2A44', finish: 'gloss', wheel: 'deep', bar: 'drop', tape: BLACK, saddle: 'carbon' },
  'carbon-race': { frame: '#141416', finish: 'gloss', wheel: 'deep', bar: 'drop', tape: '#E4D42B', saddle: 'carbon' },
  'carbon-aero': { frame: '#33363A', finish: 'matte', wheel: 'deep', bar: 'aero', tape: BLACK, saddle: 'carbon' },
  'carbon-climber': { frame: '#EFEDE7', finish: 'gloss', wheel: 'box', bar: 'drop', tape: '#C7212B', saddle: 'carbon' },
  'carbon-gravel': { frame: '#28402C', finish: 'matte', wheel: 'tanwall', tan: true, bar: 'drop', tape: '#6B5B45', saddle: 'standard' },
  'carbon-allroad': { frame: '#4A4F55', finish: 'matte', wheel: 'deep', bar: 'drop', tape: BLACK, saddle: 'standard' },

  // ── Pro ─────────────────────────────────────────────────────────────────
  'pro-worldtour': { frame: '#1152D8', finish: 'gloss', wheel: 'deep', bar: 'drop', tape: BLACK, saddle: 'carbon' },
  'pro-tt': { frame: '#141416', finish: 'gloss', wheel: 'disc', bar: 'aero', tape: '#C9A227', saddle: 'carbon' },
  'pro-titanium': { frame: '#A9AEB4', finish: 'chrome', wheel: 'box', bar: 'drop', tape: '#8A5A2B', saddle: 'leather' },
  'pro-superlight': { frame: '#2B2B2E', finish: 'matte', wheel: 'box', bar: 'drop', tape: BLACK, saddle: 'carbon' },
  'pro-prototype': { frame: '#7B5CFF', finish: 'oilslick', wheel: 'deep', bar: 'aero', tape: BLACK, saddle: 'carbon' },
  'pro-track': { frame: '#B4212B', finish: 'chrome', wheel: 'fivespoke', bar: 'bullhorn', tape: BLACK, saddle: 'carbon' },
  'pro-classics': { frame: '#4E1F2A', finish: 'matte', wheel: 'box', tan: true, bar: 'drop', tape: BLACK, saddle: 'standard' },
}

/**
 * What a BOUGHT part does to the drawing.
 *
 * This is the whole point of the rebuild: each entry is the visible difference
 * a purchase makes. A part with no entry here would be a cosmetic that changes
 * nothing, which is exactly the bug this replaced — so the catalogue test
 * asserts every priced part has one.
 */
export const PART_LOOK: Record<string, Partial<BikeLook>> = {
  // Rahmen
  'frame-stock': {},
  'frame-racered': { frame: '#D0212B', finish: 'gloss' },
  'frame-chrome': { frame: '#C6CBD1', finish: 'chrome' },
  'frame-lime': { frame: '#C8FF00', finish: 'gloss' },
  'frame-oilslick': { frame: '#7B5CFF', finish: 'oilslick' },
  'frame-splatter': { frame: '#ECECEC', finish: 'gloss', splatter: true },

  // Reifen
  'wheels-stock': { wheel: 'box', tan: false },
  'wheels-tanwall': { wheel: 'tanwall', tan: true },
  'wheels-deep': { wheel: 'deep', tan: false },
  'wheels-disc': { wheel: 'disc', tan: false },
  'wheels-fivespoke': { wheel: 'fivespoke', tan: false },
  'wheels-gold': { wheel: 'gold', tan: false },

  // Lenker
  'bars-stock': { bar: 'drop', tape: BLACK },
  'bars-lime': { bar: 'drop', tape: '#C8FF00' },
  'bars-leather': { bar: 'drop', tape: '#8A5A2B' },
  'bars-aero': { bar: 'aero', tape: '#2B2B2E' },
  'bars-bullhorn': { bar: 'bullhorn', tape: BLACK },
  'bars-white': { bar: 'drop', tape: WHITE },

  // Sattel
  'saddle-stock': { saddle: 'standard', saddleTint: undefined },
  'saddle-leather': { saddle: 'leather', saddleTint: undefined },
  'saddle-carbon': { saddle: 'carbon', saddleTint: undefined },
  'saddle-lime': { saddle: 'standard', saddleTint: '#C8FF00' },
  'saddle-white': { saddle: 'standard', saddleTint: WHITE },
  'saddle-suspension': { saddle: 'comfort', saddleTint: undefined },
}

/** The bike as it is actually ridden: the model, with every equipped part
 *  layered over it in slot order. Unknown ids are ignored rather than throwing —
 *  a catalogue that has moved on must never blank the rider's garage. */
export function resolveLook(bikeId: string | null | undefined, equipped: (string | null)[] = []): BikeLook | null {
  const base = bikeId ? BIKE_LOOK[bikeId] : null
  if (!base) return null
  let look: BikeLook = { ...base }
  for (const id of equipped) {
    if (!id) continue
    const over = PART_LOOK[id]
    if (over) look = { ...look, ...over }
  }
  return look
}
