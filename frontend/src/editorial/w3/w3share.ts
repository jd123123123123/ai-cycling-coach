import { T, SHARE_SCENES, type ShareScene } from './w3tokens'
import {
  blocksHeight, fitBlocks, paintBlocks, usableBlocks,
  type BlockData, type BlockId,
} from './w3shareBlocks'
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
  blocks: BlockId[]
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

function mountainPath(ctx: CanvasRenderingContext2D, baseY: number, amp: number, seed: number, color: string, heroH: number) {
  ctx.beginPath()
  ctx.moveTo(0, heroH)
  ctx.lineTo(0, baseY)
  const steps = 7
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * W
    const y = baseY - Math.abs(Math.sin(i * 1.3 + seed)) * amp
    ctx.lineTo(x, y)
  }
  ctx.lineTo(W, heroH)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
}

/** IF → route accent, matching the ride-detail hero's intensity colours. */
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

function text(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, weight: string, color: string, spacing = 0, align: CanvasTextAlign = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  if (spacing === 0) { ctx.fillText(s, x, y); return ctx.measureText(s).width }
  // letter-spaced
  let cx = x
  for (const ch of s) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + spacing }
  return cx - x
}

function wrap(ctx: CanvasRenderingContext2D, s: string, size: number, weight: string, maxW: number): string[] {
  ctx.font = `${weight} ${size}px ${FONT}`
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
  const usable = usableBlocks(d.blocks, d.blockData)
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
  const MIN_HERO = 150
  const PREFERRED_HERO = Math.round(H * 0.24)
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
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, heroH)
    sky.addColorStop(0, t.skyTop); sky.addColorStop(1, t.skyBot)
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, heroH)

    // mountains (back→front)
    mountainPath(ctx, heroH * 0.62, 190, 0.4, t.mtnBack, heroH)
    mountainPath(ctx, heroH * 0.74, 150, 2.1, t.mtnMid, heroH)
    mountainPath(ctx, heroH * 0.86, 120, 4.0, t.mtnFront, heroH)
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
    // 640 left the machine as a stamp in the middle of a big empty sky. The
    // bike is the subject of a cycling poster; it gets the width.
    const bw = 880
    const bh = bw * (bikeImg.height / bikeImg.width)
    const bx = (W - bw) / 2, by = heroH * 0.7 - bh / 2
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20
    ctx.drawImage(bikeImg, bx, by, bw, bh)
    ctx.restore()
  }

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
  star(ctx, W - px - 150, y - 8, 12, t.acid)
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
export async function sharePoster(blob: Blob | null, caption: string, filename = 'w3-ride.png'): Promise<'shared' | 'downloaded' | 'failed'> {
  if (!blob) return 'failed'
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], text: caption, title: 'Ridr' })
      return 'shared'
    } catch (err) {
      // user dismissed the sheet — not an error worth a fallback
      if ((err as Error)?.name === 'AbortError') return 'shared'
    }
  }
  downloadPoster(blob, filename)
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
  star(ctx, AW - px - 150, fy - 8, 12, ACID)
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
  star(ctx, AW - px - 150, foot - 8, 12, ACID)
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
