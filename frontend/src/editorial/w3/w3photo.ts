/**
 * Reading a photo off a phone, reliably.
 *
 * Every W3 studio flow (rider, bike, onboarding) starts by turning a picked
 * file into a downscaled JPEG data URL. That step used to be duplicated in
 * three pages, all with the same defect: a single `new Image()` decode.
 *
 * `new Image()` cannot decode HEIC/HEIF in most browsers — and a photo taken
 * straight from an iPhone camera roll IS HEIC. `<input accept="image/*">` hands
 * it over happily, the decode then fails, and because the failure happens
 * BEFORE any network call, the server logs stay completely empty. From the
 * outside that is indistinguishable from a broken upload pipeline; it cost a
 * production debugging session to find, which is why it lives in one place now.
 *
 * So: `createImageBitmap` first (handles more container formats and is the
 * faster path), `<img>` as the fallback, and errors that NAME the format
 * instead of saying "bad image".
 */

/** Downscale a picked photo to a JPEG data URL. The vision model needs shape
 *  and colour, not megapixels — and the request has to stay small. */
export async function fileToDownscaledDataUrl(file: File, max = 1024): Promise<string> {
  const src = await decode(file)
  const w = src.width
  const h = src.height
  if (!w || !h) throw new Error(`Bild ohne Maße (${file.type || 'unbekanntes Format'})`)

  const scale = Math.min(1, max / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Dieser Browser gibt uns kein 2D-Canvas.')
  ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height)
  if ('close' in src) src.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file) } catch { /* fall through to <img> */ }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error(`Dieses Foto ließ sich nicht lesen (${file.type || 'unbekanntes Format'}).`))
    }
    img.src = url
  })
}
