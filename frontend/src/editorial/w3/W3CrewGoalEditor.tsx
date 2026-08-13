import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X, Minus, Plus, Check, Loader2 } from 'lucide-react'
import { T, FONT } from './w3tokens'

/**
 * W3 · Crew goal editor — set the crew's "Around the world" distance target.
 * Saves a REAL weekly crew challenge (metric distance_km) everyone is scored
 * against. Step ±100 km, 100–20,000.
 */
const VIOLET = '#7B5CFF'
const STEP = 100
const MINK = 100
const MAXK = 20000

export default function W3CrewGoalEditor({ currentKm, onSave, onClose, saving }: {
  currentKm: number; onSave: (km: number) => void; onClose: () => void; saving?: boolean
}) {
  const reduce = useReducedMotion()
  const [km, setKm] = useState(Math.max(MINK, Math.min(MAXK, Math.round(currentKm / STEP) * STEP || 500)))
  const nudge = (d: number) => setKm((v) => Math.max(MINK, Math.min(MAXK, v + d)))

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000000B0', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }}
      onClick={onClose}>
      <motion.div
        initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 390, maxWidth: '100%', background: T.bg, borderRadius: '28px 28px 0 0', border: `1px solid ${T.rule}`, borderBottom: 0, fontFamily: FONT, display: 'flex', flexDirection: 'column', padding: '18px 20px calc(24px + env(safe-area-inset-bottom))', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>Crew distance goal</span>
          <button onClick={onClose} aria-label="Close" style={{ width: 38, height: 38, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.mid} /></button>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>The kilometres your whole crew rides toward together this week.</span>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
          <button onClick={() => nudge(-STEP)} aria-label="Less" style={{ width: 56, height: 56, borderRadius: 100, background: T.surface, border: `1px solid ${T.rule}`, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><Minus size={20} color={T.ink} /></button>
          <div style={{ flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.6, color: VIOLET, fontVariantNumeric: 'tabular-nums' }}>{km.toLocaleString('en-US')}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>KM · THIS WEEK</span>
          </div>
          <button onClick={() => nudge(STEP)} aria-label="More" style={{ width: 56, height: 56, borderRadius: 100, background: T.surface, border: `1px solid ${T.rule}`, display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><Plus size={20} color={T.ink} /></button>
        </div>

        <button onClick={() => onSave(km)} disabled={saving}
          style={{ height: 56, borderRadius: 100, border: 0, background: VIOLET, color: '#fff', fontFamily: FONT, fontSize: 16, fontWeight: 700, cursor: saving ? 'default' : 'pointer', display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center' }}>
          {saving ? <Loader2 size={18} className="w3-spin" /> : <Check size={18} />}{saving ? 'Saving…' : 'Set crew goal'}
        </button>
      </motion.div>
    </motion.div>
  )
}
