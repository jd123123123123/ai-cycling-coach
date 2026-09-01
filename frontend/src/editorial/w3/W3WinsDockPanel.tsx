import { motion, useReducedMotion } from 'motion/react'
import { Trophy } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'

/**
 * W3 · ERFOLGE — THE DOCK.
 *
 * ── WHY THIS REPLACED A THREE-STAT ROW ────────────────────────────────────
 *
 * Erfolge was the one bottom-tab screen whose first surface spoke a different
 * language from the others. Today opens on ONE number (readiness) with the
 * meter that IS that number. Fahrten opens on ONE number (the season's
 * distance) the same way. Plan opens on the countdown. Erfolge opened on a
 * flat row of three — badges, lifetime km, ride count — which is exactly the
 * shape `W3PlanDock` was written to get rid of, and it made the rider read a
 * small table to learn one thing.
 *
 * Erfolge's one number is HOW MANY OF THE CABINET IS YOURS. Everything else on
 * the screen is the working behind it: the rhythm that earned them, the
 * threshold that moved, the records that fell.
 *
 * ── THE METER IS THE CATALOGUE ────────────────────────────────────────────
 *
 * Twenty-two segments, the same count as Today's readiness and Plan's
 * periodisation, because a rider should read one meter language across the
 * app. Here each step is a slice of the catalogue: filled to what has been
 * unlocked, with the next one lit — so the bar answers "how far in am I" and
 * "what is nearly mine" in the same glance.
 *
 * The lifetime totals did not disappear; they moved below the meter as the
 * working, where a supporting figure belongs.
 */

const ARCHIVO = 'Archivo, "Inter Tight", sans-serif'
/** Same count as `W3TodayDock` and `W3PlanDock`, on purpose. */
const SEGMENTS = 22

export interface W3WinsDockVm {
  /** Unlocked and total. Null while the read is in flight — never 0 of 0,
   *  which would draw an empty cabinet at a rider who has filled it. */
  unlocked: number | null
  total: number | null
  /** The closest locked badge, for the line under the meter. */
  nextTitle: string | null
  nextPct: number | null
  /** The working: lifetime figures, already localised. */
  stats: { key: string; value: string; unit?: string | null; label: string }[]
  onOpen?: () => void
}

export default function W3WinsDockPanel({ vm }: { vm: W3WinsDockVm }) {
  const reduce = useReducedMotion()
  const known = vm.unlocked != null && vm.total != null && vm.total > 0
  const frac = known ? Math.max(0, Math.min(1, vm.unlocked! / vm.total!)) : 0
  const filled = Math.round(frac * SEGMENTS)

  return (
    <button
      onClick={vm.onOpen}
      aria-label="Auszeichnungen im Detail"
      style={{
        width: '100%', border: 0, textAlign: 'left',
        cursor: vm.onOpen ? 'pointer' : 'default',
        background: T.heroDock, borderRadius: 28, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 11, fontFamily: FONT,
      }}
    >
      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7, minWidth: 0 }}>
          <span style={{
            fontFamily: ARCHIVO, fontSize: 46, fontWeight: 700, letterSpacing: -2.2,
            lineHeight: 0.85, color: known ? T.ink : T.quiet,
            fontVariantNumeric: 'tabular-nums',
          }}>{known ? vm.unlocked : DASH}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: T.mid, paddingBottom: 4 }}>
            von {known ? vm.total : DASH} Auszeichnungen
          </span>
        </div>
        <Trophy size={17} strokeWidth={1.9} color={T.acid} style={{ flex: 'none', marginBottom: 3 }} />
      </div>

      {/* The catalogue as 22 steps. Filled behind, the next one lit — the same
          three-state, one-hue rule the other two docks use. A second colour
          here would be a third accent on a screen that spends its one on the
          number above. */}
      <div style={{ display: 'flex', width: '100%', gap: 3, alignItems: 'flex-end' }} aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const done = i < filled
          const next = i === filled && known
          return (
            <motion.span
              key={i}
              initial={reduce ? false : { opacity: 0.25, scaleY: 0.6 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ duration: 0.3, ease: EASE, delay: reduce ? 0 : (done ? i * 0.018 : 0) }}
              style={{
                flex: 1, height: next ? 16 : 12, borderRadius: 3,
                transformOrigin: 'bottom',
                background: next ? T.acid : done ? `${T.acid}66` : T.heroOff,
              }}
            />
          )
        })}
      </div>

      {vm.nextTitle && (
        <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>
          Als Nächstes: <span style={{ color: T.ink, fontWeight: 600 }}>{vm.nextTitle}</span>
          {vm.nextPct != null && (
            <span style={{ color: T.quiet, fontVariantNumeric: 'tabular-nums' }}>
              {' '}· {Math.round(vm.nextPct * 100)} %
            </span>
          )}
        </span>
      )}

      {vm.stats.length > 0 && (
        <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 10, paddingTop: 2 }}>
          {vm.stats.map((s) => (
            <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
                <span style={{
                  fontSize: 15, fontWeight: 700, letterSpacing: -0.4, lineHeight: 1,
                  color: s.value === DASH ? T.quiet : T.ink, fontVariantNumeric: 'tabular-nums',
                }}>{s.value}</span>
                {s.unit && <span style={{ fontSize: 9.5, fontWeight: 600, color: T.quiet }}>{s.unit}</span>}
              </div>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1, color: T.quiet, whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  )
}
