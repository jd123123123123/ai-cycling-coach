import { useEffect, useState } from 'react'

/**
 * White-ground catalogue art → a true cut-out, in the browser.
 *
 * The catalogue bikes are square product shots on pale studio paper. Drawn
 * straight onto the dark stage they are a pale slab with four edges — the one
 * thing the room's design cannot absorb. Two rejected fixes, both measured:
 *
 *  - A CSS multiply blend: any ancestor that forms a stacking context (a
 *    z-index, an animated opacity — the stage has both, for good reasons)
 *    isolates the blend and the art silently reverts to a slab.
 *  - A luminance key: the ground is NOT white — it measures ~180–200 neutral
 *    grey with a vignette, exactly the range of the bikes' own chrome. A
 *    threshold that removes the ground eats the fenders.
 *
 * So the ground is removed by CONNECTIVITY, not colour alone: a flood fill
 * from the image border eats every near-neutral pale pixel REACHABLE from the
 * edge — the ground and the cast shadow — and stops at the machine's
 * silhouette, because chrome inside the bike is not connected to the border.
 * One dilation pass feathers the rim. Cached per URL for the session.
 *
 * This only ever runs on OUR generated catalogue art, whose ground is known
 * to be pale and neutral by prompt construction. It is not a general-purpose
 * background remover and must not be pointed at photographs.
 */

const cache = new Map<string, string | null>()

/** Longest edge the working canvas keeps — the stage draws ~a third of this. */
const MAX_EDGE = 896

/** A ground candidate: pale and near-neutral. Deliberately generous downward
 *  (vignetted corners, the cast shadow) — connectivity is the real filter. */
const isGroundish = (r: number, g: number, b: number): boolean => {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  return mn > 128 && mx - mn < 30
}

function cutout(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    img.onerror = () => resolve(null)
    img.onload = () => {
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
        const w = Math.round(img.naturalWidth * scale)
        const h = Math.round(img.naturalHeight * scale)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, w, h)
        const im = ctx.getImageData(0, 0, w, h)
        const d = im.data

        // ── flood fill from every border pixel that looks like ground ──
        const drop = new Uint8Array(w * h)
        const stack: number[] = []
        const tryPush = (idx: number) => {
          if (drop[idx]) return
          const o = idx * 4
          if (isGroundish(d[o], d[o + 1], d[o + 2])) {
            drop[idx] = 1
            stack.push(idx)
          }
        }
        for (let x = 0; x < w; x++) { tryPush(x); tryPush((h - 1) * w + x) }
        for (let y = 0; y < h; y++) { tryPush(y * w); tryPush(y * w + w - 1) }
        while (stack.length) {
          const idx = stack.pop() as number
          const x = idx % w
          const y = (idx - x) / w
          if (x > 0) tryPush(idx - 1)
          if (x < w - 1) tryPush(idx + 1)
          if (y > 0) tryPush(idx - w)
          if (y < h - 1) tryPush(idx + w)
        }

        // ── second pass: ENCLOSED ground pockets ────────────────────────
        // The frame triangle seals a patch of paper the border flood cannot
        // reach. Remaining ground-ish pixels are grouped into connected
        // components; a component is dropped only when it is LARGE and
        // UNIFORM — the statistics of studio paper (spread ~6, near-constant
        // brightness), which chrome never has (reflections vary hard).
        {
          const seen = new Uint8Array(w * h)
          const comp: number[] = []
          for (let start = 0; start < w * h; start++) {
            if (drop[start] || seen[start]) continue
            const o0 = start * 4
            if (!isGroundish(d[o0], d[o0 + 1], d[o0 + 2])) { seen[start] = 1; continue }
            comp.length = 0
            comp.push(start); seen[start] = 1
            let head = 0
            let sumMin = 0, sumSq = 0, sumSpread = 0
            while (head < comp.length) {
              const idx = comp[head++]
              const o = idx * 4
              const mn = Math.min(d[o], d[o + 1], d[o + 2])
              const mx = Math.max(d[o], d[o + 1], d[o + 2])
              sumMin += mn; sumSq += mn * mn; sumSpread += mx - mn
              const x = idx % w, y = (idx - x) / w
              for (const nIdx of [idx - 1, idx + 1, idx - w, idx + w]) {
                const nx = nIdx % w, ny = (nIdx - nx) / w
                if (nIdx < 0 || nIdx >= w * h || Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) continue
                if (seen[nIdx] || drop[nIdx]) continue
                const no = nIdx * 4
                if (isGroundish(d[no], d[no + 1], d[no + 2])) { seen[nIdx] = 1; comp.push(nIdx) }
              }
            }
            const n = comp.length
            if (n < 350) continue
            const mean = sumMin / n
            const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
            const meanSpread = sumSpread / n
            // Paper: bright, near-neutral, near-constant. Chrome fails at
            // least one of the three (its reflections swing hard).
            if (mean > 150 && std < 22 && meanSpread < 18) for (const idx of comp) drop[idx] = 1
          }
        }

        // ── apply, with a one-pixel feather so the rim doesn't cut hard ──
        for (let i = 0; i < w * h; i++) if (drop[i]) d[i * 4 + 3] = 0
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const i = y * w + x
            if (drop[i]) continue
            if (drop[i - 1] || drop[i + 1] || drop[i - w] || drop[i + w]) {
              d[i * 4 + 3] = Math.round(d[i * 4 + 3] * 0.45)
            }
          }
        }

        // ── trim to the machine's bounding box ──────────────────────────
        // The art keeps paper margin under the wheels; without a trim the
        // bike floats that margin above the stage's floor line.
        let minX = w, maxX = -1, minY = h, maxY = -1
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (d[(y * w + x) * 4 + 3] > 8) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
        if (maxX <= minX || maxY <= minY) return resolve(null)
        ctx.putImageData(im, 0, 0)
        const out = document.createElement('canvas')
        out.width = maxX - minX + 1
        out.height = maxY - minY + 1
        const octx = out.getContext('2d')
        if (!octx) return resolve(null)
        octx.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
        resolve(out.toDataURL('image/png'))
      } catch {
        // A tainted canvas or a blocked read — the caller keeps the original.
        resolve(null)
      }
    }
    img.src = src
  })
}

/**
 * @returns the cut-out data URL once ready; the ORIGINAL src while processing
 * or if the pass fails — the art is never blank, merely briefly squarer.
 */
export function useCutout(src: string | null | undefined, enabled: boolean): string | null {
  const [out, setOut] = useState<string | null>(() =>
    src && enabled ? cache.get(src) ?? null : null)

  useEffect(() => {
    if (!src || !enabled) return setOut(null)
    const known = cache.get(src)
    if (known !== undefined) return setOut(known)
    let alive = true
    void cutout(src).then((u) => {
      cache.set(src, u)
      if (alive) setOut(u)
    })
    return () => { alive = false }
  }, [src, enabled])

  return enabled ? out ?? src ?? null : null
}
