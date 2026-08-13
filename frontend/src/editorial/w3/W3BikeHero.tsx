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
 * The empty state is the pen's `QK4WB` — a ghost bike under a studio spotlight
 * with one acid affordance in the middle of it. The ghost is drawn as an SVG
 * outline rather than a dimmed stock photo, so it reads unmistakably as the
 * *shape* where a bike goes and can never be mistaken for a real one.
 */

/** A drop-bar road bike in outline: two wheels, the double triangle, fork,
 *  bars and saddle. Proportioned off real road geometry so the silhouette is
 *  recognisable at a glance rather than a generic icon. */
export function GhostBike({ stroke, glow }: { stroke: string; glow: string }) {
  return (
    <svg viewBox="0 0 200 112" width="100%" height="100%" fill="none" aria-hidden
      style={{ display: 'block', overflow: 'visible' }}>
      <g stroke={stroke} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 12px ${glow})` }}>
        {/* wheels */}
        <circle cx={44} cy={72} r={32} />
        <circle cx={156} cy={72} r={32} />
        {/* main triangle: seat tube, top tube, down tube */}
        <path d="M100 72 L82 34" />
        <path d="M82 34 L138 34" />
        <path d="M100 72 L136 52" />
        {/* head tube + fork */}
        <path d="M138 34 L134 52" />
        <path d="M134 52 L156 72" />
        {/* rear triangle: chainstay + seatstay */}
        <path d="M100 72 L44 72" />
        <path d="M82 36 L44 72" />
        {/* saddle + drop bar */}
        <path d="M72 30 L92 30" />
        <path d="M132 30 L146 30 Q152 30 152 38 L152 44" />
        {/* cranks */}
        <circle cx={100} cy={72} r={7} />
      </g>
    </svg>
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
          <GhostBike stroke={T.d4} glow="transparent" />
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
        <div style={{ width: '100%', maxWidth: 260, opacity: 0.26 }}>
          <GhostBike stroke={T.d4} glow="#FFFFFF14" />
        </div>
      </motion.div>

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
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>Put your bike in the garage</span>
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4, color: T.quiet, maxWidth: 280 }}>
          One photo of your real bike. We render it as your collectible — and every ride you log levels it up.
        </span>
      </div>
    </div>
  )
}
