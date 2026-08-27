import { T, CARD, SHARE_SCENES, type ShareScene } from './w3tokens'
import {
  blocksHeight, fitBlocks, paintBlocks, usableBlocks,
  type BlockData, type BlockId,
} from './w3shareBlocks'
import { RIDR_LIME } from '../../components/RidrMark'
/**
 * W3 · Ride-teilen — the share-poster renderer + native-share plumbing.
 *
 * ONE canvas renderer produces the poster, and that same bitmap is both the
 * on-screen preview AND the file handed to the OS share sheet — so what the
 * rider previews is exactly what gets posted. The hero composites the rider
 * (avatar), the bike (the real bike render) and the GPX of the route (the
 * ride's `route_polyline`), matching the ride/session hero.
 *
 * Sharing uses ONLY the platform share sheet (`navigator.share` with a file) —
 * no Instagram/LinkedIn SDKs. The OS sheet is what routes the image to
 * Instagram, LinkedIn, WhatsApp, etc. Fallbacks (older desktop browsers): a
 * PNG download + a copied caption, so the button is never dead.
 */

export type ShareAngle = 'rekord' | 'fahrt' | 'leistung'

export interface PosterPill { text: string; sub: string; tone: 'acid' | 'violet' }
export interface PosterStat { v: string; l: string }
export interface PosterData {
  angle: ShareAngle
  handle: string
  club: string
  kicker: string
  bigValue: string
  bigUnit: string
  /** Written by the caller INCLUDING its arrow. The painter used to hardcode a
   *  "↓", so an effort ABOVE the old best pointed downwards — the one direction
   *  it can never mean. */
  delta: string | null
  sentence: string
  pills: [PosterPill, PosterPill]
  stats: [PosterStat, PosterStat, PosterStat]
  footer: string
  /** GPX track as [lat, lng] pairs (downsampled). Null → a stylised route. */
  polyline: [number, number][] | null
  /** Ride intensity (IF). When set, the route glows in the intensity accent
   *  (green→lime→amber→orange) instead of the angle's default colour. */
  intensity?: number
  /**
   * The ride's OWN composed hero — the rider's bike shot in the framing that
   * ride earned (`services/ride_framing`). When it exists it IS the top half of
   * the poster: a real machine in a real place beats a studio cut-out pasted
   * over invented mountains, which is what this card drew before.
   */
  sceneSrc?: string | null
  /**
   * The rider's own bike render, for when no scene has been composed. NULL is a
   * valid value and draws no bike at all — the stock catalogue bike used to be
   * hardcoded here, so every rider's poster showed a grey bicycle that was not
   * theirs. A poster with a route and no bike is honest; one with someone
   * else's bike is not.
   */
  bikeSrc: string | null
  avatarUrl: string | null
  avatarInitial: string
  /** WHAT THE RIDER CHOSE TO SHOW, in the order they chose it. The card used
   *  to be one fixed stack — a number, a sentence, two pills, three tiles —
   *  which is a receipt. What a cyclist posts is the SHAPE of the day, and
   *  which shape matters differs between a 20-minute test and a five-hour
   *  epic. See `w3shareBlocks`. */
  /** VESTIGIAL. It told the old poster painter which pieces to compose; the
   *  pen's five templates have fixed compositions and nothing reads it. Optional
   *  so callers can stop passing it, and it goes when this shape is retired in
   *  favour of `StoryData`. */
  blocks?: BlockId[]
  /** The series and figures those blocks draw from. */
  blockData: BlockData
}

// The card that LEAVES the app was painting a lime this app does not use — a
// near-miss on the acid. Its accent is the product's accent now, from the one
// place that defines it; the scenery comes from the declared scene palette.
type Theme = ShareScene & { acid: string }
const THEMES: Record<ShareAngle, Theme> = {
  rekord: { ...SHARE_SCENES.rekord, acid: T.acid },
  fahrt: { ...SHARE_SCENES.fahrt, acid: T.acid },
  leistung: { ...SHARE_SCENES.leistung, acid: T.acid },
}

const W = 1080
const H = 1720
const FONT = "'Inter Tight', ui-sans-serif, system-ui, sans-serif"

// THE STORY CARDS SET THREE FACES, NOT ONE, and the pen picks per card rather
// than per element: `D1SQI` (Laufband) is Archivo Narrow throughout because a
// route name has to run the full column at 138px and a ticker has to fit twice
// as many characters as it has room for; `pi5Hm` (Effort-Kurve) is Archivo,
// which is the same family at normal width, because its sentence is the subject
// and a condensed face would make it look like a headline instead of a verdict;
// `BMzgQ` (Telemetrie-HUD) is JetBrains Mono end to end because it is pretending
// to be an instrument. Inter Tight stays the kicker face on all three.
//
// All four are already loaded (index.html, one Google Fonts request). A face
// named here that is NOT in that request would silently fall back and the card
// would export at the wrong width — that is the only real risk in this list.
const NARROW = "'Archivo Narrow', 'Inter Tight', sans-serif"
const ARCHIVO = "Archivo, 'Inter Tight', sans-serif"

function loadImage(src: string, crossOrigin?: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

// `mountainPath` lived here and drew three ranges of invented scenery behind
// the bike. The fallback is the app's own studio room now — see `paint` — so
// there is no landscape to paint and nothing this could be reused for.
function intensityHue(iff: number): string {
  return iff >= 1.02 ? T.zone5 : iff >= 0.92 ? T.warn : iff >= 0.8 ? T.acid : T.training
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][] | null,
  theme: Theme,
  heroH: number,
  routeColor: string,
  overPhoto: boolean,
) {
  // ── WHERE THE TRACK GOES, AND WHY IT MOVED ─────────────────────────────
  // This drew a 12 px glowing line across the middle third of the hero
  // whatever was underneath it. Over the generated stylised mountains that is
  // the hero graphic and it works. Over the rider's OWN photograph it ran
  // straight across the bicycle — the subject of the picture, the thing they
  // opened the card to look at — and the file's own comment claimed it "sits
  // lower and lighter" over a photograph, which the code had no way of knowing
  // and never did.
  //
  // Over a photograph it is now a CARTOUCHE in the bottom-left: the same track,
  // drawn small on its own dark plate, out of the subject's way. A route is a
  // caption on a photograph and the hero graphic on a drawing, and those are
  // two different jobs that were sharing one implementation.
  // TOP-RIGHT over a photograph: the avatar chip owns the top-left, the machine
  // owns the middle, and the bottom belongs to the fade. That leaves one corner,
  // and it is the one a viewer's eye reaches last — correct for a caption.
  const rect = overPhoto
    ? { x: W - 56 - 250, y: 44, w: 250, h: 190, stroke: 6, dot: 7, pad: 24 }
    : { x: 90, y: heroH * 0.5, w: W - 180, h: heroH * 0.34, stroke: 12, dot: 12, pad: 0 }

  let path: { x: number; y: number }[]
  const inner = { x: rect.x + rect.pad, y: rect.y + rect.pad, w: rect.w - rect.pad * 2, h: rect.h - rect.pad * 2 }
  if (pts && pts.length > 1) {
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const spanLat = Math.max(1e-6, maxLat - minLat), spanLng = Math.max(1e-6, maxLng - minLng)
    // Latitude is compressed by cos(lat) so the loop keeps its real
    // proportions — a rider recognises their own roads well enough to notice
    // a track 40 % too wide, which is what an uncorrected drawing gives at
    // 52° N. The ride card drew it uncorrected; the route thumbnail on Today
    // has always corrected it (`W3RouteCard.project`).
    const kx = Math.cos(((minLat + maxLat) / 2 * Math.PI) / 180)
    const gw = spanLng * kx
    const scale = Math.min(inner.w / gw, inner.h / spanLat)
    const offX = inner.x + (inner.w - gw * scale) / 2
    const offY = inner.y + (inner.h - spanLat * scale) / 2
    path = pts.map(([lat, lng]) => ({
      x: offX + (lng - minLng) * kx * scale,
      y: offY + (maxLat - lat) * scale,
    }))
  } else {
    path = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return { x: inner.x + t * inner.w, y: inner.y + inner.h * (0.5 + 0.42 * Math.sin(t * 7)) }
    })
  }

  ctx.save()
  if (overPhoto) {
    // Its own plate, so the track is legible over grass, tarmac or sky without
    // a glow bright enough to compete with the machine.
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 26)
    ctx.fillStyle = 'rgba(11,11,11,0.58)'; ctx.fill()
  }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.shadowColor = routeColor; ctx.shadowBlur = overPhoto ? 10 : 26
  ctx.strokeStyle = routeColor; ctx.lineWidth = rect.stroke
  ctx.beginPath()
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.restore()

  const dot = (p: { x: number; y: number }, fill: string) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, rect.dot, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill()
  }
  dot(path[0], T.ink); dot(path[path.length - 1], theme.acid)
}

/** Exported for its own test: the spaced branch has alignment logic of its own
 *  and a card that has already left the app cannot re-lay itself out. */
export function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: string, color: string, spacing = 0, align: CanvasTextAlign = 'left', family = FONT, baseline: CanvasTextBaseline = 'alphabetic') {
  ctx.font = `${weight} ${size}px ${family}`
  ctx.fillStyle = color
  ctx.textAlign = align
  // THE PEN GIVES TEXT BOXES, NOT BASELINES. Every `y` in `D1SQI`, `BMzgQ` and
  // `pi5Hm` is the TOP of a text box, so transcribing those cards against an
  // alphabetic baseline means adding a guessed ascent to each of forty numbers
  // — forty chances to be a few pixels out in a different direction. Those
  // three pass `'top'` and use the pen's own figure.
  ctx.textBaseline = baseline
  if (spacing === 0) { ctx.fillText(s, x, y); return ctx.measureText(s).width }

  // ── LETTER-SPACED, AND IT HAS TO HONOUR `align` ITSELF ──────────────────
  // This branch drew character by character from `x` rightwards whatever the
  // caller asked for, so `align: 'right'` silently became left-aligned and the
  // string ran off the edge — which is exactly how the story card's `w3.ride`
  // mark ended up clipped. Canvas has no letter-spacing, so the width has to be
  // measured before the first character is drawn and the origin moved back.
  const spacedWidth = [...s].reduce((w, ch) => w + ctx.measureText(ch).width + spacing, 0) - spacing
  let cx = align === 'right' ? x - spacedWidth
    : align === 'center' ? x - spacedWidth / 2
    : x
  // Per character the alignment must be left, or each glyph would be placed
  // against the same anchor and the string would stack on itself.
  ctx.textAlign = 'left'
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing }
  return spacedWidth
}

function wrap(ctx: CanvasRenderingContext2D, s: string, size: number, weight: string, maxW: number, family = FONT): string[] {
  ctx.font = `${weight} ${size}px ${family}`
  const words = s.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w } else cur = t
  }
  if (cur) lines.push(cur)
  return lines
}

/**
 * THE RIDR MARK, on a canvas.
 *
 * The footer of every exported card used to be a four-point `star` beside the
 * word "Ridr" — a generic sparkle standing in for a logo the app already has.
 * These cards are the one surface of this app that leaves it and gets posted in
 * public, so they are the last place that should be signed with a placeholder.
 *
 * This is the SAME geometry as `components/RidrMark.tsx`: one stroked path in a
 * 200×200 box, so the drawn mark and the rendered one cannot drift apart. It is
 * transcribed rather than imported because that component is JSX and this is a
 * 2D context; the path string is the shared source of truth.
 *
 * `cx`/`cy` are the mark's CENTRE, so it drops straight into the call sites the
 * star occupied, which were all centre-anchored too.
 */
const RIDR_PATH = 'M54 176v-136h50a36 36 0 0 1 0 72h-50m46 0c32 16 38 40 72 28'

function ridrMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  const box = r * 2
  const k = box / 200
  ctx.save()
  ctx.translate(cx - box / 2, cy - box / 2)
  ctx.scale(k, k)
  ctx.strokeStyle = color
  ctx.lineWidth = 13.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  try {
    ctx.stroke(new Path2D(RIDR_PATH))
  } catch {
    // A context without Path2D is not worth a broken export — the card simply
    // goes out unsigned rather than not at all.
  }
  ctx.restore()
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string) {
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = color; ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, Math.cos(a) * r, Math.sin(a) * r)
    ctx.quadraticCurveTo(Math.cos(a + 0.4) * r * 0.3, Math.sin(a + 0.4) * r * 0.3, 0, 0)
  }
  ctx.fill(); ctx.restore()
}

/**
 * A mark for one stat tile, drawn as a path because this is a canvas and an
 * icon font would be another thing to load and taint the export.
 *
 * WHY THEY EARN THEIR SPACE. The three tiles are three numbers in identical
 * boxes, and at poster scale — seen in a feed, thumbnailed — the labels under
 * them are the first thing to become unreadable. The glyph survives that: a
 * bolt reads as power and a clock as time long after "NORMALISIERT" has turned
 * to grey mush.
 *
 * Chosen from the LABEL rather than passed in, so a new stat gets a sensible
 * mark without every caller having to know this file exists. An unrecognised
 * label draws nothing, which is the honest fallback — a wrong icon is worse
 * than none.
 */
function statGlyph(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, s: number, color: string) {
  const l = label.toLowerCase()
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = Math.max(2, s * 0.11)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // SPECIFIC BEFORE GENERIC. `W/KG` would otherwise fall through to the bolt
  // and TSS to the default dot, and a row of tiles whose marks do not match
  // their numbers is worse than a row with no marks at all.
  if (/w\/kg/.test(l)) {
    // a bolt standing on a baseline: power, carried per kilo
    ctx.beginPath()
    ctx.moveTo(x + s * 0.54, y)
    ctx.lineTo(x + s * 0.24, y + s * 0.46)
    ctx.lineTo(x + s * 0.46, y + s * 0.46)
    ctx.lineTo(x + s * 0.38, y + s * 0.84)
    ctx.lineTo(x + s * 0.74, y + s * 0.36)
    ctx.lineTo(x + s * 0.50, y + s * 0.36)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + s * 0.12, y + s * 0.96); ctx.lineTo(x + s * 0.88, y + s * 0.96)
    ctx.stroke()
  } else if (/tss/.test(l)) {
    // three rising bars: load, stacked up over a ride
    const bw = s * 0.2
    ;[0.42, 0.66, 0.9].forEach((h, i) => {
      const bx = x + s * 0.1 + i * (bw + s * 0.11)
      ctx.beginPath()
      ctx.rect(bx, y + s * (1 - h), bw, s * h)
      ctx.fill()
    })
  } else if (/kilojoule|kj\b|energie/.test(l)) {
    // a flame: work turned into heat
    ctx.beginPath()
    ctx.moveTo(x + s * 0.5, y + s * 0.04)
    ctx.bezierCurveTo(x + s * 0.88, y + s * 0.4, x + s * 0.78, y + s * 0.98, x + s * 0.5, y + s * 0.98)
    ctx.bezierCurveTo(x + s * 0.22, y + s * 0.98, x + s * 0.12, y + s * 0.4, x + s * 0.5, y + s * 0.04)
    ctx.closePath()
    ctx.fill()
  } else if (/watt|leistung|normal|power|ftp/.test(l)) {
    // a bolt
    ctx.beginPath()
    ctx.moveTo(x + s * 0.56, y)
    ctx.lineTo(x + s * 0.24, y + s * 0.54)
    ctx.lineTo(x + s * 0.48, y + s * 0.54)
    ctx.lineTo(x + s * 0.40, y + s)
    ctx.lineTo(x + s * 0.76, y + s * 0.44)
    ctx.lineTo(x + s * 0.52, y + s * 0.44)
    ctx.closePath()
    ctx.fill()
  } else if (/stunde|zeit|dauer|time/.test(l)) {
    // a clock
    ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.42, 0, Math.PI * 2); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + s / 2, y + s * 0.26)
    ctx.lineTo(x + s / 2, y + s / 2)
    ctx.lineTo(x + s * 0.72, y + s * 0.6)
    ctx.stroke()
  } else if (/intensit|if\b|belastung/.test(l)) {
    // a gauge: an arc with a needle
    ctx.beginPath(); ctx.arc(x + s / 2, y + s * 0.66, s * 0.42, Math.PI, 0); ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + s / 2, y + s * 0.66)
    ctx.lineTo(x + s * 0.78, y + s * 0.36)
    ctx.stroke()
  } else if (/höhe|hoehe|hm|anstieg|climb/.test(l)) {
    // a peak
    ctx.beginPath()
    ctx.moveTo(x + s * 0.06, y + s * 0.82)
    ctx.lineTo(x + s * 0.40, y + s * 0.22)
    ctx.lineTo(x + s * 0.62, y + s * 0.56)
    ctx.lineTo(x + s * 0.74, y + s * 0.40)
    ctx.lineTo(x + s * 0.96, y + s * 0.82)
    ctx.closePath()
    ctx.stroke()
  } else if (/km|distanz|strecke|dist/.test(l)) {
    // a winding route with a start dot
    ctx.beginPath()
    ctx.moveTo(x + s * 0.1, y + s * 0.78)
    ctx.bezierCurveTo(x + s * 0.45, y + s * 0.78, x + s * 0.2, y + s * 0.24, x + s * 0.86, y + s * 0.24)
    ctx.stroke()
    ctx.beginPath(); ctx.arc(x + s * 0.1, y + s * 0.78, s * 0.11, 0, Math.PI * 2); ctx.fill()
  } else if (/herz|hf|puls|hr\b/.test(l)) {
    // a pulse line
    ctx.beginPath()
    ctx.moveTo(x, y + s * 0.6)
    ctx.lineTo(x + s * 0.26, y + s * 0.6)
    ctx.lineTo(x + s * 0.4, y + s * 0.28)
    ctx.lineTo(x + s * 0.56, y + s * 0.86)
    ctx.lineTo(x + s * 0.7, y + s * 0.6)
    ctx.lineTo(x + s, y + s * 0.6)
    ctx.stroke()
  }
  ctx.restore()
}

async function paint(
  ctx: CanvasRenderingContext2D,
  d: PosterData,
  avatarImg: HTMLImageElement | null,
  bikeImg: HTMLImageElement | null,
  sceneImg: HTMLImageElement | null,
) {
  const t = THEMES[d.angle]

  // ── THE PANEL IS MEASURED, THE HERO GETS WHAT IS LEFT ──────────────────
  // `heroH` was a fixed 56 % of the card and the panel below it was laid out
  // top-down and hoped to fit. It did, until the stat tiles grew by 12 px and
  // the kicker gained the 42 px it needed to stop being overprinted — and then
  // the footer fell off the bottom edge, on the finished export, silently.
  // Adding up what the panel actually needs and giving the hero the remainder
  // means the two can never disagree again, whatever a tile is worth tomorrow.
  const PANEL_TOP = 92          // kicker baseline below the hero
  const KICKER_TO_BIG = 138     // the 150 px figure's cap height, plus air
  const BIG_TO_SENTENCE = 70
  const SENTENCE_LINE = 52
  const SENTENCE_TO_BLOCKS = 34
  const BLOCKS_TO_FOOTER = 56
  const FOOTER_BOTTOM = 64      // below the footer baseline, to the card edge
  ctx.font = `600 40px ${FONT}`
  const sentenceLines = wrap(ctx, d.sentence, 40, '600', W - 128).length
  // Only the blocks this ride can actually fill: a chosen block with no data
  // behind it is dropped and the card closes up, rather than drawing an empty
  // box under a kicker.
  const usable = usableBlocks(d.blocks ?? [], d.blockData)
  // THE CARD IS A FIXED SIZE AND THE BLOCKS ARE NOT. Six of them ask for more
  // room than the poster has, and the first version simply let the panel run
  // past the bottom edge — the footer, and the last block with it, fell off a
  // finished export. So the room is worked out first and the choice is fitted
  // into it: blocks dropped from the END, because the rider tapped what they
  // care about first. Below the floor the hero yields instead, which is the
  // right trade between a shorter picture and a missing footer.
  // TWO FLOORS, AND THEY ARE NOT THE SAME NUMBER — which is what the first
  // version got wrong. `PREFERRED_HERO` is how much picture the card would
  // LIKE; `MIN_HERO` is the point below which the top stops being a picture at
  // all, and it is set by the one thing that must always fit up there: the
  // handle chip. Fitting the blocks against the PREFERRED floor left three big
  // blocks unable to fit and unable to be trimmed (three is the minimum), so
  // the panel silently ran off the bottom and took the footer with it — while
  // the comment beside it claimed the hero would yield, which it could not,
  // because it was already at the floor being tested against.
  //
  // Blocks are fitted against the HARD floor, so three heavy blocks are always
  // allowed and simply squeeze the picture to a band. That is a real card: a
  // rider who picks the trace, the zones and the peaks has said they want the
  // data, not the photograph.
  // ── THE PICTURE OUTRANKS THE BLOCKS ────────────────────────────────
  // The header is the machine standing in the world the ride's GPX resolved
  // to, and that is the reason the card is worth posting at all. So when there
  // IS a picture — a composed scene, the rider's own photograph, or the bike in
  // the app's own room — the hero's floor is a real stage and the blocks are
  // trimmed to fit around it. Squeezed to a strip the bike came back as a
  // thumbnail in a black band, which is the picture nobody would post.
  //
  // With nothing to show, the floor drops to the height of the handle chip and
  // the blocks take the card: a data-only card is a legitimate card, and a tall
  // empty stage above three blocks is not.
  const hasPicture = sceneImg != null || bikeImg != null
  const MIN_HERO = hasPicture ? Math.round(H * 0.34) : 150
  const PREFERRED_HERO = Math.round(H * (hasPicture ? 0.46 : 0.24))
  const chrome =
    PANEL_TOP + KICKER_TO_BIG + BIG_TO_SENTENCE +
    sentenceLines * SENTENCE_LINE + SENTENCE_TO_BLOCKS +
    BLOCKS_TO_FOOTER + FOOTER_BOTTOM
  // Fit against the preferred floor first, so a light set of blocks leaves a
  // proper picture; fall back to the hard floor only when the rider's choice
  // genuinely needs the room.
  const roomy = fitBlocks(usable, d.blockData, H - PREFERRED_HERO - chrome)
  const blocks = roomy.length === usable.length
    ? roomy
    : fitBlocks(usable, d.blockData, H - MIN_HERO - chrome)
  const panelH = chrome + blocksHeight(blocks, d.blockData)
  const heroH = Math.max(MIN_HERO, H - panelH)
  //: How far the hero image runs past its band so the fade has something to
  //: dissolve. Without it the photograph ends on a visible horizontal cut.
  const BLEED = 150

  // ── background ──
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H)

  // THE HERO IS CLIPPED TO ITS BAND, and it always should have been. Nothing
  // enforced it while the band was a fixed 56 % of the card and the scene was
  // roughly square — the overflow simply landed under the panel that was drawn
  // afterwards. Now that the blocks can squeeze the hero to a strip, an
  // unclipped square scene is drawn a thousand pixels tall over the whole card:
  // the kicker, the trace and the tiles all disappeared behind a bicycle.
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, W, heroH + BLEED)
  ctx.clip()

  if (sceneImg) {
    // THE RIDE'S OWN PICTURE, EDGE TO EDGE. Cover-cropped rather than fitted:
    // the scene is square and the hero band is not, and letterboxing it would
    // reproduce the exact fault this replaces — a photograph floating in a
    // rectangle instead of being the poster.
    //
    // DRAWN PAST THE BAND ON PURPOSE. It used to end exactly at `heroH`, and
    // the 220 px fade below it had nothing to fade FROM — so the photograph
    // stopped dead on a horizontal line, grass cut mid-blade, with the panel
    // starting underneath it. The image now runs `BLEED` px further down and
    // the fade dissolves it into the ground, so there is no edge to see.
    const target = heroH + BLEED
    const scale = Math.max(W / sceneImg.width, target / sceneImg.height)
    const sw = sceneImg.width * scale, sh = sceneImg.height * scale
    // Anchored to the TOP of the band rather than centred: the composed scene
    // stands its bike on a road in the lower half, and centring a tall crop
    // pushed that road under the fade.
    ctx.drawImage(sceneImg, (W - sw) / 2, 0, sw, sh)
  } else {
    // ── THE SAME ROOM THE APP STANDS THE BIKE IN ───────────────────────
    // This drew a painted sky and three ranges of mountains — a landscape the
    // rider had never been to, on the one picture they were about to post. It
    // also belonged to no part of the app: Today, the rides and the garage all
    // stand the machine in ONE studio, a near-black wall meeting a floor at a
    // low horizon (`W3TodayStage`, `T.heroFloor`, FLOOR at 76 %). A shared card
    // that invents its own world is a card from a different product.
    //
    // So the fallback is that room, drawn from the same four stops and the same
    // floor fraction, with the rider's own bike standing on the floor line. The
    // composed scene still wins when there is one — this is what a ride with no
    // GPS, or one whose scene has not been made yet, gets instead.
    const room = ctx.createLinearGradient(0, 0, 0, heroH)
    room.addColorStop(0, T.heroFloor[0])
    room.addColorStop(0.40, T.heroFloor[1])
    room.addColorStop(0.76, T.heroFloor[2])
    room.addColorStop(1, T.heroFloor[3])
    ctx.fillStyle = room
    ctx.fillRect(0, 0, W, heroH)

    // The pool of light the machine stands in, centred on the floor line.
    const floorY = heroH * 0.762
    const pool = ctx.createRadialGradient(W / 2, floorY, 20, W / 2, floorY, W * 0.62)
    pool.addColorStop(0, 'rgba(255,255,255,0.09)')
    pool.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = pool
    ctx.fillRect(0, 0, W, heroH)
  }

  // Over the DRAWN hero the route is the hero graphic, so it goes down before
  // the fade and gets softened by it like the mountains behind it.
  if (!sceneImg) {
    drawRoute(ctx, d.polyline, t, heroH,
      d.intensity != null ? intensityHue(d.intensity) : t.route, false)
  }

  // hero→panel fade. Long, and it runs INTO the bleed rather than stopping at
  // the band, so the photograph has image under every pixel of the gradient.
  // A short fade over a hard image edge is the edge with a gradient on top.
  // It reaches FULL ground exactly at `heroH`, and the bleed below is then
  // covered flat. The panel has to start on solid black — the first attempt ran
  // the gradient down through the bleed, which left the kicker and the big
  // number sitting on a half-visible photograph.
  const fadeTop = heroH - 340
  const fade = ctx.createLinearGradient(0, fadeTop, 0, heroH)
  fade.addColorStop(0, 'rgba(11,11,11,0)')
  fade.addColorStop(0.55, 'rgba(11,11,11,0.72)')
  fade.addColorStop(1, T.bg)
  ctx.fillStyle = fade; ctx.fillRect(0, fadeTop, W, heroH - fadeTop)
  ctx.fillStyle = T.bg; ctx.fillRect(0, heroH, W, BLEED)

  // Over a PHOTOGRAPH the route is a caption, and it goes down AFTER the fade —
  // drawn before it, the gradient washed the plate out to nothing and left a
  // dim orange scribble lying on the rear wheel, which is worse than the
  // problem it was moved to solve.
  if (sceneImg) {
    drawRoute(ctx, d.polyline, t, heroH,
      d.intensity != null ? intensityHue(d.intensity) : t.route, true)
  }

  // bike (with the rider) sitting on the route — only when no scene was
  // composed, because a scene already HAS the bike in it.
  if (bikeImg && !sceneImg) {
    // IT STANDS ON THE FLOOR LINE, like it does everywhere else in the app.
    // Centring the machine on 70 % of the band left it hovering above the
    // horizon the ground gradient draws at 76 % — the same defect
    // `W3TodayStage` documents fixing, reproduced here because this file drew
    // its own world and never had a floor to stand it on.
    // SIZED BY THE BAND, not only by the card. Scaling to 92 % of the width
    // put a 980 px-wide machine into a 150 px-tall hero — drawn from the floor
    // line upwards, the whole bicycle sat above the top edge and the card came
    // back with an empty black strip where the subject should be.
    const floorY = heroH * 0.762
    const ratio = bikeImg.height / bikeImg.width
    const maxW = Math.min(W * 0.92, 980)
    const maxH = floorY - 24            // from the floor line up to the top edge
    const bw = Math.min(maxW, maxH / ratio)
    const bh = bw * ratio
    const bx = (W - bw) / 2
    const by = floorY - bh

    // The contact shadow, on the floor rather than under the picture.
    ctx.save()
    ctx.globalAlpha = 0.5
    const sh = ctx.createRadialGradient(W / 2, floorY, 8, W / 2, floorY, bw * 0.42)
    sh.addColorStop(0, 'rgba(0,0,0,0.75)')
    sh.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sh
    ctx.fillRect(bx, floorY - 40, bw, 120)
    ctx.restore()

    ctx.drawImage(bikeImg, bx, by, bw, bh)
  }

  ctx.restore()   // end of the hero band's clip

  // avatar chip (top-left)
  const chipX = 44, chipY = 44, chipH = 92
  ctx.save()
  roundRect(ctx, chipX, chipY, 430, chipH, chipH / 2)
  ctx.fillStyle = 'rgba(11,11,11,0.55)'; ctx.fill()
  ctx.restore()
  const av = chipY + chipH / 2
  ctx.save()
  ctx.beginPath(); ctx.arc(chipX + 46 + 12, av, 34, 0, Math.PI * 2); ctx.closePath(); ctx.clip()
  if (avatarImg) ctx.drawImage(avatarImg, chipX + 24, av - 34, 68, 68)
  else { ctx.fillStyle = T.training; ctx.fillRect(chipX + 24, av - 34, 68, 68); ctx.fillStyle = T.bg; text(ctx, d.avatarInitial, chipX + 58, av + 12, 34, '700', T.bg, 0, 'center') }
  ctx.restore()
  text(ctx, d.handle, chipX + 108, av - 4, 30, '700', T.ink)
  text(ctx, d.club, chipX + 108, av + 26, 22, '600', 'rgba(255,255,255,0.7)')

  // sparkle (top-right)
  star(ctx, W - 80, 88, 30, t.acid)

  // ── panel ──
  let y = heroH + PANEL_TOP
  const px = 64
  // kicker
  star(ctx, px + 12, y - 14, 13, t.acid)
  text(ctx, d.kicker, px + 40, y, 26, '700', t.acid, 3)
  // 96 was less than the cap height of the 150 px figure that follows, so the
  // number was drawn THROUGH the kicker. Visible on the shipped card.
  y += KICKER_TO_BIG

  // big value + unit + delta
  // ── THE NUMBER IS THE REWARD, so it is lit rather than merely large. A soft
  //    acid bloom behind the figure, which costs nothing in a still image and
  //    is the difference between a receipt and a trophy. ──
  ctx.save()
  const glow = ctx.createRadialGradient(px + 180, y - 46, 10, px + 180, y - 46, 340)
  glow.addColorStop(0, 'rgba(191,255,60,0.18)')
  glow.addColorStop(1, 'rgba(191,255,60,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, y - 260, W, 380)
  ctx.restore()
  ctx.font = `700 150px ${FONT}`
  const bigW = text(ctx, d.bigValue, px, y, 150, '700', T.ink)
  if (d.bigUnit) text(ctx, d.bigUnit, px + bigW + 20, y, 46, '600', 'rgba(255,255,255,0.65)')
  if (d.delta) {
    const dw = ctx.measureText(d.delta).width + 96
    const dy = y - 78
    ctx.save()
    roundRect(ctx, W - px - dw, dy, dw, 64, 32)
    ctx.fillStyle = 'rgba(200,255,0,0.14)'; ctx.fill()
    ctx.restore()
    text(ctx, d.delta, W - px - dw + 34, dy + 44, 30, '700', t.acid)
  }
  y += BIG_TO_SENTENCE

  // sentence
  for (const line of wrap(ctx, d.sentence, 40, '600', W - px * 2)) {
    text(ctx, line, px, y, 40, '600', 'rgba(255,255,255,0.82)')
    y += SENTENCE_LINE
  }
  y += SENTENCE_TO_BLOCKS

  // ── what the rider chose ──
  y = paintBlocks(ctx, blocks, d.blockData, px, y, W - px * 2, statGlyph)
  y += BLOCKS_TO_FOOTER

  // footer
  text(ctx, d.footer, px, y, 26, '600', 'rgba(255,255,255,0.55)')
  ridrMark(ctx, W - px - 150, y - 8, 15, RIDR_LIME)
  text(ctx, 'Ridr', W - px - 128, y, 28, '700', T.ink)
}

/** Render the poster once. Retries without the avatar if a cross-origin avatar
 *  taints the canvas (so the export always succeeds). */
export async function renderSharePoster(d: PosterData): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }

  const bikeImg = d.bikeSrc ? await loadImage(d.bikeSrc).catch(() => null) : null
  const sceneImg = d.sceneSrc ? await loadImage(d.sceneSrc).catch(() => null) : null
  let avatarImg: HTMLImageElement | null = d.avatarUrl ? await loadImage(d.avatarUrl, 'anonymous').catch(() => null) : null

  const tryExport = async (): Promise<{ blob: Blob | null; dataUrl: string } | 'tainted'> => {
    ctx.clearRect(0, 0, W, H)
    await paint(ctx, d, avatarImg, bikeImg, sceneImg)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      return { blob, dataUrl }
    } catch {
      return 'tainted'
    }
  }

  let out = await tryExport()
  if (out === 'tainted') { avatarImg = null; out = await tryExport() }
  return out === 'tainted' ? { blob: null, dataUrl: '' } : out
}

/** True when the platform can share a PNG file via the native sheet. */
export function canShareImage(): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    const probe = new File([new Blob()], 'p.png', { type: 'image/png' })
    return navigator.canShare({ files: [probe] })
  } catch { return false }
}

/**
 * Hand the poster to the OS share sheet (which routes it to Instagram /
 * LinkedIn / WhatsApp / …). Falls back to a PNG download + copied caption on
 * browsers without file-share support. Returns how it was handled.
 */
/** The extension a blob's own type asks for. A file named `.png` that is really
 *  an mp4 is rejected by every app worth sharing to. */
function extensionFor(type: string): string {
  if (type.startsWith('video/mp4')) return 'mp4'
  if (type.startsWith('video/webm')) return 'webm'
  if (type.startsWith('image/jpeg')) return 'jpg'
  return 'png'
}

export async function sharePoster(blob: Blob | null, caption: string, filename = 'w3-ride.png'): Promise<'shared' | 'downloaded' | 'failed'> {
  if (!blob) return 'failed'
  // THE BLOB'S OWN TYPE DECIDES, not the default argument. This hardcoded
  // `image/png` and a `.png` name, which was harmless while every card was a
  // PNG and is not now: a moving card handed to the share sheet as a PNG is
  // refused by the receiving app, and the rider is told nothing.
  const type = blob.type || 'image/png'
  const ext = extensionFor(type)
  const named = filename.replace(/\.[a-z0-9]+$/i, '') + '.' + ext
  const file = new File([blob], named, { type })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: caption, title: 'Ridr' })
      return 'shared'
    } catch (err) {
      // user dismissed the sheet — not an error worth a fallback
      if ((err as Error)?.name === 'AbortError') return 'shared'
    }
  }
  downloadPoster(blob, named)
  try { if (navigator?.clipboard) await navigator.clipboard.writeText(caption) } catch { /* ignore */ }
  return 'downloaded'
}

/**
 * Last-resort share: no image at all (canvas failed / tainted). Uses the native
 * sheet with text when it exists, otherwise copies the caption + link. Never
 * throws; a cancelled sheet counts as shared.
 */
export async function shareTextOrCopy(text: string, url?: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(url ? { title: 'Ridr', text, url } : { title: 'Ridr', text })
      return 'shared'
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'shared'
    }
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(url ? `${text} ${url}` : text)
      return 'copied'
    }
  } catch { /* ignore */ }
  return 'failed'
}

export function downloadPoster(blob: Blob, filename = 'w3-ride.png') {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ────────────────────────────────────────────────────────────────────────────
 * "AVATAR UNLOCKED" card — the reveal, as a postable 3:4 bitmap.
 *
 * Same renderer discipline as the ride poster above: one canvas, one bitmap,
 * shared through the SAME `sharePoster` plumbing (native sheet → PNG download →
 * copied caption). What's shared is the CARD (rider + @handle + role/LVL + the
 * headline stat), never the raw avatar file. The avatar is a data: URL, so the
 * canvas stays clean — but `crossOrigin` is set defensively and a tainted or
 * missing image just drops the portrait instead of failing the export.
 * ──────────────────────────────────────────────────────────────────────────── */

const AW = 1080
const AH = 1440
const ACID = T.acid

export interface AvatarCardData {
  avatarUrl: string | null
  avatarInitial: string
  handle: string
  role: string
  level: number
  /** "4.812 km — 12 % um die Erde" — the one stat that carries the card. */
  headline: string
  stats: [PosterStat, PosterStat, PosterStat]
  footer: string
}

/**
 * The shareable reveal, rebuilt to the screen it comes from.
 *
 * THE OLD CARD HAD A SHADE ACROSS THE FACE, and it was structural rather than
 * stylistic: the cover was a 760 px rectangle in one tone, the portrait was
 * drawn past the bottom of it, and a 330 px gradient was laid over the overlap.
 * So the top half of the rider sat on one ground and the bottom half sat under
 * a wash, with a visible step across the chest. Below that, four hundred pixels
 * of empty black — the content stopped at sixty per cent of the card.
 *
 * ONE GROUND, ONE PORTRAIT, CONTENT DOCKED AT THE BOTTOM — the same shape the
 * reveal itself now has: the character fills the card, the handle rides on the
 * seam, three facts, a footer. Nothing floats over the face.
 */
function paintAvatarCard(ctx: CanvasRenderingContext2D, d: AvatarCardData, avatar: HTMLImageElement | null) {
  const px = 64
  const DOCK = 430          // where the copy begins; the portrait runs behind it

  // ── one ground for the whole card ──
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, AW, AH)

  // ── the portrait, full bleed ──
  if (avatar && avatar.width > 0 && avatar.height > 0) {
    const scale = Math.max(AW / avatar.width, (AH - DOCK + 220) / avatar.height)
    const dw = avatar.width * scale, dh = avatar.height * scale
    ctx.drawImage(avatar, (AW - dw) / 2, -(dh - (AH - DOCK + 220)) * 0.22, dw, dh)
  } else {
    ctx.save()
    ctx.beginPath(); ctx.arc(AW / 2, (AH - DOCK) / 2, 190, 0, Math.PI * 2); ctx.closePath()
    ctx.fillStyle = T.surface2; ctx.fill()
    ctx.restore()
    text(ctx, d.avatarInitial, AW / 2, (AH - DOCK) / 2 + 60, 170, '700', T.quiet, 0, 'center')
  }

  // The floor the copy stands on. One long gradient into the ground colour, so
  // there is no step anywhere on the portrait.
  const floor = ctx.createLinearGradient(0, AH - DOCK - 300, 0, AH - DOCK + 60)
  floor.addColorStop(0, 'rgba(11,11,11,0)')
  floor.addColorStop(0.6, 'rgba(11,11,11,0.82)')
  floor.addColorStop(1, T.bg)
  ctx.fillStyle = floor; ctx.fillRect(0, AH - DOCK - 300, AW, 360)
  ctx.fillStyle = T.bg; ctx.fillRect(0, AH - DOCK + 58, AW, DOCK)

  // ── the handle, on the seam ──
  const chipY = AH - DOCK - 6
  ctx.font = `800 40px ${FONT}`
  const chipW = ctx.measureText(d.handle).width + 132
  const chipH = 84, chipX = (AW - chipW) / 2
  roundRect(ctx, chipX, chipY - chipH / 2, chipW, chipH, chipH / 2)
  ctx.fillStyle = T.heroDock; ctx.fill()
  star(ctx, chipX + 46, chipY, 15, ACID)
  text(ctx, d.handle, chipX + 78, chipY + 14, 40, '800', T.ink)

  // role · LEVEL
  const roleY = chipY + 74
  ctx.font = `600 30px ${FONT}`
  const roleW = ctx.measureText(d.role).width
  const lvl = `LEVEL ${d.level}`
  ctx.font = `700 30px ${FONT}`
  const lvlW = ctx.measureText(lvl).width
  const rowW = roleW + 34 + lvlW
  text(ctx, d.role, (AW - rowW) / 2, roleY, 30, '600', T.mid)
  text(ctx, lvl, (AW - rowW) / 2 + roleW + 34, roleY, 30, '700', ACID)

  // ── three facts, in the reveal's own order and labels ──
  const gap = 20, tileW = (AW - px * 2 - gap * 2) / 3, tileH = 190
  const tileY = roleY + 54
  d.stats.forEach((s, i) => {
    const x = px + i * (tileW + gap)
    ctx.save()
    roundRect(ctx, x, tileY, tileW, tileH, 26)
    ctx.fillStyle = T.heroDock; ctx.fill()
    ctx.restore()
    text(ctx, s.v, x + 28, tileY + 92, 46, '700', s.v === '—' ? T.quiet : T.ink)
    text(ctx, s.l, x + 28, tileY + 142, 22, '700', 'rgba(255,255,255,0.45)', 1)
  })

  // ── footer ──
  const fy = AH - 68
  if (d.footer) text(ctx, d.footer, px, fy, 26, '600', 'rgba(255,255,255,0.55)')
  ridrMark(ctx, AW - px - 150, fy - 8, 15, RIDR_LIME)
  text(ctx, 'Ridr', AW - px - 128, fy, 28, '700', T.ink)
}

/** Render the "AVATAR UNLOCKED" card. Never throws: a missing or tainting
 *  avatar simply drops the portrait so the export still succeeds. */
export async function renderAvatarCard(d: AvatarCardData): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = AW; canvas.height = AH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }

  // data: URLs are same-origin, but crossOrigin is set defensively in case the
  // avatar is ever served from storage.
  let avatar: HTMLImageElement | null = d.avatarUrl ? await loadImage(d.avatarUrl, 'anonymous').catch(() => null) : null

  const tryExport = async (): Promise<{ blob: Blob | null; dataUrl: string } | 'tainted'> => {
    ctx.clearRect(0, 0, AW, AH)
    paintAvatarCard(ctx, d, avatar)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
      return { blob, dataUrl }
    } catch {
      return 'tainted'
    }
  }

  let out = await tryExport()
  if (out === 'tainted') { avatar = null; out = await tryExport() }
  return out === 'tainted' ? { blob: null, dataUrl: '' } : out
}


// ── The challenge poster ────────────────────────────────────────────────────

export interface ChallengeCardData {
  title: string
  /** "412 von 600" — what you have against what it takes. */
  value: string
  target: string
  unit: string
  pct: number
  /** One number per day of the month, oldest first. The strip is the point. */
  days: number[]
  /** 1-based index of today; ≤ 0 draws no marker. */
  todayIndex: number
  /** "4. von 63" — null when nobody else is in it. */
  standing: string | null
  /** "800 RIDECOIN" when it is already paid, else null. */
  earned: string | null
  handle: string
  footer: string
}

/**
 * What leaves the app is the same thing that was on screen.
 *
 * THE STRIP TRAVELS. A share card showing a percentage would be a card about
 * any rider's month; the strip of days is about THIS one — four huge days or
 * thirty steady ones, legible at a glance in a feed where nobody will read a
 * caption. It is the reason this card is worth posting, so it gets the middle
 * of the poster rather than a corner of it.
 *
 * The standing is stated as a fact and never as a boast: "4. von 63" is true
 * whether that is a podium or not, and a card that only prints wins is a card
 * nobody believes.
 */
function paintChallengeCard(ctx: CanvasRenderingContext2D, d: ChallengeCardData) {
  const px = 64
  // CONTENT DOCKS AT THE BOTTOM, and the strip takes the room in between. The
  // first version laid the facts out top-down and left an empty third under
  // them whenever a challenge had no payout yet — the same "content stopped at
  // sixty per cent" the avatar card was rebuilt to fix. Now the card fills
  // whether it carries one fact or three.
  const DOCK = 300

  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, AW, AH)

  const bloom = ctx.createRadialGradient(AW / 2, 520, 20, AW / 2, 520, 640)
  bloom.addColorStop(0, 'rgba(191,255,60,0.13)')
  bloom.addColorStop(1, 'rgba(191,255,60,0)')
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, AW, AH)

  text(ctx, 'CHALLENGE', px, 150, 26, '700', ACID, 6)
  text(ctx, d.title, px, 246, 76, '800', T.ink, -1)

  text(ctx, d.value, px, 470, 200, '800', T.ink, -6)
  const vw = ctx.measureText(d.value).width
  text(ctx, d.unit, px + vw + 22, 470, 46, '700', 'rgba(255,255,255,0.45)')
  text(ctx, `von ${d.target} ${d.unit}`, px, 540, 32, '600', 'rgba(255,255,255,0.55)')

  // ── the month, given the whole middle of the card ──
  const sx = px, sw = AW - px * 2
  const sTop = 640
  const sh = AH - DOCK - 90 - sTop
  const peak = Math.max(...d.days, 0)
  const n = Math.max(d.days.length, 1)
  const gap = 6
  const cw = (sw - gap * (n - 1)) / n
  d.days.forEach((v, i) => {
    const x = sx + i * (cw + gap)
    const isFuture = d.todayIndex > 0 && i + 1 > d.todayIndex
    const h = v > 0 ? Math.max(10, (peak > 0 ? v / peak : 0) * sh) : 7
    ctx.fillStyle = v > 0 ? ACID : isFuture ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.16)'
    roundRect(ctx, x, sTop + sh - h, cw, h, Math.min(6, cw / 2))
    ctx.fill()
  })
  const moved = d.days.filter((v) => v > 0).length
  text(ctx, `${moved} VON ${d.days.length} TAGEN HABEN GEZÄHLT`, px, sTop + sh + 52, 26, '700',
    'rgba(255,255,255,0.45)', 3)

  // ── the facts, docked, laid out side by side so one or two both fill ──
  const fy = AH - DOCK + 96
  const facts: { v: string; l: string; acid?: boolean }[] = []
  if (d.standing) facts.push({ v: d.standing, l: 'IM FELD' })
  if (d.earned) facts.push({ v: d.earned, l: 'AUSGEZAHLT', acid: true })
  if (facts.length === 0) facts.push({ v: `${d.pct} %`, l: 'GESCHAFFT' })
  facts.forEach((f, i) => {
    const x = px + i * ((AW - px * 2) / 2)
    text(ctx, f.v, x, fy, 54, '800', f.acid ? ACID : T.ink, -1)
    text(ctx, f.l, x, fy + 46, 24, '700', 'rgba(255,255,255,0.45)', 3)
  })

  const foot = AH - 68
  text(ctx, d.handle, px, foot, 28, '700', 'rgba(255,255,255,0.55)')
  ridrMark(ctx, AW - px - 150, foot - 8, 15, RIDR_LIME)
  text(ctx, 'Ridr', AW - px - 128, foot, 28, '700', T.ink)
}

/** Render the challenge poster. Pure canvas — no images to taint it, so unlike
 *  the ride poster there is no fallback pass to run. */
export async function renderChallengeCard(d: ChallengeCardData): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = AW; canvas.height = AH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }
  paintChallengeCard(ctx, d)
  try {
    const dataUrl = canvas.toDataURL('image/png')
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
    return { blob, dataUrl }
  } catch {
    return { blob: null, dataUrl: '' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE STORY CARD — pen frame `sYlFV`, 1080 × 1920.
//
// A DIFFERENT OBJECT FROM THE POSTER ABOVE, on purpose. That card is the app's
// own artefact: near-black, its own scenery, the numbers arranged in blocks the
// rider picked. This one is a photograph the rider took, with the ride written
// over it — the format Instagram actually shows full-bleed, and the one people
// post. Sharing them through the same painter would mean one of the two always
// being the wrong shape.
//
// THE PHOTO IS THE CARD. Everything drawn on top is either a chip on glass or
// type on a scrim, and the scrim is a gradient rather than a flat wash so the
// middle of the picture — where a rider's face or a bike usually is — stays
// legible instead of being fogged to make room for text that sits at the edges.
// ─────────────────────────────────────────────────────────────────────────────

const SW = 1080
const SH = 1920

// ─────────────────────────────────────────────────────────────────────────────
// WHERE A STORY IS ACTUALLY ALLOWED TO PUT THINGS.
//
// Instagram draws its own furniture over this canvas: the profile row and the
// close/menu buttons across the top, the reply bar across the bottom. A card
// laid out to the frame edges puts its handle behind Instagram's avatar and its
// footer behind "Nachricht senden" — which is exactly what this one did. Every
// number below is content-inset, not canvas-inset.
//
// 250 / 370 are the figures the pen's own spec frame carries — `XLPb0`,
// "W3 · STORY SPEC · Safe Zones (1080×1920)", which labels the two red bands
// "250 PX · IG HEADER, AVATAR, MENÜ" and "370 PX · CAPTION, ANTWORT-LEISTE,
// LINK-STICKER". The bottom is larger because the reply bar is taller than the
// header. Anything that must be READ lives between them.
//
// The bottom was 310 here and the spec says 370: sixty pixels of every card's
// footer were sitting under Instagram's reply bar. The spec frame wins.
const SAFE_TOP = 250
const SAFE_BOTTOM = 370

// THE SIDE MARGIN IS AN EDITORIAL DECISION, not a safety one — and the pen
// makes it: `XLPb0` draws its margin guides at x=24 and x=335 on a 360-wide
// artboard, which is 72 and 1005 at 1080. Every card in the family sets its
// type against that column (`D1SQI`, `BMzgQ`, `pi5Hm` all start at x=24), so a
// different figure here is not a taste difference, it is the cards not matching
// their own drawings. This was 96 and every element on all three was inset 24px
// too far.
const MX = 72

/** The last baseline that will not sit under Instagram's reply bar. */
const CONTENT_BOTTOM = SH - SAFE_BOTTOM

/** Usable width between the margins. */
const CW = SW - MX * 2

/** The safe area, exported so it can be pinned by a test rather than trusted —
 *  a card that has left the app cannot re-lay itself out when it turns out the
 *  reply bar is sitting on its footer. */
export const STORY_SAFE = {
  width: SW, height: SH,
  top: SAFE_TOP, bottom: SAFE_BOTTOM, side: MX,
  contentBottom: CONTENT_BOTTOM,
} as const

export interface StoryStat { v: string; l: string }

/**
 * FOUR WAYS TO SAY THE SAME RIDE, and each is defined by what it DROPS.
 *
 * Strava's share is one layout with everything on it — a photo, four stats, a
 * map, a badge — and it looks the same for a 20 km commute as for an alpine
 * epic. A rider posting a picture of a mountain does not want four numbers
 * printed across it; a rider posting a personal best does not want a landscape
 * behind it. So the choice is the design, and there are only four because a
 * fifth would be a variation rather than a different sentence:
 *
 *   `full`   — the photograph, the coach's line, the number, two stats, the
 *              strip. The whole card (pen `sYlFV`). Nothing is missing, which
 *              is exactly why it is not always the right one.
 *   `figure` — the photograph and ONE number, enormous. No sentence, no stats,
 *              no strip. The most confident thing a rider can post, and the one
 *              Strava cannot bring itself to make because it always adds a row.
 *   `line`   — the coach's sentence alone, two weights, and NO NUMBERS AT ALL.
 *              A ride as language. For the day that was about how it felt.
 *   `trace`  — the route as a single acid line on the ground colour. No photo,
 *              no map tiles, no type but the mark. The shape of where you went,
 *              which for some rides is the only thing worth showing.
 *
 * All four keep the handle, the mark and the ground; that is what makes them a
 * family rather than four cards. Everything else is the rider's to spend.
 */
export type StoryLayout = 'full' | 'silent' | 'trace' | 'headline' | 'viewfinder' | 'effort'

/**
 * THE FIVE THINGS A RIDER MAY REWRITE — the card's LANGUAGE, never its numbers.
 *
 * A share sheet where you can retype the wattage is a lie generator, which is
 * why nobody trusts a screenshot of a training app. What is the rider's is what
 * the route is called, what the day was, and the sentence made about it.
 */
export type StoryField = 'routeName' | 'dateline' | 'lead' | 'emphasis' | 'ticker'

/** Where one editable word ended up, in 1080x1920 canvas space. */
export interface StoryTextZone { field: StoryField; x: number; y: number; w: number; h: number }

/**
 * A tap target smaller than this is not reachable with a thumb, and an EMPTY
 * field measures zero — the one a rider most needs to tap. In canvas units on
 * a 1080-wide card, 96 is about 31 CSS px at a 360-wide preview.
 */
const MIN_ZONE_H = 96

/**
 * Stop the minimum from eating the next word.
 *
 * `MIN_ZONE_H` exists because an empty field measures nothing and is the one a
 * rider most needs to tap. But applied blindly it grows a short zone straight
 * into the one below it: on the Laufband card the dateline is 40 tall at y=114
 * and the headline starts at y=171, so a 96 minimum put 39px of dateline target
 * on top of the headline — tapping the big word opened the little one's
 * keyboard, or would have if the paint order had been the other way round.
 *
 * A zone may take the space up to its neighbour and not one pixel more. It
 * still never shrinks below what it actually drew.
 */
function resolveZones(zones: StoryTextZone[]): StoryTextZone[] {
  const byTop = [...zones].sort((a, b) => a.y - b.y)
  return byTop.map((z, i) => {
    const next = byTop[i + 1]
    if (!next) return z
    const room = next.y - z.y
    return room > 0 && z.h > room ? { ...z, h: room } : z
  })
}

export interface StoryData {
  /** Which of the five. Defaults to `full`. */
  layout?: StoryLayout
  /** "RHEINSCHLEIFE" — the route's name, for the broadsheet and the viewfinder. */
  routeName?: string
  /** "AUSFAHRT NR. 1284 · 24.08.2026" — the broadsheet's dateline. */
  dateline?: string
  /** The ticker's second line: "— SCHNELLSTE SEIT MAI — NEUE BESTZEIT". */
  ticker?: string
  /** Three labelled readings for the viewfinder and the trace card. */
  readings?: { v: string; l: string }[]
  /**
   * Paint the overlay ALONE, on transparency — no ground, no photograph, no
   * scrims. What comes out is a sticker the rider drops onto their own story in
   * Instagram, where they can move and scale it, instead of a finished picture
   * with our composition baked into it. See `renderStoryOverlay`.
   */
  transparent?: boolean
  /** The card's accent. Defaults to the app's acid. One colour, everywhere the
   *  card is loud — the emphasis word, the unit, the strip, the ticker band,
   *  the viewfinder brackets, the route line. Changing it changes all of them,
   *  which is the whole point: a rider picks a colour, not six. */
  accent?: string
  /**
   * WHERE THE LAUFBAND HAS RUN TO, 0–1 — one full repeat of the ticker string.
   *
   * A PNG cannot move, so the exported still is one frame of a band that is
   * moving everywhere else it is shown: the preview scrolls it in the DOM
   * (`W3LaufbandBands`) and the video burn advances it per frame. Keeping the
   * offset as data rather than as a CSS-only trick is what makes those three
   * agree — a preview that scrolls a band the export does not have is a preview
   * of a different card.
   */
  phase?: number
  /** The ride's track, for `trace`. Null falls back to the strip. */
  polyline?: [number, number][] | null
  handle: string
  /** "RIDR ANALYSE" — the chip that says where the numbers came from. */
  badge: string
  /** The coach's line, already split. `emphasis` goes acid. */
  lead: string
  emphasis: string
  bigValue: string
  bigUnit: string
  /** Two, beside the big one. Three numbers is a card; six is a spreadsheet. */
  stats: [StoryStat, StoryStat]
  /** 0–1 per bar — the ride's own shape. Empty draws no strip. */
  series: number[]
  footer: string
  /** The rider's photograph. Without one the card falls back to the ground
   *  colour and the type carries it alone — never invented scenery. */
  photo: string | null
}

function paintStoryTrace(ctx: CanvasRenderingContext2D, pts: [number, number][], accent: string) {
  // The route, drawn as ONE line and nothing else. No tiles, no north arrow, no
  // start pin: a rider recognises their own road from its shape, and every
  // other mark on a map card is furniture.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const [lat, lng] of pts) {
    minX = Math.min(minX, lng); maxX = Math.max(maxX, lng)
    minY = Math.min(minY, lat); maxY = Math.max(maxY, lat)
  }
  const spanX = Math.max(1e-6, maxX - minX)
  const spanY = Math.max(1e-6, maxY - minY)
  // ── WHERE THE TRACE SITS, AND WHY NOT IN THE MIDDLE ────────────────────
  // It was centred on the frame, which put it straight across the rider's face
  // on every portrait — the one part of a photograph nobody wants a line drawn
  // over. The card's own scrim already darkens the lower third for the caption,
  // and that is where a route can be read without ruining the picture. Smaller
  // too: at `SW - 260` it filled the frame edge to edge and competed with the
  // photo instead of annotating it.
  const box = SW - 420
  const scale = Math.min(box / spanX, box / spanY)
  const ox = SW / 2 - (spanX * scale) / 2
  const oy = SH * 0.60 - (spanY * scale) / 2

  ctx.beginPath()
  pts.forEach(([lat, lng], i) => {
    const x = ox + (lng - minX) * scale
    const y = oy + (maxY - lat) * scale
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  })
  ctx.strokeStyle = accent
  ctx.lineWidth = 10
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // Where it started. One dot, because a rider reading their own loop wants to
  // know which way round it went, and nothing else on a map card earns its ink.
  const [lat0, lng0] = pts[0]
  ctx.beginPath()
  ctx.arc(ox + (lng0 - minX) * scale, oy + (maxY - lat0) * scale, 16, 0, Math.PI * 2)
  ctx.fillStyle = accent
  ctx.fill()
}

/**
 * What the card is painted OVER. A still or a frame of video — the overlay does
 * not care which, and keeping it ignorant is what lets the same painter draw
 * both the poster frame and every frame of a moving card.
 *
 * `w`/`h` are passed rather than read off the source because a video element
 * carries its size on `videoWidth`/`videoHeight`, and an image on `width`.
 */
/**
 * WHAT THE TWO BANDS SAY — and the ONE place that decides it.
 *
 * The exported PNG paints these on a canvas and the preview scrolls them as
 * DOM, which is two renderers for one strip of tape. Building the string twice
 * is how a preview ends up advertising a band the export does not have, so it
 * is built once here and both ask for it.
 *
 * `figures` is the ride as numbers, `verdicts` is the ride as claims. Both end
 * with the separator so a repeat reads as one continuous belt rather than as a
 * sentence that starts again.
 */
export function laufbandStrings(d: StoryData): { figures: string; verdicts: string } {
  const SEP = ' — '
  const figures = [
    `${d.bigValue} ${d.bigUnit.toUpperCase()}`,
    // A label is printed only when it is a UNIT ("HM", "KM"); "BEWEGTE ZEIT"
    // after a clock reading is the band explaining itself, which is exactly the
    // register a ticker has to stay out of.
    ...d.stats.map((x) => (x.l.length <= 3 ? `${x.v} ${x.l.toUpperCase()}` : x.v)),
    ...(d.readings ?? []).map((r) => r.v.toUpperCase()),
  ].join(SEP) + SEP
  const verdicts = ((d.ticker ?? '').replace(/^[\s—–-]+/, '').toUpperCase()
    || (d.routeName ?? '').toUpperCase()) + SEP
  return { figures, verdicts }
}

interface CardSource { src: CanvasImageSource; w: number; h: number }

function paintStoryCard(
  ctx: CanvasRenderingContext2D, d: StoryData, photo: CardSource | null,
  sink?: StoryTextZone[],
) {
  const layout = d.layout ?? 'full'
  /**
   * THE RENDERER REPORTS ITS OWN GEOMETRY.
   *
   * The editor draws invisible tap targets over the finished bitmap so a rider
   * can touch a word instead of hunting for its field in a list below. Those
   * rectangles could have been a table next to this file — and a table is a
   * second copy of every coordinate below, which goes stale the first time a
   * layout is nudged and fails silently, because a tap target that has drifted
   * looks exactly like one that has not.
   *
   * So the paint pass emits them. If the type moved, the target moved with it.
   */
  const zone = (field: StoryField, x: number, y: number, w: number, h: number) => {
    sink?.push({ field, x, y, w, h: Math.max(MIN_ZONE_H, h) })
  }
  const mono = "'JetBrains Mono', ui-monospace, monospace"
  const accent = d.accent || CARD.acid
  const bare = d.transparent === true
  if (!bare) {
    ctx.fillStyle = CARD.bg
    ctx.fillRect(0, 0, SW, SH)
  } else {
    // A sticker lands on a background we have never seen — a bright sky, a
    // white wall — so the type carries its own shadow instead of a scrim. A
    // scrim on transparency is just a grey rectangle sitting on the story.
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 3
  }

  // ── The photograph, FULL BLEED on every layout.
  //
  // The Laufband and the HUD used to letterbox it — a black bar above and
  // below, the picture inset into a window. Neither pen frame does that:
  // `D1SQI` and `BMzgQ` both put `Foto` at 0,0,360,640, edge to edge, and carry
  // their furniture ON the photograph with a scrim between. The letterbox was
  // this file's invention and it is the single biggest reason the cards did not
  // look like their drawings.
  const inset = { y: 0, h: SH }
  if (photo) {
    const scale = Math.max(SW / photo.w, inset.h / photo.h)
    const w = photo.w * scale
    const h = photo.h * scale
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, inset.y, SW, inset.h)
    ctx.clip()
    ctx.drawImage(photo.src, (SW - w) / 2, inset.y + (inset.h - h) / 2, w, h)
    ctx.restore()
  }

  // The footer sits ON the bottom safe line, not 74px from the canvas edge —
  // where it used to be, it was behind Instagram's reply bar on every post.
  const markAndFooter = (footerColor = 'rgba(255,255,255,0.5)') => {
    text(ctx, d.footer, MX, CONTENT_BOTTOM, 24, '600', footerColor, 0.6)
    text(ctx, 'w3.ride', SW - MX, CONTENT_BOTTOM, 24, '700', accent, 0.6, 'right')
  }

  const strip = (top: number) => {
    if (d.series.length === 0) return
    const bars = d.series.slice(0, 48)
    const gap = 6
    const bw = (CW - gap * (bars.length - 1)) / bars.length
    for (let i = 0; i < bars.length; i++) {
      const hgt = Math.max(4, Math.min(1, bars[i]) * 74)
      // The quiet bars are the accent at low alpha, so a changed accent does not
      // leave a strip of the old one behind it.
      ctx.fillStyle = bars[i] >= 0.92 ? accent : accent + '6B'
      roundRect(ctx, MX + i * (bw + gap), top + (74 - hgt), bw, hgt, 3)
      ctx.fill()
    }
  }

  const chips = () => {
    const chip = (label: string, x: number, align: CanvasTextAlign, lit: boolean) => {
      ctx.textAlign = 'left'
      ctx.font = `700 30px ${FONT}`
      // Clamped: a font that has not finished loading measures wider, and a card
      // that has left the app cannot re-lay itself out.
      // MEASURED THE WAY IT WILL BE DRAWN. The label is set with 1.2 of letter
      // spacing, and `measureText` knows nothing about that — so the pill was
      // sized to the unspaced string and every longer label ("RIDR ANALYSE") ran
      // out through its own right edge. Canvas has no letter-spacing metric, so
      // the spaced width has to be summed the same way `text()` will lay it.
      const spaced = [...label].reduce((acc, ch) => acc + ctx.measureText(ch).width + 1.2, 0) - 1.2
      const w = Math.min(spaced + 78, CW)
      const left = Math.max(MX, Math.min(align === 'right' ? x - w : x, SW - MX - w))
      ctx.fillStyle = lit ? accent : 'rgba(12,12,12,0.62)'
      roundRect(ctx, left, SAFE_TOP, w, 68, 34)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(left + 34, SAFE_TOP + 34, 9, 0, Math.PI * 2)
      ctx.fillStyle = lit ? CARD.bg : accent
      ctx.fill()
      text(ctx, label, left + 54, SAFE_TOP + 45, 30, '700', lit ? CARD.bg : CARD.ink, 1.2)
    }
    chip(d.handle, MX, 'left', false)
    chip(d.badge, SW - MX, 'right', true)
  }

  // ── THE PEN'S OWN SCRIM ────────────────────────────────────────────────
  // Every card washes its photograph, and none of them washes it the same way:
  // the Laufband darkens top AND bottom because it carries type at both ends,
  // the HUD is nearly even because its furniture is a grid, the Effort-Kurve is
  // heavy at the top and almost clear at the foot because its sentence is up
  // there and its chart draws its own contrast. So the stops are an argument
  // about that picture, not a shared "dark gradient", and they are transcribed
  // per card. `rgba(5,6,8,…)` is the pen's own scrim colour — a hair colder
  // than the ground, which is what keeps it from reading as a grey panel.
  const vscrim = (stops: [number, number][]) => {
    const g = ctx.createLinearGradient(0, 0, 0, SH)
    for (const [pos, a] of stops) g.addColorStop(pos, `rgba(5,6,8,${a})`)
    ctx.fillStyle = g
    ctx.fillRect(0, 0, SW, SH)
  }

  /**
   * ONE RUNNING BAND — ground, then the string repeated across it, clipped.
   *
   * The repeat length is measured THE WAY IT WILL BE DRAWN. Canvas has no
   * letter-spacing metric, so a length taken from `measureText` alone is short
   * by one `ls` per character, and copies laid at that pitch overlap a little
   * more with every repeat — invisible in a still, and a band that visibly
   * eats itself after four seconds of scrolling.
   */
  const laufband = (top: number, h: number, band: string, ink: string, s: string, size: number, ls: number, ty: number, x0: number) => {
    ctx.save()
    ctx.beginPath(); ctx.rect(0, top, SW, h); ctx.clip()
    ctx.fillStyle = band
    ctx.fillRect(0, top, SW, h)
    ctx.font = `700 ${size}px ${NARROW}`
    const unit = [...s].reduce((w, ch) => w + ctx.measureText(ch).width + ls, 0)
    if (unit > 1) {
      const ph = (((d.phase ?? 0) % 1) + 1) % 1
      let x = x0 - ph * unit
      while (x > 0) x -= unit
      for (; x < SW; x += unit) text(ctx, s, x, ty, size, '700', ink, ls, 'left', NARROW, 'top')
    }
    ctx.restore()
  }

  // ── M3 · LAUFBAND (pen `D1SQI`) ────────────────────────────────────────
  // A dateline, the route's name set as one enormous condensed line, the
  // photograph edge to edge behind both — and then the two bands: the numbers
  // in black on acid, the verdicts in acid on black, each running off both
  // edges, because a ticker that fits is a caption.
  //
  // EVERY FIGURE HERE IS `D1SQI` AT ×3 — the pen draws the 1080×1920 story on a
  // 360×640 artboard. They are written as literals rather than derived from
  // SAFE_TOP/CONTENT_BOTTOM on purpose: this card is a transcription, and a
  // transcription that recomputes its own coordinates is a redesign. What the
  // old version had instead — a letterboxed photo, a 128px headline measured
  // against the wrong margin, one band, and a bar rule under it — is why the
  // screen did not look like the drawing.
  if (layout === 'headline') {
    if (!bare) vscrim([[0, 0.702], [0.28, 0.439], [0.55, 0.38], [0.82, 0.58], [1, 0.722]])

    text(ctx, (d.dateline ?? d.footer).toUpperCase(), MX, 114, 28.5, '700', 'rgba(255,255,255,0.65)', 3.9, 'left', FONT, 'top')
    zone('dateline', MX, 114, CW, 40)

    // 138px is the pen's size, not a starting guess: it shrinks only when a
    // route name is longer than "RHEINSCHLEIFE", which is the one thing a
    // fixed transcription cannot survive.
    const name = (d.routeName ?? '').toUpperCase()
    let size = 138
    ctx.font = `700 ${size}px ${NARROW}`
    while (ctx.measureText(name).width > CW && size > 60) {
      size -= 4
      ctx.font = `700 ${size}px ${NARROW}`
    }
    text(ctx, name, MX, 171, size, '700', CARD.ink, -1.5, 'left', NARROW, 'top')
    zone('routeName', MX, 171, CW, size * 1.15)

    // THE TWO BANDS: acid at 1596 (144 high), ink at 1740 (108 high).
    //
    // Both are drawn FULL BLEED. The pen's ink band sits at x=-14 on a 360
    // artboard, which would leave a 42px slot of photograph at its right edge —
    // that is a frame that got dragged, not a design: the acid band above it
    // starts at 0, and a ticker with a gap at one end is a rectangle. The text
    // offsets inside them ARE kept (-42 and -288), because those are what makes
    // the two bands run out of step with each other.
    const { figures, verdicts } = laufbandStrings(d)
    laufband(1596, 144, accent, CARD.bg, figures, 72, 1.2, 1629, -42)
    laufband(1740, 108, CARD.bg, accent, verdicts, 51, 2.4, 1767, -288)
    zone('ticker', 0, 1740, SW, 108)
    return
  }

  // ── M1 · TELEMETRIE-HUD (pen `BMzgQ`) ──────────────────────────────────
  // The card as an instrument: a measuring grid, four corner ticks, a recording
  // row, and every number set in the monospace the app uses for telemetry. It
  // is the opposite pitch to the Laufband — that one shouts a verdict, this one
  // claims not to have an opinion.
  if (layout === 'viewfinder') {
    if (!bare) vscrim([[0, 0.749], [0.24, 0.478], [0.5, 0.259], [0.78, 0.322], [1, 0.58]])

    // The grid: four verticals, three horizontals, 7% white. Furniture that
    // says "instrument" without ever being mistaken for data.
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    for (const x of [72, 420, 732, 1005]) ctx.fillRect(x, 288, 3, 1248)
    for (const y of [624, 1200, 1533]) ctx.fillRect(72, y, 936, 3)

    // Four corner ticks, two bars each, straight off the pen.
    ctx.fillStyle = accent
    for (const [x, y, w, h] of [
      [66, 36, 6, 42], [66, 36, 42, 6],
      [999, 36, 6, 42], [960, 36, 42, 6],
      [72, 1803, 6, 42], [72, 1842, 42, 6],
      [1005, 1803, 6, 42], [966, 1842, 42, 6],
    ] as const) ctx.fillRect(x, y, w, h)

    ctx.beginPath()
    ctx.arc(103.5, 76, 10.5, 0, Math.PI * 2)
    ctx.fillStyle = CARD.bad
    ctx.fill()
    text(ctx, `${d.footer.split(' · ')[0]}  ${(d.routeName ?? '').toUpperCase()}`, 132, 60, 27, '500', 'rgba(255,255,255,0.80)', 1.2, 'left', mono, 'top')
    zone('routeName', 132, 52, SW - 132 - MX, 44)

    // The hero: the number at 234px with its unit set small, bottom-aligned and
    // in the accent — the one loud thing on a card that is pretending to be a
    // readout.
    ctx.font = `700 234px ${ARCHIVO}`
    const hv = ctx.measureText(d.bigValue).width
    text(ctx, d.bigValue, 87, 1203, 234, '700', CARD.ink, -9, 'left', ARCHIVO, 'top')
    text(ctx, d.bigUnit.toUpperCase(), 87 + hv + 21, 1366.5, 36, '700', accent, 3, 'left', mono, 'top')
    text(ctx, [...d.stats.map((x) => x.v), d.dateline ?? ''].filter(Boolean).join('  //  '), 96, 1464, 28.5, '500', 'rgba(255,255,255,0.65)', 1.8, 'left', mono, 'top')
    zone('dateline', 96, 1456, CW, 44)

    // Three labelled cells on the pen's own column stops. Not evenly divided —
    // 96 / 444 / 756 is a monospace grid, and evenly-divided thirds would put
    // them between its lines.
      ;(d.readings ?? []).slice(0, 3).forEach((r, i) => {
      const cx = [96, 444, 756][i]
      text(ctx, r.l.toUpperCase(), cx, 1551, 24, '500', 'rgba(255,255,255,0.48)', 3, 'left', mono, 'top')
      text(ctx, r.v, cx, 1597.8, 45, '700', CARD.ink, -0.9, 'left', mono, 'top')
    })

    // The ride's own shape, 48 bars. The pen draws a fixture waveform here; the
    // card draws the ride, because a HUD with an invented trace on it is the
    // one thing this layout cannot afford to be.
    if (d.series.length > 0) {
      const n = 48
      const gap = 4.5
      const bw = (936 - gap * (n - 1)) / n
      for (let i = 0; i < n; i++) {
        const v = Math.max(0, Math.min(1, d.series[Math.floor((i / n) * d.series.length)] ?? 0))
        const h = Math.max(9, 24 + v * 96)
        ctx.globalAlpha = 0.28 + v * 0.62
        ctx.fillStyle = accent
        ctx.fillRect(72 + i * (bw + gap), 1842 - h, bw, h)
      }
      ctx.globalAlpha = 1
    }
    return
  }

  // ── K3 · EFFORT-KURVE (pen `pi5Hm`) ────────────────────────────────────
  // The only layout that leads with TYPE: a kicker, the sentence set large at
  // the top, the photograph beneath it, and at the foot four readings over the
  // effort drawn as an area with the threshold ruled across it.
  //
  // It is also the layout that proves the accent is a control and not a
  // constant — the pen draws this one in orange, because a card about time
  // above threshold is not the same statement as a card about a personal best,
  // and the colour is how a rider says which one they are making.
  if (layout === 'effort') {
    if (!bare) vscrim([[0, 0.839], [0.28, 0.78], [0.5, 0.678], [0.72, 0.38], [1, 0.278]])

    text(ctx, (d.dateline ?? d.footer).toUpperCase(), MX, 87, 30, '700', 'rgba(255,255,255,0.70)', 3.6, 'left', FONT, 'top')
    zone('dateline', MX, 80, CW, 44)
    let ey = 153
    const leadTop = ey
    for (const line of wrap(ctx, d.lead, 114, '700', CW, ARCHIVO)) {
      text(ctx, line, MX, ey, 114, '700', CARD.ink, -3.6, 'left', ARCHIVO, 'top'); ey += 116.28
    }
    zone('lead', MX, leadTop, CW, ey - leadTop)
    ey += 30
    const emphTop = ey
    for (const line of wrap(ctx, d.emphasis, 114, '700', CW, ARCHIVO)) {
      text(ctx, line, MX, ey, 114, '700', accent, -3.6, 'left', ARCHIVO, 'top'); ey += 116.28
    }
    zone('emphasis', MX, emphTop, CW, ey - emphTop)

    // ── THE CHART, 1530 DOWN, FULL BLEED ────────────────────────────────
    // An area and not bars: this is a shape over time, and bars count things.
    // The threshold is ruled across the whole width at 1704 so the area reads
    // as time SPENT above a line rather than as a silhouette.
    if (d.series.length > 1) {
      const pts2 = d.series.slice(0, 96)
      const step = SW / (pts2.length - 1)
      const base = 1920
      const at = (v: number) => 1920 - 60 - Math.max(0, Math.min(1, v)) * 330
      ctx.beginPath()
      ctx.moveTo(0, base)
      pts2.forEach((v, i) => ctx.lineTo(i * step, at(v)))
      ctx.lineTo(SW, base)
      ctx.closePath()
      ctx.fillStyle = accent + '38'
      ctx.fill()
      ctx.fillStyle = accent + '8C'
      ctx.fillRect(0, 1704, SW, 3)
      ctx.beginPath()
      pts2.forEach((v, i) => (i === 0 ? ctx.moveTo(0, at(v)) : ctx.lineTo(i * step, at(v))))
      ctx.strokeStyle = accent
      ctx.lineWidth = 7.5
      ctx.lineCap = 'round'
      ctx.stroke()
    }

    // Four readings across the pen's column, 72 → 1008, spread rather than
    // divided: the last one is flush right, which is what stops the row from
    // reading as a table.
    const cells = [...(d.readings ?? []).slice(0, 3), { v: d.bigValue, l: d.bigUnit.toUpperCase() }]
    const widths = cells.map((c) => {
      ctx.font = `700 57px ${ARCHIVO}`
      const a = ctx.measureText(c.v).width
      ctx.font = `600 25.5px ${FONT}`
      const b = [...c.l.toUpperCase()].reduce((w, ch) => w + ctx.measureText(ch).width + 2.7, 0) - 2.7
      return Math.max(a, b)
    })
    const spread = cells.length > 1 ? (936 - widths.reduce((a, b) => a + b, 0)) / (cells.length - 1) : 0
    let cx = MX
    cells.forEach((c, i) => {
      const right = i === cells.length - 1
      text(ctx, c.v, right ? MX + 936 : cx, 1479, 57, '700', CARD.ink, -1.5, right ? 'right' : 'left', ARCHIVO, 'top')
      text(ctx, c.l.toUpperCase(), right ? MX + 936 : cx, 1556.4, 25.5, '600', 'rgba(255,255,255,0.50)', 2.7, right ? 'right' : 'left', FONT, 'top')
      cx += widths[i] + spread
    })

    // The mark, bottom right on the pen's own coordinates.
    ridrMark(ctx, 868.5, 1861, 19, RIDR_LIME)
    text(ctx, 'w3.ride', 900, 1842, 31.5, '700', 'rgba(255,255,255,0.80)', 0, 'left', FONT, 'top')
    return
  }


  // ── DIE SPUR (pen `DJJ0P`) ─────────────────────────────────────────────
  // The most minimal of them: the photograph, the route drawn over it as one
  // line, and three readings under a hairline. No headline, no big number —
  // for the ride whose picture is the point.
  if (layout === 'trace') {
    if (!bare) {
      const bottom0 = ctx.createLinearGradient(0, SH - 760, 0, SH)
      bottom0.addColorStop(0, 'rgba(0,0,0,0)')
      bottom0.addColorStop(1, 'rgba(0,0,0,0.9)')
      ctx.fillStyle = bottom0
      ctx.fillRect(0, SH - 760, SW, 760)
    }
    if (d.polyline && d.polyline.length > 1) paintStoryTrace(ctx, d.polyline, accent)
    // Pen `i4lb4E`: the name in caps, ONE meta line under it, both hard left.
    // No chips, no big number — the line already said how far it went, and a
    // second statement of the same fact is what turns a card into a dashboard.
    text(ctx, (d.routeName ?? '').toUpperCase(), MX, CONTENT_BOTTOM - 120, 58, '700', CARD.ink, -1.4)
    // Drawn on an ALPHABETIC baseline, so the box starts a cap-height above it.
    zone('routeName', MX, CONTENT_BOTTOM - 120 - 58, CW, 74)
    const meta = [
      `${d.bigValue} ${d.bigUnit.toUpperCase()}`,
      ...d.stats.map((x) => x.v),
      d.dateline ?? '',
    ].filter(Boolean).join('  ·  ')
    text(ctx, meta, MX, CONTENT_BOTTOM - 66, 26, '600', CARD.mid, 1)
    markAndFooter(CARD.quiet)
    return
  }

  // ── DIE KARTE (pen `sYlFV` / `C6Xn06`) and OHNE WORTE (pen `abH9Z`) ─────
  // The same card; `silent` simply does not print the sentence. A rider posting
  // a mountain does not always want a line of prose across it.
  // ── THE STACK, BUILT UP FROM THE SAFE LINE ─────────────────────────────
  // Everything here used to be positioned DOWN from the canvas bottom, so the
  // footer sat 74px from the edge (behind Instagram's reply bar), the numbers
  // at 250 (also behind it), and the headline at 470 — the only part of the
  // card reliably visible. Measuring UP from `CONTENT_BOTTOM` puts the whole
  // block where a story can actually show it, and makes the spacing a decision
  // rather than a residue.
  const FOOTER_GAP = 46
  const STRIP_H = 74
  const hasStrip = d.series.length > 0
  const stripTop = CONTENT_BOTTOM - FOOTER_GAP - STRIP_H
  const baseline = (hasStrip ? stripTop : CONTENT_BOTTOM - FOOTER_GAP) - 52

  // The headline is measured before anything is drawn, so the scrim can start
  // above the type block instead of at a fixed height that knows nothing about
  // how many lines the coach wrote.
  ctx.font = `700 62px ${FONT}`
  const leadLines = layout === 'full' ? wrap(ctx, d.lead, 62, '700', CW) : []
  const emphLines = layout === 'full' ? wrap(ctx, d.emphasis, 62, '700', CW) : []
  const LINE_H = 76
  // THE GAP IS THE BIG NUMBER'S OWN HEIGHT PLUS AIR. The figure is set at 128px
  // and drawn on `baseline`, so its cap sits ~128 above that; the last headline
  // line has to finish above THAT, not above the baseline. Getting this wrong
  // is not a near miss — the headline lands on top of the number.
  const NUM_CAP = 128
  const TYPE_GAP = 44
  const nLines = leadLines.length + emphLines.length
  /** Baseline of the FIRST headline line. */
  const typeFirst = baseline - NUM_CAP - TYPE_GAP - (nLines - 1) * LINE_H
  const typeTop = typeFirst - 62

  const top = ctx.createLinearGradient(0, SAFE_TOP - 90, 0, SAFE_TOP + 190)
  top.addColorStop(0, 'rgba(0,0,0,0.62)')
  top.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, SW, SAFE_TOP + 190)

  // ── THE SCRIM RAMPS INTO THE TYPE, NOT ACROSS IT ────────────────────────
  // It used to start 1000px up with its half-way stop at 0.45 — putting the
  // WEAKEST part of the wash exactly where the headline sits, and the darkest
  // part below the fold where it protected nothing. It now begins a fixed
  // distance above the first line, reaches full strength BY that line, and
  // holds from there down. Everything above the ramp is photograph.
  const scrimTop = Math.max(SAFE_TOP + 220, typeTop - 260)
  const bottom = ctx.createLinearGradient(0, scrimTop, 0, SH)
  bottom.addColorStop(0, 'rgba(0,0,0,0)')
  bottom.addColorStop(0.55, 'rgba(0,0,0,0.78)')
  bottom.addColorStop(0.8, 'rgba(0,0,0,0.9)')
  bottom.addColorStop(1, 'rgba(0,0,0,0.9)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, scrimTop, SW, SH - scrimTop)

  chips()

  let y = typeFirst
  if (layout === 'full') {
    ctx.textAlign = 'left'
    // Alphabetic baselines again: the block's top edge is one size above the
    // first of them.
    zone('lead', MX, y - 62, CW, Math.max(1, leadLines.length) * LINE_H)
    for (const line of leadLines) {
      text(ctx, line, MX, y, 62, '700', CARD.ink, -1.4); y += LINE_H
    }
    zone('emphasis', MX, y - 62, CW, Math.max(1, emphLines.length) * LINE_H)
    for (const line of emphLines) {
      text(ctx, line, MX, y, 62, '700', accent, -1.4); y += LINE_H
    }
  }

  ctx.font = `700 128px ${FONT}`
  const bigW = ctx.measureText(d.bigValue).width
  text(ctx, d.bigValue, MX, baseline, 128, '700', CARD.ink, -5)
  text(ctx, d.bigUnit, MX + bigW + 14, baseline, 40, '700', accent, -0.5)

  // THE SECONDARY STATS ARE ANCHORED RIGHT, not packed against the big number.
  // They used to run left-to-right from wherever the figure happened to end, so
  // a long distance pushed them off the frame and a short one stranded them
  // mid-card. Against the right margin they read as supporting facts, which is
  // what they are.
  const shown = d.stats.filter((st) => st.v)
  if (shown.length > 0) {
    const colW = 250
    shown.forEach((st, i) => {
      const cx = SW - MX - colW * (shown.length - 1 - i)
      text(ctx, st.v, cx, baseline - 34, 40, '700', CARD.ink, -1, 'right')
      text(ctx, st.l, cx, baseline, 20, '700', 'rgba(255,255,255,0.55)', 1.4, 'right')
    })
  }

  if (hasStrip) strip(stripTop)
  markAndFooter()
}

/**
 * THE OVERLAY ALONE, on transparency — the sticker route.
 *
 * WHY THIS EXISTS BESIDE THE BURNED CARD. Burning fixes our composition into
 * the rider's picture: they cannot move the headline off their own face. The
 * native apps solve that with Instagram's story-sharing API, which takes a
 * transparent `stickerImage` and a separate `backgroundImage` and hands the
 * rider a layer they can drag, scale and rotate inside Instagram. That API is
 * UIPasteboard keys plus an `instagram-stories://` URL scheme, and it is not
 * reachable from a browser — this app is a PWA, so it is not on offer to us.
 *
 * What IS on offer: Instagram's own photo sticker reads a transparent PNG out
 * of the camera roll and keeps its alpha. So the rider saves this, opens their
 * story with their own photo or video as the background, and adds this as a
 * sticker they place themselves. More taps than the burn, and the only route
 * that leaves the composition in their hands.
 *
 * No ground and no scrims: the type carries a soft shadow instead, because a
 * scrim on transparency is a grey rectangle sitting on somebody's story.
 */
export async function renderStoryOverlay(d: StoryData): Promise<{ blob: Blob | null; dataUrl: string }> {
  // `photo: null` matters as much as the flag: a sticker drawn over a
  // photograph would bake that photograph into its own transparency.
  return renderStoryCard({ ...d, transparent: true, photo: null })
}

/** The rider's photograph with their ride written over it. 1080 × 1920. */
export async function renderStoryCard(
  d: StoryData,
): Promise<{ blob: Blob | null; dataUrl: string; zones: StoryTextZone[] }> {
  const canvas = document.createElement('canvas')
  canvas.width = SW; canvas.height = SH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '', zones: [] }

  let photo: CardSource | null = null
  if (d.photo) {
    // A photo that will not decode must not cost the rider their card.
    try {
      const img = await loadImage(d.photo)
      photo = { src: img, w: img.width, h: img.height }
    } catch { photo = null }
  }
  const zones: StoryTextZone[] = []
  paintStoryCard(ctx, d, photo, zones)

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return { blob, dataUrl, zones: resolveZones(zones) }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MOVING CARD
//
// A story is as often a video as a photograph, and a still grabbed out of one
// is a worse post than the clip it came from. So the same overlay that paints
// the still is painted onto every frame, and what leaves the app is a video
// with the ride burned into it.
//
// WHY IT IS DONE IN THE BROWSER AND NOT ON THE SERVER. The rider's own footage
// would have to be uploaded to be composited anywhere else — a video of their
// morning, sent to a server, to get a caption on it. The whole point of the
// photo picker is that the file never leaves the device, and that argument does
// not weaken because the file is bigger.
//
// WHAT IT COSTS, HONESTLY: encoding is real time. Ten seconds of video takes
// about ten seconds, because `MediaRecorder` records a stream as it plays. That
// is why `onProgress` exists and why the cap is ten seconds rather than the
// fifteen a story allows.
// ─────────────────────────────────────────────────────────────────────────────

/** Longest clip we will burn. A story allows fifteen; ten keeps the wait sane. */
export const MAX_STORY_SECONDS = 10

/** The container the browser will actually give us, best first. */
function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const wanted = [
    'video/mp4;codecs=avc1',       // Safari, and what Instagram prefers
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return wanted.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? null
}

/** Can this browser burn an overlay into a video at all? */
export function canRenderVideo(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && pickMimeType() != null
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true            // required, or playback needs its own gesture
    v.playsInline = true
    v.onloadeddata = () => resolve(v)
    v.onerror = () => reject(new Error('video failed to load'))
    v.src = url
  })
}

/**
 * ONE FRAME of the rider's video, as a data URL.
 *
 * The fallback everywhere `canRenderVideo()` is false, and the thumbnail the
 * picker shows either way. Seeks a little way in on purpose: the first frame of
 * a handheld clip is usually the ground or a blur.
 */
export async function videoPosterFrame(url: string, at = 0.5): Promise<string | null> {
  try {
    const v = await loadVideo(url)
    await new Promise<void>((res) => {
      v.onseeked = () => res()
      v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) - 0.05))
    })
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    return c.toDataURL('image/jpeg', 0.9)
  } catch {
    return null
  }
}

/**
 * The rider's video with their ride painted over every frame. 1080 × 1920.
 *
 * Returns null when the browser cannot record a canvas — the caller falls back
 * to `videoPosterFrame` and a still card, which is a worse post but never a
 * broken one.
 */
export async function renderStoryVideo(
  url: string,
  d: StoryData,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob | null; type: string } | null> {
  if (!canRenderVideo()) return null
  const mimeType = pickMimeType()
  if (!mimeType) return null

  let video: HTMLVideoElement
  try { video = await loadVideo(url) } catch { return null }

  const canvas = document.createElement('canvas')
  canvas.width = SW
  canvas.height = SH
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const source: CardSource = { src: video, w: video.videoWidth, h: video.videoHeight }
  const duration = Math.min(video.duration || MAX_STORY_SECONDS, MAX_STORY_SECONDS)

  const stream = canvas.captureStream(30)
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 })
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }

  const done = new Promise<Blob>((resolve) => {
    rec.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  let raf = 0
  const draw = () => {
    // The overlay is repainted every frame rather than composited once: the
    // scrims are gradients over moving pixels, and a cached overlay would show
    // the first frame's darkness for the whole clip.
    paintStoryCard(ctx, d, source)
    onProgress?.(Math.min(1, video.currentTime / duration))
    if (video.currentTime >= duration || video.ended) {
      cancelAnimationFrame(raf)
      video.pause()
      rec.stop()
      return
    }
    raf = requestAnimationFrame(draw)
  }

  rec.start()
  try {
    await video.play()
  } catch {
    rec.stop()
    return null      // autoplay refused; the caller falls back to a still
  }
  raf = requestAnimationFrame(draw)

  const blob = await done
  stream.getTracks().forEach((t) => t.stop())
  return { blob, type: mimeType }
}

// ─────────────────────────────────────────────────────────────────────────────
// THE WRAPPED SLIDE, AS A CARD
//
// Every slide of the week's deck exports on its own — not just the finale. A
// rider who wants to post the one where they beat a moped should not have to
// post the summary instead, and each card that leaves carries the mark, which
// is the only reason anybody who is not already a rider ever sees this app.
//
// It repaints rather than screenshots: `html2canvas` on a motion-driven deck
// captures whatever frame the animation happened to be on. This draws the same
// scene deterministically at 1080 × 1920 — the field, the orb, the ring, the
// figure, the sentence and the mark — so the card is the slide, every time.
// ─────────────────────────────────────────────────────────────────────────────

export interface WrappedCardData {
  eyebrow: string
  value?: string | null
  unit?: string | null
  lead: string
  accent?: string | null
  foot?: string | null
  series?: number[]
  /** The rider's own picture, already a data URL. */
  photo?: string | null
  /** Scene colours — the same object the screen used. */
  scene: { ground: string; ink: string; accent: string; orb: string }
  /** "18 – 24. AUGUST" */
  weekLabel: string
}

/** A CSS `linear-gradient(...)` string, replayed onto a canvas.
 *  Only the shapes this deck's scenes actually use — angle plus colour stops. */
function paintCssGradient(ctx: CanvasRenderingContext2D, css: string, w: number, h: number) {
  const stops = [...css.matchAll(/(#[0-9A-Fa-f]{3,8})[^,)]*?(\d+)?%/g)]
    .map((m) => ({ color: m[1], at: m[2] != null ? Number(m[2]) / 100 : null }))
  if (stops.length === 0) { ctx.fillStyle = CARD.bg; ctx.fillRect(0, 0, w, h); return }
  const g = ctx.createLinearGradient(0, 0, w * 0.35, h)
  stops.forEach((st, i) => {
    const at = st.at ?? (stops.length === 1 ? 0 : i / (stops.length - 1))
    g.addColorStop(Math.max(0, Math.min(1, at)), st.color)
  })
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
}

export async function renderWrappedCard(d: WrappedCardData): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = SW; canvas.height = SH
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }

  const { scene } = d

  // ── the field ──
  paintCssGradient(ctx, scene.ground, SW, SH)

  // ── the rider's picture, if this slide has one ──
  if (d.photo) {
    try {
      const img = await loadImage(d.photo)
      const scale = Math.max(SW / img.width, SH / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (SW - w) / 2, (SH - h) / 2, w, h)
      const scrim = ctx.createLinearGradient(0, 0, 0, SH)
      scrim.addColorStop(0, 'rgba(0,0,0,0.38)')
      scrim.addColorStop(0.34, 'rgba(0,0,0,0.12)')
      scrim.addColorStop(1, 'rgba(0,0,0,0.88)')
      ctx.fillStyle = scrim
      ctx.fillRect(0, 0, SW, SH)
    } catch { /* a picture that will not decode must not cost the card */ }
  }

  // ── the orb ──
  const orb = ctx.createRadialGradient(SW * 0.12, SH * 0.3, 0, SW * 0.12, SH * 0.3, SW * 0.8)
  orb.addColorStop(0, scene.orb + (d.photo ? '3D' : '80'))
  orb.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = orb
  ctx.fillRect(0, 0, SW, SH)

  // ── the ring, cropped by the frame ──
  ctx.beginPath()
  ctx.arc(SW * 1.06, SH * 0.9, SW * 0.62, 0, Math.PI * 2)
  ctx.strokeStyle = scene.accent + '4D'
  ctx.lineWidth = 5
  ctx.stroke()

  // ── the type ──
  const MX = 84
  let y = SH * 0.56
  text(ctx, d.eyebrow.toUpperCase(), MX, y, 30, '600', scene.accent, 3)
  y += 70

  if (d.value) {
    ctx.font = `600 190px ${FONT}`
    const vw = ctx.measureText(d.value).width
    // Step down if the figure plus its unit would run past the margin.
    const size = vw + 120 > SW - MX * 2 ? 150 : 190
    text(ctx, d.value, MX, y + size * 0.72, size, '600', scene.ink, -8)
    ctx.font = `600 ${size}px ${FONT}`
    if (d.unit) {
      text(ctx, d.unit, MX + ctx.measureText(d.value).width + 18, y + size * 0.72, 52, '600', scene.accent, -1)
    }
    y += size * 0.86
  }

  if (d.series && d.series.length > 1) {
    const bars = d.series.slice(0, 28)
    const peak = Math.max(...bars, 0.0001)
    const bw = (SW - MX * 2) / bars.length
    for (let i = 0; i < bars.length; i++) {
      const hgt = Math.max(10, (bars[i] / peak) * 130)
      ctx.fillStyle = bars[i] / peak >= 0.86 ? scene.ink : scene.ink + '59'
      roundRect(ctx, MX + i * bw, y + (130 - hgt), Math.max(3, bw - 7), hgt, 5)
      ctx.fill()
    }
    y += 176
  }

  for (const line of wrap(ctx, d.lead, 62, '600', SW - MX * 2)) {
    text(ctx, line, MX, y + 54, 62, '600', scene.ink, -2)
    y += 74
  }
  if (d.accent) {
    for (const line of wrap(ctx, d.accent, 62, '600', SW - MX * 2)) {
      text(ctx, line, MX, y + 54, 62, '600', scene.accent, -2)
      y += 74
    }
  }
  if (d.foot) {
    for (const line of wrap(ctx, d.foot, 28, '600', SW - MX * 2)) {
      text(ctx, line, MX, y + 60, 28, '600', scene.ink, 0.4)
      y += 40
    }
  }

  // ── THE MARK. On every card, because a card that leaves without it is a
  //    week somebody admired and could not place. ──
  text(ctx, d.weekLabel.toUpperCase(), MX, SH - 88, 26, '600', scene.ink, 2)
  text(ctx, 'w3.ride', SW - MX, SH - 88, 30, '600', scene.accent, 1, 'right')

  const dataUrl = canvas.toDataURL('image/png')
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return { blob, dataUrl }
}
