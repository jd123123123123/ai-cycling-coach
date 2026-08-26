import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { Check, PenLine, Sparkles } from 'lucide-react'
import { T, FONT, band, card, grow, Kicker } from './w3tokens'
import { IntervalBars } from './W3Sections'
import {
  W3_FEELS, W3_MINUTES, composeWorkout, composedBars,
  type W3Feel, type W3Minutes,
} from './w3composeWorkout'
import { createCustomWorkout, estimateDuration, estimateTss, scheduleCustomWorkout } from '../../api/customWorkouts'
import { WEEK_CURRENT_KEY_ROOT } from '../../hooks/useCurrentWeek'
import { COACH_BRIEF_KEY_ROOT } from '../../hooks/useCoachBrief'

/**
 * WHAT STANDS WHERE THE SESSION WOULD BE, when the rider has no plan.
 *
 * Today's week card prints a prescribed session, its bars, its watts and its
 * TSS. All of that is the PLAN talking. To a rider who has not set one, the
 * app was either inventing a session and dressing it as coaching, or printing
 * a heading over nothing — and the first is the worse of the two, because a
 * rider who is already being coached never goes and switches coaching on.
 *
 * So the slot stops answering and starts asking. Two taps — what do you feel
 * like, how long have you got — and the card composes a REAL structured
 * workout: the same `CustomBlock` model the workout editor writes, savable,
 * schedulable for today, exportable to Zwift as a .zwo. See
 * `w3composeWorkout.ts` for why these are shapes and not prescriptions.
 *
 * ADAPTIVE MEANS IT READS THE ONE NUMBER IT HAS. Readiness is already gated
 * upstream (`utils/readinessGate` withholds a stale wearable's score), so when
 * a score is present it is real, and the card says what it implies — once, in
 * a quiet line, without moving the rider's hand. It never preselects for them:
 * a card that has already chosen is a suggestion wearing a question mark, and
 * a suggestion is the thing this card exists to remove.
 *
 * ACID BUDGET: the bar strip (the app's established session-bar idiom, and the
 * reason a self-built workout looks like a planned one) and the save pill. The
 * numbers under it are ink — a second acid numeral here would put three acid
 * objects in one card.
 */

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const fmtDur = (s: number) => {
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const rem = m % 60
  return rem ? `${Math.floor(m / 60)}h ${rem}min` : `${Math.floor(m / 60)}h`
}

/** The readiness line, and the reason there is only one of them: three
 *  thresholds is a verdict, and a verdict about a session nobody prescribed is
 *  the suggestion this card replaced. */
function readinessNote(readiness: number | null): string | null {
  if (readiness == null) return null
  if (readiness < 45) return `Deine Bereitschaft steht bei ${readiness}. Das spricht für die linke Seite der Reihe.`
  if (readiness >= 80) return `Deine Bereitschaft steht bei ${readiness}. Härtes hältst du heute aus, wenn du Lust darauf hast.`
  return null
}

export default function W3TodayComposer({ readiness = null }: { readiness?: number | null }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const reduce = useReducedMotion()
  const [feel, setFeel] = useState<W3Feel | null>(null)
  const [minutes, setMinutes] = useState<W3Minutes | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const composed = useMemo(
    () => (feel && minutes ? composeWorkout(feel, minutes) : null),
    [feel, minutes],
  )
  const bars = useMemo(() => (composed ? composedBars(composed.blocks) : []), [composed])
  const note = readinessNote(readiness)

  const save = async () => {
    if (!composed || busy) return
    setBusy(true); setError(null)
    try {
      const created = await createCustomWorkout({ name: composed.name, blocks: composed.blocks })
      await scheduleCustomWorkout(created.id, todayIso())
      // The week and the coach brief both read today's planned workout, and
      // scheduling one is exactly the kind of change that makes a cached
      // "nothing planned" wrong on the screen the rider is looking at.
      void qc.invalidateQueries({ queryKey: WEEK_CURRENT_KEY_ROOT })
      void qc.invalidateQueries({ queryKey: COACH_BRIEF_KEY_ROOT })
      setSaved(composed.name)
    } catch {
      setError('Konnte nicht gespeichert werden. Versuch es gleich nochmal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={band(26)}>
      <div style={{ ...card(), padding: 18, gap: 14 }}>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <Kicker>Dein Tag</Kicker>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.6, lineHeight: 1.12, color: T.ink }}>
            Worauf hast du heute Lust?
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
            Zwei Tipps, und daraus wird eine echte Einheit — mit Blöcken, Zielen und Export.
          </span>
        </div>

        {/* ── the feel row ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {W3_FEELS.map((c, i) => {
            const on = feel === c.key
            return (
              <motion.button
                key={c.key} type="button" aria-pressed={on}
                onClick={() => { setFeel(c.key); setSaved(null) }}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={grow(0.04 + i * 0.05)}
                style={{
                  padding: '9px 13px', borderRadius: 100, border: 0, cursor: 'pointer', fontFamily: FONT,
                  fontSize: 12.5, fontWeight: 700,
                  background: on ? T.heroChip : T.d1,
                  color: on ? T.ink : T.mid,
                }}>
                {c.label}
              </motion.button>
            )
          })}
        </div>

        {/* The chosen shape, said in structure rather than in benefit — it is
            the one line that stops "Berge" from being a mood word. */}
        {feel && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.quiet }}>
            {W3_FEELS.find((f) => f.key === feel)?.sub}
          </span>
        )}

        {/* ── the minutes row ── */}
        <div style={{ display: 'flex', gap: 7 }}>
          {W3_MINUTES.map((m) => {
            const on = minutes === m
            return (
              <button
                key={m} type="button" aria-pressed={on}
                onClick={() => { setMinutes(m); setSaved(null) }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 14, border: 0, cursor: 'pointer', fontFamily: FONT,
                  fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  background: on ? T.heroChip : T.d1,
                  color: on ? T.ink : T.mid,
                }}>
                {m} min
              </button>
            )
          })}
        </div>

        {note && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Sparkles size={13} color={T.mid} style={{ flex: 'none', marginTop: 2 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>{note}</span>
          </div>
        )}

        {/* ── the composed workout ── */}
        {composed ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <IntervalBars blocks={bars} ftpTag="% FTP" h={88} />

            <div style={{ display: 'flex', gap: 18 }}>
              {[
                { l: 'DAUER', v: fmtDur(estimateDuration(composed.blocks)) },
                { l: 'TSS', v: String(Math.round(estimateTss(composed.blocks))) },
                { l: 'BLÖCKE', v: String(composed.blocks.length) },
              ].map((s) => (
                <div key={s.l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>{s.l}</span>
                  <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.4, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{s.v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button" onClick={save} disabled={busy}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 100, border: 0,
                  background: saved ? T.acidDim : T.acid, color: saved ? T.acid : T.acidTop,
                  fontFamily: FONT, fontSize: 13.5, fontWeight: 700,
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                }}>
                {saved && <Check size={15} />}
                {busy ? '…' : saved ? 'Für heute gesetzt' : 'Für heute übernehmen'}
              </button>
              {/* The editor is the same screen the app has always had for this —
                  block-by-block, with the .zwo download on the saved workout.
                  The composition rides along as a seed so the rider edits what
                  they just built instead of starting from an empty canvas. */}
              <button
                type="button"
                onClick={() => navigate('/workouts/builder', { state: { seed: { name: composed.name, blocks: composed.blocks } } })}
                aria-label="Im Workout-Editor öffnen"
                style={{
                  flex: 'none', width: 48, borderRadius: 100, border: 0, background: T.surface2,
                  display: 'grid', placeItems: 'center', cursor: 'pointer',
                }}>
                <PenLine size={16} color={T.ink} />
              </button>
            </div>

            <span style={{ fontSize: 10.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
              {saved
                ? 'Liegt in deinen Workouts — im Editor kannst du sie ändern und als .zwo für Zwift laden.'
                : 'Ziele in % deiner FTP. Im Editor änderst du jeden Block und lädst die Einheit als .zwo für Zwift.'}
            </span>

            {error && <span style={{ fontSize: 11.5, fontWeight: 600, color: T.bad }}>{error}</span>}
          </div>
        ) : (
          // Not an empty state — an unfinished sentence. It names the tap that
          // is missing rather than apologising for the space.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
            {/* The strip's own outline at its own height, so the card does not
                jump when the second tap lands and the bars arrive. */}
            <div aria-hidden style={{ height: 88, borderRadius: 8, background: T.d1 }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: T.quiet }}>
              {feel == null && minutes == null
                ? 'Wähl eine Art und eine Dauer — dann steht die Einheit hier.'
                : feel == null ? 'Fehlt noch: worauf du Lust hast.' : 'Fehlt noch: wie lange du Zeit hast.'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
