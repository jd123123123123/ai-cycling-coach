import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Asterisk, Check, Trophy, Wrench, Zap } from 'lucide-react'
import { T, FONT, EASE, DASH } from './w3tokens'
import type { ServiceResult, Workshop, WorkshopComponent } from '../../api/workshop'

/**
 * W3 · GARAGE — the workshop. Where the bike economy is actually played.
 *
 * THE SCREEN HAS ONE JOB: make the rider want to press a button that pays them.
 * Everything on it is arranged around the unharvested Service Bonus, which is
 * the headline number and the reason to open the tab at all.
 *
 * WHAT THIS SCREEN MUST NEVER DO, and the reason the copy is written the way it
 * is. There is no penalty here, no lockout, no scold and no red. A component
 * past its interval is not failing — it is holding a bigger payout. "overdue"
 * renders in the SAME warm accent as "due", one step quieter, because the only
 * thing that has actually happened is that the pile stopped growing.
 *
 * The watts line is the one place a downside is named, and it is named as a
 * measured fact rather than a game penalty: a dirty chain really does cost
 * about 3-5 W. A cyclist respects that; an invented debuff insults them.
 *
 * Pure function of `vm`. `W3WorkshopPage` owns the fetch and the mutation.
 */

const nf = (n: number) => n.toLocaleString('de-DE')
const km = (n: number) => `${Math.round(n).toLocaleString('de-DE')} km`

/** Status → how loud. Never red: nothing here is an error.
 *  `fresh` is the acid, because a fresh drivetrain is EARNING the bonus.
 *  `due` and `overdue` are warm — an invitation to collect, not a warning. */
const TONE: Record<WorkshopComponent['status'], string> = {
  fresh: T.acid,
  due: T.warn,
  overdue: T.mid,
}
const STATUS_DE: Record<WorkshopComponent['status'], string> = {
  fresh: 'FRISCH',
  due: 'FÄLLIG',
  overdue: 'ÜBERFÄLLIG',
}

function Meter({ progress, tone, reduce }: { progress: number; tone: string; reduce: boolean | null }) {
  return (
    <div style={{ height: 6, borderRadius: 100, background: T.heroOff, overflow: 'hidden' }}>
      <motion.div
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${Math.min(100, progress * 100)}%` }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ height: '100%', borderRadius: 100, background: tone }} />
    </div>
  )
}

function ComponentRow({ c, busy, onService }: {
  c: WorkshopComponent
  busy: boolean
  onService: () => void
}) {
  const reduce = useReducedMotion()
  const tone = TONE[c.status]
  // Nothing to collect yet — the button is still offered (servicing early is a
  // trade the rider may make) but it does not shout.
  const worth = c.bonus_rc > 0

  return (
    <div style={{
      background: T.heroDock, borderRadius: 20, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{c.name_de}</span>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.1, color: tone }}>
          {STATUS_DE[c.status]}
        </span>
        <span style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4,
          fontSize: 17, fontWeight: 700, color: worth ? T.ink : T.heroOff,
          fontVariantNumeric: 'tabular-nums',
        }}>
          <Asterisk size={14} color={worth ? T.lilac : T.heroOff} />
          {nf(c.bonus_rc)}
        </span>
      </div>

      <Meter progress={c.progress} tone={tone} reduce={reduce} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* One line, never two. Measured at 390 px: a four-digit interval
            ("1.180 km / 2.500 km") plus the lifetime figure wrapped, which
            made that one row taller than every other and broke the rhythm of
            the stack. The meta shrinks and ellipses; the button never moves. */}
        <span style={{
          minWidth: 0, flex: 1, display: 'flex', gap: 5, alignItems: 'baseline',
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}>
          <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 600, color: T.heroMid, fontVariantNumeric: 'tabular-nums' }}>
            {km(c.km_since)} / {km(c.interval_km)}
          </span>
          {/* The lifetime number. It survives every service and it is the thing
              riders actually brag about, so it sits on the row permanently —
              but it is the half that gives way when space runs out. */}
          <span style={{
            minWidth: 0, fontSize: 10.5, fontWeight: 600, color: T.quiet,
            fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            · {km(c.km_total)} gesamt
          </span>
        </span>
        <button
          onClick={onService}
          disabled={busy}
          style={{
            flex: 'none', height: 34, padding: '0 16px',
            borderRadius: 100, border: 0, cursor: busy ? 'default' : 'pointer',
            background: worth ? T.acid : T.heroChip,
            color: worth ? T.heroInk : T.mid,
            fontFamily: FONT, fontSize: 12, fontWeight: 700, letterSpacing: 0.3,
            opacity: busy ? 0.6 : 1,
          }}>
          {c.action_de}
        </button>
      </div>

      {/* Stated only when true, and stated as what it is: the pile is intact,
          it has simply stopped growing. Never phrased as a loss. */}
      {c.accrual_stopped && (
        <span style={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.4, color: T.quiet }}>
          Der Bonus ist gesichert — er wächst ab hier nur nicht weiter.
        </span>
      )}
    </div>
  )
}

export interface W3WorkshopProps {
  workshop: Workshop | null
  loading: boolean
  /** The component currently being serviced, or null. */
  busyId: string | null
  /** The last service, for the celebration. Cleared by the page on dismiss. */
  lastResult: ServiceResult | null
  onService: (componentId: string) => void
  onDismissResult: () => void
}

export default function W3Workshop({
  workshop, loading, busyId, lastResult, onService, onDismissResult,
}: W3WorkshopProps) {
  const reduce = useReducedMotion()
  const [seen, setSeen] = useState(false)

  if (loading || !workshop) {
    return (
      <div style={{ padding: '0 20px 26px', fontFamily: FONT }}>
        <div style={{ background: T.heroDock, borderRadius: 24, height: 120 }} />
      </div>
    )
  }

  const total = workshop.total_bonus_rc

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: '0 20px 26px', fontFamily: FONT, background: T.heroBg,
    }}>

      {/* ── the headline: what is waiting to be collected ── */}
      <div style={{
        background: T.heroDock, borderRadius: 28, padding: 20,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={13} color={T.acid} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.3, color: T.acid }}>
            WERKSTATT
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <Asterisk size={26} color={T.lilac} style={{ marginBottom: 6 }} />
          <motion.span
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{
              fontFamily: 'Archivo, "Inter Tight", sans-serif', fontSize: 44,
              fontWeight: 700, lineHeight: 0.9, color: total > 0 ? T.ink : T.heroOff,
              fontVariantNumeric: 'tabular-nums',
            }}>{nf(total)}</motion.span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.heroMid, paddingBottom: 6 }}>
            wartet auf dich
          </span>
        </div>

        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.5, color: T.mid }}>
          Jeder Kilometer legt Bonus auf deine Teile. Warten kostet nichts —
          der Bonus bleibt liegen, bis du ihn abholst.
        </span>

        {/* The earn bonus: a thing you have, or a thing you can go and get.
            Never phrased as something you are losing. */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px',
          borderRadius: 14, background: workshop.drivetrain_fresh ? T.acidDim : T.heroChip,
        }}>
          <Zap size={15} color={workshop.drivetrain_fresh ? T.acid : T.heroMid} />
          <span style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.4, color: workshop.drivetrain_fresh ? T.acid : T.mid, minWidth: 0 }}>
            {workshop.drivetrain_fresh
              ? '+12 % auf jede Fahrt — dein Antrieb ist frisch.'
              : 'Kette reinigen schaltet +12 % auf jede Fahrt frei.'}
          </span>
        </div>

        {/* Measured, not invented. Only rendered when there is a real figure. */}
        {workshop.drivetrain_watts != null && (
          <span style={{ fontSize: 11, fontWeight: 500, lineHeight: 1.45, color: T.quiet }}>
            Deine Kette kostet dich gerade rund {workshop.drivetrain_watts} Watt.
            Das ist echte Reibung, kein Spielabzug.
          </span>
        )}
      </div>

      {/* ── the record: what replaces a streak ── */}
      {workshop.chain_record_km > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
          borderRadius: 20, background: T.heroDock,
        }}>
          <Trophy size={15} color={T.acid} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.mid, minWidth: 0 }}>
            Längste Kette: <span style={{ color: T.ink, fontWeight: 700 }}>{km(workshop.chain_record_km)}</span>
          </span>
        </div>
      )}

      {/* ── the components ── */}
      {workshop.components.map((c) => (
        <ComponentRow
          key={c.id} c={c}
          busy={busyId === c.id}
          onService={() => { setSeen(false); onService(c.id) }} />
      ))}

      {/* ── the payday ── */}
      {lastResult && !seen && (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => { setSeen(true); onDismissResult() }}
          style={{
            position: 'fixed', left: 16, right: 16, bottom: 'calc(104px + env(safe-area-inset-bottom))',
            maxWidth: 358, margin: '0 auto', zIndex: 60, cursor: 'pointer',
            background: T.acid, borderRadius: 20, padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
          <Check size={18} color={T.heroInk} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: T.heroInk }}>
              {lastResult.name_de} gewartet · +{nf(lastResult.paid_rc)}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#00000099' }}>
              {lastResult.new_record
                ? `Rekord! ${km(lastResult.record_km)} auf einem Satz.`
                : `${km(lastResult.km_serviced)} abgerechnet.`}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

/** The em dash the rest of W3 uses, re-exported so a caller rendering an empty
 *  workshop shows the same absence marker as every other surface. */
export { DASH }
