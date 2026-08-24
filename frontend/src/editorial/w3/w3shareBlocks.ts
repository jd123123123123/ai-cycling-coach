import { T } from './w3tokens'

/**
 * The share poster's BLOCKS — what a rider can choose to put on the card.
 *
 * WHY BLOCKS. The poster used to be one fixed stack: a number, a sentence, two
 * pills, three tiles. That is a receipt. What a cyclist actually posts is the
 * SHAPE of the day — the trace of the effort, where the time went, how the
 * peaks stack up, the outline of the loop — and which of those matters is
 * different for a 20-minute test, a five-hour epic and a hill-repeat session.
 * So the card is assembled from blocks the rider picks rather than from one
 * layout that suits none of them.
 *
 * EVERY BLOCK MEASURES ITSELF. `height()` is asked first and `paint()` gets the
 * exact box it asked for, so the panel can be added up before the hero is
 * sized. The alternative — laying out top-down and hoping — is what pushed the
 * footer off the bottom edge of a finished export.
 *
 * THE HOUSE STYLE IS NOT DECORATION HERE, IT IS THE READING. Near-black ground,
 * one acid accent, and data drawn as BEAMS AND BANDS rather than as a smooth
 * line on an axis — the same argument `W3ChallengeRow` makes about its own
 * gauge ("twenty notches cannot say 41 %") applied the other way round: a
 * ride's trace is read as a silhouette, not as a value at a coordinate, so it
 * is drawn as a filled shape and never given a grid to be measured against.
 * The zone colours are the app's own six, from `W3ZoneLadder`, so a band on a
 * poster and a band in the app can never mean two different things.
 */

export type BlockId = 'trace' | 'zones' | 'peaks' | 'route' | 'stats' | 'pills'

export interface BlockChoice { id: BlockId; label: string; sub: string }

/** Offered in the order a rider is most likely to want them. */
export const BLOCKS: BlockChoice[] = [
  { id: 'trace', label: 'Verlauf', sub: 'Watt & Puls' },
  { id: 'zones', label: 'Zonen', sub: 'Wo die Zeit hinging' },
  { id: 'peaks', label: 'Spitzen', sub: '5 s bis 20 min' },
  { id: 'route', label: 'Strecke', sub: 'Deine Runde' },
  { id: 'stats', label: 'Zahlen', sub: 'Drei Kacheln' },
  { id: 'pills', label: 'Höhepunkte', sub: 'Zwei Schlagzeilen' },
]

export const MIN_BLOCKS = 3
export const MAX_BLOCKS = 6

// The app's own zones, and the only place this file names a colour that is not
// the accent. Boundaries are fractions of FTP — `W3ZoneLadder` is the source.
const ZONES: { z: string; hi: number | null; hue: string }[] = [
  { z: 'Z1', hi: 0.55, hue: T.cool },
  { z: 'Z2', hi: 0.75, hue: T.training },
  { z: 'Z3', hi: 0.90, hue: T.acid },
  { z: 'Z4', hi: 1.05, hue: T.warn },
  { z: 'Z5', hi: 1.20, hue: T.bad },
  { z: 'Z6', hi: null, hue: T.evening },
]

export interface BlockData {
  /** Watts per sample, already downsampled by the caller. */
  power: number[]
  /** Heart rate per sample, same length as `power` where it exists. */
  hr: (number | null)[]
  /** Altitude per sample, for the climb silhouette under the trace. */
  altitude: (number | null)[]
  ftp: number | null
  /** Best efforts, shortest first. */
  peaks: { label: string; watts: number; best: number | null; isPr: boolean }[]
  polyline: [number, number][] | null
  stats: { v: string; l: string }[]
  pills: { text: string; sub: string; tone: 'acid' | 'violet' }[]
}

export function zoneOf(watts: number, ftp: number): number {
  const r = watts / ftp
  for (let i = 0; i < ZONES.length; i++) {
    const hi = ZONES[i].hi
    if (hi == null || r <= hi) return i
  }
  return ZONES.length - 1
}

/** Seconds in each zone, from the real power series. Empty without an FTP —
 *  zones are fractions of a threshold and inventing one would invent the whole
 *  chart. */
export function zoneShares(power: number[], ftp: number | null): number[] {
  if (!ftp || ftp <= 0 || power.length === 0) return []
  const out = new Array(ZONES.length).fill(0)
  for (const w of power) out[zoneOf(w, ftp)] += 1
  const total = out.reduce((a, b) => a + b, 0)
  return total > 0 ? out.map((n) => n / total) : []
}

export const ZONE_META = ZONES

// ── drawing helpers, kept local so this file owns its own look ──────────────

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + k, y)
  ctx.arcTo(x + w, y, x + w, y + h, k)
  ctx.arcTo(x + w, y + h, x, y + h, k)
  ctx.arcTo(x, y + h, x, y, k)
  ctx.arcTo(x, y, x + w, y, k)
  ctx.closePath()
}

function label(ctx: CanvasRenderingContext2D, s: string, x: number, y: number) {
  ctx.font = `700 24px "Inter Tight", sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.letterSpacing = '3px'
  ctx.fillText(s, x, y)
  ctx.letterSpacing = '0px'
}

function value(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = T.ink) {
  ctx.font = `800 ${size}px "Inter Tight", sans-serif`
  ctx.fillStyle = color
  ctx.fillText(s, x, y)
  return ctx.measureText(s).width
}

const HEAD = 44          // room above every block for its own kicker
const GAP = 26           // between blocks
const R = 34             // the deck's radius: generous, and the same everywhere

//: The card tints and the ink that sits on them live in `w3tokens` — the
//: isolation gate exists precisely to stop a surface inventing its own palette,
//: and it caught this file's first draft doing exactly that.
const TINT = {
  mint: T.tintMint,
  lilac: T.tintLilac,
  peach: T.tintPeach,
  sky: T.tintSky,
  paper: T.tintPaper,
} as const
const INK = T.tintInk
const HOT = T.hotOnPaper
const WARM = T.warmOnPaper

// ── DER VERLAUF ────────────────────────────────────────────────────────────

const TRACE_H = 300

/**
 * The ride's own shape: power as a filled silhouette, banded by zone, with the
 * heart rate laid over it as a single thin line.
 *
 * FILLED, NOT PLOTTED. A cyclist reads this as a silhouette — where the spikes
 * are, how long the flat bit lasted, whether it faded — and never as a value at
 * a coordinate, so it gets no axis, no grid and no numbers along the bottom.
 * What it does get is the zone colour under each column, which is the one thing
 * that turns a squiggle into a story: a wall of amber is a threshold day and a
 * green floor with four orange teeth is intervals, legible at a glance and at
 * any size.
 *
 * HEART RATE IS A LINE, NOT A SECOND FILL. Two filled series stacked on one box
 * is a chart nobody can read; the pulse is the quiet witness over the loud
 * thing, which is also what it is physiologically.
 */
function paintTrace(ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number) {
  label(ctx, 'VERLAUF · WATT & PULS', x, y + 26)
  const top = y + HEAD
  const h = TRACE_H - HEAD

  ctx.save()
  rr(ctx, x, top, w, h, R)
  // A PALE GROUND, so the trace is ink on paper rather than a glowing readout.
  // The deck stands its objects on light tinted cards; a chart is an object.
  ctx.fillStyle = TINT.paper
  ctx.fill()
  ctx.clip()

  const n = d.power.length
  if (n > 0) {
    // ── SCALED TO THE RIDE, NOT TO ITS LOUDEST SECOND ──────────────────
    // A max-scaled trace is what a single sprint does to a five-hour ride:
    // one needle at the ceiling and the other four hours pressed into a flat
    // band along the floor, which is exactly the ride the rider wanted to
    // show. The ceiling is the 98th percentile instead, so the BODY of the
    // effort fills the box and the rare spike clips — a clipped spike still
    // reads as "that one hurt", and a flattened ride reads as nothing.
    const sorted = [...d.power].sort((a, b) => a - b)
    const p98 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] || 1
    const peak = Math.max(p98, 1)
    const cw = w / n
    // The columns ARE the chart. One per sample, no gap: at 240 samples across
    // 950 px they read as a continuous shape while still each carrying their
    // own zone colour, which a single filled path could not do.
    // ── ONE ACCENT, AND HEAT WHERE IT HURT ────────────────────────────
    // The first version coloured every column by its zone, all six hues from
    // `W3ZoneLadder`. Faithful to the app, and a rainbow on a poster: six
    // competing colours in the one place the house style spends a single
    // accent, and the shape stopped being readable underneath them. The zones
    // keep their six colours where they ARE the subject — the zones block —
    // and here the trace is acid, dimmed below threshold and turning warm
    // above it. What comes back is the reading that matters at a glance: an
    // even green wash is an endurance ride, four orange teeth are intervals.
    for (let i = 0; i < n; i++) {
      const v = d.power[i]
      const ch = Math.max(2, Math.min(1, v / peak) * (h - 26))
      const z = d.ftp ? zoneOf(v, d.ftp) : 2
      ctx.fillStyle = z >= 4 ? HOT : z === 3 ? WARM : T.acidDeep
      ctx.globalAlpha = z >= 3 ? 1 : 0.5 + z * 0.14
      ctx.fillRect(x + i * cw, top + h - ch, Math.ceil(cw) + 0.5, ch)
    }
    ctx.globalAlpha = 1

    const hrs = d.hr.filter((v): v is number => v != null && v > 0)
    if (hrs.length > 8) {
      const hiHr = Math.max(...hrs), loHr = Math.min(...hrs)
      const span = Math.max(1, hiHr - loHr)
      ctx.beginPath()
      let started = false
      for (let i = 0; i < n; i++) {
        const v = d.hr[i]
        if (v == null || v <= 0) continue
        const py = top + 16 + (1 - (v - loHr) / span) * (h - 60)
        if (!started) { ctx.moveTo(x + i * cw, py); started = true } else ctx.lineTo(x + i * cw, py)
      }
      ctx.strokeStyle = 'rgba(19,19,21,0.5)'
      ctx.lineWidth = 4
      ctx.lineJoin = 'round'
      ctx.stroke()

      // The pulse needs to be NAMEABLE. An unlabelled grey line over a
      // coloured fill is a stray mark; two numbers at its ends make it a
      // heart rate, and they are the only two values of it anybody quotes.
      ctx.font = `800 22px "Inter Tight", sans-serif`
      ctx.fillStyle = 'rgba(19,19,21,0.6)'
      ctx.textAlign = 'right'
      ctx.fillText(`${Math.round(hiHr)} BPM MAX`, x + w - 20, top + 34)
      ctx.textAlign = 'left'
    }

    // ── ONE SCALE MARK, AND IT STATES THE MAXIMUM ────────────────────────
    // The trace is read as a silhouette, which is why it gets no axis and no
    // grid. But with no number anywhere on it, 300 W and 500 W draw the same
    // picture, so one figure sits in the corner.
    //
    // It is the ride's TRUE MAXIMUM, not the 98th-percentile ceiling the bars
    // are scaled to. The first version printed the ceiling — "316 W" on a ride
    // that peaked at 690 — which is a wrong number stated confidently, the
    // worst kind. The clipped spike already touches the top of the box, so the
    // maximum is where the eye reads it anyway; the ceiling is a drawing
    // decision and has no business being quoted as a fact.
    ctx.font = `800 22px "Inter Tight", sans-serif`
    ctx.fillStyle = 'rgba(19,19,21,0.6)'
    ctx.fillText(`${Math.round(Math.max(...d.power))} W MAX`, x + 20, top + 34)
  }
  ctx.restore()
}

// ── DIE ZONEN ──────────────────────────────────────────────────────────────

const ZONES_H = 210

/**
 * Where the time actually went, as one band cut into six.
 *
 * A STACKED BAR RATHER THAN SIX BARS, because the question is "what shape was
 * this ride" and not "how many minutes in Z3" — the proportions are the answer
 * and a reader gets them instantly from one continuous strip. Segments under
 * four per cent carry no label: a number too small to read is worse than a
 * colour that speaks for itself, and the strip is still exactly true.
 */
function paintZones(ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number) {
  label(ctx, 'ZONEN · WO DIE ZEIT HINGING', x, y + 26)
  const shares = zoneShares(d.power, d.ftp)
  const top = y + HEAD
  const barH = 76

  if (shares.length === 0) {
    ctx.font = `600 28px "Inter Tight", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText('Ohne FTP gibt es keine Zonen.', x, top + 44)
    return
  }

  let cx = x
  shares.forEach((s, i) => {
    const sw = s * w
    if (sw <= 0) return
    ctx.fillStyle = ZONES[i].hue
    // Only the outer ends are rounded, so the six read as one bar cut up
    // rather than as six bars pushed together.
    const first = shares.slice(0, i).every((v) => v === 0)
    const last = shares.slice(i + 1).every((v) => v === 0)
    if (first || last) {
      ctx.save()
      rr(ctx, cx, top, Math.max(sw, 8), barH, 14)
      ctx.fill()
      ctx.restore()
      // Square off the inner edge again.
      if (first && !last) ctx.fillRect(cx + Math.max(sw, 8) - 14, top, 14, barH)
      if (last && !first) ctx.fillRect(cx, top, 14, barH)
    } else {
      ctx.fillRect(cx, top, sw, barH)
    }
    cx += sw
  })

  // ── THE LEGEND IS CAPPED, BECAUSE THE BLOCK'S HEIGHT IS FIXED ────────
  // Wrapping to a second line was the first fix for a legend running off the
  // card's edge, and it would have run into the block below instead — every
  // block declares its height before anything is measured. Four entries fit on
  // one line at any zone spread, and the four biggest are the ones a rider
  // reads; the bar above already shows every zone exactly.
  const shown = shares
    .map((v, i) => ({ v, i }))
    .filter((e) => e.v >= 0.04)
    .sort((a, b) => b.v - a.v)
    .slice(0, 4)
    .sort((a, b) => a.i - b.i)
  let lx = x
  const ly = top + barH + 52
  shown.forEach(({ v: s, i }) => {
    // Measured before it is drawn, so a ride that touched five zones wraps to
    // a second line instead of running off the card's edge.
    ctx.font = `800 28px "Inter Tight", sans-serif`
    const pct = `${Math.round(s * 100)} %`
    const pw = ctx.measureText(pct).width
    ctx.font = `700 24px "Inter Tight", sans-serif`
    const zw = ctx.measureText(ZONES[i].z).width
    const entry = 24 + pw + 9 + zw + 30
    ctx.beginPath(); ctx.arc(lx + 7, ly - 9, 7, 0, Math.PI * 2)
    ctx.fillStyle = ZONES[i].hue; ctx.fill()
    ctx.font = `800 28px "Inter Tight", sans-serif`
    ctx.fillStyle = T.ink
    ctx.fillText(pct, lx + 24, ly)
    ctx.font = `700 24px "Inter Tight", sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.fillText(ZONES[i].z, lx + 24 + pw + 9, ly)
    lx += entry
  })
}

// ── DIE SPITZEN ────────────────────────────────────────────────────────────

const PEAK_ROW = 96
const peaksH = (d: BlockData) => HEAD + Math.min(d.peaks.length, 4) * PEAK_ROW

/**
 * The best efforts, each as a ring against the rider's own record.
 *
 * A RING, NOT A BAR — and the difference is the house style rather than taste.
 * The deck meters everything with a thin arc on a tinted card: the tier
 * progress, the milestone, the club target. A row of progress bars is what any
 * dashboard does; the ring is what THIS app does, and using it here means a
 * rider recognises the meter before they read the number.
 *
 * The arc is filled to this effort against that duration's all-time best, so a
 * closed ring is a personal record and a gap is work left — the comparison a
 * cyclist is actually making, and one a bare list of four wattages hides. With
 * no stored best the ring closes: a first effort at a duration IS the best one.
 */
function paintPeaks(ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number) {
  label(ctx, 'SPITZEN · GEGEN DEINE BESTEN', x, y + 26)
  let ry = y + HEAD
  d.peaks.slice(0, 4).forEach((p) => {
    const frac = p.best && p.best > 0 ? Math.min(1, p.watts / p.best) : 1
    const cardH = PEAK_ROW - 14
    ctx.save()
    rr(ctx, x, ry, w, cardH, R)
    ctx.fillStyle = p.isPr ? T.acid : 'rgba(255,255,255,0.09)'
    ctx.fill()
    ctx.restore()

    const ink = p.isPr ? INK : T.ink
    const dim = p.isPr ? 'rgba(19,19,21,0.55)' : 'rgba(255,255,255,0.45)'

    // the ring
    // THICK ENOUGH TO BE A METER. At 8 px on a 26 radius the arc and its track
    // were the same object to the eye — four identical circles down the card,
    // which is a decoration where a measurement was promised. The track is also
    // darkened well below the arc: a ring you cannot see the empty half of
    // cannot be read as a fraction of anything.
    const cx = x + 54, cy = ry + cardH / 2, rad = 25
    ctx.save()
    ctx.lineWidth = 12
    ctx.lineCap = 'round'
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2)
    ctx.strokeStyle = p.isPr ? 'rgba(19,19,21,0.16)' : 'rgba(255,255,255,0.10)'
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, rad, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2)
    ctx.strokeStyle = p.isPr ? INK : T.acid
    ctx.stroke()
    ctx.restore()

    ctx.font = `700 27px "Inter Tight", sans-serif`
    ctx.fillStyle = dim
    ctx.fillText(p.label, x + 104, ry + cardH / 2 + 10)

    const wStr = `${Math.round(p.watts)}`
    ctx.textAlign = 'right'
    ctx.font = `800 40px "Inter Tight", sans-serif`
    ctx.fillStyle = ink
    ctx.fillText(wStr, x + w - (p.isPr ? 120 : 74), ry + cardH / 2 + 14)
    ctx.font = `700 24px "Inter Tight", sans-serif`
    ctx.fillStyle = dim
    ctx.fillText('W', x + w - (p.isPr ? 92 : 46), ry + cardH / 2 + 14)
    if (p.isPr) {
      ctx.font = `800 22px "Inter Tight", sans-serif`
      ctx.fillStyle = INK
      ctx.fillText('PR', x + w - 34, ry + cardH / 2 + 14)
    }
    ctx.textAlign = 'left'
    ry += PEAK_ROW
  })
}

// ── DIE STRECKE ────────────────────────────────────────────────────────────

const ROUTE_H = 340

/**
 * The loop, drawn big and in its real proportions.
 *
 * Latitude is compressed by cos(lat), because a rider knows their own roads
 * well enough to notice a track 40 % too wide — which is what an uncorrected
 * drawing gives at 52° N, and what the poster's own route cartouche drew until
 * this was written.
 */
function paintRoute(ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number) {
  label(ctx, 'STRECKE · DEINE RUNDE', x, y + 26)
  const top = y + HEAD
  const h = ROUTE_H - HEAD
  ctx.save()
  rr(ctx, x, top, w, h, R)
  ctx.fillStyle = TINT.sky
  ctx.fill()
  ctx.clip()

  const pts = d.polyline
  if (pts && pts.length > 1) {
    const pad = 40
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
    const gw = Math.max(1e-6, (maxLng - minLng) * kx)
    const gh = Math.max(1e-6, maxLat - minLat)
    const scale = Math.min((w - pad * 2) / gw, (h - pad * 2) / gh)
    const ox = x + pad + ((w - pad * 2) - gw * scale) / 2
    const oy = top + pad + ((h - pad * 2) - gh * scale) / 2
    const P = pts.map(([lat, lng]) => ({
      x: ox + (lng - minLng) * kx * scale,
      y: oy + (maxLat - lat) * scale,
    }))
    ctx.beginPath()
    P.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
    ctx.strokeStyle = 'rgba(19,19,21,0.14)'
    ctx.lineWidth = 24; ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.stroke()
    ctx.strokeStyle = INK
    ctx.lineWidth = 9
    ctx.stroke()
    ctx.beginPath(); ctx.arc(P[0].x, P[0].y, 13, 0, Math.PI * 2)
    ctx.fillStyle = T.acid; ctx.fill()
  }
  ctx.restore()
}

// ── the two blocks the card always had, now choosable like the rest ─────────

const STATS_H = HEAD + 180
const PILLS_H = 116

function paintStats(
  ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number,
  glyph: (ctx: CanvasRenderingContext2D, l: string, gx: number, gy: number, s: number, c: string) => void,
) {
  label(ctx, 'ZAHLEN', x, y + 26)
  const top = y + HEAD
  const gap = 18
  const tw = (w - gap * 2) / 3
  const th = 180
  // ONE TINT PER TILE, the deck's own move: three objects on three grounds
  // rather than three grey boxes with coloured numbers in them. The lead tile
  // takes the acid, because acid is what you press and what you brag about.
  const tints = [T.acid, TINT.lilac, TINT.mint]
  d.stats.slice(0, 3).forEach((s, i) => {
    const tx = x + i * (tw + gap)
    ctx.save()
    rr(ctx, tx, top, tw, th, R)
    ctx.fillStyle = tints[i] ?? TINT.paper
    ctx.fill()
    ctx.restore()
    glyph(ctx, s.l, tx + tw - 58, top + 26, 30, `${INK}B0`)
    value(ctx, s.v, tx + 28, top + 100, 64, INK)
    ctx.font = `700 22px "Inter Tight", sans-serif`
    ctx.fillStyle = 'rgba(19,19,21,0.55)'
    ctx.letterSpacing = '1px'
    ctx.fillText(s.l, tx + 28, top + 142)
    ctx.letterSpacing = '0px'
  })
}

function paintPills(ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number) {
  const gap = 20
  const pw = (w - gap) / 2
  d.pills.slice(0, 2).forEach((p, i) => {
    const pxx = x + i * (pw + gap)
    ctx.save()
    rr(ctx, pxx, y, pw, PILLS_H, R)
    ctx.fillStyle = p.tone === 'acid' ? T.acid : T.evening
    ctx.fill()
    ctx.restore()
    const ink = p.tone === 'acid' ? T.bg : T.ink
    value(ctx, p.text, pxx + 34, y + 54, 34, ink)
    ctx.font = `600 24px "Inter Tight", sans-serif`
    ctx.fillStyle = p.tone === 'acid' ? 'rgba(11,11,11,0.7)' : 'rgba(255,255,255,0.75)'
    ctx.fillText(p.sub, pxx + 34, y + 88)
  })
}

// ── the registry ───────────────────────────────────────────────────────────

export type Glyph = (
  ctx: CanvasRenderingContext2D, label: string, x: number, y: number, s: number, color: string,
) => void

interface BlockImpl {
  height: (d: BlockData) => number
  paint: (ctx: CanvasRenderingContext2D, d: BlockData, x: number, y: number, w: number, glyph: Glyph) => void
  /** False when the block has nothing real to draw — it is then dropped rather
   *  than rendered as an empty box, and the card closes up around it. */
  available: (d: BlockData) => boolean
}

const IMPL: Record<BlockId, BlockImpl> = {
  trace: {
    height: () => TRACE_H,
    paint: (ctx, d, x, y, w) => paintTrace(ctx, d, x, y, w),
    available: (d) => d.power.length > 8,
  },
  zones: {
    height: () => ZONES_H,
    paint: (ctx, d, x, y, w) => paintZones(ctx, d, x, y, w),
    available: (d) => zoneShares(d.power, d.ftp).length > 0,
  },
  peaks: {
    height: peaksH,
    paint: (ctx, d, x, y, w) => paintPeaks(ctx, d, x, y, w),
    available: (d) => d.peaks.length > 0,
  },
  route: {
    height: () => ROUTE_H,
    paint: (ctx, d, x, y, w) => paintRoute(ctx, d, x, y, w),
    available: (d) => (d.polyline?.length ?? 0) > 1,
  },
  stats: {
    height: () => STATS_H,
    paint: (ctx, d, x, y, w, glyph) => paintStats(ctx, d, x, y, w, glyph),
    available: (d) => d.stats.length > 0,
  },
  pills: {
    height: () => PILLS_H,
    paint: (ctx, d, x, y, w) => paintPills(ctx, d, x, y, w),
    available: (d) => d.pills.length > 0,
  },
}

/** Which of the chosen blocks can actually be drawn from this ride's data. */
export function usableBlocks(ids: BlockId[], d: BlockData): BlockId[] {
  return ids.filter((id) => IMPL[id].available(d))
}

/** What the chosen blocks add up to, gaps included. */
export function blocksHeight(ids: BlockId[], d: BlockData): number {
  if (ids.length === 0) return 0
  return ids.reduce((sum, id) => sum + IMPL[id].height(d), 0) + (ids.length - 1) * GAP
}

/**
 * As many of the chosen blocks as fit in `room`, keeping their order.
 *
 * DROPPED FROM THE END, because the order is the rider's own: they tapped the
 * block they care about first, so the last one they added is the one that can
 * go. Never below `MIN_BLOCKS` — at that point the card is what it is and the
 * hero gives up its floor instead, which is the right trade when the choice is
 * between a short picture and a missing footer.
 */
export function fitBlocks(ids: BlockId[], d: BlockData, room: number): BlockId[] {
  const out = [...ids]
  while (out.length > MIN_BLOCKS && blocksHeight(out, d) > room) out.pop()
  return out
}

/** Paint them in order, top-down, from `y`. Returns the y below the last one. */
export function paintBlocks(
  ctx: CanvasRenderingContext2D, ids: BlockId[], d: BlockData,
  x: number, y: number, w: number, glyph: Glyph,
): number {
  let cy = y
  ids.forEach((id, i) => {
    IMPL[id].paint(ctx, d, x, cy, w, glyph)
    cy += IMPL[id].height(d)
    if (i < ids.length - 1) cy += GAP
  })
  return cy
}
