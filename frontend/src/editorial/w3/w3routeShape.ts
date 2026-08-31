/**
 * W3 · One projector for a ride's outline.
 *
 * Extracted from `W3RouteCard`, which drew the first of these and made the
 * argument the rest of the app now leans on: at thumbnail size a basemap is
 * noise — no label is legible, no road distinguishable — but the SHAPE is
 * recognisable, because a rider knows their own loop by its outline.
 *
 * It lives in its own module because a second copy of this maths would drift.
 * Latitude is compressed by cos(lat) so the loop keeps its real proportions: at
 * 52° N an uncorrected drawing is about 40 % too wide, which is exactly the
 * error a rider spots on roads they know.
 *
 * `[lat, lng]` order throughout — the order the API sends and the order
 * `W3RouteCard` already used. Returns null for anything that cannot be drawn
 * honestly (fewer than two points), so every caller has one obvious branch for
 * "this ride has no map" rather than inventing a shape for it.
 */

export interface RouteShape {
  /** SVG path data for the track. */
  d: string
  /** Projected points, so a caller can mark the start/finish. */
  pts: [number, number][]
}

export function projectRouteShape(
  poly: [number, number][] | null | undefined,
  width: number,
  height: number = width,
  pad = 12,
): RouteShape | null {
  if (!poly || poly.length < 2) return null

  const lats = poly.map((p) => p[0])
  const lngs = poly.map((p) => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  if (!Number.isFinite(minLat) || !Number.isFinite(minLng)) return null

  const kx = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const gw = (maxLng - minLng) * kx || 1e-6
  const gh = maxLat - minLat || 1e-6
  const scale = Math.min((width - 2 * pad) / gw, (height - 2 * pad) / gh)
  const ox = pad + (width - 2 * pad - gw * scale) / 2
  const oy = pad + (height - 2 * pad - gh * scale) / 2

  const pts = poly.map(([lat, lng]): [number, number] => [
    ox + (lng - minLng) * kx * scale,
    oy + (maxLat - lat) * scale,
  ])

  return {
    pts,
    d: pts
      .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(' '),
  }
}
