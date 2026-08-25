/**
 * "Find me a picture from during that ride."
 *
 * WHAT THE WEB ACTUALLY ALLOWS, and why this is the honest shape of that
 * feature. A browser cannot read a phone's photo library — there is no API that
 * lists it, and none that queries it by time or place. The only door is
 * `<input type="file">`, which the rider opens themselves and which hands back
 * exactly the files they picked. Anything promising "we searched your camera
 * roll for this ride" would be a lie about where the pictures came from.
 *
 * So the rider multi-selects, and we do the part a person is bad at: read each
 * file's own EXIF capture time and say which ones were taken while they were
 * riding. Picking twenty photos and being told "four of these are from this
 * ride" is the feature; scanning a library is not on offer to anybody.
 *
 * Everything here happens on the device. No file is uploaded to find out.
 */

/** A photo the rider chose, with whatever we could learn about when it was taken. */
export interface RidePhoto {
  file: File
  /** EXIF DateTimeOriginal, or the file's own lastModified as a weak fallback. */
  takenAt: Date | null
  /** True when `takenAt` came from EXIF rather than the filesystem. */
  exact: boolean
  /** Taken between the ride's first and last pedal stroke. */
  duringRide: boolean
}

/** How far outside the ride still counts — the café stop, the car park photo. */
const GRACE_MINUTES = 20

/**
 * EXIF DateTimeOriginal, read from the first 128 kB of a JPEG.
 *
 * Hand-rolled rather than pulled from a library: this needs six fields out of
 * one tag, and the smallest EXIF package is larger than the entire share
 * screen. Returns null for anything that is not a JPEG with that tag — HEIC,
 * PNG, a screenshot, a photo whose metadata the OS stripped on export.
 */
export async function readExifTakenAt(file: File): Promise<Date | null> {
  try {
    const head = await file.slice(0, 128 * 1024).arrayBuffer()
    const view = new DataView(head)
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null   // not a JPEG

    let offset = 2
    while (offset + 4 < view.byteLength) {
      if (view.getUint16(offset) !== 0xffe1) {          // not APP1; skip the segment
        const size = view.getUint16(offset + 2)
        if (size <= 0) return null
        offset += 2 + size
        continue
      }
      const app1 = offset + 4
      if (view.getUint32(app1) !== 0x45786966) return null    // "Exif"
      const tiff = app1 + 6
      const little = view.getUint16(tiff) === 0x4949
      const ifd0 = tiff + view.getUint32(tiff + 4, little)
      const found = findDateTag(view, tiff, ifd0, little, 0)
      return found ? parseExifDate(found) : null
    }
    return null
  } catch {
    return null   // a file we cannot read is a file with no timestamp
  }
}

/** 0x9003 DateTimeOriginal, following the ExifIFD pointer (0x8769) once. */
function findDateTag(
  view: DataView, tiff: number, ifd: number, little: boolean, depth: number,
): string | null {
  if (depth > 1 || ifd + 2 > view.byteLength) return null
  const count = view.getUint16(ifd, little)
  let sub: number | null = null

  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > view.byteLength) return null
    const tag = view.getUint16(entry, little)
    if (tag === 0x9003 || tag === 0x0132) {
      const len = view.getUint32(entry + 4, little)
      const at = tiff + view.getUint32(entry + 8, little)
      if (at + len > view.byteLength) return null
      let s = ''
      for (let c = 0; c < len - 1; c++) s += String.fromCharCode(view.getUint8(at + c))
      if (tag === 0x9003) return s          // the real one; take it immediately
      sub = sub ?? null
    }
    if (tag === 0x8769) sub = tiff + view.getUint32(entry + 8, little)
  }
  return sub != null ? findDateTag(view, tiff, sub, little, depth + 1) : null
}

/** "2026:08:23 06:41:12" — EXIF's own format, which `Date` will not parse. */
function parseExifDate(s: string): Date | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, sec] = m
  const date = new Date(+y, +mo - 1, +d, +h, +mi, +sec)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Sort the rider's picks into "from this ride" and "not".
 *
 * A photo with no readable timestamp is NOT claimed as being from the ride —
 * it stays offered, unlabelled. Guessing would put a picture from last summer
 * under today's numbers, which is the one thing this must never do.
 */
export async function sortByRideWindow(
  files: File[], startedAt: Date, movingSeconds: number,
): Promise<RidePhoto[]> {
  const from = startedAt.getTime() - GRACE_MINUTES * 60_000
  const to = startedAt.getTime() + movingSeconds * 1000 + GRACE_MINUTES * 60_000

  return Promise.all(files.map(async (file) => {
    const exif = await readExifTakenAt(file)
    const takenAt = exif ?? (file.lastModified ? new Date(file.lastModified) : null)
    const exact = exif != null
    const t = takenAt?.getTime()
    return {
      file,
      takenAt,
      exact,
      // Only an EXIF time is evidence. `lastModified` is when the file was
      // written to disk — a photo AirDropped tonight would claim to be from
      // tonight's ride, so it is shown but never asserted.
      duringRide: exact && t != null && t >= from && t <= to,
    }
  }))
}

/** "4 von 18 Bildern sind von dieser Fahrt" — or the honest absence of that. */
export function windowSummary(photos: RidePhoto[]): string | null {
  if (photos.length === 0) return null
  const hits = photos.filter((p) => p.duringRide).length
  if (hits === 0) {
    return photos.some((p) => p.exact)
      ? 'Keins davon wurde während dieser Fahrt aufgenommen'
      : 'Keine Aufnahmezeit in diesen Bildern — du wählst selbst'
  }
  return hits === 1
    ? '1 Bild ist von dieser Fahrt'
    : `${hits} Bilder sind von dieser Fahrt`
}
