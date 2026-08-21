import { T, SHARE_SCENES, type ShareScene } from './w3tokens'
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

function drawRoute(ctx: CanvasRenderingContext2D, pts: [number, number][] | null, theme: Theme, heroH: number, routeColor: string) {
  // Target rect in the lower hero band.
  const rx = 90, ry = heroH * 0.5, rw = W - 180, rh = heroH * 0.34
  let path: { x: number; y: number }[]
  if (pts && pts.length > 1) {
    const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1])
    const minLat = Math.min(...lats), maxLat = Math.max(...lats)
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
    const spanLat = Math.max(1e-6, maxLat - minLat), spanLng = Math.max(1e-6, maxLng - minLng)
    const scale = Math.min(rw / spanLng, rh / spanLat)
    const offX = rx + (rw - spanLng * scale) / 2
    const offY = ry + (rh - spanLat * scale) / 2
    path = pts.map(([lat, lng]) => ({ x: offX + (lng - minLng) * scale, y: offY + (maxLat - lat) * scale }))
  } else {
    // Stylised winding fallback (marked by the caller as no-GPX).
    path = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23
      return { x: rx + t * rw, y: ry + rh * (0.5 + 0.42 * Math.sin(t * 7)) }
    })
  }
  ctx.save()
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'
  ctx.shadowColor = routeColor; ctx.shadowBlur = 26
  ctx.strokeStyle = routeColor; ctx.lineWidth = 12
  ctx.beginPath()
  path.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.stroke()
  ctx.restore()
  // start / end dots
  const dot = (p: { x: number; y: number }, fill: string) => { ctx.beginPath(); ctx.arc(p.x, p.y, 12, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill() }
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

  if (/watt|leistung|normal|power|ftp/.test(l)) {
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
  const heroH = Math.round(H * 0.56)

  // ── background ──
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, W, H)

  if (sceneImg) {
    // THE RIDE'S OWN PICTURE, EDGE TO EDGE. Cover-cropped rather than fitted:
    // the scene is square and the hero band is not, and letterboxing it would
    // reproduce the exact fault this replaces — a photograph floating in a
    // rectangle instead of being the poster.
    const scale = Math.max(W / sceneImg.width, heroH / sceneImg.height)
    const sw = sceneImg.width * scale, sh = sceneImg.height * scale
    ctx.drawImage(sceneImg, (W - sw) / 2, (heroH - sh) / 2, sw, sh)
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

  // route (the GPX), glowing in the intensity accent when we know it. Over a
  // real photograph it sits lower and lighter — the picture is the subject
  // there, and a bright track across the middle of it competes.
  drawRoute(ctx, d.polyline, t, heroH, d.intensity != null ? intensityHue(d.intensity) : t.route)

  // hero→panel fade
  const fade = ctx.createLinearGradient(0, heroH - 220, 0, heroH)
  fade.addColorStop(0, 'rgba(11,11,11,0)'); fade.addColorStop(1, T.bg)
  ctx.fillStyle = fade; ctx.fillRect(0, heroH - 220, W, 220)

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
  let y = heroH + 92
  const px = 64
  // kicker
  star(ctx, px + 12, y - 14, 13, t.acid)
  text(ctx, d.kicker, px + 40, y, 26, '700', t.acid, 3)
  y += 96

  // big value + unit + delta
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
    text(ctx, `↓ ${d.delta}`, W - px - dw + 34, dy + 44, 30, '700', t.acid)
  }
  y += 70

  // sentence
  for (const line of wrap(ctx, d.sentence, 40, '600', W - px * 2)) {
    text(ctx, line, px, y, 40, '600', 'rgba(255,255,255,0.82)')
    y += 52
  }
  y += 30

  // pills
  const pillH = 116, pillGap = 20, pillW = (W - px * 2 - pillGap) / 2
  d.pills.forEach((p, i) => {
    const x = px + i * (pillW + pillGap)
    ctx.save()
    roundRect(ctx, x, y, pillW, pillH, 26)
    ctx.fillStyle = p.tone === 'acid' ? t.acid : T.evening; ctx.fill()
    ctx.restore()
    const ink = p.tone === 'acid' ? T.bg : T.ink
    text(ctx, p.text, x + 34, y + 54, 34, '700', ink)
    text(ctx, p.sub, x + 34, y + 88, 24, '600', p.tone === 'acid' ? 'rgba(11,11,11,0.7)' : 'rgba(255,255,255,0.75)')
  })
  y += pillH + 26

  // three stat tiles
  const tileGap = 18, tileW = (W - px * 2 - tileGap * 2) / 3, tileH = 168
  d.stats.forEach((s, i) => {
    const x = px + i * (tileW + tileGap)
    ctx.save()
    roundRect(ctx, x, y, tileW, tileH, 24)
    ctx.fillStyle = T.surface; ctx.fill()
    ctx.restore()
    // The mark sits top-right of the tile: out of the number's way, and the
    // three of them make a rhythm across the row.
    statGlyph(ctx, s.l, x + tileW - 60, y + 26, 34, t.acid)
    text(ctx, s.v, x + 26, y + 82, 52, '700', T.ink)
    text(ctx, s.l, x + 26, y + 126, 22, '700', 'rgba(255,255,255,0.5)', 1)
  })
  y += tileH + 60

  // footer
  text(ctx, d.footer, px, y, 26, '600', 'rgba(255,255,255,0.55)')
  star(ctx, W - px - 150, y - 8, 12, t.acid)
  text(ctx, 'w3.ride', W - px - 128, y, 28, '700', T.ink)
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
      await navigator.share({ files: [file], text: caption, title: 'w3.ride' })
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
      await navigator.share(url ? { title: 'w3.ride', text, url } : { title: 'w3.ride', text })
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
  text(ctx, 'w3.ride', AW - px - 128, fy, 28, '700', T.ink)
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
