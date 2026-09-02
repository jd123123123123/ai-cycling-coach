import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { T } from './w3tokens'
import { TNUM } from './w3surfaces'
import { W3_MAP } from './w3map'
import { projectRouteShape } from './w3routeShape'

const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/**
 * W3 · THE RIDE MAP — a real basemap under a feed post's track.
 *
 * ── WHY THE SVG COULD NOT JUST SIT ON TOP OF IT ──────────────────────────
 *
 * The obvious build is to keep the hand-drawn SVG track and slide a map behind
 * it. It does not work: `projectRouteShape` scales lat/lng LINEARLY into a box,
 * and the basemap is Web Mercator. The two disagree by more the further from
 * the equator you ride, so the branded line would sit visibly off its own
 * geography — a route through a river rather than along it.
 *
 * So the map owns the track. `RouteMap` draws the line in the projection it
 * shares with the tiles, and this component supplies the tint, the markers and
 * the scrub. The SVG stays as the FALLBACK underneath: it is what a rider sees
 * before MapLibre resolves, and permanently if the tile host is unreachable or
 * WebGL is unavailable. A feed post must render its ride without a network map.
 *
 * ── ONE WEBGL CONTEXT PER POST IS NOT FREE ───────────────────────────────
 *
 * A browser gives a page somewhere around sixteen WebGL contexts, and a feed is
 * an unbounded list. Mounting a map per post would work for the first screen
 * and then silently start losing them — the classic version of this bug, where
 * the tenth card down is blank and nothing in the console explains it.
 *
 * So the map mounts only while the post is near the viewport and unmounts once
 * it is well past. Two or three are alive at a time, whatever the feed's
 * length, and the SVG is what the rest of the list draws — which is also why
 * the fallback had to be good rather than a placeholder.
 */

export interface RideMapSceneProps {
  polyline: [number, number][]
  w: number
  h: number
  tint: string
  /** Total ride distance, for the scrub readout. */
  distanceM: number
  onScrub?: (holding: boolean) => void
}

const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

/** Cumulative great-circle-ish length along the real polyline. Equirectangular
 *  is plenty at ride scale and avoids a trig call per point. */
function cumulativeGeo(poly: [number, number][]): number[] {
  const out = [0]
  for (let i = 1; i < poly.length; i++) {
    const [la, lo] = poly[i - 1]
    const [lb, lob] = poly[i]
    const mLat = ((la + lb) / 2) * (Math.PI / 180)
    const dx = (lob - lo) * Math.cos(mLat)
    const dy = lb - la
    out.push(out[i - 1] + Math.hypot(dx, dy))
  }
  return out
}

export default function RideMapScene({
  polyline, w, h, tint, distanceM, onScrub,
}: RideMapSceneProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const [near, setNear] = useState(false)
  const [ready, setReady] = useState(false)
  const [at, setAt] = useState<number | null>(null)

  // Near, not merely visible: a map that begins loading only as its card
  // crosses the fold arrives after the rider is already looking at it.
  useEffect(() => {
    const el = host.current
    if (!el || typeof IntersectionObserver !== 'function') { setNear(true); return }
    const io = new IntersectionObserver(
      ([e]) => setNear(e.isIntersecting),
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const cum = useMemo(() => cumulativeGeo(polyline), [polyline])
  const total = cum.length ? cum[cum.length - 1] : 0
  const fallback = useMemo(() => projectRouteShape(polyline, w, h, 16), [polyline, w, h])

  const marker = useMemo<[number, number] | null>(() => {
    if (at == null || total <= 0) return null
    const want = at * total
    let i = 1
    while (i < cum.length && cum[i] < want) i++
    const a = polyline[i - 1], b = polyline[i] ?? polyline[i - 1]
    const span = cum[i] - cum[i - 1] || 1
    const f = Math.max(0, Math.min(1, (want - cum[i - 1]) / span))
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  }, [at, cum, total, polyline])

  const track = useCallback((clientX: number) => {
    const el = host.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setAt(Math.max(0, Math.min(1, (clientX - r.left) / r.width)))
  }, [])
  const release = useCallback(() => { setAt(null); onScrub?.(false) }, [onScrub])

  return (
    <div
      ref={host}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        // The drag is the scrub; `touchAction` keeps a vertical swipe scrolling
        // the feed rather than being eaten by the card.
        touchAction: 'pan-y', userSelect: 'none', WebkitUserSelect: 'none',
      }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onScrub?.(true); track(e.clientX) }}
      onPointerMove={(e) => { if (at != null) track(e.clientX) }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
    >
      {/* THE FALLBACK, UNDERNEATH AND ALWAYS DRAWN. It is what the far end of
          a long feed shows, so it is a real drawing rather than a spinner. */}
      {fallback && (
        <motion.svg
          width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
          aria-hidden
          animate={{ opacity: ready ? 0 : 1 }}
          transition={{ duration: 0.4 }}
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <path d={fallback.d} fill="none" stroke={`${tint}26`} strokeWidth={9}
            strokeLinecap="round" strokeLinejoin="round" />
          <path d={fallback.d} fill="none" stroke={tint} strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" />
        </motion.svg>
      )}

      {near && (
        <Suspense fallback={null}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }}
            transition={{ duration: 0.45 }}
            style={{ position: 'absolute', inset: 0 }}
          >
            <RouteMap
              polyline={polyline}
              styleKey="dark"
              interactive={false}
              palette={W3_MAP}
              lineColor={tint}
              lineWidth={4}
              startColor={T.ink}
              endColor={tint}
              markerLatLng={marker}
              fitPadding={{ top: 74, bottom: 62, left: 26, right: 26 }}
              onReady={() => setReady(true)}
            />
          </motion.div>
        </Suspense>
      )}

      {/* The readout rides above the map, in HTML rather than inside the SVG —
          the SVG is a fallback that fades out, and the number must not go with
          it the moment the tiles land. */}
      {at != null && (
        <div style={{
          position: 'absolute', top: 10, left: 0, right: 0, display: 'grid', placeItems: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            ...TNUM, fontSize: 13, fontWeight: 700, color: T.ink,
            padding: '5px 11px', borderRadius: 100, background: `${T.bg}D9`,
          }}>{nf1.format((distanceM / 1000) * at)} km</span>
        </div>
      )}
    </div>
  )
}
