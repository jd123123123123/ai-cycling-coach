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
  bikeSrc: string
  avatarUrl: string | null
  avatarInitial: string
}

interface Theme { skyTop: string; skyBot: string; mtnBack: string; mtnMid: string; mtnFront: string; route: string; acid: string }
const THEMES: Record<ShareAngle, Theme> = {
  rekord: { skyTop: '#6A4BC4', skyBot: '#C56BA6', mtnBack: '#7A4FB0', mtnMid: '#5B3A90', mtnFront: '#3C2568', route: '#FF5CA8', acid: '#C8FF00' },
  fahrt: { skyTop: '#241A54', skyBot: '#6B3A8C', mtnBack: '#4A2E7A', mtnMid: '#37225C', mtnFront: '#241645', route: '#C86BFF', acid: '#C8FF00' },
  leistung: { skyTop: '#1E5C46', skyBot: '#B23A7A', mtnBack: '#8A3A72', mtnMid: '#5B2E66', mtnFront: '#331F55', route: '#C8FF00', acid: '#C8FF00' },
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
  return iff >= 1.02 ? '#FF6A3D' : iff >= 0.92 ? '#FFB020' : iff >= 0.8 ? '#C8FF00' : '#2BE68F'
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
  dot(path[0], '#FFFFFF'); dot(path[path.length - 1], theme.acid)
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

async function paint(ctx: CanvasRenderingContext2D, d: PosterData, avatarImg: HTMLImageElement | null, bikeImg: HTMLImageElement | null) {
  const t = THEMES[d.angle]
  const heroH = Math.round(H * 0.56)

  // ── background ──
  ctx.fillStyle = '#0B0B0B'; ctx.fillRect(0, 0, W, H)

  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, heroH)
  sky.addColorStop(0, t.skyTop); sky.addColorStop(1, t.skyBot)
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, heroH)

  // mountains (back→front)
  mountainPath(ctx, heroH * 0.62, 190, 0.4, t.mtnBack, heroH)
  mountainPath(ctx, heroH * 0.74, 150, 2.1, t.mtnMid, heroH)
  mountainPath(ctx, heroH * 0.86, 120, 4.0, t.mtnFront, heroH)

  // route (the GPX), glowing in the intensity accent when we know it
  drawRoute(ctx, d.polyline, t, heroH, d.intensity != null ? intensityHue(d.intensity) : t.route)

  // hero→panel fade
  const fade = ctx.createLinearGradient(0, heroH - 220, 0, heroH)
  fade.addColorStop(0, 'rgba(11,11,11,0)'); fade.addColorStop(1, '#0B0B0B')
  ctx.fillStyle = fade; ctx.fillRect(0, heroH - 220, W, 220)

  // bike (with the rider) sitting on the route
  if (bikeImg) {
    const bw = 640
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
  else { ctx.fillStyle = '#2BE68F'; ctx.fillRect(chipX + 24, av - 34, 68, 68); ctx.fillStyle = '#0B0B0B'; text(ctx, d.avatarInitial, chipX + 58, av + 12, 34, '700', '#0B0B0B', 0, 'center') }
  ctx.restore()
  text(ctx, d.handle, chipX + 108, av - 4, 30, '700', '#FFFFFF')
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
  const bigW = text(ctx, d.bigValue, px, y, 150, '700', '#FFFFFF')
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
    ctx.fillStyle = p.tone === 'acid' ? t.acid : '#6B44E0'; ctx.fill()
    ctx.restore()
    const ink = p.tone === 'acid' ? '#0B0B0B' : '#FFFFFF'
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
    ctx.fillStyle = '#161616'; ctx.fill()
    ctx.restore()
    text(ctx, s.v, x + 26, y + 82, 52, '700', '#FFFFFF')
    text(ctx, s.l, x + 26, y + 126, 22, '700', 'rgba(255,255,255,0.5)', 1)
  })
  y += tileH + 60

  // footer
  text(ctx, d.footer, px, y, 26, '600', 'rgba(255,255,255,0.55)')
  star(ctx, W - px - 150, y - 8, 12, t.acid)
  text(ctx, 'w3.ride', W - px - 128, y, 28, '700', '#FFFFFF')
}

/** Render the poster once. Retries without the avatar if a cross-origin avatar
 *  taints the canvas (so the export always succeeds). */
export async function renderSharePoster(d: PosterData): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }

  const bikeImg = await loadImage(d.bikeSrc).catch(() => null)
  let avatarImg: HTMLImageElement | null = d.avatarUrl ? await loadImage(d.avatarUrl, 'anonymous').catch(() => null) : null

  const tryExport = async (): Promise<{ blob: Blob | null; dataUrl: string } | 'tainted'> => {
    ctx.clearRect(0, 0, W, H)
    await paint(ctx, d, avatarImg, bikeImg)
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
const ACID = '#C8FF00'

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

function paintAvatarCard(ctx: CanvasRenderingContext2D, d: AvatarCardData, avatar: HTMLImageElement | null) {
  const coverH = 760
  const px = 64

  // ── ground ──
  ctx.fillStyle = '#0B0B0B'; ctx.fillRect(0, 0, AW, AH)

  // ── cover: the acid bloom + the rider ──
  ctx.fillStyle = '#141414'; ctx.fillRect(0, 0, AW, coverH)
  const halo = ctx.createRadialGradient(AW / 2, 250, 0, AW / 2, 250, 540)
  halo.addColorStop(0, 'rgba(200,255,0,0.20)'); halo.addColorStop(1, 'rgba(200,255,0,0)')
  ctx.fillStyle = halo; ctx.fillRect(0, 0, AW, coverH)

  if (avatar && avatar.width > 0 && avatar.height > 0) {
    // object-fit: cover, object-position: center 18% — same crop as the reveal.
    const scale = Math.max(AW / avatar.width, coverH / avatar.height)
    const dw = avatar.width * scale, dh = avatar.height * scale
    ctx.drawImage(avatar, (AW - dw) / 2, -(dh - coverH) * 0.18, dw, dh)
  } else {
    ctx.save()
    ctx.beginPath(); ctx.arc(AW / 2, coverH / 2 - 30, 168, 0, Math.PI * 2); ctx.closePath()
    ctx.fillStyle = '#202020'; ctx.fill()
    ctx.restore()
    text(ctx, d.avatarInitial, AW / 2, coverH / 2 + 30, 150, '700', '#6E7379', 0, 'center')
  }

  // confetti — the reveal's falling ribbons, frozen
  const CONF = ['#C8FF00', '#7B5CFF', '#00E5FF', '#FFB020', '#C8FF00', '#7B5CFF']
  CONF.forEach((c, i) => {
    ctx.save()
    ctx.translate(AW * (0.12 + i * 0.14), 70 + ((i * 97) % 260))
    ctx.rotate((i % 2 ? 0.5 : -0.35))
    ctx.fillStyle = c
    roundRect(ctx, -8, -18, 16, 36, 5); ctx.fill()
    ctx.restore()
  })

  // cover → panel fade
  const fade = ctx.createLinearGradient(0, coverH - 330, 0, coverH)
  fade.addColorStop(0, 'rgba(11,11,11,0)'); fade.addColorStop(1, '#0B0B0B')
  ctx.fillStyle = fade; ctx.fillRect(0, coverH - 330, AW, 330)

  // ── acid "AVATAR UNLOCKED" pill, straddling the seam ──
  const pillLabel = 'AVATAR UNLOCKED'
  ctx.font = `700 28px ${FONT}`
  const labelW = ctx.measureText(pillLabel).width + 3 * (pillLabel.length - 1)
  const pillW = labelW + 122, pillH = 72, pillX = (AW - pillW) / 2, pillY = coverH - 40
  ctx.save()
  ctx.shadowColor = 'rgba(200,255,0,0.55)'; ctx.shadowBlur = 44
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2)
  ctx.fillStyle = ACID; ctx.fill()
  ctx.restore()
  star(ctx, pillX + 44, pillY + pillH / 2, 15, '#121212')
  text(ctx, pillLabel, pillX + 74, pillY + pillH / 2 + 10, 28, '700', '#121212', 3)

  // ── handle chip + LVL badge (the reveal's identity row) ──
  const rowY = pillY + pillH + 86
  const av = 116
  ctx.save()
  ctx.beginPath(); ctx.arc(px + av / 2, rowY, av / 2, 0, Math.PI * 2); ctx.closePath()
  ctx.fillStyle = '#202020'; ctx.fill(); ctx.clip()
  if (avatar && avatar.width > 0) {
    const s = Math.max(av / avatar.width, av / avatar.height)
    ctx.drawImage(avatar, px + av / 2 - (avatar.width * s) / 2, rowY - (avatar.height * s) / 2, avatar.width * s, avatar.height * s)
  } else {
    text(ctx, d.avatarInitial, px + av / 2, rowY + 16, 46, '700', '#9BA0A6', 0, 'center')
  }
  ctx.restore()
  ctx.save()
  ctx.beginPath(); ctx.arc(px + av / 2, rowY, av / 2 - 3, 0, Math.PI * 2)
  ctx.strokeStyle = ACID; ctx.lineWidth = 6; ctx.stroke()
  ctx.restore()
  text(ctx, d.handle, px + av + 30, rowY - 4, 44, '700', '#FFFFFF')
  text(ctx, d.role, px + av + 30, rowY + 44, 30, '600', '#9BA0A6')

  const lvl = `LVL ${d.level}`
  ctx.font = `800 32px ${FONT}`
  const lvlW = ctx.measureText(lvl).width + 60
  roundRect(ctx, AW - px - lvlW, rowY - 32, lvlW, 64, 32)
  ctx.fillStyle = ACID; ctx.fill()
  text(ctx, lvl, AW - px - lvlW / 2, rowY + 11, 32, '800', '#121212', 0, 'center')

  // ── headline stat ──
  let y = rowY + 120
  if (d.headline) {
    for (const line of wrap(ctx, d.headline, 42, '600', AW - px * 2).slice(0, 2)) {
      text(ctx, line, px, y, 42, '600', 'rgba(255,255,255,0.86)')
      y += 56
    }
    y += 22
  }

  // ── three stat tiles (TOTAL DISTANCE / TOTAL RIDES / SADDLE TIME) ──
  const gap = 20, tileW = (AW - px * 2 - gap * 2) / 3, tileH = 186
  const tileY = Math.min(Math.max(y, coverH + 330), AH - tileH - 130)
  d.stats.forEach((s, i) => {
    const x = px + i * (tileW + gap)
    ctx.save()
    roundRect(ctx, x, tileY, tileW, tileH, 26)
    ctx.fillStyle = '#161616'; ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.stroke()
    ctx.restore()
    text(ctx, s.l, x + 28, tileY + 52, 22, '700', 'rgba(255,255,255,0.45)', 1)
    text(ctx, s.v, x + 28, tileY + 128, 46, '700', s.v === '—' ? '#6E7379' : '#FFFFFF')
  })

  // ── footer ──
  const fy = AH - 72
  if (d.footer) text(ctx, d.footer, px, fy, 26, '600', 'rgba(255,255,255,0.55)')
  star(ctx, AW - px - 150, fy - 8, 12, ACID)
  text(ctx, 'w3.ride', AW - px - 128, fy, 28, '700', '#FFFFFF')
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
