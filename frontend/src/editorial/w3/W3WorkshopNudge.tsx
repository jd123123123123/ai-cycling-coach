import { useNavigate } from 'react-router-dom'
import { Asterisk, ChevronRight, Wrench } from 'lucide-react'
import { useWorkshop } from '../../hooks/useWorkshop'
import { T, FONT, band } from './w3tokens'
import type { WorkshopComponent } from '../../api/workshop'

/**
 * W3 · TODAY — the one line that says a job on the bike has come round.
 *
 * WHY THIS EXISTS ON TODAY AT ALL. The workshop knows precisely when a chain is
 * worn, and it knew it inside a tab nobody opens between rides. A maintenance
 * model is only worth its arithmetic if it reaches the rider on the morning it
 * matters, so the one surface everybody opens carries the one sentence.
 *
 * AND WHY IT IS ONE LINE. Everything about the tone here is load-bearing, and it
 * is the same argument that shapes `bike_wear` itself. This is not an alert. A
 * component past its interval has not failed, nothing is broken, no ride is at
 * risk, and there is nothing to fix before setting off. What has actually
 * happened is that a pile of RideCoin is sitting in the workshop and has stopped
 * growing. So this card reads as an INVITATION carrying a number — never a
 * warning, never red, never a badge, never a count of things wrong with your
 * bicycle. A rider who feels scolded by their training app on a Tuesday morning
 * stops opening it on Wednesday.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TRUE TO SAY, which is most days —
 * the same rule `W3RecoveryNudge` follows. A permanent maintenance strip
 * becomes furniture within a week and then it is invisible on the day it is
 * finally right.
 *
 * Real data: GET /garage/workshop (`services/workshop.read`). Own fetch, so
 * Today's view-model does not grow a dependency for one optional line.
 */

const nf = (n: number) => n.toLocaleString('de-DE')

/** Due AND overdue, in one bucket and one tone.
 *
 *  Not a severity ladder on purpose: "überfällig" only means the bonus stopped
 *  growing, and giving it a louder colour would turn a saved-up reward into a
 *  telling-off. */
const isDue = (c: WorkshopComponent) => c.status === 'due' || c.status === 'overdue'

export default function W3WorkshopNudge() {
  const nav = useNavigate()
  const { data: workshop } = useWorkshop()
  if (!workshop) return null

  const due = workshop.components.filter(isDue)
  // The question is the fallback, and only ever the fallback. Reminders can
  // only be true once the clocks start from the truth, so a rider with nothing
  // due but an unanswered part is the one person for whom the question is the
  // most useful thing this card could say.
  const question = due.length === 0 ? workshop.open_question : null
  if (due.length === 0 && !question) return null

  // The single richest one leads. Sorting by what it PAYS rather than by how
  // far past its interval it is: the rider is being invited, and the size of
  // the invitation is the number that belongs in the sentence.
  const lead = [...due].sort((a, b) => b.bonus_rc - a.bonus_rc)[0]
  const waiting = due.reduce((sum, c) => sum + c.bonus_rc, 0)
  const others = due.length - 1

  return (
    <div style={band(26)}>
      <button
        onClick={() => nav('/e/w3-workshop')}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: 16,
          borderRadius: 20, background: T.surface, border: 0, cursor: 'pointer',
          fontFamily: FONT, textAlign: 'left', width: '100%',
        }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flex: 'none',
          background: T.acidDim, display: 'grid', placeItems: 'center',
        }}>
          <Wrench size={18} color={T.acid} />
        </div>

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: T.quiet }}>
            WERKSTATT
          </span>
          <span style={{
            fontSize: 15, fontWeight: 700, color: T.ink,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {lead
              ? others > 0
                ? `${lead.name_de} und ${others} weitere sind dran`
                : `${lead.name_de} ist dran`
              : `Kurze Frage zu deinem Rad`}
          </span>
          <span style={{
            fontSize: 11.5, fontWeight: 600, color: T.quiet,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {lead
              ? `${lead.action_de} — dauert fünf Minuten`
              : `Damit die Erinnerungen für dein Rad stimmen`}
          </span>
        </div>

        {/* The number, because the number is the reason to tap. Absent when
            there is nothing banked — a zero here would read as a scoreboard. */}
        {waiting > 0 && (
          <span style={{
            flex: 'none', display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 15, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums',
          }}>
            <Asterisk size={13} color={T.lilac} />{nf(waiting)}
          </span>
        )}
        <ChevronRight size={18} color={T.mid} style={{ flex: 'none' }} />
      </button>
    </div>
  )
}
