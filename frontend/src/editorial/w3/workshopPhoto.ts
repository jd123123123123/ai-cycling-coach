/**
 * Turning a phone photo into something worth sending.
 *
 * A modern phone camera produces 3-12 MB of JPEG, and every byte of it travels
 * as base64 inside a JSON body — a 40 % larger payload again — for a check that
 * only needs to see whether a chain is bright or black. On the garage wifi that
 * is slow; on a phone in an actual garage it is a failed request, which would
 * cost the rider a bonus for a job they really did.
 *
 * So the longest edge is capped and the quality dropped to where component
 * condition is still obvious. Vision models read this size perfectly well; what
 * they cannot read is a request that timed out.
 */

/** Longest edge, in pixels. Comfortably above what the check needs and far
 *  below what a phone hands us. */
const MAX_EDGE = 1024
const QUALITY = 0.72

/**
 * @returns a `data:image/jpeg;base64,...` URL, or null if the file could not be
 *   decoded. Null is not an error worth surfacing — the caller services WITHOUT
 *   proof, which still pays the full Service Bonus.
 */
export function readPhoto(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.onload = () => {
      URL.revokeObjectURL(url)
      try {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
        const c = document.createElement('canvas')
        c.width = Math.round(img.naturalWidth * scale)
        c.height = Math.round(img.naturalHeight * scale)
        const ctx = c.getContext('2d')
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', QUALITY))
      } catch {
        resolve(null)
      }
    }
    img.src = url
  })
}

/** ISO date (YYYY-MM-DD) for "this many days ago", in the rider's own local
 *  calendar rather than UTC — "vor 3 Monaten" must mean their 3 months. */
export function daysAgoISO(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** The quick answers to "wann zuletzt?".
 *
 *  Chips rather than a date picker as the PRIMARY path, because nobody knows
 *  the date they last oiled their chain — they know "ein paar Wochen". A rough
 *  answer replayed against the real ride history is far more accurate than an
 *  exact-looking date the rider guessed, and much likelier to be given at all.
 *  The date field stays available underneath for anyone who does know. */
export const WHEN_CHIPS: { label: string; days: number }[] = [
  { label: 'Diese Woche', days: 3 },
  { label: 'Vor 2 Wochen', days: 14 },
  { label: 'Vor 1 Monat', days: 30 },
  { label: 'Vor 3 Monaten', days: 91 },
  { label: 'Vor 6 Monaten', days: 182 },
  { label: 'Über ein Jahr', days: 400 },
]
