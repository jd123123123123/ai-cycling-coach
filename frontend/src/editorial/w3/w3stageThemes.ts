import type { CSSProperties } from 'react'

/**
 * W3 · THE ROOM'S BACKDROPS — eight stages the machine can stand in.
 *
 * THE REGISTER RULE, inherited from stage-studio.webp's own docblock: a stage
 * is a GRAPHIC SET — one flat wall meeting one flat floor at a crisp horizon,
 * everything in focus. No haze, no fog, no mood lighting. The playful three
 * stay inside that rule: a sun is a flat disc, a night is flat dots, a finish
 * line is a flat band. The bike is the subject on every one of them.
 *
 * PROCEDURAL, NOT ASSETS. The studio plate is a stretched two-plane gradient
 * as a webp; seven more webps would be seven downloads and seven chances for
 * the horizon to drift. A CSS gradient with a duplicated stop IS a crisp
 * horizon, pinned to the same measured `FLOOR` fraction on every screen —
 * and it costs bytes of code instead of megabytes of image.
 *
 * THREE INVARIANTS every theme must hold, or the bike stops looking planted:
 *  1. The horizon sits at `FLOOR` — the wheels land ON the line.
 *  2. The floor gets LIGHTER toward the bottom (a lit studio, not a void) and
 *     is bright enough at the contact line for the tyre shadows to read
 *     (the studio plate measures ~luminance 59 there).
 *  3. `ground` is the exact colour the plate ends in, so the page's runway
 *     can continue in it — the same contract useGroundColour serves for the
 *     webp, answered here by construction instead of by sampling.
 */

/** Where the floor is, as a fraction of the stage. Measured off the studio
 *  plate (the row of the largest jump in mean brightness: 1171/1536 = 76.2%)
 *  and shared by every procedural theme so the bike never floats. */
export const FLOOR = 0.762

/** The rendered studio set — the default room, and theme 'studio''s plate. */
export const STAGE_PLATE = '/w3/stage-studio.webp'

const H = `${(FLOOR * 100).toFixed(1)}%`

/** Wall top → wall bottom → floor top → floor bottom, with the duplicated
 *  stop that makes the horizon a LINE rather than a blend. */
const plane = (wTop: string, wBot: string, fTop: string, fBot: string) =>
  `linear-gradient(180deg, ${wTop} 0%, ${wBot} ${H}, ${fTop} ${H}, ${fBot} 100%)`

export interface StageTheme {
  id: string
  /** German, short — the swatch's label. */
  name: string
  /** The colour the plate ends in (its bottom edge). Null → sample the webp. */
  ground: string | null
  /** The full plate as CSS background layers. Null → draw the webp instead. */
  css: string | null
  /** Flat positioned motifs (a sun disc, stars, a finish band). Every one
   *  sits BEHIND the bike and stays out of the top chips' corners. */
  extras?: CSSProperties[]

  /**
   * THE FRONT LAYER — the half of the stage that is drawn OVER the machine.
   *
   * The bike is a cut-out composited onto the plate as a sibling DOM layer, so
   * everything in `css` is behind it by construction and no amount of prompt
   * work can put a blade of grass in front of a tyre. That is the ceiling this
   * field exists to lift: a transparent PNG of the SAME plate's near ground —
   * grass, cobbles, scree — cut from the plate itself so the light matches, and
   * painted above the bike so the wheels sit IN the material rather than on it.
   *
   * Null for the flat procedural sets, which have no near ground to speak of.
   * See `services/plate_layers.py`, which produces it.
   */
  front?: string | null

  /** Where the front layer's material begins, as a fraction of the stage. Only
   *  meaningful with `front`; the contact shadow is drawn to meet it. */
  frontTop?: number
  /** The swatch preview — a cheap one-gradient stand-in for the picker. */
  swatch: string
}

/** Tiny flat star: a hard-edged dot, not a glow. */
const star = (x: string, y: string, r: number, c = '#8FA3C9'): string =>
  `radial-gradient(circle at ${x} ${y}, ${c} 0 ${r}px, transparent ${r + 0.5}px)`

export const STAGE_THEMES: StageTheme[] = [
  // ── the five plain stages, W3-dark ────────────────────────────────────
  {
    id: 'studio', name: 'Studio',
    // The shipped room, byte-identical: the webp plate, sampled ground.
    ground: null, css: null,
    swatch: plane('#101013', '#1A1A1D', '#333336', '#47474B'),
  },
  {
    id: 'beton', name: 'Beton',
    ground: '#4C4E52',
    css: plane('#141517', '#1D1F22', '#2E3033', '#4C4E52'),
    swatch: plane('#141517', '#1D1F22', '#2E3033', '#4C4E52'),
  },
  {
    id: 'mitternacht', name: 'Mitternacht',
    ground: '#3E4A66',
    css: plane('#0C1019', '#131A2A', '#242E45', '#3E4A66'),
    swatch: plane('#0C1019', '#131A2A', '#242E45', '#3E4A66'),
  },
  {
    id: 'espresso', name: 'Espresso',
    ground: '#4C3E30',
    css: plane('#141009', '#1E1810', '#2F261B', '#4C3E30'),
    swatch: plane('#141009', '#1E1810', '#2F261B', '#4C3E30'),
  },
  {
    id: 'tanne', name: 'Tanne',
    ground: '#3C4C42',
    css: plane('#0B120E', '#121B15', '#233026', '#3C4C42'),
    swatch: plane('#0B120E', '#121B15', '#233026', '#3C4C42'),
  },

  // ── the three playful ones — still flat, still minimal ────────────────
  {
    id: 'morgenfahrt', name: 'Morgenfahrt',
    // A dawn: plum holding most of the wall, the ember concentrated at the
    // horizon where a sunrise actually lives, warm lit asphalt underneath.
    // The sun is a flat disc SITTING ON the line, off-centre so the rear
    // wheel crosses it instead of the drivetrain disappearing into it.
    ground: '#584740',
    css: `linear-gradient(180deg, #171020 0%, #33192B 46%, #93401F ${H}, #3D2E26 ${H}, #584740 100%)`,
    extras: [
      {
        position: 'absolute', left: '27%', top: `calc(${H} - 104px)`,
        width: 104, height: 104, marginLeft: -52, borderRadius: '50%',
        background: 'linear-gradient(180deg, #FFC24B 0%, #E86A2E 100%)',
        pointerEvents: 'none',
      },
    ],
    swatch: `linear-gradient(180deg, #171020 0%, #33192B 46%, #93401F ${H}, #3D2E26 ${H}, #584740 100%)`,
  },
  {
    id: 'nachtfahrt', name: 'Nachtfahrt',
    // A night ride: near-black blue, a handful of hard little stars high on
    // the wall (never behind the rider bust or the corner chips' row), a
    // cool floor. Stars are placed, not tiled — a pattern reads as wallpaper.
    ground: '#333B4E',
    css: [
      star('12%', '31%', 1.2), star('27%', '22%', 1.6, '#B9C7E4'), star('38%', '35%', 1),
      star('55%', '26%', 1.2), star('67%', '33%', 1.8, '#B9C7E4'), star('79%', '24%', 1),
      star('88%', '36%', 1.4), star('20%', '40%', 1), star('72%', '42%', 1.1),
      star('46%', '19%', 1),
      plane('#05070D', '#0B1120', '#1C2230', '#333B4E'),
    ].join(', '),
    swatch: plane('#05070D', '#0B1120', '#1C2230', '#333B4E'),
  },
  {
    id: 'ziellinie', name: 'Ziellinie',
    // The finish: a plain mono set with one low-contrast checkered band lying
    // ON the floor right past the horizon — the wheels cross the line all day.
    ground: '#4A4A4F',
    css: plane('#131316', '#1B1B1E', '#2E2E32', '#4A4A4F'),
    extras: [
      {
        position: 'absolute', left: 0, right: 0, top: H, height: 44,
        background:
          'repeating-conic-gradient(#4A4A52 0% 25%, #232327 0% 50%) 0 0 / 22px 22px',
        // Perspective on the cheap: the band is squashed vertically so it
        // reads as lying on the floor, not painted on the wall.
        transform: 'scaleY(0.55)', transformOrigin: 'top',
        pointerEvents: 'none',
      },
    ],
    swatch: plane('#131316', '#1B1B1E', '#2E2E32', '#4A4A4F'),
  },
]

export const DEFAULT_STAGE_THEME = STAGE_THEMES[0]

export function stageThemeById(id: string | null | undefined): StageTheme {
  return STAGE_THEMES.find((t) => t.id === id) ?? DEFAULT_STAGE_THEME
}
