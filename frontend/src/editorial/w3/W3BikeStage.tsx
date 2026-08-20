import type { ReactNode } from 'react'
import { T } from './w3tokens'

/**
 * W3 · The bike, photographed.
 *
 * ONE COMPONENT BECAUSE THERE IS ONE BIKE. The garage hero, the shop row, the
 * item sheet and the first-bike screen all show a bike, and for a while they
 * showed it three different ways. Everything goes through here now.
 *
 * WHAT IT SHOWS, IN ORDER:
 *   1. the composed photograph of this exact BUILD, when one exists — the
 *      rider's bike wearing the parts they bought, made by the same image model
 *      that made the catalogue, from the same base photo, through the same
 *      locked camera;
 *   2. otherwise the bike's own catalogue photograph.
 *
 * The fallback is not a placeholder. It is the real, correct picture of the bike
 * without its cosmetics, which is exactly what shipped before builds could be
 * composed — so a slow render, a missing image model or a brand-new combination
 * all degrade to something true rather than to a hole.
 *
 * WHY NOT DRAW IT. An earlier version drew the bike as parametric SVG so parts
 * could be composited from anchors. It was accurate and it was honest, and it
 * still looked wrong: one hand-drawn bicycle standing next to 26 rendered ones
 * reads as a downgrade the moment a rider equips anything. Quality here is not
 * decoration — the bike IS the reward.
 */
export default function W3BikeStage({ src, alt = '', rendering = false, children, style }: {
  /** The composed build, or the bike's catalogue photograph. */
  src: string | null
  alt?: string
  /** True while this build is being photographed — drives the quiet hint. */
  rendering?: boolean
  /** Overlays that belong INSIDE the stage — the hour's light, road grime. */
  children?: ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, ...style }}>
      {src && (
        <img
          src={src} alt={alt} loading="lazy"
          // CONTAIN, NOT COVER. The composed builds are square and this stage is
          // not, so `cover` cropped the render to fill — which cut the wheels
          // off a bike shot side-on and threw away the place it was standing
          // in, the two things the picture exists to show. Contain lets the
          // whole frame breathe; the stage's own ground fills what is left.
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'contain',
          }}
        />
      )}
      {/* Said out loud, and quietly. A rider who just equipped something is
          looking straight at the bike, so the picture changing under them needs
          a reason — and a spinner over a bike that is already correct would
          claim something is broken when nothing is. */}
      {rendering && (
        <span style={{
          position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
          fontSize: 8.5, fontWeight: 700, letterSpacing: 0.9, whiteSpace: 'nowrap',
          color: T.acid, background: T.bg, padding: '5px 10px', borderRadius: 100,
        }}>WIRD LACKIERT …</span>
      )}
      {children}
    </div>
  )
}
