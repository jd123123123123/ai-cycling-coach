import { useCallback, useMemo, useRef, useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { T, FONT } from './w3tokens'
import RideMapScene from './W3RideMap'

/**
 * W3 · THE MEDIA SLOT — what stands where the photograph goes.
 *
 * ── THE ROUTE IS ALWAYS WORTH SHOWING ────────────────────────────────────
 *
 * A ride with a GPS track has a picture whether or not anybody took one: the
 * shape of where it went, on a real basemap. So the slot is never empty for
 * such a ride, and the earlier version of this card — which showed nothing
 * until a photo existed — was throwing away the one image every outdoor ride
 * already has.
 *
 * ── AND THE PHOTOGRAPH GOES FIRST ────────────────────────────────────────
 *
 * With a photo the slot becomes a slider: the photograph at position one, the
 * map at position two. That order is not arbitrary. A photo is why somebody
 * stops scrolling; the map is why they stay. Putting the map first would open
 * every card on the same dark rectangle.
 *
 * Native scroll-snap rather than a carousel library — the gesture is a
 * horizontal swipe, which the browser already does better than any JS, and it
 * keeps momentum, rubber-banding and accessibility for free. `touchAction`
 * lets a vertical swipe fall through to the feed, so the card never traps a
 * scroll.
 *
 * ── ONE WEBGL CONTEXT, AND ONLY WHEN SEEN ────────────────────────────────
 *
 * `RideMapScene` mounts its map only within 600px of the viewport and unmounts
 * past it, which matters more here than before: a feed of ten rides is now ten
 * potential maps, and a browser gives a page around sixteen GL contexts. The
 * slide being off to the side horizontally does not save us — the observer
 * measures the viewport, so a card in view has its map in view — but the
 * vertical bound still holds the count to what is on screen.
 */

export interface W3RideMediaProps {
  photoUrls: string[]
  route: [number, number][] | null
  distanceM: number
  height: number
  width: number
  tint: string
  /** Your own ride: the way to add a picture, without losing the map. */
  onAddPhoto?: () => void
  /** Told while the rider is holding the track, so the card can stand down. */
  onScrub?: (holding: boolean) => void
}

export default function W3RideMedia({
  photoUrls, route, distanceM, height, width, tint, onAddPhoto, onScrub,
}: W3RideMediaProps) {
  const scroller = useRef<HTMLDivElement | null>(null)
  const [at, setAt] = useState(0)

  const hasRoute = !!(route && route.length >= 2)
  const slides = useMemo(
    () => [...photoUrls.map((url) => ({ kind: 'photo' as const, url })),
           ...(hasRoute ? [{ kind: 'map' as const, url: null }] : [])],
    [photoUrls, hasRoute],
  )

  // Which slide is under the viewport's centre. Read from scrollLeft rather
  // than tracked in state per slide, so it stays correct after a fling.
  const onScroll = useCallback(() => {
    const el = scroller.current
    if (!el) return
    setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
  }, [])

  if (slides.length === 0) return null

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div
        ref={scroller}
        onScroll={onScroll}
        style={{
          display: 'flex', width: '100%', height: '100%',
          overflowX: slides.length > 1 ? 'auto' : 'hidden',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          // A vertical swipe belongs to the feed; only the horizontal one is
          // ours. Without this the card eats the scroll on a phone.
          touchAction: 'pan-y',
          scrollbarWidth: 'none',
          overscrollBehaviorX: 'contain',
        }}
      >
        {slides.map((s, i) => (
          <div key={s.kind === 'photo' ? s.url : 'map'} style={{
            position: 'relative', flex: '0 0 100%', width: '100%', height: '100%',
            scrollSnapAlign: 'start', background: T.heroDock,
          }}>
            {s.kind === 'photo' ? (
              <img src={s.url ?? ''} alt="" style={{
                display: 'block', width: '100%', height: '100%', objectFit: 'cover',
              }} />
            ) : (
              // Only the map slide gets the scrub, and only once it is the one
              // being looked at — a drag on a slide off to the side would be
              // the swipe, not a scrub.
              <RideMapScene
                polyline={route as [number, number][]}
                w={width} h={height} tint={tint}
                distanceM={distanceM}
                onScrub={i === at ? onScrub : undefined}
              />
            )}
          </div>
        ))}
      </div>

      {/* THE PAGER ONLY EXISTS WHEN THERE IS SOMEWHERE TO GO. One slide needs
          no dots, and a single dot is a decoration that looks like a control. */}
      {slides.length > 1 && (
        <div aria-hidden style={{
          position: 'absolute', bottom: 12, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 5, pointerEvents: 'none',
        }}>
          {slides.map((s, i) => (
            <span key={s.kind === 'photo' ? `d${s.url}` : 'dmap'} style={{
              width: i === at ? 16 : 5, height: 5, borderRadius: 100,
              background: i === at ? T.ink : `${T.ink}59`,
              transition: 'width .18s ease, background .18s ease',
            }} />
          ))}
        </div>
      )}

      {/* ADD A PICTURE WITHOUT LOSING THE MAP. When the slot already shows the
          route, the plus cannot BE the slot — so it is a button on it. It only
          appears on your own ride and only while there is no photo. */}
      {onAddPhoto && photoUrls.length === 0 && (
        <button type="button" onClick={onAddPhoto}
          aria-label="Foto zu dieser Fahrt hinzufügen"
          style={{
            position: 'absolute', top: 12, right: 12, display: 'inline-flex',
            alignItems: 'center', gap: 7, padding: '9px 14px 9px 12px',
            borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
            background: `${T.bg}D9`, backdropFilter: 'blur(10px)',
            boxShadow: `inset 0 0 0 1px ${T.acid}3D`,
          }}>
          <ImagePlus size={15} color={T.acid} strokeWidth={2.2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: T.acid }}>Foto</span>
        </button>
      )}
    </div>
  )
}
