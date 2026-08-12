import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check } from 'lucide-react'
import { T, FONT, EASE, grow, band } from './w3tokens'
import W3TabBar from './W3TabBar'
import './w3.css'

/**
 * W3 · 03 RIDES ("Confirm your rides") — 1:1 code rebuild of `w3.pen` frame
 * `G0CU6Y`. Pure function of `vm`; `W3RidesPage` builds it from
 * `useActivitiesRange`. The month summary and the confirmed history are REAL
 * activity data (honest "—" for a walk / no-load day). The "Unconfirmed" claim
 * section and every POWER/CYCLE reward number are DESIGN FIXTURES — this app
 * auto-ingests from Garmin (no confirm step) and the reward economy isn't
 * built. The select→confirm interaction is real so the mechanic is legible.
 */

export interface W3MonthStat { v: string; l: string }
export interface W3Unconfirmed { key: string; title: string; source: string; dur: string; tss: string; watts: string; power: number; cycle: number }
export interface W3HistoryRow { day: string; title: string; tss: string; power: string; fill: number; rested: boolean }

export interface W3RidesVm {
  title: string
  subtitle: string
  monthStats: W3MonthStat[]        // real
  unconfirmed: W3Unconfirmed[]     // fixture
  historyLabel: string
  history: W3HistoryRow[]          // real
}


export default function W3RidesView({ vm }: { vm: W3RidesVm }) {
  const reduce = useReducedMotion()
  const [sel, setSel] = useState<Record<string, boolean>>(
    Object.fromEntries(vm.unconfirmed.map((u, i) => [u.key, i < 2])), // pen default: first two ticked
  )
  const chosen = vm.unconfirmed.filter((u) => sel[u.key])
  const totalPower = chosen.reduce((s, u) => s + u.power, 0)
  const allSelected = chosen.length === vm.unconfirmed.length
  const toggleAll = () => setSel(Object.fromEntries(vm.unconfirmed.map((u) => [u.key, !allSelected])))

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

        {/* StatusBar */}
        <div style={{ height: 44, padding: '0 22px', display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 700, color: T.ink }}>9:41</div>

        {/* Title */}
        <div style={{ ...band(0), padding: '14px 20px 20px', gap: 8 }}>
          <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.05, color: T.ink, whiteSpace: 'pre-line' }}>{vm.title}</span>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{vm.subtitle}</span>
        </div>

        {/* Month strip (real) */}
        <div style={{ ...band(24), flexDirection: 'row', gap: 8 }}>
          {vm.monthStats.map((s) => (
            <div key={s.l} style={{ flex: 1, padding: '13px 14px 14px', borderRadius: 16, background: T.surface, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.6, color: s.v === '—' ? T.quiet : T.ink }}>{s.v}</span>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: T.quiet }}>{s.l}</span>
            </div>
          ))}
        </div>

        {/* Unconfirmed (fixture, but interactive) */}
        {vm.unconfirmed.length > 0 && (
          <div style={{ ...band(22), gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.acid }}>UNCONFIRMED · {vm.unconfirmed.length}</span>
              <button onClick={toggleAll} style={{ background: 'transparent', border: 0, fontFamily: FONT, fontSize: 10.5, fontWeight: 700, color: T.mid, cursor: 'pointer' }}>
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            {vm.unconfirmed.map((u) => {
              const on = sel[u.key]
              return (
                <button key={u.key} onClick={() => setSel((s) => ({ ...s, [u.key]: !s[u.key] }))}
                  style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 14, borderRadius: 20, background: T.surface, border: `1px solid ${on ? T.acid : 'transparent'}`, cursor: 'pointer', fontFamily: FONT, textAlign: 'left', width: '100%' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, flex: 'none', display: 'grid', placeItems: 'center', background: on ? T.acid : 'transparent', border: on ? 'none' : `1.5px solid ${T.d3}` }}>
                    {on && <Check size={13} color={T.bg} strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.2, color: T.ink }}>{u.title}</span>
                      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: T.mid, padding: '3px 7px', borderRadius: 100, background: T.rule }}>{u.source}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {[u.dur, u.tss, u.watts].map((s, i) => (
                        <span key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 10.5, fontWeight: 600, color: T.mid }}>
                          {i > 0 && <span style={{ width: 2.5, height: 2.5, borderRadius: 100, background: T.quiet }} />}{s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3, color: T.acid }}>+{u.power.toLocaleString('en-US')}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 0.6, color: T.quiet }}>+{u.cycle} CYCLE</span>
                  </div>
                </button>
              )
            })}
            <motion.button key={chosen.length} initial={reduce ? false : { scale: 0.98, opacity: 0.9 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2, ease: EASE }}
              disabled={chosen.length === 0}
              style={{ height: 54, borderRadius: 100, border: 0, fontFamily: FONT, cursor: chosen.length ? 'pointer' : 'default',
                background: chosen.length ? T.acid : T.surface, color: chosen.length ? T.bg : T.quiet, fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>
              {chosen.length ? `Confirm ${chosen.length} ride${chosen.length > 1 ? 's' : ''} · +${totalPower.toLocaleString('en-US')} RIDECOIN` : 'Select rides to confirm'}
            </motion.button>
          </div>
        )}

        {/* Confirmed history (real) */}
        <div style={{ ...band(30), gap: 10 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.4, color: T.quiet }}>{vm.historyLabel}</span>
          <div style={{ padding: '4px 16px 8px', borderRadius: 22, background: T.surface, display: 'flex', flexDirection: 'column' }}>
            {vm.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '13px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, opacity: h.rested ? 0.6 : 1 }}>
                <span style={{ width: 22, fontSize: 13, fontWeight: 700, color: h.rested ? T.quiet : T.mid }}>{h.day}</span>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: h.rested ? T.quiet : T.ink }}>{h.title}</span>
                  <div style={{ height: 4, borderRadius: 100, background: '#FFFFFF0F', overflow: 'hidden' }}>
                    <motion.div initial={reduce ? false : { width: 0 }} whileInView={{ width: `${Math.round(h.fill * 100)}%` }} viewport={{ once: true, amount: 0.8 }} transition={grow(i * 0.04)}
                      style={{ height: '100%', borderRadius: 100, background: h.rested ? T.d3 : T.acid }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: T.mid }}>{h.tss}</span>
                  <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: h.rested ? T.quiet : T.acid }}>{h.power}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <W3TabBar />

      </div>
    </div>
  )
}
