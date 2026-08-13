import { useState, type CSSProperties } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowLeft, Pencil, Mountain, Calendar, Flag, GitBranch, Route as RouteIcon,
  Timer, ChevronRight, Repeat, X, Check, Info,
} from 'lucide-react'
import { T, FONT, EASE, grow, Kicker, DASH } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import './w3.css'

/**
 * W3 · DEIN ZIEL — a 1:1 code rebuild of pen2 frame `l4QUjL`.
 *
 * Pure function of `vm`; `W3GoalPage` builds it from the REAL athlete profile
 * (target event, priority) + the parsed target-event route (distance, elevation
 * gain, climbs, elevation profile) reused from the rehearsal store. The
 * requirement gaps compare the athlete's real fitness (FTP, W/kg, longest ride,
 * weekly climbing, 4h+ rides from the season's activities) against targets
 * DERIVED from the route's distance + elevation demand (marked in the page).
 *
 * Editing Renntag / Priorität persists via the real `PUT /athletes/me`. "Anderes
 * Ziel wählen" opens the plan's real goal switcher; "Ziel entfernen" clears the
 * target event for real. No dead buttons.
 */

export interface Climb { name: string; km: string; detail: string }
export interface GoalReqRow { label: string; currentText: string; targetText: string; pct: number; remainingText: string; onTrack: boolean }
export interface GoalEditRow { id: string; icon: 'cal' | 'flag' | 'dist' | 'hm' | 'time'; label: string; value: string; editable: boolean }
export interface W3GoalVm {
  priorityChip: string
  priorityLabel: string
  eventName: string
  daysCol: string
  dateCol: { big: string; sub: string }
  locCol: { big: string; sub: string }
  distHm: string
  hasRoute: boolean
  elevBars: { h: number; climb: boolean }[]
  elevLabels: [string, string, string]
  climbs: Climb[]
  routeCta: string | null
  gaps: GoalReqRow[]
  infoNote: string
  editRows: GoalEditRow[]
  eventDateISO: string | null
  priority: 'A' | 'B' | 'C' | null
}
export interface W3GoalActions {
  onBack?: () => void
  onSwitch?: () => void
  onRemove?: () => Promise<boolean> | void
  onSave?: (dateISO: string, priority: 'A' | 'B' | 'C') => Promise<boolean>
  onRehearseRoute?: () => void
}

const band = (padBottom: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', width: '100%', background: T.bg, padding: `0 20px ${padBottom}px` })
const card = (): CSSProperties => ({ background: T.surface, borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', width: '100%' })
const EDIT_ICON: Record<GoalEditRow['icon'], typeof Calendar> = { cal: Calendar, flag: Flag, dist: GitBranch, hm: Mountain, time: Timer }

function ElevationProfile({ bars, labels }: { bars: { h: number; climb: boolean }[]; labels: [string, string, string] }) {
  const reduce = useReducedMotion()
  const H = 118
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: H }}>
        {bars.map((b, i) => {
          const h = Math.max(4, Math.round(b.h * H))
          return (
            <motion.div key={i} initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={grow(i * 0.012)}
              style={{ flex: 1, height: h, borderRadius: 1, background: b.climb ? `linear-gradient(180deg, ${T.acid}, ${T.acidDeep})` : '#FFFFFF24' }} />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {labels.map((l, i) => <span key={i} style={{ fontSize: 9.5, fontWeight: 700, color: T.quiet }}>{l}</span>)}
      </div>
    </div>
  )
}

function GapRow({ g }: { g: GoalReqRow }) {
  const reduce = useReducedMotion()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{g.label}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.7, color: g.currentText === DASH ? T.quiet : T.ink }}>{g.currentText}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>→ {g.targetText}</span>
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 100, background: T.surface2, overflow: 'hidden' }}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${Math.round(g.pct * 100)}%` }} transition={{ duration: 0.7, ease: EASE }}
          style={{ height: '100%', borderRadius: 100, background: g.onTrack ? T.acid : T.d4 }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: g.onTrack ? T.acidDeep : T.quiet }}>{g.remainingText}</span>
    </div>
  )
}

function GoalEditSheet({ vm, onClose, onSave }: { vm: W3GoalVm; onClose: () => void; onSave?: W3GoalActions['onSave'] }) {
  const reduce = useReducedMotion()
  const [date, setDate] = useState(vm.eventDateISO ?? '')
  const [prio, setPrio] = useState<'A' | 'B' | 'C'>(vm.priority ?? 'A')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!onSave || !date || busy) return
    setBusy(true)
    const ok = await onSave(date, prio)
    setBusy(false)
    if (ok) onClose()
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: '#000000B0' }} />
      <motion.div initial={reduce ? false : { y: '100%' }} animate={{ y: 0 }} transition={{ duration: 0.4, ease: EASE }}
        style={{ position: 'relative', background: T.bg, borderRadius: '28px 28px 0 0', padding: '12px 20px calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ width: 42, height: 5, borderRadius: 100, background: T.d3, alignSelf: 'center' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Ziel bearbeiten</span>
          <button onClick={onClose} aria-label="Schließen" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={18} color={T.ink} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>RENNTAG</Kicker>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            style={{ height: 50, borderRadius: 14, background: T.surface, border: `1px solid ${T.stroke}`, color: T.ink, fontFamily: FONT, fontSize: 15, fontWeight: 700, padding: '0 16px', colorScheme: 'dark' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Kicker>PRIORITÄT</Kicker>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['A', 'B', 'C'] as const).map((p) => {
              const on = p === prio
              return (
                <button key={p} onClick={() => setPrio(p)}
                  style={{ flex: 1, height: 46, borderRadius: 14, border: `1px solid ${on ? T.acid : T.stroke}`, background: on ? T.acidDim : 'transparent', color: on ? T.acid : T.mid, fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{p}-Rennen</button>
              )
            })}
          </div>
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>Änderungen am Renntag verschieben alle Phasen mit.</span>
        <button onClick={submit} disabled={busy || !date}
          style={{ height: 54, borderRadius: 100, background: T.acid, display: 'flex', gap: 9, justifyContent: 'center', alignItems: 'center', border: 0, cursor: busy ? 'default' : 'pointer', fontFamily: FONT, opacity: busy || !date ? 0.7 : 1 }}>
          <Check size={18} color={T.bg} /><span style={{ fontSize: 16, fontWeight: 700, color: T.bg }}>{busy ? 'Speichere…' : 'Renntag speichern'}</span>
        </button>
      </motion.div>
    </div>
  )
}

export default function W3GoalView({ vm, onBack, onSwitch, onRemove, onSave, onRehearseRoute }: { vm: W3GoalVm } & W3GoalActions) {
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <W3StatusBar />

        {/* Nav */}
        <div style={{ padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} aria-label="Zurück" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><ArrowLeft size={18} color={T.ink} /></button>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: T.quiet }}>Dein Ziel</span>
          <button onClick={() => setEditing(true)} aria-label="Ziel bearbeiten" style={{ width: 40, height: 40, borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}><Pencil size={16} color={T.ink} /></button>
        </div>

        {/* Header */}
        <div style={{ ...band(20), paddingTop: 10, gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ padding: '6px 12px', borderRadius: 100, background: T.acid, fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: T.bg }}>{vm.priorityChip}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.mid }}>{vm.priorityLabel}</span>
          </div>
          <span style={{ fontSize: 42, fontWeight: 700, letterSpacing: -1.5, lineHeight: 0.98, color: T.ink }}>{vm.eventName}</span>
          <div style={{ display: 'flex', paddingTop: 6 }}>
            {[
              { big: vm.daysCol, sub: 'Tage', hue: T.acid },
              { big: vm.dateCol.big, sub: vm.dateCol.sub, hue: T.ink },
              { big: vm.locCol.big, sub: vm.locCol.sub, hue: T.ink },
            ].map((c, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: i === 0 ? 0 : 16, borderLeft: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, color: c.hue }}>{c.big}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{c.sub}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Die Strecke */}
        <div style={{ ...band(0), paddingBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Die Strecke</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.mid }}>{vm.distHm}</span>
        </div>
        <div style={{ ...band(26) }}>
          <div style={{ ...card(), gap: 18 }}>
            {vm.hasRoute ? (
              <>
                <ElevationProfile bars={vm.elevBars} labels={vm.elevLabels} />
                <div style={{ height: 1, background: T.rule }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {vm.climbs.map((c) => (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Mountain size={18} color={T.acid} style={{ flex: 'none' }} />
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: T.ink }}>{c.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.quiet }}>{c.km}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, minWidth: 96, textAlign: 'right' }}>{c.detail}</span>
                    </div>
                  ))}
                  {vm.climbs.length === 0 && <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Keine markanten Anstiege erkannt.</span>}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <RouteIcon size={20} color={T.mid} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.mid, lineHeight: 1.4 }}>{vm.routeCta ?? 'Keine Streckendatei (GPX) für dieses Ziel hinterlegt.'}</span>
                </div>
                {vm.routeCta && (
                  <button onClick={onRehearseRoute} style={{ height: 44, padding: '0 18px', borderRadius: 100, background: T.acidDim, border: `1px solid ${T.acid}`, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: T.acid }}>Strecke ansehen</button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Was das Rennen verlangt */}
        <div style={{ ...band(0), paddingBottom: 4, flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Was das Rennen verlangt</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Dein Stand gegen das Anforderungsprofil</span>
        </div>
        <div style={{ ...band(16), paddingTop: 12 }}>
          <div style={{ ...card(), gap: 20 }}>
            {vm.gaps.map((g, i) => (
              <div key={g.label} style={{ paddingTop: i === 0 ? 0 : 20, borderTop: i === 0 ? 'none' : `1px solid ${T.rule}` }}>
                <GapRow g={g} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...band(26), flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
          <Info size={15} color={T.quiet} style={{ flex: 'none', marginTop: 2 }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet, lineHeight: 1.45 }}>{vm.infoNote}</span>
        </div>

        {/* Ziel bearbeiten */}
        <div style={{ ...band(0), paddingBottom: 4, flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.6, color: T.ink }}>Ziel bearbeiten</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.quiet }}>Änderungen am Renntag verschieben alle Phasen mit.</span>
        </div>
        <div style={{ ...band(26), paddingTop: 12 }}>
          <div style={{ ...card(), padding: '4px 20px' }}>
            {vm.editRows.map((r, i) => {
              const Ic = EDIT_ICON[r.icon]
              const content = (
                <>
                  <Ic size={18} color={T.mid} style={{ flex: 'none' }} />
                  <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: T.ink }}>{r.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: r.value === DASH ? T.quiet : T.ink }}>{r.value}</span>
                  {r.editable && <ChevronRight size={16} color={T.mid} />}
                </>
              )
              const rowStyle: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', padding: '16px 0', borderTop: i === 0 ? 'none' : `1px solid ${T.rule}`, width: '100%' }
              return r.editable
                ? <button key={r.id} onClick={() => setEditing(true)} style={{ ...rowStyle, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, textAlign: 'left' }}>{content}</button>
                : <div key={r.id} style={rowStyle}>{content}</div>
            })}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ ...band(40), gap: 10 }}>
          <button onClick={onSwitch}
            style={{ height: 54, borderRadius: 100, background: 'transparent', border: `1px solid ${T.stroke}`, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontFamily: FONT }}>
            <Repeat size={16} color={T.ink} /><span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Anderes Ziel wählen</span>
          </button>
          <button onClick={async () => { if (removing) return; setRemoving(true); await onRemove?.(); setRemoving(false) }} disabled={removing}
            style={{ height: 44, background: 'transparent', border: 0, cursor: removing ? 'default' : 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, color: T.quiet }}>
            {removing ? 'Entferne…' : 'Ziel entfernen'}
          </button>
        </div>

        {editing && <GoalEditSheet vm={vm} onClose={() => setEditing(false)} onSave={onSave} />}
      </div>
    </div>
  )
}
