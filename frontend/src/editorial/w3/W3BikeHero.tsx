import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Plus } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'

/**
 * The Today hero's bike slot — the rider's own digitalised bike, or the offer
 * to make one.
 *
 * This screen used to render a hard-coded stock photo for everyone, which meant
 * a rider who had never touched the studio was shown "their" bike. The garage
 * is real state now (`useGarage`), so this component has exactly two honest
 * modes: a collectible the rider actually rendered, or a bike-shaped absence
 * that asks for a photo.
 *
 * The empty state is the pen's `QK4WB` — a bike under a studio spotlight with
 * one acid affordance in the middle of it, over an EXAMPLE label. The example
 * is a real drive-side road bike shot the same way the studio renders, so the
 * empty frame previews what the rider is about to get.
 */

/** Served from `frontend/public/w3/` rather than inlined as base64: it is 54 KB,
 *  every rider without a bike loads it, and as a static file it is cached by the
 *  browser instead of riding inside the JS bundle on every deploy. */
const EXAMPLE_BIKE = '/w3/example-bike.webp'

/** The example bike shown in an empty garage slot — a real drive-side road bike
 *  on white, matching the camera the studio renders at, so the empty state
 *  previews the shape the rider's own collectible will take.
 *
 *  It is deliberately knocked back (dimmed, desaturated, blended into the dark
 *  ground) and always sits under an explicit "example" label. This screen exists
 *  BECAUSE showing a stock bike as "yours" was wrong; an example that announces
 *  itself is the opposite of that, but only while it keeps announcing itself —
 *  never brighten this to look like a real collectible. */
export function GhostBike({ opacity = 0.3 }: { opacity?: number }) {
  return (
    <img src={EXAMPLE_BIKE} alt="" aria-hidden
      style={{
        width: '100%', height: '100%', objectFit: 'contain', display: 'block',
        opacity, filter: 'grayscale(1) brightness(1.6) contrast(0.85)',
        mixBlendMode: 'screen',
      }} />
  )
}

export interface W3BikeHeroProps {
  /** The rider's rendered collectible (data URL), or null when the garage slot is empty. */
  image: string | null
  /** The collectible's name — used as the image's alt text. */
  name: string
  /** True while the garage is still loading, so we show neither state prematurely. */
  loading?: boolean
}

export default function W3BikeHero({ image, name, loading }: W3BikeHeroProps) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  // ── Loading: hold the hero's height with the ghost, so the frame breathes
  //    instead of flashing black — but claim nothing about what's coming. ──
  if (loading) {
    return (
      <div style={{ position: 'relative', height: 300, background: T.bg, display: 'grid', placeItems: 'center', padding: '0 44px' }}>
        <motion.div
          animate={reduce ? undefined : { opacity: [0.06, 0.14, 0.06] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: '100%', maxWidth: 260, opacity: 0.1 }}>
          <GhostBike opacity={0.16} />
        </motion.div>
      </div>
    )
  }

  // ── The rider's real bike. ──
  // The studio renders a 1:1 collectible on its own pastel studio ground, so it
  // is shown as the object it is — a card in a case — not bled to the page
  // edges. Cropping it to full-bleed would cut the frame the rider just made,
  // and letting the pastel square run to the edges would fight the dark page.
  if (image) {
    return (
      <div style={{ position: 'relative', height: 300, background: T.bg, display: 'grid', placeItems: 'center' }}>
        {/* Ambient acid bloom, so the card sits in light rather than on a slab. */}
        <div aria-hidden style={{ position: 'absolute', width: 340, height: 200, borderRadius: '50%', background: `radial-gradient(closest-side, ${T.acid}22, transparent)` }} />
        <motion.div
          initial={reduce ? false : { opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ position: 'relative', width: 252, height: 252, borderRadius: 28, overflow: 'hidden', border: `1px solid ${T.stroke}`, boxShadow: '0 18px 40px #00000066' }}>
          <img src={image} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </motion.div>
      </div>
    )
  }

  // ── No bike yet — the pen's spotlit ghost (QK4WB). ──
  return (
    <div style={{ position: 'relative', height: 300, background: T.bg, overflow: 'hidden' }}>
      {/* The studio spotlight: a soft pool of light with the ghost inside it. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(58% 46% at 50% 46%, #FFFFFF14, transparent 70%)' }} />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '0 44px' }}>
        <div style={{ width: '100%', maxWidth: 300, opacity: 0.34 }}>
          <GhostBike />
        </div>
      </motion.div>

      {/* Says what it is. The example only stays honest while it is labelled. */}
      <span style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontSize: 8.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>
        BEISPIEL
      </span>

      {/* One affordance, dead centre in the frame the bike will fill. */}
      <button
        onClick={() => navigate('/e/w3-bike-studio')}
        style={{
          position: 'absolute', top: 132, left: '50%', transform: 'translateX(-50%)',
          width: 62, height: 62, borderRadius: 100, cursor: 'pointer', fontFamily: FONT,
          background: T.bg, border: `1px solid ${T.acid}59`, boxShadow: `0 0 30px ${T.acid}26`,
          display: 'grid', placeItems: 'center',
        }}>
        <Plus size={26} color={T.acid} strokeWidth={2.6} />
      </button>

      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center' }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Stell dein Bike in die Garage</span>
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, color: T.quiet, maxWidth: 280 }}>
          Ein Foto deines echten Bikes. Wir rendern es als dein Collectible — und jede Fahrt, die du loggst, levelt es.
        </span>
      </div>
    </div>
  )
}
