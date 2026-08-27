import { Suspense, lazy, useEffect, useState } from 'react'
import { W3_MAP } from './w3map'
import { T } from './w3tokens'

// The rig is a hook, not a component, and the lazy map is private to it —
// fast refresh only objects to the shape, not to anything real.
// eslint-disable-next-line react-refresh/only-export-components
const RouteMap = lazy(() => import('../../components/crew/RouteMap'))

/**
 * THE ROUTE ON THE REAL MAP, AS A PICTURE.
 *
 * A share card is a canvas, and a canvas cannot fetch map tiles — which is why
 * every template drew the route as a bare line on the ground. A line is a
 * diagram; the streets are what make a card a place the rider recognises, and
 * that is the whole difference between a chart and something worth posting.
 *
 * So the map is rendered ONCE, off to the side, and photographed. What comes
 * back is an ordinary data URL that every template can use as its background —
 * the same picture the reward screen shows, standing still.
 *
 * ── WHY IT IS MOUNTED AND NOT HIDDEN ─────────────────────────────────────
 * `display: none` gives WebGL a zero-sized drawing buffer and the snapshot
 * comes back blank. It is rendered at its real size, parked outside the
 * viewport, and removed the moment the picture is taken.
 *
 * ── AND WHY IT MAY RETURN NOTHING ────────────────────────────────────────
 * No WebGL, tiles blocked by the CSP, a ride with no GPS, a chunk that failed:
 * every one of those ends here as `null`, and the caller falls back to the
 * ground it drew before. A share screen that waits forever for a picture is
 * worse than one that never had it.
 */

/** Big enough to upscale into a 1080-wide card without mush, small enough that
 *  one offscreen WebGL surface is not an event. */
const SNAP_W = 720
const SNAP_H = 1280

/** If the tiles have not settled by now they are not coming — a blocked host
 *  fails silently, so the only way out is a clock. */
const GIVE_UP_MS = 6000

/**
 * THE RIDE GOES IN THE MIDDLE.
 *
 * Fitted to the frame the route runs edge to edge, and every card then prints
 * its headline over the top of the road and its tiles over the bottom of it.
 * The shape a rider recognises is the shape they can SEE, so the fit is pushed
 * into the middle band and the two ends are left to the type — the same reason
 * a poster leaves a margin, applied to a picture that has none.
 *
 * These are snapshot pixels (720x1280); the card is 1.5x that. 300 top and
 * bottom leaves the route the middle 53% of the card — clear of the headline
 * block above it and the tile row below.
 */
const FIT = { top: 300, bottom: 300, left: 72, right: 72 }

export function useRouteSnapshot(polyline: [number, number][] | null | undefined): {
  /** The map as a JPEG data URL, or null while it is coming / if it never does. */
  image: string | null
  /** Mount this somewhere in the tree. It removes itself once done. */
  rig: React.ReactNode
} {
  const usable = !!polyline && polyline.length > 1
  /** Identity of the ride this snapshot belongs to. Two different rides can
   *  have the same point count, so the first coordinate goes in too. */
  const key = usable ? `${polyline!.length}:${polyline![0][0]},${polyline![0][1]}` : null

  const [shot, setShot] = useState<{ key: string | null; image: string | null; done: boolean }>(
    { key: null, image: null, done: false },
  )
  // A NEW RIDE IS A NEW PICTURE, and that is derived during render rather than
  // reset in an effect: resetting state in an effect cascades a second render
  // and leaves one frame showing the previous ride's map. It also means there is
  // no "have we finished" flag to keep in sync — the key IS the flag.
  const current = shot.key === key ? shot : { key, image: null, done: false }
  const image = current.image
  const done = current.done

  /** Settle this ride's snapshot, once. A second answer (the give-up clock
   *  firing just as the tiles land) leaves the first one alone — which is why
   *  this reads the previous state rather than a ref: a ref written during
   *  render is a lie under concurrent rendering. */
  const settle = (url: string | null) => {
    setShot((prev) => (prev.key === key && prev.done ? prev : { key, image: url, done: true }))
  }

  useEffect(() => {
    if (!usable || done) return
    // Gave up; the caller keeps whatever ground it drew before.
    const t = window.setTimeout(
      () => setShot((prev) => (prev.key === key && prev.done ? prev : { key, image: null, done: true })),
      GIVE_UP_MS,
    )
    return () => window.clearTimeout(t)
  }, [usable, done, key])

  const rig = usable && !done ? (
    <div
      aria-hidden
      style={{
        position: 'fixed', left: -9999, top: 0, width: SNAP_W, height: SNAP_H,
        pointerEvents: 'none', opacity: 0,
      }}>
      <Suspense fallback={null}>
        <RouteMap
          polyline={polyline!}
          styleKey="dark"
          interactive={false}
          palette={W3_MAP}
          lineColor={T.acid}
          lineWidth={10}
          startColor={T.ink}
          endColor={T.acid}
          fitPadding={FIT}
          snapshot
          onSnapshot={(read) => {
            const url = read()
            // A blank read is a failure, not a picture: `toDataURL` on a lost
            // context returns a 1x1 placeholder rather than throwing.
            settle(url && url.length > 2048 ? url : null)
          }} />
      </Suspense>
    </div>
  ) : null

  return { image, rig }
}
