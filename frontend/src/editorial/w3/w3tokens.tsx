import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/** Shared W3 tokens + tiny primitives, so W3TodayView and W3Sections render
 *  from one source. Values transcribed from `w3.pen`. */
const DARK = {
  bg: '#0B0B0B', surface: '#161616', surface2: '#202020',
  // The product-card ground: catalogue art is shot on pale studio paper, so
  // the tile that holds it is paper in BOTH modes — a white card in a dark
  // room is the shop-window move, not a leak of the light palette.
  paper: '#F1F1ED',
  // Surface LEVELS for the lit-card treatment (see w3surfaces.ts). They belong
  // in the palette, not inline in a style: `editorial` forbids raw hex in code
  // (isolation.test.ts), and a gradient invented at the call site is exactly
  // how a design system starts to drift.
  cardTop: '#1A1A1A', cardMid: '#151515', cardBot: '#131313',
  sheet: '#171717', tile: '#1E1E1E',
  // The bike stage. A DRAWN bike has near-black parts (standard saddle, matte
  // frames, deep carbon rims) that disappear on the app's dark ground, so every
  // surface showing a bike lights it the way the photographs used to light
  // themselves. One triple, so the garage, the shop and the first-bike screen
  // cannot end up with three different studios.
  stageHi: '#E8E9E6', stageMid: '#C9CBC7', stageLo: '#A9ACA8',
  shadowSoft: '#00000059',
  acid: '#BFFF3C', acidDim: '#BFFF3C1F', acidDeep: '#8FBF00',
  // The top of a LIT meter step. A single flat acid reads as a sticker at
  // this size; lightening the top edge and deepening the bottom is what makes
  // a 13 px bar look like a lit object rather than a coloured rectangle.
  acidLite: '#EAFF8F',
  ink: '#FFFFFF', mid: '#9BA0A6',
  // GEMESSEN, NICHT GESCHAETZT. `#6E7379` lag bei Kontrast 4.12 auf `bg` und
  // 3.63 auf `heroDock` -- WCAG AA verlangt 4.5 fuer Text unter 24 px. Auf
  // EINEM Bildschirm fielen damit 15 Texte durch: jede Augenbraue, jede
  // Einheit, jedes Etikett. Die dritte Textstufe war app-weit unlesbar, und
  // das Hero-Feld hat es noch verschaerft, weil sein Grund heller ist.
  // `#7E8389` haelt denselben blaeulichen Ton und besteht auf beiden
  // Gruenden: 5.15 auf `bg`, 4.55 auf `heroDock`.
  // (Der helle Modus lag mit 5.49 / 6.16 immer richtig.)
  quiet: '#7E8389',

  // ── TODAY'S HERO (pen frames `YIU3g` / `qv4Aw`, read 2026-08-19) ─────────
  // `hero*`, NOT `stage*`: the `stageHi/Mid/Lo` triple above is the light a
  // DRAWN bike is lit with, a different idea that happens to share the word.
  //
  // Today's hero is its own small palette and is NOT the card palette either.
  // These are darker and cooler than the `surface` family, which is why they
  // get their own names rather than being approximated — `surface`/`surface2`
  // exist for the LIT `lux()` cards and carry a gradient and a hairline this
  // screen deliberately does not use.
  heroBg: '#0B0B0C',         // the frame ground — blue-black, not neutral
  heroChip: '#2A2A2C',       // floating corner chips + the round icon button
  heroDock: '#1A1A1C',       // the readiness dock, flat, no border
  heroInk: '#111114',
  // The floating tab bar and the home indicator on it. Tokens because white
  // mode has to reach them too — a dark bar under a white app is the one place
  // the old room shows through.
  bar: '#0B0B0BF2', handle: '#FFFFFF59',        // text ON acid (the handle pill)
  heroMid: '#8E8E96',        // dock kickers
  heroOff: '#3A3A3F',        // an unfilled meter segment
  lilac: '#EFD6FE',          // the RideCoin asterisk, and only that
  // Gear rarity. These are the tinted grounds the item art was generated on
  // (`backend/scripts/generate_gear_art.py`), so the frame drawn around a tile
  // and the photograph inside it agree. Legendary has no entry — it is `acid`,
  // because the loudest rarity should be the brand's own colour.
  // ── THE CARD TINTS ────────────────────────────────────────────────────
  // The house deck is not a black app with a lime accent — that is one of its
  // registers. What it actually does is stand ONE object on its own softly
  // tinted ground, one tint per card, with the lime kept for the thing you
  // press. Named here rather than in the surface that first needed them,
  // because a tint invented at a call site is how a system grows a sixth blue.
  // `tintInk` is the near-black that sits ON them; the app's `ink` is white.
  tintMint: '#CDEFDC',
  tintLilac: '#E4D8FB',
  tintPeach: '#F7DCC8',
  tintSky: '#D3DDF8',
  tintPaper: '#EFEFEA',
  tintInk: '#131315',
  // The graded ground a PORTRAIT stands on. The deck never puts a character on
  // a flat swatch: the tint lifts to near-white behind the head and deepens at
  // the edges, which is what turns a cut-out into a photograph. Two ends of one
  // ramp, named because a gradient built from raw hexes at a call site is
  // exactly what the isolation gate exists to stop.
  portraitHi: '#FFFFFF',
  portraitLo: '#C9BBEA',
  // The hard training zones AS THEY SIT ON A PALE CARD. `bad` and `warn` are
  // tuned against near-black; at full saturation on paper they stop reading as
  // "this hurt" and start reading as "something is wrong".
  hotOnPaper: '#FF6B5A',
  warmOnPaper: '#FFA23D',
  rareCommon: '#9DB39A',     // sage
  rareRare: '#98A6D8',       // periwinkle
  // The floor: a linear sweep that gets LIGHTER toward the bottom, so the bike
  // reads as standing in a studio rather than floating on a void.
  heroFloor: ['#0B0B0C', '#141416', '#333336', '#47474B'] as const,
  rule: '#FFFFFF14', stroke: '#FFFFFF1A',
  // The data ramp. `d1` is the empty end of it — an unlit meter step or an
  // unfilled slot, present enough to be counted and far enough below every
  // lit hue that it can never read as data. It shares a value with `rule`
  // and is deliberately named separately: one is a hairline, the other is a
  // mark, and they will not always want to move together.
  d1: '#FFFFFF14', d2: '#FFFFFF33', d3: '#FFFFFF4D', d4: '#FFFFFF8C',
  training: '#2BE68F', evening: '#7B5CFF', cool: '#6B8CFF',
  warn: '#FFB020', bad: '#FF4356',

  // ── THE MORNING BRIEFING'S OWN SET (pen `AfZLS`) ───────────────────────
  // The one surface in the app with an ambient sky behind it rather than a
  // flat ground, and the one that draws a session in its own colours. These
  // are palette values, not accents: they never mark data, they paint the
  // atmosphere and the shape of a workout.
  //
  // The three washes are the pen's own — warm at the top where the sun would
  // be, violet low on the left, acid low on the right — and together they are
  // what stops a 6 a.m. screen from being a black rectangle.
  skyWarm: '#FFA35C', skyGlow: '#FF7A2E', skyGround: '#07080B',
  // The readiness arc runs warm → acid as it fills, so a low score is orange
  // and a high one is the brand's green without either being a verdict colour.
  ringWarm: '#FF9A4D', ringMid: '#E8F53C',
  //: The score sits in a pale acid rather than white — lit by its own arc.
  scoreInk: '#EAFFA8',
  // A workout profile in two materials: effort is hot, recovery is cool. It is
  // the convention every training app uses and the reason a profile reads as a
  // session at a glance rather than as a chart.
  effortFrom: '#FF8A00', effortTo: '#F5C518',
  easyFrom: '#2F5FC4', easyTo: '#3E7BFA',
  //: The pill's own gradient, top highlight to bottom shade.
  acidHi2: '#DDFF6E', acidMid: '#A9DE00',

  // ── VITAL SIGNS ────────────────────────────────────────────────────────
  // Cyan was not a decision anyone made; it appeared as a literal in five
  // files (the HRV number, the HRV spark, the REM sleep stage, a studio
  // swatch, the sleep icon) and became a second accent by accumulation. It
  // does real work — a vital sign is an IDENTITY, and identity is the one
  // job colour may hold — so it is declared here instead of scattered, and
  // the app now has one place to change its mind.
  hrv: '#00E5FF', rem: '#00E5FF', rhr: '#FF6A8A', sleep: '#ED29FF',
  zone5: '#FF7A2F',          // the fifth zone, past `warn` — nothing else is
  orbit: '#B9A6FF',          // the distance-around-the-Earth line, and only it

  // ── GROUNDS ────────────────────────────────────────────────────────────
  // Surfaces that were being written as literals next to the tokens they
  // sit beside. `acidTop` is the warm-lit top of a card that has EARNED
  // something — it is `surface` with the acid's own light fallen on it.
  ground: '#0F0F0F',         // deeper than `surface`: a card that is a hole
  card: '#151516',           // the referral portrait ground (blue-black)
  chip: '#232427',           // a stat tile inside a dark card
  // A pill that floats ON art. The ground's own black at ~72% behind a blur:
  // dark enough that white 8.5px type holds over a lit illustration, sheer
  // enough that it reads as glass lying on the picture rather than a hole
  // punched in it. `shadowSoft` (35%) is a shadow, not a surface, and a pill
  // built from it goes unreadable the moment the art behind it brightens.
  glass: '#0B0B0BB8',
  // ── THE MEDAL ────────────────────────────────────────────────────────
  // A third accent, and it earns its place by meaning a third thing: acid is
  // the rider's own, violet is the crew as a body, and gold is the one card
  // about what somebody has NEVER done before. Used once per feed.
  gold: '#E8C15A', goldDim: '#E8C15A26', goldEdge: '#E8C15A4D',
  acidTop: '#1B1C19',
  lift: '#1B1B1B',           // a neutral card top — `acidTop` without the acid
  acidHi: '#DBFF5A',         // the highlight stop above `acid` in a medal

  // ── A NIGHT SKY ────────────────────────────────────────────────────────
  // Three stops of the same cool descent, used as one gradient. Named as a
  // set because they are meaningless apart.
  nightHi: '#2A3340', nightMid: '#1B2330', nightLo: '#14181F',
}

/**
 * WHITE MODE — the same app with the lights on.
 *
 * Selected by standing the bike on the white studio backdrop, which is the
 * point: the ground the machine sits on IS the ground the app sits on, so a
 * rider changes the whole room by choosing where to park.
 *
 * DECLARED AS OVERRIDES, NOT AS A SECOND PALETTE. Sixty-five tokens hand-copied
 * would drift the first time somebody added a sixty-sixth, and most of them
 * should not change at all: the bike's studio lights (`stage*`) light a machine
 * the same way in either mode, the pastel `tint*` fills are already light, and
 * the chart hues are a language of their own. Only the ground, the ink, the
 * dividers and the accent are actually a function of which mode you are in.
 */
const LIGHT: typeof DARK = {
  ...DARK,

  // ── The ground, and the surfaces that lift off it ──────────────────────
  // Inverted in RELATIONSHIP, not in value: a card is lighter than the ground
  // in both modes, so the ground is paper and the cards are white.
  bg: '#F2F2EE', ground: '#EDEDE9',
  paper: '#FFFFFF',
  surface: '#FFFFFF', surface2: '#F6F6F2',
  cardTop: '#FFFFFF', cardMid: '#FBFBF8', cardBot: '#F6F6F2',
  sheet: '#FFFFFF', tile: '#FFFFFF', card: '#FFFFFF', lift: '#FFFFFF',
  chip: '#E8E8E2',
  glass: '#FFFFFFC4',
  // Darkened for the light ground: the dark palette's gold is a light on
  // near-black and would be unreadable as type on white.
  gold: '#8A6A12', goldDim: '#8A6A1218', goldEdge: '#8A6A1240',
  acidTop: '#F4FBE4',          // the warm-lit top of a card that has EARNED it

  // ── Ink ────────────────────────────────────────────────────────────────
  ink: '#0B0B0B', mid: '#5A6068', quiet: '#5C626A',

  // ── Today's hero keeps its own small palette, one mode over ────────────
  heroBg: '#F2F2EE', heroChip: '#E4E4DE', heroDock: '#FFFFFF',
  heroMid: '#5F646D', heroOff: '#C9C9C2',
  // Text set ON the accent. The accent is dark in this mode, so this flips.
  heroInk: '#FFFFFF',
  bar: '#FFFFFFF2', handle: '#0B0B0B40',

  // ── Dividers. White-on-black becomes black-on-white at the same alphas ──
  rule: '#0B0B0B14', stroke: '#0B0B0B1A',
  d1: '#0B0B0B14', d2: '#0B0B0B33', d3: '#0B0B0B4D', d4: '#0B0B0B8C',
  shadowSoft: '#0000002E',

  // ── THE ACCENT GOES DEEPER, AND THIS IS THE ONE REAL COMPROMISE ─────────
  // `T.acid` is both a fill and a text colour across 121 files, and one value
  // has to serve both. #BFFF3C on white is about 1.4:1 — illegible as type — so
  // white mode runs a deeper lime. The alternative was auditing every accent in
  // the app for whether it paints or writes, which is a bigger change than this
  // whole mode.
  //
  // MEASURED, not asserted. The previous #5F8A00 came with a comment claiming
  // it "clears 4.5:1 as text"; it does not — 4.10 on white, 3.65 on `bg` and
  // 3.21 on `chip`, so it failed AA on every ground including the one it was
  // chosen for. These values are computed against all four light grounds
  // (bg / surface / chip / heroChip) and the worst case is the one quoted.
  acid: '#447200',      // worst 4.50 (heroChip) — the LIGHTEST lime that clears AA on all four grounds
  acidDeep: '#3E5A00',  // worst 6.17
  acidLite: '#5F8A00',  // decorative only — never set as body text
  acidHi: '#5A8200',    // gradient stop, not type
  acidDim: '#44720018',

  // ── Chart hues that only worked because the ground was black ────────────
  training: '#0F9E5E', warn: '#8A5500', bad: '#C22036',
  hrv: '#0090A6', rem: '#0090A6', rhr: '#D14A68', sleep: '#B01BC0',
  zone5: '#D24E15', orbit: '#6F5BC9', cool: '#3E60CE', evening: '#5B41D6',
}

export type W3Mode = 'dark' | 'light'

let _mode: W3Mode = 'dark'

/**
 * The palette, read live.
 *
 * A PROXY, and the reason matters. Every surface in this app writes its colours
 * inline — `style={{ color: T.ink }}` — and there are ninety-one distinct token
 * reads across a hundred and twenty-one files. Rewriting those to CSS custom
 * properties would have been the textbook answer and it breaks two things this
 * codebase does constantly: alpha is composed by string concatenation
 * (`${T.acid}26`), and the share cards paint into a canvas, where `var(--x)` is
 * not a colour. A proxy keeps every existing call site correct, in both modes,
 * in the DOM and on the canvas.
 */
export const T: typeof DARK = new Proxy({} as typeof DARK, {
  get: (_t, k: string) => (_mode === 'light' ? LIGHT : DARK)[k as keyof typeof DARK],
  // The traps below exist so `Object.keys(T)` and a spread still behave. Nothing
  // does either today; a palette that breaks when somebody tries is a trap.
  ownKeys: () => Reflect.ownKeys(DARK),
  has: (_t, k) => k in DARK,
  getOwnPropertyDescriptor: (_t, k) => ({
    ...Object.getOwnPropertyDescriptor(DARK, k), configurable: true,
  }),
})

/**
 * THE PALETTE A PRINTED ARTEFACT USES, whatever the app is wearing.
 *
 * `T` follows the rider's chosen room, which is right for every screen and
 * wrong for the share cards: those are painted onto a dark photograph and then
 * leave the app entirely. In light mode `T.ink` is near-black, so a card drawn
 * through `T` printed dark type onto a dark picture and the words vanished —
 * seen on `/e/w3-story-preview` the moment white mode landed.
 *
 * A card is not a screen. It pins here.
 */
export const CARD = DARK

/** What the palette is currently answering with. */
export function w3Mode(): W3Mode {
  return _mode
}

/** Set the palette. The tree has to re-render for this to be seen — see
 *  `W3ModeProvider`, which is the only thing that should call it. */
export function setW3Mode(mode: W3Mode): void {
  _mode = mode
}


/**
 * Per-rider board colours, in board order (rank 1 first).
 *
 * These were eight pastels, and they did not work. Measured with the palette
 * validator on this app's dark surface: SIX of the eight fell below the chroma
 * floor — they read as grey — and the worst pair sat at ΔE 9.0 for NORMAL
 * colour vision, below the floor of 15, meaning a rider with no deficiency at
 * all could not tell one card from the next. For deuteranopia it was ΔE 2.2:
 * no separation whatsoever.
 *
 * THERE ARE SIX BECAUSE EIGHT IS NOT POSSIBLE HERE. A first replacement kept
 * eight and passed — but only on ADJACENT pairs, which is the wrong test for a
 * leaderboard, where rank 1 and rank 6 are on screen together. Checked across
 * ALL pairs, the yellow collided with the lime (ΔE 2.4 deutan) and the purple
 * with the pink (13.1 normal), and no eighth hue fixed both: the dark surface
 * simply does not hold eight separable colours. So the set was cut rather than
 * fudged. Ranks past six reuse a colour, which the board can afford — rank and
 * name are the identity, colour only reinforces it.
 *
 * All pairs now: worst ΔE 15.2 normal, 8.0 protan. The protan figure sits ON
 * the floor, which is legal precisely because that secondary encoding is
 * always present. Pinned by `boardPalette.test.ts`.
 *
 * The lightness band is the one check deliberately failed. It is tuned for thin
 * chart marks; these are the lit end of a large gradient card behind a
 * photograph, in an art direction that is neon on near-black. Dimming them into
 * the band would fix a number and break the product.
 */
export const BOARD_TINTS = [
  '#BFFF3C', '#00E5FF', '#FF6AC8', '#FF8A3C', '#6B8CFF', '#2BE68F',
] as const
/** The dark end of a board tint's gradient. */
export const BOARD_BASE = '#16131F'
export const FONT = '"Inter Tight", ui-sans-serif, system-ui, sans-serif'

// ── THE COVER PLATES ──────────────────────────────────────────────────────
// The auth screen is the app's COVER, and a cover prints in spot colour: one
// ink per issue, carrying the field, the bike and the button alike. These are
// the four inks. They are the one place in W3 that is not the near-black
// ground -- justified because this screen is read before anyone is a rider,
// where the job is to be unmistakable rather than to be quiet.
//
// `field` is the ink. `onField` is the only type colour allowed on top of it,
// pre-checked for contrast so no caller has to guess. LIME is the BRAND lime
// (`RIDR_LIME`), deliberately not the interface acid -- the cover is brand,
// the app is interface. See `w3cover.ts` for how an issue is chosen.
export const COVER_PLATES = [
  { key: 'lime', name: 'LIME', field: '#C6F53C', onField: '#101110' },
  { key: 'chili', name: 'CHILI', field: '#E8291E', onField: '#FFFFFF' },
  { key: 'violett', name: 'VIOLETT', field: '#6B4EE6', onField: '#FFFFFF' },
  { key: 'himmel', name: 'HIMMEL', field: '#48A6E6', onField: '#0E1A22' },
] as const

/** The display face. Used for ONE thing per screen -- the masthead -- and
 *  never for prose; it has no lowercase presence at text sizes. */
export const DISPLAY = 'Anton, "Archivo Narrow", Impact, sans-serif'
/** The utility face: issue numbers, credits, plate names. Never prose. */
export const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace'
export const EASE = [0.22, 1, 0.36, 1] as const
export const grow = (delay: number) => ({ duration: 0.55, ease: EASE, delay })
export const DASH = '—'

/**
 * W3 · DIE OBJEKTSCHRIFT — der Name einer Sache, nicht ein Satz ueber sie.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM ES DIESE KOMPONENTE GIBT
 *
 * Jeder Bildschirm hat sich seine Ueberschrift selbst ausgedacht. Gemessen im
 * editorial-Baum: 34/700/-1.4, 36/700/-1.2, 30/700/-1.0, 40/600/-1.6,
 * 42/700/-1.5, 34/700/-1.4 -- und in den CSS-Dateien noch einmal 36/-1.5,
 * 43/600/-1.9, 27/550 und 40/550. Zehn Varianten desselben Gedankens. Keine
 * davon ist falsch; zusammen ergeben sie kein System.
 *
 * `DISPLAY` (Anton) stand daneben in GENAU EINER Datei -- dem Planbogen, fuer
 * "WOCHE 05". Das ist die Behandlung, die traegt, und sie steht ab jetzt hier
 * statt in einer Datei.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * DIE REGEL, UND SIE IST DIE HALBE ARBEIT
 *
 * Anton ist eine schmale Versalschrift. Sie traegt KURZE OBJEKTNAMEN:
 *
 *     WOCHE 05 · BIKE ENTSPERRT · DEINE FAHRTEN · SCHWELLE
 *
 * Sie traegt KEINE SAETZE. "Was der Plan von dir will" in Anton waere eng,
 * laut und schlecht lesbar -- dafuer bleibt die Zwei-Gewichts-Ueberschrift des
 * Hauses zustaendig (38-44/700/-1.4, der Satz in `ink`, das eine Wort in
 * `acid`). Die beiden stehen NICHT in Konkurrenz, sie haben verschiedene
 * Aufgaben:
 *
 *     Objektschrift  ->  wie heisst dieses Ding?
 *     Satzschrift    ->  was ist gerade wahr?
 *
 * Wer hier einen Satz hineinschreibt, hat die falsche Komponente gewaehlt.
 *
 * LAUT DURCH GROESSE, NIE DURCH FARBE. Die Objektschrift nimmt `T.ink` und
 * niemals Acid: sie ist ohnehin das groesste Element ihrer Flaeche, und Acid
 * daneben waere ein zweiter Ruf um dieselbe Aufmerksamkeit.
 *
 * ANTON BENENNT, TNUM MISST -- und das ist die Grenze, die beim Uebertragen
 * des Planseiten-Kopfes auf den Fahrten-Kopf sichtbar wurde. "WOCHE 05" ist
 * ein Ordnungsschild: es aendert sich in Schritten, steht allein und darf die
 * Breite wechseln. "4 812" ist eine gemessene Groesse: sie waechst mit jeder
 * Fahrt, und Anton hat KEINE Tabellenziffern -- die Zahl wuerde bei jedem
 * Wechsel in der Breite springen. Gemessene Werte bleiben deshalb bei der
 * Textschrift mit `TNUM`.
 *
 * Was beide Koepfe teilen, ist nicht die Schrift, sondern der AUFBAU:
 * leises Etikett oben, lauter Wert darunter, leiser Zaehler rechts auf der
 * Grundlinie. Den trennt `HeadRow` ab.
 */
export type DisplaySize = 'sm' | 'md' | 'lg'

//: Die Spur wird mit der Groesse enger -- Anton laeuft sonst bei 54 px
//: sichtbar auseinander, waehrend dieselbe Spur bei 28 px die Buchstaben
//: ineinanderschiebt.
const DISPLAY_SCALE: Record<DisplaySize, { fontSize: number; letterSpacing: number }> = {
  sm: { fontSize: 26, letterSpacing: -0.2 },
  md: { fontSize: 40, letterSpacing: -0.5 },
  lg: { fontSize: 54, letterSpacing: -0.9 },
}

export const Display = ({ size = 'md', children, style }: {
  size?: DisplaySize
  children: ReactNode
  style?: CSSProperties
}) => (
  <span
    style={{
      fontFamily: DISPLAY,
      lineHeight: 0.92,
      color: T.ink,
      display: 'block',
      textWrap: 'balance',
      ...DISPLAY_SCALE[size],
      ...style,
    }}
  >
    {children}
  </span>
)

/**
 * W3 · DER KOPF EINER FLAECHE — zwei Raenge links, ein Zaehler rechts.
 *
 * Der Aufbau, den der Planseiten-Kopf ("GRUNDLAGE / WOCHE 05 ... von 12")
 * und der Fahrten-Kopf ("SAISON / 4 812 km ... 142 Fahrten") teilen. Vorher
 * hat ihn jede Flaeche selbst nachgebaut, mit eigenen Abstaenden und eigener
 * Ausrichtung.
 *
 * `alignItems: flex-end` ist die ganze Feinheit: der kleine Zaehler sitzt
 * damit auf der Grundlinie des grossen Werts statt in dessen Mitte zu
 * schweben.
 */
/**
 * W3 · DAS HERO-FELD — beleuchtet, nicht gerahmt, und ohne Unterkante.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WARUM NICHT EINFACH EINE KARTE
 *
 * Der Fahrten-Kopf stand in einem `lux(28)`-Kasten mit vier durch Haarlinien
 * getrennten Baendern darin. Das liest sich als Datenblatt, nicht als
 * Titelseite. Also raus damit -- und dann hob sich der Kopf ueberhaupt nicht
 * mehr vom Rest ab, weil er auf demselben Grund lag wie alles darunter.
 *
 * Beides war falsch, und zwar auf dieselbe Weise: Eine Karte trennt durch eine
 * KANTE, und der Hausstil trennt durch LICHT. Diese Komponente wendet
 * "Karten sind beleuchtet, nicht gerahmt" auf Seitenebene an.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * WIE ES TRENNT
 *
 * Ein randloses Feld ueber die volle Breite, einen Tonwert ueber dem Grund,
 * das nach unten IN den Grund auslaeuft. Kein Radius, keine Linie, keine
 * Unterkante -- der Kopf hoert nicht auf, er loest sich auf. Genau deshalb
 * traegt er, ohne wie ein Kasten auszusehen: der Tonsprung oben ist die
 * Trennung, das Ausblenden unten verhindert eine zweite.
 *
 * KEIN ACID IM FELD. Der Kopf hat bereits eine Heldenzahl; ein farbiger
 * Schimmer dahinter waere ein zweiter Ruf um dieselbe Aufmerksamkeit.
 */
/**
 * W3 · DIE SCHRIFTSKALA — sieben Stufen, und keine achte.
 *
 * Auf EINEM Bildschirm gemessen (Fahrten, 390x844): vierzehn verschiedene
 * Schriftgroessen -- 9, 10, 11, 12, 13, 14, 15, 17, 19, 23, 31, 32, 48, 64.
 * Das ist keine Skala, das ist Streuung. Der Unterschied zwischen 12 und 13
 * ist fuer niemanden eine Aussage; er entsteht, wenn jede Flaeche ihre
 * Groessen einzeln waehlt.
 *
 * Acht Stufen reichen fuer alles, was diese App sagt:
 *
 *   label    9    Augenbraue, versal, gesperrt
 *   fein    11    Fussnote, Einheit, Nebenangabe
 *   stuetz  12.5  Stuetztext unter einer Aussage
 *   koerper 15    Fliesstext und Betonung
 *   kopf    19    Kartentitel, Unterueberschrift
 *   titel   26    Seitenueberschrift
 *   held    40    Heldenzahl in einer Karte
 *   gross   64    Heldenzahl einer Seite
 *
 * ES WAREN ERST SIEBEN, und der Kommentar behauptete, eine achte sei immer ein
 * Hierarchieproblem. Dann stand die Seitenueberschrift "Deine Fahrten." auf
 * 31 px und passte weder auf `kopf` (19, ein Kartentitel) noch auf `held` (40,
 * eine Zahl). Es fehlte eine SEITENUEBERSCHRIFT -- eine echte Stufe, keine
 * Bequemlichkeit.
 *
 * WER EINE NEUNTE BRAUCHT, sollte erst pruefen, ob er wirklich eine neue Rolle
 * hat: zwei Dinge, die sich um 1 px unterscheiden, sind in Wahrheit gleich
 * wichtig und gehoeren auf dieselbe Stufe.
 */
export const TYPE = {
  label: 9, fein: 11, stuetz: 12.5, koerper: 15,
  kopf: 19, titel: 26, held: 40, gross: 64,
} as const

export const HeroField = ({ children, style }: {
  children: ReactNode
  style?: CSSProperties
}) => (
  <div
    style={{
      position: 'relative',
      // Randlos ueber die ganze Spaltenbreite -- der Rand des Feldes ist der
      // Rand des Bildschirms, nicht eine Kante im Inhalt.
      margin: '0 -20px',
      padding: '10px 20px 34px',
      background: `linear-gradient(180deg, ${T.heroDock} 0%, ${T.heroDock} 58%, ${T.bg} 100%)`,
      ...style,
    }}
  >
    {children}
  </div>
)

export const HeadRow = ({ label, counter, children }: {
  label: ReactNode
  counter?: ReactNode
  children: ReactNode
}) => (
  <div style={{ display: 'flex', alignItems: 'flex-end',
                justifyContent: 'space-between', gap: 14 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <Kicker>{label}</Kicker>
      {children}
    </div>
    {counter != null && (
      <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet, flex: 'none',
                     fontVariantNumeric: 'tabular-nums' }}>
        {counter}
      </span>
    )}
  </div>
)

export const Kicker = ({ children }: { children: ReactNode }) => (
  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: T.quiet }}>{children}</span>
)

/**
 * Full-width section wrapper.
 *
 * IT NO LONGER PAINTS A BACKGROUND, and that is the whole point. Every band
 * repainted `T.bg` — which the frame already paints — so the page was a stack
 * of opaque surfaces rather than one ground. Harmless while everything was the
 * same black; fatal the moment the top of the page takes its colour from the
 * stage, because each band then cut that colour off at its own top edge.
 *
 * Transparent, the ground runs the length of the page and the sections lie ON
 * it, which is the hero's arrangement applied to the whole screen.
 */
export const band = (padBottom: number) => ({ display: 'flex', flexDirection: 'column' as const, width: '100%', padding: `0 20px ${padBottom}px` })

/**
 * A section that arrives as you reach it.
 *
 * Today is a long scroll of bands, and a long scroll that is entirely static
 * reads as a list. Each band lifts 14px and fades as it enters, ONCE — so the
 * page answers the scroll without ever re-animating content the rider has
 * already read, which is what makes reveal effects tiring.
 *
 * `amount: 0.15` fires as the band's top edge arrives rather than waiting for
 * most of it to be on screen: these bands are taller than the viewport, so the
 * 0.8 threshold used for small in-card bars would never trigger for some of
 * them and those sections would simply never appear.
 *
 * NO TRANSFORM AT REST. `y` animates to 0 and motion clears the transform, so
 * a band never becomes a containing block for the fixed tab bar or the action
 * button that render inside this tree.
 */
/**
 * "Is this on screen yet?" — the mechanism behind every W3 scroll animation.
 *
 * WHY THIS EXISTS RATHER THAN `whileInView`. Motion's viewport prop resolves
 * immediately in this app: measured on Today, four wrappers sat at opacity 1
 * with no transform at scrollTop 0 while their tops were at y=2224+, and an
 * IntersectionObserver on the SAME element correctly reported
 * isIntersecting:false, ratio 0. Not reduced motion, no MotionConfig, and it
 * still resolved with an unconditional `initial`. Every `whileInView` bar fill
 * in the app was therefore already full before the rider ever reached it.
 *
 * Returns true once and stays true — a bar that has been read must not empty
 * itself and refill when the rider scrolls back up.
 */
export function useInView(amount = 0.15) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Guarded, not assumed. `matchMedia` and `IntersectionObserver` are absent
    // in jsdom and in some embedded webviews, and an unguarded call here throws
    // during mount — taking the whole section down to hide an animation. With
    // neither available the content is simply shown, which is the correct
    // fallback for a progressive enhancement.
    const prefersLess = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersLess || typeof IntersectionObserver !== 'function') {
      setInstant(true); setInView(true); return
    }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      setInView(true)
      io.disconnect()
    }, { threshold: amount })
    io.observe(el)
    // An element taller than the viewport can never reach its ratio, so it
    // would stay hidden forever; accept "top edge passed" as well.
    const onScroll = () => {
      const b = el.getBoundingClientRect()
      if (b.top < window.innerHeight * 0.9) {
        setInView(true); io.disconnect(); window.removeEventListener('scroll', onScroll)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [amount])

  return { ref, inView, instant }
}

export function Reveal({ children, style, delay = 0, amount = 0.15 }: {
  children: ReactNode
  style?: CSSProperties
  delay?: number
  amount?: number
}) {
  // `instant` drops the transition too, so a reduced-motion rider does not even
  // get a cross-fade: a reveal that still fades is still motion.
  const { ref, inView: shown, instant } = useInView(amount)

  return (
    <div
      ref={ref}
      data-w3-reveal={shown ? 'in' : 'out'}
      style={{
        ...style,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(14px)',
        transition: instant
          ? undefined
          : `opacity 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s, transform 0.55s cubic-bezier(0.22,1,0.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}
/** Surface card, r24. */
export const card = () => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column' as const, width: '100%' })

// The surface + rhythm primitives (S / lux / hairline / TNUM) live in
// `w3surfaces.ts` — a pure module, so they don't add to this file's
// react-refresh violations. Import them from there.

/**
 * Style for an `<input type="file">` that is opened programmatically.
 *
 * NOT `display: none`. A display:none input is out of the layout entirely, and
 * iOS Safari will not open the picker for `ref.current.click()` on one — the tap
 * silently does nothing, no request is ever made, and it looks exactly like a
 * broken upload pipeline from the outside. Keep the input rendered but
 * invisible and parked off-screen instead.
 */
export const HIDDEN_FILE_INPUT = {
  position: 'absolute' as const,
  left: -9999,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none' as const,
}


/**
 * The painted sky and mountains behind a shared ride card.
 *
 * A palette source, like the basemap: these are scenery, and scenery has no
 * token equivalents — nothing else in this app is a ridgeline at dusk, and
 * inventing `T.mountainMid` would put a colour in the design system that no
 * component may use. They live here so the share painter itself holds no raw
 * hex, which is how it came to be painting a lime that was not this app's.
 */
export interface ShareScene {
  skyTop: string; skyBot: string
  mtnBack: string; mtnMid: string; mtnFront: string
  route: string
}
export const SHARE_SCENES: Record<'rekord' | 'fahrt' | 'leistung', ShareScene> = {
  rekord:   { skyTop: '#6A4BC4', skyBot: '#C56BA6', mtnBack: '#7A4FB0', mtnMid: '#5B3A90', mtnFront: '#3C2568', route: '#FF5CA8' },
  fahrt:    { skyTop: '#241A54', skyBot: '#6B3A8C', mtnBack: '#4A2E7A', mtnMid: '#37225C', mtnFront: '#241645', route: '#C86BFF' },
  leistung: { skyTop: '#1E5C46', skyBot: '#B23A7A', mtnBack: '#8A3A72', mtnMid: '#5B2E66', mtnFront: '#331F55', route: T.acid },
}
