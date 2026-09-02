import { useCallback, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, X } from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import { lux } from './w3surfaces'
import W3RideDetailsSheet from './W3RideDetailsSheet'

/**
 * W3 · "Deine Fahrt ist da" — the ask, at the moment it is worth asking.
 *
 * ── IT ONLY APPEARS WHERE IT IS TRUE ─────────────────────────────────────
 *
 * A ride that just synced, belongs to this rider, and has neither a photo nor
 * a sentence. Any one of those missing and there is nothing to ask for, and a
 * prompt that appears when there is nothing to ask for is the kind a rider
 * learns to swipe past without reading — which then costs you the times it
 * WAS worth reading.
 *
 * ── AND IT TAKES NO FOR AN ANSWER, PER RIDE ──────────────────────────────
 *
 * Dismissing hides it for that ride and only that ride, remembered in
 * `localStorage` because it is a per-browser convenience and not a fact worth
 * a column. The next ride asks again — the ask is cheap, and a rider who says
 * no to Tuesday's commute may well want to talk about Saturday.
 *
 * Deliberately NOT a modal. A sheet that takes the screen the moment a ride
 * lands is an interruption; this is a card in the flow that can simply be
 * scrolled past, and it opens the editor only when the rider says yes.
 */

const KEY = 'w3.ride.details.dismissed'

function dismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set<number>(raw ? JSON.parse(raw) : [])
  } catch {
    // A private window, cleared site data, storage refused outright — the
    // prompt simply shows. Never worth a crash.
    return new Set()
  }
}

function remember(id: number): void {
  try {
    const all = dismissed()
    all.add(id)
    // Bounded: this is a convenience list, not a history.
    localStorage.setItem(KEY, JSON.stringify([...all].slice(-200)))
  } catch { /* storage refused — the prompt returns next time, which is fine */ }
}

export interface W3AddDetailsNudgeProps {
  activityId: number
  /** Already composed: "Deine Fahrt von heute Morgen". */
  rideLabel: string
  /** True when the ride has neither a photo nor a description. */
  needsDetails: boolean
  onSaved?: () => void
}

export default function W3AddDetailsNudge({
  activityId, rideLabel, needsDetails, onSaved,
}: W3AddDetailsNudgeProps) {
  const reduce = useReducedMotion()
  const [gone, setGone] = useState(() => dismissed().has(activityId))
  const [open, setOpen] = useState(false)

  const dismiss = useCallback(() => {
    remember(activityId)
    setGone(true)
  }, [activityId])

  if (!needsDetails || gone) return null

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, height: 0 }}
          transition={{ duration: 0.26, ease: EASE }}
          style={{
            ...lux(24), width: '100%', padding: '16px 16px 16px 18px',
            gap: 12, fontFamily: FONT,
            // The one lit edge on the card: it is an invitation, and it has to
            // read as one among a column of finished posts.
            boxShadow: `inset 0 0 0 1px ${T.acid}2E`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
            <span style={{
              flex: 'none', width: 38, height: 38, borderRadius: 100,
              background: T.acidDim, display: 'grid', placeItems: 'center',
            }}>
              <Camera size={18} color={T.acid} strokeWidth={1.9} />
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: -0.3, color: T.ink }}>
                {rideLabel} ist da
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: T.mid }}>
                Häng ein Foto dran und schreib einen Satz dazu.
              </span>
            </span>
            <button type="button" onClick={dismiss} aria-label="Nicht für diese Fahrt"
              style={{
                flex: 'none', border: 0, background: 'transparent', cursor: 'pointer',
                padding: 4, display: 'grid', placeItems: 'center',
              }}>
              <X size={15} color={T.quiet} />
            </button>
          </div>

          <button type="button" onClick={() => setOpen(true)}
            style={{
              width: '100%', height: 44, borderRadius: 100, border: 0, background: T.acid,
              color: T.bg, fontFamily: FONT, fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
            }}>
            Fahrt ergänzen
          </button>
        </motion.div>
      </AnimatePresence>

      <W3RideDetailsSheet
        activityId={activityId}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => { setGone(true); onSaved?.() }}
      />
    </>
  )
}
