import { useMemo, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, Flag, Gauge, Timer } from 'lucide-react'
import { T, FONT, DASH } from './w3tokens'
import { S, lux, TNUM } from './w3surfaces'
import W3StatusBar from './W3StatusBar'
import W3TopBar from './W3TopBar'
import './w3.css'

/**
 * W3 · SETTING A GOAL — one question at a time.
 *
 * WHAT WAS WRONG WITH DOING IT ON THE GOAL PAGE. `/e/w3-goal` is a dossier: the
 * event, its elevation profile, its three climbs, five gap rows against the
 * demand profile, and an "Ziel bearbeiten" list. Three problems, and they are
 * structural rather than cosmetic:
 *
 *  · NOT MUTUALLY EXCLUSIVE. Distance and elevation appear in the header, in
 *    "Die Strecke", and again in "Ziel bearbeiten" — the same two facts in
 *    three places, which is this app's documented restatement bug.
 *  · "ZIEL BEARBEITEN" DID NOT EDIT. Five rows, of which two had chevrons; the
 *    other three were read-only values under a heading that said otherwise.
 *  · NOT COLLECTIVELY EXHAUSTIVE. A rider whose goal is a threshold, or simply
 *    riding more, had no way to say so — the only expressible goal was an event.
 *
 * So reading a goal and setting one are different jobs and this is the second
 * of them. The dossier stays where it is; this is the fastest path to an answer.
 *
 * THE TOP-LEVEL SPLIT IS THE APP'S OWN. Event / threshold / hours is exactly
 * the taxonomy `W3PlanEmptyView` already offers as its three ways in — this
 * gives that taxonomy a flow instead of three buttons that all landed on the
 * same screen. Mutually exclusive (a plan is periodised backwards from ONE of
 * them) and collectively exhaustive (there is no fourth reason to follow a
 * cycling plan).
 *
 * EVERY ANSWER PERSISTS. Checked before the form was drawn, because a form
 * whose inputs are discarded is the exact bug this codebase keeps producing:
 * the event branch writes through `/plan/change/apply`
 * (`goal_changed`/`goal_new`/`target_event_date`/`target_priority`), the hours
 * branch through the same call (`weekly_hours`, `days_available`), and the
 * threshold branch through `PATCH /athletes/me` (`goals.target_ftp`). No step
 * asks for something the server cannot keep.
 */

export type GoalKind = 'event' | 'ftp' | 'hours'
export type EventType = 'race' | 'fondo' | 'audax'
export type Priority = 'A' | 'B' | 'C'

export interface GoalDraft {
  kind: GoalKind | null
  eventType: EventType | null
  eventName: string
  dateISO: string | null
  priority: Priority | null
  targetFtp: number | null
  weeklyHours: number | null
  /** Mon..Sun */
  days: boolean[]
}

export interface W3GoalSetterVm {
  /** The rider's current threshold, so the FTP step has a floor to move from. */
  currentFtp: number | null
  /** Their current weekly hours, so the hours step opens where they already are. */
  currentHours: number | null
  /** Pre-fills the first step when the caller already knows the intent. */
  initialKind?: GoalKind | null
}

export interface W3GoalSetterActions {
  onCancel: () => void
  onSave: (draft: GoalDraft) => Promise<boolean>
  /** ONBOARDING ONLY. Mid-signup a rider may genuinely not have a race yet, and
   *  a required goal question there would either trap them or collect a
   *  fabricated date. Absent everywhere else: a rider who opened this screen
   *  deliberately came to answer it. */
  onSkip?: () => void
  skipLabel?: string
}

const KINDS: { kind: GoalKind; icon: typeof Flag; label: string; sub: string }[] = [
  { kind: 'event', icon: Flag, label: 'Ein Event', sub: 'Ein Datum, auf das alles zuläuft.' },
  { kind: 'ftp', icon: Gauge, label: 'Deine Schwelle', sub: 'Eine Zahl, auf die alles einzahlt.' },
  { kind: 'hours', icon: Timer, label: 'Mehr fahren', sub: 'Der Plan passt sich deiner Woche an.' },
]

const EVENT_TYPES: { id: EventType; label: string; sub: string }[] = [
  { id: 'race', label: 'Rennen', sub: 'Startnummer, Ergebnisliste.' },
  { id: 'fondo', label: 'Gran Fondo', sub: 'Lang, hart, kein Ergebnis.' },
  { id: 'audax', label: 'Audax', sub: 'Distanz gegen die Uhr.' },
]

const PRIORITIES: { id: Priority; label: string; sub: string }[] = [
  { id: 'A', label: 'A · Hauptziel', sub: 'Der Plan richtet sich danach aus.' },
  { id: 'B', label: 'B · Wichtig', sub: 'Ein kurzer Taper, sonst weiter im Block.' },
  { id: 'C', label: 'C · Mitnehmen', sub: 'Wird aus dem Training heraus gefahren.' },
]

const WD = ['M', 'D', 'M', 'D', 'F', 'S', 'S']
const WD_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

const de = (n: number) => n.toLocaleString('de-DE')

function fmtDate(iso: string | null): string {
  if (!iso) return DASH
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
}

/** A tappable answer. One per line, full width — a question answered with a
 *  thumb, not a target hunt. */
function Choice({ label, sub, icon: Icon, picked, onPick }: {
  label: string; sub?: string; icon?: typeof Flag; picked: boolean; onPick: () => void
}) {
  return (
    <button type="button" onClick={onPick} aria-pressed={picked}
      style={{
        width: '100%', minHeight: 64, display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 20, cursor: 'pointer', textAlign: 'left',
        background: picked ? T.acidDim : T.surface,
        border: `1px solid ${picked ? T.acid : T.stroke}`,
        fontFamily: FONT,
      }}>
      {Icon && (
        <span style={{
          width: 40, height: 40, flex: 'none', borderRadius: 13,
          background: picked ? T.acid : T.surface2, display: 'grid', placeItems: 'center',
        }}>
          <Icon size={18} color={picked ? T.bg : T.mid} />
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{label}</span>
        {sub && <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet, lineHeight: 1.35 }}>{sub}</span>}
      </span>
      {picked && <Check size={18} color={T.acid} style={{ flex: 'none' }} />}
    </button>
  )
}

/** A number the rider nudges rather than types. Typing a wattage on a phone is
 *  a keyboard, a numeric mode and a dismiss; this is two taps. */
function Stepper({ value, unit, step, min, max, onChange, note }: {
  value: number; unit: string; step: number; min: number; max: number
  onChange: (v: number) => void; note?: string
}) {
  const btn = {
    width: 56, height: 56, flex: 'none', borderRadius: 100, border: `1px solid ${T.stroke}`,
    background: T.surface, color: T.ink, cursor: 'pointer', fontFamily: FONT,
    fontSize: 24, fontWeight: 400, display: 'grid', placeItems: 'center',
  } as const
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, width: '100%', justifyContent: 'center' }}>
        <button type="button" aria-label="weniger" style={btn}
          onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}>−</button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 132, justifyContent: 'center' }}>
          <span style={{ ...TNUM, fontSize: 44, fontWeight: 600, letterSpacing: -1.6, color: T.acid, lineHeight: 1 }}>
            {Number.isInteger(value) ? de(value) : value.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.quiet }}>{unit}</span>
        </div>
        <button type="button" aria-label="mehr" style={btn}
          onClick={() => onChange(Math.min(max, Math.round((value + step) * 10) / 10))}>+</button>
      </div>
      {note && <span style={{ fontSize: 11.5, fontWeight: 500, color: T.quiet }}>{note}</span>}
    </div>
  )
}

export default function W3GoalSetter({ vm, onCancel, onSave, onSkip, skipLabel }: {
  vm: W3GoalSetterVm
} & W3GoalSetterActions) {
  const reduce = useReducedMotion()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [d, setD] = useState<GoalDraft>({
    kind: vm.initialKind ?? null,
    eventType: null,
    eventName: '',
    dateISO: null,
    priority: null,
    targetFtp: vm.currentFtp != null ? vm.currentFtp + 10 : 250,
    weeklyHours: vm.currentHours ?? 8,
    days: [false, true, false, true, false, true, true],
  })
  const set = (p: Partial<GoalDraft>) => setD((prev) => ({ ...prev, ...p }))

  // The questions this branch asks, in order. Declared rather than nested in
  // conditionals so the progress rail can count them and every branch is the
  // same shape to read.
  const steps = useMemo(() => {
    const first = { id: 'kind', q: 'Worauf trainierst du?', hint: 'Ein Plan läuft auf genau eine Sache zu.' }
    if (d.kind === 'event') return [first,
      { id: 'type', q: 'Was für ein Event?', hint: 'Bestimmt, wie die letzten Wochen aussehen.' },
      { id: 'date', q: 'Wann ist es?', hint: 'Der Plan wird von diesem Tag rückwärts gebaut.' },
      { id: 'prio', q: 'Wie wichtig ist es?', hint: 'Entscheidet, wie viel der Plan dafür opfert.' },
    ]
    if (d.kind === 'ftp') return [first,
      { id: 'ftp', q: 'Welche Schwelle willst du?', hint: 'Dein aktueller Wert steht darunter.' },
      { id: 'date', q: 'Bis wann?', hint: 'Ohne Datum ist es ein Wunsch, kein Plan.' },
    ]
    if (d.kind === 'hours') return [first,
      { id: 'hours', q: 'Wie viel Zeit hast du?', hint: 'Stunden pro Woche, ehrlich geschätzt.' },
      { id: 'days', q: 'An welchen Tagen?', hint: 'Der Plan legt die harten Einheiten dorthin.' },
    ]
    return [first]
  }, [d.kind])

  // HOW LONG THIS IS depends on the branch, and the branch is the first
  // answer — so until it is given, the form does not know its own length and
  // must not claim one. It used to render "1/1" and a "Ziel setzen" button on
  // the opening screen, which promised a one-question form and then produced
  // four. Unknown is drawn as unknown.
  const known = d.kind != null
  const last = known && step >= steps.length - 1
  const cur = steps[Math.min(step, steps.length - 1)]

  const canAdvance = (() => {
    switch (cur.id) {
      case 'kind': return d.kind != null
      case 'type': return d.eventType != null
      case 'date': return !!d.dateISO
      case 'prio': return d.priority != null
      case 'ftp': return (d.targetFtp ?? 0) > 0
      case 'hours': return (d.weeklyHours ?? 0) > 0
      case 'days': return d.days.some(Boolean)
      default: return false
    }
  })()

  const save = async () => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const ok = await onSave(d)
      if (!ok) setErr('Das Ziel konnte nicht gespeichert werden. Nochmal versuchen.')
    } catch {
      setErr('Das Ziel konnte nicht gespeichert werden. Nochmal versuchen.')
    } finally {
      setBusy(false)
    }
  }

  const back = () => (step === 0 ? onCancel() : setStep((s) => s - 1))

  // ── WHOSE HEADER THIS IS ────────────────────────────────────────────────
  // The rail used to draw its own back button and nothing else, so the setter
  // was one of the screens with no route to the profile or the settings at
  // all, and its back button sat at its own position. `W3TopBar` is the
  // header the rest of W3 wears, and the back it takes is this one — the same
  // step-or-cancel, not a second affordance beside it.
  //
  // NOT MID-SIGNUP, THOUGH. `onSkip` is passed by exactly one caller, the
  // onboarding step (see `W3GoalSetterActions`), and the bar carries the
  // avatar and the "everything" menu — a door out of a flow the rider has not
  // finished, into routes that are guarded on that very fact and would bounce
  // them straight back. In onboarding the rail keeps its own back button and
  // the neighbouring steps' chrome; everywhere else the bar is the header.
  const inOnboarding = !!onSkip

  const todayISO = new Date().toISOString().slice(0, 10)

  return (
    <div className="w3-root">
      <div className="w3-frame" style={{
        fontFamily: FONT, background: T.bg, minHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <W3StatusBar />

        {/* Short on purpose: the question below is the headline, at 28px, and
            a bar that whispered it again would say it twice. */}
        {!inOnboarding && <W3TopBar title="Ziel" onBack={back} />}

        {/* ── the rail: how many questions, and which one ──
            A form that does not say how long it is reads as endless, and this
            one is three questions at most. Set down from the bar rather than
            tucked under it: without the back button beside it the rail runs
            the full width, and pressed against the header an acid line that
            wide stops reading as progress and starts reading as a border. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: inOnboarding ? '6px 20px 14px' : '14px 20px 14px' }}>
          {inOnboarding && (
            <button type="button" onClick={back} aria-label="Zurück"
              style={{ width: 44, height: 44, flex: 'none', borderRadius: 100, background: T.surface, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <ArrowLeft size={18} color={T.ink} />
            </button>
          )}
          <div style={{ flex: 1, display: 'flex', gap: 4 }}>
            {(known ? steps : [steps[0]]).map((s, i) => (
              <span key={s.id} style={{
                flex: 1, height: 4, borderRadius: 100,
                background: i <= step ? T.acid : T.heroOff,
              }} />
            ))}
          </div>
          {known && (
            <span style={{ ...TNUM, flex: 'none', fontSize: 11, fontWeight: 600, color: T.quiet }}>
              {Math.min(step + 1, steps.length)}/{steps.length}
            </span>
          )}
          {onSkip && !known && (
            <button type="button" onClick={onSkip}
              style={{ flex: 'none', minHeight: 44, padding: '0 4px', background: 'transparent', border: 0, cursor: 'pointer', fontFamily: FONT, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>
              {skipLabel ?? 'SPÄTER'}
            </button>
          )}
        </div>

        {/* ── the question ── */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.9, color: T.ink, lineHeight: 1.1 }}>
            {cur.q}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 500, color: T.quiet, lineHeight: 1.4 }}>{cur.hint}</span>
        </div>

        {/* ── the answers ── */}
        <div style={{ flex: 1, padding: '22px 20px 0', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <AnimatePresence mode="wait">
            <motion.div key={cur.id}
              initial={reduce ? false : { opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: -12 }}
              transition={{ duration: 0.22 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {cur.id === 'kind' && KINDS.map((k) => (
                <Choice key={k.kind} label={k.label} sub={k.sub} icon={k.icon}
                  picked={d.kind === k.kind}
                  onPick={() => { set({ kind: k.kind }); setStep(1) }} />
              ))}

              {cur.id === 'type' && EVENT_TYPES.map((t) => (
                <Choice key={t.id} label={t.label} sub={t.sub}
                  picked={d.eventType === t.id}
                  onPick={() => { set({ eventType: t.id }); setStep((s) => s + 1) }} />
              ))}

              {cur.id === 'prio' && PRIORITIES.map((p) => (
                <Choice key={p.id} label={p.label} sub={p.sub}
                  picked={d.priority === p.id}
                  onPick={() => set({ priority: p.id })} />
              ))}

              {cur.id === 'date' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input
                    type="date" min={todayISO}
                    value={d.dateISO ?? ''}
                    onChange={(e) => set({ dateISO: e.target.value || null })}
                    style={{
                      width: '100%', height: 60, borderRadius: 18, padding: '0 16px',
                      background: T.surface, border: `1px solid ${T.stroke}`, color: T.ink,
                      fontFamily: FONT, fontSize: 17, fontWeight: 600, outline: 'none',
                    }} />
                  {d.dateISO && (
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: T.quiet }}>
                      {fmtDate(d.dateISO)} · in {Math.max(0, Math.round((new Date(d.dateISO + 'T00:00:00').getTime() - Date.now()) / 86400000))} Tagen
                    </span>
                  )}
                </div>
              )}

              {cur.id === 'ftp' && (
                <div style={{ ...lux(22), padding: S.xl, gap: S.lg }}>
                  <Stepper value={d.targetFtp ?? 250} unit="W" step={5} min={80} max={600}
                    onChange={(v) => set({ targetFtp: v })}
                    note={vm.currentFtp != null
                      ? `Heute ${de(vm.currentFtp)} W — das sind ${(d.targetFtp ?? 0) - vm.currentFtp >= 0 ? '+' : ''}${de((d.targetFtp ?? 0) - vm.currentFtp)} W.`
                      : 'Noch keine Schwellenmessung — der Wert ist dein Ziel, nicht dein Stand.'} />
                </div>
              )}

              {cur.id === 'hours' && (
                <div style={{ ...lux(22), padding: S.xl, gap: S.lg }}>
                  <Stepper value={d.weeklyHours ?? 8} unit="Std./Woche" step={0.5} min={1} max={30}
                    onChange={(v) => set({ weeklyHours: v })}
                    note={vm.currentHours != null ? `Bisher ${vm.currentHours.toLocaleString('de-DE')} Std.` : undefined} />
                </div>
              )}

              {cur.id === 'days' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {WD.map((w, i) => {
                      const on = d.days[i]
                      return (
                        <button key={i} type="button"
                          aria-label={WD_FULL[i]} aria-pressed={on}
                          onClick={() => set({ days: d.days.map((v, j) => (j === i ? !v : v)) })}
                          style={{
                            flex: 1, height: 56, borderRadius: 16, cursor: 'pointer', fontFamily: FONT,
                            background: on ? T.acid : T.surface,
                            border: `1px solid ${on ? T.acid : T.stroke}`,
                            color: on ? T.bg : T.mid, fontSize: 14, fontWeight: 600,
                          }}>{w}</button>
                      )
                    })}
                  </div>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: T.quiet }}>
                    {d.days.filter(Boolean).length} Tage gewählt.
                  </span>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── the summary, only once there is something true to summarise ── */}
        {last && canAdvance && (
          <div style={{ padding: '18px 20px 0' }}>
            <div style={{ ...lux(20), padding: S.lg, gap: 6 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: T.heroMid }}>DEIN ZIEL</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.4 }}>
                {d.kind === 'event' && `${EVENT_TYPES.find((t) => t.id === d.eventType)?.label} am ${fmtDate(d.dateISO)}, Priorität ${d.priority}.`}
                {d.kind === 'ftp' && `${de(d.targetFtp ?? 0)} W bis ${fmtDate(d.dateISO)}.`}
                {d.kind === 'hours' && `${(d.weeklyHours ?? 0).toLocaleString('de-DE')} Std. pro Woche an ${d.days.filter(Boolean).length} Tagen.`}
              </span>
            </div>
          </div>
        )}

        {err && (
          <span role="alert" style={{ padding: '12px 20px 0', fontSize: 12, fontWeight: 600, color: T.bad }}>{err}</span>
        )}

        {/* ── one action, and it only appears when it can do something ── */}
        <div style={{ padding: `18px 20px calc(24px + env(safe-area-inset-bottom))` }}>
          <button type="button"
            onClick={() => (last ? void save() : setStep((s) => s + 1))}
            disabled={!canAdvance || busy}
            style={{
              width: '100%', height: 56, borderRadius: 100, border: 0,
              background: canAdvance ? T.acid : T.surface2,
              color: canAdvance ? T.bg : T.quiet,
              cursor: canAdvance && !busy ? 'pointer' : 'default',
              opacity: busy ? 0.6 : 1,
              fontFamily: FONT, fontSize: 16, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {busy ? 'Speichern…' : last ? 'Ziel setzen' : 'Weiter'}
            {!busy && <ArrowRight size={18} color={canAdvance ? T.bg : T.quiet} />}
          </button>
        </div>
      </div>
    </div>
  )
}
