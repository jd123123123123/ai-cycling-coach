import { useEffect, useState } from 'react'

/**
 * The colour a picture ENDS in, so the app can carry on in it.
 *
 * THE PROBLEM THIS SOLVES. A rendered stage is a rectangle, and a rectangle on
 * a page has an edge. Every attempt to hide that edge from the outside — a
 * screen blend, a radial mask, a scrim, a gradient scrim over the scrim — is a
 * way of apologising for a seam that is still there, and each one costs
 * contrast or invents a colour that belongs to neither side.
 *
 * The seam disappears on its own the moment the page continues in EXACTLY the
 * colour the image finishes with. So rather than choosing a background and
 * hoping it matches, we read the bottom edge of the picture and make that the
 * background. Change the stage — the black studio, the Dolomites, a place a
 * rider bought last week — and the whole screen follows it, because the number
 * comes from the picture rather than from a token someone tuned once.
 *
 * HOW. One 1×1 canvas draw of the image's bottom strip, which averages it in
 * hardware. Cached per URL for the session: a stage changes when a rider
 * chooses one, not on every render.
 *
 * SAME-ORIGIN ONLY, and that is why this is safe. Every plate is served from
 * our own host or is a `data:` URL, so the canvas is never tainted. If one ever
 * is, `getImageData` throws, we return null, and the caller keeps its token
 * colour — the app looks exactly as it did before this file existed.
 */
const cache = new Map<string, string | null>()

/** How much of the bottom of the picture counts as "the ground". */
const STRIP = 0.08

function sample(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onerror = () => resolve(null)
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 1
        c.height = 1
        const ctx = c.getContext('2d', { willReadFrequently: false })
        if (!ctx) return resolve(null)
        // Draw ONLY the bottom strip, squashed into a single pixel: the GPU
        // averages it for us, which is both faster and steadier than reading a
        // row and averaging in JS.
        const h = Math.max(1, Math.round(img.naturalHeight * STRIP))
        ctx.drawImage(img, 0, img.naturalHeight - h, img.naturalWidth, h, 0, 0, 1, 1)
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
        resolve(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`)
      } catch {
        // A tainted canvas, or a browser refusing the read. Not an error worth
        // surfacing: the caller has a perfectly good colour already.
        resolve(null)
      }
    }
    img.src = src
  })
}

/**
 * @param src the picture the page should continue from, or null
 * @returns a hex colour, or null while it loads and if it cannot be read
 */
export function useGroundColour(src: string | null | undefined): string | null {
  const [hex, setHex] = useState<string | null>(() => (src ? cache.get(src) ?? null : null))

  useEffect(() => {
    if (!src) return setHex(null)
    const known = cache.get(src)
    if (known !== undefined) return setHex(known)

    let alive = true
    void sample(src).then((c) => {
      cache.set(src, c)
      if (alive) setHex(c)
    })
    return () => { alive = false }
  }, [src])

  return hex
}
