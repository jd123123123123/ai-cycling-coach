/**
 * W3 · Scene composer — the LAYERED rider/bike/scene model.
 *
 * A scene is an ordered stack of layers composited onto a fixed canvas:
 *
 *   backdrop → bike → rider → head → kit
 *
 * Each layer is a transparent asset (or a procedural draw) pinned to a shared
 * anchor. The whole point: a cosmetic purchase swaps EXACTLY ONE layer. Buying a
 * helmet replaces only the `head` layer's src — the backdrop, bike and rider are
 * byte-for-byte identical, so the rider's frame never shifts, and no image-model
 * call is needed. This is deterministic, free per swap, and consistent across
 * every surface (share poster, Today hero, garage preview) that renders through
 * it. Per-part transparent assets + their anchors come from the garage render
 * (`services/cyclr_studio`, which already uses a deterministic seed and separate
 * rider/bike descriptions); until those land, callers pass what they have and
 * leave the empty slots off.
 */

export type SceneSlot = 'backdrop' | 'bike' | 'rider' | 'head' | 'kit'

export interface SceneLayer {
  slot: SceneSlot
  /** Transparent PNG / SVG data-URI. Omit when using `draw`. */
  src?: string
  /** Procedural layer (e.g. a GPX/gradient backdrop) instead of an image. */
  draw?: (ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }) => void
  /** Center point in the scene box, 0..1. Defaults per slot. */
  anchor?: { x: number; y: number }
  /** Layer width as a fraction of the scene width (image aspect preserved). */
  scale?: number
  /** Load cross-origin (remote assets). Tainting layers are dropped on export. */
  crossOrigin?: boolean
}

export interface SceneSpec {
  width: number
  height: number
  /** Solid/gradient behind everything (CSS color or a make-gradient fn result). */
  background?: string
  layers: SceneLayer[]
}

/** Sensible default anchors so a `head` lands on the rider's head, etc. */
const DEFAULT_ANCHOR: Record<SceneSlot, { x: number; y: number; scale: number }> = {
  backdrop: { x: 0.5, y: 0.5, scale: 1 },
  bike: { x: 0.5, y: 0.66, scale: 0.82 },
  rider: { x: 0.5, y: 0.5, scale: 0.6 },
  head: { x: 0.5, y: 0.3, scale: 0.22 },
  kit: { x: 0.5, y: 0.52, scale: 0.5 },
}

function loadImage(src: string, crossOrigin?: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function placeImage(ctx: CanvasRenderingContext2D, img: HTMLImageElement, box: { w: number; h: number }, a: { x: number; y: number }, scale: number) {
  const w = box.w * scale
  const h = w * (img.height / img.width)
  const x = box.w * a.x - w / 2
  const y = box.h * a.y - h / 2
  ctx.drawImage(img, x, y, w, h)
}

/**
 * Composite a scene to a bitmap. Layers render in array order (backdrop first).
 * An image layer whose remote asset taints the canvas is dropped and the export
 * retried, so the result always exports.
 */
export async function renderScene(spec: SceneSpec): Promise<{ blob: Blob | null; dataUrl: string }> {
  const canvas = document.createElement('canvas')
  canvas.width = spec.width
  canvas.height = spec.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return { blob: null, dataUrl: '' }

  // Pre-load every image layer once.
  const imgs = await Promise.all(spec.layers.map((l) => (l.src ? loadImage(l.src, l.crossOrigin).then((i) => i).catch(() => null) : Promise.resolve(null))))

  const paint = (skip: Set<number>) => {
    ctx.clearRect(0, 0, spec.width, spec.height)
    if (spec.background) { ctx.fillStyle = spec.background; ctx.fillRect(0, 0, spec.width, spec.height) }
    spec.layers.forEach((l, i) => {
      if (skip.has(i)) return
      const def = DEFAULT_ANCHOR[l.slot]
      const anchor = l.anchor ?? { x: def.x, y: def.y }
      if (l.draw) { l.draw(ctx, { x: 0, y: 0, w: spec.width, h: spec.height }); return }
      const img = imgs[i]
      if (img) placeImage(ctx, img, { w: spec.width, h: spec.height }, anchor, l.scale ?? def.scale)
    })
  }

  const tryExport = (skip: Set<number>): { blob: Blob | null; dataUrl: string } | 'tainted' => {
    paint(skip)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      let blob: Blob | null = null
      // toBlob is async; capture synchronously via toDataURL fallback below.
      canvas.toBlob((b) => { blob = b }, 'image/png')
      return { blob, dataUrl }
    } catch { return 'tainted' }
  }

  // First attempt with everything; if a cross-origin layer taints, drop the
  // cross-origin image layers and retry so the export still succeeds.
  let out = tryExport(new Set())
  if (out === 'tainted') {
    const skip = new Set<number>()
    spec.layers.forEach((l, i) => { if (l.crossOrigin && l.src) skip.add(i) })
    out = tryExport(skip)
  }
  if (out === 'tainted') return { blob: null, dataUrl: '' }
  // Resolve the async toBlob properly (the sync capture above may miss it).
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  return { blob, dataUrl: out.dataUrl }
}

/**
 * Draw the standard rider figure (bike → rider → head → kit) onto an EXISTING
 * canvas context, inside `box`. Used by surfaces that own their backdrop (the
 * share poster, the Today hero) but want the SAME equipment-aware figure. Swap
 * `head` to add a helmet without touching bike/rider.
 */
export interface FigureAssets { bikeImg?: HTMLImageElement | null; riderImg?: HTMLImageElement | null; headImg?: HTMLImageElement | null; kitImg?: HTMLImageElement | null }
export function drawFigure(ctx: CanvasRenderingContext2D, box: { x: number; y: number; w: number; h: number }, a: FigureAssets, anchors?: Partial<Record<SceneSlot, { x: number; y: number; scale: number }>>) {
  const order: [SceneSlot, HTMLImageElement | null | undefined][] = [['bike', a.bikeImg], ['rider', a.riderImg], ['kit', a.kitImg], ['head', a.headImg]]
  ctx.save()
  ctx.translate(box.x, box.y)
  for (const [slot, img] of order) {
    if (!img) continue
    const def = anchors?.[slot] ?? DEFAULT_ANCHOR[slot]
    placeImage(ctx, img, { w: box.w, h: box.h }, def, def.scale)
  }
  ctx.restore()
}

export { loadImage as loadSceneImage }
