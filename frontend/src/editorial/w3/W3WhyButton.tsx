import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Info, X } from 'lucide-react'
import { useCoachBrief } from '../../hooks/useCoachBrief'
import { useCurrentWeek } from '../../hooks/useCurrentWeek'
import W3WhyToday from './W3WhyToday'
import { T, FONT, EASE } from './w3tokens'

/**
 * W3 · the (i) beside "Heutige Einheit", and the sheet behind it.
 *
 * WHY THIS MOVED OUT OF THE PAGE. "Warum diese Einheit" was a full section
 * sitting several screens below the session it explains — so the answer was
 * nowhere near the question, and a rider scrolling past it had no reason to
 * connect the two. An (i) ON the session header puts the explanation exactly
 * where the doubt arises, and costs the page nothing when nobody taps it.
 *
 * IT IS SELF-CONTAINED ON PURPOSE. The trigger and the sheet own their own
 * data, so `W3Sections` — a presentational module rendered from previews with
 * fixtures — does not have to thread a modal through two layers of props to
 * reach a header. Where there is nothing to explain, the icon is not drawn at
 * all: an (i) that opens an empty sheet is worse than no (i).
 */
export default function W3WhyButton() {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const { data: brief } = useCoachBrief()
  const { data: week } = useCurrentWeek(0)

  // The same condition `W3WhyToday` uses to render itself. Asked here too, so
  // the icon and the sheet can never disagree about whether there is content.
  const hasSomething = !!(brief?.adaptations || week?.meso_block)

  // A sheet that outlives a back gesture is a trap on a phone.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!hasSomething) return null

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-haspopup="dialog"
        aria-label="Warum diese Einheit?"
        style={{
          flex: 'none', width: 26, height: 26, borderRadius: 100, border: 0,
          background: T.heroChip, display: 'grid', placeItems: 'center', cursor: 'pointer',
        }}>
        <Info size={14} color={T.acid} />
      </button>

      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Warum diese Einheit"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200, background: `${T.heroInk}D9`,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
          }}>
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.32, ease: EASE }}
            style={{
              width: '100%', maxWidth: 430, maxHeight: '86dvh', overflowY: 'auto',
              background: T.heroBg, borderRadius: '26px 26px 0 0',
              padding: '18px 20px calc(26px + env(safe-area-inset-bottom))',
              fontFamily: FONT,
            }}>
            {/* The grab handle, because this opens from the bottom and a sheet
                with no handle reads as a page that has gone wrong. */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ width: 38, height: 4, borderRadius: 100, background: T.d2 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.5, color: T.ink }}>
                Warum diese Einheit?
              </span>
              <button onClick={() => setOpen(false)} aria-label="Schließen" style={{
                flex: 'none', width: 32, height: 32, borderRadius: 100, border: 0,
                background: T.heroChip, display: 'grid', placeItems: 'center', cursor: 'pointer',
              }}>
                <X size={16} color={T.mid} />
              </button>
            </div>

            <W3WhyToday variant="sheet" />
          </motion.div>
        </div>,
        document.body,
      )}
    </>
  )
}
