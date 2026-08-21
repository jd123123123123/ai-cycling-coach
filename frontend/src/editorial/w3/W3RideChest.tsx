import { motion, useReducedMotion } from 'motion/react'
import { Flame, Lock } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3Swipe from './W3Swipe'
import type { Chest } from '../../api/rewards'

/**
 * W3 · THE SEALED CHEST — what Today shows instead of the readiness score when
 * a ride is waiting to be opened.
 *
 * WHY IT TAKES THE READINESS SLOT rather than sitting above it. Today answers
 * one question at a time. On the morning after a ride the question is not "how
 * fresh am I" — the rider knows, they were there — it is "what did that ride
 * give me". So for exactly as long as a chest is sealed, the dock's slot
 * belongs to the chest, and the moment it is opened readiness comes back. One
 * screen, one question, no stacking.
 *
 * WHAT IT DELIBERATELY DOES NOT SAY. Not the number of coins. Not which record
 * fell. A chest that prints its contents on the lid is a receipt, and nobody
 * swipes a receipt. It says a ride is in there and, when there is one, that
 * something was beaten — the two facts that make opening it worth doing.
 *
 * THE SWIPE IS A REAL DRAG, not a button dressed as one — `W3Swipe`, the same
 * gesture that banks the coins at the foot of the celebration. Learning it once
 * is enough, and a thumb that has pulled one knob knows what the other does.
 */

const fmtDuration = (s: number | null | undefined) => {
  if (!s) return null
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`
}

export interface W3RideChestProps {
  chest: Chest
  /** Fired once the rider has pulled the knob past the threshold. */
  onOpen: () => void
}

export default function W3RideChest({ chest, onOpen }: W3RideChestProps) {
  const reduce = useReducedMotion()

  const ride = chest.ride
  const meta = [
    ride?.distance_km != null ? `${ride.distance_km.toLocaleString('de-DE')} km` : null,
    fmtDuration(ride?.duration_s),
    ride?.elevation_m != null ? `${ride.elevation_m.toLocaleString('de-DE')} hm` : null,
  ].filter(Boolean).join(' · ')

  const unlocks = chest.unlock_count ?? 0
  const waiting = chest.waiting ?? 1

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      style={{
        width: '100%', background: T.heroDock, borderRadius: 28,
        padding: '14px 16px 16px', display: 'flex', flexDirection: 'column',
        gap: 12, fontFamily: FONT, position: 'relative', overflow: 'hidden',
      }}>

      {/* The breathing glow. This is the "blinking" — a slow pulse rather than
          a flash, because it has to survive being looked at for a whole
          morning without becoming an alarm. */}
      {!reduce && (
        <motion.div aria-hidden
          animate={{ opacity: [0.16, 0.42, 0.16] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: -40, pointerEvents: 'none',
            background: `radial-gradient(120px 90px at 22% 30%, ${T.acid}, transparent 70%)`,
          }} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <motion.span aria-hidden
          animate={reduce ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ width: 7, height: 7, borderRadius: 100, background: T.acid, flex: 'none' }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
          {waiting > 1 ? `${waiting} FAHRTEN WARTEN` : 'NEUE FAHRT'}
        </span>
        <Lock size={12} color={T.heroMid} style={{ marginLeft: 'auto' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, position: 'relative' }}>
        <span style={{
          fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 22, fontWeight: 700,
          lineHeight: 1.05, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {ride?.title || 'Deine Fahrt ist da'}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.heroMid, fontVariantNumeric: 'tabular-nums' }}>
          {meta || 'gebucht und verschlossen'}
        </span>
      </div>

      {/* The teaser. It says THAT something fell, never what — the reveal is
          the reward, and spending it here would leave the screen with nothing
          to give. */}
      {unlocks > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, padding: '8px 11px',
          borderRadius: 12, background: `${T.acid}1A`, position: 'relative',
        }}>
          <Flame size={13} color={T.acid} />
          <span style={{ fontSize: 11, fontWeight: 700, color: T.acid }}>
            {unlocks === 1 ? '1 Bestwert wartet auf dich' : `${unlocks} Bestwerte warten auf dich`}
          </span>
        </div>
      )}

      {/* ── the swipe ── */}
      <W3Swipe label="ZUM ÖFFNEN WISCHEN" onComplete={onOpen} />

    </motion.div>
  )
}
