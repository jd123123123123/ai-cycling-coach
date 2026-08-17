import { useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  Wind, TrendingUp, Route, Mountain, Zap, CalendarCheck,
  Wrench, Upload, BarChart3, Check, FileText,
} from 'lucide-react'
import { T, FONT, EASE } from './w3tokens'
import W3StatusBar from './W3StatusBar'
import { W3OnboardTopBar, W3OnboardDots, W3OnboardCta, W3OnboardHeadline } from './W3OnboardKit'
import './w3.css'

/**
 * W3 · Onboarding — Training plan. The rider chooses HOW they want to train:
 *  (build)    let the coach build a plan → pick 1–3 focus areas
 *  (own)      bring their own plan file (.zwo/.ics/.pdf/image…)
 *  (insights) no plan, just the app's analysis of their rides
 *
 * Pure presentational — all state + persistence live in W3OnboardPlanPage. The
 * three modes are mutually-exclusive top-level cards; picking "build" reveals
 * the goal chips inline. (Everything the View renders is driven by props; the
 * only local state is the display-only filename echoed back from the picker.)
 */

export type W3PlanMode = 'build' | 'own' | 'insights'
export type W3GoalKey = 'vo2max' | 'ftp' | 'endurance' | 'climbing' | 'sprint' | 'consistency'

export const W3_GOALS: Array<{ key: W3GoalKey; label: string; icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }> }> = [
  { key: 'vo2max', label: 'VO₂max', icon: Wind },
  { key: 'ftp', label: 'FTP / Schwelle', icon: TrendingUp },
  { key: 'endurance', label: 'Ausdauer', icon: Route },
  { key: 'climbing', label: 'Berge', icon: Mountain },
  { key: 'sprint', label: 'Sprint / Kraft', icon: Zap },
  { key: 'consistency', label: 'Konstanz', icon: CalendarCheck },
]

export const MAX_GOALS = 3

const MODES: Array<{ key: W3PlanMode; icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>; title: string; sub: string }> = [
  { key: 'build', icon: Wrench, title: 'Bau mir einen Plan', sub: 'Der Coach baut deine Woche um 1–3 Schwerpunkte.' },
  { key: 'own', icon: Upload, title: 'Ich habe meinen Plan', sub: 'Bring eine Trainingsdatei mit — .zwo, .ics, PDF oder Foto.' },
  { key: 'insights', icon: BarChart3, title: 'Kein Plan — nur Analyse', sub: 'Ohne Planung; wir lesen nur die Fahrten, die du machst.' },
]

/** True when the current selection is enough to advance. */
export function planReady(mode: W3PlanMode | null, goals: W3GoalKey[]): boolean {
  if (!mode) return false
  if (mode === 'build') return goals.length >= 1 && goals.length <= MAX_GOALS
  return true
}

export interface W3OnboardPlanProps {
  mode: W3PlanMode | null
  goals: W3GoalKey[]
  onModeChange: (mode: W3PlanMode) => void
  onToggleGoal: (goal: W3GoalKey) => void
  onFileChange: (file: File | null) => void
  onNext: () => void
  onSkip: () => void
}

export default function W3OnboardPlanView({
  mode, goals, onModeChange, onToggleGoal, onFileChange, onNext, onSkip,
}: W3OnboardPlanProps) {
  const reduce = useReducedMotion()
  const fileInput = useRef<HTMLInputElement>(null)
  // Display-only: the chosen file's name, echoed under the "own" card. The
  // authoritative capture is the onFileChange call up to the Page.
  const [fileName, setFileName] = useState<string | null>(null)

  const ready = planReady(mode, goals)
  const atGoalCap = goals.length >= MAX_GOALS

  const reveal = (children: React.ReactNode, key: string) => (
    <motion.div
      key={key}
      initial={reduce ? false : { opacity: 0, y: -6, height: 0 }}
      animate={{ opacity: 1, y: 0, height: 'auto' }}
      transition={{ duration: 0.32, ease: EASE }}
      style={{ overflow: 'hidden' }}
    >
      {children}
    </motion.div>
  )

  return (
    <div className="w3-root">
      <div style={{ fontFamily: FONT, display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: T.bg }}>
        <W3StatusBar />
        <W3OnboardTopBar onSkip={onSkip} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: '18px 20px 28px', flex: 1 }}>
          <W3OnboardHeadline
            kicker="DEIN PLAN"
            line1="Wie willst du"
            line2="trainieren?"
            body="Wähl die Art, wie du fährst. Du kannst das jederzeit ändern — nichts hier ist festgezurrt."
          />

          {/* Mutually-exclusive mode cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {MODES.map((m, i) => {
              const selected = mode === m.key
              const Icon = m.icon
              return (
                <motion.div
                  key={m.key}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.05 + i * 0.06 }}
                  style={{ display: 'flex', flexDirection: 'column' }}
                >
                  <button
                    onClick={() => onModeChange(m.key)}
                    aria-pressed={selected}
                    style={{
                      textAlign: 'left', cursor: 'pointer', width: '100%',
                      borderRadius: 20, padding: '15px 15px',
                      background: selected ? T.surface2 : T.surface,
                      border: `1.5px solid ${selected ? T.acid : T.rule}`,
                      display: 'flex', alignItems: 'center', gap: 13, fontFamily: FONT,
                      transition: 'border-color 160ms, background 160ms',
                    }}
                  >
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: selected ? T.acid : T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}>
                      <Icon size={21} color={selected ? T.bg : T.acid} strokeWidth={2.2} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: -0.2, color: T.ink }}>{m.title}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.35, color: T.mid }}>{m.sub}</span>
                    </div>
                    {/* Radio */}
                    <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', border: `2px solid ${selected ? T.acid : T.d3}`, display: 'grid', placeItems: 'center' }}>
                      {selected && <span style={{ width: 11, height: 11, borderRadius: '50%', background: T.acid }} />}
                    </span>
                  </button>

                  {/* ── Reveal: focus chips under "build" ── */}
                  {selected && m.key === 'build' && reveal(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 2px 2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4, color: T.quiet }}>WAS BESSER WERDEN SOLL</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, color: goals.length ? T.acid : T.quiet }}>{goals.length}/{MAX_GOALS}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                        {W3_GOALS.map((g) => {
                          const on = goals.includes(g.key)
                          const locked = !on && atGoalCap
                          const GIcon = g.icon
                          return (
                            <button
                              key={g.key}
                              onClick={() => onToggleGoal(g.key)}
                              disabled={locked}
                              aria-pressed={on}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '9px 13px', borderRadius: 100, fontFamily: FONT,
                                fontSize: 12.5, fontWeight: 800, letterSpacing: 0.2,
                                cursor: locked ? 'default' : 'pointer',
                                background: on ? T.acid : T.surface,
                                color: on ? T.bg : (locked ? T.quiet : T.ink),
                                border: `1.5px solid ${on ? T.acid : T.stroke}`,
                                opacity: locked ? 0.5 : 1,
                                transition: 'background 140ms, border-color 140ms',
                              }}
                            >
                              <GIcon size={14} color={on ? T.bg : T.acid} strokeWidth={2.4} />
                              {g.label}
                            </button>
                          )
                        })}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
                        Wähl 1–3. Der Coach baut deine Woche darum und passt an, sobald sich deine Zahlen bewegen.
                      </span>
                    </div>,
                    'build-panel',
                  )}

                  {/* ── Reveal: upload under "own" ── */}
                  {selected && m.key === 'own' && reveal(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 2px 2px' }}>
                      {/* No `capture` — must offer the photo library / files, not force the camera. */}
                      <input
                        ref={fileInput}
                        type="file"
                        accept=".zwo,.ics,.pdf,.fit,.tcx,.gpx,.csv,.mrc,.erg,image/*,application/pdf"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const f = e.target.files?.[0] ?? null
                          setFileName(f ? f.name : null)
                          onFileChange(f)
                        }}
                      />
                      <button
                        onClick={() => fileInput.current?.click()}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                          padding: '14px 15px', borderRadius: 16, cursor: 'pointer', fontFamily: FONT,
                          background: T.surface,
                          border: `1.5px dashed ${fileName ? T.acid : T.d3}`,
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ width: 38, height: 38, borderRadius: 11, background: T.acidDim, display: 'grid', placeItems: 'center', flex: 'none' }}>
                          {fileName ? <Check size={19} color={T.acid} strokeWidth={2.6} /> : <FileText size={19} color={T.acid} strokeWidth={2.2} />}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {fileName ?? 'Plan hochladen'}
                          </span>
                          <span style={{ fontSize: 11.5, fontWeight: 500, color: T.mid }}>
                            {fileName ? 'Für eine andere Datei tippen' : '.zwo · .ics · PDF · Bild — aus Dateien oder Fotos'}
                          </span>
                        </div>
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
                        Wir behalten deine Datei und lesen die Einheiten daraus — deine Struktur, unser Tracking.
                      </span>
                    </div>,
                    'own-panel',
                  )}

                  {/* ── Reveal: insights note ── */}
                  {selected && m.key === 'insights' && reveal(
                    <div style={{ padding: '14px 2px 2px' }}>
                      <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
                        Kein Zeitplan, keine Zielvorgaben. Jede Fahrt landet trotzdem in W3 und bekommt die volle Analyse — Form, Fitness, Ermüdung.
                      </span>
                    </div>,
                    'insights-panel',
                  )}
                </motion.div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 'auto', paddingTop: 8 }}>
            <W3OnboardDots step={2} total={5} />
            <div style={{ opacity: ready ? 1 : 0.4, pointerEvents: ready ? 'auto' : 'none', transition: 'opacity 160ms' }}>
              <W3OnboardCta label="WEITER" onClick={onNext} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
