import { motion, useReducedMotion } from 'motion/react'
import { TrendingUp } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'

/**
 * W3 · Fahrten — THE DOCK.
 *
 * The same idea as Today's readiness panel, asked of a different question. The
 * rides screen opens on ONE number — how far this season — and the rest of the
 * season (average speed, average power, saddle time, where that leaves the
 * goal) is the working behind it. Printing all five on the first screen makes
 * the rider read a table to learn one thing.
 *
 * So the closed panel is the distance and its goal bar, and scrolling opens it
 * into the rest — the same gesture, in the same place, meaning the same thing
 * it means on Today: "why that number".
 *
 * A DELIBERATE DEPARTURE FROM TODAY'S DOCK: this one is not a button. Readiness
 * has a screen behind it; the season total does not, and a panel that lifts
 * under the thumb and then goes nowhere is a worse lie than a flat one.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'

export interface W3RidesDockVm {
  /** Season distance, already localised ("4.812"). Null → an em dash. */
  totalKm: string | null
  totalUnit: string
  /** How far through the season goal, 0..1, and how that reads as a share. */
  progress: number
  ofGoalPct: string
  goalChip: string
  toGoLabel: string
  paceLabel: string
  paceAhead: boolean
  /** The three season averages. Always three, so the row never reflows. */
  stats: [{ label: string; value: string | null; unit: string },
          { label: string; value: string | null; unit: string },
          { label: string; value: string | null; unit: string }]
  /** How far open the panel is, 0 → 1, driven by the page's own scroll. */
  expand?: number
}

export default function W3RidesDock({ vm }: { vm: W3RidesDockVm }) {
  const open = Math.max(0, Math.min(1, vm.expand ?? 0))
  const reduce = useReducedMotion()

  return (
    <div style={{
      width: '100%', background: T.heroDock, borderRadius: 28,
      // Smaller when closed, breathing out as it opens — the panel must not
      // push up into the back wheel of the bike standing above it.
      padding: `${12 + open * 4}px 16px ${12 + open * 4}px`,
      display: 'flex', flexDirection: 'column', gap: 10, fontFamily: FONT,
    }}>

      {/* ── the number, and what it is a number of ── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, width: '100%', minWidth: 0 }}>
        <span style={{
          fontFamily: ARCHIVO, fontSize: 44, fontWeight: 700, letterSpacing: -2,
          lineHeight: 0.85, color: vm.totalKm ? T.ink : T.heroOff,
          fontVariantNumeric: 'tabular-nums',
        }}>{vm.totalKm ?? DASH}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.heroMid, paddingBottom: 2 }}>{vm.totalUnit}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>{vm.goalChip}</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.4, color: T.acid }}>{vm.ofGoalPct}</span>
        </div>
      </div>

      {/* ── the goal bar. Fills once, on arrival. ── */}
      <div style={{ position: 'relative', height: 6, borderRadius: 100, background: T.heroOff, overflow: 'hidden' }}>
        <motion.div
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.round(Math.max(0, Math.min(1, vm.progress)) * 100)}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          style={{ height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.acidDeep}, ${T.acid})` }} />
      </div>

      {/* ── the working: three season averages + the pace read ── */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10, width: '100%',
        height: open * 86, opacity: open, overflow: 'hidden',
        marginTop: open * 2, pointerEvents: open > 0.6 ? 'auto' : 'none',
      }}>
        <div style={{ display: 'flex', gap: 12, width: '100%' }}>
          {vm.stats.map((s) => (
            <div key={s.label} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>{s.label}</span>
              <span style={{
                fontFamily: ARCHIVO, fontSize: 17, fontWeight: 700,
                color: s.value ? T.ink : T.heroOff, fontVariantNumeric: 'tabular-nums',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{s.value ?? DASH}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: T.heroMid }}>{s.unit}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: T.heroMid, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{vm.toGoLabel}</span>
          <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', flex: 'none', fontSize: 9.5, fontWeight: 700, letterSpacing: 0.6, color: vm.paceAhead ? T.acid : T.warn }}>
            <TrendingUp size={12} color={vm.paceAhead ? T.acid : T.warn} style={{ transform: vm.paceAhead ? 'none' : 'scaleY(-1)' }} />
            {vm.paceLabel}
          </span>
        </div>
      </div>
    </div>
  )
}
